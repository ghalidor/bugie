using Bugie.Api.Theming;
using Bugie.Trips.Infrastructure.Time;
using System.Data;
using System.Text;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Npgsql;
using Microsoft.IdentityModel.Tokens;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.Options;
using Bugie.Trips.Application.Validators;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Bugie.Trips.Infrastructure.BackgroundServices;
using Bugie.Trips.Infrastructure.Repositories;
using Bugie.Trips.Infrastructure.Services;
using Bugie.Trips.Infrastructure.External;
using Bugie.Trips.Api.Realtime;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IDbConnection>(_ =>
    new NpgsqlConnection(BugieTimeSetup.UtcConnectionString(builder.Configuration.GetConnectionString("Default"))));
// Fechas: base en UTC, JSON en hora de Peru (ver BugieTime)
BugieTimeSetup.ConfigureDapper();

// Configuración tipada (binding con appsettings.json)
builder.Services.Configure<TripFilteringOptions>(
    builder.Configuration.GetSection("TripFiltering"));
// Misma seccion que usa ProposalExpirationService: la lista del conductor
// calcula con ella cuando vence una propuesta aceptada por el pasajero.
builder.Services.Configure<ProposalExpirationWindowOptions>(
    builder.Configuration.GetSection("ProposalExpiration"));

// ?? Repositorios ?????????????????????????????????????????????????????????
builder.Services.AddScoped<ITripRepository, TripRepository>();
builder.Services.AddScoped<Bugie.Trips.Domain.Interfaces.ITripPhotoRepository, Bugie.Trips.Infrastructure.Repositories.TripPhotoRepository>();
builder.Services.Configure<Bugie.Trips.Infrastructure.Storage.LocalStorageOptions>(
    builder.Configuration.GetSection("LocalStorage"));
builder.Services.AddScoped<Bugie.Trips.Domain.External.IFileStorageService,
    Bugie.Trips.Infrastructure.Storage.LocalFileStorageService>();
builder.Services.AddScoped<ISosRepository, SosRepository>();
builder.Services.AddScoped<ISosAdminQueries, SosAdminQueries>();
builder.Services.AddScoped<ITripRouteRepository, TripRouteRepository>();
builder.Services.AddScoped<ITripProposalRepository, TripProposalRepository>();
builder.Services.AddScoped<IIncidentRepository, IncidentRepository>();  // ? NUEVO
builder.Services.AddScoped<ITripRatingRepository, TripRatingRepository>();
builder.Services.AddScoped<IFavoriteDriverRepository, FavoriteDriverRepository>();
builder.Services.AddScoped<IFavoriteAddressRepository, FavoriteAddressRepository>();
builder.Services.AddScoped<IAdminReportsRepository, AdminReportsRepository>();
builder.Services.AddScoped<IPassengerAcceptanceCancellationRepository,
    PassengerAcceptanceCancellationRepository>();
builder.Services.AddScoped<IOutboxRepository, OutboxRepository>();
builder.Services.AddScoped<IDriverDayStatsRepository, DriverDayStatsRepository>();
// Desvío de ruta: rutas planificadas + alertas (ver RouteDeviationService).
builder.Services.AddScoped<IRouteDeviationRepository, RouteDeviationRepository>();
builder.Services.AddScoped<Bugie.Trips.Application.Services.RouteDeviationService>();

builder.Services.AddHttpClient<IRoutingService, GraphHopperRoutingService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(3);
    client.DefaultRequestHeaders.Add("User-Agent", "BugieApp/1.0");
});

builder.Services.AddHttpContextAccessor();

builder.Services.AddHttpClient<IAuthClient, AuthClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:AuthApi"]!);
    c.Timeout = TimeSpan.FromSeconds(5);
});

builder.Services.AddHttpClient<IDriversClient, DriversClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:DriversApi"]!);
    c.Timeout = TimeSpan.FromSeconds(5);
});


builder.Services.AddHttpClient<IRewardsClient, RewardsClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:RewardsApi"]
                            ?? "http://localhost:5006/");
    c.Timeout = TimeSpan.FromSeconds(10);
});

// Cliente HTTP a Landing — sólo para leer settings administrables
// (por ej. max_radius_km que el admin configura en el panel).
// Si falta la URL en appsettings, usamos el default conocido del proyecto
// (localhost:5005). Sin esto, Trips.Api crasheaba con ArgumentNullException
// al construir la URI cuando appsettings no tenía Services:LandingApi.
var landingApiUrl = builder.Configuration["Services:LandingApi"]
    ?? "http://localhost:5005";
builder.Services.AddHttpClient<ILandingClient, LandingClient>(c =>
{
    c.BaseAddress = new Uri(landingApiUrl);
    c.Timeout = TimeSpan.FromSeconds(5);
});

// Sender de Firebase Cloud Messaging. Actualmente es un STUB que loguea
// pero NO manda push reales (falta el service-account.json). El módulo
// que consume IFcmSender (CreateTripHandler) funciona igual; los logs
// aparecen pero no llega notificación al celular.
// Bandeja de notificaciones del usuario: FcmSender guarda cada push visible.
// Singleton (abre su propia conexion por llamada) porque FcmSender es singleton.
builder.Services.AddSingleton<IUserNotificationRepository, UserNotificationRepository>();
// Historial de avisos del panel admin (admin:event y deviation:new) y permisos del admin (Auth).
builder.Services.AddSingleton<IAdminNotificationRepository, AdminNotificationRepository>();
builder.Services.AddScoped<Bugie.Trips.Api.Realtime.AdminPermissionsClient>();
builder.Services.AddSingleton<IFcmSender, FcmSender>();
builder.Services.AddSingleton<ITripNotificationService, TripNotificationService>();

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(CreateTripCommand).Assembly));

builder.Services.AddValidatorsFromAssemblyContaining<CreateTripValidator>();

var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtKey))
        };
        // SignalR no puede mandar el JWT como header durante el handshake
        // del WebSocket (limitación del browser). El cliente lo manda como
        // query string ?access_token=... Aquí se lo leemos al recibir la
        // request hacia el hub.
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];
                var path = ctx.HttpContext.Request.Path;
                if(!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                    ctx.Token = accessToken;
                return Task.CompletedTask;
            }
        };
        // Sesion: claim "sst" vs sello vigente (cierre de sesiones). Ver Security/SessionState.cs.
        Bugie.Security.SessionValidation.Configure(o);
    });

builder.Services.AddAuthorization();
// URLs firmadas de /uploads: el filtro firma las URLs sensibles de toda respuesta JSON.
Bugie.Api.Security.SignedUploads.Configure(builder.Configuration);
// Filtro [RequirePermission]: permisos del admin pedidos a Auth (cache corta).
Bugie.Security.AdminPermissions.AddBugieAdminPermissionsFromAuth(builder.Services);
// Estado de sesion pedido a Auth (cache corta) para validar el JWT.
Bugie.Security.SessionValidation.AddBugieSessionStateFromAuth(builder.Services);
builder.Services.AddControllers(o => o.Filters.Add<Bugie.Api.Security.SignUploadUrlsFilter>())
    .AddJsonOptions(o => { o.JsonSerializerOptions.Converters.Add(new PeruDateTimeJsonConverter()); o.AllowInputFormatterExceptionMessages = false; }); // JSON mal formado: error generico, sin nombres internos de clases
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddBugieSwagger("Trips",
    "Viajes: solicitud, propuestas de conductores, seguimiento, rutas, historial, favoritos, calificaciones, envíos, incidencias y SOS. Panel admin: viajes, desvíos de ruta, reportes y notificaciones. Endpoints internos: notificaciones y eventos del panel.");

builder.Services.Configure<OutboxDispatcherOptions>(
    builder.Configuration.GetSection("Outbox"));
builder.Services.AddHostedService<OutboxDispatcherService>();

// ?? SignalR para monitor admin en tiempo real ?????????????????????????????
// El hub /hubs/monitor empuja eventos al panel admin (alerta SOS instantánea
// en lugar de esperar al poll de 10s).
builder.Services.AddSignalR()
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new PeruDateTimeJsonConverter()));
builder.Services.AddScoped<IAdminNotifier, SignalRAdminNotifier>();
// Canal en tiempo real para PASAJEROS y CONDUCTORES (hub /hubs/trips, ver TripsHub).
// Singleton: lo usa FcmSender (singleton) para espejar cada push como "UserNotification".
builder.Services.AddSingleton<ITripRealtimeNotifier, SignalRTripRealtimeNotifier>();

// ?? Expirador de propuestas accepted_by_passenger ?????????????????????????
// Vencimientos de la negociación (cada 30 s): ofertas aceptadas por el pasajero
// que el conductor no confirmó a tiempo y viajes inmediatos que nadie tomó.
// Los plazos se configuran en Admin › Configuración (ver NegotiationRules).
builder.Services.Configure<ProposalExpirationOptions>(
    builder.Configuration.GetSection("ProposalExpiration"));
builder.Services.AddHostedService<ProposalExpirationService>();

// Recordatorios push de viajes/envios programados (30 y 10 min antes).
builder.Services.AddHostedService<ScheduledTripReminderService>();

// CORS: SignalR usa WebSocket o LongPolling. Para que el navegador pueda
// pasar el JWT como query string del handshake, hay que permitir AllowCredentials
// y NO usar AllowAnyOrigin (sino el browser rechaza). Usamos WithOrigins.
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

// ── Fix de esquema (idempotente) ──────────────────────────────────────────
// El CHECK de trips.TripProposals.Status debe permitir los estados del flujo
// de propuestas/aceptaciones, incluido 'driver_accepted' (aceptar-directo).
// Como no hay runner de migraciones, lo aseguramos aquí en cada arranque.
try
{
    using var _fixConn = new NpgsqlConnection(
        BugieTimeSetup.UtcConnectionString(app.Configuration.GetConnectionString("Default")));
    _fixConn.Open();
    using var _fixCmd = _fixConn.CreateCommand();
    _fixCmd.CommandText = @"
        DO $$
        DECLARE cname text;
        BEGIN
          SELECT con.conname INTO cname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE nsp.nspname = 'trips' AND rel.relname = 'tripproposals'
            AND con.contype = 'c'
            AND pg_get_constraintdef(con.oid) ILIKE '%status%';
          IF cname IS NOT NULL THEN
            EXECUTE format('ALTER TABLE trips.TripProposals DROP CONSTRAINT %I', cname);
          END IF;
          ALTER TABLE trips.TripProposals
            ADD CONSTRAINT CK_TripProposals_Status
            CHECK (Status IN ('pending','accepted','rejected','superseded',
                              'accepted_by_passenger','driver_accepted','cancelled'));
        END $$;";
    _fixCmd.ExecuteNonQuery();
    Console.WriteLine("[startup] CHECK de TripProposals.Status verificado (incluye driver_accepted).");
}
catch (Exception _fixEx)
{
    Console.WriteLine($"[startup] No se pudo actualizar el CHECK de TripProposals.Status: {_fixEx.Message}");
}
// ──────────────────────────────────────────────────────────────────────────

// Errores sin detalles internos (ver Middleware/ExceptionMiddleware.cs).
app.UseMiddleware<Bugie.Trips.Api.Middleware.ExceptionMiddleware>();
app.UseCors();
if(app.Environment.IsDevelopment()) { app.UseBugieSwagger("Trips"); }
// Fotos de envios: se sirven desde la carpeta configurada (LocalStorage),
// la misma raiz que usan Auth y Drivers.
var storagePath = builder.Configuration["LocalStorage:StoragePath"] ?? "wwwroot/uploads";
var publicUrl   = builder.Configuration["LocalStorage:PublicUrlPath"] ?? "/uploads";
var absoluteStoragePath = Path.IsPathRooted(storagePath)
    ? storagePath
    : Path.Combine(AppContext.BaseDirectory, storagePath);
Directory.CreateDirectory(absoluteStoragePath);
// Archivos sensibles (documentos, selfies, fotos de envios) solo con firma valida.
Bugie.Api.Security.SignedUploads.UseSignedUploads(app);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(absoluteStoragePath),
    RequestPath  = publicUrl,
    OnPrepareResponse = Bugie.Api.Security.SignedUploads.PrepareResponse,
});
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<MonitorHub>("/hubs/monitor");
// Pasajeros y conductores: reemplaza el polling mientras la pantalla esta abierta.
app.MapHub<TripsHub>("/hubs/trips");
app.Run();
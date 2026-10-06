using Bugie.Api.Theming;
using Bugie.Drivers.Infrastructure.Time;
using System.Data;
using System.Text;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Api.Controllers;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Infrastructure.BackgroundServices;
using Bugie.Drivers.Infrastructure.Email;
using Bugie.Drivers.Infrastructure.External;
using Bugie.Drivers.Infrastructure.Repositories;
using Bugie.Drivers.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Npgsql;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Base de datos ────────────────────────────────────────────────────────
builder.Services.AddScoped<IDbConnection>(_ =>
    new NpgsqlConnection(BugieTimeSetup.UtcConnectionString(builder.Configuration.GetConnectionString("Default"))));
// Fechas: base en UTC, JSON en hora de Peru (ver BugieTime)
BugieTimeSetup.ConfigureDapper();

// URLs de la web y del admin para los enlaces de los correos (en produccion: el dominio)
Bugie.Drivers.Application.Email.DriverEmailTemplates.AppUrl =
    (builder.Configuration["App:WebBaseUrl"] ?? "http://localhost:5173").TrimEnd('/');
Bugie.Drivers.Application.Email.DriverEmailTemplates.AdminUrl =
    (builder.Configuration["App:AdminBaseUrl"] ?? "http://localhost:5174").TrimEnd('/');

// ── Repositorios ─────────────────────────────────────────────────────────
builder.Services.AddScoped<IDriverRepository, DriverRepository>();
builder.Services.AddScoped<IVehicleRepository, VehicleRepository>();
builder.Services.AddScoped<IVehiclePhotoRepository, VehiclePhotoRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped<IDocumentNotificationRepository, DocumentNotificationRepository>();
builder.Services.AddScoped<ILocationHistoryRepository, LocationHistoryRepository>();
builder.Services.AddScoped<IDriverPresenceCheckInRepository, DriverPresenceCheckInRepository>();
builder.Services.AddScoped<IApprovalAuditRepository, ApprovalAuditRepository>();
builder.Services.AddScoped<IDriverReviewRequestRepository, DriverReviewRequestRepository>();
builder.Services.AddScoped<ITripPathRepository, TripPathRepository>();
builder.Services.AddScoped<IGpsArchiveRepository, GpsArchiveRepository>();
builder.Services.AddScoped<Bugie.Drivers.Application.Services.TripPathReadService>();

// ── Historial GPS (particiones diarias, recorridos consolidados, Parquet) ──
// El job (GpsArchive:RunAtHourUtc, 08:00 UTC = 3 am Peru) crea particiones,
// consolida viajes terminados en drivers.trippaths y archiva en Parquet las
// particiones de hace GpsArchive:KeepDays dias (borra solo con archivo verificado).
// El scheduler consolida un viaje unos segundos despues de que Trips avisa que termino.
builder.Services.Configure<Bugie.Drivers.Application.Services.GpsArchiveOptions>(
    builder.Configuration.GetSection("GpsArchive"));
builder.Services.AddSingleton<Bugie.Drivers.Application.Services.GpsArchiveState>();
builder.Services.AddSingleton<IGpsArchiveStore, Bugie.Drivers.Infrastructure.GpsArchive.ParquetGpsArchiveStore>();
builder.Services.AddSingleton<ITripPathConsolidationScheduler, Bugie.Drivers.Infrastructure.GpsArchive.TripPathConsolidationScheduler>();
builder.Services.AddScoped<Bugie.Drivers.Application.Services.GpsArchiveService>();
builder.Services.AddHostedService<GpsArchiveJobService>();

// ── Aprobación por excepción: plazo de 3 días para completar documentos ──
// El servicio tiene las reglas; el job revisa cada hora y desactiva a los vencidos.
builder.Services.AddScoped<Bugie.Drivers.Application.Services.DriverDocumentsDeadlineService>();
builder.Services.AddHostedService<DocumentsDeadlineService>();

// ── Rechazo / suspensión / reactivación del conductor ────────────────────
// El servicio tiene las reglas; el job (cada 30 min) termina las suspensiones con fecha.
builder.Services.AddScoped<Bugie.Drivers.Application.Services.DriverAccountService>();
builder.Services.AddHostedService<DriverSuspensionEndService>();

// ── GPS de conductores ───────────────────────────────────────────────────
// La peticion (PUT /location y /location/batch) solo valida, filtra puntos
// repetidos, deja la posicion en memoria y encola. El LocationWriterService
// escribe en la base por lotes y avisa a Trips en segundo plano.
// Ajustes en appsettings "Location" (todos con default en codigo).
builder.Services.Configure<Bugie.Drivers.Application.Services.Location.LocationOptions>(
    builder.Configuration.GetSection(Bugie.Drivers.Application.Services.Location.LocationOptions.Section));
builder.Services.AddSingleton<Bugie.Drivers.Application.Services.Location.DriverLiveLocations>();
builder.Services.AddSingleton<Bugie.Drivers.Application.Services.Location.LocationQueue>();
builder.Services.AddScoped<Bugie.Drivers.Application.Services.Location.LocationIngestService>();
builder.Services.AddHostedService<LocationWriterService>();

// ── Almacenamiento ───────────────────────────────────────────────────────
builder.Services.Configure<LocalStorageOptions>(
    builder.Configuration.GetSection("LocalStorage"));
builder.Services.AddSingleton<IDriveStorageService, LocalStorageService>();

// ── Email (SMTP) ─────────────────────────────────────────────────────────
builder.Services.Configure<SmtpOptions>(
    builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();

// ── Job de notificación de caducidad [ACTIVO] ───────────────────────────
// Una vez al día (DocumentExpiration:NotificationHour, hora Perú) avisa por
// correo y push los documentos por vencer. Si un documento vence HOY
// (DaysUntilExpiry == 0), pasa al conductor a ExpiredDocs + IsOnline=FALSE.
// En pruebas: los documentos deben tener fechas de vencimiento futuras.
builder.Services.Configure<DocumentExpirationOptions>(
    builder.Configuration.GetSection("DocumentExpiration"));
builder.Services.AddHostedService<DocumentExpirationNotifierService>();

// ── Heartbeat-timeout de conductores [DESACTIVADO] ───────────────────────
// Este servicio marcaba offline automáticamente a los conductores que
// dejaban de reportar GPS por unos minutos. Causaba que durante pruebas
// (recompilar Flutter, hot restart) el conductor quedara desconectado solo
// y tuviera que reconectarse manual cada vez.
//
// Decisión actual: el conductor se desconecta SOLO cuando presiona el botón
// "Desconectarme". Sin excepciones.
//
// Si en el futuro hace falta volverlo activo (para producción), descomentar:
//   builder.Services.Configure<DriverHeartbeatTimeoutOptions>(
//       builder.Configuration.GetSection("DriverHeartbeatTimeout"));
//   builder.Services.AddHostedService<DriverHeartbeatTimeoutService>();

// ── Vista de docs próximos a vencer ──────────────────────────────────────
builder.Services.Configure<ExpirationViewOptions>(
    builder.Configuration.GetSection("ExpirationView"));

// ── Subida de archivos ───────────────────────────────────────────────────
builder.Services.Configure<FormOptions>(opts =>
{
    opts.MultipartBodyLengthLimit = 10 * 1024 * 1024;
});

// ── Clientes HTTP ────────────────────────────────────────────────────────
builder.Services.AddHttpContextAccessor();

builder.Services.AddHttpClient<IAuthClient, AuthClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:AuthApi"]!);
    c.Timeout = TimeSpan.FromSeconds(5);
});

builder.Services.AddHttpClient<ITripsClient, TripsClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:TripsApi"]!);
    c.Timeout = TimeSpan.FromSeconds(5);
});

// Cliente para empujar broadcasts SignalR a Trips.Api (notificaciones GPS
// del conductor al admin via el MonitorHub que vive en Trips).
// Timeout corto: el broadcast no es crítico, no queremos bloquear UpdateLocation.
builder.Services.AddHttpClient<ITripsNotifyClient, TripsNotifyClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:TripsApi"]!);
    c.Timeout = TimeSpan.FromSeconds(3);
});

// Avisos al Centro de avisos del panel admin (vía Trips, fire-and-forget).
builder.Services.AddHttpClient<IAdminEventsPublisher, AdminEventsPublisher>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:TripsApi"] ?? "http://localhost:5002");
    c.Timeout = TimeSpan.FromSeconds(3);
});

// ── Cliente HTTP a Landing.Api (para leer default_city) ─────────────────
builder.Services.Configure<LandingSettingsClientOptions>(
    builder.Configuration.GetSection("LandingSettingsClient"));
builder.Services.AddHttpClient<ILandingSettingsClient, LandingSettingsClient>(c =>
{
    var baseUrl = builder.Configuration["LandingSettingsClient:BaseUrl"] ?? "http://localhost:5005";
    c.BaseAddress = new Uri(baseUrl);
    c.Timeout = TimeSpan.FromSeconds(5);
});

// ── MediatR ──────────────────────────────────────────────────────────────
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(RegisterDriverCommand).Assembly));

// ── JWT ──────────────────────────────────────────────────────────────────
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
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
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
builder.Services.AddBugieSwagger("Drivers",
    "Conductores: registro y perfil, documentos y vencimientos, vehículos y fotos, disponibilidad (en línea, check-in) y recorrido de viajes. Panel admin: aprobación con auditoría, notificaciones y recorridos. Endpoints internos para otras APIs.");
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// ── Archivos estáticos ───────────────────────────────────────────────────
var storagePath = builder.Configuration["LocalStorage:StoragePath"] ?? "wwwroot/uploads";
var publicUrl = builder.Configuration["LocalStorage:PublicUrlPath"] ?? "/uploads";

var absoluteStoragePath = Path.IsPathRooted(storagePath)
    ? storagePath
    : Path.Combine(AppContext.BaseDirectory, storagePath);
Directory.CreateDirectory(absoluteStoragePath);

// Archivos sensibles (documentos, selfies, fotos de envios) solo con firma valida.
Bugie.Api.Security.SignedUploads.UseSignedUploads(app);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(absoluteStoragePath),
    RequestPath = publicUrl,
    OnPrepareResponse = Bugie.Api.Security.SignedUploads.PrepareResponse,
});

// Errores sin detalles internos (ver Middleware/ExceptionMiddleware.cs).
app.UseMiddleware<Bugie.Drivers.Api.Middleware.ExceptionMiddleware>();
app.UseCors();
if(app.Environment.IsDevelopment()) { app.UseBugieSwagger("Drivers"); }
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
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
    new NpgsqlConnection(builder.Configuration.GetConnectionString("Default")));

// ── Repositorios ─────────────────────────────────────────────────────────
builder.Services.AddScoped<IDriverRepository, DriverRepository>();
builder.Services.AddScoped<IVehicleRepository, VehicleRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped<IDocumentNotificationRepository, DocumentNotificationRepository>();
builder.Services.AddScoped<ILocationHistoryRepository, LocationHistoryRepository>();
builder.Services.AddScoped<IReviewRepository, ReviewRepository>();
builder.Services.AddScoped<IDriverPresenceCheckInRepository, DriverPresenceCheckInRepository>();

// ── Almacenamiento ───────────────────────────────────────────────────────
builder.Services.Configure<LocalStorageOptions>(
    builder.Configuration.GetSection("LocalStorage"));
builder.Services.AddSingleton<IDriveStorageService, LocalStorageService>();

// ── Email (SMTP) ─────────────────────────────────────────────────────────
builder.Services.Configure<SmtpOptions>(
    builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();

// ── Job de notificación de caducidad [DESACTIVADO durante pruebas] ───────
// Este job revisa los documentos de los conductores. Si un documento vence
// HOY (DaysUntilExpiry == 0), cambia el conductor a ExpiredDocs + IsOnline=FALSE.
// Durante pruebas causaba que el conductor se desconectara solo porque sus
// documentos de prueba tenían fechas de vencimiento ya pasadas o de hoy.
//
// Para reactivar en producción, descomentar y asegurarse de que los
// documentos tengan fechas de vencimiento futuras válidas.
builder.Services.Configure<DocumentExpirationOptions>(
    builder.Configuration.GetSection("DocumentExpiration"));
// builder.Services.AddHostedService<DocumentExpirationNotifierService>();

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
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
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

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(absoluteStoragePath),
    RequestPath = publicUrl,
});

app.UseCors();
if(app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(c =>
{
    c.DocumentTitle = "Bugie API - Drivers";
    c.HeadContent = Bugie.Api.Theming.BugieSwaggerTheme.HeadContent;
    c.DefaultModelsExpandDepth(-1); // oculta la seccion Schemas/Models
}); }
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
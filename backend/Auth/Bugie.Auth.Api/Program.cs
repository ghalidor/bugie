using Bugie.Api.Theming;
using Bugie.Auth.Infrastructure.Time;
using System.Data;
using System.Text;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Npgsql;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Bugie.Auth.Application.Commands;
using Bugie.Auth.Application.Validators;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;
using Bugie.Auth.Infrastructure.Email;
using Bugie.Auth.Infrastructure.External;
using Bugie.Auth.Infrastructure.Repositories;
using Bugie.Auth.Infrastructure.Security;
using Bugie.Auth.Infrastructure.Services;
using Bugie.Auth.Infrastructure.Storage;
using Bugie.Auth.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// ── Base de datos ─────────────────────────────────────────────────────────
builder.Services.AddScoped<IDbConnection>(_ =>
    new NpgsqlConnection(BugieTimeSetup.UtcConnectionString(builder.Configuration.GetConnectionString("Default"))));
// Fechas: base en UTC, JSON en hora de Peru (ver BugieTime)
BugieTimeSetup.ConfigureDapper();

// URL de la web para los enlaces de los correos (en produccion: el dominio)
Bugie.Auth.Application.Email.EmailTemplates.AppUrl =
    (builder.Configuration["App:WebBaseUrl"] ?? "http://localhost:5173").TrimEnd('/');

// ── Repositorios ──────────────────────────────────────────────────────────
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IPasswordResetRepository, PasswordResetRepository>();
builder.Services.AddScoped<IPassengerDocumentRepository, PassengerDocumentRepository>();
builder.Services.AddScoped<IAdminRoleRepository, AdminRoleRepository>();
builder.Services.AddScoped<IUserFcmTokenRepository, UserFcmTokenRepository>();
builder.Services.AddScoped<IEmergencyContactRepository, EmergencyContactRepository>();
builder.Services.AddScoped<IUserAccountAuditRepository, UserAccountAuditRepository>();
builder.Services.AddScoped<IAccountActivityReader, AccountActivityReader>();
builder.Services.AddScoped<ITokenService, JwtTokenService>();
builder.Services.AddScoped<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
// Filtro [RequirePermission]: en Auth los permisos se leen directo de la BD.
builder.Services.AddScoped<Bugie.Security.IAdminPermissionSource, Bugie.Auth.Api.Security.LocalAdminPermissionSource>();

// ── Almacenamiento ────────────────────────────────────────────────────────
builder.Services.Configure<LocalStorageOptions>(
    builder.Configuration.GetSection("LocalStorage"));
builder.Services.AddSingleton<IFileStorageService, LocalFileStorageService>();

// ── Email (Gmail SMTP) ────────────────────────────────────────────────────
builder.Services.Configure<SmtpOptions>(
    builder.Configuration.GetSection("Smtp"));
builder.Services.AddSingleton<IEmailService, SmtpEmailService>();

// ── Cliente HTTP a Drivers (para crear perfil al registrar conductor) ────
builder.Services.Configure<DriversClientOptions>(
    builder.Configuration.GetSection("DriversClient"));
// ── Cliente HTTP a Rewards (para avisar de los referidos al registrarse) ──
// Mismo esquema de configuracion que DriversClient. El token interno sale de
// la clave InternalToken que Auth ya tiene, y debe coincidir con el de Rewards.
builder.Services.Configure<RewardsClientOptions>(opt =>
{
    opt.BaseUrl       = builder.Configuration["RewardsClient:BaseUrl"] ?? "http://localhost:5006";
    opt.InternalToken = builder.Configuration["InternalToken"] ?? string.Empty;
});
builder.Services.AddHttpClient<IRewardsClient, RewardsClient>(c =>
{
    var baseUrl = builder.Configuration["RewardsClient:BaseUrl"] ?? "http://localhost:5006";
    c.BaseAddress = new Uri(baseUrl);
    c.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddHttpClient<IDriversClient, DriversClient>(c =>
{
    var baseUrl = builder.Configuration["DriversClient:BaseUrl"] ?? "http://localhost:5003";
    c.BaseAddress = new Uri(baseUrl);
    c.Timeout = TimeSpan.FromSeconds(10);
});

// ── Cliente HTTP a Landing (para leer settings como default_city) ────────
builder.Services.Configure<LandingSettingsClientOptions>(
    builder.Configuration.GetSection("LandingSettingsClient"));
builder.Services.AddHttpClient<ILandingSettingsClient, LandingSettingsClient>(c =>
{
    var baseUrl = builder.Configuration["LandingSettingsClient:BaseUrl"] ?? "http://localhost:5005";
    c.BaseAddress = new Uri(baseUrl);
    c.Timeout = TimeSpan.FromSeconds(5);
});

// Avisos al Centro de avisos del panel admin (vía Trips, fire-and-forget).
builder.Services.AddHttpClient<IAdminEventsPublisher, AdminEventsPublisher>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:TripsApi"] ?? "http://localhost:5002");
    c.Timeout = TimeSpan.FromSeconds(3);
});

// ── Subida de archivos: límite 10 MB ──────────────────────────────────────
builder.Services.Configure<FormOptions>(opts =>
{
    opts.MultipartBodyLengthLimit = 10 * 1024 * 1024;
});

// ── MediatR (CQRS) ────────────────────────────────────────────────────────
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(LoginCommand).Assembly));

// ── FluentValidation ──────────────────────────────────────────────────────
builder.Services.AddValidatorsFromAssemblyContaining<LoginValidator>();

// ── JWT ───────────────────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
        // Sesión: claim "sst" vs sello vigente, cuenta eliminada o desactivada
        // (una consulta ligera a la BD por request autenticado). Las otras 5
        // APIs hacen lo mismo con el endpoint interno. Ver Security/SessionState.cs.
        Bugie.Security.SessionValidation.Configure(options);
    });
// Estado de sesión leído directo de la BD (sin caché).
builder.Services.AddScoped<Bugie.Security.ISessionStateSource, Bugie.Auth.Api.Security.LocalSessionStateSource>();

builder.Services.AddAuthorization();
// URLs firmadas de /uploads: el filtro firma las URLs sensibles de toda respuesta JSON.
Bugie.Api.Security.SignedUploads.Configure(builder.Configuration);
builder.Services.AddControllers(o => o.Filters.Add<Bugie.Api.Security.SignUploadUrlsFilter>())
    .AddJsonOptions(o => { o.JsonSerializerOptions.Converters.Add(new PeruDateTimeJsonConverter()); o.AllowInputFormatterExceptionMessages = false; }); // JSON mal formado: error generico, sin nombres internos de clases
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddBugieSwagger("Auth",
    "Registro e inicio de sesión (JWT), perfil del usuario, documentos de pasajeros y contacto de emergencia. Panel admin: pasajeros, roles y permisos. Endpoints internos: tokens FCM, notificaciones y contacto de emergencia.");

builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader()
     .AllowAnyMethod()));

var app = builder.Build();

// ── Servir archivos estáticos ────────────────────────────────────────────
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

app.UseMiddleware<ExceptionMiddleware>();
app.UseCors();

if(app.Environment.IsDevelopment())
{
    app.UseBugieSwagger("Auth");
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
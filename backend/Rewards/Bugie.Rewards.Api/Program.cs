using Bugie.Api.Theming;
using Bugie.Rewards.Infrastructure.Time;
using System.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Bugie.Rewards.Application.Commands;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.External;
using Bugie.Rewards.Infrastructure.External;
using Bugie.Rewards.Infrastructure.Repositories;
using Bugie.Rewards.Api.BackgroundServices;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IDbConnection>(_ =>
    new NpgsqlConnection(BugieTimeSetup.UtcConnectionString(builder.Configuration.GetConnectionString("Default"))));
// Fechas: base en UTC, JSON en hora de Peru (ver BugieTime)
BugieTimeSetup.ConfigureDapper();

builder.Services.AddScoped<IPointsProfileRepository,     PointsProfileRepository>();
builder.Services.AddScoped<IPointsTransactionRepository, PointsTransactionRepository>();
builder.Services.AddScoped<IRewardLevelRepository,       RewardLevelRepository>();
builder.Services.AddScoped<IRewardSettingsRepository,    RewardSettingsRepository>();
builder.Services.AddScoped<ICatalogRepository,           CatalogRepository>();
builder.Services.AddScoped<IRedemptionRepository,        RedemptionRepository>();
builder.Services.AddScoped<IPromotionRepository,         PromotionRepository>();
builder.Services.AddScoped<IRaffleRepository,            RaffleRepository>();
builder.Services.AddScoped<IRaffleEligibilityRepository, RaffleEligibilityRepository>();
builder.Services.AddScoped<IReferralRepository,          ReferralRepository>();
builder.Services.AddScoped<IMilestoneRepository,         MilestoneRepository>();
builder.Services.AddScoped<IAdminQueryRepository,        AdminQueryRepository>();
builder.Services.AddScoped<IUserDirectory,               UserDirectory>();
builder.Services.AddScoped<ILevelBenefitRepository,      LevelBenefitRepository>();

// Correo: mismos campos de configuración que usa Auth.
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();

// Cliente hacia Auth para obtener los tokens FCM de los usuarios.
builder.Services.AddHttpClient<IAuthTokensClient, AuthTokensClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:AuthApi"]
                            ?? "http://127.0.0.1:5001/");
    c.Timeout     = TimeSpan.FromSeconds(10);
});

// Push: Rewards ya no manda directo a Firebase. Llama al endpoint interno de
// Trips (api/internal/notify/push) que envia el push y lo guarda en la
// bandeja de notificaciones del usuario. Usa Services:TripsApi e InternalToken
// (TripsClientOptions, configurado mas abajo).
builder.Services.AddHttpClient<IFcmSender, FcmSender>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:TripsApi"] ?? "http://127.0.0.1:5002/");
    c.Timeout     = TimeSpan.FromSeconds(10);
});

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(AccrueTripPointsCommand).Assembly));

var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidateAudience         = true,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer              = builder.Configuration["Jwt:Issuer"],
            ValidAudience            = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey         = new SymmetricSecurityKey(
                System.Text.Encoding.UTF8.GetBytes(jwtKey))
        };
        // Sesion: claim "sst" vs sello vigente (cierre de sesiones). Ver Security/SessionState.cs.
        Bugie.Security.SessionValidation.Configure(o);
    });

builder.Services.AddAuthorization();
// Filtro [RequirePermission]: permisos del admin pedidos a Auth (cache corta).
Bugie.Security.AdminPermissions.AddBugieAdminPermissionsFromAuth(builder.Services);
// Estado de sesion pedido a Auth (cache corta) para validar el JWT.
Bugie.Security.SessionValidation.AddBugieSessionStateFromAuth(builder.Services);
builder.Services.AddControllers()
    .AddJsonOptions(o => { o.JsonSerializerOptions.Converters.Add(new PeruDateTimeJsonConverter()); o.AllowInputFormatterExceptionMessages = false; }); // JSON mal formado: error generico, sin nombres internos de clases
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddBugieSwagger("Rewards",
    "Programa de puntos: saldo, historial, niveles, catálogo y canjes, referidos, promociones y sorteos. Panel admin: ajustes, catálogo, canjes, promociones, sorteos y usuarios. Endpoints internos: viajes completados y calificados, referidos, cupones y códigos de pago.");
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader().AllowAnyMethod()));

builder.Services.Configure<PointsExpirationOptions>(
    builder.Configuration.GetSection("PointsExpiration"));
builder.Services.AddHostedService<PointsExpirationService>();

// Cliente a Trips, solo para el resumen diario de conductores.
builder.Services.Configure<TripsClientOptions>(opt =>
{
    opt.BaseUrl       = builder.Configuration["Services:TripsApi"] ?? "http://127.0.0.1:5002/";
    opt.InternalToken = builder.Configuration["InternalToken"] ?? string.Empty;
});
builder.Services.AddHttpClient<ITripsStatsClient, TripsStatsClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:TripsApi"] ?? "http://127.0.0.1:5002/");
    c.Timeout     = TimeSpan.FromSeconds(30);
});

builder.Services.Configure<NoCancellationsOptions>(
    builder.Configuration.GetSection("NoCancellations"));
builder.Services.AddHostedService<NoCancellationsService>();

builder.Services.Configure<RaffleMaintenanceOptions>(
    builder.Configuration.GetSection("RaffleMaintenance"));
builder.Services.AddHostedService<RaffleMaintenanceService>();

builder.Services.Configure<RedemptionExpirationOptions>(
    builder.Configuration.GetSection("RedemptionExpiration"));
builder.Services.AddHostedService<RedemptionExpirationService>();

// Aviso de inicio de mes de los beneficios de nivel del pasajero.
builder.Services.Configure<LevelBenefitsNoticeOptions>(
    builder.Configuration.GetSection("LevelBenefitsNotice"));
builder.Services.AddHostedService<LevelBenefitsNoticeService>();

var app = builder.Build();
// Errores sin detalles internos (ver Middleware/ExceptionMiddleware.cs).
app.UseMiddleware<Bugie.Rewards.Api.Middleware.ExceptionMiddleware>();
app.UseCors();
if (app.Environment.IsDevelopment())
{
    app.UseBugieSwagger("Rewards");
}
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

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
    new NpgsqlConnection(builder.Configuration.GetConnectionString("Default")));

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

// Correo: mismos campos de configuración que usa Auth.
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();

// Cliente hacia Auth para obtener los tokens FCM de los usuarios.
builder.Services.AddHttpClient<IAuthTokensClient, AuthTokensClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:AuthApi"]
                            ?? "http://localhost:5001/");
    c.Timeout     = TimeSpan.FromSeconds(10);
});

// Scoped a proposito: depende del HttpClient tipado de Auth, que es
// transient. Registrarlo como singleton lo dejaria cautivo. La init de
// Firebase es estatica, asi que no cuesta nada crearlo por scope.
builder.Services.AddScoped<IFcmSender, FcmSender>();

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
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader().AllowAnyMethod()));

builder.Services.Configure<PointsExpirationOptions>(
    builder.Configuration.GetSection("PointsExpiration"));
builder.Services.AddHostedService<PointsExpirationService>();

builder.Services.Configure<RaffleMaintenanceOptions>(
    builder.Configuration.GetSection("RaffleMaintenance"));
builder.Services.AddHostedService<RaffleMaintenanceService>();

builder.Services.Configure<RedemptionExpirationOptions>(
    builder.Configuration.GetSection("RedemptionExpiration"));
builder.Services.AddHostedService<RedemptionExpirationService>();

var app = builder.Build();
app.UseCors();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.DocumentTitle = "Bugie API - Rewards";
        c.DefaultModelsExpandDepth(-1);
    });
}
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

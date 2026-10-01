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
    new NpgsqlConnection(builder.Configuration.GetConnectionString("Default")));

// ── Repositorios ──────────────────────────────────────────────────────────
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IPassengerDocumentRepository, PassengerDocumentRepository>();
builder.Services.AddScoped<IAdminRoleRepository, AdminRoleRepository>();
builder.Services.AddScoped<IUserFcmTokenRepository, UserFcmTokenRepository>();
builder.Services.AddScoped<ITokenService, JwtTokenService>();
builder.Services.AddScoped<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddScoped<IPermissionService, PermissionService>();

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
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

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

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(absoluteStoragePath),
    RequestPath = publicUrl,
});

app.UseMiddleware<ExceptionMiddleware>();
app.UseCors();

if(app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
{
    c.DocumentTitle = "Bugie API - Auth";
    c.HeadContent = Bugie.Api.Theming.BugieSwaggerTheme.HeadContent;
    c.DefaultModelsExpandDepth(-1); // oculta la seccion Schemas/Models
});
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
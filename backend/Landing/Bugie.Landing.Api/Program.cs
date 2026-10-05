using Bugie.Api.Theming;
using Bugie.Landing.Infrastructure.Time;
using System.Data;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Npgsql;
using Microsoft.IdentityModel.Tokens;
using Bugie.Landing.Application.Queries;
using Bugie.Landing.Domain.Interfaces;
using Bugie.Landing.Infrastructure.Repositories;
using Bugie.Landing.Infrastructure.Services;
using Bugie.Landing.Infrastructure.Storage;
using Bugie.Landing.Infrastructure.External;
using Bugie.Landing.Application.Email;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IDbConnection>(_ =>
    new NpgsqlConnection(BugieTimeSetup.UtcConnectionString(builder.Configuration.GetConnectionString("Default"))));
// Fechas: base en UTC, JSON en hora de Peru (ver BugieTime)
BugieTimeSetup.ConfigureDapper();

builder.Services.AddScoped<ILandingRepository, LandingRepository>();
builder.Services.AddScoped<IContactRepository, ContactRepository>();
builder.Services.AddScoped<INewsRepository, NewsRepository>();
builder.Services.AddScoped<IFaqRepository, FaqRepository>();
builder.Services.AddScoped<ISettingsRepository, SettingsRepository>();
builder.Services.AddScoped<IEmailService, EmailService>();
// Libro de Reclamaciones + datos de la empresa
builder.Services.AddScoped<IComplaintRepository, ComplaintRepository>();
builder.Services.AddScoped<IHolidayRepository, HolidayRepository>();
builder.Services.AddSingleton<IFileStorage, LocalFileStorage>();
builder.Services.AddSingleton<IAdminEventsPublisher, AdminEventsPublisher>();
builder.Services.AddSingleton(new LandingLinks(builder.Configuration["App:WebBaseUrl"] ?? "http://localhost:5173"));

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(GetLandingPageQuery).Assembly));

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
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey))
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
builder.Services.AddBugieSwagger("Landing",
    "Contenido de la web pública: secciones, noticias, preguntas frecuentes, contacto, datos de la empresa, ajustes y libro de reclamaciones. Panel admin: gestión de ese contenido, feriados y notificaciones.");
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Archivos subidos (logo de la empresa): carpeta unica compartida, servida en /uploads.
var storagePath = builder.Configuration["LocalStorage:StoragePath"] ?? "wwwroot/uploads";
var absoluteStoragePath = Path.IsPathRooted(storagePath)
    ? storagePath
    : Path.Combine(AppContext.BaseDirectory, storagePath);
Directory.CreateDirectory(absoluteStoragePath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(absoluteStoragePath),
    RequestPath = builder.Configuration["LocalStorage:PublicUrlPath"] ?? "/uploads",
});

// Errores sin detalles internos (ver Middleware/ExceptionMiddleware.cs).
app.UseMiddleware<Bugie.Landing.Api.Middleware.ExceptionMiddleware>();
app.UseCors();
if(app.Environment.IsDevelopment()) { app.UseBugieSwagger("Landing"); }
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
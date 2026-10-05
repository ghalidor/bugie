using Bugie.Api.Theming;
using Bugie.Payments.Infrastructure.Time;
using System.Data;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Npgsql;
using Microsoft.IdentityModel.Tokens;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Domain.Interfaces;
using Bugie.Payments.Infrastructure.Repositories;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped<IDbConnection>(_ =>
    new NpgsqlConnection(BugieTimeSetup.UtcConnectionString(builder.Configuration.GetConnectionString("Default"))));
// Fechas: base en UTC, JSON en hora de Peru (ver BugieTime)
BugieTimeSetup.ConfigureDapper();

builder.Services.AddScoped<IPaymentRepository, PaymentRepository>();
// La comision se lee de landing.systemsettings, que el admin edita. No hay
// valor en appsettings a proposito: un dato de negocio vive en un solo sitio.
builder.Services.AddScoped<IPlatformFeeRepository, PlatformFeeRepository>();
builder.Services.AddScoped<IWalletRepository,  WalletRepository>();
builder.Services.AddScoped<IWithdrawalRepository, WithdrawalRepository>();
builder.Services.AddScoped<IUserNames, UserNames>();
// Lee trips.trips para validar que un pago corresponde a su viaje
builder.Services.AddScoped<ITripLookup, TripLookup>();

// Aviso al conductor cuando se le registra un pago: lo envia Rewards (push + correo)
builder.Services.AddHttpClient<Bugie.Payments.Domain.External.IPayoutNotifier,
                               Bugie.Payments.Infrastructure.External.RewardsPayoutNotifier>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:RewardsApi"] ?? "http://localhost:5006");
    c.DefaultRequestHeaders.Add("X-Internal-Token", builder.Configuration["InternalToken"] ?? "");
    c.Timeout = TimeSpan.FromSeconds(10);
});

// Cobro con codigo: consulta y cierra canjes/premios en Rewards
builder.Services.AddHttpClient<Bugie.Payments.Domain.External.IPayoutCodeClient,
                               Bugie.Payments.Infrastructure.External.RewardsPayoutCodeClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["Services:RewardsApi"] ?? "http://localhost:5006");
    c.DefaultRequestHeaders.Add("X-Internal-Token", builder.Configuration["InternalToken"] ?? "");
    c.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(CreatePaymentCommand).Assembly));

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
            IssuerSigningKey         = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtKey))
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
builder.Services.AddBugieSwagger("Payments",
    "Pagos de viajes, ganancias y billetera del conductor. Panel admin: billeteras, pagos de comisión y liquidaciones (payouts) por código.");
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
// Errores sin detalles internos (ver Middleware/ExceptionMiddleware.cs).
app.UseMiddleware<Bugie.Payments.Api.Middleware.ExceptionMiddleware>();
app.UseCors();
if (app.Environment.IsDevelopment()) { app.UseBugieSwagger("Payments"); }
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

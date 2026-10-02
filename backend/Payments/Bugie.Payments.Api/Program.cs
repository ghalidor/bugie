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

// Aviso al conductor cuando se le registra un pago: lo envia Rewards (push + correo)
builder.Services.AddHttpClient<Bugie.Payments.Domain.External.IPayoutNotifier,
                               Bugie.Payments.Infrastructure.External.RewardsPayoutNotifier>(c =>
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
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new PeruDateTimeJsonConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(opt => opt.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [])
     .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(c =>
{
    c.DocumentTitle = "Bugie API - Payments";
    c.HeadContent = Bugie.Api.Theming.BugieSwaggerTheme.HeadContent;
    c.DefaultModelsExpandDepth(-1); // oculta la seccion Schemas/Models
}); }
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

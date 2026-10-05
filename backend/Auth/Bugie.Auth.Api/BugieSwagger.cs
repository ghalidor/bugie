using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using MicroElements.Swashbuckle.FluentValidation.AspNetCore;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;
using Swashbuckle.AspNetCore.SwaggerUI;

namespace Bugie.Api.Theming;

/// <summary>
/// Configuración de Swagger común a las 6 APIs de Bugie. Este archivo es
/// IDÉNTICO en cada proyecto Api (no hay proyecto compartido); solo cambian
/// el módulo y la descripción que se pasan desde Program.cs.
///
/// Solo afecta a lo que muestra Swagger: no cambia rutas, lógica,
/// serialización ni respuestas de la API.
/// </summary>
public static class BugieSwagger
{
    private const string DocName = "v1";
    private const string BearerScheme = "Bearer";
    private const string InternalScheme = "InternalToken";
    private const string InternalHeader = "X-Internal-Token";
    private const string InternalNote = "Solo para comunicación entre APIs.";

    /// <summary>
    /// Registra SwaggerGen con: documento v1, esquemas de seguridad (JWT y
    /// token interno), comentarios XML, tags ordenados y filtros de enums y
    /// ejemplos.
    /// </summary>
    public static IServiceCollection AddBugieSwagger(this IServiceCollection services, string modulo, string descripcion)
    {
        services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc(DocName, new OpenApiInfo
            {
                Title = $"Bugie API - {modulo}",
                Version = "v1",
                Description = descripcion,
            });

            c.AddSecurityDefinition(BearerScheme, new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Name = "Authorization",
                Description = "Token JWT del usuario. Pega solo el token, sin la palabra \"Bearer\". " +
                              "En la API de Auth se coloca solo al ejecutar POST /api/auth/login.",
            });
            c.AddSecurityDefinition(InternalScheme, new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.ApiKey,
                In = ParameterLocation.Header,
                Name = InternalHeader,
                Description = $"Token interno (header {InternalHeader}). {InternalNote}",
            });

            c.TagActionsBy(api => new[] { TagFor(api) });
            c.OrderActionsBy(api => $"{TagFor(api)}|{api.RelativePath}|{api.HttpMethod}");

            c.OperationFilter<SecurityOperationFilter>();
            c.OperationFilter<ExampleOperationFilter>();
            c.SchemaFilter<EnumSchemaFilter>();
            c.SchemaFilter<ExampleSchemaFilter>();
            c.ParameterFilter<ExampleParameterFilter>();

            // Comentarios XML (/// <summary>) de Api y Application.
            foreach (var xml in Directory.GetFiles(AppContext.BaseDirectory, "Bugie.*.xml"))
                c.IncludeXmlComments(xml, includeControllerXmlComments: true);

            // Va después de IncludeXmlComments para reutilizar sus descripciones.
            c.DocumentFilter<TagsDocumentFilter>();
        });

        // Reglas de FluentValidation (obligatorio, largos, rangos, regex, email)
        // en los esquemas. Lee los IValidator<T> ya registrados en DI; si la API
        // no tiene validadores, no agrega nada. No valida ni cambia respuestas.
        services.AddFluentValidationRulesToSwagger();
        return services;
    }

    /// <summary>
    /// Publica swagger.json y la UI con el tema de Bugie. Llamar solo en
    /// Development (igual que antes).
    /// </summary>
    public static WebApplication UseBugieSwagger(this WebApplication app, string modulo)
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
        {
            c.DocumentTitle = $"Bugie API - {modulo}";
            c.SwaggerEndpoint($"{DocName}/swagger.json", $"Bugie API - {modulo} v1");
            c.HeadContent = BugieSwaggerTheme.HeadContent;
            c.DefaultModelsExpandDepth(-1); // oculta la sección Schemas/Models
            c.DocExpansion(DocExpansion.None);
            c.EnableFilter();
            c.EnableTryItOutByDefault();
            c.DisplayRequestDuration();
            c.EnableDeepLinking();
            c.EnablePersistAuthorization();
            c.ConfigObject.AdditionalItems["tagsSorter"] = "alpha";
            c.UseResponseInterceptor(LoginInterceptor);
        });
        return app;
    }

    // ── Interceptor: tras un login 200, coloca el token en Authorize ─────────
    // Sin comillas dobles ni barras invertidas: Swashbuckle lo incrusta dentro
    // de un JSON.parse('...') y esos caracteres lo romperían.
    private const string LoginInterceptor =
        "function (res) { try { " +
        "var url = (res && res.url ? res.url : '').toLowerCase(); " +
        "if (res && res.ok && url.indexOf('/api/auth/login') !== -1 && window.ui) { " +
        "var body = res.obj || (typeof res.data === 'string' ? JSON.parse(res.data) : res.data); " +
        "var token = body && (body.token || body.Token); " +
        "if (token) { window.ui.preauthorizeApiKey('Bearer', token); } " +
        "} } catch (e) { } return res; }";

    // El token interno NO se incrusta en la página de Swagger: quien lo
    // necesite lo pega a mano en Authorize (esquema InternalToken).

    // ── Clasificación de endpoints ───────────────────────────────────────────

    private static bool IsInternal(ApiDescription api)
    {
        var controller = (api.ActionDescriptor as ControllerActionDescriptor)?.ControllerName ?? string.Empty;
        var path = "/" + (api.RelativePath ?? string.Empty).ToLowerInvariant();
        return controller.Contains("Internal", StringComparison.OrdinalIgnoreCase)
            || path.Contains("/internal/") || path.EndsWith("/internal")
            || api.ParameterDescriptions.Any(p =>
                string.Equals(p.Name, InternalHeader, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsAdmin(ApiDescription api)
    {
        var controller = (api.ActionDescriptor as ControllerActionDescriptor)?.ControllerName ?? string.Empty;
        var path = "/" + (api.RelativePath ?? string.Empty).ToLowerInvariant();
        return controller.Contains("Admin", StringComparison.OrdinalIgnoreCase)
            || path.Contains("/admin/") || path.EndsWith("/admin");
    }

    /// <summary>
    /// Nombre del tag: el del controlador en palabras ("PassengerDocuments" →
    /// "Passenger Documents"), con prefijo "Interno · " o "Admin · ".
    /// </summary>
    private static string TagFor(ApiDescription api)
    {
        var controller = (api.ActionDescriptor as ControllerActionDescriptor)?.ControllerName ?? "General";
        var name = controller.Replace("Internal", string.Empty).Replace("Admin", string.Empty);
        if (string.IsNullOrWhiteSpace(name)) name = controller;
        name = SplitWords(name);

        if (IsInternal(api)) return $"Interno · {name}";
        if (IsAdmin(api)) return $"Admin · {name}";
        return name;
    }

    private static string SplitWords(string name)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            if (i > 0 && char.IsUpper(name[i]) && !char.IsUpper(name[i - 1])) sb.Append(' ');
            sb.Append(name[i]);
        }
        return sb.ToString().Trim();
    }

    private static OpenApiSecurityRequirement Requirement(string scheme) => new()
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = scheme },
        }] = Array.Empty<string>(),
    };

    // ── Filtros ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Candado solo donde corresponde: JWT en los endpoints con [Authorize]
    /// (sin [AllowAnonymous]) y token interno en los endpoints internos.
    /// </summary>
    private sealed class SecurityOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            var api = context.ApiDescription;
            operation.Responses ??= new OpenApiResponses();

            if (IsInternal(api))
            {
                // El header lo envía el esquema de Authorize, no un campo suelto.
                if (operation.Parameters is not null)
                {
                    foreach (var p in operation.Parameters
                                 .Where(p => p.In == ParameterLocation.Header &&
                                             string.Equals(p.Name, InternalHeader, StringComparison.OrdinalIgnoreCase))
                                 .ToList())
                        operation.Parameters.Remove(p);
                }

                operation.Security.Add(Requirement(InternalScheme));
                operation.Description = string.IsNullOrWhiteSpace(operation.Description)
                    ? $"**{InternalNote}** Requiere el header `{InternalHeader}`."
                    : $"**{InternalNote}** Requiere el header `{InternalHeader}`.\n\n{operation.Description}";
                operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Token interno inválido o ausente." });
                return;
            }

            var metadata = api.ActionDescriptor.EndpointMetadata;
            var authorize = metadata.OfType<IAuthorizeData>().ToList();
            var anonymous = metadata.OfType<IAllowAnonymous>().Any();
            if (authorize.Count == 0 || anonymous) return;

            operation.Security.Add(Requirement(BearerScheme));
            operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Sin token o token inválido." });

            var roles = authorize
                .Where(a => !string.IsNullOrWhiteSpace(a.Roles))
                .SelectMany(a => a.Roles!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                .Distinct()
                .ToList();
            if (roles.Count > 0)
                operation.Responses.TryAdd("403", new OpenApiResponse { Description = $"Requiere rol: {string.Join(", ", roles)}." });
        }
    }

    /// <summary>
    /// Tags ordenados alfabéticamente, solo los que se usan, con la
    /// descripción XML del controlador y la nota de los internos. Quita los
    /// esquemas de seguridad que ninguna operación usa.
    /// </summary>
    private sealed class TagsDocumentFilter : IDocumentFilter
    {
        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            var xmlDescriptions = (swaggerDoc.Tags ?? new List<OpenApiTag>())
                .GroupBy(t => t.Name)
                .ToDictionary(g => g.Key, g => g.First().Description);

            var tags = new Dictionary<string, string?>();
            foreach (var api in context.ApiDescriptions)
            {
                var tag = TagFor(api);
                if (tags.ContainsKey(tag)) continue;
                var controller = (api.ActionDescriptor as ControllerActionDescriptor)?.ControllerName ?? string.Empty;
                xmlDescriptions.TryGetValue(controller, out var description);
                if (IsInternal(api))
                    description = string.IsNullOrWhiteSpace(description) ? InternalNote : $"{InternalNote} {description}";
                tags[tag] = description;
            }

            swaggerDoc.Tags = tags
                .OrderBy(t => t.Key, StringComparer.OrdinalIgnoreCase)
                .Select(t => new OpenApiTag { Name = t.Key, Description = t.Value })
                .ToList();

            var used = swaggerDoc.Paths.Values
                .SelectMany(p => p.Operations.Values)
                .SelectMany(o => o.Security ?? new List<OpenApiSecurityRequirement>())
                .SelectMany(r => r.Keys)
                .Select(k => k.Reference?.Id)
                .ToHashSet();
            var schemes = swaggerDoc.Components?.SecuritySchemes;
            if (schemes is not null)
                foreach (var key in schemes.Keys.Where(k => !used.Contains(k)).ToList())
                    schemes.Remove(key);
        }
    }

    /// <summary>
    /// Enums: la API los serializa como número; se agrega "1 = Pending, ..."
    /// para que se entienda el valor. Si ya salen como texto, no se toca.
    /// </summary>
    private sealed class EnumSchemaFilter : ISchemaFilter
    {
        public void Apply(OpenApiSchema schema, SchemaFilterContext context)
        {
            var type = Nullable.GetUnderlyingType(context.Type) ?? context.Type;
            if (!type.IsEnum || schema.Type == "string") return;

            var values = string.Join(", ", Enum.GetValues(type).Cast<object>()
                .Select(v => $"{Convert.ToInt64(v)} = {Enum.GetName(type, v)}"));
            schema.Description = string.IsNullOrWhiteSpace(schema.Description)
                ? values
                : $"{schema.Description}\n\n{values}";
        }
    }

    /// <summary>Ejemplos realistas en las propiedades de los modelos.</summary>
    private sealed class ExampleSchemaFilter : ISchemaFilter
    {
        public void Apply(OpenApiSchema schema, SchemaFilterContext context) => ApplyExamples(schema);
    }

    /// <summary>Ejemplos realistas en cuerpos inline (por ejemplo multipart/form-data).</summary>
    private sealed class ExampleOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            if (operation.RequestBody?.Content is null) return;
            foreach (var media in operation.RequestBody.Content.Values)
                if (media.Schema is not null && media.Schema.Reference is null)
                    ApplyExamples(media.Schema);
        }
    }

    /// <summary>Ejemplos realistas en parámetros de ruta y query.</summary>
    private sealed class ExampleParameterFilter : IParameterFilter
    {
        public void Apply(OpenApiParameter parameter, ParameterFilterContext context)
        {
            if (parameter.Example is not null || parameter.Schema is null) return;
            parameter.Example = ExampleFor(parameter.Name, parameter.Schema);
        }
    }

    private static void ApplyExamples(OpenApiSchema schema)
    {
        if (schema.Properties is null) return;
        foreach (var (name, prop) in schema.Properties)
        {
            if (prop.Example is not null || prop.Reference is not null || prop.Enum?.Count > 0) continue;
            prop.Example = ExampleFor(name, prop);
        }
    }

    private static IOpenApiAny? ExampleFor(string name, OpenApiSchema s)
    {
        var n = name.ToLowerInvariant();
        var isText = s.Type == "string" && s.Format is null or "" or "email" or "password";
        var isNumber = s.Type is "number" or "integer";

        if (isText)
        {
            if (n.Contains("email") || n.Contains("correo")) return new OpenApiString("lucia.mamani@bugie.test");
            if (n.Contains("password")) return new OpenApiString("10203040");
            if (n.Contains("phone") || n.Contains("celular") || n.Contains("telefono")) return new OpenApiString("952123456");
            if (n == "dni" || n.EndsWith("dni") || n.Contains("docnumber") || n.Contains("documentnumber"))
                return new OpenApiString("45123456");
            if (n == "firstname" || n == "nombres") return new OpenApiString("Lucía");
            if (n == "lastname" || n == "apellidos") return new OpenApiString("Mamani Quispe");
            if (n == "fullname" || n.EndsWith("contactname")) return new OpenApiString("Lucía Mamani Quispe");
            if (n.Contains("address") || n.Contains("direccion")) return new OpenApiString("Av. Bolognesi 1250, Tacna");
            if (n.Contains("plate") || n == "placa") return new OpenApiString("ABC-123");
            if (n == "city" || n == "ciudad") return new OpenApiString("Tacna");
            if (n == "brand" || n == "marca") return new OpenApiString("Toyota");
            if (n == "color") return new OpenApiString("Blanco");
            return null;
        }

        if (isNumber)
        {
            if (n is "lat" or "latitude" || n.EndsWith("lat") || n.EndsWith("latitude")) return new OpenApiDouble(-18.0146);
            if (n is "lng" or "lon" or "longitude" || n.EndsWith("lng") || n.EndsWith("longitude")) return new OpenApiDouble(-70.2536);
            if (n.Contains("amount") || n.Contains("fare") || n.Contains("price") || n.Contains("monto") || n.Contains("tarifa"))
                return s.Type == "integer" ? new OpenApiInteger(12) : new OpenApiDouble(12.50);
        }
        return null;
    }
}

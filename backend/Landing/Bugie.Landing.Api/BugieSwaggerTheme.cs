namespace Bugie.Api.Theming;

/// <summary>
/// Tema OSCURO de Bugie para la UI de Swagger. Se inyecta como un bloque
/// &lt;style&gt; dentro del &lt;head&gt; mediante SwaggerUIOptions.HeadContent,
/// por lo que NO depende de archivos estáticos (wwwroot) y funciona igual en
/// todas las APIs. Acentos del tema de la app (azul #2563EB) sobre fondo
/// oscuro.
/// </summary>
public static class BugieSwaggerTheme
{
    public const string HeadContent = """
    <style>
      :root {
        --bugie-primary: #3B82F6;
        --bugie-gold: #D4A017;
        --bugie-success: #2EA043;
        --bugie-danger: #F85149;
        --bg: #0D1117;
        --panel: #161B22;
        --panel2: #1C2230;
        --border: #30363D;
        --text: #E6EDF3;
        --muted: #9DA7B3;
      }
      body { background: var(--bg); }
      .swagger-ui, .swagger-ui .wrapper { color: var(--text); }

      /* Barra superior con degradado de marca (logo reemplazado por texto) */
      .swagger-ui .topbar {
        background: linear-gradient(90deg, #0B1622, #12244A);
        border-bottom: 1px solid var(--border);
        box-shadow: 0 2px 10px rgba(0, 0, 0, .4);
      }
      .swagger-ui .topbar .download-url-wrapper { display: none; }
      .swagger-ui .topbar-wrapper img,
      .swagger-ui .topbar-wrapper svg { display: none; }
      .swagger-ui .topbar-wrapper .link::after {
        content: "Bugie API";
        color: #fff;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: .5px;
      }

      /* Textos generales en claro */
      .swagger-ui .info .title,
      .swagger-ui .info h1, .swagger-ui .info h2,
      .swagger-ui .info p, .swagger-ui .info li,
      .swagger-ui .opblock-tag,
      .swagger-ui .opblock .opblock-summary-path,
      .swagger-ui .opblock .opblock-summary-operation-id,
      .swagger-ui .opblock .opblock-summary-description,
      .swagger-ui .opblock-description-wrapper p,
      .swagger-ui .renderedMarkdown p,
      .swagger-ui table thead tr th,
      .swagger-ui table thead tr td,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__in,
      .swagger-ui .response-col_status,
      .swagger-ui label,
      .swagger-ui .tab li,
      .swagger-ui .model-title,
      .swagger-ui .model,
      .swagger-ui section.models h4,
      .swagger-ui .servers > label {
        color: var(--text) !important;
      }
      .swagger-ui .parameter__type,
      .swagger-ui .prop-format,
      .swagger-ui small,
      .swagger-ui .opblock .opblock-section-header > label {
        color: var(--muted) !important;
      }
      .swagger-ui a, .swagger-ui .info a { color: var(--bugie-primary) !important; }

      /* Bloques por operación */
      .swagger-ui .opblock {
        background: var(--panel);
        border-color: var(--border);
        box-shadow: none;
      }
      .swagger-ui .opblock .opblock-section-header {
        background: var(--panel2);
        box-shadow: none;
      }
      .swagger-ui .opblock-summary { border-color: var(--border); }
      .swagger-ui .opblock-tag {
        color: var(--text);
        border-bottom: 1px solid var(--border);
      }

      .swagger-ui .opblock.opblock-get {
        border-color: var(--bugie-primary);
        background: rgba(59, 130, 246, .07);
      }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: var(--bugie-primary); }
      .swagger-ui .opblock.opblock-post {
        border-color: var(--bugie-success);
        background: rgba(46, 160, 67, .07);
      }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: var(--bugie-success); }
      .swagger-ui .opblock.opblock-put {
        border-color: var(--bugie-gold);
        background: rgba(212, 160, 23, .08);
      }
      .swagger-ui .opblock.opblock-put .opblock-summary-method { background: var(--bugie-gold); }
      .swagger-ui .opblock.opblock-delete {
        border-color: var(--bugie-danger);
        background: rgba(248, 81, 73, .07);
      }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: var(--bugie-danger); }

      /* Tablas */
      .swagger-ui table { border-color: var(--border); }
      .swagger-ui table thead tr th,
      .swagger-ui table thead tr td { border-color: var(--border); }

      /* Inputs / selects / textareas */
      .swagger-ui input,
      .swagger-ui textarea,
      .swagger-ui select {
        background: var(--panel2) !important;
        color: var(--text) !important;
        border: 1px solid var(--border) !important;
      }

      /* Botones */
      .swagger-ui .btn {
        color: var(--text);
        border-color: var(--border);
        background: var(--panel2);
      }
      .swagger-ui .btn.authorize,
      .swagger-ui .btn.execute {
        color: #fff;
        background: var(--bugie-primary);
        border-color: var(--bugie-primary);
      }
      .swagger-ui .btn.authorize svg { fill: #fff; }
      .swagger-ui .btn.cancel {
        color: var(--bugie-danger);
        border-color: var(--bugie-danger);
        background: transparent;
      }

      /* Esquema / servidores */
      .swagger-ui .scheme-container {
        background: var(--panel);
        box-shadow: none;
        border-bottom: 1px solid var(--border);
      }

      /* Modelos (schemas) */
      .swagger-ui section.models {
        border-color: var(--border);
        background: var(--panel);
      }
      .swagger-ui section.models .model-container { background: var(--panel2); }
      .swagger-ui .model-box { background: var(--panel2); }

      /* Bloques de código / ejemplos */
      .swagger-ui .highlight-code,
      .swagger-ui .microlight,
      .swagger-ui .example,
      .swagger-ui pre {
        background: #0A0F16 !important;
        color: #E6EDF3 !important;
      }

      /* Filtro de búsqueda */
      .swagger-ui .filter .operation-filter-input {
        background: var(--panel2);
        color: var(--text);
        border-color: var(--border);
      }
    </style>
    """;
}

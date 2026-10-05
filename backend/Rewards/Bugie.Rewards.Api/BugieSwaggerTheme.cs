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
        --bugie-primary-soft: rgba(59, 130, 246, .14);
        --m-get: #3B82F6;
        --m-post: #22A35A;
        --m-put: #D4A017;
        --m-patch: #A371F7;
        --m-delete: #F0524A;
        --bg: #0B0F17;
        --panel: #121823;
        --panel2: #182030;
        --panel3: #0E141E;
        --border: #232C3B;
        --border-strong: #2F3A4D;
        --text: #E6EDF3;
        --muted: #8B97A8;
        --radius: 12px;
        --font: "Segoe UI", Inter, system-ui, -apple-system, Roboto, sans-serif;
        --mono: "Cascadia Code", Consolas, "SFMono-Regular", Menlo, monospace;
      }
      html { background: var(--bg); }
      body { background: var(--bg); margin: 0; }
      .swagger-ui, .swagger-ui .wrapper { color: var(--text); font-family: var(--font); }
      .swagger-ui .info p, .swagger-ui .info li,
      .swagger-ui .renderedMarkdown, .swagger-ui .markdown { font-family: var(--font); }
      .swagger-ui .wrapper { max-width: 1180px; padding: 0 32px; box-sizing: border-box; }

      /* ── Barra superior ─────────────────────────────────────────── */
      .swagger-ui .topbar {
        background: rgba(11, 15, 23, .85);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--border);
        padding: 12px 0;
        position: sticky; top: 0; z-index: 20;
      }
      .swagger-ui .topbar .wrapper { padding: 0 32px; }
      .swagger-ui .topbar .download-url-wrapper { display: none; }
      .swagger-ui .topbar-wrapper img,
      .swagger-ui .topbar-wrapper svg { display: none; }
      .swagger-ui .topbar-wrapper .link { display: flex; align-items: center; gap: 10px; }
      .swagger-ui .topbar-wrapper .link::before {
        content: "B";
        display: grid; place-items: center;
        width: 30px; height: 30px; border-radius: 8px;
        background: linear-gradient(135deg, #3B82F6, #1D4ED8);
        color: #fff; font: 800 16px/1 var(--font);
        box-shadow: 0 4px 14px rgba(59, 130, 246, .35);
      }
      .swagger-ui .topbar-wrapper .link::after {
        content: "Bugie API";
        color: #fff; font: 700 17px/1 var(--font); letter-spacing: .2px;
      }

      /* ── Encabezado de la API ───────────────────────────────────── */
      .swagger-ui .information-container { padding-top: 36px; }
      .swagger-ui .info { margin: 0 0 8px; }
      .swagger-ui .info hgroup.main { margin: 0 0 14px; }
      .swagger-ui .info .title {
        font: 700 30px/1.2 var(--font); color: #fff !important;
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      }
      .swagger-ui .info .title small { top: 0; margin: 0; }
      .swagger-ui .info .title small pre.version {
        background: var(--primary-soft, var(--bugie-primary-soft)) !important;
        color: #93C5FD !important; border: 1px solid rgba(59, 130, 246, .35);
        border-radius: 999px; padding: 3px 10px; font: 600 12px/1.2 var(--font);
      }
      .swagger-ui .info .title small.version-stamp { background: transparent; }
      .swagger-ui .info .title small.version-stamp pre.version {
        background: rgba(34, 163, 90, .14) !important; color: #86EFAC !important;
        border-color: rgba(34, 163, 90, .35);
      }
      .swagger-ui .info hgroup.main a.link { display: inline-block; margin-top: 8px; }
      .swagger-ui .info hgroup.main a .url { font: 400 12.5px/1.4 var(--mono); color: var(--muted) !important; }
      .swagger-ui .info .description { max-width: 78ch; }
      .swagger-ui .info .description p { font-size: 15px; line-height: 1.65; color: #B8C2D0 !important; margin: 0; }

      /* Authorize: sin franja propia, alineado a la derecha bajo el encabezado */
      .swagger-ui .scheme-container {
        background: transparent; box-shadow: none; border: 0;
        margin: 0; padding: 4px 0 8px;
      }
      .swagger-ui .scheme-container .schemes { justify-content: flex-end; padding: 0 32px; }
      .swagger-ui .scheme-container .auth-wrapper { margin: 0; }

      /* ── Buscador ───────────────────────────────────────────────── */
      .swagger-ui .filter-container { margin: 0; padding: 0; }
      .swagger-ui .filter-container .filter { padding: 0 32px; }
      .swagger-ui .filter .operation-filter-input {
        margin: 8px 0 28px; padding: 12px 16px 12px 42px;
        border-radius: 10px; font: 400 14px var(--font);
        background: var(--panel) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238B97A8' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='7' cy='7' r='5'/%3E%3Cpath d='m11 11 4 4'/%3E%3C/svg%3E") no-repeat 15px center !important;
        border: 1px solid var(--border) !important;
        transition: border-color 200ms ease, box-shadow 200ms ease;
      }
      .swagger-ui .filter .operation-filter-input:focus {
        outline: none; border-color: var(--bugie-primary) !important;
        box-shadow: 0 0 0 3px var(--bugie-primary-soft);
      }

      /* ── Textos generales ───────────────────────────────────────── */
      .swagger-ui .opblock .opblock-summary-path,
      .swagger-ui .opblock .opblock-summary-operation-id,
      .swagger-ui .opblock-description-wrapper p,
      .swagger-ui .opblock-external-docs-wrapper p,
      .swagger-ui .renderedMarkdown p,
      .swagger-ui .renderedMarkdown li,
      .swagger-ui table thead tr th,
      .swagger-ui table thead tr td,
      .swagger-ui .parameter__name,
      .swagger-ui .response-col_status,
      .swagger-ui label,
      .swagger-ui .tab li,
      .swagger-ui .model-title,
      .swagger-ui .model,
      .swagger-ui .opblock .opblock-section-header h4,
      .swagger-ui .responses-inner h4,
      .swagger-ui .responses-inner h5,
      .swagger-ui .dialog-ux .modal-ux-content h4,
      .swagger-ui .dialog-ux .modal-ux-content h6,
      .swagger-ui .dialog-ux .modal-ux-content p,
      .swagger-ui .dialog-ux .modal-ux-header h3,
      .swagger-ui .servers > label {
        color: var(--text) !important;
      }
      .swagger-ui .parameter__type,
      .swagger-ui .parameter__in,
      .swagger-ui .prop-format,
      .swagger-ui .parameter__deprecated,
      .swagger-ui small,
      .swagger-ui .response-col_links,
      .swagger-ui .opblock .opblock-section-header > label {
        color: var(--muted) !important;
      }
      .swagger-ui a, .swagger-ui .info a { color: #60A5FA !important; }
      .swagger-ui .renderedMarkdown code,
      .swagger-ui .markdown code {
        background: var(--panel2) !important; color: #C9D6E8 !important;
        border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px;
        font: 400 12.5px var(--mono);
      }

      /* ── Grupos (tags) como tarjetas ────────────────────────────── */
      .swagger-ui .opblock-tag-section {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin: 0 0 14px;
        overflow: hidden;
      }
      .swagger-ui .opblock-tag {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        column-gap: 16px;
        margin: 0; padding: 16px 20px;
        border: 0;
        color: var(--text) !important;
        cursor: pointer;
      }
      .swagger-ui .opblock-tag > a.nostyle { grid-column: 1; grid-row: 1; }
      .swagger-ui .opblock-tag > a.nostyle span {
        font: 600 17px/1.3 var(--font); color: #fff;
      }
      .swagger-ui .opblock-tag > small {
        grid-column: 1; grid-row: 2;
        flex: none; padding: 0; margin-top: 4px;
        font: 400 13.5px/1.55 var(--font);
      }
      .swagger-ui .opblock-tag > small .renderedMarkdown p,
      .swagger-ui .opblock-tag > small .renderedMarkdown li {
        font-size: 13.5px !important; line-height: 1.55; color: var(--muted) !important; margin: 0;
      }
      /* Cerrado: descripción en 2 líneas; abierto: completa */
      .swagger-ui .opblock-tag[data-is-open="false"] > small .renderedMarkdown {
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .swagger-ui .opblock-tag[data-is-open="true"] > small .renderedMarkdown ul { margin: 6px 0; padding-left: 18px; }
      .swagger-ui .opblock-tag > button.expand-operation {
        grid-column: 2; grid-row: 1 / span 2;
        width: 32px; height: 32px; padding: 0; display: grid; place-items: center;
        border-radius: 8px; background: transparent; border: 1px solid transparent;
      }
      .swagger-ui .opblock-tag > button.expand-operation svg { fill: var(--muted); width: 14px; height: 14px; }
      .swagger-ui .opblock-tag-section.is-open .opblock-tag,
      .swagger-ui .opblock-tag[data-is-open="true"] { border-bottom: 1px solid var(--border); }
      .swagger-ui .opblock-tag-section > div:not(.opblock-tag) { padding: 14px 16px 6px; }
      .swagger-ui .operation-tag-content { padding: 0; }

      /* ── Operaciones ───────────────────────────────────────────── */
      .swagger-ui .opblock {
        --m: var(--m-get);
        background: var(--panel3);
        border: 1px solid var(--border);
        border-left: 3px solid var(--m);
        border-radius: 10px;
        box-shadow: none;
        margin: 0 0 10px;
        overflow: hidden;
      }
      .swagger-ui .opblock.opblock-get    { --m: var(--m-get); }
      .swagger-ui .opblock.opblock-post   { --m: var(--m-post); }
      .swagger-ui .opblock.opblock-put    { --m: var(--m-put); }
      .swagger-ui .opblock.opblock-patch  { --m: var(--m-patch); }
      .swagger-ui .opblock.opblock-delete { --m: var(--m-delete); }
      .swagger-ui .opblock.opblock-get, .swagger-ui .opblock.opblock-post,
      .swagger-ui .opblock.opblock-put, .swagger-ui .opblock.opblock-patch,
      .swagger-ui .opblock.opblock-delete, .swagger-ui .opblock.opblock-head,
      .swagger-ui .opblock.opblock-options {
        background: var(--panel3); border-color: var(--border); border-left-color: var(--m);
      }
      .swagger-ui .opblock .opblock-summary-control:focus { outline: none; }
      .swagger-ui .opblock .opblock-summary-control:focus-visible { outline: 2px solid var(--bugie-primary); outline-offset: 2px; border-radius: 6px; }
      .swagger-ui .opblock .opblock-summary {
        padding: 10px 12px; border: 0; gap: 4px; align-items: center;
      }
      .swagger-ui .opblock.is-open .opblock-summary { border-bottom: 1px solid var(--border); }
      .swagger-ui .opblock .opblock-summary-control { gap: 14px; align-items: center; min-width: 0; }
      .swagger-ui .opblock .opblock-summary-method {
        min-width: 66px; padding: 5px 0; border-radius: 6px;
        background: color-mix(in srgb, var(--m) 16%, transparent) !important;
        color: var(--m); border: 1px solid color-mix(in srgb, var(--m) 40%, transparent);
        font: 700 12px/1.2 var(--font); letter-spacing: .4px; text-shadow: none;
      }
      .swagger-ui .opblock .opblock-summary-path {
        font: 500 14px/1.4 var(--mono); padding: 0; flex: 0 1 auto; max-width: none;
      }
      .swagger-ui .opblock .opblock-summary-path a span { color: var(--text); }
      .swagger-ui .opblock .opblock-summary-description {
        flex: 1 1 0; min-width: 0; padding: 0;
        font: 400 13.5px/1.4 var(--font); color: var(--muted) !important;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;
      }
      .swagger-ui .opblock .opblock-summary-control > svg.arrow { fill: var(--muted); width: 14px; height: 14px; flex: none; }
      .swagger-ui .opblock .authorization__btn { padding: 0 4px; }
      .swagger-ui .opblock .authorization__btn svg { fill: var(--muted); }
      .swagger-ui .opblock .authorization__btn.locked svg { fill: #FBBF24; }
      .swagger-ui .opblock .view-line-link svg { fill: var(--muted); }
      .swagger-ui .opblock.opblock-deprecated { opacity: .6; }

      /* Cuerpo de la operación */
      .swagger-ui .opblock .opblock-body { background: var(--panel3); }
      .swagger-ui .opblock-description-wrapper,
      .swagger-ui .opblock-external-docs-wrapper,
      .swagger-ui .opblock-title_normal { padding: 16px 20px 4px; }
      .swagger-ui .opblock-description-wrapper p { font-size: 14px; line-height: 1.6; color: #B8C2D0 !important; }
      .swagger-ui .opblock .opblock-section-header {
        background: var(--panel2); box-shadow: none;
        padding: 10px 20px; min-height: 0;
        border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
      }
      .swagger-ui .opblock .opblock-section-header h4 { font: 600 13px/1.3 var(--font); letter-spacing: .3px; text-transform: uppercase; }
      .swagger-ui .parameters-container,
      .swagger-ui .opblock-section-request-body > div:not(.opblock-section-header),
      .swagger-ui .responses-wrapper .responses-inner { padding: 14px 20px 18px; }
      .swagger-ui .table-container { padding: 6px 0 0; }
      .swagger-ui .parameters-col_description { padding-left: 8px; }

      /* Tablas */
      .swagger-ui table { border-color: var(--border); }
      .swagger-ui table thead tr th,
      .swagger-ui table thead tr td {
        border-color: var(--border); font: 600 12px var(--font);
        text-transform: uppercase; letter-spacing: .4px; color: var(--muted) !important;
        padding: 8px 0;
      }
      .swagger-ui table tbody tr td { padding: 12px 0; vertical-align: top; border-top: 1px solid var(--border); }
      .swagger-ui table tbody tr:first-child td { border-top: 0; }
      .swagger-ui .parameter__name { font: 600 13.5px var(--mono); }
      .swagger-ui .parameter__name.required::after { color: var(--m-delete) !important; }
      .swagger-ui .parameter__name.required span { color: var(--m-delete) !important; }
      .swagger-ui .response-col_status { font: 600 14px var(--mono); }
      .swagger-ui table tbody td .renderedMarkdown p,
      .swagger-ui table tbody td .markdown p { margin: 0 0 6px; }
      .swagger-ui .response-col_description__inner { margin: 0; }
      .swagger-ui .response-col_links i { color: var(--muted); font-size: 12.5px; }
      .swagger-ui .responses-table .response > td:first-child { width: 90px; }

      /* Inputs */
      .swagger-ui input[type=text],
      .swagger-ui input[type=password],
      .swagger-ui input[type=search],
      .swagger-ui input[type=email],
      .swagger-ui input[type=file],
      .swagger-ui textarea,
      .swagger-ui select {
        background: var(--panel2) !important;
        color: var(--text) !important;
        border: 1px solid var(--border-strong) !important;
        border-radius: 8px !important;
        box-shadow: none !important;
        font-family: var(--font);
        transition: border-color 200ms ease, box-shadow 200ms ease;
      }
      .swagger-ui input[type=text]:focus,
      .swagger-ui textarea:focus,
      .swagger-ui select:focus {
        outline: none; border-color: var(--bugie-primary) !important;
        box-shadow: 0 0 0 3px var(--bugie-primary-soft) !important;
      }
      .swagger-ui textarea { font-family: var(--mono); font-size: 13px; line-height: 1.5; }
      .swagger-ui select { padding: 7px 32px 7px 10px; }

      /* Botones */
      .swagger-ui .btn {
        color: var(--text); border: 1px solid var(--border-strong);
        background: var(--panel2); border-radius: 8px;
        font: 600 13px var(--font); padding: 8px 16px; box-shadow: none;
      }
      .swagger-ui .btn.authorize {
        color: #fff; background: var(--bugie-primary); border-color: var(--bugie-primary);
        display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px;
      }
      .swagger-ui .btn.authorize span { padding: 0; }
      .swagger-ui .btn.authorize svg { fill: #fff; margin: 0; }
      .swagger-ui .btn.execute { color: #fff; background: var(--bugie-primary); border-color: var(--bugie-primary); }
      .swagger-ui .btn-group { padding: 16px 20px; gap: 10px; }
      .swagger-ui .btn-group .btn { border-radius: 8px !important; }
      .swagger-ui .btn.cancel { color: #FCA5A5; border-color: rgba(240, 82, 74, .5); background: transparent; }
      .swagger-ui .try-out__btn { padding: 6px 14px; }

      /* Respuestas / código */
      .swagger-ui .highlight-code,
      .swagger-ui .microlight,
      .swagger-ui .example,
      .swagger-ui pre {
        background: #080C13 !important;
        color: #D7E0EC !important;
        border-radius: 8px;
        font-family: var(--mono) !important;
      }
      .swagger-ui .highlight-code > .microlight,
      .swagger-ui .opblock-body pre.microlight {
        border: 1px solid var(--border); padding: 14px 16px !important; font-size: 12.5px; line-height: 1.6;
      }
      .swagger-ui .responses-inner .response-control-media-type__accept-message { color: #86EFAC !important; }
      .swagger-ui .request-url pre, .swagger-ui .curl-command pre { white-space: pre-wrap; word-break: break-all; }
      .swagger-ui .tab { margin: 10px 0 12px; gap: 6px; }
      .swagger-ui .tab li { font: 600 13px var(--font); }
      .swagger-ui .tab li button.tablinks { color: var(--muted) !important; }
      .swagger-ui .tab li.active button.tablinks { color: var(--text) !important; }
      .swagger-ui .tab li:first-of-type::after { background: var(--border); }
      .swagger-ui .model-box { background: var(--panel2); border-radius: 8px; }
      .swagger-ui .model .property.primitive, .swagger-ui .model span { color: #C9D6E8; }
      .swagger-ui section.models { display: none; }

      /* Modal de Authorize */
      .swagger-ui .dialog-ux .backdrop-ux { background: rgba(3, 6, 12, .7); backdrop-filter: blur(3px); }
      .swagger-ui .dialog-ux .modal-ux {
        background: var(--panel); border: 1px solid var(--border);
        border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, .6);
        max-width: 620px;
      }
      .swagger-ui .dialog-ux .modal-ux-header { border-bottom: 1px solid var(--border); padding: 16px 22px; }
      .swagger-ui .dialog-ux .modal-ux-header h3 { font: 600 17px var(--font); }
      .swagger-ui .dialog-ux .modal-ux-content { padding: 6px 22px 18px; max-height: 70vh; }
      .swagger-ui .dialog-ux .modal-ux-header .close-modal svg { fill: var(--muted); }
      .swagger-ui .auth-container { border-bottom: 1px solid var(--border); padding: 16px 0; }
      .swagger-ui .auth-container:last-of-type { border-bottom: 0; }
      .swagger-ui .auth-container h4 { font: 600 15px var(--font); margin-bottom: 8px; }
      .swagger-ui .auth-container code { background: var(--panel2); color: #C9D6E8; border-radius: 6px; padding: 1px 6px; }
      .swagger-ui .auth-container input { width: 100%; box-sizing: border-box; }
      .swagger-ui .auth-btn-wrapper { padding: 6px 0 0; gap: 10px; justify-content: flex-start; }

      /* Barra de desplazamiento */
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: var(--bg); }
      ::-webkit-scrollbar-thumb { background: #263043; border-radius: 10px; border: 2px solid var(--bg); }
      ::-webkit-scrollbar-thumb:hover { background: #334058; }

      /* Pantallas angostas */
      @media (max-width: 760px) {
        .swagger-ui .wrapper,
        .swagger-ui .topbar .wrapper,
        .swagger-ui .scheme-container .schemes,
        .swagger-ui .filter-container .filter { padding: 0 16px; }
        .swagger-ui .info .title { font-size: 24px; }
        .swagger-ui .opblock .opblock-summary-description { display: none; }
        .swagger-ui .opblock .opblock-summary-path { font-size: 13px; }
      }

      /* ── Animaciones (sutiles; se desactivan con prefers-reduced-motion) ── */
      @keyframes bugie-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: none; }
      }
      @keyframes bugie-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes bugie-modal-in {
        from { opacity: 0; transform: translate(-50%, -47%) scale(.98); }
        to   { opacity: 1; transform: translate(-50%, -50%); }
      }
      @keyframes bugie-bar {
        from { background-position: 200% 0; }
        to   { background-position: -200% 0; }
      }
      @keyframes bugie-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, .45); }
        50%      { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
      }

      .swagger-ui .information-container { animation: bugie-fade 350ms ease-out both; }
      .swagger-ui .opblock-tag-section { animation: bugie-in 360ms cubic-bezier(.2, .7, .2, 1) both; }
      .swagger-ui .opblock-tag-section:nth-child(2) { animation-delay: 40ms; }
      .swagger-ui .opblock-tag-section:nth-child(3) { animation-delay: 80ms; }
      .swagger-ui .opblock-tag-section:nth-child(4) { animation-delay: 120ms; }
      .swagger-ui .opblock-tag-section:nth-child(5) { animation-delay: 160ms; }
      .swagger-ui .opblock-tag-section:nth-child(6) { animation-delay: 200ms; }
      .swagger-ui .opblock-tag-section:nth-child(7) { animation-delay: 240ms; }
      .swagger-ui .opblock-tag-section:nth-child(n+8) { animation-delay: 280ms; }
      .swagger-ui .operation-tag-content > span { animation: bugie-in 240ms ease-out both; }
      .swagger-ui .operation-tag-content > span:nth-child(2) { animation-delay: 30ms; }
      .swagger-ui .operation-tag-content > span:nth-child(3) { animation-delay: 60ms; }
      .swagger-ui .operation-tag-content > span:nth-child(n+4) { animation-delay: 90ms; }
      .swagger-ui .opblock.is-open .opblock-body { animation: bugie-in 240ms ease-out both; }

      .swagger-ui .opblock-tag-section { transition: border-color 200ms ease; }
      .swagger-ui .opblock-tag-section:hover { border-color: var(--border-strong); }
      .swagger-ui .opblock-tag { transition: background-color 200ms ease; }
      .swagger-ui .opblock-tag:hover { background-color: rgba(255, 255, 255, .025); }
      .swagger-ui .opblock-tag > button.expand-operation { transition: background-color 200ms ease, border-color 200ms ease; }
      .swagger-ui .opblock-tag:hover > button.expand-operation { background: var(--panel2); border-color: var(--border); }
      .swagger-ui .opblock {
        transition: box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease, background-color 200ms ease;
      }
      .swagger-ui .opblock:hover {
        background: color-mix(in srgb, var(--m) 5%, var(--panel3));
        box-shadow: 0 6px 18px rgba(0, 0, 0, .25);
      }
      .swagger-ui .opblock:not(.is-open):hover { transform: translateY(-1px); }
      .swagger-ui .btn {
        transition: transform 150ms ease, box-shadow 200ms ease, background-color 200ms ease, border-color 200ms ease;
      }
      .swagger-ui .btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(59, 130, 246, .22); }
      .swagger-ui .btn:active { transform: none; box-shadow: none; }

      .swagger-ui .loading-container::before {
        content: "";
        display: block;
        width: min(240px, 80%);
        height: 3px;
        margin-bottom: 36px;
        border-radius: 3px;
        background: linear-gradient(90deg, transparent, var(--bugie-primary), transparent) 0 0 / 200% 100%;
        animation: bugie-bar 1.1s linear infinite;
      }
      .swagger-ui .loading-container .loading::before {
        border-color: rgba(59, 130, 246, .18);
        border-top-color: var(--bugie-primary);
      }
      .swagger-ui .loading-container .loading::after { color: var(--muted); }
      .swagger-ui .opblock-body:has(.loading-container) .btn.execute {
        animation: bugie-pulse 1.2s ease-out infinite;
      }

      .swagger-ui .dialog-ux .backdrop-ux { animation: bugie-fade 200ms ease-out both; }
      .swagger-ui .dialog-ux .modal-ux { animation: bugie-modal-in 260ms cubic-bezier(.2, .7, .2, 1) both; }

      @media (prefers-reduced-motion: reduce) {
        .swagger-ui *,
        .swagger-ui *::before,
        .swagger-ui *::after {
          animation: none !important;
          transition: none !important;
        }
        .swagger-ui .opblock:hover,
        .swagger-ui .btn:hover { transform: none !important; }
      }
    </style>
    """;
}

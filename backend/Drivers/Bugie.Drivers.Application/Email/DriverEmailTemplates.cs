namespace Bugie.Drivers.Application.Email;

/// <summary>
/// Plantillas HTML para correos relacionados al conductor.
/// La ciudad se pasa como parámetro (viene de Landing.Api).
/// </summary>
public static class DriverEmailTemplates
{
    private const string Brand = "Bugie";
    private const string Color = "#4F7DF5";
    /// <summary>URL de la web (App:WebBaseUrl en appsettings). La fija Program.cs al arrancar.</summary>
    public static string AppUrl { get; set; } = "http://localhost:5173";
    /// <summary>URL del panel admin (App:AdminBaseUrl en appsettings).</summary>
    public static string AdminUrl { get; set; } = "http://localhost:5174";

    private static readonly Dictionary<string, string> DocLabels = new()
    {
        { "license",          "Licencia de conducir" },
        { "soat",             "SOAT" },
        { "revision_tecnica", "Revisión técnica" },
    };

    // ─────────────────────────────────────────────────────────────────────
    // Correo de aprobación de conductor
    // ─────────────────────────────────────────────────────────────────────
    public static string DriverApproved(string fullName, string city) => Wrap(city,
        "Tu cuenta de conductor está activa",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>¡Excelentes noticias! Tu cuenta de conductor en <strong>{Brand}</strong> ha sido
        <strong>verificada y aprobada</strong>.</p>
        <p>A partir de ahora puedes:</p>
        <ul>
          <li>Conectarte y aparecer como disponible en el mapa</li>
          <li>Recibir solicitudes de viaje de pasajeros verificados</li>
          <li>Acumular ganancias en tu billetera</li>
        </ul>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/auth/login""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ingresar a Bugie
          </a>
        </p>
        <p>¡Bienvenido al equipo de conductores Bugie!</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Correo al CONDUCTOR — aprobado por excepción (con plazo para completar)
    // ─────────────────────────────────────────────────────────────────────
    public static string DriverApprovedWithException(
        string fullName, DateTime deadlinePeru, List<string> missingLabels, string city) => Wrap(city,
        "Tu cuenta de conductor está activa (con documentos pendientes)",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Tu cuenta de conductor en <strong>{Brand}</strong> fue <strong>aprobada</strong>,
        pero todavía te faltan documentos por completar:</p>
        <ul>{string.Concat(missingLabels.Select(l => $"<li>{l}</li>"))}</ul>
        <p>Tienes plazo hasta el <strong style=""color:#ef4444"">{deadlinePeru:dd/MM/yyyy HH:mm}</strong>
        para subirlos y que sean aprobados. Si no los completas a tiempo, tu cuenta se
        <strong>desactivará automáticamente</strong> y se te registrará una falta.</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/app/conductor/documentos""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Completar mis documentos
          </a>
        </p>");

    // ─────────────────────────────────────────────────────────────────────
    // Correo al CONDUCTOR — desactivado por no completar documentos a tiempo
    // ─────────────────────────────────────────────────────────────────────
    public static string DriverDeactivatedMissingDocs(
        string fullName, List<string> missingLabels, string city) => Wrap(city,
        "Tu cuenta de conductor fue desactivada",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Venció el plazo para completar tus documentos y tu cuenta de conductor en
        <strong>{Brand}</strong> fue <strong style=""color:#ef4444"">desactivada automáticamente</strong>.
        Se te registró una falta.</p>
        {(missingLabels.Count > 0
            ? $"<p>Documentos que faltaban:</p><ul>{string.Concat(missingLabels.Select(l => $"<li>{l}</li>"))}</ul>"
            : "")}
        <p>Para volver a activar tu cuenta, sube todos tus documentos. Nuestro equipo los revisará
        y, cuando estén completos y aprobados, podrás volver a recibir viajes.</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/app/conductor/documentos""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ir a mis documentos
          </a>
        </p>");

    // ─────────────────────────────────────────────────────────────────────
    // Correo al CONDUCTOR — documento por caducar o ya caducado
    // ─────────────────────────────────────────────────────────────────────
    public static string DocumentExpiringDriver(
        string fullName, string docType, DateTime expiresAt, int daysBefore, string city)
    {
        var docLabel = DocLabels.GetValueOrDefault(docType, docType);
        var dateStr = Bugie.Drivers.Domain.Common.BugieTime.ToPeru(expiresAt).ToString("dd/MM/yyyy");

        var (title, urgencia) = daysBefore switch
        {
            0 => ("Tu documento caducó hoy", "<strong style=\"color:#ef4444\">caducó hoy</strong>"),
            1 => ("Tu documento caduca mañana", "caduca <strong>mañana</strong>"),
            _ => ($"Tu documento caduca en {daysBefore} días", $"caduca en <strong>{daysBefore} días</strong>"),
        };

        return Wrap(city, title, $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Te avisamos que tu documento <strong>{docLabel}</strong> {urgencia} ({dateStr}).</p>
        {(daysBefore == 0
            ? @"<p>Tu cuenta de conductor pasó a <strong style=""color:#f59e0b"">pendiente de revisión</strong>
                porque necesitamos que renueves este documento. Puedes ingresar normalmente y subir el
                documento renovado desde la sección Documentos.</p>
                <p>Una vez que subas el documento nuevo, nuestro equipo lo revisará y reactivará tu cuenta
                para que vuelvas a recibir solicitudes de viaje.</p>"
            : @"<p>Para evitar que tu cuenta pase a pendiente de revisión, sube el documento renovado
                lo antes posible desde la sección Documentos.</p>")}
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/app/conductor/documentos""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ir a mis documentos
          </a>
        </p>
        <p style=""color:#888;font-size:0.85rem;margin-top:24px;"">
          <strong>Recordatorio:</strong> tras subir el documento renovado, el equipo de Bugie lo revisará
          en 24 a 48 horas antes de aprobar tu cuenta nuevamente.
        </p>");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Correo al ADMIN — documento de conductor por caducar o ya caducado
    // ─────────────────────────────────────────────────────────────────────
    public static string DocumentExpiringAdmin(
        string driverFullName, string driverEmail, string driverPhone,
        string docType, DateTime expiresAt, int daysBefore, string city)
    {
        var docLabel = DocLabels.GetValueOrDefault(docType, docType);
        var dateStr = Bugie.Drivers.Domain.Common.BugieTime.ToPeru(expiresAt).ToString("dd/MM/yyyy");

        var (title, urgencia) = daysBefore switch
        {
            0 => ("Documento de conductor caducó hoy", "<strong style=\"color:#ef4444\">caducó hoy</strong>"),
            1 => ("Documento de conductor caduca mañana", "caduca <strong>mañana</strong>"),
            _ => ($"Documento de conductor caduca en {daysBefore} días", $"caduca en <strong>{daysBefore} días</strong>"),
        };

        return Wrap(city, title, $@"
        <p>El siguiente conductor tiene un documento que {urgencia} ({dateStr}):</p>
        <table style=""width:100%;border-collapse:collapse;margin:20px 0;"">
          <tr style=""background:#f4f6fa;"">
            <td style=""padding:10px;border:1px solid #e0e0e0;""><strong>Conductor</strong></td>
            <td style=""padding:10px;border:1px solid #e0e0e0;"">{driverFullName}</td>
          </tr>
          <tr>
            <td style=""padding:10px;border:1px solid #e0e0e0;""><strong>Correo</strong></td>
            <td style=""padding:10px;border:1px solid #e0e0e0;"">{driverEmail}</td>
          </tr>
          <tr style=""background:#f4f6fa;"">
            <td style=""padding:10px;border:1px solid #e0e0e0;""><strong>Teléfono</strong></td>
            <td style=""padding:10px;border:1px solid #e0e0e0;"">{driverPhone}</td>
          </tr>
          <tr>
            <td style=""padding:10px;border:1px solid #e0e0e0;""><strong>Documento</strong></td>
            <td style=""padding:10px;border:1px solid #e0e0e0;"">{docLabel}</td>
          </tr>
          <tr style=""background:#f4f6fa;"">
            <td style=""padding:10px;border:1px solid #e0e0e0;""><strong>Caduca</strong></td>
            <td style=""padding:10px;border:1px solid #e0e0e0;"">{dateStr}</td>
          </tr>
        </table>
        {(daysBefore == 0
            ? @"<p>El conductor pasó automáticamente a <strong style=""color:#f59e0b"">pendiente de revisión</strong>.
                Cuando suba el documento renovado, aparecerá en la lista de pendientes para que lo apruebes.</p>"
            : "<p>Te avisamos con anticipación para que estés pendiente.</p>")}
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AdminUrl}/admin/conductores""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ver panel de conductores
          </a>
        </p>");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Rechazo, suspensión, reactivación y respuesta a la solicitud de revisión
    // (el motivo lo escribe el admin: se codifica para HTML).
    // ─────────────────────────────────────────────────────────────────────
    private static string Enc(string text) => System.Net.WebUtility.HtmlEncode(text);

    private static string ReasonBox(string reason) =>
        $@"<p style=""background:#f4f6fa;border-left:4px solid {Color};padding:12px 16px;border-radius:6px;"">{Enc(reason)}</p>";

    private static string Button(string url, string text) => $@"
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{url}""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            {text}
          </a>
        </p>";

    /// <summary>Correo al CONDUCTOR — su registro no fue aceptado.</summary>
    public static string DriverRejected(string fullName, string reason, string city) => Wrap(city,
        "Tu registro como conductor no fue aceptado",
        $@"
        <p>Hola <strong>{Enc(fullName)}</strong>,</p>
        <p>Revisamos tu registro como conductor en <strong>{Brand}</strong> y por ahora
        <strong style=""color:#ef4444"">no fue aceptado</strong>. El motivo es:</p>
        {ReasonBox(reason)}
        <p>Si crees que es un error o ya corregiste lo indicado, puedes actualizar tus documentos
        y <strong>solicitar una revisión</strong> desde la app o la web.</p>
        {Button($"{AppUrl}/auth/login", "Ingresar a Bugie")}");

    /// <summary>Correo al CONDUCTOR — cuenta suspendida (untilPeru NULL = indefinida).</summary>
    public static string DriverSuspended(string fullName, string reason, DateTime? untilPeru, string city) => Wrap(city,
        "Tu cuenta de conductor fue suspendida",
        $@"
        <p>Hola <strong>{Enc(fullName)}</strong>,</p>
        <p>Tu cuenta de conductor en <strong>{Brand}</strong> fue
        <strong style=""color:#ef4444"">suspendida</strong>. El motivo es:</p>
        {ReasonBox(reason)}
        <p>{(untilPeru is null
            ? "La suspensión es <strong>indefinida</strong>: seguirá hasta que nuestro equipo la levante."
            : $"La suspensión termina el <strong>{untilPeru.Value:dd/MM/yyyy}</strong> (al final del día). Después podrás volver a conectarte si tus documentos están vigentes.")}</p>
        <p>Mientras tanto no puedes conectarte ni recibir viajes. Tus viajes, calificaciones,
        billetera y puntos se conservan. Si no estás de acuerdo, puedes <strong>solicitar una revisión</strong>
        desde la app o la web.</p>
        {Button($"{AppUrl}/auth/login", "Ingresar a Bugie")}");

    /// <summary>
    /// Correo al CONDUCTOR — fue reactivado. statusLabel = nuevo estado
    /// ("Aprobado", "En revisión", ...); auto = terminó la suspensión con fecha.
    /// </summary>
    public static string DriverReactivated(string fullName, bool approved, string statusLabel, bool auto, string city) => Wrap(city,
        "Tu cuenta de conductor fue reactivada",
        $@"
        <p>Hola <strong>{Enc(fullName)}</strong>,</p>
        <p>{(auto
            ? $"Terminó la suspensión de tu cuenta de conductor en <strong>{Brand}</strong>."
            : $"Nuestro equipo reactivó tu cuenta de conductor en <strong>{Brand}</strong>.")}</p>
        <p>Estado actual de tu cuenta: <strong>{Enc(statusLabel)}</strong>.</p>
        <p>{(approved
            ? "Ya puedes conectarte y volver a recibir viajes."
            : "Antes de conectarte revisa tus documentos: súbelos o renuévalos y nuestro equipo los revisará.")}</p>
        {Button(approved ? $"{AppUrl}/auth/login" : $"{AppUrl}/app/conductor/documentos",
                approved ? "Ingresar a Bugie" : "Ir a mis documentos")}");

    /// <summary>Correo al CONDUCTOR — el admin revisó su solicitud y mantiene el rechazo/suspensión.</summary>
    public static string DriverReviewKept(string fullName, bool suspended, string reason, string city) => Wrap(city,
        "Respuesta a tu solicitud de revisión",
        $@"
        <p>Hola <strong>{Enc(fullName)}</strong>,</p>
        <p>Revisamos tu solicitud y por ahora <strong>se mantiene {(suspended ? "la suspensión" : "el rechazo")}</strong>
        de tu cuenta de conductor en <strong>{Brand}</strong>. El motivo es:</p>
        {ReasonBox(reason)}
        <p>Si tienes información nueva, puedes enviar otra solicitud de revisión desde la app o la web.</p>
        {Button($"{AppUrl}/auth/login", "Ingresar a Bugie")}");

    // ─────────────────────────────────────────────────────────────────────
    private static string Wrap(string city, string title, string innerHtml) => $@"
<!doctype html>
<html><head><meta charset=""utf-8""></head>
<body style=""margin:0;padding:0;background:#f4f6fa;font-family:Arial,sans-serif;"">
  <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f4f6fa;padding:20px 0;"">
    <tr><td align=""center"">
      <table width=""600"" cellpadding=""0"" cellspacing=""0"" style=""background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);"">

        <tr><td style=""background:{Color};padding:30px;text-align:center;color:#fff;"">
          <div style=""font-size:28px;font-weight:bold;"">{Brand}</div>
          <div style=""font-size:14px;opacity:0.9;margin-top:4px;"">Tu App de Transporte Seguro</div>
        </td></tr>

        <tr><td style=""padding:30px;color:#333;font-size:15px;line-height:1.6;"">
          <h2 style=""margin:0 0 20px;color:{Color};"">{title}</h2>
          {innerHtml}
        </td></tr>

        <tr><td style=""background:#f4f6fa;padding:20px;text-align:center;color:#888;font-size:12px;"">
          © {DateTime.UtcNow.Year} {Brand} · {city}<br>
          Este es un correo automático, por favor no lo respondas.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>";
}
namespace Bugie.Auth.Application.Email;

/// <summary>
/// Plantillas HTML para los correos de Bugie.
/// La ciudad se pasa como parámetro (viene de la BD vía Landing.Api).
/// </summary>
public static class EmailTemplates
{
    private const string Brand = "Bugie";
    private const string Color = "#4F7DF5";
    /// <summary>URL de la web (App:WebBaseUrl en appsettings). La fija Program.cs al arrancar.</summary>
    public static string AppUrl { get; set; } = "http://localhost:5173";

    // ─────────────────────────────────────────────────────────────────────
    // Bienvenida al pasajero
    // ─────────────────────────────────────────────────────────────────────
    public static string WelcomePassenger(string fullName, string city) => Wrap(city,
        "Bienvenido a Bugie",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Gracias por registrarte en <strong>{Brand}</strong>, la plataforma de transporte seguro de {city}.</p>
        <p>Antes de poder solicitar viajes, necesitamos <strong>verificar tu identidad</strong>.
        Es un paso obligatorio para mantener nuestra comunidad segura.</p>
        <p>Lo que necesitamos de ti:</p>
        <ul>
          <li>Foto frontal de tu DNI</li>
          <li>Foto del reverso de tu DNI</li>
        </ul>
        <p>Ingresa a tu cuenta y completa la verificación:</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/app/pasajero/verificacion""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Completar mi verificación
          </a>
        </p>
        <p>El equipo revisará tus documentos en 24 a 48 horas y te avisaremos por correo cuando tu cuenta esté activa.</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Bienvenida al conductor
    // ─────────────────────────────────────────────────────────────────────
    public static string WelcomeDriver(string fullName, string city) => Wrap(city,
        "Bienvenido a Bugie · Conductor",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>¡Gracias por unirte a <strong>{Brand}</strong> como conductor! Estás a un paso de empezar a generar ingresos
        con tu vehículo en {city}.</p>
        <p>Para activar tu cuenta y empezar a recibir solicitudes de viaje, necesitamos
        <strong>verificar tu identidad y tu vehículo</strong>. Es un paso obligatorio para mantener la seguridad
        de toda la comunidad.</p>
        <p>Documentos que debes subir:</p>
        <ul>
          <li>DNI frontal</li>
          <li>DNI reverso</li>
          <li>Licencia de conducir vigente</li>
          <li>SOAT del vehículo</li>
          <li>Tarjeta de propiedad</li>
          <li>Revisión técnica (si tu vehículo tiene 5 años o más)</li>
          <li>Certificado único laboral</li>
        </ul>
        <p>Ingresa a tu cuenta y sube los documentos:</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/app/conductor/documentos""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Subir mis documentos
          </a>
        </p>
        <p>Nuestro equipo revisará tus documentos en 24 a 48 horas. Te enviaremos un correo cuando tu cuenta
        esté lista para recibir solicitudes.</p>
        <p style=""color:#888;font-size:0.85rem;margin-top:24px;"">
          <strong>Importante:</strong> hasta que tu cuenta sea aprobada, no podrás conectarte
          ni recibir solicitudes de viaje.
        </p>");

    // ─────────────────────────────────────────────────────────────────────
    // Activación del pasajero
    // ─────────────────────────────────────────────────────────────────────
    public static string AccountActivated(string fullName, string city) => Wrap(city,
        "Tu cuenta de Bugie está activa",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>¡Buenas noticias! Tu cuenta de <strong>{Brand}</strong> ha sido <strong>verificada y activada</strong>.</p>
        <p>Ya puedes solicitar viajes seguros con conductores verificados en {city}.</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/auth/login""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ingresar a Bugie
          </a>
        </p>
        <p>¡Gracias por confiar en nosotros para llegar a tu destino con seguridad!</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Rechazo de documentos (pasajero)
    // ─────────────────────────────────────────────────────────────────────
    public static string DocumentsRejected(string fullName, string? reason, string city) => Wrap(city,
        "Necesitamos que vuelvas a subir tus documentos",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Revisamos los documentos que subiste para verificar tu cuenta, pero <strong>algunos no cumplen con los requisitos</strong>.</p>
        {(string.IsNullOrWhiteSpace(reason) ? "" : $@"<p><strong>Motivo:</strong> {reason}</p>")}
        <p>Por favor ingresa nuevamente y vuelve a subirlos:</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/app/pasajero/verificacion""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Volver a subir documentos
          </a>
        </p>
        <p>Recuerda que el DNI debe estar legible, sin reflejos y con todas sus esquinas visibles.</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Recuperacion de contrasena: enlace de 1 hora, un solo uso
    // ─────────────────────────────────────────────────────────────────────
    public static string PasswordReset(string fullName, string token, string city) => Wrap(city,
        "Restablece tu contraseña",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de <strong>{Brand}</strong>.</p>
        <p>Haz clic en el botón para crear una nueva contraseña:</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/auth/restablecer?token={Uri.EscapeDataString(token)}""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Crear nueva contraseña
          </a>
        </p>
        <p><strong>Este enlace vence en 1 hora</strong> y solo se puede usar una vez.
        Si vence, solicita uno nuevo desde ""Olvidé mi contraseña"".</p>
        <p>Si tú no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Aviso: la contrasena se cambio
    // ─────────────────────────────────────────────────────────────────────
    public static string PasswordChanged(string fullName, string city) => Wrap(city,
        "Tu contraseña fue cambiada",
        $@"
        <p>Hola <strong>{fullName}</strong>,</p>
        <p>Te confirmamos que la contraseña de tu cuenta de <strong>{Brand}</strong> se cambió correctamente.</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/auth/login""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ingresar a Bugie
          </a>
        </p>
        <p>Si tú no hiciste este cambio, escríbenos de inmediato a soporte.</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Cuenta eliminada por el propio usuario
    // ─────────────────────────────────────────────────────────────────────
    public static string AccountDeleted(string fullName, string city) => Wrap(city,
        "Tu cuenta fue eliminada",
        $@"
        <p>Hola <strong>{System.Net.WebUtility.HtmlEncode(fullName)}</strong>,</p>
        <p>Te confirmamos que eliminaste tu cuenta de <strong>{Brand}</strong>. Ya no podrás iniciar sesión
        ni recibirás notificaciones.</p>
        <p>Si cambias de opinión, contacta a soporte y podremos recuperarla.</p>
        <p>Si tú no hiciste esta acción, escríbenos de inmediato a soporte.</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Cuenta restaurada por el admin
    // ─────────────────────────────────────────────────────────────────────
    public static string AccountRestored(string fullName, string city) => Wrap(city,
        "Tu cuenta fue restaurada",
        $@"
        <p>Hola <strong>{System.Net.WebUtility.HtmlEncode(fullName)}</strong>,</p>
        <p>Recuperamos tu cuenta de <strong>{Brand}</strong>. Ya puedes volver a iniciar sesión con tu correo
        y tu contraseña de siempre.</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/auth/login""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Ingresar a Bugie
          </a>
        </p>
        <p>Si no recuerdas tu contraseña, usa «Olvidé mi contraseña».</p>");

    // ─────────────────────────────────────────────────────────────────────
    // Aviso general (lo usan otros servicios vía /api/internal/notify/email,
    // ej. Trips: "recogimos tu paquete", "tu envío fue entregado").
    // ─────────────────────────────────────────────────────────────────────
    public static string Notification(string fullName, string title, string message, string city) => Wrap(city,
        System.Net.WebUtility.HtmlEncode(title),
        $@"
        <p>Hola <strong>{System.Net.WebUtility.HtmlEncode(fullName)}</strong>,</p>
        <p>{System.Net.WebUtility.HtmlEncode(message)}</p>
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{AppUrl}/auth/login""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            Abrir Bugie
          </a>
        </p>");

    // ─────────────────────────────────────────────────────────────────────
    // Aviso a un correo que no es usuario de Bugie (ej. contacto de
    // emergencia cuando su familiar activa un SOS). El botón es opcional:
    // si viene linkUrl (ej. Google Maps), se muestra con linkText.
    // ─────────────────────────────────────────────────────────────────────
    public static string NotificationWithLink(string toName, string title, string message,
        string? linkUrl, string? linkText, string city) => Wrap(city,
        System.Net.WebUtility.HtmlEncode(title),
        $@"
        <p>Hola <strong>{System.Net.WebUtility.HtmlEncode(toName)}</strong>,</p>
        <p style=""white-space:pre-line;"">{System.Net.WebUtility.HtmlEncode(message)}</p>
        {(string.IsNullOrWhiteSpace(linkUrl) ? "" : $@"
        <p style=""text-align:center;margin:30px 0;"">
          <a href=""{System.Net.WebUtility.HtmlEncode(linkUrl)}""
             style=""background:{Color};color:#fff;padding:12px 30px;border-radius:8px;
                    text-decoration:none;display:inline-block;font-weight:bold;"">
            {System.Net.WebUtility.HtmlEncode(linkText ?? "Abrir enlace")}
          </a>
        </p>")}");

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
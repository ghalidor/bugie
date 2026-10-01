using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Landing.Domain.Interfaces
{
    public interface IEmailService
    {
        /// <summary>
        /// Notificación al admin cuando un visitante envía el formulario
        /// público de contacto en la landing. Usa una plantilla HTML fija
        /// con los datos del remitente.
        /// </summary>
        Task SendContactEmailAsync(
            string fromName,
            string fromEmail,
            string subject,
            string message,
            CancellationToken ct = default);

        /// <summary>
        /// Envío genérico de un correo. Lo usa el flujo de RESPUESTAS:
        /// cuando el admin responde un mensaje desde el panel, mandamos
        /// el HTML editado al email del remitente original.
        ///
        /// Si SMTP falla, RELANZA la excepción para que el handler pueda
        /// guardar el ContactReply con Status='failed' + el mensaje de error.
        /// </summary>
        Task SendAsync(
            string toEmail,
            string toName,
            string subject,
            string htmlBody,
            CancellationToken ct = default);
    }

}
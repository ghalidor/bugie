using System.Globalization;
using System.Net;
using System.Text;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Application.Services;
using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Application.Email;

/// <summary>
/// Correos del Libro de Reclamaciones: confirmacion (copia de la hoja) y
/// respuesta. Cabecera con el logo y los datos de la empresa.
/// HTML con estilos en linea (los clientes de correo ignoran &lt;style&gt;).
/// El plazo es el de cada hoja (Complaint.ResponseDays), no el vigente.
/// </summary>
public static class ComplaintEmailTemplates
{
    private static string E(string? s) => WebUtility.HtmlEncode(s ?? "");
    private static string Multiline(string? s) => E(s).Replace("\r\n", "\n").Replace("\n", "<br>");

    public static string ConfirmationSubject(Complaint c) =>
        $"Hoja de reclamación {c.Code} registrada";

    public static string ResponseSubject(Complaint c) =>
        $"Respuesta a tu {(c.ComplaintType == "queja" ? "queja" : "reclamo")} {c.Code}";

    public static string Confirmation(Complaint c, CompanyInfoDto company, string? logoAbsUrl, string link)
    {
        var due = FormatDay(c.DueDate);
        var body = new StringBuilder();
        body.Append($"<p style='margin:0 0 12px'>Hola {E(c.ConsumerName)},</p>");
        body.Append($"<p style='margin:0 0 12px'>Registramos tu hoja de reclamación <strong>{E(c.Code)}</strong>. ");
        body.Append($"Te responderemos a este correo en un plazo máximo de {SpanishNumber.BusinessDays(c.ResponseDays)} ");
        body.Append($"(a más tardar el <strong>{E(due)}</strong>).</p>");
        body.Append(Button(link, "Consultar mi reclamación"));
        body.Append("<p style='margin:20px 0 8px;font-weight:700'>Copia de tu hoja de reclamación</p>");
        body.Append(Sheet(c));
        return Layout(company, logoAbsUrl, "Hoja de reclamación registrada", body.ToString(), c.ResponseDays);
    }

    public static string Response(Complaint c, CompanyInfoDto company, string? logoAbsUrl, string link)
    {
        var body = new StringBuilder();
        body.Append($"<p style='margin:0 0 12px'>Hola {E(c.ConsumerName)},</p>");
        body.Append($"<p style='margin:0 0 12px'>Esta es nuestra respuesta a tu hoja de reclamación <strong>{E(c.Code)}</strong>:</p>");
        body.Append("<div style='background:#f5f5ff;border-left:4px solid #5B5BD6;border-radius:6px;padding:14px 16px;margin:0 0 16px;line-height:1.6'>");
        body.Append(Multiline(c.Response));
        body.Append("</div>");
        body.Append(Button(link, "Ver mi reclamación"));
        body.Append("<p style='margin:20px 0 8px;font-weight:700'>Tu hoja de reclamación</p>");
        body.Append(Sheet(c));
        return Layout(company, logoAbsUrl, "Respuesta a tu reclamación", body.ToString(), c.ResponseDays);
    }

    // ── Piezas ──────────────────────────────────────────────────────────

    private static string Button(string link, string text) =>
        $"<p style='margin:16px 0'><a href='{E(link)}' style='display:inline-block;background:#5B5BD6;color:#fff;" +
        $"text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600'>{E(text)}</a></p>" +
        $"<p style='margin:0;font-size:12px;color:#666'>Si el botón no funciona, copia este enlace: {E(link)}</p>";

    /// <summary>Copia de la hoja en una tabla simple.</summary>
    private static string Sheet(Complaint c)
    {
        var rows = new List<(string, string)>
        {
            ("Número", E(c.Code)),
            ("Fecha", E(BugieTime.ToPeru(c.CreatedAt).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture))),
            ("Nombre completo", E(c.ConsumerName)),
            ("Domicilio", E(c.ConsumerAddress)),
            (c.DocType, E(c.DocNumber)),
            ("Teléfono", E(c.Phone)),
            ("E-mail", E(c.Email)),
        };
        if(!string.IsNullOrWhiteSpace(c.GuardianName))
            rows.Add(("Padre, madre o apoderado", E(c.GuardianName)));
        rows.Add(("Bien contratado", c.GoodType == "producto" ? "Producto" : "Servicio"));
        if(c.ClaimedAmount is not null)
            rows.Add(("Monto reclamado", "S/ " + c.ClaimedAmount.Value.ToString("0.00", CultureInfo.InvariantCulture)));
        if(!string.IsNullOrWhiteSpace(c.GoodDescription))
            rows.Add(("Descripción", E(c.GoodDescription)));
        rows.Add(("Tipo", c.ComplaintType == "queja" ? "Queja" : "Reclamo"));
        if(!string.IsNullOrWhiteSpace(c.TripCode))
            rows.Add(("Viaje o envío relacionado", E(c.TripCode)));
        if(!string.IsNullOrWhiteSpace(c.Reference))
            rows.Add(("Referencia", E(c.Reference)));
        rows.Add(("Detalle", Multiline(c.Detail)));
        rows.Add(("Pedido", Multiline(c.Request)));

        var sb = new StringBuilder("<table style='width:100%;border-collapse:collapse;font-size:13px'>");
        foreach(var (label, value) in rows)
        {
            sb.Append("<tr>");
            sb.Append($"<td style='padding:6px 8px;border:1px solid #e5e5ee;background:#fafafe;color:#555;width:36%;vertical-align:top'>{E(label)}</td>");
            sb.Append($"<td style='padding:6px 8px;border:1px solid #e5e5ee;vertical-align:top'>{value}</td>");
            sb.Append("</tr>");
        }
        sb.Append("</table>");
        return sb.ToString();
    }

    private static string Layout(CompanyInfoDto company, string? logoAbsUrl, string badge, string body, int responseDays)
    {
        var logo = string.IsNullOrWhiteSpace(logoAbsUrl)
            ? "<div style='font-size:26px;font-weight:800;color:#fff;letter-spacing:-.03em'>Bugie</div>"
            : $"<img src='{E(logoAbsUrl)}' alt='{E(company.LegalName)}' style='max-height:64px;max-width:200px;background:#fff;border-radius:10px;padding:6px'>";

        var companyLines = new StringBuilder($"<strong>{E(company.LegalName)}</strong>");
        if(company.Ruc.Length > 0) companyLines.Append($"<br>RUC {E(company.Ruc)}");
        if(company.Address.Length > 0) companyLines.Append($"<br>{E(company.Address)}");

        var contact = new List<string>();
        if(company.SupportEmail.Length > 0) contact.Add(E(company.SupportEmail));
        if(company.SupportPhone.Length > 0) contact.Add(E(company.SupportPhone));

        return string.Concat(
            "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'></head>",
            "<body style='margin:0;padding:0;background:#f2f2f7;font-family:Segoe UI,Arial,sans-serif;color:#222'>",
            "<div style='max-width:640px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e5ee'>",
            "<div style='background:linear-gradient(135deg,#5B5BD6 0%,#C060C0 100%);padding:24px;text-align:center'>",
            logo,
            $"<div style='display:inline-block;margin-top:12px;background:rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:4px 14px;font-size:12px'>Libro de Reclamaciones · {E(badge)}</div>",
            "</div>",
            $"<div style='padding:16px 24px;font-size:12px;color:#555;border-bottom:1px solid #eee'>{companyLines}</div>",
            $"<div style='padding:24px;font-size:14px;line-height:1.5'>{body}</div>",
            "<div style='padding:16px 24px;background:#fafafe;border-top:1px solid #eee;font-size:11px;color:#777;line-height:1.5'>",
            "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante INDECOPI.",
            $"<br>El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor de {SpanishNumber.BusinessDays(responseDays)}.",
            contact.Count > 0 ? $"<br><br>Contacto: {string.Join(" · ", contact)}" : "",
            "</div></div></body></html>");
    }

    private static string FormatDay(string yyyyMmDd) =>
        DateTime.TryParseExact(yyyyMmDd, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)
            : yyyyMmDd;
}

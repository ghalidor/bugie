using Bugie.Landing.Domain.Common;
using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Application.DTOs;

/// <summary>
/// Datos legales de la empresa (landing.systemsettings). ComplaintResponseDays:
/// plazo vigente (dias habiles) que se aplica a las hojas nuevas.
/// </summary>
public record CompanyInfoDto(
    string LegalName, string Ruc, string Address, string LogoUrl,
    string SupportEmail, string SupportPhone, string City, int ComplaintResponseDays);

/// <summary>Resultado de registrar una hoja de reclamacion.</summary>
public record CreateComplaintResult(
    string Code, string AccessToken, DateTime CreatedAt, string DueDate, bool EmailSent);

/// <summary>Hoja completa para el admin (incluye datos de atencion).</summary>
public record ComplaintAdminDto(
    Guid Id, string Code, DateTime CreatedAt,
    string ConsumerName, string ConsumerAddress, string DocType, string DocNumber,
    string Phone, string Email, string? GuardianName, Guid? UserId,
    string GoodType, decimal? ClaimedAmount, string? GoodDescription,
    string ComplaintType, Guid? TripId, string? TripCode, string? Reference,
    string Detail, string Request,
    string Status, string DueDate, int ResponseDays, int? DaysLeft, bool IsOverdue,
    string? Response, DateTime? RespondedAt, string? RespondedByName,
    bool ResponseEmailSent, bool ConfirmationEmailSent,
    bool IsBot, string? BotReason,
    string? ClosedReason, DateTime? ClosedAt, string? ClosedByName)
{
    public static ComplaintAdminDto From(Complaint c, DateTime today, BusinessDays calendar)
    {
        var due = DateTime.ParseExact(c.DueDate, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        // Un posible bot no corre plazo hasta que se marca como valido.
        var pending = c.Status == "pendiente" && !c.IsBot;
        int? left = pending ? calendar.Remaining(today, due) : null;
        return new ComplaintAdminDto(
            c.Id, c.Code, c.CreatedAt,
            c.ConsumerName, c.ConsumerAddress, c.DocType, c.DocNumber,
            c.Phone, c.Email, c.GuardianName, c.UserId,
            c.GoodType, c.ClaimedAmount, c.GoodDescription,
            c.ComplaintType, c.TripId, c.TripCode, c.Reference,
            c.Detail, c.Request,
            c.Status, c.DueDate, c.ResponseDays, left, pending && due < today,
            c.Response, c.RespondedAt, c.RespondedByName,
            c.ResponseEmailSent, c.ConfirmationEmailSent,
            c.IsBot, c.BotReason,
            c.ClosedReason, c.ClosedAt, c.ClosedByName);
    }
}

/// <summary>
/// Hoja para la consulta publica (codigo + token): sin datos internos.
/// Una anulada se ve "anulada" con su fecha, sin el motivo ni quien la anulo.
/// </summary>
public record ComplaintPublicDto(
    string Code, DateTime CreatedAt,
    string ConsumerName, string ConsumerAddress, string DocType, string DocNumber,
    string Phone, string Email, string? GuardianName,
    string GoodType, decimal? ClaimedAmount, string? GoodDescription,
    string ComplaintType, string? TripCode, string? Reference,
    string Detail, string Request,
    string Status, string DueDate, int ResponseDays, string? Response, DateTime? RespondedAt,
    DateTime? VoidedAt)
{
    public static ComplaintPublicDto From(Complaint c) => new(
        c.Code, c.CreatedAt,
        c.ConsumerName, c.ConsumerAddress, c.DocType, c.DocNumber,
        c.Phone, c.Email, c.GuardianName,
        c.GoodType, c.ClaimedAmount, c.GoodDescription,
        c.ComplaintType, c.TripCode, c.Reference,
        c.Detail, c.Request,
        // Descartada (posible bot) se ve como pendiente: no se revela la deteccion.
        c.Status == "descartada" ? "pendiente" : c.Status, c.DueDate, c.ResponseDays,
        c.Response, c.RespondedAt,
        c.Status == "anulada" ? c.ClosedAt : null);
}

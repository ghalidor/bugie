namespace Bugie.Landing.Domain.Entities;

/// <summary>
/// Hoja del Libro de Reclamaciones (formato Indecopi).
/// Numero correlativo por anio: LR-AAAA-NNNNNN.
/// Estado: 'pendiente' hasta que el admin responde; luego 'respondida' (cerrada).
/// Si llego con el campo trampa lleno queda IsBot = true (sin correos) hasta
/// que el admin la descarta ('descartada') o la marca como valida.
/// Una hoja pendiente (incluido posible bot) se puede anular ('anulada').
/// Anular y descartar exigen motivo y guardan quien y cuando (Closed*).
/// Nada se borra.
/// </summary>
public class Complaint
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public int Year { get; set; }
    public int Seq { get; set; }
    public DateTime CreatedAt { get; set; }

    // 1. Consumidor reclamante
    public string ConsumerName { get; set; } = "";
    public string ConsumerAddress { get; set; } = "";
    /// <summary>'DNI' | 'CE'</summary>
    public string DocType { get; set; } = "DNI";
    public string DocNumber { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    /// <summary>Si es menor de edad: padre, madre o apoderado.</summary>
    public string? GuardianName { get; set; }
    public Guid? UserId { get; set; }

    // 2. Bien contratado
    /// <summary>'producto' | 'servicio'</summary>
    public string GoodType { get; set; } = "servicio";
    public decimal? ClaimedAmount { get; set; }
    public string? GoodDescription { get; set; }

    // 3. Detalle
    /// <summary>'reclamo' | 'queja'</summary>
    public string ComplaintType { get; set; } = "reclamo";
    public Guid? TripId { get; set; }
    public string? TripCode { get; set; }
    public string? Reference { get; set; }
    public string Detail { get; set; } = "";
    public string Request { get; set; } = "";

    // Atencion
    /// <summary>'pendiente' | 'respondida' | 'descartada' | 'anulada'</summary>
    public string Status { get; set; } = "pendiente";
    /// <summary>Plazo de respuesta (dias habiles) vigente al registrarla o validarla.</summary>
    public int ResponseDays { get; set; } = 15;
    /// <summary>Fecha limite (dia de Peru, "yyyy-MM-dd").</summary>
    public string DueDate { get; set; } = "";
    public string? Response { get; set; }
    public DateTime? RespondedAt { get; set; }
    public Guid? RespondedBy { get; set; }
    public string? RespondedByName { get; set; }
    public bool ResponseEmailSent { get; set; }
    public bool ConfirmationEmailSent { get; set; }
    public string AccessToken { get; set; } = "";

    // Anti-bot (campo trampa del formulario publico)
    public bool IsBot { get; set; }
    public string? BotReason { get; set; }

    // Cierre sin respuesta: anulada o descartada (motivo interno, no se envia al cliente)
    public string? ClosedReason { get; set; }
    public DateTime? ClosedAt { get; set; }
    public Guid? ClosedBy { get; set; }
    public string? ClosedByName { get; set; }
}

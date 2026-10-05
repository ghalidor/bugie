using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Bugie.Trips.Domain.External {
    public record UserInfoDto(
        Guid Id,
        string FullName,
        string Email,
        string Phone,
        string Role,
        bool IsActive,
        bool IsVerified,
        DateTime CreatedAt,
        string? ProfilePhotoUrl = null,
        // Nombres separados (null en cuentas antiguas sin completar)
        string? FirstNames = null,
        string? LastNamePaternal = null);
}

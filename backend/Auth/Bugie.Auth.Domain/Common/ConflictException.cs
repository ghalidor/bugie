namespace Bugie.Auth.Domain.Common;

/// <summary>
/// Regla de negocio que choca con el estado actual (documento ya usado,
/// viaje en curso, deuda pendiente...). El middleware la devuelve como 409.
/// </summary>
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}

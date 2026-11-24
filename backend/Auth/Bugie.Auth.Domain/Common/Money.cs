using System.Globalization;

namespace Bugie.Auth.Domain.Common;

/// <summary>
/// Formato único de montos y porcentajes en los textos que ve el usuario
/// (push, bandeja, correos y mensajes): "S/ 1,250.00" y "10%".
/// Siempre con cultura invariante: no depende del idioma del servidor.
/// </summary>
public static class Money
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    /// <summary>"S/ 1,250.00"</summary>
    public static string Soles(decimal amount) => "S/ " + Amount(amount);

    /// <summary>"1,250.00" (sin el símbolo).</summary>
    public static string Amount(decimal amount) => amount.ToString("N2", Inv);

    /// <summary>"10%" o "12.5%".</summary>
    public static string Percent(decimal value) => value.ToString("#,0.##", Inv) + "%";
}

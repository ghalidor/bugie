using System.Security.Cryptography;

namespace Bugie.Rewards.Domain.Services;

/// <summary>
/// Genera el código de invitación. Sale algo como «ANA4K7MP».
///
/// Tres decisiones que importan:
///
///   · El PREFIJO viene del nombre del usuario, con el abecedario completo.
///     Es su propio nombre: lo reconoce y no se confunde al dictarlo. Si se
///     restringiera el alfabeto acá, «Óscar» quedaría como «CAR» y «Luis»
///     perdería casi todas sus letras.
///
///   · La parte ALEATORIA excluye los caracteres que se confunden al dictar
///     o escribir: O y 0, I y 1, L, S y 5. Ahí sí importa, porque nadie puede
///     deducirlos por contexto.
///
///   · Cinco caracteres al azar dan 20 millones de combinaciones por nombre.
///     Con cuatro eran 707 mil, y en una prueba de 100 000 códigos del mismo
///     nombre chocaban el 6.8%. Con cinco baja a menos del 0.3%.
/// </summary>
public static class ReferralCodeGenerator
{
    /// <summary>Para la parte aleatoria: sin caracteres que se confundan.</summary>
    private const string Alphabet = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

    /// <summary>Para el prefijo: abecedario completo, es el nombre del usuario.</summary>
    private const string NameLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    /// <summary>
    /// Código a partir del nombre. Si no hay nombre usable, sale uno
    /// completamente al azar.
    /// </summary>
    public static string Generate(string? fullName, int randomLength = 5)
    {
        var prefijo = Prefix(fullName);
        var sufijo  = Random(randomLength);
        return prefijo + sufijo;
    }

    /// <summary>Hasta 3 letras del primer nombre, en mayúsculas y sin tildes.</summary>
    private static string Prefix(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return Random(3);

        var limpio = new string(fullName
            .Trim()
            .Split(' ')[0]
            .Select(Normalize)
            .Where(c => NameLetters.Contains(c))
            .ToArray());

        return limpio.Length >= 3 ? limpio[..3]
             : limpio.Length > 0  ? limpio + Random(3 - limpio.Length)
             : Random(3);
    }

    /// <summary>Quita tildes y pasa a mayúscula.</summary>
    private static char Normalize(char c) => char.ToUpperInvariant(c) switch
    {
        'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ñ' => 'N',
        var x => x,
    };

    private static string Random(int length)
    {
        if (length <= 0) return string.Empty;
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }
}

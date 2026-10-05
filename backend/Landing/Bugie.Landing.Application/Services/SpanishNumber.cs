namespace Bugie.Landing.Application.Services;

/// <summary>
/// Numeros en letras para los textos legales ("quince (15) dias habiles").
/// Forma que va delante de un sustantivo masculino: "un", "veintiún",
/// "treinta y un" (un dia, veintiún dias). Cubre de 0 a 999; fuera de
/// ese rango devuelve la cifra.
/// </summary>
public static class SpanishNumber
{
    private static readonly string[] UpTo29 =
    [
        "cero", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
        "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
        "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
    ];

    private static readonly string[] Tens =
        ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];

    private static readonly string[] Hundreds =
        ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
         "seiscientos", "setecientos", "ochocientos", "novecientos"];

    public static string Words(int n)
    {
        if(n < 0 || n > 999) return n.ToString();
        if(n < 30) return UpTo29[n];
        if(n < 100) return n % 10 == 0 ? Tens[n / 10] : $"{Tens[n / 10]} y {UpTo29[n % 10]}";
        if(n == 100) return "cien";
        return n % 100 == 0 ? Hundreds[n / 100] : $"{Hundreds[n / 100]} {Words(n % 100)}";
    }

    /// <summary>"quince (15) días hábiles" / "un (1) día hábil".</summary>
    public static string BusinessDays(int n) =>
        $"{Words(n)} ({n}) {(n == 1 ? "día hábil" : "días hábiles")}";
}

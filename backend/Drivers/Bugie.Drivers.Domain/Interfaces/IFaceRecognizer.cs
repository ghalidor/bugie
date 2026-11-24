namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>
/// Reconocimiento facial intercambiable: obtiene la "huella facial" (vector)
/// de una foto y compara dos huellas.
///
/// La implementación actual (Infrastructure/FaceRecognition/SFaceRecognizer)
/// usa los modelos gratuitos de OpenCV Zoo (YuNet + SFace) con ONNX Runtime.
/// Para cambiar de motor (InsightFace, un servicio en la nube, etc.) basta
/// otra implementación registrada en Program.cs: la app y las pantallas no cambian.
///
/// Las huellas de motores distintos NO se comparan entre sí: cada huella se
/// guarda junto al ModelName con que se calculó.
/// </summary>
public interface IFaceRecognizer
{
    /// <summary>Nombre del motor/modelo (se guarda junto a cada huella).</summary>
    string ModelName { get; }

    /// <summary>
    /// Umbral recomendado del modelo: similitud a partir de la cual se considera
    /// la misma persona (SFace: 0.363 de similitud coseno).
    /// </summary>
    double DefaultThreshold { get; }

    /// <summary>
    /// Detecta la cara principal de la foto (JPG/PNG/WEBP), la alinea y devuelve
    /// su huella. Nunca lanza excepción: si no hay cara, la imagen no se puede
    /// leer o faltan los modelos, devuelve el error en el resultado.
    /// </summary>
    Task<FaceEmbeddingResult> GetEmbeddingAsync(byte[] image, CancellationToken ct = default);

    /// <summary>Similitud entre dos huellas del mismo modelo (coseno, de -1 a 1).</summary>
    double Compare(float[] a, float[] b);
}

/// <summary>Motivo por el que no se obtuvo la huella.</summary>
public enum FaceErrorKind
{
    /// <summary>No se detectó ningún rostro en la foto.</summary>
    NoFace,
    /// <summary>La imagen no se pudo leer.</summary>
    InvalidImage,
    /// <summary>Faltan los modelos o no se pudieron cargar.</summary>
    ModelUnavailable,
    /// <summary>Error inesperado del motor.</summary>
    Failure,
}

/// <summary>Huella facial (Embedding) o el motivo por el que no se obtuvo.</summary>
public sealed record FaceEmbeddingResult(float[]? Embedding, FaceErrorKind? ErrorKind, string? Error)
{
    public bool Success => Embedding is not null;

    public static FaceEmbeddingResult Ok(float[] embedding) => new(embedding, null, null);
    public static FaceEmbeddingResult Fail(FaceErrorKind kind, string error) => new(null, kind, error);
}

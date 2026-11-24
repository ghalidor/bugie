using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using SkiaSharp;

namespace Bugie.Drivers.Infrastructure.FaceRecognition;

/// <summary>appsettings: sección "FaceRecognition".</summary>
public class FaceRecognitionOptions
{
    /// <summary>Carpeta con los .onnx (script backend/scripts/descargar_modelos_faciales.ps1).</summary>
    public string ModelsPath { get; set; } = "C:/bugie-models";
    public string DetectorModel { get; set; } = "face_detection_yunet_2023mar.onnx";
    public string RecognizerModel { get; set; } = "face_recognition_sface_2021dec.onnx";
    /// <summary>Confianza mínima de YuNet para aceptar una cara (0-1).</summary>
    public float DetectionScoreThreshold { get; set; } = 0.7f;
    /// <summary>Hilos por inferencia (0 = los que decida ONNX Runtime).</summary>
    public int IntraOpThreads { get; set; } = 2;
}

/// <summary>
/// Huella facial con los modelos de OpenCV Zoo, igual que
/// cv::FaceDetectorYN + cv::FaceRecognizerSF:
///
///  1. YuNet (entrada fija 1x3x640x640, BGR, 0-255 sin normalizar): la foto se
///     escala para que su lado mayor mida 640 y se rellena con negro abajo y a la
///     derecha. Salidas cls/obj/bbox/kps por stride 8, 16 y 32 (sin anchors:
///     cada celda de la grilla es un punto). score = sqrt(cls * obj).
///  2. Alineación: transformación de similitud (mínimos cuadrados, como
///     getSimilarityTransformMatrix) de los 5 puntos (ojo der., ojo izq., nariz,
///     comisura der., comisura izq.) a la plantilla 112x112 de SFace, y
///     warpAffine con interpolación bilineal (SKCanvas con la matriz de la similitud).
///  3. SFace (entrada 1x3x112x112, RGB, 0-255 sin normalizar): vector de 128
///     que se normaliza (largo 1). Comparación: similitud coseno.
///
/// Singleton thread-safe: los modelos se cargan la primera vez que se usan
/// (InferenceSession.Run admite llamadas concurrentes). Si faltan los modelos
/// se registra un warning y se reintenta cada 5 minutos.
/// </summary>
public sealed class SFaceRecognizer : IFaceRecognizer, IDisposable
{
    public const string Model = "opencv-sface-2021dec";

    private const int DetSize = 640;
    private const int AlignSize = 112;
    private const int MaxDecodeSide = 1280;
    private const float NmsThreshold = 0.3f;
    private static readonly int[] Strides = { 8, 16, 32 };

    // Plantilla de SFace (cv::FaceRecognizerSF::alignCrop).
    private static readonly float[] TemplateX = { 38.2946f, 73.5318f, 56.0252f, 41.5493f, 70.7299f };
    private static readonly float[] TemplateY = { 51.6963f, 51.5014f, 71.7366f, 92.3655f, 92.2041f };

    // Reducción de tamaño promediando (mipmaps), equivalente al filtro triangular de antes.
    private static readonly SKSamplingOptions Downscale = new(SKFilterMode.Linear, SKMipmapMode.Linear);
    // Bilineal simple, como cv::warpAffine con INTER_LINEAR.
    private static readonly SKSamplingOptions Bilinear = new(SKFilterMode.Linear, SKMipmapMode.None);

    private readonly FaceRecognitionOptions _opt;
    private readonly ILogger<SFaceRecognizer> _log;
    private readonly object _loadLock = new();
    private volatile InferenceSession? _detector;
    private volatile InferenceSession? _recognizer;
    private string _detectorInput = "input";
    private string _recognizerInput = "data";
    private DateTime _retryAfterUtc = DateTime.MinValue;
    private bool _disposed;

    public SFaceRecognizer(IOptions<FaceRecognitionOptions> opt, ILogger<SFaceRecognizer> log)
    {
        _opt = opt.Value;
        _log = log;
    }

    public string ModelName => Model;
    public double DefaultThreshold => 0.363;

    public Task<FaceEmbeddingResult> GetEmbeddingAsync(byte[] image, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        try
        {
            return Task.FromResult(Extract(image));
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "Reconocimiento facial: error inesperado al procesar la foto.");
            return Task.FromResult(FaceEmbeddingResult.Fail(FaceErrorKind.Failure, "Error del reconocimiento facial."));
        }
    }

    public double Compare(float[] a, float[] b)
    {
        if(a.Length == 0 || a.Length != b.Length) return 0;
        double dot = 0, na = 0, nb = 0;
        for(var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if(na == 0 || nb == 0) return 0;
        return Math.Clamp(dot / (Math.Sqrt(na) * Math.Sqrt(nb)), -1, 1);
    }

    // ── Proceso ──────────────────────────────────────────────────────────

    private FaceEmbeddingResult Extract(byte[] bytes)
    {
        if(!EnsureLoaded(out var detector, out var recognizer))
            return FaceEmbeddingResult.Fail(FaceErrorKind.ModelUnavailable,
                "Los modelos de reconocimiento facial no están disponibles.");

        using var img = Decode(bytes);
        if(img is null)
            return FaceEmbeddingResult.Fail(FaceErrorKind.InvalidImage, "No se pudo leer la imagen.");

        var face = Detect(detector, img);
        if(face is null)
            return FaceEmbeddingResult.Fail(FaceErrorKind.NoFace, "No se detectó un rostro en la foto.");

        var aligned = AlignCrop(img, face.Landmarks);
        var embedding = Embed(recognizer, aligned);
        return FaceEmbeddingResult.Ok(embedding);
    }

    /// <summary>
    /// Decodifica JPG, PNG o WEBP (los mismos que acepta la subida de archivos) a
    /// RGBA opaco, con la orientación EXIF aplicada y el lado mayor en
    /// MaxDecodeSide como máximo. Null si no es una imagen válida.
    /// </summary>
    private static SKBitmap? Decode(byte[] bytes)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        if(codec is null || codec.EncodedFormat is not (SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Png or SKEncodedImageFormat.Webp))
            return null;

        // Fotos muy grandes: se decodifican ya reducidas a 1/2, 1/4 o 1/8 (escala DCT del
        // JPG) sin bajar de MaxDecodeSide; el ajuste fino se hace después en Orient.
        var size = codec.Info.Size;
        var longSide = Math.Max(size.Width, size.Height);
        var factor = 1;
        while(factor < 8 && longSide / (factor * 2) >= MaxDecodeSide) factor *= 2;
        if(factor > 1) size = codec.GetScaledDimensions(1f / factor);

        // Sin espacio de color: valores tal como vienen en el archivo (sin conversión ICC).
        var opaque = codec.Info.AlphaType == SKAlphaType.Opaque;
        var info = new SKImageInfo(size.Width, size.Height, SKColorType.Rgba8888,
            opaque ? SKAlphaType.Opaque : SKAlphaType.Unpremul);
        using var raw = new SKBitmap(info);
        if(raw.GetPixels() == IntPtr.Zero) return null;
        var result = codec.GetPixels(info, raw.GetPixels());
        if(result is not (SKCodecResult.Success or SKCodecResult.IncompleteInput)) return null;

        // PNG/WEBP con transparencia: se ignora el canal alfa (se conserva el color).
        if(!opaque)
        {
            var px = raw.GetPixelSpan();
            for(var i = 3; i < px.Length; i += 4) px[i] = 255;
        }

        return Orient(raw, codec.EncodedOrigin);
    }

    /// <summary>
    /// Copia la foto aplicando la orientación EXIF (fotos de celular) y, si su lado
    /// mayor pasa de MaxDecodeSide, la reduce manteniendo la proporción.
    /// </summary>
    private static SKBitmap Orient(SKBitmap src, SKEncodedOrigin origin)
    {
        float w = src.Width, h = src.Height;
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var ow = swap ? h : w;
        var oh = swap ? w : h;

        // x' = ScaleX·x + SkewX·y + TransX ; y' = SkewY·x + ScaleY·y + TransY
        var m = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix { ScaleX = -1, TransX = w, ScaleY = 1, Persp2 = 1 },
            SKEncodedOrigin.BottomRight => new SKMatrix { ScaleX = -1, TransX = w, ScaleY = -1, TransY = h, Persp2 = 1 },
            SKEncodedOrigin.BottomLeft => new SKMatrix { ScaleX = 1, ScaleY = -1, TransY = h, Persp2 = 1 },
            SKEncodedOrigin.LeftTop => new SKMatrix { SkewX = 1, SkewY = 1, Persp2 = 1 },
            SKEncodedOrigin.RightTop => new SKMatrix { SkewX = -1, TransX = h, SkewY = 1, Persp2 = 1 },
            SKEncodedOrigin.RightBottom => new SKMatrix { SkewX = -1, TransX = h, SkewY = -1, TransY = w, Persp2 = 1 },
            SKEncodedOrigin.LeftBottom => new SKMatrix { SkewX = 1, SkewY = -1, TransY = w, Persp2 = 1 },
            _ => SKMatrix.Identity,
        };

        var ratio = Math.Min(1f, MaxDecodeSide / Math.Max(ow, oh));
        var dw = Math.Max(1, (int)MathF.Round(ow * ratio));
        var dh = Math.Max(1, (int)MathF.Round(oh * ratio));
        m = m.PostConcat(SKMatrix.CreateScale(dw / ow, dh / oh));

        var dst = new SKBitmap(new SKImageInfo(dw, dh, SKColorType.Rgba8888, SKAlphaType.Opaque));
        using(var canvas = new SKCanvas(dst))
        {
            canvas.Clear(SKColors.Black);
            canvas.SetMatrix(m);
            // Sin reducción es una permutación exacta de píxeles (vecino más cercano).
            canvas.DrawBitmap(src, 0, 0, ratio < 1 ? Downscale : new SKSamplingOptions(SKFilterMode.Nearest));
        }
        return dst;
    }

    private sealed record FaceBox(float X, float Y, float W, float H, float Score, float[] Landmarks);

    /// <summary>YuNet: cara principal (la más grande tras NMS) en coordenadas de la imagen.</summary>
    private FaceBox? Detect(InferenceSession detector, SKBitmap img)
    {
        var w = img.Width;
        var h = img.Height;
        var scale = (float)DetSize / Math.Max(w, h);
        var dw = Math.Clamp((int)Math.Round(w * scale), 1, DetSize);
        var dh = Math.Clamp((int)Math.Round(h * scale), 1, DetSize);

        // Foto escalada arriba a la izquierda; el resto (relleno) queda en negro.
        using var small = new SKBitmap(new SKImageInfo(DetSize, DetSize, SKColorType.Rgba8888, SKAlphaType.Opaque));
        using(var canvas = new SKCanvas(small))
        {
            canvas.Clear(SKColors.Black);
            canvas.DrawBitmap(img, new SKRect(0, 0, dw, dh), Downscale);
        }

        // NCHW, BGR, 0-255.
        const int plane = DetSize * DetSize;
        var data = new float[3 * plane];
        var px = small.GetPixelSpan();
        var rowBytes = small.RowBytes;
        for(var y = 0; y < dh; y++)
        {
            for(var x = 0; x < dw; x++)
            {
                var o = y * rowBytes + x * 4;
                var i = y * DetSize + x;
                data[i] = px[o + 2];
                data[plane + i] = px[o + 1];
                data[2 * plane + i] = px[o];
            }
        }

        var input = new DenseTensor<float>(data, new[] { 1, 3, DetSize, DetSize });
        using var results = detector.Run(new[] { NamedOnnxValue.CreateFromTensor(_detectorInput, input) });
        var outputs = results.ToDictionary(r => r.Name, r => r.AsTensor<float>().ToArray());

        var faces = new List<FaceBox>();
        var thr = _opt.DetectionScoreThreshold;
        foreach(var stride in Strides)
        {
            if(!outputs.TryGetValue($"cls_{stride}", out var cls)
               || !outputs.TryGetValue($"obj_{stride}", out var obj)
               || !outputs.TryGetValue($"bbox_{stride}", out var bbox)
               || !outputs.TryGetValue($"kps_{stride}", out var kps))
                throw new InvalidOperationException($"El modelo YuNet no tiene las salidas esperadas (stride {stride}).");

            var cols = DetSize / stride;
            var rows = DetSize / stride;
            for(var r = 0; r < rows; r++)
            {
                for(var c = 0; c < cols; c++)
                {
                    var idx = r * cols + c;
                    var score = MathF.Sqrt(Math.Clamp(cls[idx], 0f, 1f) * Math.Clamp(obj[idx], 0f, 1f));
                    if(score < thr) continue;

                    var cx = (c + bbox[idx * 4 + 0]) * stride;
                    var cy = (r + bbox[idx * 4 + 1]) * stride;
                    var bw = MathF.Exp(bbox[idx * 4 + 2]) * stride;
                    var bh = MathF.Exp(bbox[idx * 4 + 3]) * stride;

                    var lm = new float[10];
                    for(var n = 0; n < 5; n++)
                    {
                        lm[2 * n] = (kps[idx * 10 + 2 * n] + c) * stride / scale;
                        lm[2 * n + 1] = (kps[idx * 10 + 2 * n + 1] + r) * stride / scale;
                    }
                    faces.Add(new FaceBox((cx - bw / 2) / scale, (cy - bh / 2) / scale, bw / scale, bh / scale, score, lm));
                }
            }
        }

        // NMS y, de las que quedan, la más grande (la persona de la selfie).
        var kept = new List<FaceBox>();
        foreach(var f in faces.OrderByDescending(f => f.Score))
        {
            if(kept.All(k => IoU(k, f) <= NmsThreshold)) kept.Add(f);
        }
        return kept.OrderByDescending(f => f.W * f.H).FirstOrDefault();
    }

    private static float IoU(FaceBox a, FaceBox b)
    {
        var x1 = Math.Max(a.X, b.X);
        var y1 = Math.Max(a.Y, b.Y);
        var x2 = Math.Min(a.X + a.W, b.X + b.W);
        var y2 = Math.Min(a.Y + a.H, b.Y + b.H);
        var inter = Math.Max(0, x2 - x1) * Math.Max(0, y2 - y1);
        var union = a.W * a.H + b.W * b.H - inter;
        return union <= 0 ? 0 : inter / union;
    }

    /// <summary>
    /// Recorte alineado de 112x112 (RGB). Similitud por mínimos cuadrados de los
    /// 5 puntos a la plantilla y muestreo bilineal (fuera de la foto = negro).
    /// </summary>
    private static float[] AlignCrop(SKBitmap img, float[] lm)
    {
        double msx = 0, msy = 0, mdx = 0, mdy = 0;
        for(var i = 0; i < 5; i++)
        {
            msx += lm[2 * i]; msy += lm[2 * i + 1];
            mdx += TemplateX[i]; mdy += TemplateY[i];
        }
        msx /= 5; msy /= 5; mdx /= 5; mdy /= 5;

        double den = 0, sa = 0, sb = 0;
        for(var i = 0; i < 5; i++)
        {
            var x = lm[2 * i] - msx;
            var y = lm[2 * i + 1] - msy;
            var u = TemplateX[i] - mdx;
            var v = TemplateY[i] - mdy;
            den += x * x + y * y;
            sa += x * u + y * v;
            sb += x * v - y * u;
        }
        if(den < 1e-6) den = 1e-6;
        var a = sa / den;
        var b = sb / den;
        // dst = [a -b; b a] * src + t
        var tx = mdx - (a * msx - b * msy);
        var ty = mdy - (b * msx + a * msy);

        // Skia ubica el centro del píxel i en i+0.5 (OpenCV en i): se corre medio píxel
        // antes y después de la transformación para que el resultado sea el mismo.
        var m = new SKMatrix
        {
            ScaleX = (float)a, SkewX = (float)-b, TransX = (float)(tx + 0.5 - 0.5 * a + 0.5 * b),
            SkewY = (float)b, ScaleY = (float)a, TransY = (float)(ty + 0.5 - 0.5 * b - 0.5 * a),
            Persp2 = 1,
        };

        using var crop = new SKBitmap(new SKImageInfo(AlignSize, AlignSize, SKColorType.Rgba8888, SKAlphaType.Opaque));
        using(var canvas = new SKCanvas(crop))
        {
            canvas.Clear(SKColors.Black);
            canvas.SetMatrix(m);
            canvas.DrawBitmap(img, 0, 0, Bilinear);
        }

        // NCHW, RGB, 0-255.
        const int plane = AlignSize * AlignSize;
        var data = new float[3 * plane];
        var px = crop.GetPixelSpan();
        var rowBytes = crop.RowBytes;
        for(var y = 0; y < AlignSize; y++)
        {
            for(var x = 0; x < AlignSize; x++)
            {
                var o = y * rowBytes + x * 4;
                var i = y * AlignSize + x;
                data[i] = px[o];
                data[plane + i] = px[o + 1];
                data[2 * plane + i] = px[o + 2];
            }
        }
        return data;
    }

    /// <summary>SFace: vector de 128 normalizado (largo 1).</summary>
    private float[] Embed(InferenceSession recognizer, float[] aligned)
    {
        var input = new DenseTensor<float>(aligned, new[] { 1, 3, AlignSize, AlignSize });
        using var results = recognizer.Run(new[] { NamedOnnxValue.CreateFromTensor(_recognizerInput, input) });
        var v = results.First().AsTensor<float>().ToArray();
        double norm = 0;
        foreach(var x in v) norm += x * x;
        norm = Math.Sqrt(norm);
        if(norm > 0)
        {
            for(var i = 0; i < v.Length; i++) v[i] = (float)(v[i] / norm);
        }
        return v;
    }

    // ── Carga perezosa de los modelos ────────────────────────────────────

    private bool EnsureLoaded(out InferenceSession detector, out InferenceSession recognizer)
    {
        detector = _detector!;
        recognizer = _recognizer!;
        if(_detector is not null && _recognizer is not null) return true;

        lock(_loadLock)
        {
            if(_disposed) return false;
            if(_detector is null || _recognizer is null)
            {
                if(DateTime.UtcNow < _retryAfterUtc) return false;

                var detPath = Path.Combine(_opt.ModelsPath, _opt.DetectorModel);
                var recPath = Path.Combine(_opt.ModelsPath, _opt.RecognizerModel);
                try
                {
                    if(!File.Exists(detPath) || !File.Exists(recPath))
                        throw new FileNotFoundException(
                            $"Faltan los modelos de reconocimiento facial: {detPath} y/o {recPath}. " +
                            "Ejecuta backend/scripts/descargar_modelos_faciales.ps1 o revisa FaceRecognition:ModelsPath.");

                    var so = new SessionOptions
                    {
                        LogSeverityLevel = OrtLoggingLevel.ORT_LOGGING_LEVEL_ERROR,
                        GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
                    };
                    if(_opt.IntraOpThreads > 0) so.IntraOpNumThreads = _opt.IntraOpThreads;

                    var det = new InferenceSession(detPath, so);
                    var rec = new InferenceSession(recPath, so);
                    // SFace expone sus pesos como entradas: la imagen es la única de 4 dimensiones.
                    _detectorInput = det.InputMetadata.First(kv => kv.Value.Dimensions.Length == 4).Key;
                    _recognizerInput = rec.InputMetadata.First(kv => kv.Value.Dimensions.Length == 4).Key;
                    _detector = det;
                    _recognizer = rec;
                    _log.LogInformation("Reconocimiento facial: modelos cargados desde {Path}.", _opt.ModelsPath);
                }
                catch(Exception ex)
                {
                    _retryAfterUtc = DateTime.UtcNow.AddMinutes(5);
                    _log.LogWarning("Reconocimiento facial NO disponible (se reintenta en 5 min): {Error}", ex.Message);
                    return false;
                }
            }
            detector = _detector;
            recognizer = _recognizer;
            return true;
        }
    }

    public void Dispose()
    {
        lock(_loadLock)
        {
            _disposed = true;
            _detector?.Dispose();
            _recognizer?.Dispose();
            _detector = null;
            _recognizer = null;
        }
    }
}

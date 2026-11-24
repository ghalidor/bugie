# =====================================================================
# Descarga los modelos de verificacion facial (OpenCV Zoo) - 2026-10-08
#
#   YuNet  : face_detection_yunet_2023mar.onnx   (detecta la cara y 5 puntos)
#   SFace  : face_recognition_sface_2021dec.onnx (huella facial de 128 valores)
#
# Origen: repositorio oficial https://github.com/opencv/opencv_zoo
# (YuNet: MIT, SFace: Apache-2.0). No se suben al repo (*.onnx en .gitignore).
#
# Uso (PowerShell):
#   powershell -ExecutionPolicy Bypass -File backend\scripts\descargar_modelos_faciales.ps1
#   powershell -ExecutionPolicy Bypass -File backend\scripts\descargar_modelos_faciales.ps1 -Carpeta D:\modelos
#
# La carpeta debe ser la misma que "FaceRecognition:ModelsPath" en el
# appsettings.json de Bugie.Drivers.Api (por defecto C:/bugie-models).
# Si un archivo ya existe y tiene el tamano esperado, no se vuelve a bajar.
# =====================================================================
param(
    [string]$Carpeta = "C:/bugie-models"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Los .onnx del repo estan en Git LFS: esta es la URL directa del archivo.
$base = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models"
$modelos = @(
    @{ Nombre = "face_detection_yunet_2023mar.onnx";   Url = "$base/face_detection_yunet/face_detection_yunet_2023mar.onnx";   MinBytes = 200KB },
    @{ Nombre = "face_recognition_sface_2021dec.onnx"; Url = "$base/face_recognition_sface/face_recognition_sface_2021dec.onnx"; MinBytes = 30MB }
)

New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null

foreach ($m in $modelos) {
    $destino = Join-Path $Carpeta $m.Nombre
    if ((Test-Path $destino) -and ((Get-Item $destino).Length -ge $m.MinBytes)) {
        Write-Host "Ya existe: $destino"
        continue
    }
    Write-Host "Descargando $($m.Nombre)..."
    $tmp = "$destino.part"
    Invoke-WebRequest -Uri $m.Url -OutFile $tmp -UseBasicParsing
    $len = (Get-Item $tmp).Length
    if ($len -lt $m.MinBytes) {
        Remove-Item $tmp -Force
        throw "El archivo $($m.Nombre) llego incompleto ($len bytes). Revisa la conexion y vuelve a intentar."
    }
    Move-Item -Force $tmp $destino
    Write-Host ("  OK: {0} ({1:N1} MB)" -f $destino, ($len / 1MB))
}

Write-Host ""
Write-Host "Modelos listos en $Carpeta"
Get-ChildItem $Carpeta -Filter *.onnx | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    Write-Host ("  {0}  {1:N0} bytes  SHA256 {2}" -f $_.Name, $_.Length, $hash)
}

# =====================================================================
# Genera las imagenes de prueba que sube seed.mjs (PNG reconocibles).
# Uso: powershell -File generar_imagenes.ps1 <manifiesto.json> <carpeta_salida>
#
# Cada elemento del manifiesto: { file, kind, title, subtitle, initials, color }
#   kind = avatar | card | vehicle | vehicle_side | vehicle_plate | package | photo
#   (vehicle = auto de frente; vehicle_side = de costado; vehicle_plate = la placa)
# =====================================================================
param([string]$Manifest, [string]$OutDir)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$items = Get-Content -Raw -Encoding UTF8 $Manifest | ConvertFrom-Json

# Acepta #RRGGBB o #RRGGBBAA (con transparencia)
function Brush($hex) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex.Substring(0, [Math]::Min(7, $hex.Length)))
  if ($hex.Length -eq 9) { $c = [System.Drawing.Color]::FromArgb([Convert]::ToInt32($hex.Substring(7, 2), 16), $c) }
  New-Object System.Drawing.SolidBrush $c
}
function Font($size, $bold) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  New-Object System.Drawing.Font('Segoe UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}
function Centered { $f = New-Object System.Drawing.StringFormat; $f.Alignment = 'Center'; $f.LineAlignment = 'Center'; $f }
function Rect($x, $y, $w, $h) { New-Object System.Drawing.RectangleF($x, $y, $w, $h) }

$white = Brush '#FFFFFF'; $dark = Brush '#1F2937'; $gray = Brush '#6B7280'

foreach ($it in $items) {
  $kind = $it.kind
  switch ($kind) {
    'avatar'  { $w = 400; $h = 400 }
    'card'    { $w = 640; $h = 400 }
    'vehicle' { $w = 640; $h = 400 }
    'vehicle_side'  { $w = 640; $h = 400 }
    'vehicle_plate' { $w = 640; $h = 400 }
    default   { $w = 640; $h = 480 }
  }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
  $color = Brush $it.color

  switch ($kind) {
    'avatar' {
      # Fondo de color con iniciales grandes y el nombre abajo
      $g.FillRectangle($color, 0, 0, $w, $h)
      $g.FillEllipse((Brush '#FFFFFF33'), 60, 40, 280, 280)
      $g.DrawString($it.initials, (Font 130 $true), $white, (Rect 0 40 $w 280), (Centered))
      $g.DrawString($it.title, (Font 26 $true), $white, (Rect 0 330 $w 50), (Centered))
    }
    'card' {
      # Documento: tarjeta blanca, cabecera de color con el tipo, foto con iniciales y datos
      $g.FillRectangle((Brush '#E5E7EB'), 0, 0, $w, $h)
      $g.FillRectangle($white, 20, 20, $w - 40, $h - 40)
      $g.FillRectangle($color, 20, 20, $w - 40, 70)
      $g.DrawString($it.title, (Font 32 $true), $white, (Rect 20 20 ($w - 40) 70), (Centered))
      $g.FillRectangle($color, 50, 120, 150, 190)
      $g.DrawString($it.initials, (Font 60 $true), $white, (Rect 50 120 150 190), (Centered))
      $g.DrawString('Nombre', (Font 18 $false), $gray, 230, 125)
      $g.DrawString($it.subtitle, (Font 26 $true), $dark, (Rect 230 150 380 70))
      $g.DrawString('N.' + ' ' + $it.extra, (Font 22 $false), $dark, 230, 235)
      $g.DrawString('DOCUMENTO DE PRUEBA - BUGIE', (Font 18 $true), (Brush '#DC2626'), (Rect 20 320 ($w - 40) 50), (Centered))
    }
    'vehicle' {
      # Auto simple del color del vehiculo, con la placa
      $g.FillRectangle((Brush '#BFDBFE'), 0, 0, $w, 260)
      $g.FillRectangle((Brush '#9CA3AF'), 0, 260, $w, $h - 260)
      $g.FillRectangle($color, 190, 120, 260, 80)
      $g.FillRectangle($color, 110, 180, 420, 90)
      $g.FillRectangle((Brush '#93C5FD'), 215, 135, 95, 55)
      $g.FillRectangle((Brush '#93C5FD'), 330, 135, 95, 55)
      $g.FillEllipse($dark, 150, 240, 80, 80); $g.FillEllipse($dark, 410, 240, 80, 80)
      $g.FillRectangle($white, 270, 225, 100, 32)
      $g.DrawString($it.extra, (Font 20 $true), $dark, (Rect 270 225 100 32), (Centered))
      $g.DrawString($it.title, (Font 28 $true), $dark, (Rect 0 20 $w 50), (Centered))
      $g.DrawString($it.subtitle, (Font 22 $false), $white, (Rect 0 340 $w 50), (Centered))
    }
    'vehicle_side' {
      # Auto de costado (perfil) del color del vehiculo
      $g.FillRectangle((Brush '#BFDBFE'), 0, 0, $w, 260)
      $g.FillRectangle((Brush '#9CA3AF'), 0, 260, $w, $h - 260)
      $g.FillRectangle($color, 200, 120, 230, 70)
      $g.FillRectangle($color, 70, 180, 500, 80)
      $g.FillRectangle((Brush '#93C5FD'), 220, 132, 90, 50)
      $g.FillRectangle((Brush '#93C5FD'), 320, 132, 90, 50)
      $g.FillEllipse($dark, 120, 225, 80, 80); $g.FillEllipse($dark, 440, 225, 80, 80)
      $g.DrawString($it.title, (Font 28 $true), $dark, (Rect 0 20 $w 50), (Centered))
      $g.DrawString($it.subtitle, (Font 22 $false), $white, (Rect 0 340 $w 50), (Centered))
    }
    'vehicle_plate' {
      # Primer plano de la placa
      $g.FillRectangle($color, 0, 0, $w, $h)
      $g.FillRectangle($dark, 110, 120, 420, 170)
      $g.FillRectangle($white, 120, 130, 400, 150)
      $g.FillRectangle((Brush '#1D4ED8'), 120, 130, 400, 34)
      $g.DrawString('PERU', (Font 20 $true), $white, (Rect 120 130 400 34), (Centered))
      $g.DrawString($it.extra, (Font 72 $true), $dark, (Rect 120 164 400 116), (Centered))
      $g.DrawString($it.title, (Font 28 $true), $dark, (Rect 0 30 $w 50), (Centered))
      $g.DrawString($it.subtitle, (Font 22 $false), $dark, (Rect 0 320 $w 50), (Centered))
    }
    'package' {
      # Caja de carton con la descripcion del envio
      $g.FillRectangle((Brush '#F3F4F6'), 0, 0, $w, $h)
      $g.FillRectangle((Brush '#C08A4B'), 170, 130, 300, 230)
      $g.FillRectangle((Brush '#A87436'), 170, 130, 300, 40)
      $g.FillRectangle((Brush '#E5C08F'), 305, 130, 30, 230)
      $g.DrawString($it.title, (Font 30 $true), $dark, (Rect 0 30 $w 70), (Centered))
      $g.DrawString($it.subtitle, (Font 22 $false), $dark, (Rect 20 380 ($w - 40) 80), (Centered))
    }
    default {
      # Foto de recojo / entrega: banda de color, icono de caja y el texto
      $g.FillRectangle($color, 0, 0, $w, $h)
      $g.FillRectangle((Brush '#FFFFFF22'), 0, 300, $w, 180)
      $g.FillRectangle((Brush '#C08A4B'), 250, 150, 140, 110)
      $g.FillRectangle((Brush '#E5C08F'), 312, 150, 16, 110)
      $g.DrawString($it.title, (Font 34 $true), $white, (Rect 0 40 $w 80), (Centered))
      $g.DrawString($it.subtitle, (Font 24 $false), $white, (Rect 20 310 ($w - 40) 140), (Centered))
    }
  }
  $g.Dispose()
  $bmp.Save((Join-Path $OutDir $it.file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Write-Output "Imagenes generadas: $($items.Count)"

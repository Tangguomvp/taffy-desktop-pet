param(
  [Parameter(Mandatory=$true)][string]$Bust,
  [Parameter(Mandatory=$true)][string]$OutPng,
  [string]$OutIco = "",
  [int]$Size = 512,
  [double]$Scale = 1.04,
  [double]$Top = 0.045,
  [string]$BgTop = "#FFFAF0",
  [string]$BgBot = "#FFE1BE",
  [double]$Ring = 9
)

Add-Type -AssemblyName System.Drawing

function Hex2Color([string]$hex) {
  $h = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(255,
    [Convert]::ToInt32($h.Substring(0,2),16),
    [Convert]::ToInt32($h.Substring(2,2),16),
    [Convert]::ToInt32($h.Substring(4,2),16))
}

function Get-AlphaBox([string]$path) {
  $b = New-Object System.Drawing.Bitmap $path
  $minX = $b.Width; $minY = $b.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $b.Height; $y += 2) {
    for ($x = 0; $x -lt $b.Width; $x += 2) {
      if ($b.GetPixel($x, $y).A -gt 12) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $w = $b.Width; $h = $b.Height
  $b.Dispose()
  return @{ x = $minX; y = $minY; w = ($maxX - $minX + 1); h = ($maxY - $minY + 1); srcW = $w; srcH = $h }
}

$BB = Get-AlphaBox $Bust
$IMG = [System.Drawing.Image]::FromFile($Bust)
$bgT = $null
$bgB = $null
if ($BgTop -ne "none") { $bgT = Hex2Color $BgTop; $bgB = Hex2Color $BgBot }

# Sample every target size straight from the source image (no upscale-then-downscale softening).
function Render-Icon([int]$S) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.CompositingQuality = 'HighQuality'

  $circle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $circle.AddEllipse(0, 0, $S, $S)

  if ($bgT) {
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $S), $bgT, $bgB)
    $g.FillPath($grad, $circle)
    $grad.Dispose()
  }

  $k = ($Scale * $S) / $BB.w
  $dw = $BB.srcW * $k
  $dh = $BB.srcH * $k
  $dx = ($S - $BB.w * $k) / 2 - $BB.x * $k
  $dy = ($Top * $S) - $BB.y * $k

  $g.SetClip($circle)
  $g.DrawImage($IMG, [single]$dx, [single]$dy, [single]$dw, [single]$dh)
  $g.ResetClip()

  if ($bgT -and $Ring -gt 0) {
    $rw = [single]($Ring * $S / [double]$Size)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 255, 255, 255)), $rw
    $g.DrawPath($pen, $circle)
    $pen.Dispose()
  }

  $circle.Dispose()
  $g.Dispose()
  return $bmp
}

$png = Render-Icon $Size
$png.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
$png.Dispose()
Write-Output ("wrote " + $OutPng + " " + (Get-Item $OutPng).Length)

if ($OutIco -ne "") {
  $sizes = @(16, 24, 32, 48, 64, 128, 256)
  $entries = @()
  foreach ($s in $sizes) {
    $bm = Render-Icon $s
    $ms = New-Object System.IO.MemoryStream
    $bm.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $entries += , @{ size = $s; bytes = $ms.ToArray() }
    $ms.Dispose(); $bm.Dispose()
  }
  $fs = [System.IO.File]::Create($OutIco)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$entries.Count)
  $offset = 6 + 16 * $entries.Count
  foreach ($e in $entries) {
    $s = $e.size
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$e.bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $e.bytes.Length
  }
  foreach ($e in $entries) { $bw.Write($e.bytes) }
  $bw.Flush(); $bw.Dispose(); $fs.Dispose()
  Write-Output ("wrote " + $OutIco + " " + (Get-Item $OutIco).Length)
}
$IMG.Dispose()

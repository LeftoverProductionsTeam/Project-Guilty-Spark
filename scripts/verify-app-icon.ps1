param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$ExpectedIco,
  [Parameter(Mandatory=$true)][string]$OutputPng
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$actual=$null; $expected=$null; $pixels=$null; $reference=$null
try {
  $actual=[System.Drawing.Icon]::ExtractAssociatedIcon((Get-Item -LiteralPath $Executable).FullName)
  if($null -eq $actual){throw 'The native application has no extractable Windows icon'}
  $pixels=$actual.ToBitmap()
  $expected=[System.Drawing.Icon]::new((Get-Item -LiteralPath $ExpectedIco).FullName,$pixels.Width,$pixels.Height)
  $reference=$expected.ToBitmap()
  if($pixels.Size -ne $reference.Size){throw 'The executable icon size differs from the requested Monitor icon'}
  $transparent=0
  for($y=0;$y -lt $pixels.Height;$y++) { for($x=0;$x -lt $pixels.Width;$x++) {
    $pixel=$pixels.GetPixel($x,$y)
    if($pixel.ToArgb() -ne $reference.GetPixel($x,$y).ToArgb()){throw 'The executable still contains a different application icon'}
    if($pixel.A -eq 0){$transparent++}
  }}
  if($transparent -eq 0){throw 'The Monitor icon lost its transparent background'}
  if(Test-Path -LiteralPath $OutputPng){throw 'Choose a fresh owned icon-readback output'}
  $pixels.Save($OutputPng,[System.Drawing.Imaging.ImageFormat]::Png)
  [pscustomobject]@{width=$pixels.Width;height=$pixels.Height;transparentPixels=$transparent;matchesExpectedMonitor=$true;method='Windows Icon.ExtractAssociatedIcon, pixel comparison with generated ICO'} | ConvertTo-Json -Compress
} finally {
  if($null -ne $reference){$reference.Dispose()};if($null -ne $pixels){$pixels.Dispose()};if($null -ne $expected){$expected.Dispose()};if($null -ne $actual){$actual.Dispose()}
}

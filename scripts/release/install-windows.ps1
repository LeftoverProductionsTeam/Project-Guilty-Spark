param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$ExpectedExecutable,
  [Parameter(Mandatory=$true)][string]$TestRoot,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($TestRoot)
$allowed = if ($env:RUNNER_TEMP) { [IO.Path]::GetFullPath($env:RUNNER_TEMP) } else { [IO.Path]::GetFullPath((Join-Path (Get-Location) '.local')) }
if (!$root.StartsWith($allowed.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Installation test must stay inside the runner temp or this workspace .local directory.'
}
$install = Join-Path $root 'installed'
$receipt = Join-Path $root 'installation.json'
if ($Uninstall) {
  if (!(Test-Path -LiteralPath $receipt)) { throw 'No owned installation receipt.' }
  $saved = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
  $app = Join-Path $install 'GuiltySpark.exe'
  if (!$saved.complete -or (Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saved.installedExecutableSha256) { throw 'Owned installed application differs.' }
  $uninstallers = @(Get-ChildItem -LiteralPath $install -File | Where-Object { $_.Name -like '*Uninstall*.exe' })
  if ($uninstallers.Count -ne 1) { throw 'Expected one owned NSIS uninstaller.' }
  $process = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -WindowStyle Hidden -PassThru
  if (!$process.WaitForExit(120000) -or $process.ExitCode -ne 0) { throw 'Owned NSIS uninstaller failed.' }
  [IO.File]::WriteAllText((Join-Path $root 'uninstall.json'), '{"complete":true}', [Text.UTF8Encoding]::new($false))
  exit
}
if (Test-Path -LiteralPath $root) { throw 'Use a fresh installation-test directory.' }
# Never overwrite an existing user installation or its shortcuts during acceptance.
$keys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
foreach ($key in $keys) {
  $existing = @(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -match 'Guilty.*Spark' -or $_.PSChildName -match 'studio\.guiltyspark\.editor' })
  if ($existing.Count) { throw 'An existing Spark installation must be preserved. Use a clean test runner.' }
}
foreach ($directory in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  if ($directory -and ((Test-Path -LiteralPath (Join-Path $directory 'Project Guilty Spark.lnk')) -or (Test-Path -LiteralPath (Join-Path $directory 'Project Guilty Spark')))) {
    throw 'An existing Spark shortcut must be preserved. Use a clean test runner.'
  }
}
$setup = (Resolve-Path -LiteralPath $Installer).Path
$expected = (Get-FileHash -LiteralPath $ExpectedExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
New-Item -ItemType Directory -Path $root | Out-Null
# NSIS requires /D to be the final, unquoted remainder, including any spaces.
$priorSparkData = $env:GUILTY_SPARK_DATA_DIR
try {
  $env:GUILTY_SPARK_DATA_DIR = Join-Path $root 'installer-library'
  $process = Start-Process -FilePath $setup -ArgumentList ('/S /D=' + $install) -WindowStyle Hidden -PassThru
} finally {
  $env:GUILTY_SPARK_DATA_DIR = $priorSparkData
}
if (!$process.WaitForExit(180000) -or $process.ExitCode -ne 0) { throw 'NSIS installation failed or timed out.' }
$installed = (Get-FileHash -LiteralPath (Join-Path $install 'GuiltySpark.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($installed -ne $expected) { throw 'NSIS installed executable differs from the packaged build.' }
$result = @{schemaVersion=1;complete=$true;installerExitCode=$process.ExitCode;installerSha256=(Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant();installedExecutableSha256=$installed;cleanMachineTested=$false;hostedRunnerTested=($env:GITHUB_ACTIONS -eq 'true' -and [bool]$env:RUNNER_TEMP)}
[IO.File]::WriteAllText($receipt, ($result | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$result | ConvertTo-Json

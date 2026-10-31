param([Parameter(Mandatory=$true)][int]$GameProcessId,
      [Parameter(Mandatory=$true)][string]$GameDirectory,
      [Parameter(Mandatory=$true)][string]$ProfileDirectory)
$ErrorActionPreference='Stop'
# Read-only diagnostics of the explicitly owned trial process. No UI automation,
# memory reads, registry/license data, security changes or process-name killing.
$report=[ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString('o');process=$null;modules=@();threads=@();logs=@();profileFiles=@();applicationEvents=@();errors=@()}
try {
  $gameProcess=Get-Process -Id $GameProcessId -ErrorAction Stop
  $expected=[IO.Path]::GetFullPath((Join-Path $GameDirectory 'haloce.exe'))
  if([IO.Path]::GetFullPath($gameProcess.Path) -ine $expected){throw 'The process does not belong to this CE trial'}
  $report.process=[ordered]@{id=$gameProcess.Id;path=$gameProcess.Path;sessionId=$gameProcess.SessionId;cpuSeconds=$gameProcess.TotalProcessorTime.TotalSeconds;privateBytes=$gameProcess.PrivateMemorySize64;workingSetBytes=$gameProcess.WorkingSet64;startTime=$gameProcess.StartTime.ToUniversalTime().ToString('o');version=$gameProcess.FileVersionInfo.FileVersion}
  try {$report.modules=@($gameProcess.Modules | ForEach-Object {[ordered]@{name=$_.ModuleName;path=$_.FileName;version=$_.FileVersionInfo.FileVersion}})}catch{$report.errors+=('Modules: '+$_.Exception.Message)}
  $report.threads=@($gameProcess.Threads | Select-Object -First 64 | ForEach-Object {
    $reason=$null
    if($_.ThreadState -eq [Diagnostics.ThreadState]::Wait){try{$reason=$_.WaitReason.ToString()}catch{}}
    [ordered]@{id=$_.Id;state=$_.ThreadState.ToString();waitReason=$reason;cpuSeconds=$_.TotalProcessorTime.TotalSeconds}
  })
} catch {$report.errors+=('Process: '+$_.Exception.Message)}
foreach($directory in @($GameDirectory,$ProfileDirectory)) {
  foreach($name in @('debug.txt','errorlog.txt','exception_data.txt')) {
    $file=Join-Path $directory $name
    if(Test-Path -LiteralPath $file -PathType Leaf){
      $info=Get-Item -LiteralPath $file
      if($info.Length -le 1048576){$report.logs+=@{path=$file;length=$info.Length;tail=@(Get-Content -LiteralPath $file -Tail 60)}}
    }
  }
}
if(Test-Path -LiteralPath $ProfileDirectory -PathType Container){
  $report.profileFiles=@(Get-ChildItem -LiteralPath $ProfileDirectory -File -Recurse | Select-Object -First 128 | ForEach-Object {@{relative=$_.FullName.Substring($ProfileDirectory.Length);bytes=$_.Length;modifiedUtc=$_.LastWriteTimeUtc.ToString('o')}})
}
try {
  $events=Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=(Get-Date).AddMinutes(-10);Id=1000,1001} -MaxEvents 64 -ErrorAction Stop
  $report.applicationEvents=@($events | Where-Object {$_.Message.Contains($GameDirectory)} | ForEach-Object {@{id=$_.Id;provider=$_.ProviderName;time=$_.TimeCreated.ToUniversalTime().ToString('o');message=$_.Message.Substring(0,[Math]::Min(4096,$_.Message.Length))}})
}catch{$report.errors+=('Application events: '+$_.Exception.Message)}
$report|ConvertTo-Json -Depth 8 -Compress

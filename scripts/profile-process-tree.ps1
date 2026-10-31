param([Parameter(Mandatory=$true)][int]$RootProcessId)
$ErrorActionPreference='Stop'
# Read-only counters for this QA application's descendants. No command lines,
# environment variables, unrelated windows or process memory are collected.
$inventory=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name
$owned=[System.Collections.Generic.HashSet[int]]::new();[void]$owned.Add($RootProcessId)
for($round=0;$round -lt 8;$round++){
  $added=$false
  foreach($row in $inventory){if($owned.Contains([int]$row.ParentProcessId)){if($owned.Add([int]$row.ProcessId)){$added=$true}}}
  if(-not $added){break}
}
$processes=@(foreach($ownedId in $owned){
  $current=Get-Process -Id $ownedId -ErrorAction SilentlyContinue
  if($current){[pscustomobject]@{id=$ownedId;name=$current.ProcessName;cpuSeconds=$current.TotalProcessorTime.TotalSeconds;workingSetBytes=$current.WorkingSet64;privateBytes=$current.PrivateMemorySize64;handles=$current.HandleCount}}
})
$sampledAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$engines=$null;$gpuMemory=$null;$gpuError=$null
try {
  $engines=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object {
    $_.Name -match '^pid_(\d+)_' -and $owned.Contains([int]$Matches[1])
  } | ForEach-Object {[pscustomobject]@{name=$_.Name;utilizationPercent=[double]$_.UtilizationPercentage}})
  $gpuMemory=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | Where-Object {
    $_.Name -match '^pid_(\d+)_' -and $owned.Contains([int]$Matches[1])
  } | ForEach-Object {[pscustomobject]@{name=$_.Name;dedicatedBytes=[long]$_.DedicatedUsage;sharedBytes=[long]$_.SharedUsage}})
}catch{$gpuError=$_.Exception.GetType().Name}
[pscustomobject]@{timestamp=$sampledAt;rootProcessId=$RootProcessId;logicalProcessors=[Environment]::ProcessorCount;
  processes=$processes;cpuSeconds=($processes|Measure-Object cpuSeconds -Sum).Sum;workingSetBytes=($processes|Measure-Object workingSetBytes -Sum).Sum;privateBytes=($processes|Measure-Object privateBytes -Sum).Sum;
  gpuEngines=$engines;gpuMemory=$gpuMemory;gpuProbeError=$gpuError} | ConvertTo-Json -Depth 5 -Compress

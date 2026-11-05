param([Parameter(Mandatory=$true)][ValidateSet('plan','apply')][string]$Mode,[Parameter(Mandatory=$true)][string]$Workspace,[string]$Candidates,[Parameter(Mandatory=$true)][string]$Plan,[string]$PlanSha256,[string]$Journal,[Parameter(Mandatory=$true)][string]$SharedHelperPath)
$ErrorActionPreference='Stop'
if(-not ('SparkReparseObjects' -as [type])){Add-Type -TypeDefinition ([IO.File]::ReadAllText($SharedHelperPath))}
function HashBytes([byte[]]$Bytes){$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}}
function WriteNew([string]$File,$Value){$stream=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 10)+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
function AppendRecord($Stream,$Value){$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 8 -Compress)+"`n");$Stream.Write($bytes,0,$bytes.Length);$Stream.Flush($true)}
function FullRelative([string]$Relative){
  if(-not $Relative.StartsWith('.local/') -or $Relative.Contains('\') -or $Relative.Contains(':') -or $Relative.Contains([char]0) -or (($Relative -split '/')|Where-Object {$_ -eq '..' -or $_ -eq '.' -or $_ -eq ''})){throw 'Invalid exact relative link name'}
  $full=[IO.Path]::GetFullPath([IO.Path]::Combine($Workspace,$Relative.Replace('/',[IO.Path]::DirectorySeparatorChar)))
  if(-not $full.StartsWith(([IO.Path]::GetFullPath($Workspace).TrimEnd('\')+'\.local\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Link name escaped obsolete local root'}
  return $full
}
if($Mode -eq 'plan'){
  if(-not $Candidates){throw 'Explicit candidate index path is required'}
  if(-not [IO.File]::Exists($Candidates)){
    $inventory=[SparkReparseObjects]::ListLinks($Workspace)
    $inputIndex=[ordered]@{workspace=$Workspace;readOnly=$true;noFollow=$true;at=[DateTime]::UtcNow.ToString('o');links=@($inventory.links);directories=$inventory.directories;regularFiles=$inventory.regularFiles}
    WriteNew $Candidates $inputIndex
  }
  if(([IO.FileInfo]$Candidates).Length -gt 4MB){throw 'Bounded candidate index is required'}
  $inputIndex=[IO.File]::ReadAllText($Candidates)|ConvertFrom-Json
  if($inputIndex.workspace -ine $Workspace -or -not $inputIndex.readOnly -or @($inputIndex.links).Count -gt 2048 -or @($inputIndex.links).Count -eq 0){throw 'Invalid no-follow candidate inventory'}
  $entries=@();$errors=@();$seen=@{}
  foreach($relative in $inputIndex.links){
    try{
      if($seen.ContainsKey($relative.ToLowerInvariant())){throw 'Duplicate candidate'};$seen[$relative.ToLowerInvariant()]=$true
      $full=FullRelative $relative;$capture=[SparkReparseObjects]::Capture($Workspace,$full)
      if($capture.tag -ne 2684354563 -and $capture.tag -ne 2684354572){throw 'Unknown reparse tag is retained for separate review'}
      $entries+=,[ordered]@{relative=$relative;capture=$capture}
    }catch{$errors+=,[ordered]@{relative=$relative;error=$_.Exception.ToString()}}
  }
  $planData=[ordered]@{schemaVersion=1;operation='retire-obsolete-local-reparse-objects';workspace=$Workspace;at=[DateTime]::UtcNow.ToString('o');complete=($errors.Count -eq 0);sourceDeletionPerformed=$false;noFollow=$true;candidateFile=$Candidates;candidateSha256=(HashBytes ([IO.File]::ReadAllBytes($Candidates)));helperSha256=(HashBytes ([IO.File]::ReadAllBytes($SharedHelperPath)));entries=$entries;errors=$errors;files=$entries.Count;rawBytes=($entries|ForEach-Object {$_.capture.rawBytes}|Measure-Object -Sum).Sum}
  WriteNew $Plan $planData
  [ordered]@{complete=$planData.complete;files=$entries.Count;errors=$errors.Count;plan=$Plan;sha256=(HashBytes ([IO.File]::ReadAllBytes($Plan)))}|ConvertTo-Json -Compress
  if(-not $planData.complete){exit 2};exit 0
}
if(-not $PlanSha256 -or -not $Journal -or ([IO.FileInfo]$Plan).Length -gt 8MB){throw 'Exact reviewed plan hash and durable journal are required'}
$planBytes=[IO.File]::ReadAllBytes($Plan)
if((HashBytes $planBytes) -cne $PlanSha256){throw 'Reviewed link plan changed'}
$data=[Text.Encoding]::UTF8.GetString($planBytes)|ConvertFrom-Json
if($data.schemaVersion -ne 1 -or $data.operation -ne 'retire-obsolete-local-reparse-objects' -or $data.workspace -ine $Workspace -or -not $data.complete -or $data.sourceDeletionPerformed -or -not $data.noFollow -or @($data.entries).Count -gt 2048 -or @($data.entries).Count -ne $data.files -or $data.helperSha256 -cne (HashBytes ([IO.File]::ReadAllBytes($SharedHelperPath)))){throw 'Link plan is incomplete, foreign or helper differs'}
$intent=@{};$done=@{}
if([IO.File]::Exists($Journal)){foreach($line in [IO.File]::ReadLines($Journal)){$row=$line|ConvertFrom-Json;if($row.planSha256 -cne $PlanSha256){throw 'Journal belongs to another reviewed plan'};if($row.event -eq 'intent'){$intent[$row.relative]=$true};if($row.event -eq 'removed' -or $row.event -eq 'missing-after-intent'){$done[$row.relative]=$true}}}
$stream=[IO.File]::Open($Journal,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$removed=0;$recovered=0;$errors=@();$seen=@{}
try{
 foreach($entry in $data.entries){
  try{
    $relative=[string]$entry.relative;$full=FullRelative $relative
    if($seen.ContainsKey($relative.ToLowerInvariant())){throw 'Duplicate reviewed link'};$seen[$relative.ToLowerInvariant()]=$true
    if($entry.capture.path -ine $full -or $entry.capture.followedTarget -or ($entry.capture.tag -ne 2684354563 -and $entry.capture.tag -ne 2684354572) -or (HashBytes ([Convert]::FromBase64String($entry.capture.rawBase64))) -cne $entry.capture.rawSha256){throw 'Invalid opaque capture binding'}
    if([SparkReparseObjects]::IsMissing($Workspace,$full)){
      if(-not $intent.ContainsKey($relative)){throw 'Object absent without durable reviewed intent'}
      AppendRecord $stream @{planSha256=$PlanSha256;event='missing-after-intent';relative=$relative};$recovered++;continue
    }
    if($done.ContainsKey($relative)){throw 'Previously retired object was recreated; retain replacement'}
    AppendRecord $stream @{planSha256=$PlanSha256;event='intent';relative=$relative;dev=$entry.capture.dev;ino=$entry.capture.ino;rawSha256=$entry.capture.rawSha256};$intent[$relative]=$true
    $c=$entry.capture
    $deleted=[SparkReparseObjects]::Retire($Workspace,$full,[string]$c.dev,[string]$c.ino,[string]$c.rawSha256,[string]$c.lastWriteFileTime,[uint32]$c.attributes,[uint32]$c.tag)
    if(-not [SparkReparseObjects]::IsMissing($Workspace,$full)){throw 'Link retirement did not read back as absent'}
    AppendRecord $stream @{planSha256=$PlanSha256;event='removed';relative=$relative;rawSha256=$deleted.rawSha256};$removed++
  }catch{$errors+=,@{relative=$entry.relative;error=$_.Exception.ToString()};AppendRecord $stream @{planSha256=$PlanSha256;event='retained';relative=$entry.relative;error=$_.Exception.ToString()}}
 }
}finally{$stream.Dispose()}
$result=[ordered]@{schemaVersion=1;planSha256=$PlanSha256;complete=($errors.Count -eq 0);removed=$removed;recovered=$recovered;retained=$errors.Count;errors=$errors;targetOpened=$false;sameHandleObjectDeletion=$true}
$result|ConvertTo-Json -Depth 6
if($errors.Count){exit 2}

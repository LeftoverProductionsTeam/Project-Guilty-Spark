param([Parameter(Mandatory=$true)][ValidateSet('plan','apply')][string]$Mode,[Parameter(Mandatory=$true)][string]$Workspace,[Parameter(Mandatory=$true)][string]$Plan,[string]$PlanSha256,[string]$Journal,[Parameter(Mandatory=$true)][string]$SharedHelperPath)
$ErrorActionPreference='Stop'
if(-not ('SparkReparseObjects' -as [type])){Add-Type -TypeDefinition ([IO.File]::ReadAllText($SharedHelperPath))}
function HashBytes([byte[]]$Bytes){$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}}
function WriteNew([string]$File,$Value){$stream=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 8)+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}}
function Record($Stream,$Value){$bytes=[Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 5 -Compress)+"`n");$Stream.Write($bytes,0,$bytes.Length)}
if($Mode -eq 'plan'){
 $inventory=[SparkReparseObjects]::ListLinks($Workspace)
 $data=[ordered]@{schemaVersion=1;operation='retire-exact-empty-local-directories';workspace=$Workspace;root=([IO.Path]::Combine($Workspace,'.local'));at=[DateTime]::UtcNow.ToString('o');complete=($inventory.regularFiles -eq 0 -and $inventory.links.Count -eq 0);sourceDeletionPerformed=$false;helperSha256=(HashBytes ([IO.File]::ReadAllBytes($SharedHelperPath)));workspaceIdentity=$inventory.workspaceIdentity;entries=@($inventory.directoryEntries);directories=$inventory.directories;regularFiles=$inventory.regularFiles;links=$inventory.links;deletionPolicy='same-native-handle identity and creation time; Windows empty-only disposition; no child-file deletion'}
 WriteNew $Plan $data
 [ordered]@{complete=$data.complete;directories=$data.directories;regularFiles=$data.regularFiles;links=$inventory.links.Count;plan=$Plan;sha256=(HashBytes ([IO.File]::ReadAllBytes($Plan)))}|ConvertTo-Json -Compress
 if(-not $data.complete){exit 2};exit 0
}
if(-not $PlanSha256 -or -not $Journal -or ([IO.FileInfo]$Plan).Length -gt 128MB){throw 'Explicit reviewed directory plan hash and durable journal are required'}
$planBytes=[IO.File]::ReadAllBytes($Plan);if((HashBytes $planBytes) -cne $PlanSha256){throw 'Reviewed empty-directory plan changed'}
$data=[Text.Encoding]::UTF8.GetString($planBytes)|ConvertFrom-Json
$local=[IO.Path]::Combine([IO.Path]::GetFullPath($Workspace).TrimEnd('\'),'.local')
if($data.schemaVersion -ne 1 -or $data.operation -ne 'retire-exact-empty-local-directories' -or $data.workspace -ine $Workspace -or $data.root -ine $local -or -not $data.complete -or $data.sourceDeletionPerformed -or $data.regularFiles -ne 0 -or @($data.links).Count -ne 0 -or @($data.entries).Count -ne $data.directories -or $data.directories -gt 250000 -or $data.helperSha256 -cne (HashBytes ([IO.File]::ReadAllBytes($SharedHelperPath)))){throw 'Foreign, incomplete or changed empty-directory plan'}
$claims=New-Object 'System.Collections.Generic.List[SparkReparseObjects+DirectorySnapshot]'
foreach($row in @($data.workspaceIdentity)+@($data.entries)){
 $claim=New-Object 'SparkReparseObjects+DirectorySnapshot';$claim.path=[string]$row.path;$claim.dev=[string]$row.dev;$claim.ino=[string]$row.ino;$claim.creationFileTime=[string]$row.creationFileTime;$claim.attributes=[uint32]$row.attributes;$claims.Add($claim)
}
[SparkReparseObjects]::SetDirectoryClaims($claims.ToArray())
$entries=@($data.entries);[array]::Reverse($entries)
$intent=@{};$done=@{}
if([IO.File]::Exists($Journal)){foreach($line in [IO.File]::ReadLines($Journal)){$row=$line|ConvertFrom-Json;if($row.planSha256 -cne $PlanSha256){throw 'Directory journal belongs to another reviewed plan'};if($row.event -eq 'intent'){$intent[$row.path]=$true};if($row.event -eq 'removed' -or $row.event -eq 'missing-after-intent'){$done[$row.path]=$true}}}
$stream=[IO.File]::Open($Journal,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$removed=0;$recovered=0;$errors=@()
try{
 for($offset=0;$offset -lt $entries.Count;$offset+=128){
  $batch=@($entries[$offset..([Math]::Min($offset+127,$entries.Count-1))])
  $ready=@()
  foreach($entry in $batch){
   try{
    if($entry.path -ine $local -and -not $entry.path.StartsWith($local+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Directory plan escaped exact obsolete root'}
    if([SparkReparseObjects]::IsDirectoryMissing($Workspace,$entry.path)){
     if(-not $intent.ContainsKey($entry.path)){throw 'Directory absent without prior reviewed intent'}
     Record $stream @{planSha256=$PlanSha256;event='missing-after-intent';path=$entry.path};$recovered++;continue
    }
    if($done.ContainsKey($entry.path)){throw 'Retired directory was recreated; retain replacement'}
    Record $stream @{planSha256=$PlanSha256;event='intent';path=$entry.path;dev=$entry.dev;ino=$entry.ino;creationFileTime=$entry.creationFileTime};$intent[$entry.path]=$true;$ready+=,$entry
   }catch{$errors+=,@{path=$entry.path;error=$_.Exception.ToString()};Record $stream @{planSha256=$PlanSha256;event='retained';path=$entry.path;error=$_.Exception.ToString()}}
  };$stream.Flush($true);if($errors.Count -ge 32){throw 'Directory retirement checkpointed after 32 refusals; durable journal retained'}
  foreach($entry in $ready){
   try{
    [void][SparkReparseObjects]::RetireEmptyDirectory($Workspace,$entry.path)
    if(-not [SparkReparseObjects]::IsDirectoryMissing($Workspace,$entry.path)){throw 'Directory retirement did not read back as absent'}
    Record $stream @{planSha256=$PlanSha256;event='removed';path=$entry.path};$removed++
   }catch{$errors+=,@{path=$entry.path;error=$_.Exception.ToString()};Record $stream @{planSha256=$PlanSha256;event='retained';path=$entry.path;error=$_.Exception.ToString()}}
  };$stream.Flush($true);if($errors.Count -ge 32){throw 'Directory retirement checkpointed after 32 refusals; durable journal retained'}
  if($offset%12800 -eq 0){[ordered]@{progress=$true;removed=$removed;recovered=$recovered;retained=$errors.Count}|ConvertTo-Json -Compress}
 }
}finally{$stream.Dispose()}
[ordered]@{schemaVersion=1;planSha256=$PlanSha256;complete=($errors.Count -eq 0);removed=$removed;recovered=$recovered;retained=$errors.Count;errors=$errors;filesDeleted=0;linksDeleted=0;sameHandleEmptyDirectoryDeletion=$true}|ConvertTo-Json -Depth 5
if($errors.Count){exit 2}

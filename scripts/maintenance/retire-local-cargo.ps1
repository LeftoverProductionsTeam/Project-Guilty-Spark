param([Parameter(Mandatory=$true)][string]$Manifest,[Parameter(Mandatory=$true)][string]$PlanSha256,[Parameter(Mandatory=$true)][string]$Journal,[string]$SharedHelperPath)
$ErrorActionPreference='Stop'
if(!$SharedHelperPath){$SharedHelperPath=Join-Path $PSScriptRoot 'windows-sealed-files.cs'}
if(-not ('SparkSealedFiles' -as [type])){Add-Type -Path $SharedHelperPath}
function Ordinary([string]$p,[bool]$allowJournalCloud=$false) {
  $current=[IO.Path]::GetFullPath($p)
  while($current){$i=Get-Item -LiteralPath $current -Force;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){if(!$allowJournalCloud-or ![SparkSealedFiles]::IsCloudPlaceholder($current)){throw "Reparse path refused: $current"}};$parent=[IO.Directory]::GetParent($current);if(!$parent){break};$current=$parent.FullName}
}
function Join-Relative([string]$root,[string]$relative) {
  if(!$relative -or $relative.Contains('\') -or $relative.Contains(':') -or $relative -match '[\x00-\x1f]' -or @($relative.Split('/')|Where-Object{!$_ -or $_ -eq '.' -or $_ -eq '..'}).Count){throw 'Unsafe relative path'}
  $p=[IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/','\')))
  if(!$p.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Path leaves approved root'}
  return $p
}
function Identity-Matches($native,$expected) {
  return [SparkSealedFiles]::Id($native) -eq [string]$expected.ino -and (($native.Attributes-band 0x10)-ne 0 -or [SparkSealedFiles]::Length($native) -eq [long]$expected.bytes) -and [SparkSealedFiles]::ModifiedNs($native) -eq [string]$expected.mtimeNs
}
function Process-Gate($roots) {
  $rows=@(Get-CimInstance Win32_Process | Where-Object{$_.Name -match '^(cargo|rustc|rustup|cl|link|lld-link|rc|mt|GuiltySpark.*|Spark-workflows|qa_.*)\.exe$'} | Select-Object ProcessId,Name,ExecutablePath,CommandLine)
  foreach($p in $rows){foreach($r in $roots){if((([string]$p.ExecutablePath)+' '+([string]$p.CommandLine)).IndexOf($r,[StringComparison]::OrdinalIgnoreCase)-ge 0){throw "Active obsolete-cache process: $($p.ProcessId)"}}}
  return $rows
}
# The explicitly selected GS journal is beneath a OneDrive cloud placeholder,
# not a redirected source tree. Permit only that tag family for journal I/O;
# deletion sources and preserved binary paths reject every reparse point.
Ordinary $Manifest $true
$manifestStream=[IO.File]::OpenRead($Manifest);$manifestHasher=[Security.Cryptography.SHA256]::Create()
try{$manifestHash=[BitConverter]::ToString($manifestHasher.ComputeHash($manifestStream)).Replace('-','').ToLowerInvariant()}finally{$manifestStream.Dispose();$manifestHasher.Dispose()}
if($manifestHash -cne $PlanSha256){throw 'Reviewed manifest hash changed'}
$plan=Get-Content -LiteralPath $Manifest -Raw|ConvertFrom-Json
if($plan.schemaVersion-ne 1 -or $plan.operation-ne 'rescue-obsolete-cargo' -or !$plan.complete -or $plan.sourceDeletionPerformed){throw 'Incomplete or changed Cargo plan'}
$workspace=[IO.Path]::GetFullPath($plan.workspace);Ordinary $workspace
$local=Join-Path $workspace '.local';$vault=Join-Path $workspace 'preserved\development-builds';Ordinary $vault
if([IO.Path]::GetFullPath($plan.vault)-ine $vault){throw 'Preserved binary ownership path changed'}
$owner=Get-Content -LiteralPath (Join-Path $vault 'ownership.json') -Raw|ConvertFrom-Json
if($owner.kind-ne 'spark-preserved-development-builds' -or [IO.Path]::GetFullPath($owner.workspace)-ine $workspace){throw 'Preservation owner changed'}
$roots=@();foreach($tree in $plan.trees){$r=[string]$tree.sourceRelative;if($r-ne '.local/build/cargo' -and !($r.StartsWith('.local/') -and $r.EndsWith('/target'))){throw 'Unapproved Cargo source'};$full=Join-Relative $workspace $r;if(!$full.StartsWith($local+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Root outside obsolete local'};Ordinary $full;$roots+=,$full}
if($roots.Count-lt 1 -or $roots.Count-gt 64){throw 'Cargo root bound exceeded'}
$journalRoot=[IO.Path]::GetFullPath($Journal)
if($journalRoot.StartsWith($local+'\',[StringComparison]::OrdinalIgnoreCase)-or $journalRoot-ieq $local){throw 'Journal cannot be inside obsolete local'}
[IO.Directory]::CreateDirectory($journalRoot)|Out-Null;Ordinary $journalRoot $true
$log=New-Object IO.FileStream((Join-Path $journalRoot 'purge-events.jsonl'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$writer=New-Object IO.StreamWriter($log,[Text.UTF8Encoding]::new($false));$writer.AutoFlush=$true
function Event($value,[bool]$durable=$false){$writer.WriteLine(($value|ConvertTo-Json -Depth 8 -Compress));if($durable){$log.Flush($true)}}
$held=@{};$fileRows=@();$removedFiles=0;$removedBytes=[long]0;$removedAllocation=[long]0;$removedDirectories=0;$rescuedAllocation=[long]0;$rescues=@{}
try {
  $processes=Process-Gate $roots
  # Deny directory rename/replacement throughout verification and file deletion.
  foreach($root in $roots){for($p=$root;$p;$p=([IO.Directory]::GetParent($p)).FullName){if(!$held.ContainsKey($p)){$held[$p]=[SparkSealedFiles]::Directory($p)};if(![IO.Directory]::GetParent($p)){break}}}
  for($index=0;$index-lt $plan.trees.Count;$index++){
    $tree=$plan.trees[$index];$root=$roots[$index]
    if(!(Get-Content -LiteralPath (Join-Path $root 'CACHEDIR.TAG') -Raw).StartsWith('Signature: 8a477f597d28d172789f06886806bc55')){throw 'Cargo marker changed'}
    $expected=@{}
    foreach($d in $tree.directories){$folder=if($d.relative){Join-Relative $root $d.relative}else{$root};Ordinary $folder;if(!$held.ContainsKey($folder)){$held[$folder]=[SparkSealedFiles]::Directory($folder)};$info=[SparkSealedFiles]::Information($held[$folder]);if(($info.Attributes-band 0x400)-ne 0 -or !(Identity-Matches $info $d)){throw "Cargo directory identity changed: $folder; native=$([SparkSealedFiles]::Id($info))/$([SparkSealedFiles]::Length($info))/$([SparkSealedFiles]::ModifiedNs($info)); expected=$($d.ino)/$($d.bytes)/$($d.mtimeNs)"};$expected[$folder]=$true}
    foreach($e in $tree.entries){$file=Join-Relative $root $e.relative;$expected[$file]=$true;$fileRows+=,[pscustomobject]@{path=$file;entry=$e}}
    $pending=[Collections.Generic.Stack[string]]::new();$pending.Push($root);$seen=0
    while($pending.Count){$dir=$pending.Pop();foreach($i in Get-ChildItem -LiteralPath $dir -Force){if(($i.Attributes-band [IO.FileAttributes]::ReparsePoint)-ne 0 -or !$expected.ContainsKey($i.FullName)){throw "New, linked or unclassified Cargo item: $($i.FullName)"};if(++$seen-gt 150000){throw 'Cargo traversal bound exceeded'};if($i.PSIsContainer){$pending.Push($i.FullName)}}}
  }
  if($fileRows.Count-ne [int]$plan.totals.files){throw 'Cargo plan file totals changed'}
  # Verify every ordinary source and every independent rescued copy BEFORE any deletion.
  foreach($row in $fileRows){
    $f=[SparkSealedFiles+File]::new($row.path,$true)
    try{if(!(Identity-Matches $f.Identity $row.entry)-or $f.Hash()-cne $row.entry.sha256){throw "Cargo source changed: $($row.path)"}}finally{$f.Dispose()}
    if($row.entry.rescued){$saved=Join-Relative $workspace $row.entry.rescued.path;if(!$saved.StartsWith($vault+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Rescue leaves protected folder'}
      if(!$rescues.ContainsKey($saved)){Ordinary $saved;$copy=[SparkSealedFiles+File]::new($saved,$false);try{if($copy.Identity.Links-ne 1-or [SparkSealedFiles]::Length($copy.Identity)-ne [long]$row.entry.bytes-or $copy.Hash()-cne $row.entry.sha256){throw "Rescue changed: $saved"};$rescuedAllocation+=$copy.Allocation()}finally{$copy.Dispose()};$rescues[$saved]=$true}
    }
  }
  $processes=Process-Gate $roots
  Event @{event='all-source-and-rescue-hashes-verified';manifest=$Manifest;sha256=$PlanSha256;roots=$roots;files=$fileRows.Count;rescuedFiles=$rescues.Count;at=[DateTime]::UtcNow.ToString('o')} $true
  foreach($row in $fileRows){
    Ordinary ([IO.Path]::GetDirectoryName($row.path))
    $f=[SparkSealedFiles+File]::new($row.path,$true)
    try{
      if(!(Identity-Matches $f.Identity $row.entry)-or $f.Hash()-cne $row.entry.sha256){throw "Cargo file changed immediately before deletion: $($row.path)"}
      $allocation=$f.Allocation();$f.DeleteVerified()
    }finally{$f.Dispose()}
    if(Test-Path -LiteralPath $row.path){throw 'Verified delete did not remove source path'}
    $removedFiles++;$removedBytes+=[long]$row.entry.bytes;$removedAllocation+=$allocation
    Event @{event='deleted-file';path=$row.path;sha256=$row.entry.sha256;bytes=[long]$row.entry.bytes;allocationReleased=$allocation;filesRemoved=$removedFiles} ($removedFiles%100-eq 0)
  }
  $directories=@($plan.trees|ForEach-Object{$tree=$_;$root=Join-Relative $workspace $tree.sourceRelative;foreach($d in $tree.directories){if($d.relative){Join-Relative $root $d.relative}else{$root}}}|Sort-Object Length -Descending)
  foreach($dir in $directories){Ordinary $dir;if(@(Get-ChildItem -LiteralPath $dir -Force).Count-ne 0){throw "Changed directory is not empty: $dir"};$held[$dir].Dispose();$held.Remove($dir);[IO.Directory]::Delete($dir,$false);$removedDirectories++;Event @{event='removed-empty-directory';path=$dir} ($removedDirectories%100-eq 0)}
  $result=@{schemaVersion=1;complete=$true;manifest=$Manifest;manifestSha256=$PlanSha256;roots=$roots;filesRemoved=$removedFiles;directoriesRemoved=$removedDirectories;logicalBytesRemoved=$removedBytes;fileAllocationBytesReleased=$removedAllocation;preservedUniqueLogicalBytes=[long]$plan.totals.rescueUniqueBytes;preservedUniqueAllocationBytes=$rescuedAllocation;netLogicalBytesAfterRescue=$removedBytes-[long]$plan.totals.rescueUniqueBytes;netFileAllocationAfterRescue=$removedAllocation-$rescuedAllocation;rootTargetTouched=$false;at=[DateTime]::UtcNow.ToString('o')}
  Event (@{event='complete';result=$result}) $true
  $result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $journalRoot 'purge-receipt.json') -Encoding UTF8
  $result|ConvertTo-Json -Depth 8 -Compress
}catch {
  Event @{event='stopped';error=$_.Exception.Message;filesRemoved=$removedFiles;directoriesRemoved=$removedDirectories;logicalBytesRemoved=$removedBytes;at=[DateTime]::UtcNow.ToString('o')} $true
  throw
}finally{foreach($handle in $held.Values){$handle.Dispose()};$writer.Dispose();$log.Dispose()}

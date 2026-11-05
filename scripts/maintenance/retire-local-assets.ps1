param([Parameter(Mandatory=$true)][string]$Manifest,[Parameter(Mandatory=$true)][string]$PlanSha256,[Parameter(Mandatory=$true)][string]$Journal,[string]$SharedHelperPath,[string]$NativeTagExtensions='')
$ErrorActionPreference='Stop'
function Hash-File([string]$file){$stream=[IO.File]::OpenRead($file);$hasher=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hasher.Dispose()}}
if($PlanSha256-cnotmatch '^[a-f0-9]{64}$'){throw 'Reviewed immutable manifest hash is invalid'}
$manifestStream=[IO.File]::Open($Manifest,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
if($manifestStream.Length-gt 64MB){throw 'Immutable manifest exceeds64MiB'}
$manifestHasher=[Security.Cryptography.SHA256]::Create()
try{$actualManifest=[BitConverter]::ToString($manifestHasher.ComputeHash($manifestStream)).Replace('-','').ToLowerInvariant()}finally{$manifestHasher.Dispose()}
if($actualManifest-cne $PlanSha256){throw 'Reviewed immutable manifest hash changed'}
$manifestStream.Position=0;$manifestReader=[IO.StreamReader]::new($manifestStream,[Text.Encoding]::UTF8,$true,65536,$true)
try{$plan=$manifestReader.ReadToEnd()|ConvertFrom-Json}finally{$manifestReader.Dispose()}
if($plan.workerSha256-and $plan.workerSha256-cne $env:SPARK_TRUSTED_SCRIPT_SHA){throw 'Reviewed immutable retirement worker changed'}
$cacheMode=$plan.operation-eq 'dispose-obsolete-webview-caches'
$archiveMode=$plan.operation-eq 'retire-obsolete-recovery-archive'
if($plan.schemaVersion-ne 1-or (!$cacheMode-and !$archiveMode-and $plan.operation-ne 'preserve-obsolete-immutable-assets')-or !$plan.complete-or $plan.sourceDeletionPerformed){throw 'Incomplete immutable asset plan'}
$guard=if($SharedHelperPath){$SharedHelperPath}else{Join-Path $PSScriptRoot 'windows-sealed-files.cs'}
if((Hash-File $guard)-cne $plan.guardSha256){throw 'Shared sealed-file guard changed after review'}
if(-not ('SparkSealedFiles' -as [type])){Add-Type -Path $guard}
# Windows FileDispositionInfoEx permits deleting the reviewed read-only file
# through its existing exclusive DELETE handle, without changing its attributes.
# https://learn.microsoft.com/windows-hardware/drivers/ddi/ntddk/ns-ntddk-_file_disposition_information_ex
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class SparkImmutableDisposition {
  [StructLayout(LayoutKind.Sequential)] public struct DispositionEx { public uint Flags; }
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int kind,ref DispositionEx value,uint size);
  public static void DeleteReadonly(SafeFileHandle handle) {
    var value=new DispositionEx{Flags=0x11};
    if(!SetFileInformationByHandle(handle,21,ref value,(uint)Marshal.SizeOf(typeof(DispositionEx)))) {
      int error=Marshal.GetLastWin32Error();throw new Win32Exception(error,"Read-only sealed deletion failed with native error "+error);
    }
  }
}
'@
function Ordinary([string]$path,[bool]$journalCloud=$false){
  for($current=[IO.Path]::GetFullPath($path);$current;){
    # Inspect the actual native handle: Windows PowerShell's provider omits existing long paths.
    $handle=[SparkSealedFiles]::Directory($current)
    try{$info=[SparkSealedFiles]::Information($handle);if(($info.Attributes-band 0x400)-ne 0){if(!$journalCloud-or ![SparkSealedFiles]::IsCloudPlaceholder($current)){throw "Reparse path refused: $current"}}}finally{$handle.Dispose()}
    $parent=[IO.Directory]::GetParent($current);if(!$parent){break};$current=$parent.FullName
  }
}
function Join-Relative([string]$root,[string]$relative){
  if(!$relative-or $relative.Contains('\')-or $relative.Contains(':')-or $relative-match '[\x00-\x1f]'-or @($relative.Split('/')|Where-Object{!$_-or $_-eq '.'-or $_-eq '..'-or $_.EndsWith('.')-or $_.EndsWith(' ')}).Count){throw 'Unsafe immutable relative path'}
  $file=[IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/','\')))
  if(!$file.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Immutable source leaves approved root'};return $file
}
function Source-Matches($file,$entry){
  return [SparkSealedFiles]::VolumeId($file.Identity)-ceq [string]$entry.dev-and [SparkSealedFiles]::Id($file.Identity)-ceq [string]$entry.ino-and [SparkSealedFiles]::Length($file.Identity)-eq [long]$entry.bytes-and [SparkSealedFiles]::ModifiedNs($file.Identity)-ceq [string]$entry.mtimeNs-and [SparkSealedFiles]::UnixNs($file.BasicIdentity.Change)-ceq [string]$entry.ctimeNs
}
function Content-Identity-Matches($file,$entry){
  return [SparkSealedFiles]::VolumeId($file.Identity)-ceq [string]$entry.dev-and [SparkSealedFiles]::Id($file.Identity)-ceq [string]$entry.ino-and [SparkSealedFiles]::Length($file.Identity)-eq [long]$entry.bytes-and [SparkSealedFiles]::ModifiedNs($file.Identity)-ceq [string]$entry.mtimeNs
}
$workspace=[IO.Path]::GetFullPath($plan.workspace);Ordinary $workspace
$local=Join-Path $workspace '.local';$vault=Join-Path $workspace 'preserved\immutable-assets'
if(!$cacheMode-and !$archiveMode){Ordinary $vault;if([IO.Path]::GetFullPath($plan.vault)-ine $vault){throw 'Immutable vault ownership path differs'};$owner=Get-Content -LiteralPath (Join-Path $vault 'ownership.json') -Raw|ConvertFrom-Json;if($owner.kind-ne 'spark-private-immutable-assets'-or $owner.schemaVersion-ne 1-or [IO.Path]::GetFullPath($owner.workspace)-ine $workspace){throw 'Unknown immutable preservation owner'}}
$nativeMode=$plan.nativeTagsExistingOnly-eq $true
$nativeClasses=@($NativeTagExtensions.Split('|')|Where-Object{$_});if(@($nativeClasses|Where-Object{$_-cnotmatch '^\.[a-z_]+$'}).Count){throw 'Invalid native classes from the trusted native-tag registry'}
if($nativeMode){
  if($cacheMode-or !$plan.existingVaultOnly-or [long]$plan.totals.newVaultBytes-ne 0){throw 'Native-tag extras require strictly existing preservation blobs'}
  $nativeVault=Join-Path $workspace 'preserved\native-tags';Ordinary $nativeVault;if([IO.Path]::GetFullPath($plan.nativeVault)-ine $nativeVault){throw 'Native tag vault path differs'}
  $nativeOwner=Get-Content -LiteralPath (Join-Path $nativeVault 'ownership.json') -Raw|ConvertFrom-Json;if($nativeOwner.kind-ne 'spark-private-native-tags'-or $nativeOwner.schemaVersion-ne 1-or [IO.Path]::GetFullPath($nativeOwner.workspace)-ine $workspace){throw 'Unknown native tag preservation owner'}
}elseif($nativeClasses.Count){throw 'Native classes supplied outside existing-CAS-only plan'}
if($plan.entries.Count-lt 1-or $plan.entries.Count-gt $(if($cacheMode-or $nativeMode-or $archiveMode){100000}else{10000})-or [long]$plan.totals.inputBytes-gt $(if($cacheMode){4GB}elseif($archiveMode){16GB}else{80GB})-or [long]$plan.totals.uniqueBytes-gt 12GB){throw 'Immutable plan exceeds its bounded limits'}
$journalRoot=[IO.Path]::GetFullPath($Journal)
if($journalRoot-ieq $local-or $journalRoot.StartsWith($local+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Retirement journal must remain outside .local'}
[IO.Directory]::CreateDirectory($journalRoot)|Out-Null;Ordinary $journalRoot $true
$log=[IO.File]::Open((Join-Path $journalRoot 'immutable-events.jsonl'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$writer=[IO.StreamWriter]::new($log,[Text.UTF8Encoding]::new($false));$writer.AutoFlush=$true
function Event($value){$writer.WriteLine(($value|ConvertTo-Json -Depth 8 -Compress));$log.Flush($true)}
function Process-Gate{
  foreach($p in @(Get-CimInstance Win32_Process|Where-Object{$_.Name-match '^(GuiltySpark.*|Spark-.*|halo.*|standalone|tool|invader-.*|baboon|sapien|guerilla|chupathingy.*|OpenCE.*|msedgewebview2|msedge|chrome|crashpad_handler)\.exe$'}|Select-Object ProcessId,ExecutablePath,CommandLine)){
    if((([string]$p.ExecutablePath)+' '+([string]$p.CommandLine)).IndexOf($local,[StringComparison]::OrdinalIgnoreCase)-ge 0){throw "Active obsolete asset process: $($p.ProcessId)"}
  }
}
$directories=@{};$blobs=@{};$owners=@{};$archiveArtifacts=@{};$inodeStates=@{};$rows=[Collections.Generic.List[object]]::new();$removed=0;$removedBytes=[long]0;$removedAllocation=[long]0;$vaultAllocation=[long]0;$seen=@{}
function Protect-Parents([string]$file){
  for($parent=[IO.Directory]::GetParent($file);$parent;$parent=$parent.Parent){$folder=$parent.FullName;if(!$directories.ContainsKey($folder)){Ordinary $folder;$directories[$folder]=[SparkSealedFiles]::Directory($folder);$info=[SparkSealedFiles]::Information($directories[$folder]);if(($info.Attributes-band 0x400)-ne 0){throw 'Directory reparse identity appeared'}}}
}
function Protect-RecoveryArtifact([string]$file,[string]$sha256,[long]$limit,[bool]$json){
  if($sha256-cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid recovery artifact hash'};Ordinary $file;Protect-Parents $file;$opened=[SparkSealedFiles+File]::new($file,$false)
  try{if([SparkSealedFiles]::Length($opened.Identity)-gt $limit-or $opened.Hash()-cne $sha256){throw 'Verified recovery artifact changed'};$protection=[SparkSealedFiles]::ProtectFile($file);$info=[SparkSealedFiles]::Information($protection);if([SparkSealedFiles]::Id($info)-cne [SparkSealedFiles]::Id($opened.Identity)-or [SparkSealedFiles]::VolumeId($info)-cne [SparkSealedFiles]::VolumeId($opened.Identity)){$protection.Dispose();throw 'Recovery artifact replaced before protection'};$archiveArtifacts[$file]=$protection
    if($json){$opened.Stream.Position=0;$reader=[IO.StreamReader]::new($opened.Stream,[Text.Encoding]::UTF8,$true,65536,$true);try{return $reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}
  }finally{$opened.Dispose()}
}
try{
  Process-Gate
  if($archiveMode){
    $proof=$plan.archiveProof;$preserved=Join-Path $workspace 'preserved\recovery-metadata';$archive=[IO.Path]::GetFullPath($proof.archive);$catalog=[IO.Path]::GetFullPath($proof.catalog);$receipt=[IO.Path]::GetFullPath($proof.receipt)
    if(!$receipt.StartsWith($preserved+'\',[StringComparison]::OrdinalIgnoreCase)-or [IO.Path]::GetDirectoryName($archive)-ine [IO.Path]::GetDirectoryName($receipt)-or [IO.Path]::GetDirectoryName($catalog)-ine [IO.Path]::GetDirectoryName($receipt)){throw 'Recovery proof leaves canonical preservation owner'}
    $readback=Protect-RecoveryArtifact $receipt $proof.receiptSha256 4MB $true
    if($readback.schemaVersion-ne 1-or $readback.kind-ne 'spark-local-recovery-copy-receipt'-or !$readback.complete-or !$readback.allObjectHashesVerified-or !$readback.regularMembersOnly-or $readback.linksFollowed-ne 0-or $readback.sourceDeletionPerformed-or [IO.Path]::GetFullPath($readback.workspace)-ine $workspace-or [IO.Path]::GetFullPath($readback.archive)-ine $archive-or [IO.Path]::GetFullPath($readback.catalog)-ine $catalog-or $readback.archiveSha256-cne $proof.archiveSha256-or $readback.catalogSha256-cne $proof.catalogSha256-or [long]$readback.archiveBytes-ne [long]$proof.archiveBytes){throw 'Recovery receipt does not establish complete original object readback'}
    Protect-RecoveryArtifact $archive $proof.archiveSha256 (8GB+512MB) $false
    # The reviewed Node projection validates all catalog rows. Keep the full
    # UTF-8 catalog sealed and hash-verified without expanding its large directory
    # inventory into another PowerShell object graph.
    Protect-RecoveryArtifact $catalog $proof.catalogSha256 128MB $false
    if([long]$proof.localSourceCount-ne $plan.entries.Count-or [long]$proof.externalIndexCount-lt 0-or [long]$proof.priorRetiredLocalSourceCount-lt 0-or [long]$proof.localSourceCount+[long]$proof.externalIndexCount+[long]$proof.priorRetiredLocalSourceCount-ne [long]$readback.files){throw 'Recovery catalog projection coverage differs'}
    if($plan.acknowledgementProofs){if($plan.acknowledgementProofs.Count-gt 8){throw 'Too many prior recovery acknowledgements'};foreach($ack in $plan.acknowledgementProofs){Protect-RecoveryArtifact $ack.manifest $ack.manifestSha256 64MB $false;Protect-RecoveryArtifact $ack.events $ack.eventsSha256 64MB $false}}
  }
  if($cacheMode){
    if($plan.cacheOwners.Count-lt 1-or $plan.cacheOwners.Count-gt 2048){throw 'QA cache profile ownership bound exceeded'}
    foreach($owner in $plan.cacheOwners){
      if(!$owner.profileRelative.StartsWith('.local/')-or $owner.profileRelative-notmatch '(?i)(?:^|/)(?:webview|ebwebview|[^/]+\.exe\.webview2)$'-or $owner.applicationRelative-notmatch '(?i)(?:^|/)(?:GuiltySpark|Spark[-_])[^/]*\.exe$'-or $owner.sha256-cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid QA profile application ownership'}
      $app=Join-Relative $workspace $owner.applicationRelative;$profile=Join-Relative $workspace $owner.profileRelative
      if(!$app.StartsWith($local+'\',[StringComparison]::OrdinalIgnoreCase)-or !$profile.StartsWith([IO.Path]::GetDirectoryName($app)+'\',[StringComparison]::OrdinalIgnoreCase)-or $owners.ContainsKey($owner.profileRelative)){throw 'QA profile is not beneath its adjacent Spark application'}
      Protect-Parents $app;Ordinary $profile;$appFile=[SparkSealedFiles+File]::new($app,$false)
      try{if(!(Source-Matches $appFile $owner)-or $appFile.Hash()-cne $owner.sha256){throw 'QA ownership application changed'};$protection=[SparkSealedFiles]::ProtectFile($app);$owners[$owner.profileRelative]=$protection}finally{$appFile.Dispose()}
    }
  }
  foreach($entry in $plan.entries){
    $relative=[string]$entry.sourceRelative
    $nativeEntry=$entry.preservationKind-eq 'native-tags';$extension=[IO.Path]::GetExtension($relative).ToLowerInvariant()
    if(!$relative.StartsWith('.local/')-or (!$archiveMode-and @($relative.Split('/')|Where-Object{$_-in @('.git','node_modules','.toolchain','tools','archives','releases')}).Count)){throw 'Protected or unrelated immutable source'}
    if($nativeEntry-and (!$nativeMode-or $extension-notin $nativeClasses)){throw 'Unrecognized native tag class'}
    if((!$cacheMode-and !$archiveMode-and !$nativeEntry-and $extension-notin @('.map','.yelo','.exe','.dll','.pdb','.dmp'))-or $entry.sha256-cnotmatch '^[a-f0-9]{64}$'-or [long]$entry.bytes-lt 0-or [long]$entry.bytes-gt $(if($archiveMode){8GB}else{512MB})){throw 'Unsupported immutable source or size'}
    if($seen.ContainsKey($relative)){throw 'Duplicate immutable plan entry'};$seen[$relative]=$true
    foreach($excluded in $plan.excludedRoots){if($relative-eq $excluded-or $relative.StartsWith($excluded+'/',[StringComparison]::OrdinalIgnoreCase)){throw 'Immutable plan overlaps another owned retirement plan'}}
    $source=Join-Relative $workspace $relative;Protect-Parents $source
    if($archiveMode){
      if($entry.namespace-or $entry.object-cne ('objects/'+$entry.sha256.Substring(0,2)+'/'+$entry.sha256)){throw 'Original source differs from reviewed archive object mapping'}
    }elseif($cacheMode){
      if(!$owners.ContainsKey($entry.ownerProfileRelative)-or !$relative.StartsWith($entry.ownerProfileRelative+'/',[StringComparison]::OrdinalIgnoreCase)){throw 'Cache has no proven adjacent Spark QA owner'}
      $tail=$relative.Substring($entry.ownerProfileRelative.Length+1)
      if($tail-notmatch '(?i)(?:^|/)(?:cache|code cache|gpucache|shadercache|grshadercache|dawncache|dawngraphitecache|cache storage|cachestorage|browsermetrics)/'-or $relative-match '(?i)\.(?:map|yelo|gsproject|sqlite3?|jms|obj|blend|weapon|scenario)$'){throw 'Non-cache project/source content is never disposable'}
    }else{
    $expectedBlob='preserved/'+$(if($nativeEntry){'native-tags'}else{'immutable-assets'})+'/blobs/'+$entry.sha256.Substring(0,2)+'/'+$entry.sha256
    $blobKey=$expectedBlob
    if($entry.blobRelative-cne $expectedBlob){throw 'Immutable blob mapping differs'}
    $saved=Join-Relative $workspace $expectedBlob;Protect-Parents $saved
    if(!$blobs.ContainsKey($blobKey)){
      Ordinary $saved;$copy=[SparkSealedFiles+File]::new($saved,$false)
      try{if($copy.Identity.Links-ne 1-or [SparkSealedFiles]::Length($copy.Identity)-ne [long]$entry.bytes-or $copy.Hash()-cne $entry.sha256){throw 'Preserved immutable blob changed'}
        $protection=[SparkSealedFiles]::ProtectFile($saved);$info=[SparkSealedFiles]::Information($protection)
        if([SparkSealedFiles]::Id($info)-cne [SparkSealedFiles]::Id($copy.Identity)-or [SparkSealedFiles]::VolumeId($info)-cne [SparkSealedFiles]::VolumeId($copy.Identity)){$protection.Dispose();throw 'Immutable blob was replaced before protection'}
        $vaultAllocation+=$copy.Allocation();$blobs[$blobKey]=@{handle=$protection;bytes=[long]$entry.bytes}
      }finally{$copy.Dispose()}
    }
    if($blobs[$blobKey].bytes-ne [long]$entry.bytes){throw 'Immutable hash/length collision'}
    }
    $file=[SparkSealedFiles+File]::new($source,$true)
    try{if(!(Source-Matches $file $entry)-or $file.Hash()-cne $entry.sha256){throw "Immutable source changed or replaced: $source"}
      if($plan.hardlinkLifecycle){
        if(!$archiveMode-or [long]$entry.links-lt 1-or [long]$entry.links-ne [long]$file.Identity.Links){throw 'Recovery source native link count changed'}
        $key=([string]$entry.dev)+'/'+([string]$entry.ino)
        if(!$inodeStates.ContainsKey($key)){$inodeStates[$key]=@{links=[long]$file.Identity.Links;initialLinks=[long]$file.Identity.Links;removed=0;sha256=$entry.sha256;ctimeNs=$entry.ctimeNs}}
        elseif($inodeStates[$key].links-ne [long]$file.Identity.Links-or $inodeStates[$key].sha256-cne $entry.sha256-or $inodeStates[$key].ctimeNs-cne $entry.ctimeNs){throw 'Inconsistent recovery inode baseline'}
      }
    }finally{$file.Dispose()}
    $rows.Add(@{path=$source;entry=$entry})
  }
  if($rows.Count-ne [int]$plan.totals.files-or (!$cacheMode-and !$archiveMode-and $blobs.Count-ne [int]$plan.totals.uniqueFiles)){throw 'Immutable plan totals differ'}
  Process-Gate;Event @{event='all-source-and-blob-hashes-verified';manifestSha256=$PlanSha256;files=$rows.Count;uniqueBlobs=$blobs.Count;at=[DateTime]::UtcNow.ToString('o')}
  foreach($row in $rows){
    $file=[SparkSealedFiles+File]::new($row.path,$true)
    $inode=$null
    try{
      if($plan.hardlinkLifecycle){
        $inode=$inodeStates[([string]$row.entry.dev)+'/'+([string]$row.entry.ino)]
        if(!$inode-or !(Content-Identity-Matches $file $row.entry)-or [long]$file.Identity.Links-ne $inode.initialLinks-$inode.removed-or ($inode.removed-eq 0-and [SparkSealedFiles]::UnixNs($file.BasicIdentity.Change)-cne $inode.ctimeNs)-or $file.Hash()-cne $row.entry.sha256){throw "Recovery source changed outside acknowledged hardlink lifecycle: $($row.path)"}
        # Only our own acknowledged unlinks may change surviving aliases' ctime.
        # The exact native link-count delta and fresh content identity/hash stay mandatory.
        $inode.ctimeNs=[SparkSealedFiles]::UnixNs($file.BasicIdentity.Change)
      }elseif(!(Source-Matches $file $row.entry)-or $file.Hash()-cne $row.entry.sha256){throw "Immutable source changed immediately before sealed deletion: $($row.path)"}
      $linksBefore=[long]$file.Identity.Links;$ctimeBefore=[SparkSealedFiles]::UnixNs($file.BasicIdentity.Change);$allocation=$file.Allocation();if(($file.Identity.Attributes-band 1)-ne 0){[SparkImmutableDisposition]::DeleteReadonly($file.Handle)}else{$file.DeleteVerified()}
    }finally{$file.Dispose()}
    if(Test-Path -LiteralPath $row.path){throw 'Sealed immutable delete did not remove source path'}
    if($inode){$inode.removed++}
    $removed++;$removedBytes+=[long]$row.entry.bytes;$removedAllocation+=$allocation
    Event @{event=if($cacheMode){'deleted-owned-regenerable-cache'}elseif($archiveMode){'deleted-archive-preserved-source'}else{'deleted-verified-duplicate'};sourceRelative=$row.entry.sourceRelative;sha256=$row.entry.sha256;blobRelative=$row.entry.blobRelative;object=$row.entry.object;dev=$row.entry.dev;ino=$row.entry.ino;nativeLinksBefore=$linksBefore;ctimeNsBefore=$ctimeBefore;ownUnlinksForInode=if($inode){$inode.removed}else{0};bytes=[long]$row.entry.bytes;allocationReleased=$allocation;filesRemoved=$removed}
  }
  $result=@{schemaVersion=1;complete=$true;manifestSha256=$PlanSha256;workerSha256=$env:SPARK_TRUSTED_SCRIPT_SHA;guardSha256=$plan.guardSha256;filesRemoved=$removed;logicalBytesRemoved=$removedBytes;fileAllocationBytesReleased=$removedAllocation;preservedUniqueBytes=[long]$plan.totals.uniqueBytes;preservedUniqueFileAllocationBytes=$vaultAllocation;newVaultBytes=[long]$plan.totals.newVaultBytes;netLogicalBytesAfterUniquePreservation=$removedBytes-[long]$plan.totals.uniqueBytes;netFileAllocationAfterUniquePreservation=$removedAllocation-$vaultAllocation;independentBlobs=$blobs.Count;existingMetadataTouched=$false;directoriesRemoved=0;at=[DateTime]::UtcNow.ToString('o')}
  if($archiveMode){$result.protectedArchiveSha256=$proof.archiveSha256;$result.protectedArchiveBytes=[long]$proof.archiveBytes;$result.protectedCatalogSha256=$proof.catalogSha256;$result.protectedCopyReceiptSha256=$proof.receiptSha256;$result.externalRecoveryIndexesRetired=0}
  Event @{event='complete';result=$result};$result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $journalRoot 'immutable-purge-receipt.json') -Encoding UTF8;$result|ConvertTo-Json -Depth 8 -Compress
}catch{Event @{event='stopped';error=$_.Exception.Message;filesRemoved=$removed;logicalBytesRemoved=$removedBytes;at=[DateTime]::UtcNow.ToString('o')};throw}
finally{foreach($value in $blobs.Values){$value.handle.Dispose()};foreach($handle in $owners.Values){$handle.Dispose()};foreach($handle in $archiveArtifacts.Values){$handle.Dispose()};foreach($handle in $directories.Values){$handle.Dispose()};$writer.Dispose();$log.Dispose();$manifestStream.Dispose()}

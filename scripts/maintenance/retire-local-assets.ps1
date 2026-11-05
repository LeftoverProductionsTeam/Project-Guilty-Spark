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
$preservedMode=$plan.operation-eq 'retire-preserved-redundancy'
if(($plan.scopeMode-eq 'preserved-consolidation')-ne $preservedMode-or ($plan.scopeMode-and !$preservedMode)){throw 'Preserved consolidation requires its explicit operation and canonical scope mode'}
if($plan.schemaVersion-ne 1-or (!$cacheMode-and !$archiveMode-and !$preservedMode-and $plan.operation-ne 'preserve-obsolete-immutable-assets')-or !$plan.complete-or $plan.sourceDeletionPerformed){throw 'Incomplete immutable asset plan'}
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
  [StructLayout(LayoutKind.Sequential)] public struct Standard { public long Allocation,End; public uint Links; public byte Pending,Directory; }
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int kind,ref DispositionEx value,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int kind,out Standard value,uint size);
  public static long AllocatedUnlinkBytes(SafeFileHandle handle) {
    Standard value;if(!GetFileInformationByHandleEx(handle,1,out value,(uint)Marshal.SizeOf(typeof(Standard))))throw new Win32Exception(Marshal.GetLastWin32Error(),"Read actual allocated file bytes");if(value.Allocation<0)throw new System.IO.IOException("Invalid native allocated-byte count");return value.Links==1?value.Allocation:0;
  }
  public static string HashRange(System.IO.Stream stream,long offset,long bytes) {
    if(offset<0||bytes<0||offset>stream.Length||bytes>stream.Length-offset)throw new System.IO.IOException("Retained range exceeds its container");stream.Position=offset;var buffer=new byte[65536];
    using(var hash=System.Security.Cryptography.SHA256.Create()){long remaining=bytes;while(remaining>0){int count=stream.Read(buffer,0,(int)Math.Min(buffer.Length,remaining));if(count==0)throw new System.IO.EndOfStreamException();hash.TransformBlock(buffer,0,count,buffer,0);remaining-=count;}hash.TransformFinalBlock(new byte[0],0,0);return BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant();}
  }
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
function Open-SealedSource([string]$path){
  try{return [SparkSealedFiles+File]::new($path,$true)}catch{$cause=$_.Exception;while($cause.InnerException){$cause=$cause.InnerException};$code=if($cause-is [ComponentModel.Win32Exception]){$cause.NativeErrorCode}else{'unknown'};throw "Cannot seal exclusive source access (native $code): $path"}
}
$workspace=[IO.Path]::GetFullPath($plan.workspace);Ordinary $workspace
$local=Join-Path $workspace '.local';$vault=Join-Path $workspace 'preserved\immutable-assets'
$scopeRoot=if($preservedMode){Join-Path $workspace 'preserved'}else{$local}
if(!$cacheMode-and !$archiveMode-and !$preservedMode){Ordinary $vault;if([IO.Path]::GetFullPath($plan.vault)-ine $vault){throw 'Immutable vault ownership path differs'};$owner=Get-Content -LiteralPath (Join-Path $vault 'ownership.json') -Raw|ConvertFrom-Json;if($owner.kind-ne 'spark-private-immutable-assets'-or $owner.schemaVersion-ne 1-or [IO.Path]::GetFullPath($owner.workspace)-ine $workspace){throw 'Unknown immutable preservation owner'}}
$nativeMode=$plan.nativeTagsExistingOnly-eq $true
if($preservedMode-and ($nativeMode-or $plan.hardlinkLifecycle)){throw 'Preserved source consolidation never relaxes independent file identity'}
$nativeClasses=@($NativeTagExtensions.Split('|')|Where-Object{$_});if(@($nativeClasses|Where-Object{$_-cnotmatch '^\.[a-z_]+$'}).Count){throw 'Invalid native classes from the trusted native-tag registry'}
if($nativeMode){
  if($cacheMode-or !$plan.existingVaultOnly-or [long]$plan.totals.newVaultBytes-ne 0){throw 'Native-tag extras require strictly existing preservation blobs'}
  $nativeVault=Join-Path $workspace 'preserved\native-tags';Ordinary $nativeVault;if([IO.Path]::GetFullPath($plan.nativeVault)-ine $nativeVault){throw 'Native tag vault path differs'}
  $nativeOwner=Get-Content -LiteralPath (Join-Path $nativeVault 'ownership.json') -Raw|ConvertFrom-Json;if($nativeOwner.kind-ne 'spark-private-native-tags'-or $nativeOwner.schemaVersion-ne 1-or [IO.Path]::GetFullPath($nativeOwner.workspace)-ine $workspace){throw 'Unknown native tag preservation owner'}
}elseif($nativeClasses.Count){throw 'Native classes supplied outside existing-CAS-only plan'}
if($plan.entries.Count-lt 1-or $plan.entries.Count-gt $(if($preservedMode){30000}elseif($cacheMode-or $nativeMode-or $archiveMode){100000}else{10000})-or [long]$plan.totals.inputBytes-gt $(if($preservedMode){40GB}elseif($cacheMode){4GB}elseif($archiveMode){16GB}else{80GB})-or [long]$plan.totals.uniqueBytes-gt 12GB){throw 'Immutable plan exceeds its bounded limits'}
$journalRoot=[IO.Path]::GetFullPath($Journal)
if($journalRoot-ieq $scopeRoot-or $journalRoot.StartsWith($scopeRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Retirement evidence must remain outside its protected source root'}
[IO.Directory]::CreateDirectory($journalRoot)|Out-Null;Ordinary $journalRoot $true
$log=[IO.File]::Open((Join-Path $journalRoot 'immutable-events.jsonl'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$writer=[IO.StreamWriter]::new($log,[Text.UTF8Encoding]::new($false));$writer.AutoFlush=$true
function Event($value){$writer.WriteLine(($value|ConvertTo-Json -Depth 8 -Compress));$log.Flush($true)}
function Process-Gate{
  foreach($p in @(Get-CimInstance Win32_Process|Where-Object{$_.Name-match '^(GuiltySpark.*|Spark-.*|halo.*|standalone|tool|invader-.*|baboon|sapien|guerilla|chupathingy.*|OpenCE.*|msedgewebview2|msedge|chrome|crashpad_handler)\.exe$'}|Select-Object ProcessId,ExecutablePath,CommandLine)){
    if((([string]$p.ExecutablePath)+' '+([string]$p.CommandLine)).IndexOf($scopeRoot,[StringComparison]::OrdinalIgnoreCase)-ge 0){throw "Active source asset process: $($p.ProcessId)"}
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
function Provider-Equal($left,$right){
  if(!$left-or !$right){return $false};$names=@($left.PSObject.Properties.Name);if($names.Count-ne @($right.PSObject.Properties.Name).Count){return $false};foreach($name in $names){if($name-cnotin @($right.PSObject.Properties.Name)-or [string]$left.$name-cne [string]$right.$name){return $false}};return $true
}
try{
  Process-Gate
  if($preservedMode){
    Ordinary $scopeRoot;$proof=$plan.providerProof
    # Node validates the complete index projection before invocation. Sealing
    # its full SHA here avoids another large PowerShell index object graph.
    Protect-RecoveryArtifact $proof.index $proof.indexSha256 128MB $false
    $verification=Protect-RecoveryArtifact $proof.receipt $proof.receiptSha256 128MB $true
    if($verification.schemaVersion-ne 1-or $verification.kind-ne 'spark-provider-verification'-or !$verification.complete-or !$verification.fullReadback-or $verification.indexSha256-cne $proof.indexSha256-or [IO.Path]::GetFullPath($verification.indexPath)-ine [IO.Path]::GetFullPath($proof.index)){throw 'Retained provider readback receipt is invalid'}
    $verifiedObjects=@{};foreach($object in $verification.objects){if(!$object.fullReadback-or $object.sourceSha256-cne $object.sha256-or ($object.indexSha256-and $object.indexSha256-cne $proof.indexSha256)-or $object.sha256-cnotmatch '^[a-f0-9]{64}$'-or $verifiedObjects.ContainsKey($object.sha256)){throw 'Invalid duplicate verified provider object'};$verifiedObjects[$object.sha256]=$object}
    $sourcePaths=@{};foreach($entry in $plan.entries){if(!$entry.sourceRelative.StartsWith('preserved/')){throw 'Preserved source leaves canonical namespace'};$full=Join-Relative $workspace $entry.sourceRelative;if($sourcePaths.ContainsKey($full)-or $full-ieq $proof.index-or $full-ieq $proof.receipt){throw 'Duplicate or protected preservation metadata source'};$sourcePaths[$full]=$true}
    $providerHandles=@{};foreach($container in $proof.containers){$relative=[string]$container.path;$full=Join-Relative $scopeRoot $relative;if($sourcePaths.ContainsKey($full)-or $providerHandles.ContainsKey($relative)){throw 'Retained provider is itself scheduled for removal'};Protect-RecoveryArtifact $full $container.sha256 40GB $false
      $handle=$archiveArtifacts[$full];$current=[pscustomobject]@{Identity=[SparkSealedFiles]::Information($handle);BasicIdentity=[SparkSealedFiles]::BasicInformation($handle)};if(!(Source-Matches $current $container)){throw 'Retained provider file identity changed'};$providerHandles[$relative]=$current
    }
    if($providerHandles.Count-lt 1-or $providerHandles.Count-gt 128){throw 'Retained container count exceeds its explicit bound'}
  }
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
    if($preservedMode){if(!$relative.StartsWith('preserved/')){throw 'Consolidation source is outside canonical preserved'}}elseif(!$relative.StartsWith('.local/')-or (!$archiveMode-and @($relative.Split('/')|Where-Object{$_-in @('.git','node_modules','.toolchain','tools','archives','releases')}).Count)){throw 'Protected or unrelated immutable source'}
    if($nativeEntry-and (!$nativeMode-or $extension-notin $nativeClasses)){throw 'Unrecognized native tag class'}
    if((!$cacheMode-and !$archiveMode-and !$preservedMode-and !$nativeEntry-and $extension-notin @('.map','.yelo','.exe','.dll','.pdb','.dmp'))-or $entry.sha256-cnotmatch '^[a-f0-9]{64}$'-or [long]$entry.bytes-lt 0-or [long]$entry.bytes-gt $(if($archiveMode-or $preservedMode){8GB}else{512MB})){throw 'Unsupported immutable source or size'}
    if($seen.ContainsKey($relative)){throw 'Duplicate immutable plan entry'};$seen[$relative]=$true
    foreach($excluded in $plan.excludedRoots){if($relative-eq $excluded-or $relative.StartsWith($excluded+'/',[StringComparison]::OrdinalIgnoreCase)){throw 'Immutable plan overlaps another owned retirement plan'}}
    $source=Join-Relative $workspace $relative;Protect-Parents $source
    if($preservedMode){
      $provider=$entry.provider;$object=$verifiedObjects[$entry.sha256]
      if(!$object-or $object.bytes-ne $entry.bytes-or !(Provider-Equal $provider $object.provider)-or $entry.providerRef.table-ne 'objects'-or $entry.providerRef.key-cne $entry.sha256-or $object.providerRef.table-ne 'objects'-or $object.providerRef.key-cne $entry.sha256-or $provider.bytes-ne $entry.bytes-or $provider.kind-notin @('raw','zip-member','range')-or !$providerHandles.ContainsKey($provider.path)){throw 'Source has no exact verified retained provider'}
      if($provider.kind-eq 'zip-member'-and (!$object.crcVerified-or !$provider.member-or $provider.member.Contains('\')-or $provider.member.StartsWith('/')-or @($provider.member.Split('/')|Where-Object{!$_-or $_-eq '..'}).Count)){throw 'Archive member has no CRC-checked native readback'}
      $retained=Join-Relative $scopeRoot $provider.path;$expectedSha=if($provider.kind-eq 'raw'){$entry.sha256}else{$provider.containerSha256};$expectedBytes=if($provider.kind-eq 'raw'){$entry.bytes}else{$provider.containerBytes};$container=@($proof.containers|Where-Object{$_.path-ceq $provider.path})[0]
      if($expectedSha-cne $container.sha256-or [long]$expectedBytes-ne [long]$container.bytes-or ($source-ieq $retained)-or $retained.StartsWith($source+'\',[StringComparison]::OrdinalIgnoreCase)-or ([string]$entry.dev-ceq [SparkSealedFiles]::VolumeId($providerHandles[$provider.path].Identity)-and [string]$entry.ino-ceq [SparkSealedFiles]::Id($providerHandles[$provider.path].Identity))){throw 'Source aliases or disagrees with its retained provider'}
      if($provider.kind-eq 'range'){$range=[SparkSealedFiles+File]::new($retained,$false);try{if([SparkImmutableDisposition]::HashRange($range.Stream,[long]$provider.offset,[long]$entry.bytes)-cne $entry.sha256){throw 'Retained provider range differs'}}finally{$range.Dispose()}}
    }elseif($archiveMode){
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
    $file=Open-SealedSource $source
    try{if(!(Source-Matches $file $entry)-or $file.Hash()-cne $entry.sha256-or ($preservedMode-and ($file.Identity.Links-ne 1-or [long]$entry.links-ne 1))){throw "Immutable source changed or replaced: $source"}
      if($plan.hardlinkLifecycle){
        if(!$archiveMode-or [long]$entry.links-lt 1-or [long]$entry.links-ne [long]$file.Identity.Links){throw 'Recovery source native link count changed'}
        $key=([string]$entry.dev)+'/'+([string]$entry.ino)
        if(!$inodeStates.ContainsKey($key)){$inodeStates[$key]=@{links=[long]$file.Identity.Links;initialLinks=[long]$file.Identity.Links;removed=0;sha256=$entry.sha256;ctimeNs=$entry.ctimeNs}}
        elseif($inodeStates[$key].links-ne [long]$file.Identity.Links-or $inodeStates[$key].sha256-cne $entry.sha256-or $inodeStates[$key].ctimeNs-cne $entry.ctimeNs){throw 'Inconsistent recovery inode baseline'}
      }
    }finally{$file.Dispose()}
    $rows.Add(@{path=$source;entry=$entry})
  }
  if($rows.Count-ne [int]$plan.totals.files-or (!$cacheMode-and !$archiveMode-and !$preservedMode-and $blobs.Count-ne [int]$plan.totals.uniqueFiles)){throw 'Immutable plan totals differ'}
  Process-Gate;Event @{event='all-source-and-blob-hashes-verified';manifestSha256=$PlanSha256;files=$rows.Count;uniqueBlobs=$blobs.Count;at=[DateTime]::UtcNow.ToString('o')}
  foreach($row in $rows){
    $file=Open-SealedSource $row.path
    $inode=$null
    try{
      if($plan.hardlinkLifecycle){
        $inode=$inodeStates[([string]$row.entry.dev)+'/'+([string]$row.entry.ino)]
        if(!$inode-or !(Content-Identity-Matches $file $row.entry)-or [long]$file.Identity.Links-ne $inode.initialLinks-$inode.removed-or ($inode.removed-eq 0-and [SparkSealedFiles]::UnixNs($file.BasicIdentity.Change)-cne $inode.ctimeNs)-or $file.Hash()-cne $row.entry.sha256){throw "Recovery source changed outside acknowledged hardlink lifecycle: $($row.path)"}
        # Only our own acknowledged unlinks may change surviving aliases' ctime.
        # The exact native link-count delta and fresh content identity/hash stay mandatory.
        $inode.ctimeNs=[SparkSealedFiles]::UnixNs($file.BasicIdentity.Change)
      }elseif(!(Source-Matches $file $row.entry)-or $file.Hash()-cne $row.entry.sha256){throw "Immutable source changed immediately before sealed deletion: $($row.path)"}
      if($preservedMode-and $file.Identity.Links-ne 1){throw 'Preserved source gained an alias before deletion'}
      $linksBefore=[long]$file.Identity.Links;$ctimeBefore=[SparkSealedFiles]::UnixNs($file.BasicIdentity.Change);$allocation=if($preservedMode){[SparkImmutableDisposition]::AllocatedUnlinkBytes($file.Handle)}else{$file.Allocation()};if(($file.Identity.Attributes-band 1)-ne 0){[SparkImmutableDisposition]::DeleteReadonly($file.Handle)}else{$file.DeleteVerified()}
    }finally{$file.Dispose()}
    if(Test-Path -LiteralPath $row.path){throw 'Sealed immutable delete did not remove source path'}
    if($inode){$inode.removed++}
    $removed++;$removedBytes+=[long]$row.entry.bytes;$removedAllocation+=$allocation
    Event @{event=if($preservedMode){'deleted-preserved-redundancy'}elseif($cacheMode){'deleted-owned-regenerable-cache'}elseif($archiveMode){'deleted-archive-preserved-source'}else{'deleted-verified-duplicate'};sourceRelative=$row.entry.sourceRelative;sha256=$row.entry.sha256;blobRelative=$row.entry.blobRelative;object=$row.entry.object;provider=$row.entry.provider;dev=$row.entry.dev;ino=$row.entry.ino;nativeLinksBefore=$linksBefore;ctimeNsBefore=$ctimeBefore;ownUnlinksForInode=if($inode){$inode.removed}else{0};bytes=[long]$row.entry.bytes;allocationReleased=$allocation;filesRemoved=$removed}
  }
  $result=@{schemaVersion=1;complete=$true;manifestSha256=$PlanSha256;workerSha256=$env:SPARK_TRUSTED_SCRIPT_SHA;guardSha256=$plan.guardSha256;filesRemoved=$removed;logicalBytesRemoved=$removedBytes;fileAllocationBytesReleased=$removedAllocation;preservedUniqueBytes=[long]$plan.totals.uniqueBytes;preservedUniqueFileAllocationBytes=$vaultAllocation;newVaultBytes=[long]$plan.totals.newVaultBytes;netLogicalBytesAfterUniquePreservation=$removedBytes-[long]$plan.totals.uniqueBytes;netFileAllocationAfterUniquePreservation=$removedAllocation-$vaultAllocation;independentBlobs=$blobs.Count;existingMetadataTouched=$false;directoriesRemoved=0;at=[DateTime]::UtcNow.ToString('o')}
  if($archiveMode){$result.protectedArchiveSha256=$proof.archiveSha256;$result.protectedArchiveBytes=[long]$proof.archiveBytes;$result.protectedCatalogSha256=$proof.catalogSha256;$result.protectedCopyReceiptSha256=$proof.receiptSha256;$result.externalRecoveryIndexesRetired=0}
  if($preservedMode){$result.scopeMode='preserved-consolidation';$result.providerIndexSha256=$proof.indexSha256;$result.providerVerificationReceiptSha256=$proof.receiptSha256;$result.retainedProviderContainers=$providerHandles.Count;$result.allocatedBytesMethod='FileStandardInfo.Allocation, single independent file unlink';$result.sourceDeletionPerformed=$removed-gt 0}
  Event @{event='complete';result=$result};$result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $journalRoot 'immutable-purge-receipt.json') -Encoding UTF8;$result|ConvertTo-Json -Depth 8 -Compress
}catch{Event @{event='stopped';error=$_.Exception.Message;filesRemoved=$removed;logicalBytesRemoved=$removedBytes;at=[DateTime]::UtcNow.ToString('o')};throw}
finally{foreach($value in $blobs.Values){$value.handle.Dispose()};foreach($handle in $owners.Values){$handle.Dispose()};foreach($handle in $archiveArtifacts.Values){$handle.Dispose()};foreach($handle in $directories.Values){$handle.Dispose()};$writer.Dispose();$log.Dispose();$manifestStream.Dispose()}

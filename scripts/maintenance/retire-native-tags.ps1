param([Parameter(Mandatory=$true)][string]$Plan,[Parameter(Mandatory=$true)][string]$PlanSha256,[string]$SharedHelperPath)
# JSONL exact-entry worker. The Node owner must fsync intent and enforce current
# native-process quiescence before submitting each batch. It owns resumption.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if(!$SharedHelperPath){$SharedHelperPath=Join-Path $PSScriptRoot 'windows-sealed-files.cs'}
if(-not ('SparkSealedFiles' -as [type])){Add-Type -Path $SharedHelperPath}
function Reply($value){[Console]::Out.WriteLine(($value|ConvertTo-Json -Depth 6 -Compress));[Console]::Out.Flush()}
function Ordinary([string]$p,[bool]$journalCloud=$false){
  for($current=[IO.Path]::GetFullPath($p);$current;){$handle=[SparkSealedFiles]::Directory($current);try{$info=[SparkSealedFiles]::Information($handle);if(($info.Attributes-band 0x400)-ne 0){if(!$journalCloud-or ![SparkSealedFiles]::IsCloudPlaceholder($current)){throw "Reparse path refused: $current"}}}finally{$handle.Dispose()};$parent=[IO.Directory]::GetParent($current);if(!$parent){break};$current=$parent.FullName}
}
function Relative([string]$value){
  if(!$value-or $value.Length-gt 32768-or $value.Contains('\')-or $value.Contains(':')-or $value-match '[\x00-\x1f]' -or @($value.Split('/')|Where-Object{!$_-or $_-eq '.'-or $_-eq '..'-or $_.EndsWith('.')-or $_.EndsWith(' ')}).Count){throw 'Unsafe relative tag path'}
  return $value
}
function Join-Relative([string]$root,[string]$relative){
  $null=Relative $relative;$full=[IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/','\')))
  if(!$full.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Native path leaves its owned root'}
  return $full
}
function Read-HashedJson([string]$file,[string]$expected){
  if($expected-cnotmatch '^[a-f0-9]{64}$'){throw 'Invalid reviewed hash'};Ordinary $file $true
  $stream=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$hasher=[Security.Cryptography.SHA256]::Create()
  try{if($stream.Length-gt 256MB){throw 'Oversized native manifest'};$hash=[BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','').ToLowerInvariant();if($hash-cne $expected){throw 'Reviewed native manifest changed'};$stream.Position=0;$reader=[IO.StreamReader]::new($stream,[Text.Encoding]::UTF8,$true,65536,$true);try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()};return ($text|ConvertFrom-Json)}finally{$hasher.Dispose();$stream.Dispose()}
}
function Protect-Directory([string]$folder,$guards,$expected=$null){
  if(!$guards.ContainsKey($folder)){
    $parent=[IO.Directory]::GetParent($folder);if($parent){Protect-Directory $parent.FullName $guards}
    Ordinary $folder;if($guards.Count-ge 20000){throw 'Source directory protection bound exceeded'}
    $handle=[SparkSealedFiles]::Directory($folder);$info=[SparkSealedFiles]::Information($handle)
    if(($info.Attributes-band 0x400)-ne 0-or ($info.Attributes-band 0x10)-eq 0){$handle.Dispose();throw 'Linked/non-directory ancestor refused'}
    $guards[$folder]=$handle
  }
  if($expected){$info=[SparkSealedFiles]::Information($guards[$folder]);if([SparkSealedFiles]::Id($info)-cne [string]$expected.ino-or [SparkSealedFiles]::VolumeId($info)-cne [string]$expected.dev){throw 'Native source directory was replaced'}}
}
function Clear-Guards($guards){foreach($handle in $guards.Values){$handle.Dispose()};$guards.Clear()}
function Source-Matches($file,$expected){
  return [SparkSealedFiles]::Id($file.Identity)-ceq [string]$expected.ino-and [SparkSealedFiles]::VolumeId($file.Identity)-ceq [string]$expected.dev-and [SparkSealedFiles]::Length($file.Identity)-eq [long]$expected.bytes-and [SparkSealedFiles]::ModifiedNs($file.Identity)-ceq [string]$expected.mtimeNs-and [SparkSealedFiles]::UnixNs($file.BasicIdentity.Change)-ceq [string]$expected.ctimeNs
}
$sourceGuards=@{};$vaultGuards=@{};$blobGuards=@{};$currentHash=$null;$currentManifest=$null;$entries=@{};$directories=@{};$sourceRoot=$null;$ownerGuard=$null
try{
  $planObject=Read-HashedJson $Plan $PlanSha256
  if($planObject.schemaVersion-ne 1-or $planObject.operation-cne 'preserve-native-tag-trees'-or !$planObject.complete-or $planObject.sourceDeletionPerformed-or !$planObject.trees-or $planObject.trees.Count-gt 512){throw 'Incomplete/unreviewed native plan'}
  $workspace=[IO.Path]::GetFullPath($planObject.workspace);Ordinary $workspace
  $vault=Join-Path $workspace 'preserved\native-tags';if([IO.Path]::GetFullPath($planObject.vault)-ine $vault){throw 'Unexpected native vault'};Protect-Directory $vault $vaultGuards
  $ownerFile=Join-Path $vault 'ownership.json';Ordinary $ownerFile;$ownerGuard=[SparkSealedFiles]::ProtectFile($ownerFile)
  $owner=Get-Content -LiteralPath $ownerFile -Raw|ConvertFrom-Json
  if($owner.schemaVersion-ne 1-or $owner.kind-cne 'spark-private-native-tags'-or [IO.Path]::GetFullPath($owner.workspace)-ine $workspace){throw 'Native vault owner changed'}
  $reviewedTrees=@{}
  foreach($tree in $planObject.trees){
    if($tree.manifestSha256-cnotmatch '^[a-f0-9]{64}$'-or $reviewedTrees.ContainsKey($tree.manifestSha256)){throw 'Duplicate/invalid reviewed native tree'}
    $relative=Relative $tree.sourceRelative
    if(!$relative.StartsWith('.local/')-or !$relative.EndsWith('/tags')-or @($relative.Split('/')|Where-Object{$_-in @('.git','.toolchain','node_modules')-or $_.EndsWith('.git')}).Count){throw 'Source is not an admitted obsolete native tags tree'}
    $reviewedTrees[$tree.manifestSha256]=$tree
  }
  Reply @{type='ready';planSha256=$PlanSha256;requiresQuiescentCaller=$true;sameNativeHandleDeletion=$true}
  while(($line=[Console]::In.ReadLine())-ne $null){
    $request=$null;$sourceFile=$null;$pendingBlobProtection=$null
    try{
      if($line.Length-gt 65536){throw 'Oversized native retirement request'};$request=$line|ConvertFrom-Json
      if($null-eq $request.id-or ([string]$request.id).Length-gt 128-or @($request.PSObject.Properties.Name|Where-Object{$_-notin @('id','manifestSha256','relative')}).Count){throw 'Invalid native retirement request'}
      $manifestHash=[string]$request.manifestSha256;if(!$reviewedTrees.ContainsKey($manifestHash)){throw 'Tree was not in the exact reviewed plan'}
      if($currentHash-cne $manifestHash){
        Clear-Guards $sourceGuards;$entries=@{};$directories=@{};$currentHash=$null;$currentManifest=$null
        $tree=$reviewedTrees[$manifestHash];$manifestObject=Read-HashedJson $tree.manifest $manifestHash
        if($manifestObject.schemaVersion-ne 1-or $manifestObject.kind-cne 'native-tag-tree'-or $manifestObject.workspace-cne $planObject.workspace-or $manifestObject.vault-cne $planObject.vault-or $manifestObject.sourceRelative-cne $tree.sourceRelative-or $manifestObject.entries.Count-gt 20000){throw 'Native tree manifest escaped the reviewed plan'}
        $sourceRoot=Join-Relative $workspace $manifestObject.sourceRelative
        foreach($d in $manifestObject.directories){if($d.relative){$null=Relative $d.relative};if($directories.ContainsKey([string]$d.relative)){throw 'Duplicate source directory identity'};$directories[[string]$d.relative]=$d.identity}
        if(!$directories.ContainsKey('')){throw 'Missing native root identity'};Protect-Directory $sourceRoot $sourceGuards $directories['']
        foreach($entry in $manifestObject.entries){$relative=Relative $entry.relative;if($entries.ContainsKey($relative)-or $entry.sha256-cnotmatch '^[a-f0-9]{64}$'-or [long]$entry.bytes-lt 0-or [long]$entry.bytes-gt 512MB){throw 'Invalid/duplicate native entry'};$entries[$relative]=$entry}
        if($entries.Count-ne [int]$tree.files){throw 'Reviewed native tree file count changed'};$currentHash=$manifestHash;$currentManifest=$manifestObject
      }
      $relative=Relative $request.relative;if(!$entries.ContainsKey($relative)){throw 'Tag is not in the exact reviewed manifest'};$entry=$entries[$relative]
      $parent=[IO.Path]::GetDirectoryName($relative.Replace('/','\'));$parents=@('');if($parent){$prefix='';foreach($part in $parent.Split('\')){$prefix=if($prefix){$prefix+'/'+$part}else{$part};$parents+=,$prefix}}
      foreach($parentRelative in $parents){if(!$directories.ContainsKey($parentRelative)){throw 'Missing native ancestor identity'};$folder=if($parentRelative){Join-Relative $sourceRoot $parentRelative}else{$sourceRoot};Protect-Directory $folder $sourceGuards $directories[$parentRelative]}
      $blobFile=Join-Path (Join-Path (Join-Path $vault 'blobs') $entry.sha256.Substring(0,2)) $entry.sha256
      if(!$blobGuards.ContainsKey($entry.sha256)){
        if($blobGuards.Count-ge 65536){throw 'Verified blob protection bound exceeded'};Protect-Directory ([IO.Path]::GetDirectoryName($blobFile)) $vaultGuards
        $blob=[SparkSealedFiles+File]::new($blobFile,$false)
        try{if($blob.Identity.Links-ne 1-or [SparkSealedFiles]::Length($blob.Identity)-ne [long]$entry.bytes-or $blob.Hash()-cne $entry.sha256){throw 'Preserved native blob changed'};$pendingBlobProtection=[SparkSealedFiles]::ProtectFile($blobFile);$locked=[SparkSealedFiles]::Information($pendingBlobProtection);if([SparkSealedFiles]::Id($locked)-cne [SparkSealedFiles]::Id($blob.Identity)-or [SparkSealedFiles]::VolumeId($locked)-cne [SparkSealedFiles]::VolumeId($blob.Identity)){throw 'Blob protection identity changed'};$blobGuards[$entry.sha256]=@{handle=$pendingBlobProtection;bytes=[long]$entry.bytes};$pendingBlobProtection=$null}finally{$blob.Dispose()}
      }
      if($blobGuards[$entry.sha256].bytes-ne [long]$entry.bytes){throw 'Reviewed native blob length collision'}
      $source=Join-Relative $sourceRoot $relative;$sourceFile=[SparkSealedFiles+File]::new($source,$true)
      if(!(Source-Matches $sourceFile $entry)-or $sourceFile.Hash()-cne $entry.sha256){throw 'Native source changed/replaced before sealed deletion'}
      $after=[SparkSealedFiles]::Information($sourceFile.Handle);$basicAfter=[SparkSealedFiles]::BasicInformation($sourceFile.Handle)
      if([SparkSealedFiles]::Id($after)-cne [string]$entry.ino-or [SparkSealedFiles]::ModifiedNs($after)-cne [string]$entry.mtimeNs-or [SparkSealedFiles]::UnixNs($basicAfter.Change)-cne [string]$entry.ctimeNs){throw 'Native source changed while sealed'}
      $allocation=$sourceFile.Allocation();$sourceFile.DeleteVerified();$sourceFile.Dispose();$sourceFile=$null
      Reply @{id=$request.id;ok=$true;removed=$true;bytes=[long]$entry.bytes;sha256=$entry.sha256;allocationReleased=$allocation}
    }catch{$message=$_.Exception.Message;if($sourceFile){$sourceFile.Dispose();$sourceFile=$null};if($pendingBlobProtection){$pendingBlobProtection.Dispose();$pendingBlobProtection=$null};Reply @{id=if($request){$request.id}else{$null};ok=$false;removed=$false;error=$message}}
    finally{if($sourceFile){$sourceFile.Dispose()};if($pendingBlobProtection){$pendingBlobProtection.Dispose()}}
  }
}catch{Reply @{type='fatal';ok=$false;error=$_.Exception.Message};exit 1}
finally{Clear-Guards $sourceGuards;Clear-Guards $vaultGuards;foreach($blob in $blobGuards.Values){$blob.handle.Dispose()};if($ownerGuard){$ownerGuard.Dispose()}}

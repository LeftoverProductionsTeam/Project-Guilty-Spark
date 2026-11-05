param([Parameter(Mandatory=$true)][string]$Workspace,[Parameter(Mandatory=$true)][string]$ObjectPath,[Parameter(Mandatory=$true)][string]$Output,[Parameter(Mandatory=$true)][string]$HelperPath)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition ([IO.File]::ReadAllText($HelperPath))
$capture=[SparkReparseObjects]::Capture($Workspace,$ObjectPath)
$record=[ordered]@{schemaVersion=1;kind='spark-native-reparse-capture';workspace=$Workspace;at=[DateTime]::UtcNow.ToString('o');noFollow=$true;sourceDeletionPerformed=$false;capture=$capture}
$json=$record | ConvertTo-Json -Depth 5
$stream=[IO.File]::Open($Output,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$bytes=[Text.Encoding]::UTF8.GetBytes($json+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
$json

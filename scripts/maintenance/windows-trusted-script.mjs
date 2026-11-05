// Normal PowerShell command invocation for exact locally reviewed source.
// No execution-policy override or system setting is changed. Paths are data.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const command=`$ErrorActionPreference='Stop';$scriptStream=$null;$helperStream=$null;$hasher=[Security.Cryptography.SHA256]::Create();try{$scriptStream=[IO.File]::Open($env:SPARK_TRUSTED_SCRIPT,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$helperStream=[IO.File]::Open($env:SPARK_TRUSTED_HELPER,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);if([BitConverter]::ToString($hasher.ComputeHash($scriptStream)).Replace('-','').ToLowerInvariant()-cne $env:SPARK_TRUSTED_SCRIPT_SHA){throw 'Trusted local script hash changed'};if([BitConverter]::ToString($hasher.ComputeHash($helperStream)).Replace('-','').ToLowerInvariant()-cne $env:SPARK_TRUSTED_HELPER_SHA){throw 'Trusted native helper hash changed'};$scriptStream.Position=0;$reader=[IO.StreamReader]::new($scriptStream,[Text.Encoding]::UTF8,$true,65536,$true);try{$source=$reader.ReadToEnd()}finally{$reader.Dispose()};$parameters=@{};foreach($p in (ConvertFrom-Json $env:SPARK_TRUSTED_PARAMETERS).PSObject.Properties){$parameters[$p.Name]=$p.Value};if($parameters.SharedHelperPath-ine $env:SPARK_TRUSTED_HELPER){throw 'Native helper argument changed'};&([ScriptBlock]::Create($source)) @parameters}finally{if($scriptStream){$scriptStream.Dispose()};if($helperStream){$helperStream.Dispose()};$hasher.Dispose()}`;
export async function trustedScriptInvocation(script,helper,parameters){
  script=path.resolve(script);helper=path.resolve(helper);
  for(const [key,value]of Object.entries(parameters))if(!/^[A-Za-z][A-Za-z0-9]*$/.test(key)||typeof value!=='string')throw Error('Trusted script parameters must be named string values');
  const [scriptBytes,helperBytes]=await Promise.all([fs.readFile(script),fs.readFile(helper)]);if(scriptBytes.length>2*1024**2||helperBytes.length>2*1024**2)throw Error('Trusted maintenance source exceeds its bound');
  return {args:['-NoProfile','-NonInteractive','-Command',command],env:{...process.env,SPARK_TRUSTED_SCRIPT:script,SPARK_TRUSTED_SCRIPT_SHA:hash(scriptBytes),SPARK_TRUSTED_HELPER:helper,SPARK_TRUSTED_HELPER_SHA:hash(helperBytes),SPARK_TRUSTED_PARAMETERS:JSON.stringify({...parameters,SharedHelperPath:helper})}};
}

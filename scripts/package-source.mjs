// Package audited source roots only. Never enumerate caches or game directories.
// Usage: node scripts/package-source.mjs <fresh-output.zip>
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
if(process.platform!=='win32')throw new Error('This release helper currently uses Windows .NET ZIP; use the recorded manifest on other hosts.');
const output=path.resolve(process.argv[2]??'releases/Project_Guilty_Spark_Continuation_35_SOURCE.zip');
if(await fs.stat(output).then(()=>true,()=>false))throw new Error('Refusing to overwrite an existing source release');
const roots=['src','src-tauri','crates','scripts','tests','docs','examples','public','.github'];
const excludedDirectories=new Set(['target','dist','node_modules','.git','.local','.research','.toolchain']);
const excludedPrefixes=['src-tauri/gen','src-tauri/icons/android','src-tauri/icons/ios'];
const excludedExtensions=new Set(['.exe','.dll','.pdb','.map','.yelo','.sqlite3','.woff','.woff2','.log']);
const files=[];
async function walk(directory){if(excludedPrefixes.includes(directory.replaceAll('\\','/')))return;for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error(`Linked source file refused: ${file}`);if(entry.isDirectory()){if(!excludedDirectories.has(entry.name))await walk(file);}else if(entry.isFile()&&!excludedExtensions.has(path.extname(file).toLowerCase())&&!file.endsWith('.tsbuildinfo')&&!/\.bak(?:-|$)/.test(entry.name)){files.push(file.replaceAll('\\','/'));}}}
for(const root of roots){if(await fs.stat(root).then(s=>s.isDirectory(),()=>false))await walk(root);}
for(const file of await fs.readdir('.'))if(file.endsWith('.md')||['.gitignore','.gitattributes','.prettierignore','.prettierrc.json','Cargo.lock','Cargo.toml','LICENSE','README.md','SOURCE_DIFF_FROM_PREVIOUS.txt','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','vitest.config.ts','playwright.config.ts','index.html'].includes(file))files.push(file);
files.sort();if(new Set(files).size!==files.length||files.length>4096)throw new Error('Invalid source inventory');
if(process.argv[2]==='--list'){console.log(JSON.stringify(files));process.exit(0);}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=[];let total=0;
for(const file of files){const bytes=await fs.readFile(file);if(bytes.length>32*1024*1024)throw new Error(`Source member exceeds 32 MiB: ${file}`);total+=bytes.length;if(total>128*1024*1024)throw new Error('Source package exceeds 128 MiB');manifest.push(`${hash(bytes)}  ${file}`);}
const sums='# SHA256  relative paths - all source files except these two checksum manifests\n'+manifest.join('\n')+'\n';
await fs.writeFile('SOURCE_SHA256SUMS.txt',sums);await fs.writeFile('SOURCE_MANIFEST_SHA256.txt',sums);
const stage=await fs.mkdtemp(path.join(os.tmpdir(),'GuiltySpark-source-'));
for(const file of [...files,'SOURCE_SHA256SUMS.txt','SOURCE_MANIFEST_SHA256.txt']){const destination=path.join(stage,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(file,destination);}
await fs.mkdir(path.dirname(output),{recursive:true});
const zipCommand='$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $stage=[System.IO.Path]::GetFullPath($env:GS_SOURCE_STAGE); $archive=[System.IO.Compression.ZipFile]::Open($env:GS_SOURCE_OUTPUT,[System.IO.Compression.ZipArchiveMode]::Create); try { foreach($file in [System.IO.Directory]::EnumerateFiles($stage,"*",[System.IO.SearchOption]::AllDirectories)) { $relative=$file.Substring($stage.Length+1).Replace([char]92,[char]47); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file,$relative,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $archive.Dispose() }';
const packed=spawnSync('powershell.exe',['-NoProfile','-Command',zipCommand],{env:{...process.env,GS_SOURCE_STAGE:stage,GS_SOURCE_OUTPUT:output},encoding:'utf8',windowsHide:true});if(packed.status!==0)throw new Error(packed.stderr||packed.stdout||'ZIP creation failed');
const bytes=await fs.readFile(output),sha256=hash(bytes);
await fs.writeFile(output+'.sha256',`${sha256}  ${path.basename(output)}\n`);
console.log(JSON.stringify({output,sha256,bytes:bytes.length,files:files.length+2,manifestEntries:files.length,uncompressedBytes:total,stage},null,2));

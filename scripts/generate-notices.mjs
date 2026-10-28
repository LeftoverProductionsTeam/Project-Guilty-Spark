// Inventory resolved package license metadata and retain available notice texts.
// No package implementation, binaries, absolute paths or tool credentials are exported.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const metadataFile=process.env.GS_CARGO_METADATA;
let metadata;
if(metadataFile)metadata=JSON.parse(await fs.readFile(metadataFile,'utf8'));
else {const p=spawnSync(process.execPath,['scripts/cargo.mjs','metadata','--locked','--format-version','1'],{encoding:'utf8',maxBuffer:32*1024*1024});if(p.status!==0)throw new Error('Cargo metadata failed');metadata=JSON.parse(p.stdout);}
const packages=[];const texts=new Map();
async function notices(folder){
  const result=[];
  for(const name of await fs.readdir(folder).catch(()=>[])) {
    if(!/^(?:licen[sc]e|copying|notice|copyright)(?:[._-].*)?$/i.test(name))continue;
    const file=path.join(folder,name),stat=await fs.stat(file);
    if(!stat.isFile()||stat.size>256*1024)continue;
    const bytes=await fs.readFile(file);if(bytes.includes(0))continue;
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');const output=`docs/licenses/${hash}.txt`;
    texts.set(output,bytes);result.push(output);
  }return result.sort();
}
for(const p of metadata.packages)if(!metadata.workspace_members.includes(p.id))packages.push({ecosystem:'cargo',name:p.name,version:p.version,license:p.license??'UNKNOWN',notices:await notices(path.dirname(p.manifest_path))});
const seen=new Set();
for(const entry of await fs.readdir('node_modules/.pnpm',{withFileTypes:true})) {
  if(!entry.isDirectory()||entry.name==='node_modules')continue;
  const root=path.join('node_modules/.pnpm',entry.name,'node_modules');
  for(const name of await fs.readdir(root).catch(()=>[])) {
    const names=name.startsWith('@')?(await fs.readdir(path.join(root,name))).map(n=>`${name}/${n}`):[name];
    for(const n of names) {
      const folder=path.join(root,n);let p;try{p=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));}catch{continue;}
      const key=`${p.name}@${p.version}`;if(seen.has(key))continue;seen.add(key);
      packages.push({ecosystem:'npm',name:p.name,version:p.version,license:typeof p.license==='string'?p.license:JSON.stringify(p.license??'UNKNOWN'),notices:await notices(folder)});
    }
  }
}
packages.sort((a,b)=>`${a.ecosystem}/${a.name}/${a.version}`.localeCompare(`${b.ecosystem}/${b.name}/${b.version}`));
await fs.mkdir('docs/licenses',{recursive:true});for(const [file,bytes] of texts)await fs.writeFile(file,bytes);
const report={schemaVersion:1,description:'Declared package licenses and available texts from resolved Cargo metadata and installed pnpm packages. Includes build/platform/dev packages; not all are distributed in the Windows app.',packages};
await fs.writeFile('docs/DEPENDENCY_LICENSES.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({packages:packages.length,noticeTexts:texts.size,unknownLicenses:packages.filter(p=>p.license==='UNKNOWN').length,withoutRootNoticeText:packages.filter(p=>!p.notices.length).length}));

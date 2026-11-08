// Read-only, bounded production declaration/call-site inventory. No pruning or
// unused-code decisions: Rust receivers/macros and dynamic IPC require review.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {API} from 'typescript/unstable/sync';
import {SyntaxKind} from 'typescript/unstable/ast';
import {visitEachChild} from 'typescript/unstable/ast/visitor';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]&&path.resolve(process.argv[2]);
const interactionsOnly=process.argv.includes('--interactions-only');
if(!output||path.relative(root,output)===''||!path.relative(root,output).startsWith('..'+path.sep)&&!path.isAbsolute(path.relative(root,output)))throw Error('Choose an explicit external inventory output; source remains read-only');
const relative=p=>path.relative(root,p).replaceAll('\\','/');
const files=execFileSync('rg',['--files','src','src-tauri/src','crates','-g','*.rs','-g','*.ts','-g','*.tsx'],{cwd:root,encoding:'utf8',maxBuffer:1024**2}).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).filter(p=>!p.includes('/tests/')&&!p.includes('/examples/')&&!p.endsWith('.test.ts')&&!p.endsWith('.test.tsx')).sort();
if(files.length>2048)throw Error('Production inventory exceeds 2048-file budget');
const text=new Map();let sourceBytes=0;
for(const file of files){const full=path.join(root,file),stat=await fs.lstat(full);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024**2)throw Error('Unexpected production source: '+file);sourceBytes+=stat.size;if(sourceBytes>32*1024**2)throw Error('Production inventory exceeds 32MiB source budget');text.set(file,await fs.readFile(full,'utf8'));}
const rows=[],calls=[],sources=[],interactions=[];const line=(s,pos)=>s.slice(0,pos).split('\n').length;
const kindNames=new Map([['function','FunctionDeclaration'],['expression','FunctionExpression'],['arrow','ArrowFunction'],['method','MethodDeclaration'],['constructor','Constructor'],['getter','GetAccessor'],['setter','SetAccessor']].map(([a,b])=>[SyntaxKind[b],a]));
const api=new API();
try{
 const snapshot=api.updateSnapshot({openProjects:[path.join(root,'tsconfig.json')]});
 for(const file of files.filter(p=>/\.tsx?$/.test(p))){
  const source=snapshot.getProjects().map(p=>p.program.getSourceFile(path.join(root,file))).find(Boolean);if(!source)throw Error('TypeScript project does not contain '+file);
  const s=text.get(file);let owner=null;
  function scan(node){
   const old=owner;
   if(kindNames.has(node.kind)){
    const name=node.name?.text??node.parent?.name?.text??`anonymous@${line(s,node.pos)}`;
    const row={file,line:line(s,node.pos),name,kind:kindNames.get(node.kind),start:node.pos,end:node.end};rows.push(row);owner=row;
   }
   if(node.kind===SyntaxKind.CallExpression||node.kind===SyntaxKind.NewExpression||node.kind===SyntaxKind.JsxOpeningElement||node.kind===SyntaxKind.JsxSelfClosingElement){
    const expression=node.expression??node.tagName;if(expression){const callee=s.slice(expression.pos,expression.end).trim();const name=expression.name?.text??expression.text??callee;
     const command=name==='call'&&node.arguments?.[0]?.kind===SyntaxKind.StringLiteral?node.arguments[0].text:undefined;
     calls.push({file,line:line(s,node.pos),name,callee:callee.slice(0,180),caller:owner?`${owner.file}:${owner.line}:${owner.name}`:'module',...(command?{tauriCommand:command}:{})});
    }
   }
   if(node.kind===SyntaxKind.JsxOpeningElement||node.kind===SyntaxKind.JsxSelfClosingElement){
    const tag=s.slice(node.tagName.pos,node.tagName.end).trim(),attributes={};
    for(const attr of node.attributes.properties??[]){if(!attr.name)continue;const name=s.slice(attr.name.pos,attr.name.end).trim();attributes[name]=attr.initializer?s.slice(attr.initializer.pos,attr.initializer.end).trim():'true';}
    if(['button','input','select','textarea','summary','a'].includes(tag)||attributes.role){
      const handlers=Object.fromEntries(Object.entries(attributes).filter(([key])=>/^on[A-Z]/.test(key)));
      interactions.push({file,line:line(s,node.pos),tag,owner:owner?.name??'module',label:attributes['aria-label']??'',tooltip:attributes.title??'',role:attributes.role??'',disabled:attributes.disabled??'',shortcut:attributes['aria-keyshortcuts']??'',handlers,review:tag==='button'&&!Object.keys(handlers).length?'Review parent delegation, disabled state or form submission':'Handler/native HTML semantics require workflow verification',nativeAcceptance:'not inferred from source'});
    }
   }
   visitEachChild(node,child=>{scan(child);return child;});owner=old;
  }
  scan(source);
 }
 snapshot.dispose();
}finally{api.close();}
// Rust declarations are a lexical index, not a resolved compiler call graph.
// Keep every named fn, including unit-test helpers in production modules.
for(const file of files.filter(p=>p.endsWith('.rs'))){const s=text.get(file),defs=[];
 for(const m of s.matchAll(/\bfn\s+([A-Za-z_]\w*)/g)){const row={file,line:line(s,m.index),name:m[1],kind:'rust-fn',start:m.index,end:s.length};rows.push(row);defs.push(row);}
 for(let i=0;i<defs.length;i++)defs[i].end=defs[i+1]?.start??s.length;
 for(const m of s.matchAll(/\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*(?:!|::\s*<[^;{}\n]{0,200}>)?\s*\(/g)){
  if(/\bfn\s*$/.test(s.slice(Math.max(0,m.index-12),m.index)))continue;
  if(['if','while','match','for','loop','Some','Ok','Err','Self'].includes(m[1]))continue;
  const owner=defs.findLast(d=>d.start<m.index);calls.push({file,line:line(s,m.index),name:m[1].split('::').at(-1),callee:m[1],caller:owner?`${file}:${owner.line}:${owner.name}`:'module'});
 }
}
const index=new Map();for(const call of calls){for(const name of [call.name,call.tauriCommand].filter(Boolean)){const matches=index.get(name)??[];matches.push(call);index.set(name,matches);}}
const definitions=rows.map(({start,end,...row})=>{const matches=index.get(row.name)??[];return{...row,referenceCount:matches.length,references:matches.slice(0,16),referencesLimited:matches.length>16};});
for(const file of files){const s=text.get(file);sources.push({file,sha256:crypto.createHash('sha256').update(s).digest('hex'),bytes:Buffer.byteLength(s),functions:definitions.filter(row=>row.file===file).length});}
const report={schemaVersion:1,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTreeClean:!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),generatedAt:new Date().toISOString(),sourceBytes,files:sources,functions:definitions,interactions,limitations:['TypeScript functions/calls come from the installed compiler AST, including anonymous callbacks.','Rust fn/call references are lexical and include cfg(test), macros and possible text matches; nearest-declaration attribution is approximate for nested Rust scopes.','References sharing a method name are candidates, not proven receiver/symbol bindings. Dynamic IPC and macro expansion need manual review. No zero-reference entry authorizes removal.','At most16 reference locations per declaration are rendered; total candidate count is retained. Exact Tauri string call names join to native command definitions.']};
if(interactionsOnly){
 const inventory={head:report.head,workingTreeClean:report.workingTreeClean,sourceBytes,files:sources.map(({file,sha256})=>({file,sha256})),controls:interactions.length,interactions,limitations:['Source AST templates, not instantiated visible controls or runtime behavior.','Catalogs, props, delegated events and native HTML semantics need separate verification.','No final UI, gameplay or native acceptance is inferred.']};
 const bytes=JSON.stringify(inventory,null,2);if(Buffer.byteLength(bytes)>4*1024**2)throw Error('UI inventory exceeds4MiB');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'interactions.json'),bytes,{flag:'wx'});console.log(JSON.stringify({files:sources.length,interactionTemplates:interactions.length,bytes:Buffer.byteLength(bytes),output}));process.exit(0);
}
const bytes=JSON.stringify(report,null,2);if(Buffer.byteLength(bytes)>16*1024**2)throw Error('Function report exceeds16MiB');
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'functions.json'),bytes+'\n',{flag:'wx'});
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const link=(file,n,label)=>`<a href="${escape(new URL('file:///'+path.join(root,file).replaceAll('\\','/')).href)}#L${n}">${escape(label??file+':'+n)}</a>`;
const html=`<!doctype html><meta charset="utf-8"><title>Spark production functions</title><style>body{font:14px system-ui;background:#101a22;color:#d5e8ee;margin:24px}a{color:#87dbea}input{padding:10px;width:80%}details{border-bottom:1px solid #345;padding:8px}td{padding:6px;vertical-align:top}table{width:100%}summary{cursor:pointer}small{color:#abc}</style><h1>Production function and call-site inventory</h1><p>${sources.length}files · ${definitions.length}functions · source ${escape(report.head)}${report.workingTreeClean?' (clean working tree)':' plus current working edits'}.</p><p>${report.limitations.map(escape).join('<br>')}</p><input id="filter" placeholder="Filter file, function or caller"><main>${sources.map(source=>`<details><summary>${link(source.file,1)} · ${source.functions}functions</summary><table>${definitions.filter(row=>row.file===source.file).map(row=>`<tr><td>${link(row.file,row.line,row.name)}<br><small>${escape(row.kind)}</small></td><td>${row.referenceCount}candidate references${row.referencesLimited?' (first16)':''}<br>${row.references.map(ref=>link(ref.file,ref.line,ref.caller)).join('<br>')}</td></tr>`).join('')}</table></details>`).join('')}</main><script>document.querySelector('input').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('main>details').forEach(d=>{d.hidden=!d.textContent.toLowerCase().includes(q);d.open=!!q&&!d.hidden;});};</script>`;
await fs.writeFile(path.join(output,'functions.html'),html,{flag:'wx'});
await fs.writeFile(path.join(output,'interactions.json'),JSON.stringify({head:report.head,workingTreeClean:report.workingTreeClean,sourceBytes,files:sources.map(({file,sha256})=>({file,sha256})),controls:interactions.length,interactions,limitations:['Source AST templates, not instantiated visible controls or runtime behavior.','Labels and handlers can be supplied by catalogs, props or parent delegation; missing inline text is not proof of a dead action.','No final UI, gameplay or native acceptance is inferred.']},null,2),{flag:'wx'});console.log(JSON.stringify({files:sources.length,functions:definitions.length,interactionTemplates:interactions.length,delegationReview:interactions.filter(row=>row.review.startsWith('Review parent')).length,sourceBytes,jsonBytes:Buffer.byteLength(bytes),htmlBytes:Buffer.byteLength(html),output}));

// Opt-in browser workload, not startup/GPU/native-game performance evidence.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {chromium} from '@playwright/test';
const [url,destination]=process.argv.slice(2);
if(!url?.startsWith('http://127.0.0.1:')||!destination)throw Error('measure-ui-preferences <loopback-fixture-url> <fresh-report.json>');
const sourcePath=new URL(url).searchParams.has('baseline')?'.local/c54-workbench-polish-20261102/baseline-mapSession.ts':'src/mapSession.ts';
const source=await fs.readFile(sourcePath,'utf8');
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});
const report={schemaVersion:1,scope:'Real React UI preference subscriptions; no maps or GPU work',sourcePath,
  sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),browser:browser.version(),runs:[]};
try {
  for(let i=0;i<3;i++) {
    const context=await browser.newContext();const page=await context.newPage();
    await page.goto(url);await page.waitForFunction(()=>typeof window.sessionWorkload==='function');
    const served=await page.evaluate(async sourcePath=>(await fetch('/'+sourcePath)).text(),sourcePath);
    if(served.includes('storedRecords')!==source.includes('storedRecords')||served.includes('function subscribeMapSession')!==source.includes('function subscribeMapSession'))throw Error('Vite is serving a stale preference module; restart the owned test server');
    const result=await page.evaluate(()=>window.sessionWorkload());
    if(result.rendered!==960||result.stored!==960||!result.otherMapsUnchanged)throw Error('UI preference content changed');
    report.runs.push(result);await context.close();
  }
  const values=report.runs.flatMap(r=>r.milliseconds).sort((a,b)=>a-b);
  report.medianMilliseconds=values[Math.floor(values.length/2)];
  report.complete=true;await fs.writeFile(destination,JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({medianMilliseconds:report.medianMilliseconds,subscribers:480,writesPerPass:160}));
} finally {await browser.close();}

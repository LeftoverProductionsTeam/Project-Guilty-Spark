import { assertQaOutputPath } from './native-qa-storage.mjs';
// Real packaged Windows process launches, native Halo models/audio and durable
// local profile. No mocked IPC, game launch, downloaded bytes or original edits.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,expect as assertion} from '@playwright/test';
import {chooseTool} from '../tests/ui/helpers/navigation.ts';
const [appArg,outputArg,meterArg]=process.argv.slice(2);
if(!meterArg)throw Error('test-character-launch-native <built.exe> <fresh-output> <owned-audio-meter.exe>');
const requested=(value,allowed)=>{const list=value?value.split(','):allowed;if(!list.length||list.some(v=>!allowed.includes(v))||new Set(list).size!==list.length)throw Error('Invalid requested character test cases');return list;};
const runtimes=requested(process.env.SPARK_CHARACTER_QA_RUNTIMES,['mccSteam','haloCustomEdition','openCe','chupathingyCe']),characters=requested(process.env.SPARK_CHARACTER_QA_CHARACTERS,['monitor','johnson','chief','cortana']);
const root=path.resolve(outputArg);await fs.mkdir(await assertQaOutputPath(root));const exe=path.join(root,'GuiltySpark-character-qa.exe');await fs.copyFile(path.resolve(appArg),exe,fs.constants.COPYFILE_EXCL);
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={schemaVersion:1,complete:false,appSha256:await hash(exe),mockedIpc:false,cases:[],errors:[],limitations:['Windows output meter is not human listening or Halo game playback.','A runtime lacking campaign characters/dialogue may use a linked compatible original campaign source.','No in-game multiplayer replication is tested here.']};
const expect=assertion.configure({timeout:180000});let browser,page,child;
const call=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function launch(){
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 child=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,GUILTY_SPARK_DATA_DIR:path.join(root,'library'),WEBVIEW2_USER_DATA_FOLDER:path.join(root,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
 await fs.writeFile(path.join(root,'owned-test-process.json'),JSON.stringify({pid:child.pid,port,exe}));
 await expect.poll(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.ok,()=>false)).toBe(true);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);await expect.poll(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url().includes('tauri.localhost'))).toBe(true);
 page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('tauri.localhost'));page.on('pageerror',e=>report.errors.push(String(e)));
 return call('bootstrap');
}
async function close(){
 if(child?.exitCode===null){await page.getByRole('button',{name:'Close window',exact:true}).click().catch(()=>{});await expect.poll(()=>child.exitCode,{timeout:30000}).not.toBeNull();}
 await browser?.close().catch(()=>{});browser=null;
}
async function configure(runtime,character){
 const boot=await call('bootstrap');await call('save_settings',{settings:{...boot.settings,onboardingCompleted:true,preferredHalo:runtime,autoBuild:false}});
 await chooseTool(page,'Map library');await expect(page.getByRole('combobox',{name:'Home model',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Home model',exact:true}).selectOption(`character:${character}`);
 await page.evaluate(()=>{const key='guilty-spark:interface-v1';const current=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...current,schemaVersion:1,launchVoiceEnabled:true,launchVoiceVolume:.22}));});
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('guilty-spark-map-session-v1:global')||'{}')['home.model'])).toBe(`character:${character}`);
 await page.waitForTimeout(250);
}
try{
 await launch();await configure(runtimes[0],characters[0]);await close();
 const heard=new Map(characters.map(c=>[c,new Set()]));
 for(let r=0;r<runtimes.length;r++)for(let c=0;c<characters.length;c++){
  const runtime=runtimes[r],character=characters[c],entry={runtime,character,pid:null,audioMeasurements:[]};report.cases.push(entry);const began=performance.now();
  const boot=await launch();entry.pid=child.pid;expect(boot.settings.preferredHalo).toBe(runtime);
  let done=false;const meterLoop=(async()=>{let n=0;while(!done){const file=path.join(root,`output-${r}-${c}-${n++}.json`);const meter=spawn(path.resolve(meterArg),[String(child.pid),file,'8'],{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';meter.stderr.on('data',b=>error+=b.toString());const exit=await new Promise(resolve=>meter.once('exit',resolve));expect(exit,error).toBe(0);const samples=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));entry.audioMeasurements.push({file:path.basename(file),peak:Math.max(0,...samples.readings.flatMap(reading=>reading.sessions.map(s=>s.Peak)))});}})();
  try{
   await expect.poll(async()=>{const state=await call('launch_voice_status');if(state.error)throw Error(state.error);return state.played;},{timeout:180000}).toBe(true);
   entry.voice=await call('launch_voice_status');entry.voiceReadyMs=performance.now()-began;
   expect(heard.get(character).has(entry.voice.lineId),'No repeated line across application restarts').toBe(false);heard.get(character).add(entry.voice.lineId);
   expect(await call('prepare_launch_voice',{character}),'A second greeting must not be prepared').toBeNull();
   expect(await call('play_launch_voice',{character,lineId:entry.voice.lineId,volume:.22}),'A second play must be refused').toBe(false);
   const preview=page.locator('.home-native-model .native-model-preview');await expect(preview).toHaveAttribute('data-model-ready','true');await expect(preview).toHaveAttribute('data-model-textures',/^[1-9]\d*$/);
   entry.model=await preview.evaluate(e=>({...e.dataset}));if(character==='johnson')expect(entry.model.modelVariant).toBe('sgt_johnson-100');
   await expect(preview).toHaveAttribute('data-model-material-gaps','0');
   const canvas=preview.locator('canvas');await expect.poll(()=>canvas.getAttribute('data-gs-animation')).not.toBeNull();entry.animation=JSON.parse(await canvas.getAttribute('data-gs-animation'));
   if(character!=='monitor')expect(entry.animation.name).toMatch(/^stand .*idle/i);
   const source=await call('open_project',{id:entry.model.modelSource});entry.modelOriginal=source.project.source.originalPath;entry.modelVersion=source.inspection.header.version;
   entry.dialogueSourcePreserved=false;
   const catalogs=await fs.readdir(path.join(root,'library/cache/home-voice-v1'));for(const file of catalogs){const catalog=JSON.parse(await fs.readFile(path.join(root,'library/cache/home-voice-v1',file),'utf8'));const choice=catalog.choices.find(choice=>choice.id===entry.voice.lineId);if(choice){expect(await hash(choice.source)).toBe(choice.sourceSha256);entry.dialogueSourcePreserved=true;entry.dialogueOriginal=choice.source;}}
   expect(entry.dialogueSourcePreserved).toBe(true);await page.screenshot({path:path.join(root,`${runtime}-${character}.png`)});
   done=true;await meterLoop;entry.maximumPeak=Math.max(0,...entry.audioMeasurements.map(m=>m.peak));expect(entry.maximumPeak,'The owned Windows audio session must actually output the greeting').toBeGreaterThan(.0001);
   const nextCharacter=characters[c+1]??characters[0],nextRuntime=characters[c+1]?runtime:runtimes[r+1]??runtime;
   await configure(nextRuntime,nextCharacter);await close();entry.complete=true;await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({runtime,character,complete:true,peak:entry.maximumPeak,modelVersion:entry.modelVersion,voiceReadyMs:entry.voiceReadyMs}));
  }finally{done=true;await meterLoop.catch(()=>{});}
 }
 expect(report.errors).toEqual([]);report.complete=true;
}catch(error){report.error=String(error);report.failureStack=error.stack;await page?.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));await browser?.close().catch(()=>{});if(child?.exitCode===null)child.kill();console.log(JSON.stringify({complete:report.complete,cases:report.cases.length,error:report.error}));}

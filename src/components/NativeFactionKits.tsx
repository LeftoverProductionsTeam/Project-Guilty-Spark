import {useEffect,useId,useState} from 'react';
import type {NativeFactionKit,NativeFactionService,NativeOperation,NativeTagContext} from '../nativeOperations';
import {defaultNativePlayerProfile} from '../firefight';
import {Notice} from './ui';
import NativeControlGroundCheck from './NativeControlGroundCheck';
type Role=NativeFactionKit['faction'];
type Service=NativeFactionService['service'];
interface Draft {included:boolean;control:string;position:[string,string,string];rotation:[string,string,string];profile:NativeFactionKit['profile']}
const initial=(faction:Role):Draft=>({included:faction==='unsc',control:'',position:['','',''],rotation:['0','0','0'],profile:{...defaultNativePlayerProfile(),primaryWeapon:faction==='unsc'?'weapons/assault rifle/assault rifle':'weapons/plasma pistol/plasma pistol',primaryLoaded:faction==='unsc'?60:0,primaryReserved:faction==='unsc'?180:0,secondaryWeapon:null,secondaryLoaded:0,secondaryReserved:0,health:0,shields:0,fragmentationGrenades:faction==='unsc'?1:0,plasmaGrenades:faction==='covenant'?1:0}});
/** The existing protected native Preview/Accept owns writes and restoration. */
export default function NativeFactionKits({context,busy,dirty,onPreview,onDraftChange}:{context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void}){
 const [body,setBody]=useState({faction:'covenant' as Role,bipedTagPath:null as string|null,permutation:null as string|null,includeFirstPersonArms:false,usePlayerPhysics:false});
 const [service,setService]=useState({faction:'unsc' as Role,service:'deploy' as Service,control:'',position:['','',''] as Draft['position'],rotation:['0','0','0'] as Draft['rotation']});
 const [squad,setSquad]=useState({number:1,control:'',position:['','',''] as [string,string,string],rotation:['0','0','0'] as [string,string,string],readiness:false});
 const [role,setRole]=useState<Role>('unsc'),[drafts,setDrafts]=useState<Record<Role,Draft>>({unsc:initial('unsc'),covenant:initial('covenant')});const id=useId(),draft=drafts[role];
 useEffect(()=>{setDrafts({unsc:{...initial('unsc'),control:context.controlSources?.[0]??''},covenant:{...initial('covenant'),control:context.controlSources?.[0]??''}});},[context.projectId,context.buildId,context.tag]);
 useEffect(()=>setService(current=>({...current,control:context.controlSources?.[0]??"",position:["","",""],rotation:["0","0","0"]})),[context.projectId,context.buildId,context.tag]);
 useEffect(()=>{setSquad({number:1,control:context.controlSources?.[0]??"",position:["","",""],rotation:["0","0","0"],readiness:false});},[context.projectId,context.buildId,context.tag]);
 useEffect(()=>{setBody(current=>({...current,bipedTagPath:null,permutation:null,includeFirstPersonArms:false,usePlayerPhysics:false}));},[context.projectId,context.buildId,context.tag,context.tagSha256]);
 const kits=context.factionKits??[];
 const existingKit=kits.find(row=>row.kit.faction===role)?.kit;
 const [profileDraft,setProfileDraft]=useState<{sourceKey:string;profiles:Partial<Record<Role,Draft['profile']>>}|null>(null);
 const sourceKey=JSON.stringify([context.projectId,context.tag,context.tagSha256]);
 const editedProfiles=profileDraft?.sourceKey===sourceKey?profileDraft.profiles:undefined;
 const equipment=existingKit?(editedProfiles?.[role]??existingKit.profile):draft.profile;
 useEffect(()=>onDraftChange(),[drafts,squad,body,service,profileDraft,context.tagSha256]);
 const update=(patch:Partial<Draft>)=>setDrafts(current=>({...current,[role]:{...current[role],...patch}}));
 const profile=(patch:Partial<Draft['profile']>)=>{
   const next={...equipment,...patch,health:0,shields:0};
   if(!next.secondaryWeapon){next.secondaryLoaded=0;next.secondaryReserved=0;}
   if(existingKit)setProfileDraft({sourceKey,profiles:{...editedProfiles,[role]:next}});
   else update({profile:next});
 };
 const validPose=(entry:Pick<Draft,'control'|'position'|'rotation'>)=>entry.control.trim().length>0&&entry.control.length<=230&&!entry.control.startsWith('-')&&[...entry.position,...entry.rotation].every(value=>value.trim()!==''&&Number.isFinite(Number(value)))&&entry.position.every(value=>Math.abs(Number(value))<=2048)&&entry.rotation.every(value=>Math.abs(Number(value))<=360);
 const groundPosition=(entry:Pick<Draft,'control'|'position'|'rotation'>)=>validPose(entry)?entry.position.map(Number) as [number,number,number]:null;
 const upright=(entry:Pick<Draft,'rotation'>)=>entry.rotation.slice(1).every(value=>value.trim()!==''&&Math.abs(Number(value)*Math.PI/180)<1e-4);
 const validEquipment=(kit:Draft['profile'])=>kit.primaryWeapon.length>0&&[kit.primaryLoaded,kit.primaryReserved,kit.secondaryLoaded,kit.secondaryReserved].every(value=>Number.isInteger(value)&&value>=0&&value<=32767)&&[kit.fragmentationGrenades,kit.plasmaGrenades].every(value=>Number.isInteger(value)&&value>=0&&value<=4)&&!!(kit.secondaryWeapon||kit.secondaryLoaded===0&&kit.secondaryReserved===0);
 const included=(['unsc','covenant'] as Role[]).filter(faction=>drafts[faction].included&&!kits.some(row=>row.kit.faction===faction));
 const blocked=busy||dirty||!context.canAppendFactionKits;
 const squadBlocked=busy||dirty||!(context.canAppendSquadTerminals??context.canAppendFactionKits);
 const sourceSha256=context.tagSha256??'';
 const hasSourceHash=/^[a-f0-9]{64}$/i.test(sourceSha256);
 const selectedKit=kits.find(row=>row.kit.faction===body.faction)??kits[0];
 const craft=service.faction==="unsc"?"pelican":"spirit";
 const serviceName=service.service==="fieldPickup"?"extraction_"+craft+"_activate":"extraction_"+service.faction+"_"+service.service;
 const installedService=context.scenarioDevices?.find(row=>row.name.toLowerCase()===serviceName);
 const servicesBlocked=blocked||kits.filter(row=>row.body).length!==2;
 const bipedSources=context.bipedSources??[];
 const currentBody=selectedKit?.body;
 const elitePath='characters/elite/elite';
 const importedElites=bipedSources.filter(path=>/^gs_assets_[0-9a-f]{32}$/i.test(path.split('/')[0])&&path.toLowerCase().slice(43)===elitePath);
 const stockElite=bipedSources.find(path=>path.toLowerCase()===elitePath);
 const defaultElite=selectedKit?.kit.faction==='covenant'?(stockElite??(importedElites.length===1?importedElites[0]:undefined)):undefined;
 const bipedPath=body.bipedTagPath??currentBody?.bipedTagPath??defaultElite??'';
 const permutationInput=body.permutation??String(currentBody?.permutation??0);
 const permutation=Number(permutationInput);
 const bodyBlocked=blocked||!!context.factionBodyIssue||!selectedKit;
 const currentArms=!!currentBody?.firstPersonArms&&currentBody.bipedTagPath===bipedPath;
 const alreadyPlayerCopy=/_gs_player_(unsc|covenant)$/i.test(bipedPath);
 const usePlayerPhysics=body.usePlayerPhysics&&!alreadyPlayerCopy;
 const includeArms=(body.includeFirstPersonArms&&!currentArms)||(usePlayerPhysics&&currentArms);
 const unchangedBody=!!currentBody&&currentBody.bipedTagPath===bipedPath&&currentBody.permutation===permutation&&!includeArms&&!usePlayerPhysics;
 const squadName="extraction_squad_"+String(squad.number).padStart(2,"0"),squadExists=!!context.scenarioDevices?.some(row=>row.name.toLowerCase()===squadName);
 return <><details className="native-faction-kits"><summary>Forerunner faction terminals &amp; kits</summary>
  <p className="subtle">Add a new faction terminal and starter kit, or revise the equipment on an existing faction. Forerunner handles deployment, saved loadouts and banking.</p>
  {!context.canAppendFactionKits&&<Notice tone="info">Requires unshared CE609 solo source or MCC13 multiplayer source with both verified MegaWorld hubs and the matching native control and weapon tags.</Notice>}
  {context.regionalFactionSource&&<p className="subtle">Place each terminal inside that faction’s named hub. Add its player body after accepting the equipment kit.</p>}
  <fieldset disabled={blocked}>
   <label>Faction kit<select aria-label="Faction kit" value={role} onChange={event=>setRole(event.target.value as Role)}><option value="unsc">UNSC</option><option value="covenant">Covenant</option></select></label>
   {existingKit?<p className="subtle">Editing the existing starter kit. The terminal placement, respawn biped and faction indices stay in place.</p>:<>
   <label><input type="checkbox" checked={draft.included} onChange={event=>update({included:event.target.checked})}/>Include {role==='unsc'?'UNSC':'Covenant'} terminal and kit</label>
   <label>Touched control tag<input aria-label="Faction control tag" list={id+'-controls'} value={draft.control} onChange={event=>update({control:event.target.value})}/><datalist id={id+'-controls'}>{context.controlSources?.map(path=><option key={path} value={path}/>)}</datalist></label>
   <p className="subtle">Choose an existing touched-by-player control without .device_control. Preview pins its real closure; unsupported controls are not repaired or replaced.</p>
   <div className="native-encounter-position">{draft.position.map((value,index)=><label key={index}>World {['X','Y','Z'][index]}<input aria-label={'Faction terminal '+['X','Y','Z'][index]} type="number" step="any" value={value} onChange={event=>update({position:draft.position.map((n,i)=>i===index?event.target.value:n) as Draft['position']})}/></label>)}</div>
   <div className="native-encounter-position">{draft.rotation.map((value,index)=><label key={index}>{['Yaw','Pitch','Roll'][index]} · degrees<input aria-label={'Faction terminal '+['yaw','pitch','roll'][index]} type="number" step="any" value={value} onChange={event=>update({rotation:draft.rotation.map((n,i)=>i===index?event.target.value:n) as Draft['rotation']})}/></label>)}</div>
   <NativeControlGroundCheck context={context} selectionKey={JSON.stringify([role,draft.rotation.slice(1)])}
    tagPath={draft.control.trim()} position={groundPosition(draft)} upright={upright(draft)} disabled={blocked}
    onGround={point=>update({position:point.map(String) as Draft['position']})}/>
   </>}
   <label>Primary weapon<input aria-label="Faction primary weapon" list={id+'-weapons'} value={equipment.primaryWeapon} onChange={event=>profile({primaryWeapon:event.target.value})}/></label>
   <label>Secondary weapon · optional<input aria-label="Faction secondary weapon" list={id+'-weapons'} value={equipment.secondaryWeapon??''} onChange={event=>profile({secondaryWeapon:event.target.value||null})}/></label><datalist id={id+'-weapons'}>{context.weaponSources?.map(path=><option key={path} value={path}/>)}</datalist>
   <div className="native-field-edit">{([['primaryLoaded','Primary loaded'],['primaryReserved','Primary reserve'],['secondaryLoaded','Secondary loaded'],['secondaryReserved','Secondary reserve'],['fragmentationGrenades','Fragmentation grenades'],['plasmaGrenades','Plasma grenades']] as const).map(([key,label])=><label key={key}>{label}<input aria-label={'Faction '+label.toLowerCase()} type="number" min={0} max={key.endsWith('Grenades')?4:32767} step={1} disabled={key.startsWith('secondary')&&!equipment.secondaryWeapon} value={equipment[key]} onChange={event=>profile({[key]:event.target.value===''?0:Number(event.target.value)})}/></label>)}</div>
   <p className="subtle">Equipment-only: native health/shield modifiers stay zero. No extra grenade types, duplicate primary/secondary or ammunition for an empty secondary. Keep mission technology out of every kit.</p>
   {existingKit?<button type="button" disabled={!hasSourceHash||!validEquipment(equipment)||JSON.stringify(equipment)===JSON.stringify(existingKit.profile)}
      onClick={()=>onPreview({kind:'factionKits',sourceSha256,replaceExistingProfiles:true,kits:[{...existingKit,profile:equipment}]})}>Preview faction equipment changes</button>
    :<button type="button" disabled={!hasSourceHash||!included.length||included.some(faction=>!validPose(drafts[faction])||!validEquipment(drafts[faction].profile))}
      onClick={()=>onPreview({kind:'factionKits',sourceSha256,kits:included.map(faction=>{const entry=drafts[faction];return {faction,controlTagPath:entry.control.trim(),position:entry.position.map(Number) as NativeFactionKit['position'],rotationRadians:entry.rotation.map(value=>Number(value)*Math.PI/180) as NativeFactionKit['rotationRadians'],profile:entry.profile};})})}>Preview faction terminals &amp; kits</button>}
  </fieldset>
  {!existingKit&&<p className="subtle">Included: {included.join(', ')||'None'}. Place each terminal on usable hub geometry outside the activation area.</p>}
  <p className="subtle">Preview → Accept → Save → Build working tag edits. Native Restore recovers the preceding source. Use Forerunner faction player bodies to bind a character and the native device editor to move a terminal. Verify the resulting loadout in Forerunner.</p>
 </details>
 <details className="native-faction-bodies"><summary>Forerunner faction player bodies</summary>
  <p className="subtle">Bind a native character to an existing faction terminal and kit. The placement stays dormant. Forerunner changes the player character when the faction is selected.</p>
  {context.factionBodyIssue&&<Notice tone="info">{context.factionBodyIssue}</Notice>}
  {!context.canAppendFactionKits?<Notice tone="info">Requires saved CE609 solo or verified MCC13 MegaWorld working source and ownership of this editor window.</Notice>:kits.length===0&&<p className="subtle">Review and accept a faction terminal and kit first.</p>}
  {kits.length>0&&<label>Faction body kit<select aria-label="Faction body kit" disabled={busy||dirty} value={selectedKit?.kit.faction??''} onChange={event=>setBody({faction:event.target.value as Role,bipedTagPath:null,permutation:null,includeFirstPersonArms:false,usePlayerPhysics:false})}>{kits.map(row=><option key={row.kit.faction} value={row.kit.faction}>{row.kit.faction==='unsc'?'UNSC':'Covenant'}{row.body?' · bound':''}</option>)}</select></label>}
  {currentBody&&<p>Current body · {currentBody.bipedTagPath} · permutation {currentBody.permutation}</p>}
  <fieldset disabled={bodyBlocked}>
   <label>Native biped tag<select aria-label="Faction native biped" value={bipedPath} onChange={event=>setBody({...body,bipedTagPath:event.target.value,includeFirstPersonArms:false,usePlayerPhysics:false})}><option value="">Choose an existing native biped…</option>{currentBody&&!bipedSources.includes(currentBody.bipedTagPath)&&<option value={currentBody.bipedTagPath} disabled>{currentBody.bipedTagPath} · source unavailable</option>}{bipedSources.map(path=><option key={path} value={path}>{path}</option>)}</select></label>
   <label>Native permutation index<input aria-label="Faction body permutation" type="number" min={-1} max={32767} step={1} value={permutationInput} onChange={event=>setBody({...body,permutation:event.target.value})}/><small>Use −1 for native random selection.</small></label>
   {alreadyPlayerCopy?<p>Using a dedicated player physics copy.</p>:<label>
    <input type="checkbox" checked={usePlayerPhysics} disabled={!bipedPath} onChange={event=>setBody({...body,usePlayerPhysics:event.target.checked})}/>
    Enable player physics on a separate copy
   </label>}
   {usePlayerPhysics&&<p className="subtle">Use the native player movement flag on this faction’s copy. The original character and NPCs keep their source. Any bound first-person arms are carried to the copy.</p>}
   {currentArms?<p>First-person arms included</p>:<label><input type="checkbox" checked={body.includeFirstPersonArms} disabled={!bipedPath} onChange={event=>setBody({...body,includeFirstPersonArms:event.target.checked})}/> Include authored first-person arms</label>}
   {includeArms&&<p className="subtle">In working source, <code>{bipedPath}_fp.scenery</code> must reference <code>{bipedPath}_fp.gbxmodel</code>. Preview checks the arms against this kit’s first-person weapon graphs. Forerunner needs the per-biped hands capability.</p>}
   <button type="button" disabled={unchangedBody||!bipedSources.includes(bipedPath)||permutationInput.trim()===''||!Number.isInteger(permutation)||permutation< -1||permutation>32767||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')}
     onClick={()=>selectedKit&&onPreview({kind:'factionBody',sourceSha256:context.tagSha256!,...(currentBody?{replaceExisting:true}:{}),body:{faction:selectedKit.kit.faction,bipedTagPath:bipedPath,permutation,...(includeArms?{includeFirstPersonArms:true}:{}),...(usePlayerPhysics?{usePlayerPhysics:true}:{})}})}>{currentBody?'Preview faction body rebind':'Preview faction player body'}</button>
  </fieldset>
  <p className="subtle">Preview → Accept → Save → Build working tag edits. New Covenant bindings suggest an available Elite. Enable player physics on a separate copy if the character needs native player movement. Use any compatible biped from working source. Players choose their personal armor color in Forerunner Player Setup. Test the body, equipment and intended aircraft seats in the game.</p>

 </details>
  {context.regionalFactionSource&&<details className="native-faction-services">
   <summary>Faction hub and field controls</summary>
   <p className="subtle">Place deployment, loadout and debrief controls inside the faction hub. Place field pickup controls inside their aircraft’s field volume. Multiplayer use requires a compatible Forerunner build.</p>
   <fieldset disabled={servicesBlocked}>
    <label>Service faction<select value={service.faction} onChange={event=>setService({...service,faction:event.target.value as Role})}><option value="unsc">UNSC</option><option value="covenant">Covenant</option></select></label>
    <label>Service action<select value={service.service} onChange={event=>setService({...service,service:event.target.value as Service})}><option value="deploy">Deploy</option><option value="loadout">Choose loadout</option><option value="debrief">Review debrief</option><option value="fieldPickup">Request aircraft pickup</option></select></label>
    {service.service==="fieldPickup"&&<p className="subtle">Author the native <code>{"extraction_"+craft+"_zone"}</code> trigger first. Place the control where players can approach it without crossing the aircraft’s transfer path.</p>}
    {installedService?<p className="subtle">{serviceName} is already placed (native control {installedService.index}). Select it under existing controls to review its pose.</p>:<>
     <label>Touched control tag<input aria-label="Service control tag" list={id+'-controls'} value={service.control} onChange={event=>setService({...service,control:event.target.value})}/></label>
     <div className="native-encounter-position">{service.position.map((value,index)=><label key={index}>Service {['X','Y','Z'][index]}<input type="number" step="any" value={value} onChange={event=>setService({...service,position:service.position.map((item,i)=>i===index?event.target.value:item) as Draft['position']})}/></label>)}</div>
     <label>Service yaw · degrees<input type="number" min={-360} max={360} step="any" value={service.rotation[0]} onChange={event=>setService({...service,rotation:[event.target.value,'0','0']})}/></label>
     <NativeControlGroundCheck context={context} selectionKey={serviceName} tagPath={service.control}
       position={groundPosition(service)} upright disabled={servicesBlocked}
       onGround={position=>setService({...service,position:position.map(String) as Draft['position']})}/>
     <button type="button" disabled={!validPose(service)||!hasSourceHash||!context.controlSources?.includes(service.control)}
       onClick={()=>{const position=groundPosition(service);if(position)onPreview({kind:'factionService',sourceSha256,service:{faction:service.faction,service:service.service,controlTagPath:service.control,position,rotationRadians:[Number(service.rotation[0])*Math.PI/180,0,0]}})}}>Preview faction service</button>
    </>}
   </fieldset>
   {kits.filter(row=>row.body).length!==2&&<p className="subtle">Bind both faction player bodies before adding faction services.</p>}
   <p className="subtle">Preview, Accept, Save, then Build working tag edits. Compiled readback checks the control’s BSP, activation type and device groups.</p>
  </details>}
 <details className="native-squad-terminals"><summary>Forerunner squad terminals &amp; objective gates</summary>
  <p className="subtle">Append one native squad-selection control inside the return hub. Forerunner owns membership, six-member limits, faction compatibility and durable banking. No loadout profile or inventory writer is added.</p>
  <fieldset disabled={squadBlocked}>
   <label>Squad number<input aria-label="Squad terminal number" type="number" min={1} max={22} step={1} value={squad.number} onChange={event=>setSquad({...squad,number:event.target.value===''?0:Number(event.target.value)})}/></label>
   <label>Touched control tag<input aria-label="Squad control tag" list={id+'-controls'} value={squad.control} onChange={event=>setSquad({...squad,control:event.target.value})}/></label>
   <div className="native-encounter-position">{squad.position.map((value,index)=><label key={index}>World {['X','Y','Z'][index]}<input aria-label={'Squad terminal '+['X','Y','Z'][index]} type="number" step="any" value={value} onChange={event=>setSquad({...squad,position:squad.position.map((n,i)=>i===index?event.target.value:n) as Draft['position']})}/></label>)}</div>
   <div className="native-encounter-position">{squad.rotation.map((value,index)=><label key={index}>{['Yaw','Pitch','Roll'][index]} · degrees<input aria-label={'Squad terminal '+['yaw','pitch','roll'][index]} type="number" step="any" value={value} onChange={event=>setSquad({...squad,rotation:squad.rotation.map((n,i)=>i===index?event.target.value:n) as Draft['rotation']})}/></label>)}</div>
   <NativeControlGroundCheck context={context} selectionKey={JSON.stringify([squad.number,squad.rotation.slice(1)])}
    tagPath={squad.control.trim()} position={groundPosition(squad)} upright={upright(squad)} disabled={squadBlocked||squadExists}
    onGround={point=>setSquad(current=>({...current,position:point.map(String) as Draft['position']}))}/>
   <label><input type="checkbox" checked={squad.readiness} onChange={event=>setSquad({...squad,readiness:event.target.checked})}/>Require this squad's objectives before extraction</label>
   <p className="subtle"><code>{squadName}</code>{squad.readiness&&<> · <code>{squadName}_ready</code> starts at zero. Extraction stays locked until reviewed mission HaloScript sets this group to exactly one after genuine objectives. The engine resets it for each operation.</>} Native append alone creates no mission controller.</p>
   <button type="button" disabled={!Number.isInteger(squad.number)||squad.number<1||squad.number>22||!validPose(squad)||squadExists||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={()=>onPreview({kind:'squadTerminals',sourceSha256:context.tagSha256!,terminals:[{number:squad.number,controlTagPath:squad.control.trim(),position:squad.position.map(Number) as NativeFactionKit['position'],rotationRadians:squad.rotation.map(value=>Number(value)*Math.PI/180) as NativeFactionKit['rotationRadians'],readiness:squad.readiness}]})}>Preview squad terminal &amp; gate</button>
  </fieldset>
  {squadExists&&<Notice tone="info">This native squad number already exists. Select its existing control to edit the pose; choose an unused number to append another.</Notice>}
  {!(context.canAppendSquadTerminals??context.canAppendFactionKits)&&<p className="subtle">Requires unshared standard CE609 solo source, readable hub/activation volumes and an existing touched-by-player control dependency.</p>}
  <p className="subtle">Review → Accept → Save → Build working tag edits. Existing native device editing moves an accepted terminal. Restore before-edit tag recovers the complete preceding source; project Undo does not reverse native revisions. Native feature discovery must admit the selected Forerunner build. Player selection, objectives and extraction require gameplay testing.</p>
 </details></>;
}

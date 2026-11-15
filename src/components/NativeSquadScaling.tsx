import {useEffect,useState} from 'react';
import type {NativeOperation,NativeSquadCountEdit,NativeTagContext} from '../nativeOperations';
import {Notice} from './ui';
type Squad=NonNullable<NativeTagContext['scenarioSquads']>[number];
type Overrides=Record<string,{normal:string;insane:string}>;
const keyOf=(row:Squad)=>`${row.encounter}:${row.squad}`;
const asciiLower=(value:string)=>value.replace(/[A-Z]/g,char=>char.toLowerCase());
const proposed=(base:number,factor:number,override:string|undefined)=>
  override?.trim()?Number(override):base<0?base:Math.min(32,Math.round(base*factor));
const validCount=(value:number)=>Number.isInteger(value)&&value>=0&&value<=32;

/** Selection and arithmetic only. Preview/accept/build use NativeTagOperations. */
export default function NativeSquadScaling({context,busy,dirty,onPreview,onDraftChange}:{
  context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void;
}) {
  const scope=JSON.stringify([context.projectId,context.buildId,context.tag,context.tagSha256]);
  const [planScope,setPlanScope]=useState(scope),[selection,setSelection]=useState<string[]>([]);
  const [normalScale,setNormalScale]=useState(1),[insaneScale,setInsaneScale]=useState(1);
  const [overrides,setOverrides]=useState<Overrides>({}),[inspector,setInspector]=useState('');
  const [search,setSearch]=useState(''),[encounter,setEncounter]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{
    setPlanScope(scope);setSelection([]);setOverrides({});setInspector('');setNormalScale(1);setInsaneScale(1);setEncounter('');setSearch('');setMessage('');
  },[scope]);
  const stale=planScope!==scope;
  const rows=context.scenarioSquads??[];
  const protectedNames=new Set(context.protectedSquadEncounters??[]);
  const protectedRow=(row:Squad)=>protectedNames.has(asciiLower(row.encounterName));
  const encounters=Array.from(new Map(rows.map(row=>[row.encounter,row.encounterName] as const)).entries());
  const visible=rows.filter(row=>(!encounter||String(row.encounter)===encounter)&&
    `${row.encounterName}/${row.name}/${keyOf(row)}`.toLowerCase().includes(search.toLowerCase()));
  const selected=stale?[]:selection;
  const selectedKeys=new Set(selected);
  const selectedRows=rows.filter(row=>selectedKeys.has(keyOf(row)));
  const edits=selectedRows.map(row=>{
    const override=overrides[keyOf(row)];
    return {encounter:row.encounter,squad:row.squad,encounterName:row.encounterName,squadName:row.name,
      normalCount:proposed(row.normalCount,normalScale,override?.normal),insaneCount:proposed(row.insaneCount,insaneScale,override?.insane)};
  });
  const invalid=edits.filter(edit=>!validCount(edit.normalCount)||!validCount(edit.insaneCount));
  const changes=edits.filter((edit,index)=>edit.normalCount!==selectedRows[index].normalCount||edit.insaneCount!==selectedRows[index].insaneCount);
  const inspected=selectedRows.find(row=>keyOf(row)===inspector)??selectedRows[0];
  const inspectedEdit=inspected?edits.find(edit=>edit.encounter===inspected.encounter&&edit.squad===inspected.squad):undefined;
  const disabled=busy||dirty||stale||!!context.squadEditIssue;
  function choose(keys:string[]) {
    if(disabled)return;
    const admitted=new Set(rows.filter(row=>!protectedRow(row)).map(keyOf));
    const next=Array.from(new Set(keys)).filter(key=>admitted.has(key));
    if(next.length>128){setMessage('Select up to 128 squads per source revision. Narrow the encounter or search, then add those squads.');return;}
    onDraftChange();setSelection(next);setOverrides(old=>Object.fromEntries(Object.entries(old).filter(([key])=>next.includes(key))));
    setInspector(old=>next.includes(old)?old:next[0]??'');setMessage('');
  }
  function override(field:'normal'|'insane',value:string) {
    if(disabled||!inspected)return;
    const key=keyOf(inspected);onDraftChange();
    setOverrides(old=>({...old,[key]:{normal:old[key]?.normal??'',insane:old[key]?.insane??'',[field]:value}}));
  }
  const before=(field:'normalCount'|'insaneCount')=>selectedRows.every(row=>row[field]>=0)
    ?String(selectedRows.reduce((sum,row)=>sum+row[field],0)):'contains unset values';
  const after=(field:'normalCount'|'insaneCount')=>edits.every(edit=>validCount(edit[field]))
    ?String(edits.reduce((sum,edit)=>sum+edit[field],0)):'needs explicit counts';
  function preview() {
    if(disabled||!changes.length||invalid.length||!context.tagSha256||selectedRows.some(protectedRow))return;
    const targets:NativeSquadCountEdit[]=changes;
    onPreview({kind:'encounterSquadCountsBatch',sourceSha256:context.tagSha256,edits:targets});
  }
  return <details className="native-encounter-scaling">
    <summary>Scale encounters &amp; override squads</summary>
    <p className="subtle">Select up to128 editable squads. Multipliers use the current source, round to whole actors and cap at32 per field. Overrides replace that result. This changes native population fields, not AI health, damage or automatic player-count rules.</p>
    <div className="native-field-edit">
      <label>Encounter<select value={encounter} disabled={disabled} onChange={event=>setEncounter(event.target.value)}>
        <option value="">All encounters</option>{encounters.map(([index,name])=><option key={index} value={index}>{name||'Unnamed encounter'} · {index}</option>)}
      </select></label>
      <label>Find squad or encounter<input type="search" value={search} disabled={disabled} onChange={event=>setSearch(event.target.value)}/></label>
    </div>
    <label>Squads · Ctrl/Cmd or Shift selects multiple<select multiple size={6} aria-label="Squads for difficulty scaling"
      value={selected} disabled={disabled} style={{width:'100%',minWidth:0,maxWidth:'100%'}}
      onChange={event=>{
        const shown=new Set(visible.map(keyOf));
        choose([...selected.filter(key=>!shown.has(key)),...Array.from(event.currentTarget.selectedOptions,option=>option.value)]);
      }}>
      {visible.map(row=><option key={keyOf(row)} value={keyOf(row)} disabled={protectedRow(row)}>
        {row.encounterName||'Unnamed encounter'} / {row.name||'Unnamed squad'} · {keyOf(row)}{protectedRow(row)?' · source recipe':''}
      </option>)}
    </select></label>
    <div className="button-row">
      <button disabled={disabled||!visible.some(row=>!protectedRow(row))} onClick={()=>choose([...selected,...visible.filter(row=>!protectedRow(row)).map(keyOf)])}>Add shown squads</button>
      <button disabled={disabled||!selected.length} onClick={()=>choose([])}>Clear selection</button>
    </div>
    <p className="subtle">{visible.length} shown · {selected.length} selected · {changes.length} changed. Search retains hidden selections; preview includes every selected squad. Recipe-owned rows must change in their original authoring workflow.</p>
    {message&&<Notice tone="info">{message}</Notice>}
    {!!selectedRows.length&&<>
      <div className="native-field-edit">
        <label>Normal population × {normalScale.toFixed(2)}<input aria-label="Encounter normal population multiplier" type="range" min={0} max={4} step={0.25}
          value={normalScale} disabled={disabled} onChange={event=>{setNormalScale(Number(event.target.value));onDraftChange();}}/></label>
        <label>Insane population × {insaneScale.toFixed(2)}<input aria-label="Encounter insane population multiplier" type="range" min={0} max={4} step={0.25}
          value={insaneScale} disabled={disabled} onChange={event=>{setInsaneScale(Number(event.target.value));onDraftChange();}}/></label>
      </div>
      <p role="status">Normal total: {before('normalCount')} → {after('normalCount')} · Insane total: {before('insaneCount')} → {after('insaneCount')}</p>
      <label>Override one selected squad<select value={inspected?keyOf(inspected):''} disabled={disabled} onChange={event=>setInspector(event.target.value)}>
        {selectedRows.map(row=><option key={keyOf(row)} value={keyOf(row)}>{row.encounterName} / {row.name} · {keyOf(row)}{invalid.some(edit=>edit.encounter===row.encounter&&edit.squad===row.squad)?' · needs counts':''}</option>)}
      </select></label>
      {inspected&&inspectedEdit&&<>
        <p className="subtle">This squad: normal {inspected.normalCount} → {inspectedEdit.normalCount}, insane {inspected.insaneCount} → {inspectedEdit.insaneCount}.</p>
        <div className="native-field-edit">
          <label>Normal override · blank uses multiplier<input type="number" min={0} max={32} step={1} value={overrides[keyOf(inspected)]?.normal??''}
            disabled={disabled} onChange={event=>override('normal',event.target.value)}/></label>
          <label>Insane override · blank uses multiplier<input type="number" min={0} max={32} step={1} value={overrides[keyOf(inspected)]?.insane??''}
            disabled={disabled} onChange={event=>override('insane',event.target.value)}/></label>
        </div>
        <button disabled={disabled||!overrides[keyOf(inspected)]} onClick={()=>{setOverrides(old=>Object.fromEntries(Object.entries(old).filter(([key])=>key!==keyOf(inspected))));onDraftChange();}}>Clear this squad's overrides</button>
      </>}
      {!!invalid.length&&<Notice tone="info">{invalid.length} selected squads need whole counts from0 to32. Native negative/unset counts require an explicit override, or deselect those squads.
        <button disabled={disabled} onClick={()=>setInspector(`${invalid[0].encounter}:${invalid[0].squad}`)}>Show a squad needing counts</button>
      </Notice>}
      <button disabled={disabled||!changes.length||!!invalid.length||selectedRows.some(protectedRow)||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')}
        onClick={preview}>Preview encounter population</button>
      <p className="subtle">Review the changed fields below, then Accept as new source revision and build working tag edits. Selection, multipliers and unaccepted overrides are temporary review controls; accepted native revisions use the existing source history and recovery.</p>
    </>}
  </details>;
}

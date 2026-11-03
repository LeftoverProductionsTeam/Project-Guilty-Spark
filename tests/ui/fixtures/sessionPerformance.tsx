// Measures the real UI preference store, independent of rendering benchmarks.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
const session=await import(new URLSearchParams(location.search).has('baseline')
  ? '/.local/c54-workbench-polish-20261102/baseline-mapSession.ts' : '/src/mapSession.ts');
const {useMapState,writeMapSession,readMapSession}=session;

const maps = 40, fields = 12, portrait=new URLSearchParams(location.search).has('portrait');
const idFor=(index:number)=>index===0&&portrait?'global':`map-${index}`;
if(portrait)writeMapSession('global','corner.monitorPortrait',{version:1,png:'x'.repeat(121916)});
function Preference({ id, field }: { id:string; field:string }) {
  const [value] = useMapState(id, field, 0);
  return <output data-map={id} data-field={field}>{value}</output>;
}
const root = createRoot(document.getElementById('root')!);
flushSync(() => root.render(<>{Array.from({length:maps},(_,m) =>
  Array.from({length:fields},(_,f) => <Preference key={`${m}:${f}`} id={idFor(m)} field={`field-${f}`}/>))}</>));

Object.assign(window, {sessionWorkload: () => {
  const measures:number[]=[];
  // Same subscribers, source-independent UI data and synchronous commits in both builds.
  for(let pass=0;pass<6;pass++) {
    const began=performance.now();
    for(let i=0;i<160;i++) flushSync(() => writeMapSession(idFor(0),'field-0',pass*160+i+1));
    if(pass>0)measures.push(performance.now()-began);
  }
  return {milliseconds:measures,subscribers:maps*fields,writesPerPass:160,
    portraitBytes:portrait?121916:0,
    rendered:Number(document.querySelector(`output[data-map="${idFor(0)}"][data-field="field-0"]`)?.textContent),
    stored:readMapSession(idFor(0),'field-0',0),
    otherMapsUnchanged:[...document.querySelectorAll(`output:not([data-map="${idFor(0)}"])`)].every(e=>e.textContent==='0')};
}});

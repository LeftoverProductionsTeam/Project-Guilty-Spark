import { FLAGSHIP_VISION, FLAGSHIP_RESEARCH } from '../flagships';
import type { Workspace } from '../types';
import '../flagships.css';
export default function FlagshipOverview({navigate,compact=false}:{navigate:(workspace:Workspace)=>void;compact?:boolean}) {
  return <section className={`flagship-overview${compact?' flagship-compact':''}`} aria-label="Spark flagship capabilities">
    <div className="flagship-heading"><strong>Build worlds. Create together. Play in Halo.</strong>
      <span>Available now · In active development · Future research</span></div>
    <div className="flagship-grid">{FLAGSHIP_VISION.map(item=><button key={item.id} data-status={item.status}
      onClick={()=>navigate(item.workspace)} title={`${item.title}: ${item.detail}`}>
      <strong>{item.title}</strong><small>{item.status}</small>{!compact&&<p>{item.detail}</p>}
    </button>)}</div>
    {!compact&&<p className="flagship-research">{FLAGSHIP_RESEARCH} Editor sharing, live game editing and gameplay networking have separate acceptance.</p>}
  </section>;
}

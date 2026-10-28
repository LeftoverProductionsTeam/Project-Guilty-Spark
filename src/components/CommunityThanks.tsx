import { useMemo, useState } from 'react';
import { BookOpen, Heart, ExternalLink, PlusCircle, ShieldCheck } from 'lucide-react';
import { COMMUNITY_CREDITS, exportCommunitySuggestions, readCommunitySuggestions, saveCommunitySuggestions, validateCommunitySuggestion } from '../communityCredits';
import type { CommunityCredit } from '../communityCredits';
import { Notice, PageTitle, Pill } from './ui';
import '../onboarding.css';
export default function CommunityThanks(){
  const [suggestions,setSuggestions]=useState(readCommunitySuggestions);
  const [name,setName]=useState('');const [contribution,setContribution]=useState('');const [url,setUrl]=useState('');
  const [error,setError]=useState('');const [filter,setFilter]=useState('');
  const verified=useMemo(()=>COMMUNITY_CREDITS.filter(c=>(`${c.name} ${c.contribution} ${c.category}`).toLowerCase().includes(filter.toLowerCase())),[filter]);
  function add(){try{
    const newEntry=validateCommunitySuggestion({name,contribution,url});
    const next=[...suggestions.filter(x=>x.id!==newEntry.id),newEntry];
    saveCommunitySuggestions(next);setSuggestions(next);setName('');setContribution('');setUrl('');setError('');
  }catch(e){setError(String(e));}}
  function downloadSuggestions(){
    const blob=new Blob([exportCommunitySuggestions(suggestions)],{type:'application/json'});
    const href=URL.createObjectURL(blob);
    try{const a=document.createElement('a');a.href=href;a.download='guilty-spark-community-nominations.json';a.click();}
    finally{setTimeout(()=>URL.revokeObjectURL(href),3000);}
  }
  return <div className="analysis-page gs-community">
    <PageTitle eyebrow="COMMUNITY / THE GREAT RECLAMATION" title="To everyone who kept Halo modding alive"
      description="Thank you to the map makers, reversers, educators, preservationists, tool authors, beta testers, server hosts, and forum members who shared what they learned." />
    <section className="analysis-card gs-thanks-intro">
      <Heart size={29} aria-hidden="true"/><h2>We built on a community, not in isolation.</h2>
      <p>From the Halo Demo and MacGamingMods experiments to Halo Maps, HaloMods, Custom Edition, Invader, the MEK, c20 and MCC's Editing Kits: countless people documented the hard parts. Every unnamed tutorial writer, bug reporter, map creator and fellow player deserves thanks too.</p>
      <p><strong>This register is not exhaustive.</strong> It credits verifiable projects and contributors without guessing historical identities. The nomination list is private to your machine until you choose to export it; it is not publicly submitted or automatically treated as verified.</p>
    </section>
    <p><a href="https://github.com/LeftoverProductionsTeam/Project-Guilty-Spark/blob/master/COMMUNITY_CREDITS.md" target="_blank" rel="noopener noreferrer">Full community credits and provenance</a></p>
    <section className="analysis-card"><div className="section-heading"><h2>Documented foundations</h2><Pill tone="green"><ShieldCheck size={12}/> Reference-linked</Pill></div>
      <label>Search credits and research <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Tool, creator or contribution" aria-label="Search community credits" /></label>
      <div className="gs-credits-grid">{verified.map(entry=><article className="gs-credit" key={entry.id}>
        <div><strong>{entry.name}</strong><Pill>{entry.category}</Pill></div><p>{entry.contribution}</p>
        <a href={entry.url} target="_blank" rel="noopener noreferrer" title={`Open the historical reference for ${entry.name}`}>Reference <ExternalLink size={13}/></a>
      </article>)}{verified.length===0&&<p>No references match that search.</p>}</div>
    </section>
    <section className="analysis-card"><div className="section-heading"><h2>Help remember someone</h2><Pill>Local nominations</Pill></div>
      <p>Have a creator, forum thread, modding app, guide, or discovery that deserves recognition? Save a sourced nomination. It remains labeled unverified until its original history is checked.</p>
      <div className="gs-nomination-grid">
        <label>Creator, group or tool name <input maxLength={96} value={name} onChange={e=>setName(e.target.value)} placeholder="Creator or project"/></label>
        <label>HTTPS reference <input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/></label>
      </div>
      <label>What did they contribute? <textarea rows={2} maxLength={280} value={contribution} onChange={e=>setContribution(e.target.value)} placeholder="A specific tool, map, tutorial, research technique, or preservation effort"/></label>
      <div className="analysis-actions"><button className="small-button" onClick={add} title="Validate and save this nomination only on this device"><PlusCircle size={15}/> Save local nomination</button>
        <button className="small-button" disabled={!suggestions.length} onClick={downloadSuggestions} title="Export a JSON list for independent historical verification"><BookOpen size={15}/> Export nominations</button></div>
      {error&&<Notice>{error}</Notice>}
      {suggestions.length>0&&<div className="gs-credits-grid">{suggestions.map((item:CommunityCredit)=><article key={item.id} className="gs-credit"><strong>{item.name}</strong><Pill tone="amber">Unverified suggestion</Pill><p>{item.contribution}</p><a href={item.url} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={12}/></a><button className="small-button" title={`Remove nomination ${item.name} locally`} onClick={()=>{const next=suggestions.filter(x=>x.id!==item.id);try{saveCommunitySuggestions(next);setSuggestions(next);setError('');}catch(e){setError(String(e));}}}>Remove</button></article>)}</div>}
    </section>
  </div>;
}

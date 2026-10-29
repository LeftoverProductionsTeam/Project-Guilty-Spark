import { useMemo, useState } from 'react';
import { ArrowDownToLine, Archive, ExternalLink, FolderOpen, Info, Search, ShieldCheck } from 'lucide-react';
import { COMMUNITY_MAP_SOURCES, describeCommunityDownload, filterCommunityMapSources, isCuratedCommunityUrl } from '../communityMapSources';
import type { CommunityMapFilter } from '../communityMapSources';
import { native } from '../api';
import { HelpTip, Notice, PageTitle, Pill } from './ui';
import MapDownload from './MapDownload';
import type {MapDownloadAction} from './MapDownload';
import type {OpenProject} from '../types';

const FILTERS: {value: CommunityMapFilter; label: string}[] = [
  {value: 'all', label: 'All archives'}, {value: 'halo-ce', label: 'Custom Edition'},
  {value: 'halo-pc', label: 'Halo PC'}, {value: 'halo-demo', label: 'Mac Demo'},
  {value: 'halo-md', label: 'HaloMD'},
];

export default function CommunityMaps({onImport, onImportConvert, currentMapTitle, onConvertCurrent, onLibrary, busy,onDownloaded,targetLabel}: {
  onImport: () => void; onImportConvert: () => void; currentMapTitle: string|null; onConvertCurrent: () => void; onLibrary: () => void; busy: boolean;
  onDownloaded?:(opened:OpenProject[],action:MapDownloadAction)=>void|Promise<void>;targetLabel?:string;
}) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<CommunityMapFilter>('all');
  const [filename, setFilename] = useState('');
  const [copyState, setCopyState] = useState<string>('');
  const matching = useMemo(() => filterCommunityMapSources(query, audience), [query, audience]);
  const extensionAdvice = filename.trim() ? describeCommunityDownload(filename) : null;
  return <div className="analysis-page gs-map-discovery">
    <PageTitle eyebrow="HALO MODDING ARCHIVES / CREATE • PRESERVE • SHARE"
      title="Discover community maps. Preserve your favorites."
      description="Download a Custom Edition map from an archive, then import and convert it to MCC Halo 1 inside Spark. Conversion checks explain missing resources and unsupported features."
      actions={<><button className="small-button" onClick={onLibrary}><FolderOpen size={16}/> Your map library</button>
        <button className="primary" onClick={onImportConvert} disabled={!native || busy}><ArrowDownToLine size={16}/>{busy?'Importing…':'Import & convert to MCC'}</button></>}/>
    <MapDownload onDownloaded={onDownloaded} busy={busy} targetLabel={targetLabel}/>
    <Notice tone="info">The archives below are a researched directory. Their catalog links open in your browser; paste a direct map/package URL above to download and import inside Spark. No installs, executable launches or replacement of game maps.</Notice>
    <div className="gs-download-steps" aria-label="Download and import steps">
      <div><b>01</b><strong>Find a map</strong><p>Open an archive below. Confirm its author, edition, required resources and permission.</p></div>
      <div><b>02</b><strong>Download into Spark</strong><p>Paste the direct author/package link above, or import a package you already downloaded.</p></div>
      <div><b>03</b><strong>Inspect in Spark</strong><p>Choose Import downloaded map. Spark preserves, hashes and validates supported files.</p></div>
      <div><b>04</b><strong>Convert to MCC</strong><p>Choose Import &amp; convert to MCC. Prepare installed MCC tools, resolve the compatibility report, then build and playtest the separate MCC package.</p></div>
    </div>
    <section className="analysis-card gs-map-sources" aria-label="Community map archives">
      <div className="gs-section-tools"><div><div className="eyebrow">ARCHIVE NAVIGATOR</div><h2>Historic and active community catalogs</h2></div>
        <HelpTip help="The list below contains static, researched archive landing pages. It does not read or download their files. Each archive controls its own availability, copyright and download behavior."/></div>
      <div className="gs-map-source-filters">
        <label className="gs-map-source-search"><Search size={16}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter archives by name or era…" aria-label="Filter community archives" maxLength={120}/></label>
        <div className="gs-map-filter-chips" role="group" aria-label="Halo edition">
          {FILTERS.map(f=><button key={f.value} aria-pressed={audience===f.value} className={audience===f.value?'selected':''} onClick={()=>setAudience(f.value)}>{f.label}</button>)}
        </div>
      </div>
      <p className="gs-map-result-count">{matching.length} of {COMMUNITY_MAP_SOURCES.length} researched archive pages</p>
      <div className="gs-map-source-grid">
        {matching.map(source=><article className="gs-map-source-card" key={source.id}>
          <div className="gs-map-source-card-top"><span className="gs-source-icon"><Archive size={18}/></span><Pill tone={source.catalog?'green':'muted'}>{source.catalog?'Browse downloads':'Historical forum'}</Pill></div>
          <h3>{source.title}</h3><div className="gs-map-source-era">{source.era} · {source.audience.replace('halo-','Halo ').toUpperCase()}</div>
          <p>{source.summary}</p><div className="gs-map-source-caveat"><Info size={14}/><small>{source.caveat}</small></div>
          {isCuratedCommunityUrl(source.url) && <>
            <a className="gs-open-archive" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.title} in your browser (external website)`} title="Opens an external archive; no files are downloaded automatically">
              Open {source.catalog?'archive':'historical posts'} <ExternalLink size={15}/>
            </a>
            <div className="gs-archive-address"><code>{source.url}</code>
              <button type="button" title="Copy the exact archive address if your desktop webview does not open the link" onClick={()=>{
                if (!navigator.clipboard?.writeText) {setCopyState('Clipboard unavailable. Select and copy the visible archive address.');return;}
                void navigator.clipboard.writeText(source.url).then(()=>setCopyState(`Copied ${source.title}`)).catch(()=>setCopyState('Clipboard unavailable. Select and copy the visible archive address.'));
              }}>Copy link</button></div>
          </>}
        </article>)}
      </div>
      {copyState && <p className="gs-map-copy-status" role="status">{copyState}</p>}
      {!matching.length && <div className="gs-map-empty" role="status"><Search size={21}/><strong>No matching archive</strong><p>Try All archives or remove the search filter. Spark does not claim to search remote maps.</p><button onClick={()=>{setQuery('');setAudience('all');}}>Clear filters</button></div>}
    </section>
    <section className="analysis-card gs-map-file-advisor"><div className="gs-section-tools"><div><div className="eyebrow">BEFORE IMPORTING</div><h2>Know what you downloaded</h2></div><HelpTip help="Only the filename's extension is checked here. It is a convenience hint, not virus scanning, signature verification or an assertion that the file is safe."/></div>
      <label htmlFor="gs-map-file-name">Optional: enter a downloaded filename to see the next step</label>
      <input id="gs-map-file-name" value={filename} onChange={e=>setFilename(e.target.value)} maxLength={180} placeholder="example: classic_arena.zip or bloodgulch.map"/>
      {extensionAdvice ? <div className={`gs-file-advice gs-file-${extensionAdvice.kind}`} role="status"><ShieldCheck size={16}/><p>{extensionAdvice.guidance}</p></div> : <p className="subtle">Supported native import: <code>.map</code>, <code>.yelo</code> and supported <code>.zip</code> archives. Spark also imports its own <code>.gsproject</code> descriptors, but they are not downloaded maps.</p>}
      <div className="gs-map-download-actions"><button onClick={onImport} disabled={!native || busy}><ArrowDownToLine size={16}/>Import downloaded map</button><button onClick={onConvertCurrent} disabled={!currentMapTitle||busy} title={currentMapTitle?`Open MCC conversion for ${currentMapTitle}`:'Open or import a map first'}>Convert open map to MCC</button><button onClick={onLibrary}>View preserved projects</button></div>
      {currentMapTitle&&<p className="subtle">Open map: {currentMapTitle}. Conversion runs from Build &amp; playtest and keeps its own resources, targets and logs.</p>}
      <p className="subtle">Halo CE, Halo PC, Demo/Mac, HaloMD, Xbox and MCC caches are not interchangeable merely because the extension says <code>.map</code>. Archives can have missing shared resources; inspect errors and check the author's release notes before attempting a build.</p>
    </section>
  </div>;
}

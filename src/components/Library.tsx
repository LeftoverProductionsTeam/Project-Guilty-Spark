import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  FolderOpen,
  Globe2,
  HardDrive,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Watch,
} from 'lucide-react';
import { useState } from 'react';
import { native } from '../api';
import type { Bootstrap, LibraryEntry } from '../types';
import { formatNumber } from '../editor';
import { Notice, PageTitle, Pill } from './ui';
export default function Library({
  data,
  onImport,
  onNew,
  onNewMap,
  onFindMaps,
  onOpen,
  onInbox,
  onInitializeInbox,
  busy,
}: {
  data: Bootstrap;
  onImport: () => void;
  onNew: () => void;
  onNewMap: () => void;
  onFindMaps: () => void;
  onOpen: (e: LibraryEntry) => void;
  onInbox: () => void;
  onInitializeInbox: () => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const entries = data.entries.filter(
    (e) =>
      (filter === 'all' || (filter === 'maps' ? e.version !== null : e.version === null)) &&
      `${e.title} ${e.creator} ${e.engine}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="library-page">
      <PageTitle
        eyebrow="HALO MODERN EVOLVED"
        title="Your worlds, reimagined."
        description="Discover, restore, and make something wonderfully unexpected."
        actions={
          <>
            <button onClick={onFindMaps} title="Browse verified community archive homepages; download only in your browser"><Globe2 size={15} />Find community maps</button>
            <button onClick={onNewMap}><Box size={15} />Create a map</button>
            <button onClick={onNew}>
              <Plus size={15} />
              New workspace
            </button>
            <button className="primary" onClick={onImport} disabled={busy}>
              <Upload size={15} />
              {busy ? 'Inspecting…' : 'Import map or archive'}
            </button>
          </>
        }
      />
      <section className="library-hero">
        <div className="hero-copy">
          <Pill tone="green">
            <span className="live-dot" />
            THE PRESERVATION WORKBENCH
          </Pill>
          <h2>
            Old worlds.{' '}
            <br />
            <span>New possibilities.</span>
          </h2>
          <p>
            From your first projectile swap to the next great restoration. Bring your Halo maps into a
            workspace built for discovery.
          </p>
          <div className="gs-hero-actions">
            <button className="hero-link" onClick={onImport} disabled={busy}>Open a .map or ZIP archive <ArrowRight size={17} /></button>
            <button className="gs-hero-secondary" onClick={onFindMaps} title="Browse old HaloMods and current Halo map archives in an external browser">Find classic maps <Globe2 size={17}/></button>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbital orbit-one" />
          <div className="orbital orbit-two" />
          <div className="orbital orbit-three" />
          <div className="hero-orb">
            <div className="orb-band" />
            <div className="orb-eye">
              <span />
            </div>
          </div>
          <div className="art-coordinate">
            GS / 001
            <br />
            ARCHIVE · EDIT · EVOLVE
          </div>
          <div className="art-cross cross-one">+</div>
          <div className="art-cross cross-two">+</div>
        </div>
      </section>
      {!data.installation.mccPath && (
        <Notice tone="info">
          {data.diagnostics[0] ??
            'MCC was not found automatically. The local Inbox can still import maps and archives.'}
        </Notice>
      )}
      <div className="runtime-strip">
        <div className="runtime-icon">
          <HardDrive size={20} />
        </div>
        <div>
          <strong>
            {data.installation.mccPath ? 'Halo: The Master Chief Collection' : 'Local map library'}
          </strong>
          <span>{data.installation.mccPath ?? data.inboxDirectory}</span>
        </div>
        <Pill tone={data.installation.halo1Installed ? 'green' : 'muted'}>
          {data.installation.halo1Installed ? (
            <>
              <Check size={11} />
              Halo 1 found
            </>
          ) : (
            'MCC not found'
          )}
        </Pill>
        <span className="strip-divider" />
        <div className="inbox-state">
          <Watch size={16} />
          <span>{native ? 'Local Inbox' : 'Desktop required'}</span>
        </div>
        <button className="small-button" onClick={onInbox} disabled={!native}>
          <FolderOpen size={14} />
          Open Inbox
        </button>
      </div>
      {data.installation.mccPath && !data.managed && (
        <div className="mcc-inbox-optin">
          <span>Optional: create an additional watched import Inbox inside the detected MCC mod folder.</span>
          <button className="small-button" onClick={onInitializeInbox} disabled={busy}>
            Create MCC Inbox
          </button>
        </div>
      )}
      <div className="library-toolbar">
        <div className="tabs">
          <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
            All projects <span>{data.entries.length}</span>
          </button>
          <button className={filter === 'maps' ? 'selected' : ''} onClick={() => setFilter('maps')}>
            Halo maps
          </button>
          <button className={filter === 'assets' ? 'selected' : ''} onClick={() => setFilter('assets')}>
            Asset workspaces
          </button>
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search library"
            placeholder="Search your library…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </div>
      </div>
      {entries.length ? (
        <div className="map-grid">
          {entries.map((entry) => {
            let preview: string | null = null;
            try {
              preview = localStorage.getItem(`spark:thumbnail:${entry.sha256 ?? entry.id}`);
            } catch {
              /* Preview caching is optional. */
            }
            return (
              <button key={entry.id} className="map-card" disabled={busy} onClick={() => onOpen(entry)}>
                <div className="map-thumbnail">
                  {preview ? (
                    <img src={preview} alt={`Collision geometry overview of ${entry.title}`} />
                  ) : (
                    <div className="no-thumbnail">
                      <Box size={39} />
                      <span>{entry.version ? 'No geometry preview captured' : 'Asset workspace'}</span>
                    </div>
                  )}
                  <div className="thumbnail-top">
                    <Pill>{entry.version ? `CACHE ${entry.version}` : 'WORKSPACE'}</Pill>
                    <Pill tone={entry.status === 'validated' ? 'green' : 'dark'}>
                      {entry.status === 'validated'
                        ? 'Build validated'
                        : entry.status === 'failed'
                          ? 'Build failed'
                          : entry.version
                            ? 'Source preserved'
                            : 'Local project'}
                    </Pill>
                  </div>
                </div>
                <div className="map-card-content">
                  <h3>
                    {entry.title}
                    <ChevronRight size={17} />
                  </h3>
                  <p>
                    {entry.creator || 'Creator not recorded'}
                    <span>·</span>
                    {entry.engine}
                  </p>
                  <div>
                    <span>{entry.tagCount ? `${formatNumber(entry.tagCount)} tags` : 'Asset workshop'}</span>
                    <span>{entry.objectCount} objects</span>
                    <span>
                      {new Date(entry.modifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          <button className="add-map-card" onClick={onImport}>
            <Plus size={26} />
            <strong>Another world awaits</strong>
            <span>Import a map, ZIP archive or project</span>
          </button>
        </div>
      ) : (
        <div className="import-dropzone" onDragOver={(e) => e.preventDefault()}>
          <div className="drop-icon">
            <ArrowDownToLine size={28} />
          </div>
          <h2>{query ? 'No matching projects' : 'Every restoration starts with a map.'}</h2>
          <p>
            {query
              ? 'Try a different title, creator, or engine.'
              : 'Drop a .map or ZIP archive into this window, browse for one, or place it in the local Inbox. Original files are always preserved.'}
          </p>
          <div className="gs-empty-map-actions">
            <button onClick={onImport} disabled={busy}><FolderOpen size={15} />{busy ? 'Reading cache…' : 'Browse local maps'}</button>
            <button onClick={onFindMaps}><Globe2 size={15}/>Find maps online</button>
          </div>
          <div className="supported-formats">
            <span>Xbox 5</span>
            <span>Demo 6</span>
            <span>PC 7</span>
            <span>MCC 13</span>
            <span>Custom Edition 609</span>
          </div>
        </div>
      )}
      <div className="library-notes">
        <div>
          <ShieldCheck size={18} />
          <span>
            <strong>Your originals stay original.</strong>
            <small>Source copies, integrity hashes, and changes stored in a separate project.</small>
          </span>
        </div>
        <div>
          <ArrowDownToLine size={18} />
          <span>
            <strong>Built for local preservation.</strong>
            <small>No telemetry. No public uploads. Your library stays on your computer.</small>
          </span>
        </div>
      </div>
    </div>
  );
}

import HomeModel from './HomeModel';
import HomeRuntimes from './HomeRuntimes';
import FlagshipOverview from './FlagshipOverview';
import {
  ArrowDownToLine,
  Box,
  ChevronRight,
  FolderOpen,
  Globe2,
  Grid2X2,
  Plus,
  List,
  Search,
  ShieldCheck,
  Upload,
  Watch,
} from 'lucide-react';
import { useMapState } from '../mapSession';
import '../libraryCompact.css';
import { native } from '../api';
import type { Bootstrap, LibraryEntry, RuntimeId, Workspace } from '../types';
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
  onRuntime,
  onWorkspace,
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
  onRuntime: (id: RuntimeId) => void;
  onWorkspace: (workspace:Workspace) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useMapState('global', 'library.query', '');
  const [filter, setFilter] = useMapState('global', 'library.filter', 'all');
  const [layout, setLayout] = useMapState<'tiles' | 'list'>('global', 'library.layout', 'tiles');
  const entries = data.entries.filter(
    (e) =>
      (filter === 'all' || (filter === 'maps' ? e.version !== null : e.version === null)) &&
      `${e.title} ${e.creator} ${e.engine}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={`library-page library-layout-${layout}`}>
      <PageTitle
        eyebrow="MAP LIBRARY"
        title="One Halo. Every World. Every Tool. Together."
        description={`${data.entries.length} preserved maps and workspaces. Open a project to continue.`}
        actions={
          <>
            <button
              onClick={onFindMaps}
              title="Browse verified community archive homepages; download only in your browser"
            >
              <Globe2 size={15} />
              Find community maps
            </button>
            <button onClick={onNewMap} disabled={busy}>
              <Box size={15} />
              Create a map
            </button>
            <button onClick={onNew} disabled={busy}>
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
          <h2>
            Project Guilty Spark<br />
            <span>Your Halo creation studio.</span>
          </h2>
          <p>Build native worlds, edit together and test in your Halo. Choose a preserved map below.</p>
        </div>
        <div className="hero-art" aria-label="Live Halo model showcase">
          <HomeModel data={data} />
        </div>
      </section>
      <FlagshipOverview compact navigate={onWorkspace}/>
      {!native && (
        <Notice tone="info">
          {data.diagnostics[0] ??
            'MCC was not found automatically. The local Inbox can still import maps and archives.'}
        </Notice>
      )}
      <div className="runtime-strip home-runtime-strip">
        <HomeRuntimes data={data} onSelect={onRuntime}/>
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
        <span className="library-result-count" role="status">
          {entries.length} shown
        </span>
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
        <div className="library-layout-switch" role="group" aria-label="Library layout">
          <button
            aria-label="Compact map tiles"
            aria-pressed={layout === 'tiles'}
            title="Compact map tiles"
            onClick={() => setLayout('tiles')}
          >
            <Grid2X2 size={15} />
          </button>
          <button
            aria-label="Map list"
            aria-pressed={layout === 'list'}
            title="Map list"
            onClick={() => setLayout('list')}
          >
            <List size={15} />
          </button>
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
        </div>
      ) : (
        <div className="import-dropzone" onDragOver={(e) => e.preventDefault()}>
          <div className="drop-icon">
            <ArrowDownToLine size={28} />
          </div>
          <h2>
            {query || filter !== 'all' ? 'No matching projects' : 'Every restoration starts with a map.'}
          </h2>
          <p>
            {query || filter !== 'all'
              ? 'Try another search or show all your projects.'
              : 'Drop a .map or ZIP archive into this window, browse for one, or place it in the local Inbox. Original files are always preserved.'}
          </p>
          <div className="gs-empty-map-actions">
            {(query || filter !== 'all') && (
              <button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Show all projects
              </button>
            )}
            <button onClick={onImport} disabled={busy}>
              <FolderOpen size={15} />
              {busy ? 'Reading cache…' : 'Browse local maps'}
            </button>
            <button onClick={onFindMaps}>
              <Globe2 size={15} />
              Find maps online
            </button>
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
        {data.installation.mccPath && !data.managed && (
          <details className="library-options">
            <summary>Library options</summary>
            <div className="mcc-inbox-optin">
              <span>Add a watched import Inbox inside the detected MCC mod folder.</span>
              <button className="small-button" onClick={onInitializeInbox} disabled={busy}>
                Create MCC Inbox
              </button>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

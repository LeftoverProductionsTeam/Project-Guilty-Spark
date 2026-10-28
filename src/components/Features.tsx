import { useState } from 'react';
import { SPARK_FEATURES, searchFeatures } from '../featureCatalog';
import type { Project, Workspace } from '../types';
import { PageTitle, Pill } from './ui';
import '../features.css';
const toolNames: Partial<Record<Workspace, string>> = {
  world: 'Level Editor',
  quickforge: 'Level Editor',
  live: 'Level Editor',
  machinima: 'Machinima',
  build: 'Build & playtest',
  'get-started': 'Start here',
  library: 'Map library',
  'how-to': 'How-to & Glossary',
  tags: 'Tag editor',
  assets: 'Asset workshop',
  compare: 'Compare variants',
  creator: 'Creator Studio',
  scenario: 'AI & scenario',
  firefight: 'Firefight rules',
  preservation: 'Preservation record',
  interface: 'Interface Studio',
};
export default function Features({
  project,
  openMaps,
  navigate,
}: {
  project: Project | null;
  openMaps: number;
  navigate: (w: Workspace) => void;
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('All');
  const found = searchFeatures(query, category);
  return (
    <div className="analysis-page gs-features">
      <PageTitle
        eyebrow="SPARK FIELD GUIDE"
        title="What can Spark do?"
        description="Browse capabilities, follow a short workflow, and jump into the right tool. Your current map stays open while you explore."
      />
      <div className="feature-journey" aria-label="Workbench workflow">
        <button onClick={() => navigate('get-started')}>1 · Connect your Halo &amp; tools</button>
        <button onClick={() => navigate('library')}>2 · Open or create maps</button>
        <button onClick={() => navigate('world')}>3 · Edit the active map</button>
        <button onClick={() => navigate('build')}>4 · Build &amp; test in Halo</button>
      </div>
      <p className="feature-map-context" role="status">
        {project ? (
          <>
            Active map: <strong>{project.title}</strong> · {openMaps} open {openMaps === 1 ? 'map' : 'maps'}.
            Each map keeps its own edits and undo history.
          </>
        ) : (
          'Open a map from Map library or create a QuickForge map in the Level Editor to begin.'
        )}
      </p>
      <div className="feature-filters">
        <label>
          Find a feature
          <input
            type="search"
            aria-label="Find a Spark feature"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="animations, multiple maps, textures, undo…"
          />
        </label>
        <label>
          Category
          <select
            aria-label="Feature category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>All</option>
            {[...new Set(SPARK_FEATURES.map((f) => f.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <span role="status">
          {found.length} {found.length === 1 ? 'feature' : 'features'}
        </span>
      </div>
      <div className="feature-catalog">
        {found.map((f) => (
          <article className="analysis-card feature-card" key={f.id}>
            <div className="section-heading">
              <span className="section-label">{f.category}</span>
              <Pill>{f.status}</Pill>
            </div>
            <h2>{f.title}</h2>
            <p>{f.summary}</p>
            <details>
              <summary>How to use it</summary>
              <ol>
                {f.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {f.limit && <p className="subtle">{f.limit}</p>}
            </details>
            <button onClick={() => navigate(f.needsProject && !project ? 'library' : f.workspace)}>
              {f.needsProject && !project
                ? 'Choose a map first'
                : `Open ${toolNames[f.workspace] ?? f.workspace}`}
            </button>
          </article>
        ))}
      </div>
      {!found.length && (
        <div className="analysis-card" role="status">
          <p>No features match this search.</p>
          <button
            onClick={() => {
              setQuery('');
              setCategory('All');
            }}
          >
            Show all features
          </button>
        </div>
      )}
    </div>
  );
}

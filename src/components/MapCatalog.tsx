import {COMMUNITY_MAP_SOURCES} from '../communityMapSources';
import ExternalBrowserLink from './ExternalBrowserLink';
import { useMemo, useState } from 'react';
import { filterMapCatalog, MAP_CATALOG } from '../mapCatalog';
import type { CatalogCategory, CatalogEdition, CatalogMap } from '../mapCatalog';
import '../mapCatalog.css';
const editionNames: Record<CatalogEdition, string> = {
  'halo-ce': 'Custom Edition',
  'halo-pc': 'Halo PC',
  'halo-demo': 'Demo / Trial',
  'halo-md': 'HaloMD',
  mcc: 'MCC',
};
export default function MapCatalog({
  onChoose,
  busy,
}: {
  onChoose: (map: CatalogMap) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState(''),
    [edition, setEdition] = useState<CatalogEdition | 'all'>('all'),
    [category, setCategory] = useState<CatalogCategory | 'all'>('all');
  const maps = useMemo(() => filterMapCatalog(query, edition, category), [query, edition, category]);
  return (
    <section className="gs-map-catalog" aria-label="Featured community maps">
      <header>
        <div>
          <h2>Find your next Halo map</h2>
          <p>
            Real author and archive releases. Choose a direct download here, or visit the publisher for its
            download steps.
          </p>
        </div>
        <small>Maintained selection · checked 28 October 2026</small>
      </header>
      <nav className="gs-full-catalogs" aria-label="Browse complete community map catalogs"><strong>Browse more maps</strong>{COMMUNITY_MAP_SOURCES.filter(source=>source.catalog).map(source=><ExternalBrowserLink key={source.id} href={source.url}>{source.title} ↗</ExternalBrowserLink>)}<button onClick={()=>document.querySelector('.gs-map-sources')?.scrollIntoView({behavior:'smooth',block:'start'})}>All archives & editions</button></nav>
      <div className="gs-catalog-filters">
        <input
          aria-label="Search maps and authors"
          type="search"
          placeholder="Map, author or theme…"
          value={query}
          maxLength={120}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Catalog Halo edition"
          value={edition}
          onChange={(e) => setEdition(e.target.value as typeof edition)}
        >
          <option value="all">All Halo editions</option>
          {Object.entries(editionNames).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Catalog map category"
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
        >
          <option value="all">All map types</option>
          {['multiplayer', 'campaign', 'firefight', 'zombies', 'classic'].map((name) => (
            <option value={name} key={name}>
              {name[0].toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
        <span>
          {maps.length} of {MAP_CATALOG.length} maps
        </span>
      </div>
      <div className="gs-catalog-grid">
        {maps.map((map) => (
          <article key={map.id} aria-label={`${map.title} map`}>
            <ExternalBrowserLink className="gs-catalog-image" href={map.source} target="_blank" rel="noopener noreferrer">
              {map.image ? (
                <img
                  src={map.image}
                  alt={`${map.title} — publisher screenshot`}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.hidden = true;
                  }}
                />
              ) : null}
              <span>Publisher preview</span>
            </ExternalBrowserLink>
            <div className="gs-catalog-card-body">
              <small>
                {editionNames[map.edition]} · {map.categories.join(' · ')}
              </small>
              <h3>{map.title}</h3>
              <p className="gs-catalog-author">{map.author}</p>
              <p>{map.description}</p>
              <small>
                {map.size} · {map.released}
              </small>
              <div className="gs-catalog-actions">
                {map.directDownload && (
                  <button disabled={busy} onClick={() => onChoose(map)}>
                    Download into Spark…
                  </button>
                )}
                <ExternalBrowserLink href={map.source} target="_blank" rel="noopener noreferrer">
                  Publisher &amp; credits ↗
                </ExternalBrowserLink>
                {map.mccWorkshop && (
                  <ExternalBrowserLink href={map.mccWorkshop} target="_blank" rel="noopener noreferrer">
                    Author’s MCC release ↗
                  </ExternalBrowserLink>
                )}
              </div>
              <details>
                <summary>Requirements &amp; conversion</summary>
                <p>{map.dependencies}</p>
                <p>{map.permissions}</p>
                <p>
                  After importing, Spark reads the actual cache and reports compatibility. A catalog listing
                  does not establish a successful MCC build or playtest.
                </p>
              </details>
            </div>
          </article>
        ))}
      </div>
      {!maps.length && (
        <p role="status">
          No published entries match these filters.{' '}
          <button
            onClick={() => {
              setQuery('');
              setEdition('all');
              setCategory('all');
            }}
          >
            Show all maps
          </button>
        </p>
      )}
    </section>
  );
}

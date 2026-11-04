import { useMapState } from '../mapSession';
import type { Workspace } from '../types';
import type { Project } from '../types';
import { SPARK_FEATURES, searchFeatures } from '../featureCatalog';
import { featureWorkflowTarget, openFeatureWorkflow } from '../featureWorkflow';
import { Pill } from './ui';
import { academyTerms } from '../learningGlossary';
const terms = [
  ...academyTerms,
  [
    'Tag',
    'A Halo data file that describes an object, effect, image, sound or level. Tags often reference other tags.',
  ],
  ['Scenario', 'The level’s placements, player starts, objectives, scripts and BSP references.'],
  [
    'BSP',
    'The compiled level structure: surfaces, collision and visibility data. Changing source geometry requires rebuilding it.',
  ],
  [
    'Map / cache',
    'The compiled file loaded by a specific Halo edition. It is different from the editable tag tree.',
  ],
  [
    'Editing kit',
    'The separate set of tools for authoring Halo content. Installing MCC alone does not install its kit.',
  ],
  [
    'Tool / Map Builder',
    'The command-line compiler that turns source models and editable tags into Halo assets and maps.',
  ],
  ['Guerilla', 'The official editor for individual tag properties and dependencies.'],
  ['Sapien', 'The official scenario editor for placements, encounters, scripts and level testing.'],
  [
    'Standalone / Tag Test',
    'The SDK’s development game executable. It loads loose tags; Halo 1 Standalone has no multiplayer networking.',
  ],
  [
    'tags folder',
    'Editable Halo tag files. Point Spark at the extracted working copy for the selected editing kit.',
  ],
  [
    'data folder',
    'Source images, geometry and scripts used by the compiler. It is different from the tags folder.',
  ],
  [
    'Resource maps',
    'Shared classic bitmaps.map, sounds.map and loc.map files. Use the matching edition and source files.',
  ],
  [
    'Shader / material',
    'How a surface combines textures, transparency and lighting. A texture preview alone is not the full game material.',
  ],
  ['Lightmap', 'Baked lighting compiled for a BSP. Moving an editor sun does not rewrite that lightmap.'],
  ['Fog', 'Distance atmosphere described by the map’s sky/environment data or an editor preview override.'],
  [
    'Collision',
    'The solid surfaces used by physics. Spark’s source walk preview is separate from compiled Halo physics.',
  ],
  [
    'Portals and PVS',
    'Compiled partitions and visibility sets that help the game avoid rendering unseen parts of a level.',
  ],
  [
    'JMS',
    'A source model format accepted by the Halo compiler. Exporting JMS does not itself create a playable map.',
  ],
  [
    'Item collection',
    'A tag that chooses a weapon or equipment item for a map pickup. Its actual world model belongs to that item.',
  ],
  [
    'Spawn point',
    'A player starting position and facing direction. Spartan previews make these starts easier to read in the editor.',
  ],
  [
    'Build target',
    'A saved engine-specific choice of kit, tags and compiler. MCC and Custom Edition need separate compatible outputs.',
  ],
  [
    'Dependency / recursive extraction',
    'A referenced tag, plus any tags it references. Recursive extraction follows that chain into a checked staging folder.',
  ],
  ['Snapshot', 'A saved, hashed project state for recovery. It does not replace the preserved original map.'],
  [
    'Live adapter',
    'The connection to a particular game process and loaded map. Only its enabled operations can be sent to the game.',
  ],
  [
    'Uniform scale',
    'The same size factor on every axis. Live vehicle size also couples shared contact spheres, mass, inertia and suspension depths. Park and exit before changing it.',
  ],
  [
    'Shared editing session',
    'Two Spark editors exchanging source edits. This is separate from Halo’s game networking and replication.',
  ],
  [
    'Readback',
    'Reading a value after writing it to confirm the data changed. Visuals, collision and peer replication still need game testing.',
  ],
  [
    'Machinima',
    'Filmmaking inside a game. Rehearse cameras in Spark, then compile native camera points and HUD controls for a compatible MCC scenario.',
  ],
];
// Guides use the same maintained catalog as Features; new demos cannot silently
// disappear behind a separate short list of outdated instructions.
const savedGuideAliases: Record<string, string> = {
  'Open an existing map': 'library',
  'Build an original level': 'bsp-workshop',
  'Connect a running game': 'viewer',
  'Resize a live vehicle': 'vehicles',
  'Edit together': 'sparklink-native',
  'Style your workbench': 'interface',
  'Convert a classic map to MCC': 'convert',
  'Record a native camera take': 'engine-camera',
  'Adjust the shared renderer': 'appearance',
};
const destinations: Partial<Record<Workspace, string>> = {
  interface: 'Interface Studio',
  library: 'Map library',
  settings: 'Settings & tools',
  live: 'Level editor',
  world: 'Level editor',
  quickforge: 'Level editor',
  build: 'Build & playtest',
  machinima: 'Machinima',
  runtimes: 'Online',
  firefight: 'Firefight rules',
  tags: 'Tag editor',
  creator: 'Creator Studio',
  assets: 'Asset workshop',
  scenario: 'AI & scenario',
  compare: 'Compare variants',
  preservation: 'Preservation record',
  learning: 'Learning center',
  'how-to': 'Learning center',
  academy: 'Learning center',
  'get-started': 'Start here',
  'map-finder': 'Community maps',
  community: 'Community Thanks',
};
export default function HowTo({
  navigate,
  section,
  project = null,
}: {
  navigate: (workspace: Workspace) => void;
  section: 'guides' | 'glossary';
  project?: Project | null;
}) {
  const [query, setQuery] = useMapState('global', 'learning.glossarySearch', '');
  const [selected, setSelected] = useMapState('global', 'learning.guide', 'library');
  const [guideQuery, setGuideQuery] = useMapState('global', 'learning.guideSearch', '');
  const [category, setCategory] = useMapState('global', 'learning.guideCategory', 'All');
  const [storedPage, setPage] = useMapState('global', 'learning.guidePage', 0);
  const found = searchFeatures(guideQuery, category),
    page = Math.max(0, Math.min(Math.floor(storedPage) || 0, Math.ceil(found.length / 8) - 1));
  const guide = found.find((item) => item.id === (savedGuideAliases[selected] ?? selected)) ?? found[0];
  const target = guide ? featureWorkflowTarget(guide, project) : null;
  const matches = terms
    .filter(([name, text]) => `${name} ${text}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a[0].localeCompare(b[0]));
  const changePage = (next: number) => {
    setPage(next);
    const first = found[next * 8];
    if (first) setSelected(first.id);
  };
  return (
    <div className="gs-how-to">
      {section === 'guides' ? (
        <>
          <div className="learning-search learning-guide-search">
            <input
              type="search"
              aria-label="Find a demo or workflow"
              placeholder="Rooms, doors, sounds, collaboration…"
              value={guideQuery}
              onChange={(event) => {
                setGuideQuery(event.target.value);
                setPage(0);
              }}
            />
            <select
              aria-label="Workflow category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(0);
              }}
            >
              <option>All</option>
              {[...new Set(SPARK_FEATURES.map((item) => item.category))].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <small role="status">{found.length} workflows</small>
          </div>
          <div className="learning-guides">
            <div className="learning-guide-picker">
              <nav aria-label="Task guides">
                {found.slice(page * 8, page * 8 + 8).map((item) => (
                  <button
                    key={item.id}
                    aria-current={guide === item ? 'page' : undefined}
                    onClick={() => setSelected(item.id)}
                    title={item.summary}
                  >
                    {item.title}
                  </button>
                ))}
              </nav>
              {found.length > 8 && (
                <div className="learning-guide-paging">
                  <button disabled={page === 0} onClick={() => changePage(page - 1)}>
                    Previous
                  </button>
                  <small>
                    {page + 1} / {Math.ceil(found.length / 8)}
                  </small>
                  <button disabled={(page + 1) * 8 >= found.length} onClick={() => changePage(page + 1)}>
                    Next
                  </button>
                </div>
              )}
            </div>
            {guide ? (
              <article
                className="learning-guide"
                aria-labelledby="learning-guide-title"
                data-workflow={guide.id}
              >
                <div className="learning-guide-heading">
                  <h2 id="learning-guide-title">{guide.title}</h2>
                  <Pill>{guide.status}</Pill>
                </div>
                <p>{guide.summary}</p>
                <p className="learning-guide-requirements">
                  <b>You’ll need: </b>
                  {guide.prerequisites?.join(' · ') ??
                    [
                      guide.needsProject
                        ? 'An open compatible map'
                        : 'Your owned Halo installation for native content',
                      ...(guide.status === 'Halo tools required'
                        ? ['Matching native tools and editable source']
                        : []),
                    ].join(' · ')}
                </p>
                <ol>
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {guide.limit && (
                  <details className="learning-guide-limits">
                    <summary>Supported scope &amp; remaining checks</summary>
                    <p>{guide.limit}</p>
                  </details>
                )}
                <div className="button-row">
                  <button className="primary" onClick={() => openFeatureWorkflow(guide, project, navigate)}>
                    {target === 'library' && guide.workspace !== 'library'
                      ? guide.workshopEntry
                        ? 'Create or open source map'
                        : 'Choose a map first'
                      : `Open ${destinations[guide.workspace] ?? guide.workspace}`}
                  </button>
                  {guide.status === 'Halo tools required' && (
                    <button onClick={() => navigate('settings')}>Tool setup</button>
                  )}
                </div>
              </article>
            ) : (
              <p role="status">No matching workflows. Try another word or category.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="learning-search">
            <input
              type="search"
              aria-label="Search glossary"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="BSP, tags, lightmap…"
            />
            <small role="status">{matches.length} terms</small>
            {query && <button onClick={() => setQuery('')}>Clear search</button>}
          </div>
          {matches.length ? (
            <dl className="gs-glossary">
              {matches.map(([name, text]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p role="status">No matching terms. Try a shorter word or clear the search.</p>
          )}
        </>
      )}
    </div>
  );
}

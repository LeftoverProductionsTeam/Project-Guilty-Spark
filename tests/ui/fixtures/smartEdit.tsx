// Synthetic browser contracts only. Native cache/compiler proof has a separate runner.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SmartEditPanel from '../../../src/components/SmartEditPanel';
import TagFields from '../../../src/components/TagFields';
import { setTagValue } from '../../../src/editor';
import type { Project, Tag } from '../../../src/types';
import '../../../src/styles.css';
const initial: Project = {
  schemaVersion: 1,
  id: 'a',
  title: 'Contract map',
  createdAt: '',
  modifiedAt: '',
  source: {
    originalPath: 'fixture.map',
    preservedPath: 'fixture.map',
    sha256: 'a'.repeat(64),
    cacheVersion: 13,
    engine: 'Synthetic contract',
    scenarioPath: 'levels/fixture',
    resourceDirectory: null,
    resourceSha256: {},
  },
  provenance: {
    creator: '',
    community: '',
    releaseYear: null,
    description: '',
    sourceUrl: '',
    permissions: '',
  },
  scene: [],
  assets: [],
  tagEdits: [],
  history: [],
  builds: [],
};
const tag: Tag = {
  id: 7,
  index: 0,
  class: 'weap',
  path: 'weapons/pistol/pistol',
  dataOffset: 2048,
  external: false,
  references: [],
  fields: [
    {
      key: 'bounding-radius',
      label: 'Bounding radius',
      offset: 2052,
      kind: 'f32',
      value: 0.1,
      min: 0,
      max: 100,
      unit: 'world units',
      targetClass: null,
    },
  ],
};
function Harness() {
  const [project, setProject] = useState(initial),
    [message, setMessage] = useState('');
  return (
    <main style={{ width: 360, padding: 12 }}>
      <button onClick={() => setProject({ ...initial, id: project.id === 'a' ? 'b' : 'a' })}>
        Switch map
      </button>
      <TagFields
        project={project}
        tag={tag}
        tags={[tag]}
        change={(field, value) => setProject((p) => setTagValue(p, tag, field, value))}
      />
      <SmartEditPanel
        project={project}
        onSave={async () => {
          (window as any).saved = (window as any).saved + 1 || 1;
          if ((window as any).refreshAudio)
            setProject((p) => ({
              ...p,
              source: {
                ...p.source!,
                audioResources: { contractAudioOnly: true },
              } as unknown as Project['source'],
            }));
        }}
        notify={setMessage}
      />
      <p role="status">{message}</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

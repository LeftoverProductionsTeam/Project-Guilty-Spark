// Synthetic UI contract only; never executes an installed companion.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ToolEcosystem from '../../../src/components/ToolEcosystem';
import { browserBootstrap } from '../../../src/api';
import type { Project, RuntimeId } from '../../../src/types';
import '../../../src/styles.css';
function Harness() {
  const [runtime, setRuntime] = useState<RuntimeId>('haloCustomEdition');
  const [cache, setCache] = useState(609);
  const project = {
    id: `cache-${cache}`,
    title: 'Format fixture',
    builds: [],
    activeBuildTarget: null,
    source: { cacheVersion: cache },
  } as unknown as Project;
  return (
    <>
      <button
        onClick={() => {
          setRuntime('mccSteam');
          setCache(13);
        }}
      >
        MCC map
      </button>
      <button
        onClick={() => {
          setRuntime('haloCustomEdition');
          setCache(609);
        }}
      >
        CE map
      </button>
      <button
        onClick={() => {
          setRuntime('haloCustomEdition');
          setCache(6);
        }}
      >
        Demo map
      </button>
      <ToolEcosystem
        project={project}
        runtime={runtime}
        settings={browserBootstrap.settings}
        onSettings={() => {}}
        onOpenWorkspace={() => {}}
      />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

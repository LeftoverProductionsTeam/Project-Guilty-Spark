// Synthetic UI contract only. The native acceptance uses real CE processes.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CustomEditionHost from '../../../src/components/CustomEditionHost';
import '../../../src/styles.css';
function Harness() {
  const [shown, setShown] = useState(true),
    [setup, setSetup] = useState(0);
  const [dirty, setDirty] = useState(false),
    [builds, setBuilds] = useState(0),
    [second, setSecond] = useState(false);
  const project = new URLSearchParams(location.search).has('project');
  return (
    <>
      <button onClick={() => setShown(!shown)}>Switch workspace</button>
      <output>Setup visits {setup}</output>
      <button onClick={() => setDirty(!dirty)}>Toggle unsaved changes</button>
      <button onClick={() => setSecond(!second)}>Switch project</button>
      <output>Build visits {builds}</output>
      {shown && (
        <CustomEditionHost
          onSetup={() => setSetup(setup + 1)}
          projectId={
            project
              ? second
                ? '33333333-3333-4333-8333-333333333333'
                : '11111111-1111-4111-8111-111111111111'
              : undefined
          }
          dirty={dirty}
          onBuild={() => setBuilds(builds + 1)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

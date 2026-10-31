// Synthetic UI contract only. The native acceptance uses real CE processes.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CustomEditionHost from '../../../src/components/CustomEditionHost';
import '../../../src/styles.css';
function Harness() {
  const [shown, setShown] = useState(true),
    [setup, setSetup] = useState(0);
  return (
    <>
      <button onClick={() => setShown(!shown)}>Switch workspace</button>
      <output>Setup visits {setup}</output>
      {shown && <CustomEditionHost onSetup={() => setSetup(setup + 1)} />}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

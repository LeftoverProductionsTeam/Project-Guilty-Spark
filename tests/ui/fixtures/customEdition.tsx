// Synthetic UI contract; genuine archive/Windows extraction has its own native test.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CustomEditionSetup from '../../../src/components/CustomEditionSetup';
import '../../../src/styles.css';
function Harness() {
  const [count, setCount] = useState(0),
    [connections, setConnections] = useState(0);
  return (
    <>
      <button onClick={() => setCount(count + 1)}>Editor still responds {count}</button>
      <output>Connections {connections}</output>
      <CustomEditionSetup onConnected={() => setConnections((n) => n + 1)} />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MapDownload from '../../../src/components/MapDownload';
import '../../../src/styles.css';
function Harness() {
  const [opened, setOpened] = useState('');
  return (
    <>
      <MapDownload
        onDownloaded={(projects, action) =>
          setOpened(JSON.stringify({ ids: projects.map((p) => p.project.id), action }))
        }
      />
      <output data-testid="download-opened">{opened}</output>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);

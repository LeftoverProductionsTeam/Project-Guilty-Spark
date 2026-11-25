import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { LibraryEntry } from '../types';
import './mapSourceDrop.css';

interface MapSourceImport {
  entries: LibraryEntry[];
  failures: { path: string; message: string }[];
}

export default function MapSourceDrop({ single = false, disabled, onImported }: {
  single?: boolean;
  disabled?: boolean;
  onImported: (entries: LibraryEntry[]) => string | void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const importing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef({ disabled, onImported });
  current.current = { disabled, onImported };

  const mounted = useRef(false);
  const importSources = useCallback(async (paths?: string[]) => {
    if (importing.current || current.current.disabled) return;
    setMessage('');
    importing.current = true;
    setBusy(true);
    try {
      const result = await call<MapSourceImport>('import_map_sources', { paths, single });
      if (!mounted.current) return;
      const note = !result.entries.length ? undefined : current.current.disabled
        ? 'Source maps added to the library.' : current.current.onImported(result.entries);
      const failures = result.failures.map(({ path, message }) => path.split(/[\\/]/).at(-1) + ' · ' + message);
      setMessage([note, ...failures].filter(Boolean).join('\n'));
    } catch (error) {
      if (mounted.current) setMessage(String(error));
    } finally {
      importing.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [single]);

  useEffect(() => {
    mounted.current = true;
    function drop(event: Event) {
      const detail = (event as CustomEvent<{ paths: string[]; x: number; y: number }>).detail;
      if (event.defaultPrevented || !detail || !target.current?.contains(document.elementFromPoint(detail.x, detail.y))) return;
      event.preventDefault();
      void importSources(detail.paths);
    }
    window.addEventListener('guilty-spark-map-source-drop', drop);
    return () => {
      mounted.current = false;
      window.removeEventListener('guilty-spark-map-source-drop', drop);
    };
  }, [importSources]);

  if (!native) return null;
  return <div ref={target} className="map-source-drop">
    <span>{single ? 'Drop a donor map here' : 'Drop map files here'}</span>
    <button type="button" disabled={disabled || busy} onClick={() => void importSources()}>{busy ? 'Importingâ€¦' : single ? 'Browse for donor map' : 'Browse for map files'}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}

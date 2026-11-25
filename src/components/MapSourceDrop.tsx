import { useCallback, useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import type { LibraryEntry } from '../types';
import './mapSourceDrop.css';

interface MapSourceImport {
  entries: LibraryEntry[];
  failures: { path: string; message: string }[];
}

export default function MapSourceDrop({ single = false, disabled, onImported, viewport }: {
  single?: boolean;
  disabled?: boolean;
  viewport?: { projectId: string; sourceSlot?: number; reveal: () => void };
  onImported: (entries: LibraryEntry[], sourceSlot?: number) => string | void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const imports = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef({ disabled, onImported, viewport });
  current.current = { disabled, onImported, viewport };

  const mounted = useRef(false);
  const importSources = useCallback((paths?: string[], sourceSlot?: number) => {
    if (current.current.disabled) return;
    if (pending.current++ === 0) setMessage('');
    setBusy(true);
    imports.current = imports.current.then(async () => {
      try {
        const result = await call<MapSourceImport>('import_map_sources', { paths, single });
        if (!mounted.current) return;
        const note = !result.entries.length ? undefined : current.current.disabled
          ? 'Source maps added to the library.' : current.current.onImported(result.entries, sourceSlot);
        const failures = result.failures.map(({ path, message }) => path.split(/[\\\\/]/).at(-1) + ' · ' + message);
        setMessage(previous => [previous, note, ...failures].filter(Boolean).join('\n'));
      } catch (error) {
        if (mounted.current) setMessage(previous => [previous, String(error)].filter(Boolean).join('\n'));
      } finally {
        pending.current--;
        if (mounted.current && pending.current === 0) setBusy(false);
      }
    });
  }, [single]);

  useEffect(() => {
    mounted.current = true;
    function drop(event: Event) {
      const detail = (event as CustomEvent<{ paths: string[]; x: number; y: number }>).detail;
      if (event.defaultPrevented || !detail) return;
      const hit = document.elementFromPoint(detail.x, detail.y);
      const viewport = current.current.viewport;
      const overViewport = viewport && hit?.closest('[data-bsp-donor-target]')?.getAttribute('data-bsp-donor-target') === viewport.projectId
        && detail.paths.length > 0 && detail.paths.every(path => /\.(map|yelo)$/i.test(path));
      if (!target.current?.contains(hit) && !overViewport) return;
      event.preventDefault();
      if (overViewport) viewport.reveal();
      if (current.current.disabled) {
        if (overViewport) setMessage('Wait for the current operation before choosing a donor map.');
        return;
      }
      void importSources(detail.paths, overViewport ? viewport.sourceSlot : undefined);
    }
    window.addEventListener('guilty-spark-map-source-drop', drop);
    return () => {
      mounted.current = false;
      window.removeEventListener('guilty-spark-map-source-drop', drop);
    };
  }, [importSources]);

  if (!native) return null;
  return <div ref={target} className="map-source-drop" title={single ? 'Drop multiple maps to add them to the donor menu. Choose one for each connection.' : 'Drop a selection of maps to add them to the library.'}>
    <span>{single ? 'Drop donor maps here' : 'Drop map files here'}</span>
    <button type="button" disabled={disabled || busy} onClick={() => void importSources()}>{busy ? 'Importing…' : single ? 'Browse for donor map' : 'Browse for map files'}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}

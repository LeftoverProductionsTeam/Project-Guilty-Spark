import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { OpenProject } from '../types';
import '../mapDownload.css';
export type MapDownloadAction = 'world' | 'tags' | 'convert';
interface Status {
  id: string;
  phase:
    | 'queued'
    | 'resolving'
    | 'downloading'
    | 'validating'
    | 'publishing'
    | 'downloaded'
    | 'importing'
    | 'imported'
    | 'cancelled'
    | 'failed';
  bytes: number;
  total: number | null;
  sourceUrl: string;
  detail: string;
  projectIds: string[];
}
interface Context {
  id: string;
  action: MapDownloadAction;
}
export default function MapDownload({
  onDownloaded,
  busy = false,
  targetLabel = 'MCC Halo 1',
}: {
  onDownloaded?: (opened: OpenProject[], action: MapDownloadAction) => void | Promise<void>;
  busy?: boolean;
  targetLabel?: string;
}) {
  const [url, setUrl] = useState(''),
    [action, setAction] = useState<MapDownloadAction>('world');
  const [context, setContext] = useMapState<Context | null>('community-downloads', 'active', () => null);
  const [status, setStatus] = useState<Status | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [cancelling, setCancelling] = useState(false);
  const mounted = useRef(true),
    latest = useRef(context?.id),
    callback = useRef(onDownloaded);
  latest.current = context?.id;
  callback.current = onDownloaded;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!native || !context?.id) return;
    let stopped = false,
      inflight = false;
    const refresh = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const value = await call<Status>('map_download_status', { id: context.id });
        if (!stopped) setStatus(value);
        if (['imported', 'cancelled', 'failed'].includes(value.phase)) clearInterval(interval);
      } catch {
        if (!stopped) {
          setStatus(null);
          setError('This download session ended. Completed imports remain in your map library.');
        }
        clearInterval(interval);
      } finally {
        inflight = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 500);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [context?.id]);
  let valid = false,
    origin = '';
  try {
    const parsed = new URL(url);
    valid =
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      !parsed.hash &&
      /\.(map|zip)$/i.test(parsed.pathname);
    origin = parsed.origin;
  } catch {
    /* Native admission supplies the authoritative checks. */
  }
  const active =
    pending ||
    (!!status &&
      ['queued', 'resolving', 'downloading', 'validating', 'publishing', 'downloaded', 'importing'].includes(
        status.phase,
      ));
  const cancellable = !!status && ['queued', 'resolving', 'downloading', 'validating'].includes(status.phase);
  const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
  async function download() {
    if (!valid || !native || !callback.current) return;
    setPending(true);
    setError('');
    setCancelling(false);
    let id: string | null = null;
    try {
      const job = await call<Status>('prepare_map_download', { url });
      id = job.id;
      setContext({ id, action });
      latest.current = id;
      setStatus(job);
      const opened = await call<OpenProject[]>('download_and_import_maps', { id });
      if (!mounted.current || latest.current !== id) return;
      setStatus(await call<Status>('map_download_status', { id }));
      await callback.current?.(opened, action);
    } catch (e) {
      if (mounted.current && (!id || latest.current === id)) {
        const ended = id ? await call<Status>('map_download_status', { id }).catch(() => null) : null;
        if (ended) setStatus(ended);
        if (ended?.phase !== 'cancelled') setError(String(e));
      }
    } finally {
      if (mounted.current && (!id || latest.current === id)) {
        setPending(false);
        setCancelling(false);
      }
    }
  }
  async function openImported() {
    if (!status?.projectIds.length || !callback.current) return;
    setPending(true);
    setError('');
    try {
      const opened: OpenProject[] = [];
      for (const id of status.projectIds) opened.push(await call<OpenProject>('open_project', { id }));
      if (mounted.current) await callback.current?.(opened, context?.action ?? action);
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  return (
    <section className="analysis-card gs-direct-map-download" aria-label="Download maps inside Spark">
      <div className="eyebrow">PRESERVE · EDIT · CONVERT</div>
      <h2>Download a map into Spark</h2>
      <p>
        Paste an author's direct HTTPS <code>.map</code> or <code>.zip</code> link. Spark keeps the original
        download, records its SHA-256 and imports map candidates without changing an open draft or installed
        game.
      </p>
      <label>
        Direct download URL
        <input
          aria-label="Direct map download URL"
          type="url"
          autoComplete="off"
          spellCheck={false}
          maxLength={4096}
          value={url}
          disabled={active}
          placeholder="https://author.example/maps/arena.zip"
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
        />
      </label>
      <label>
        After import
        <select
          aria-label="Downloaded map action"
          value={action}
          disabled={active}
          onChange={(e) => setAction(e.target.value as MapDownloadAction)}
        >
          <option value="world">Open in Level editor</option>
          <option value="tags">Open in Tag editor</option>
          <option value="convert">Prepare conversion for {targetLabel}</option>
        </select>
      </label>
      {valid && (
        <p>
          Source: <strong>{origin}</strong>. Download and validation are limited to 768 MiB. Conversion uses
          matching installed tools and the map's compatibility report.
        </p>
      )}
      <div className="gs-map-download-actions">
        <button
          type="button"
          className="primary"
          disabled={!native || !valid || active || busy || !onDownloaded}
          onClick={() => void download()}
        >
          {active ? 'Downloading / importing…' : 'Download & import map'}
        </button>
        {cancellable && (
          <button
            type="button"
            disabled={cancelling}
            onClick={() =>
              void (async () => {
                if (!context) return;
                setCancelling(true);
                try {
                  const accepted = await call<boolean>('cancel_map_download', { id: context.id });
                  if (!accepted) setCancelling(false);
                } catch (e) {
                  setError(String(e));
                  setCancelling(false);
                }
              })()
            }
          >
            {cancelling ? 'Cancelling…' : 'Cancel download'}
          </button>
        )}
        {status?.phase === 'imported' && (
          <button type="button" disabled={pending || !onDownloaded} onClick={() => void openImported()}>
            Open imported maps
          </button>
        )}
      </div>
      {status && (
        <div role="status" aria-label="Map download status">
          <p>{status.detail}</p>
          <progress
            value={
              status.total || ['downloaded', 'importing', 'imported'].includes(status.phase)
                ? status.bytes
                : undefined
            }
            max={status.total ?? Math.max(1, status.bytes)}
            aria-label="Map download progress"
          />
          <span>
            {mb(status.bytes)} MiB{status.total ? ` / ${mb(status.total)} MiB` : ''}
          </span>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!native && (
        <p>
          File downloads and imports are available in the desktop app. Archive browsing below remains
          available here.
        </p>
      )}
      <p className="subtle">
        Catalog/HTML links need their direct author download link. ZIP executables and scripts are never
        launched. Build and in-game tests remain separate from downloading or opening a map.
      </p>
    </section>
  );
}

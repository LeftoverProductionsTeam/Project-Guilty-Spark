import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FolderOpen, RefreshCw } from 'lucide-react';
import { call, native } from '../api';
import './customEditionSetup.css';

interface Installation {
  root: string;
  executableSha256: string;
  registered: boolean;
  startupIssues?: string[];
}
interface InstallJob {
  id: string;
  phase: string;
  bytes: number;
  total: number;
  detail: string;
  root: string | null;
}
interface Setup {
  sourceUrl: string;
  archiveSha256: string;
  archiveBytes: number;
  installation: Installation | null;
  canExtract: boolean;
  job: InstallJob | null;
}
const active = (job: InstallJob | null | undefined) =>
  !!job && !['complete', 'failed', 'cancelled'].includes(job.phase);
const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

export default function CustomEditionSetup({ onConnected }: { onConnected?: () => void | Promise<void> }) {
  const [setup, setSetup] = useState<Setup | null>(null),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [error, setError] = useState('');
  const mounted = useRef(false),
    previousJob = useRef<string | null>(null),
    callback = useRef(onConnected);
  callback.current = onConnected;
  const refresh = useCallback(async () => {
    if (!native) return;
    try {
      const next = await call<Setup>('custom_edition_setup');
      if (!mounted.current) return;
      setSetup(next);
      if (next.job?.phase === 'complete' && previousJob.current !== next.job.id) {
        previousJob.current = next.job.id;
        await callback.current?.();
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!active(setup?.job)) return;
    const timer = window.setInterval(() => void refresh(), 750);
    return () => window.clearInterval(timer);
  }, [setup?.job?.id, setup?.job?.phase, refresh]);
  async function connect(chooseFolder: boolean) {
    setBusy(true);
    setError('');
    try {
      await call('connect_custom_edition', {
        chooseFolder,
        expectedSha256: setup?.installation?.executableSha256 ?? null,
      });
      await refresh();
      await callback.current?.();
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function install() {
    setBusy(true);
    setError('');
    try {
      const job = await call<InstallJob>('install_custom_edition', { confirmed: true });
      if (mounted.current) {
        setSetup((current) => (current ? { ...current, job } : current));
        setReview(false);
      }
      await refresh();
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const running = active(setup?.job),
    found = setup?.installation;
  return (
    <section className="ce-setup" aria-label="Custom Edition installation">
      <header>
        <strong>
          <Download size={15} /> Custom Edition setup
        </strong>
        <button
          className="small-button"
          disabled={!native || busy}
          onClick={() => void refresh()}
          title="Check installed Custom Edition again"
        >
          <RefreshCw size={13} />
        </button>
      </header>
      {found ? (
        <p>
          <CheckCircle2 size={14} /> {found.registered ? 'Connected' : 'Detected'}{' '}
          <span className="ce-setup-path" title={found.root}>
            {found.root}
          </span>
        </p>
      ) : (
        <p>
          Connect your installed game, or download the selected Custom Edition archive into a separate Spark
          folder.
        </p>
      )}
      <div className="ce-setup-actions">
        {found && !found.registered && (
          <button disabled={busy || running} onClick={() => void connect(false)}>
            Use detected Custom Edition
          </button>
        )}
        <button disabled={!native || busy || running} onClick={() => void connect(true)}>
          <FolderOpen size={14} /> Choose game folder
        </button>
        {!running && (
          <button disabled={!native || busy || !setup} onClick={() => setReview((value) => !value)}>
            {found ? 'Install separate copy…' : 'Install Custom Edition…'}
          </button>
        )}
      </div>
      {!!found?.startupIssues?.length && (
        <p role="alert" className="ce-startup-issues">
          Client startup files missing or invalid: {found.startupIssues.join(', ')}. Choose a complete game
          folder or install a separate copy. Your existing installation stays intact.
        </p>
      )}
      {review && setup && (
        <div className="ce-install-review">
          <p>
            <strong>Community archive · {mib(setup.archiveBytes)} MiB</strong>. This is the archive supplied
            for Spark, hosted by Internet Archive. Its recorded hash identifies these bytes; it is not
            publisher authentication.
          </p>
          <a
            href={setup.sourceUrl}
            onClick={(e) => {
              if (native) {
                e.preventDefault();
                void call('open_external_url', { url: setup.sourceUrl }).catch((e) => setError(String(e)));
              }
            }}
            target="_blank"
            rel="noreferrer"
          >
            Download source in your browser ↗
          </a>
          <p>
            Spark checks the complete archive, extracts game files into a new folder, and connects that copy.
            Existing game files stay intact. Bundled setup and update programs do not run.
          </p>
          <details>
            <summary>Archive SHA-256</summary>
            <code>{setup.archiveSha256}</code>
          </details>
          {setup.canExtract ? (
            <button className="primary" disabled={busy} onClick={() => void install()}>
              <Download size={14} /> Download &amp; install Custom Edition
            </button>
          ) : (
            <p>
              Windows archive extraction is unavailable. Use the browser download, extract the 7z file, then
              choose its game folder above.
            </p>
          )}
        </div>
      )}
      {setup?.job && (
        <div className="ce-install-progress" aria-live="polite">
          <p role={setup.job.phase === 'failed' ? 'alert' : 'status'}>{setup.job.detail}</p>
          {running && (
            <>
              <progress aria-label="Custom Edition download" max={setup.job.total} value={setup.job.bytes} />
              <small>
                {mib(setup.job.bytes)} / {mib(setup.job.total)} MiB · {setup.job.phase}
              </small>
              <button
                className="small-button"
                onClick={() => {
                  void call('cancel_custom_edition_setup', { jobId: setup.job!.id })
                    .then(refresh)
                    .catch((e) => setError(String(e)));
                }}
              >
                Cancel installation
              </button>
            </>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!native && <small>Install and file checks are available in the Windows desktop app.</small>}
    </section>
  );
}

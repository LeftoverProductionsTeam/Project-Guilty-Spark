import { useRef, useState } from 'react';
import { Search, LoaderCircle } from 'lucide-react';
import { call, native } from '../api';
import type { ContentProbeTarget, OwnedContentProbe } from '../runtimeWorkbench';
import { Notice, Pill } from './ui';

const targets: [ContentProbeTarget, string][] = [
  ['mccHalo1', 'Run MCC Halo 1'],
  ['sparkInspection', 'Inspect assets in Spark'],
  ['chupathingyCe', 'ChupathingyCE prerequisites'],
  ['openCe', 'OpenCE prerequisites'],
  ['experimentalRemix', 'Experimental MCC-content loader research'],
];
const operationNames: Record<string, string> = {
  runMcc: 'Run MCC',
  readMccAssets: 'Read MCC assets',
  buildOtherTarget: 'Build for another runtime',
  joinOtherProtocol: 'Join that runtime’s servers',
};
export default function OwnedContentProbePanel({ onSettings }: { onSettings: () => void }) {
  const [target, setTarget] = useState<ContentProbeTarget>('sparkInspection');
  const [report, setReport] = useState<OwnedContentProbe | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0);
  async function inspect() {
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const next = await call<OwnedContentProbe>('mcc_owned_content_probe', { target });
      if (request === generation.current) setReport(next);
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  return (
    <section className="analysis-card owned-content-probe" aria-label="Owned MCC content probe">
      <div className="section-heading">
        <h2>What can my owned MCC content supply?</h2>
        <Pill>Read-only files</Pill>
      </div>
      <p>
        Check startup UI, maps, resource packs, sounds, animations and shader dependencies in your selected
        MCC installation. Reading a cache, running MCC and booting a community runtime from MCC alone have
        separate requirements.
      </p>
      <div className="button-row">
        <label>
          Target{' '}
          <select
            aria-label="Owned content probe target"
            value={target}
            disabled={busy}
            onChange={(e) => {
              setTarget(e.target.value as ContentProbeTarget);
              setReport(null);
            }}
          >
            {targets.map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!native || busy} onClick={() => void inspect()}>
          {busy ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />}Inspect owned content
        </button>
        <button onClick={onSettings}>Choose MCC folder</button>
      </div>
      {error && <Notice>{error}</Notice>}
      {report && (
        <div aria-live="polite">
          <p>
            <strong>{report.files.length} inventoried files</strong> ·{' '}
            {report.files.filter((file) => file.cache).length} cache indexes ·{' '}
            {report.complete
              ? 'Inventory completed within bounds'
              : 'Partial inventory; limits or unreadable content remain'}
          </p>
          <div className="owned-content-operations">
            {report.operations.map((operation) => (
              <article key={operation.operation}>
                <h3>
                  {operationNames[operation.operation] ?? operation.operation} <Pill>{operation.status}</Pill>
                </h3>
                <p>{operation.detail}</p>
                <details>
                  <summary>Prerequisites ({operation.prerequisites.length})</summary>
                  {operation.prerequisites.map((item) => (
                    <div key={item.id}>
                      <strong>
                        {item.id} · {item.status}
                      </strong>
                      <p>{item.detail}</p>
                      {item.supplies.length > 0 && <small>{item.supplies.join(', ')}</small>}
                    </div>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <Notice tone="info">{report.nextLoaderSlice}</Notice>
          {report.limitations.map((limit) => (
            <p className="subtle" key={limit}>
              {limit}
            </p>
          ))}
          <details>
            <summary>Inspected files and cache classes</summary>
            <div className="owned-content-files">
              {report.files.map((file) => (
                <div key={file.relativePath}>
                  <strong>{file.relativePath}</strong> <Pill>{file.status}</Pill>
                  <p>{file.detail}</p>
                  {file.cache && (
                    <small>
                      Cache {file.cache.version} · {file.cache.tagCount} tags ·{' '}
                      {Object.keys(file.cache.tagClasses).join(', ')}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

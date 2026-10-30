import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { useMapState, writeMapSession } from '../mapSession';
import type { Project, Settings } from '../types';
import {
  selectRepairedTagset,
  type BitmapDependencyAudit,
  type BitmapRepairPreview,
  type BitmapRepairStatus,
} from '../conversionResources';
import { Notice } from './ui';
import '../conversionResources.css';
export default function ConversionBitmapRepair({
  project,
  settings,
  audit,
  disabled,
  onSave,
  onUse,
}: {
  project: Project;
  settings: Settings;
  audit: BitmapDependencyAudit;
  disabled: boolean;
  onSave: () => Promise<void>;
  onUse: (project: Project) => void;
}) {
  const [folder, setFolder] = useMapState(project.id, 'conversion.bitmapSource', '');
  const [expanded, setExpanded] = useMapState(
    project.id,
    'conversion.bitmapExpanded',
    () => audit.missing.length > 0 || audit.invalid.length > 0,
  );
  const [jobId, setJobId] = useMapState<string | null>(project.id, 'conversion.bitmapRepairJob', null);
  const [preview, setPreview] = useState<BitmapRepairPreview | null>(null),
    [status, setStatus] = useState<BitmapRepairStatus | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const scope = useRef(0);
  useEffect(() => {
    scope.current++;
    setPreview(null);
    setStatus(null);
    setError('');
    setBusy(false);
    return () => {
      scope.current++;
    };
  }, [project.id]);
  useEffect(() => {
    if (!native || !jobId) return;
    let alive = true,
      inFlight = false,
      terminal = false;
    const poll = async () => {
      if (inFlight || terminal) return;
      inFlight = true;
      try {
        const next = await call<BitmapRepairStatus>('bitmap_tagset_repair_status', {
          projectId: project.id,
          jobId,
        });
        if (alive) {
          if (next.projectId !== project.id) throw Error('Tagset response belongs to another map.');
          setStatus(next);
          if (next.status !== 'copying') {
            terminal = true;
            clearInterval(timer);
          }
        }
      } catch (e) {
        if (alive) {
          setError(String(e));
          terminal = true;
          clearInterval(timer);
        }
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project.id, jobId]);
  async function review() {
    const token = scope.current;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      await onSave();
      const result = await call<BitmapRepairPreview>('prepare_bitmap_tagset_repair', {
        projectId: project.id,
        sourceTags: folder.trim(),
      });
      if (token === scope.current && result.projectId === project.id) setPreview(result);
    } catch (e) {
      if (token === scope.current) setError(String(e));
    } finally {
      if (token === scope.current) setBusy(false);
    }
  }
  async function create() {
    if (!preview) return;
    const token = scope.current;
    setBusy(true);
    setError('');
    try {
      const result = await call<BitmapRepairStatus>('create_bitmap_tagset_repair', {
        planId: preview.planId,
        confirmed: true,
      });
      if (result.projectId !== project.id) throw Error('Tagset response belongs to another map.');
      writeMapSession(project.id, 'conversion.bitmapRepairJob', result.jobId);
      if (token === scope.current) {
        setJobId(result.jobId);
        setStatus(result);
        setPreview(null);
      }
    } catch (e) {
      if (token === scope.current) setError(String(e));
    } finally {
      if (token === scope.current) setBusy(false);
    }
  }
  return (
    <section className="surface conversion-bitmap-repair" aria-label="Classic bitmap dependency repair">
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          Classic bitmap dependencies ·{' '}
          {audit.missing.length
            ? `${audit.missing.length} missing`
            : audit.invalid.length
              ? 'review invalid files'
              : 'available'}
        </summary>
        <p>
          {audit.available} of {audit.required} indexed bitmap tags are available in the selected editable
          tagset.
        </p>
        {!!audit.invalid.length && (
          <Notice>
            {audit.invalid.length} existing bitmap tag files are invalid. Choose or repair the matching SDK
            tagset before adding missing files.
          </Notice>
        )}
        {!!audit.missing.length && (
          <>
            <p>
              Choose matching original classic resources above, or create a separate tagset using the missing
              editable bitmap tags. MCC texture packs cannot supply these files.
            </p>
            <details open>
              <summary>
                {audit.missing.length} missing bitmap tag{audit.missing.length === 1 ? '' : 's'}
              </summary>
              <ul>
                {audit.missing.map((item) => (
                  <li key={item.path}>
                    <code>{item.path}</code>
                  </li>
                ))}
              </ul>
            </details>
            {project.source?.sha256 ===
              'eb9b3693e74e674182d732f340127ef84d3574083821a8d3d95b234d9cb1c39e' && (
              <p>
                <a
                  href="https://github.com/csauve/alpine#building-the-map"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Alpine author’s source and dependency guide
                </a>{' '}
                · extract the matching classic tagset first, then select its tags folder.
              </p>
            )}
            <label>
              Matching classic tags folder
              <input
                aria-label="Matching classic tags folder"
                value={folder}
                placeholder="Folder containing the original editable .bitmap tags"
                onChange={(e) => {
                  setFolder(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <div className="button-row">
              <button
                disabled={!native || busy || disabled}
                onClick={async () => {
                  try {
                    const chosen = await call<string | null>('choose_setting_path', {
                      key: 'hekTagsDirectory',
                    });
                    if (chosen) {
                      setFolder(chosen);
                      setPreview(null);
                    }
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Browse classic tags…
              </button>
              <button
                disabled={
                  !native ||
                  busy ||
                  disabled ||
                  !folder.trim() ||
                  !!audit.invalid.length ||
                  audit.listTruncated
                }
                onClick={() => void review()}
              >
                {busy ? 'Checking…' : 'Save & review matching bitmap tags'}
              </button>
            </div>
          </>
        )}
        {audit.listTruncated && (
          <Notice>
            The missing list exceeds repair limits. Connect complete matching original resources or a complete
            source tagset.
          </Notice>
        )}
        {preview && (
          <div className="conversion-bitmap-review">
            <h4>Review {preview.files.length} matching source files</h4>
            <p>
              Source: <code>{preview.sourceTags}</code>
            </p>
            <ul>
              {preview.files.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code> · {file.bytes.toLocaleString()} bytes
                </li>
              ))}
            </ul>
            <p>
              A new copy of your selected SDK will receive these files. The SDK and classic source folders
              stay unchanged. The copy can take a few minutes.
            </p>
            <button disabled={disabled || busy} onClick={() => void create()}>
              Create separate repaired tagset
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              Cancel review
            </button>
          </div>
        )}
        {status && (
          <div role="status">
            <strong>
              {status.status === 'copying'
                ? 'Preparing separate source tagset…'
                : status.status === 'ready'
                  ? 'Repaired source tagset ready'
                  : 'Tagset repair stopped'}
            </strong>
            <p>{status.message}</p>
            {status.receipt && (
              <>
                <code className="path-text">{status.receipt.tagsDirectory}</code>
                <p>
                  {status.receipt.sdkFiles.toLocaleString()} SDK tags copied; {status.receipt.files.length}{' '}
                  missing bitmap tags added.
                </p>
                <button
                  disabled={
                    busy ||
                    disabled ||
                    project.buildTargets?.find((target) => target.id === project.activeBuildTarget)
                      ?.tagsDirectory === status.receipt.tagsDirectory
                  }
                  onClick={() => {
                    try {
                      onUse(selectRepairedTagset(project, settings, status.receipt!));
                      setError('');
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  {project.buildTargets?.find((target) => target.id === project.activeBuildTarget)
                    ?.tagsDirectory === status.receipt.tagsDirectory
                    ? 'Selected for this map'
                    : 'Use repaired tagset for this map'}
                </button>
              </>
            )}
          </div>
        )}
        {error && <Notice>{error}</Notice>}
      </details>
    </section>
  );
}

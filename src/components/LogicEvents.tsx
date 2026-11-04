import { useEffect, useRef, useState } from 'react';
import type { ForgeNode, QuickForgeDocument } from '../forge';
import {
  addLogicTrigger,
  addHandwrittenSource,
  centerDoorTrigger,
  connectDoor,
  copyDeviceBehavior,
  isLogicTarget,
  logicDocument,
} from '../nativeLogic';
import type { LogicRule, NativeLogicSource } from '../nativeLogic';
import { downloadLocalText } from '../exportHelpers';
import { NumberField } from './ui';

/** Instance-bound authoring inside the existing Inspector/history/compiler. */
export default function LogicEvents({
  document: doc,
  node,
  source,
  commit,
  onSelect,
}: {
  document: QuickForgeDocument;
  node: ForgeNode | null;
  source?: NativeLogicSource;
  commit: (doc: QuickForgeDocument, description: string) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  const [triggerId, setTriggerId] = useState(''),
    [targetId, setTargetId] = useState('');
  const [copyFrom, setCopyFrom] = useState(''),
    [moduleName, setModuleName] = useState('');
  const latestDocument = useRef(doc);
  latestDocument.current = doc;
  const sourceLimit = doc.runtimeId === 'mccSteam' ? 1024 * 1024 : 256 * 1024;
  useEffect(() => {
    if (isLogicTarget(node)) setOpen(true);
  }, [node?.value.id]);
  const logic = doc.logic,
    doors = doc.placements.filter((p) => p.tagClass === 'mach');
  const handwritten = logic?.handwrittenSources ?? [];
  const selectedModule = handwritten.find((m) => m.filename === moduleName) ?? handwritten[0];
  const overridden = logic?.manualSource != null;
  const trigger =
    node?.type === 'trigger'
      ? node.value.id
      : logic?.triggers.some((t) => t.id === triggerId)
        ? triggerId
        : (logic?.triggers[0]?.id ?? '');
  const target =
    node?.type === 'placement' && node.value.tagClass === 'mach'
      ? node.value.id
      : doors.some((d) => d.id === targetId)
        ? targetId
        : (doors[0]?.id ?? '');
  const rules =
    logic?.rules.filter(
      (r) =>
        !node ||
        !isLogicTarget(node) ||
        (node.type === 'trigger' && r.event.kind !== 'timer' && r.event.triggerId === node.value.id) ||
        r.actions.some((a) => a.kind !== 'delay' && a.targetId === node.value.id),
    ) ?? [];
  const changeRule = (id: string, update: (rule: LogicRule) => LogicRule) => {
    const next = logicDocument(doc);
    next.rules = next.rules.map((r) => (r.id === id ? update(r) : r));
    commit({ ...doc, logic: next }, 'Edit Logic / Events connection');
  };
  const add = () => {
    const position = node
      ? ([node.value.position[0], node.value.position[1], node.value.position[2] + 1.5] as [
          number,
          number,
          number,
        ])
      : ([0, 0, 1.5] as [number, number, number]);
    const added = addLogicTrigger(doc, position);
    commit(added.document, 'Add native trigger volume');
    onSelect(added.id);
    setOpen(true);
  };
  return (
    <details className="forge-logic-events" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Logic / Events <span>{rules.length} connections</span>
      </summary>
      <div className="forge-logic-content">
        {overridden && (
          <p className="forge-hint" role="status">
            Visual connections are paused while the generated file is manually overridden. Handwritten
            companion files remain separate. Return to generated source explicitly to change these
            connections.
          </p>
        )}
        <fieldset className="forge-logic-visual" disabled={overridden}>
          <div className="button-row">
            <button onClick={add}>Add trigger volume</button>
          </div>
          {!doors.length && (
            <p className="forge-hint">
              In the Asset library, choose Show → Doors & devices and drag in a door. Drop a Trigger volume
              nearby, resize its box, then connect it here.
            </p>
          )}
          {doors.length > 0 && (
            <p className="forge-hint">
              Choose a trigger and a door below, then use a simple setup. Open Native HaloScript to customize
              the generated script.
            </p>
          )}
          <div className="forge-logic-pair">
            <label>
              From trigger
              <select
                aria-label="Logic source trigger"
                value={trigger}
                onChange={(e) => setTriggerId(e.target.value)}
                disabled={node?.type === 'trigger'}
              >
                <option value="" disabled>
                  Choose a trigger…
                </option>
                {logic?.triggers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To door / device
              <select
                aria-label="Logic target device"
                value={target}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={node?.type === 'placement' && node.value.tagClass === 'mach'}
              >
                <option value="" disabled>
                  Choose a device…
                </option>
                {doors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button
              disabled={!trigger || !target || node?.value.locked}
              title="Center a 6 × 3 × 3 trigger around this door so players can approach from either side. You can resize it afterward."
              onClick={() => {
                try {
                  commit(
                    centerDoorTrigger(doc, trigger, target),
                    'Center trigger across both door approaches',
                  );
                  setError('');
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Cover both sides
            </button>
            <button
              disabled={!trigger || !target || node?.value.locked}
              onClick={() => {
                try {
                  commit(connectDoor(doc, trigger, target), 'Connect trigger → open door');
                  setError('');
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Enter → Open
            </button>
            <button
              disabled={!trigger || !target || node?.value.locked}
              onClick={() => {
                try {
                  commit(connectDoor(doc, trigger, target, 'exit', 0), 'Connect exit → close door');
                  setError('');
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Leave → Close
            </button>
          </div>
          {trigger && target && (
            <p className="forge-hint">
              Simple setups repeat after the player leaves and re-enters. Cover both sides for a return path;
              enable Once for a one-time event.
            </p>
          )}
          {doors.length > 1 && (
            <div className="forge-logic-pair">
              <label>
                Reuse a device setup
                <select
                  aria-label="Copy behavior from device"
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                >
                  <option value="">Choose a configured device…</option>
                  {doors
                    .filter((d) => d.id !== target && logic?.devices.some((b) => b.placementId === d.id))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!target || !copyFrom || node?.value.locked}
                title="Copy this setup to the selected door with independent triggers and native names. Existing destination behavior is preserved."
                onClick={() => {
                  try {
                    const copied = copyDeviceBehavior(doc, copyFrom, target);
                    commit(copied.document, 'Copy behavior to independent device instance');
                    onSelect(copied.triggerIds[0] ?? target);
                    setError('');
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Copy behavior
              </button>
            </div>
          )}
          {rules.map((rule) => (
            <section className="forge-logic-rule" key={rule.id} aria-label={`Logic connection ${rule.name}`}>
              <div className="forge-logic-rule-heading">
                <input
                  aria-label="Logic connection name"
                  maxLength={160}
                  value={rule.name}
                  onChange={(e) => changeRule(rule.id, (r) => ({ ...r, name: e.target.value }))}
                />
                <button
                  title="Remove connection; Undo restores it"
                  aria-label={`Remove logic ${rule.name}`}
                  onClick={() => {
                    const next = logicDocument(doc);
                    next.rules = next.rules.filter((r) => r.id !== rule.id);
                    commit({ ...doc, logic: next }, 'Remove logic connection');
                  }}
                >
                  ×
                </button>
              </div>
              <div className="forge-logic-pair">
                <label>
                  When
                  <select
                    aria-label="Logic event"
                    value={rule.event.kind}
                    onChange={(e) =>
                      changeRule(rule.id, (r) => ({
                        ...r,
                        event:
                          e.target.value === 'timer'
                            ? { kind: 'timer', seconds: 1 }
                            : { kind: e.target.value as 'enter' | 'exit', triggerId: trigger },
                      }))
                    }
                  >
                    <option value="enter">Player enters</option>
                    <option value="exit">Player leaves</option>
                    <option value="timer">Timer after level starts</option>
                  </select>
                </label>
                {rule.event.kind === 'timer' ? (
                  <label>
                    Seconds
                    <NumberField
                      label="Logic timer seconds"
                      value={rule.event.seconds}
                      min={0.034}
                      max={3600}
                      onCommit={(seconds) =>
                        changeRule(rule.id, (r) => ({ ...r, event: { kind: 'timer', seconds } }))
                      }
                    />
                  </label>
                ) : (
                  <label>
                    Volume
                    <select
                      aria-label="Connection trigger"
                      value={rule.event.triggerId}
                      onChange={(e) =>
                        changeRule(rule.id, (r) => ({
                          ...r,
                          event: {
                            kind: r.event.kind === 'exit' ? 'exit' : 'enter',
                            triggerId: e.target.value,
                          },
                        }))
                      }
                    >
                      {logic?.triggers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {rule.actions.map((action, index) => (
                <div className="forge-logic-pair" key={index}>
                  {action.kind === 'delay' ? (
                    <label>
                      Wait seconds
                      <NumberField
                        label="Logic delay seconds"
                        value={action.seconds}
                        min={0}
                        max={3600}
                        onCommit={(seconds) =>
                          changeRule(rule.id, (r) => ({
                            ...r,
                            actions: r.actions.map((a, i) => (i === index ? { kind: 'delay', seconds } : a)),
                          }))
                        }
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        Action
                        <select
                          aria-label="Logic device action"
                          value={`${action.kind}:${action.value}`}
                          onChange={(e) => {
                            const [kind, value] = e.target.value.split(':');
                            changeRule(rule.id, (r) => ({
                              ...r,
                              actions: r.actions.map((a, i) =>
                                i === index
                                  ? {
                                      kind: kind as 'devicePosition' | 'devicePower',
                                      targetId: action.targetId,
                                      value: Number(value),
                                    }
                                  : a,
                              ),
                            }));
                          }}
                        >
                          <option value="devicePosition:1">Open (position 1)</option>
                          <option value="devicePosition:0">Close (position 0)</option>
                          <option value="devicePower:1">Power on</option>
                          <option value="devicePower:0">Power off</option>
                        </select>
                      </label>
                      <label>
                        Target
                        <select
                          aria-label="Connection target device"
                          value={action.targetId}
                          onChange={(e) => {
                            const next = logicDocument(doc);
                            if (!next.devices.some((d) => d.placementId === e.target.value))
                              next.devices.push({
                                placementId: e.target.value,
                                initialPosition: 0,
                                powered: true,
                              });
                            next.rules = next.rules.map((r) =>
                              r.id === rule.id
                                ? {
                                    ...r,
                                    actions: r.actions.map((a, i) =>
                                      i === index && a.kind !== 'delay'
                                        ? { ...a, targetId: e.target.value }
                                        : a,
                                    ),
                                  }
                                : r,
                            );
                            commit({ ...doc, logic: next }, 'Change logic target');
                          }}
                        >
                          {doors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>
              ))}
              <div className="button-row">
                <label>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => changeRule(rule.id, (r) => ({ ...r, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={rule.once}
                    onChange={(e) => changeRule(rule.id, (r) => ({ ...r, once: e.target.checked }))}
                  />
                  Once
                </label>
                <button
                  disabled={rule.actions.length >= 8}
                  onClick={() =>
                    changeRule(rule.id, (r) => ({
                      ...r,
                      actions: [{ kind: 'delay', seconds: 1 }, ...r.actions],
                    }))
                  }
                >
                  Add delay
                </button>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={!!rule.condition}
                  onChange={(e) =>
                    changeRule(rule.id, (r) => ({
                      ...r,
                      condition: e.target.checked ? { targetId: target, atLeast: 0.95 } : undefined,
                    }))
                  }
                  disabled={!target}
                />
                Only if selected device is open
              </label>
            </section>
          ))}
          {node?.type === 'placement' &&
            node.value.tagClass === 'mach' &&
            logic?.devices
              .filter((d) => d.placementId === node.value.id)
              .map((device) => (
                <div key={device.placementId} className="forge-logic-pair">
                  <label>
                    Initial position
                    <NumberField
                      label="Initial logic device position"
                      value={device.initialPosition}
                      min={0}
                      max={1}
                      step={0.1}
                      onCommit={(initialPosition) => {
                        const next = logicDocument(doc);
                        next.devices = next.devices.map((d) =>
                          d.placementId === device.placementId ? { ...d, initialPosition } : d,
                        );
                        commit({ ...doc, logic: next }, 'Change initial device position');
                      }}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={device.powered}
                      onChange={(e) => {
                        const next = logicDocument(doc);
                        next.devices = next.devices.map((d) =>
                          d.placementId === device.placementId ? { ...d, powered: e.target.checked } : d,
                        );
                        commit({ ...doc, logic: next }, 'Change initial device power');
                      }}
                    />
                    Powered
                  </label>
                </div>
              ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <details className="forge-handwritten-sources">
          <summary>Handwritten scripts · {handwritten.length} files</summary>
          <p className="forge-hint">
            Keep original .hsc files alongside generated events. Comments and line endings are preserved. The
            native compiler checks them together; importing does not turn code into a visual graph.
          </p>
          <label className="forge-script-import">
            Import .hsc
            <input
              type="file"
              accept=".hsc"
              aria-label="Import handwritten HaloScript"
              onChange={async (e) => {
                const input = e.currentTarget,
                  file = input.files?.[0];
                if (!file) return;
                try {
                  if (file.size > sourceLimit)
                    throw Error(
                      `Choose an ASCII .hsc source within ${sourceLimit / 1024} KiB for this target.`,
                    );
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  if (bytes.some((b) => b === 0 || b > 127))
                    throw Error(
                      'This file is not ASCII HaloScript. No encoding or original bytes were changed.',
                    );
                  if (latestDocument.current !== doc)
                    throw Error(
                      'The source document changed during import. Select the intended document and import again; existing work was preserved.',
                    );
                  const content = new TextDecoder().decode(bytes);
                  commit(
                    addHandwrittenSource(doc, file.name, content),
                    'Import original handwritten HaloScript',
                  );
                  setModuleName(file.name);
                  setError('');
                } catch (error) {
                  setError(String(error));
                } finally {
                  input.value = '';
                }
              }}
            />
          </label>
          {selectedModule && (
            <>
              <label>
                Source file
                <select
                  aria-label="Handwritten source file"
                  value={selectedModule.filename}
                  onChange={(e) => setModuleName(e.target.value)}
                >
                  {handwritten.map((m) => (
                    <option key={m.filename} value={m.filename}>
                      {m.filename} · {m.content.length.toLocaleString()} bytes
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label="Handwritten HaloScript source"
                spellCheck={false}
                maxLength={sourceLimit}
                rows={6}
                value={selectedModule.content}
                onChange={(e) => {
                  const next = logicDocument(doc);
                  next.handwrittenSources = handwritten.map((m) =>
                    m.filename === selectedModule.filename ? { ...m, content: e.target.value } : m,
                  );
                  commit({ ...doc, logic: next }, 'Edit handwritten HaloScript module');
                }}
              />
              <button
                onClick={() =>
                  downloadLocalText(
                    selectedModule.filename,
                    selectedModule.content,
                    'text/plain;charset=utf-8',
                  )
                }
              >
                Export original .hsc
              </button>
            </>
          )}
        </details>
        {logic && (
          <details>
            <summary>Native HaloScript · {source ? 'source ready' : 'checking…'}</summary>
            <label>
              <input
                type="checkbox"
                checked={logic.manualSource !== undefined && logic.manualSource !== null}
                disabled={!source && !logic.manualSource}
                onChange={(e) =>
                  commit(
                    {
                      ...doc,
                      logic: { ...logic, manualSource: e.target.checked ? source?.content : undefined },
                    },
                    e.target.checked ? 'Edit native logic source' : 'Regenerate native logic source',
                  )
                }
              />
              Edit real HaloScript
            </label>
            <textarea
              aria-label="Native logic HaloScript"
              maxLength={65536}
              spellCheck={false}
              readOnly={logic.manualSource === undefined || logic.manualSource === null}
              value={logic.manualSource ?? source?.content ?? ''}
              rows={9}
              onChange={(e) =>
                commit(
                  { ...doc, logic: { ...logic, manualSource: e.target.value } },
                  'Edit native HaloScript source',
                )
              }
            />
            <p className="forge-hint">
              Exports standard gs_logic.hsc with source-linked rule names. Keep those names when editing.
              Native compilation validates actual functions and target limits; existing handwritten files are
              never overwritten.
            </p>
            <button
              disabled={!source}
              onClick={() =>
                source && downloadLocalText(source.filename, source.content, 'text/plain;charset=utf-8')
              }
            >
              Export .hsc
            </button>
          </details>
        )}
      </div>
    </details>
  );
}

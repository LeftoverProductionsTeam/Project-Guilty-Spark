import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForgeNode, QuickForgeDocument } from '../forge';
import {
  addLogicTrigger,
  addHandwrittenSource,
  centerDoorTrigger,
  connectDoor,
  copyDeviceBehavior,
  isLogicTarget,
  logicDocument,
  setNativeLogicName,
  extractionLayout,
  addExtractionZone,
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
  const extraction=useMemo(()=>extractionLayout(doc),[doc]);
  const controlSelected=node?.type==='placement'&&node.value.tagClass==='ctrl';
  const namingNeedsDoorBinding=node?.type==='placement'&&node.value.tagClass==='mach'&&
    !logic?.devices.some(d=>d.placementId===node.value.id);
  const nativeBindingName=node?.type==='trigger'?node.value.nativeName??'':
    node?.type==='placement'?logic?.devices.find(d=>d.placementId===node.value.id)?.nativeName??'':'';
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
  const applyNativeBinding=(name:string)=>{
    if(!node)return false;
    try {
      const next=setNativeLogicName(latestDocument.current,node,name);
      if(next!==latestDocument.current)commit(next,'Set native scenario name');
      setError('');return true;
    } catch(error){setError(String(error));return false;}
  };
  const createExtractionZone=(role:'activation'|'return')=>{
    try {
      const added=addExtractionZone(latestDocument.current,role);
      if(added.document!==latestDocument.current)commit(added.document,'Add native Extraction '+role+' volume');
      onSelect(added.id);setError('');
    } catch(error){setError(String(error));}
  };
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
          {isLogicTarget(node)&&node&&<label>
            Native scenario name
            <input key={node.value.id+':'+nativeBindingName} aria-label="Native scenario name"
              defaultValue={nativeBindingName} maxLength={31} placeholder="Automatic unique name"
              disabled={node.value.locked||namingNeedsDoorBinding}
              title={namingNeedsDoorBinding?'Connect this door to a trigger below first; naming alone must not change automatic operation.':'Optional exact native script/engine binding. Display name and identity stay separate; blank restores the generated name.'}
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}
              onBlur={e=>{e.currentTarget.value=applyNativeBinding(e.currentTarget.value)?e.currentTarget.value.trim():nativeBindingName;}}/>
            {namingNeedsDoorBinding&&<small className="forge-hint">Connect the door to a trigger below before assigning its native name. Automatic operation is preserved.</small>}
            <small className="forge-hint">Standard scenario name; handwritten scripts are not rewritten.
              A native binding does not enable a game mode. Extraction also needs both controls, both volumes and a compatible runtime.</small>
          </label>}
          {(node?.type==='trigger'||controlSelected)&&<div className="button-row" aria-label="Forerunner native Extraction marker roles">
            {(node?.type==='trigger'?
              [['extraction_zone','Activation zone'],['extraction_return','Safe return zone']]:
              [['extraction_deploy','Deploy terminal'],['extraction_activate','Activate terminal']]).map(([name,label])=>
              <button key={name} disabled={node?.value.locked||nativeBindingName===name}
                title={'Bind the standard native name '+name+'; this does not enable the runtime mode.'}
                onClick={()=>applyNativeBinding(name)}>{label}</button>)}
          </div>}
          {nativeBindingName.startsWith('extraction_')&&<p className="forge-hint">Place the deploy terminal inside the safe return volume, outside activation.
            Place the activation terminal inside its zone. Keep a physical route between both areas; no raid timer or teleport is authored here.</p>}
          {extraction.present&&<details className="forge-details">
            <summary>Extraction layout · {extraction.bindings}/4 native bindings</summary>
            <div className="button-row">
              <button disabled={!extraction.activate||!!extraction.activation}
                title="Create one editable 6 × 6 × 4 activation volume around the named terminal. Existing objects stay in place."
                onClick={()=>createExtractionZone('activation')}>Add activation zone at terminal</button>
              <button disabled={!extraction.deploy||!!extraction.returnZone}
                title="Create one editable 6 × 6 × 4 hub return volume around the deployment terminal. Review the route and floor afterward."
                onClick={()=>createExtractionZone('return')}>Add safe return zone at terminal</button>
            </div>
            <div className="button-row">
              {([['Deploy terminal',extraction.deploy],['Activate terminal',extraction.activate],
                ['Activation zone',extraction.activation],['Return zone',extraction.returnZone]] as const)
                .map(([label,value])=>value&&<button key={label} onClick={()=>onSelect(value.id)}
                  title={'Select the authored '+label.toLowerCase()+' in this project'}>{label}</button>)}
            </div>
            <ul className="forge-hint">{extraction.issues.map((issue,i)=><li key={i}>
              {issue.message}{issue.objectId&&<button className="small-button" onClick={()=>onSelect(issue.objectId!)}>Select</button>}
            </li>)}</ul>
            <p className="forge-hint">Checks use authored terminal origins and yaw-aligned volumes only.
              Native control tags, player clearance, physical routes, runtime configuration and gameplay remain unverified.
              No timer, teleport, inventory award or engine activation is added.</p>
          </details>}
          <div className="button-row">
            <button onClick={add}>Add trigger volume</button>
          </div>
          {controlSelected&&<p className="forge-hint">Control terminal: use its native binding and power settings here.
            Choose a touched-by-player control tag for Extraction. Runtime mode activation remains separate.</p>}
          {!controlSelected&&<>
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
          </>}
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
            ['mach','ctrl'].includes(node.value.tagClass) &&
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

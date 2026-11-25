import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForgeNode, QuickForgeDocument } from '../forge';
import {
  addLogicTrigger,
  addHandwrittenSource,
  centerDoorTrigger,
  connectDoor,
  connectVehicleCrew,
  copyDeviceBehavior,
  isLogicTarget,
  logicDocument,
  setNativeLogicName,
  setDevicePositionControl,
  setNativeTransportSignals,
  transportSignalNames,
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
  missionGatedExtraction=false,
  commit,
  onSelect,
}: {
  document: QuickForgeDocument;
  node: ForgeNode | null;
  source?: NativeLogicSource;
  missionGatedExtraction?:boolean;
  commit: (doc: QuickForgeDocument, description: string) => void;
  onSelect: (id: string) => void;
}) {
  const [crewEncounter,setCrewEncounter]=useState(''),[crewSeat,setCrewSeat]=useState('');
  useEffect(()=>{setCrewEncounter('');setCrewSeat('');},[node?.value.id]);
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
  const logic = doc.logic ?? (doc.gameMode==='campaign'&&doc.startingProfile?logicDocument(doc):undefined),
    doors = doc.placements.filter((p) => p.tagClass === 'mach');
  const handwritten = logic?.handwrittenSources ?? [];
  const selectedModule = handwritten.find((m) => m.filename === moduleName) ?? handwritten[0];
  const overridden = logic?.manualSource != null;
  const extraction=useMemo(()=>extractionLayout(doc,{activationPowered:!missionGatedExtraction}),[doc,missionGatedExtraction]);
  const vehicleSelected=node?.type==='placement'&&node.value.tagClass==='vehi';
  const vehicleNamingUnavailable=vehicleSelected&&(!!doc.native||!['campaign','firefight','zombie'].includes(doc.gameMode));
  const hasTransportSignals=vehicleSelected&&node.value.transportSignals===true;
  const controlSelected=node?.type==='placement'&&node.value.tagClass==='ctrl';
  const machineSelected=node?.type==='placement'&&node.value.tagClass==='mach';
  const ownDevice=logic?.devices.find(device=>device.placementId===node?.value.id);
  const positionControl=logic?.devices.find(device=>device.placementId===ownDevice?.positionControlId);
  const eligibleSwitches=doc.placements.filter(placement=>placement.tagClass==='ctrl'&&
    !(logic?.devices.find(device=>device.placementId===placement.id)?.nativeName??'').startsWith('extraction_'));
  const namingNeedsDoorBinding=node?.type==='placement'&&node.value.tagClass==='mach'&&
    !logic?.devices.some(d=>d.placementId===node.value.id);
  const nativeBindingName=node?.type==='trigger'?node.value.nativeName??'':
    node?.type==='placement'?(vehicleSelected?node.value.nativeName??'':logic?.devices.find(d=>d.placementId===node.value.id)?.nativeName??''):'';
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
  const applyDevicePositionControl=(controlId:string)=>{
    if(!machineSelected)return;
    try{
      const current=latestDocument.current;
      const next=setDevicePositionControl(current,node.value.id,controlId);
      if(next!==current)commit(next,controlId?'Link native switch to machine':'Disconnect native switch');
      setError('');
    }catch(problem){setError(String(problem));}
  };
  const changeTransportSignals=(enabled:boolean)=>{
    if(!node)return;
    try{const next=setNativeTransportSignals(latestDocument.current,node,enabled);if(next!==latestDocument.current)commit(next,'Change native transport groups');setError('');}
    catch(problem){setError(String(problem));}
  };
  const createCrewConnection=(atStart:boolean)=>{if(node?.type!=='placement'||node.value.tagClass!=='vehi')return;try{commit(connectVehicleCrew(latestDocument.current,node.value.id,crewEncounter,crewSeat,atStart?{kind:'timer',seconds:.1}:{kind:'enter',triggerId:trigger}),'Connect native AI vehicle seating');setError('');}catch(problem){setError(String(problem));}};
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
              defaultValue={nativeBindingName} maxLength={31} placeholder={vehicleSelected?'Unnamed until assigned':'Automatic unique name'}
              disabled={node.value.locked||namingNeedsDoorBinding||vehicleNamingUnavailable||hasTransportSignals}
              title={vehicleSelected?'Standard solo vehicle binding. Blank leaves this vehicle unnamed; display names and handwritten scripts remain separate.':namingNeedsDoorBinding?'Connect this door to a trigger below first; naming alone must not change automatic operation.':'Optional exact native script/engine binding. Display name and identity stay separate; blank restores the generated name.'}
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}
              onBlur={e=>{e.currentTarget.value=applyNativeBinding(e.currentTarget.value)?e.currentTarget.value.trim():nativeBindingName;}}/>
            {namingNeedsDoorBinding&&<small className="forge-hint">Connect the door to a trigger below before assigning its native name. Automatic operation is preserved.</small>}
            <small className="forge-hint">Standard scenario name; handwritten scripts are not rewritten.
              A native binding does not enable a game mode. Extraction also needs both controls, both volumes and a compatible runtime.</small>
          </label>}
          {vehicleSelected&&<>
            {vehicleNamingUnavailable?<p className="forge-hint">Vehicle script names require editable solo source. Use the matching native source editor for recovered maps; multiplayer collections do not expose these bindings.</p>:<div className="button-row" aria-label="Forerunner transport vehicle roles">
              {['extraction_pelican','extraction_spirit'].map(name=><button key={name} disabled={node?.value.locked||hasTransportSignals||nativeBindingName===name} title={hasTransportSignals?'Disable transport groups before changing the craft role.':undefined} onClick={()=>applyNativeBinding(name)}>{name==='extraction_pelican'?'Bind UNSC Pelican':'Bind Covenant Spirit'}</button>)}
            </div>}
            {nativeBindingName&&<button disabled={node?.value.locked||hasTransportSignals} title={hasTransportSignals?'Disable transport groups first; existing script references are not rewritten.':undefined} onClick={()=>applyNativeBinding('')}>Clear native vehicle name</button>}
            <label className="checkbox-label"><input type="checkbox" checked={hasTransportSignals}
              disabled={node?.value.locked||!hasTransportSignals&&(vehicleNamingUnavailable||!transportSignalNames(nativeBindingName).length)}
              onChange={event=>changeTransportSignals(event.target.checked)}/>Create boarding, recall &amp; landing groups</label>
            <p className="forge-hint">Bind the matching craft first. Disable these generated groups before renaming it. Disabling removes their definitions from the next fresh build; review existing script references first. This edits native map definitions; Forerunner controls actual readiness, recall and landing, with no inventory authority in Spark.</p>
            {hasTransportSignals&&<details><summary>Native transport signal definitions</summary>
              {transportSignalNames(nativeBindingName).map(name=><div key={name}><code>{name}</code> · initial value 0 · repeatable</div>)}
              <p className="forge-hint">The compatible Forerunner host updates these dedicated groups. Native HaloScript can read them with device_group_get; never share them with device power or position. A legacy engine can retain the zero definitions without driving them. Wait for both the correct pad volume and the matching _landed group before opening doors or reporting arrival. A volume, hover command or elapsed time alone is not a landing. Old builds without the landing group must be rebuilt; legacy engines do not drive it. Actual boarding, landing, recall and flight need game verification.</p>
            </details>}
            <details className="native-ai-vehicle-seating"><summary>AI vehicle seating</summary>
              {doc.gameMode!=='campaign'||vehicleNamingUnavailable?<p className="forge-hint">Use editable Campaign source with authored encounters. Recovered maps and survival controllers retain their native script workflow.</p>:<>
              <div className="forge-logic-pair"><label>AI encounter<select aria-label="AI crew encounter" value={crewEncounter} onChange={event=>setCrewEncounter(event.target.value)}><option value="">Choose an authored campaign group</option>{doc.campaignEncounters?.map(group=><option key={group.name} value={group.name}>{group.name} · {group.count??1} authored starts</option>)}</select></label>
              <label>Native seat text<input aria-label="AI crew seat text" maxLength={31} value={crewSeat} placeholder="Exact text from a vehicle seat label" onChange={event=>setCrewSeat(event.target.value)}/></label></div>
              <div className="button-row"><button type="button" disabled={node?.value.locked||!nativeBindingName||!crewEncounter||!crewSeat} onClick={()=>createCrewConnection(true)}>Seat AI at level start</button><button type="button" disabled={node?.value.locked||!nativeBindingName||!crewEncounter||!crewSeat||!trigger} onClick={()=>createCrewConnection(false)}>Enter → seat AI crew</button></div>
              <p className="forge-hint">Inspect the vehicle under Tag editor → the vehicle’s Native Output → Invader · native checks & reviewed edits → Native vehicle seats. Copy its label or a matching part, preserving case. Build refuses missing or insufficient seats. One enabled seating owner per encounter. The rule waits for existing live AI and a living vehicle; the encounter startup flag or mission still owns creation. If either is unavailable, this rule keeps waiting. It loads AI only; it does not board players, unload passengers or control a flight. Test seat occupancy and driver behavior in the game.</p>
              </>}
            </details>
            <p className="forge-hint">A native vehicle name is not a flight controller. In Forerunner Extraction, declaring either transport requires physical boarding: provide the correct craft, usable seats, pilot, approach/landing/return scripts and crew callbacks. Spark does not grant loot, teleport passengers or verify flight here. Duplicate copies start unnamed.</p>
          </>}
          {(node?.type==='trigger'||controlSelected)&&<div className="button-row" aria-label="Forerunner native Extraction marker roles">
            {(node?.type==='trigger'?
              [['extraction_zone','Activation zone'],['extraction_return','Safe return zone']]:
              [['extraction_deploy','Deploy terminal'],['extraction_activate','Activate terminal'],
                ['extraction_loadout','Loadout terminal'],['extraction_debrief','Debrief terminal']]).map(([name,label])=>
              <button key={name} disabled={node?.value.locked||nativeBindingName===name}
                title={'Bind the standard native name '+name+'; this does not enable the runtime mode.'}
                onClick={()=>applyNativeBinding(name)}>{label}</button>)}
          </div>}
          {nativeBindingName.startsWith('extraction_')&&<p className="forge-hint">Place the deploy terminal inside the safe return volume, outside activation.
            Place the activation terminal inside its zone. Place optional loadout and debrief terminals inside the safe hub, on a walkable approach.</p>}
          {extraction.present&&<details className="forge-details">
            <summary>Extraction layout · {extraction.bindings}/4 native bindings</summary>
            <p className="forge-hint">Hub starts: {extraction.playerStarts.safe==null?'Unavailable until both zones are bound':extraction.playerStarts.safe+' / '+extraction.playerStarts.total+' inside the hub and outside activation'}.
              Every authored start is checked, including hidden starts and other game-mode filters. Use Select beside an issue to edit that start; no starts are moved automatically.</p>
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
                ['Loadout terminal',extraction.loadout],['Debrief terminal',extraction.debrief],
                ['Activation zone',extraction.activation],['Return zone',extraction.returnZone]] as const)
                .map(([label,value])=>value&&<button key={label} aria-label={'Select '+label.toLowerCase()} onClick={()=>onSelect(value.id)}
                  title={'Select the authored '+label.toLowerCase()+' in this project'}>{label}</button>)}
            </div>
            <ul className="forge-hint">{extraction.issues.map((issue,i)=><li key={i}>
              {issue.message}{issue.objectId&&<button className="small-button" onClick={()=>onSelect(issue.objectId!)}>Select</button>}
            </li>)}</ul>
            <p className="forge-hint">Checks use authored terminal origins and yaw-aligned volumes only.
              Native control tags, player clearance, physical routes, runtime configuration and gameplay remain unverified.
              No timer, teleport, inventory award or engine activation is added.</p>
            <p className="forge-hint">Save, then build from Build &amp; playtest. A successful native build independently checks named device bindings and positions,
              plus trigger names, rotational basis, corners and dimensions. Read Native marker readback in the build details.
              This does not enable Forerunner Extraction or prove the physical route; use the supported staged solo test afterward.</p>
          </details>}
          <div className="button-row">
            <button onClick={add}>Add trigger volume</button>
          </div>
          {controlSelected&&<p className="forge-hint">Control terminal: use its native binding and power settings here.
            To wire a regular switch, select the machine and choose this control under Position switch.</p>}
          {machineSelected&&!doc.native&&(eligibleSwitches.length>0||ownDevice?.positionControlId)&&
            <label>Position switch
              <select aria-label="Machine position switch" value={ownDevice?.positionControlId??''} disabled={node.value.locked}
                onChange={e=>applyDevicePositionControl(e.target.value)}>
                <option value="">No shared switch</option>
                {eligibleSwitches.map(control=><option key={control.id} value={control.id}>{control.name}</option>)}
              </select>
              <span className="forge-hint">Use a player-operated control with a native door or platform. The control’s initial position applies to every connected machine.</span>
            </label>}
          {!controlSelected&&!vehicleSelected&&<>
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
                  ) : action.kind==='aiVehicleLoad' ? <>
                    <label>AI encounter<select aria-label="Connection AI crew" value={action.encounterName} onChange={event=>changeRule(rule.id,r=>({...r,actions:r.actions.map((a,i)=>i===index&&a.kind==='aiVehicleLoad'?{...a,encounterName:event.target.value}:a)}))}>{!doc.campaignEncounters?.some(group=>group.name===action.encounterName)&&<option value={action.encounterName}>{action.encounterName} · missing source</option>}{doc.campaignEncounters?.map(group=><option key={group.name} value={group.name}>{group.name}</option>)}</select></label>
                    <label>Named vehicle<select aria-label="Connection crew vehicle" value={action.targetId} onChange={event=>changeRule(rule.id,r=>({...r,actions:r.actions.map((a,i)=>i===index&&a.kind==='aiVehicleLoad'?{...a,targetId:event.target.value}:a)}))}>{doc.placements.filter(p=>p.tagClass==='vehi'&&p.nativeName).map(p=><option key={p.id} value={p.id}>{p.name} · {p.nativeName}</option>)}</select></label>
                    <label>Seat label text<input aria-label="Connection crew seat text" maxLength={31} value={action.seat} onChange={event=>changeRule(rule.id,r=>({...r,actions:r.actions.map((a,i)=>i===index&&a.kind==='aiVehicleLoad'?{...a,seat:event.target.value}:a)}))}/></label>
                    <small className="forge-hint">Seat existing AI after the event. Native seat capacity is checked on build; flight and live occupancy need game testing.</small>
                  </> : (
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
                      value={positionControl?.initialPosition??device.initialPosition}
                      disabled={!!positionControl||node.value.locked}
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
              <button type="button" title="Exclude this module from the next build. Undo restores its exact source; the original file is untouched."
                onClick={()=>{
                  const next=logicDocument(doc);
                  next.handwrittenSources=handwritten.filter(module=>module.filename!==selectedModule.filename);
                  commit({...doc,logic:next},'Remove handwritten module from build');
                  setModuleName('');
                }}>Remove from this build</button>
              <p className="forge-hint">Removal changes this project's source list only. Export the original first
                if needed; Undo restores the module. Files in other projects and prior builds are untouched.</p>
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
                disabled={(!source && !logic.manualSource)||(doc.gameMode==='campaign'&&!!doc.startingProfile&&!logic.manualSource)}
                title={doc.gameMode==='campaign'&&doc.startingProfile?'Disable Campaign starting loadout in Map properties before taking over generated startup HaloScript.':undefined}
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

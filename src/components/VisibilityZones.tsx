import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Edges, Line, TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Project, Vec3 } from '../types';
import { useMapState } from '../mapSession';
import { assemblySignature } from '../bspAssembly';
import {
  movePortalCut,
  portalQuads,
  validateVisibilityZones,
  visibilityBounds,
  withVisibilityZones,
} from '../visibilityZones';
import type { VisibilityZone } from '../visibilityZones';
import { NumberField } from './ui';
import ViewportLabel from './ViewportLabel';
import '../visibilityZones.css';
import { call, native } from '../api';
import type { AssemblyReport } from '../bspAssembly';
type Edit = (project: Project, description: string) => void;

export default function VisibilityZones({
  project,
  edit,
  onSelectScene,
  onSave,
}: {
  project: Project;
  edit: Edit;
  onSelectScene: () => void;
  onSave?: () => Promise<void>;
}) {
  const plan = project.bspAssembly;
  const [selection, setSelection] = useMapState<string | null>(project.id, 'visibility.selected', null);
  const [show, setShow] = useMapState(project.id, 'visibility.show', true);
  const [, setFrame] = useMapState(project.id, 'visibility.frame', 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [report, setReport] = useState<AssemblyReport | null>(null);
  const owner = useRef({
      id: project.id,
      signature: assemblySignature(plan ?? null),
      source: project.source?.sha256,
    }),
    mounted = useRef(true);
  owner.current = {
    id: project.id,
    signature: assemblySignature(plan ?? null),
    source: project.source?.sha256,
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setError('');
    setReport(null);
  }, [project.id, project.bspAssembly]);
  if (!plan) return null;
  const zones = plan.visibilityZones ?? [],
    chosen = zones.find((z) => selection?.startsWith(z.id));
  const commit = (next: VisibilityZone[], description: string) => {
    const errors = validateVisibilityZones({ ...plan, visibilityZones: next });
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setError('');
    edit(withVisibilityZones(project, next), description);
  };
  const update = (zone: VisibilityZone) =>
    commit(
      zones.map((z) => (z.id === zone.id ? zone : z)),
      `Edit visibility zone: ${zone.name}`,
    );
  const choose = (zone: VisibilityZone) => {
    setSelection(`${zone.id}:${zone.kind === 'tunnel' ? 'start' : 'bounds'}`);
    onSelectScene();
  };
  const free = plan.tunnelPoints
    .slice(0, -1)
    .map((a, i) => ({
      i,
      length: Math.hypot(plan.tunnelPoints[i + 1][0] - a[0], plan.tunnelPoints[i + 1][1] - a[1]),
    }))
    .filter(({ i, length }) => length >= 1.5 && !zones.some((z) => z.kind === 'tunnel' && z.segment === i))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <details className="gs-visibility-zones" open={zones.length > 0}>
      <summary>Visibility zones · {zones.length}</summary>
      <p>
        Tunnel zones author real +portal cuts for Build &amp; playtest. Tool computes clusters/PVS. Planning
        boxes are editor-only. This remains one combined BSP.
      </p>
      <label>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show zone bounds and portal handles
      </label>
      <div className="gs-zone-actions">
        <button
          type="button"
          className="gs-zone-check"
          disabled={!native || !onSave || busy}
          onClick={() =>
            void (async () => {
              const request = { ...owner.current };
              const current = () =>
                mounted.current &&
                owner.current.id === request.id &&
                owner.current.signature === request.signature &&
                owner.current.source === request.source;
              setBusy(true);
              setError('');
              try {
                await onSave?.();
                if (!current()) return;
                const checked = await call<AssemblyReport>('preview_bsp_assembly', { projectId: request.id });
                if (current()) setReport(checked);
              } catch (e) {
                if (current()) setError(String(e));
              } finally {
                if (mounted.current) setBusy(false);
              }
            })()
          }
        >
          {busy ? 'Checking portal source…' : 'Check portal source'}
        </button>
        <button
          type="button"
          disabled={!free || zones.length >= 32}
          onClick={() => {
            if (!free) return;
            const zone: VisibilityZone = {
              kind: 'tunnel',
              id: crypto.randomUUID(),
              name: `Tunnel zone ${zones.length + 1}`,
              segment: free.i,
              start: 1 / 3,
              end: 2 / 3,
            };
            commit([...zones, zone], 'Add tunnel visibility zone');
            choose(zone);
            setShow(true);
            setFrame((n) => n + 1);
          }}
        >
          Add tunnel zone
        </button>
        <button
          type="button"
          disabled={zones.length >= 32}
          onClick={() => {
            const at = plan.tunnelPoints[0];
            const zone: VisibilityZone = {
              kind: 'editorBounds',
              id: crypto.randomUUID(),
              name: `Planning zone ${zones.length + 1}`,
              min: [at[0] - 2, at[1] - 2, at[2]],
              max: [at[0] + 2, at[1] + 2, at[2] + 4],
            };
            commit([...zones, zone], 'Add editor visibility planning box');
            choose(zone);
            setShow(true);
            setFrame((n) => n + 1);
          }}
        >
          Add planning box
        </button>
      </div>
      {report && (
        <p role="status">
          Source validated: {report.portalCount} portal planes. Tool compilation and game visibility remain
          separate checks.
        </p>
      )}
      <select
        aria-label="Visibility zone"
        value={chosen?.id ?? ''}
        onChange={(e) => {
          const z = zones.find((z) => z.id === e.target.value);
          if (z) choose(z);
        }}
      >
        <option value="">Select a zone</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name} · {z.kind === 'tunnel' ? 'portal source' : 'editor-only'}
          </option>
        ))}
      </select>
      {chosen && (
        <div>
          <label>
            Name
            <input
              aria-label="Visibility zone name"
              key={chosen.id + chosen.name}
              defaultValue={chosen.name}
              maxLength={80}
              onBlur={(e) => {
                if (e.target.value !== chosen.name) update({ ...chosen, name: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
          {chosen.kind === 'tunnel' ? (
            <>
              <label>
                Tunnel segment
                <select
                  aria-label="Visibility tunnel segment"
                  value={chosen.segment}
                  onChange={(e) => update({ ...chosen, segment: Number(e.target.value) })}
                >
                  {plan.tunnelPoints.slice(0, -1).map((_, i) => (
                    <option key={i} value={i}>
                      Segment {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entrance %
                <NumberField
                  label="Visibility entrance percent"
                  value={chosen.start * 100}
                  min={5}
                  max={95}
                  step={1}
                  onCommit={(v) => update({ ...chosen, start: v / 100 })}
                />
              </label>
              <label>
                Exit %
                <NumberField
                  label="Visibility exit percent"
                  value={chosen.end * 100}
                  min={5}
                  max={95}
                  step={1}
                  onCommit={(v) => update({ ...chosen, end: v / 100 })}
                />
              </label>
              <p>
                Click an entrance/exit handle and drag along its tunnel. Cuts must clear the source-map
                bounds; preview/build checks this. Other tunnel segments keep automatic portals.
              </p>
            </>
          ) : (
            <>
              <p className="gs-zone-editor-only">
                Editor-only bounds: this box does not change Halo visibility or compile into a portal.
              </p>
              {(['min', 'max'] as const).map((edge) => (
                <div key={edge}>
                  {edge === 'min' ? 'Minimum' : 'Maximum'}{' '}
                  {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                    <label key={axis}>
                      {axis}
                      <NumberField
                        label={`Zone ${edge} ${axis}`}
                        value={chosen[edge][i]}
                        min={-2048}
                        max={2048}
                        step={0.1}
                        onCommit={(v) =>
                          update({ ...chosen, [edge]: chosen[edge].map((n, k) => (k === i ? v : n)) as Vec3 })
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </>
          )}
          <div className="gs-zone-actions">
            <button
              type="button"
              onClick={() => {
                choose(chosen);
                setFrame((n) => n + 1);
              }}
            >
              Frame zone
            </button>
            <button
              type="button"
              onClick={() => {
                commit(
                  zones.filter((z) => z.id !== chosen.id),
                  'Remove visibility zone',
                );
                setSelection(null);
              }}
            >
              Remove zone
            </button>
          </div>
        </div>
      )}
      {(error || validateVisibilityZones(plan)[0]) && (
        <p role="alert">{error || validateVisibilityZones(plan)[0]}</p>
      )}
    </details>
  );
}

function ZoneHandle({
  position,
  enabled,
  onCommit,
  onStart,
  onEnd,
  vertical = false,
}: {
  position: Vec3;
  enabled: boolean;
  onCommit: (position: Vec3) => void;
  onStart: () => void;
  onEnd: () => void;
  vertical?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  return (
    <>
      <group ref={group} position={position}>
        <mesh>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} />
        </mesh>
      </group>
      <TransformControls
        object={group as MutableRefObject<THREE.Group>}
        mode="translate"
        enabled={enabled}
        showZ={vertical}
        size={0.8}
        space="world"
        onMouseDown={onStart}
        onMouseUp={() => {
          if (group.current) {
            const next = group.current.position.toArray() as Vec3;
            group.current.position.set(...position);
            onCommit(next);
          }
          onEnd();
        }}
      />
    </>
  );
}

export function VisibilityZoneOverlay({
  project,
  edit,
  enabled,
  onSelectScene,
  onSceneDragStart,
  onSceneDragEnd,
}: {
  project: Project;
  edit: Edit;
  enabled: boolean;
  onSelectScene: () => void;
  onSceneDragStart?: () => void;
  onSceneDragEnd?: () => void;
}) {
  const plan = project.bspAssembly;
  const [selection, setSelection] = useMapState<string | null>(project.id, 'visibility.selected', null);
  const [show] = useMapState(project.id, 'visibility.show', true);
  const [frame] = useMapState(project.id, 'visibility.frame', 0);
  const { camera, controls } = useThree();
  const oldFrame = useRef(frame),
    latest = useRef({ id: project.id, signature: assemblySignature(plan ?? null), project }),
    drag = useRef('');
  latest.current = { id: project.id, signature: assemblySignature(plan ?? null), project };
  const zones = plan?.visibilityZones ?? [],
    chosen = zones.find((z) => selection?.startsWith(z.id));
  useEffect(() => {
    if (frame === oldFrame.current) return;
    oldFrame.current = frame;
    if (!plan || !chosen) return;
    const b = visibilityBounds(plan, chosen);
    if (!b) return;
    const center = new THREE.Vector3(...b.min).add(new THREE.Vector3(...b.max)).multiplyScalar(0.5),
      span = Math.max(3, ...b.max.map((n, i) => n - b.min[i]));
    camera.up.set(0, 0, 1);
    camera.position.copy(center).add(new THREE.Vector3(span, -span, span * 0.7));
    camera.lookAt(center);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
    orbit?.target?.copy(center);
    orbit?.update?.();
  }, [frame, plan, chosen, camera, controls]);
  if (!plan || !show) return null;
  const commit = (zone: VisibilityZone) => {
    if (drag.current !== `${latest.current.id}:${latest.current.signature}`) return;
    const current = latest.current.project,
      currentPlan = current.bspAssembly;
    if (!currentPlan) return;
    const previous = currentPlan.visibilityZones ?? [];
    if (previous.some((z) => z.id === zone.id && JSON.stringify(z) === JSON.stringify(zone))) return;
    const next = previous.map((z) => (z.id === zone.id ? zone : z));
    if (validateVisibilityZones({ ...currentPlan, visibilityZones: next }).length) return;
    edit(withVisibilityZones(current, next), `Drag visibility zone: ${zone.name}`);
  };
  const start = () => {
    drag.current = `${latest.current.id}:${latest.current.signature}`;
    onSceneDragStart?.();
  };
  const select = (zone: VisibilityZone, part: string) => {
    setSelection(`${zone.id}:${part}`);
    onSelectScene();
  };
  return (
    <group>
      {zones.map((zone) => {
        const b = visibilityBounds(plan, zone);
        if (!b) return null;
        const center = b.min.map((n, i) => (n + b.max[i]) / 2) as Vec3,
          size = b.max.map((n, i) => n - b.min[i]) as Vec3,
          color = zone.kind === 'tunnel' ? '#67f1e1' : '#ffc46b';
        const quads = portalQuads(plan, zone);
        return (
          <group key={zone.id}>
            <mesh
              position={center}
              onClick={(e) => {
                e.stopPropagation();
                select(zone, zone.kind === 'tunnel' ? 'start' : 'bounds');
              }}
            >
              <boxGeometry args={size} />
              <meshBasicMaterial color={color} transparent opacity={0.035} depthWrite={false} />
              <Edges color={color} />
            </mesh>
            <ViewportLabel
              text={`${zone.name} · ${zone.kind === 'tunnel' ? 'portal source' : 'EDITOR ONLY'}`}
              position={[center[0], center[1], b.max[2] + 0.2]}
            />
            {quads.map((quad, i) => {
              const midpoint = quad.reduce((v, p) => v.map((n, k) => n + p[k] / 4) as Vec3, [
                0, 0, 0,
              ] as Vec3);
              return (
                <group key={i}>
                  <Line points={[...quad, quad[0]]} color={color} lineWidth={2} />
                  <mesh
                    position={midpoint}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(zone, i === 0 ? 'start' : 'end');
                    }}
                  >
                    <sphereGeometry args={[0.12, 12, 8]} />
                    <meshBasicMaterial color={color} depthTest={false} />
                  </mesh>
                  {enabled &&
                    selection === `${zone.id}:${i === 0 ? 'start' : 'end'}` &&
                    zone.kind === 'tunnel' && (
                      <ZoneHandle
                        position={midpoint}
                        enabled={enabled}
                        onStart={start}
                        onEnd={() => onSceneDragEnd?.()}
                        onCommit={(p) => commit(movePortalCut(plan, zone, i === 0 ? 'start' : 'end', p))}
                      />
                    )}
                </group>
              );
            })}
            {enabled && zone.kind === 'editorBounds' && selection === `${zone.id}:bounds` && (
              <ZoneHandle
                position={center}
                vertical
                enabled={enabled}
                onStart={start}
                onEnd={() => onSceneDragEnd?.()}
                onCommit={(p) => {
                  const delta = p.map((n, i) => n - center[i]);
                  commit({
                    ...zone,
                    min: zone.min.map((n, i) => n + delta[i]) as Vec3,
                    max: zone.max.map((n, i) => n + delta[i]) as Vec3,
                  });
                }}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

import SceneEnvironment from './SceneEnvironment';
import { sourceSurfaceEnvironment } from '../environment';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { Edges, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import TransformControls from './HaloTransformControls';
import RightMouseFly from './RightMouseFly';
import ViewportSession from './ViewportSession';
import { WrlErrorOverlay } from './ForgeViewport';
import BspSurfaces from './BspSurfaces';
import type { WrlDiagnostics } from '../haloWrl';
import { useWorkshopTextures } from '../useWorkshopTextures';
import RendererQuality from './RendererQuality';
import { useRendererQuality } from './RendererQuality';
import { NumberField, HelpTip, Notice } from './ui';
import { call } from '../api';
import { useMapState } from '../mapSession';
import { beginProjectMutation } from '../projectMutation';
import {
  boxBrush,
  rampBrush,
  clipBrush,
  extrudeFace,
  worldVertex,
  localVertex,
  viewAxes,
  snapNumber,
  sub,
  workshopExample,
  workshopFromPrimitives,
} from '../bspWorkshop';
import type { BspBrush, BspFace, BspTool, BspView } from '../bspWorkshop';
import type { ForgeMesh, GeometryReport, QuickForgeDocument } from '../forge';
import type { Vec3, OpenProject } from '../types';
import '../bspWorkshop.css';
interface Props {
  projectId: string;
  document: QuickForgeDocument;
  mesh: ForgeMesh | null;
  report: GeometryReport | null;
  onCommit: (d: QuickForgeDocument, label: string) => void;
  onBack: () => void;
  readOnly?: boolean;
  materialSource?: OpenProject | null;
  materialBindings?: import('../types').NativeAssetImport[];
  wrlOverlay?: WrlDiagnostics | null;
  textureSources?: { id: string; title: string }[];
  onTextureSource?: (id: string) => void;
  onBusy?: (busy: boolean) => void;
}
type Selection = { brushId: string; faceId?: string; vertices?: number[] };
const toolList: [BspTool, string, string][] = [
  ['select', 'Select', 'Select a volume; Ctrl-click adds to selection in QuickForge.'],
  ['move', 'Move', 'Drag a volume in any orthographic view, or use the 3D axis gizmo.'],
  ['rotate', 'Rotate', 'Use the 3D gizmo or the precise angle fields.'],
  ['scale', 'Scale', 'Scale a brush with the 3D gizmo or exact values.'],
  [
    'drawSpace',
    'Room',
    'Draw a playable room or connecting passage in an orthographic view. Overlap passages into both rooms.',
  ],
  ['drawSolid', 'Solid', 'Draw a solid slab/platform. Solid brushes subtract from playable space.'],
  ['vertex', 'Vertex', 'Select and drag a vertex. Invalid/nonconvex results are rejected atomically.'],
  ['edge', 'Edge', 'Select an edge and drag both vertices.'],
  ['face', 'Face', 'Select a face to move its vertices or extrude a new brush.'],
  ['clip', 'Clip', 'Keep one side of an explicit local plane; a new closing face is generated.'],
  ['material', 'Material', 'Select a source face; assign a Halo shader and adjust its UVs.'],
  ['measure', 'Measure', 'Drag between points in an orthographic view to measure Halo world units.'],
];
function sourceGeometry(b: BspBrush) {
  const g = new THREE.BufferGeometry(),
    p: number[] = [];
  for (const f of b.faces)
    for (let j = 1; j < f.vertices.length - 1; j++)
      for (const i of [f.vertices[0], f.vertices[j], f.vertices[j + 1]])
        p.push(...worldVertex(b, b.vertices[i]));
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
function BrushOutline({
  brush,
  active,
  onSelect,
}: {
  brush: BspBrush;
  active: boolean;
  onSelect: () => void;
}) {
  const geometry = useMemo(() => sourceGeometry(brush), [brush]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial
        transparent
        opacity={active ? 0.07 : 0.015}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
      <Edges color={active ? '#a3ffe3' : brush.role === 'space' ? '#708db0' : '#daaa78'} threshold={15} />
    </mesh>
  );
}
function BrushGizmo({
  brush,
  mode,
  snap,
  onChange,
  onDrag,
}: {
  brush: BspBrush;
  mode: 'translate' | 'rotate' | 'scale';
  snap: number;
  onChange: (b: BspBrush) => void;
  onDrag: (v: boolean) => void;
}) {
  const target = useRef<THREE.Group>(null),
    center = brush.vertices.reduce((p, v) => p.map((x, k) => x + v[k] / brush.vertices.length) as Vec3, [
      0, 0, 0,
    ] as Vec3),
    pivot = worldVertex(brush, center);
  return (
    <>
      <group
        ref={target}
        position={pivot}
        rotation={new THREE.Euler(...brush.rotation, 'ZYX')}
        scale={brush.scale}
      />
      <TransformControls
        object={target as React.RefObject<THREE.Object3D>}
        mode={mode}
        translationSnap={snap || null}
        rotationSnap={snap ? Math.PI / 12 : null}
        onMouseDown={() => onDrag(true)}
        onMouseUp={() => {
          if (target.current) {
            const t = target.current;
            const next = {
              ...brush,
              position: [0, 0, 0] as Vec3,
              rotation: [t.rotation.x, t.rotation.y, t.rotation.z] as Vec3,
              scale: t.scale.toArray() as Vec3,
            };
            const changedCenter = worldVertex(next, center);
            next.position = t.position.toArray().map((x, k) => x - changedCenter[k]) as Vec3;
            onChange(next);
          }
          onDrag(false);
        }}
      />
    </>
  );
}
function Ortho({
  projectId,
  view,
  brushes,
  selected,
  tool,
  grid,
  height,
  disabled,
  onSelect,
  onBrush,
  onMove,
  onGesture,
}: {
  projectId: string;
  view: Exclude<BspView, 'perspective'>;
  brushes: BspBrush[];
  selected: Selection | null;
  tool: BspTool;
  grid: number;
  height: number;
  disabled: boolean;
  onSelect: (s: Selection) => void;
  onBrush: (lo: Vec3, hi: Vec3) => void;
  onMove: (b: BspBrush) => void;
  onGesture: (v: boolean) => void;
}) {
  useEffect(() => () => onGesture(false), []);
  const axes = viewAxes[view],
    svg = useRef<SVGSVGElement>(null);
  const [storedCamera, setCamera] = useMapState(projectId, `bsp.view.${view}`, {
    x: 12,
    y: view === 'top' ? 0 : 2,
    zoom: 1,
  });
  const camera = {
    x: Number.isFinite(storedCamera?.x) ? storedCamera.x : 12,
    y: Number.isFinite(storedCamera?.y) ? storedCamera.y : 0,
    zoom: Math.max(0.25, Math.min(8, storedCamera?.zoom || 1)),
  };
  const [drag, setDrag] = useState<{
    start: Vec3;
    end: Vec3;
    brush?: BspBrush;
    indices?: number[];
    pan?: { x: number; y: number; screenX: number; screenY: number };
  } | null>(null);
  const width = 72 / camera.zoom,
    vertical = 36 / camera.zoom;
  const point = (event: { clientX: number; clientY: number }): Vec3 => {
    const r = svg.current!.getBoundingClientRect(),
      p: Vec3 = [0, 0, 0];
    p[axes[0]] = snapNumber(camera.x + ((event.clientX - r.left) / r.width) * width - width / 2, grid);
    p[axes[1]] = snapNumber(
      camera.y - (((event.clientY - r.top) / r.height) * vertical - vertical / 2),
      grid,
    );
    return p;
  };
  function start(e: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return;
    const p = point(e);
    if (e.button === 1 || e.altKey) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        start: p,
        end: p,
        pan: { x: camera.x, y: camera.y, screenX: e.clientX, screenY: e.clientY },
      });
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'drawSpace' || tool === 'drawSolid' || tool === 'measure') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ start: p, end: p });
      onGesture(true);
      return;
    }
    const element = e.target as Element,
      id = element.getAttribute('data-brush'),
      faceId = element.getAttribute('data-face') ?? undefined;
    const b = brushes.find((b) => b.id === id);
    if (!b) return;
    const vertex = element.getAttribute('data-vertex'),
      edge = element.getAttribute('data-edge');
    const indices =
      tool === 'vertex' && vertex !== null
        ? [Number(vertex)]
        : tool === 'edge' && edge !== null
          ? edge.split(',').map(Number)
          : tool === 'face' && faceId
            ? b.faces.find((f) => f.id === faceId)?.vertices
            : undefined;
    onSelect({ brushId: b.id, faceId, vertices: indices });
    if (tool === 'move' || indices) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ start: p, end: p, brush: b, indices });
      onGesture(true);
    }
  }
  function finish(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const end = point(e),
      d = sub(end, drag.start);
    setDrag(null);
    if (!drag.pan && tool !== 'measure') {
      if (drag.brush) {
        const b = structuredClone(drag.brush);
        if (drag.indices) {
          b.vertices = b.vertices.map((v, i) =>
            drag.indices!.includes(i) ? localVertex(b, worldVertex(b, v).map((x, k) => x + d[k]) as Vec3) : v,
          );
        } else b.position = b.position.map((x, k) => x + d[k]) as Vec3;
        onMove(b);
      } else if (Math.hypot(...d) > 0.01) {
        const lo: Vec3 = [0, 0, 0],
          hi: Vec3 = [height, height, height];
        for (const a of axes.slice(0, 2)) {
          lo[a] = Math.min(drag.start[a], end[a]);
          hi[a] = Math.max(drag.start[a], end[a]);
        }
        if (view !== 'top') {
          lo[axes[2]] = -height / 2;
          hi[axes[2]] = height / 2;
        }
        onBrush(lo, hi);
      }
    }
    onGesture(false);
  }
  const preview =
    drag && !drag.pan && !drag.brush
      ? {
          x: Math.min(drag.start[axes[0]], drag.end[axes[0]]),
          y: -Math.max(drag.start[axes[1]], drag.end[axes[1]]),
          w: Math.abs(drag.start[axes[0]] - drag.end[axes[0]]),
          h: Math.abs(drag.start[axes[1]] - drag.end[axes[1]]),
        }
      : null;
  const step = Math.max(grid || 1, 2 ** Math.ceil(Math.log2(width / 100))),
    gridId = `bsp-grid-${view}`;
  return (
    <svg
      ref={svg}
      className="bsp-ortho"
      aria-label={`${view} orthographic editing view`}
      viewBox={`${camera.x - width / 2} ${-camera.y - vertical / 2} ${width} ${vertical}`}
      preserveAspectRatio="none"
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) =>
        setCamera((c) => ({ ...c, zoom: Math.min(8, Math.max(0.25, c.zoom * Math.exp(-e.deltaY * 0.001))) }))
      }
      onPointerDown={start}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = point(e);
        if (drag.pan) {
          const rect = svg.current!.getBoundingClientRect();
          setCamera((c) => ({
            ...c,
            x: drag.pan!.x - ((e.clientX - drag.pan!.screenX) / rect.width) * width,
            y: drag.pan!.y + ((e.clientY - drag.pan!.screenY) / rect.height) * vertical,
          }));
        } else setDrag({ ...drag, end: p });
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        setDrag(null);
        onGesture(false);
      }}
    >
      <defs>
        <pattern id={gridId} width={step} height={step} patternUnits="userSpaceOnUse">
          <path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none" stroke="#334354" strokeWidth={0.025} />
        </pattern>
      </defs>
      <rect
        x={camera.x - width / 2}
        y={-camera.y - vertical / 2}
        width={width}
        height={vertical}
        fill={`url(#${gridId})`}
      />
      {brushes.map((b) => (
        <g key={b.id}>
          {b.faces.map((f) => (
            <polygon
              key={f.id}
              data-brush={b.id}
              data-face={f.id}
              points={f.vertices
                .map((i) => {
                  const p = worldVertex(b, b.vertices[i]);
                  return `${p[axes[0]]},${-p[axes[1]]}`;
                })
                .join(' ')}
              className={`${b.role} ${selected?.brushId === b.id ? 'selected' : ''} ${selected?.brushId === b.id && selected.faceId === f.id ? 'face-selected' : ''}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {b.id === selected?.brushId && (tool === 'vertex' || tool === 'edge') && (
            <>
              {tool === 'edge' &&
                b.faces.flatMap((f) =>
                  f.vertices.map((i, j) => {
                    const end = f.vertices[(j + 1) % f.vertices.length],
                      a = worldVertex(b, b.vertices[i]),
                      c = worldVertex(b, b.vertices[end]);
                    return (
                      <line
                        key={`${f.id}-${j}`}
                        data-brush={b.id}
                        data-edge={`${i},${end}`}
                        x1={a[axes[0]]}
                        y1={-a[axes[1]]}
                        x2={c[axes[0]]}
                        y2={-c[axes[1]]}
                        stroke="#eebf82"
                        strokeWidth={0.15 / camera.zoom}
                      />
                    );
                  }),
                )}
              {b.vertices.map((v, i) => {
                const p = worldVertex(b, v);
                return (
                  <circle
                    key={i}
                    data-brush={b.id}
                    data-vertex={i}
                    cx={p[axes[0]]}
                    cy={-p[axes[1]]}
                    r={0.2 / camera.zoom}
                    fill={selected.vertices?.includes(i) ? '#fff' : '#83eee0'}
                  />
                );
              })}
            </>
          )}
        </g>
      ))}
      {preview && (
        <rect
          x={preview.x}
          y={preview.y}
          width={preview.w}
          height={preview.h}
          fill="#8de4d52b"
          stroke="#96f3e0"
          strokeWidth={0.05}
        />
      )}
      {tool === 'measure' && drag && (
        <>
          <line
            x1={drag.start[axes[0]]}
            y1={-drag.start[axes[1]]}
            x2={drag.end[axes[0]]}
            y2={-drag.end[axes[1]]}
            stroke="#ffe38d"
            strokeWidth={0.08}
          />
          <text x={drag.end[axes[0]]} y={-drag.end[axes[1]]} fontSize={1 / camera.zoom} fill="#fff">
            {Math.hypot(...sub(drag.end, drag.start)).toFixed(3)} u
          </text>
        </>
      )}
    </svg>
  );
}
export default function BspWorkshop(props: Props) {
  const { document: doc, projectId } = props,
    w = doc.workshop,
    q = useRendererQuality(projectId),
    latest = useRef(doc);
  latest.current = doc;
  const materialPreview = useWorkshopTextures(doc, props.materialSource, props.materialBindings);
  const [selection, setSelection] = useMapState<Selection | null>(projectId, 'bsp.selection', () => null),
    [tool, setTool] = useMapState<BspTool>(projectId, 'bsp.tool', 'select'),
    [maximized, setMaximized] = useMapState<BspView | null>(projectId, 'bsp.maximized', null),
    [splitX, setSplitX] = useMapState(projectId, 'bsp.splitX', 50),
    [splitY, setSplitY] = useMapState(projectId, 'bsp.splitY', 50),
    [grid, setGrid] = useMapState(projectId, 'bsp.grid', 0.5),
    [wire, setWire] = useMapState(projectId, 'bsp.wireframe', false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [height, setHeight] = useState(4),
    [depth, setDepth] = useState(2),
    [clipAxis, setClipAxis] = useState(0),
    [clipDistance, setClipDistance] = useState(0),
    [offset, setOffset] = useState<Vec3>([0, 0, 0]),
    [portalX, setPortalX] = useState(8);
  const [materialId, setMaterialId] = useState(doc.materials.find((m) => !m.name.startsWith('+'))?.id ?? '');
  const lease = useRef<(() => void) | null>(null),
    alive = useRef(true),
    operation = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      lease.current?.();
      props.onBusy?.(false);
    };
  }, []);
  function gesture(on: boolean) {
    props.onBusy?.(on || operation.current);
    if (on && !lease.current) lease.current = beginProjectMutation(projectId);
    if (!on) {
      lease.current?.();
      lease.current = null;
    }
  }
  async function apply(next: QuickForgeDocument, label: string) {
    if (operation.current || props.readOnly) return;
    operation.current = true;
    const expected = latest.current,
      release = beginProjectMutation(projectId);
    setBusy(true);
    props.onBusy?.(true);
    setError('');
    try {
      const report = await call<GeometryReport>('quickforge_validate', { document: next });
      if (!alive.current) return;
      if (latest.current !== expected)
        throw Error('Source changed while this operation was checked. Retry against the current revision');
      const blockers = report.issues.filter(
        (i) =>
          i.severity === 'error' && !['WORKSHOP_DISCONNECTED', 'WORKSHOP_SPAWN_CLEARANCE'].includes(i.code),
      );
      if (blockers.length) throw Error(blockers.map((i) => i.message).join('\n'));
      props.onCommit(next, label);
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      release();
      operation.current = false;
      props.onBusy?.(false);
      if (alive.current) setBusy(false);
    }
  }
  function updateBrush(brush: BspBrush, label = 'Edit BSP brush') {
    if (!w) return;
    void apply(
      { ...doc, workshop: { ...w, brushes: w.brushes.map((b) => (b.id === brush.id ? brush : b)) } },
      label,
    );
  }
  const brush = w?.brushes.find((b) => b.id === selection?.brushId),
    face = brush?.faces.find((f) => f.id === selection?.faceId),
    disabled = busy || props.readOnly;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector('canvas[data-gs-fly-active="true"]')
      )
        return;
      if (e.code === 'KeyW') setTool('move');
      if (e.code === 'KeyE') setTool('rotate');
      if (e.code === 'KeyR') setTool('scale');
      if (e.code === 'Escape') {
        setSelection(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [setTool, setSelection]);
  const fields = (label: string, values: Vec3, change: (v: Vec3) => void, step = 0.5) => (
    <fieldset>
      <legend>{label}</legend>
      <div className="bsp-workshop-vector">
        {values.map((v, k) => (
          <label className="bsp-workshop-axis" key={k}>
            <span className={['gs-axis-x', 'gs-axis-y', 'gs-axis-z'][k]}>{['X', 'Y', 'Z'][k]}</span>
            <NumberField
              label={['X', 'Y', 'Z'][k]}
              value={v}
              step={step}
              onCommit={(value) => change(values.map((x, j) => (j === k ? value : x)) as Vec3)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
  function newBrush(lo: Vec3, hi: Vec3) {
    if (!w) return;
    try {
      const b = boxBrush(crypto.randomUUID(), tool === 'drawSolid' ? 'solid' : 'space', lo, hi, materialId);
      void apply({ ...doc, workshop: { ...w, brushes: [...w.brushes, b] } }, 'Draw BSP volume');
      setSelection({ brushId: b.id });
    } catch (e) {
      setError(String(e));
    }
  }
  if (!w)
    return (
      <section className="bsp-intro">
        <h2>BSP Workshop</h2>
        <p>
          Build rooms, openings and ramps here. The original brush source, materials and UVs stay editable.
          Halo Tool builds the structure and collision in a separate job.
        </p>
        <div className="bsp-entry-actions">
          <button
            disabled={disabled || !!doc.native}
            onClick={() => {
              try {
                void apply(workshopFromPrimitives(doc), 'Convert simple QuickForge source to BSP Workshop');
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Use current room / box / ramp source
          </button>
          <button
            disabled={disabled || !!doc.native}
            onClick={() => {
              try {
                void apply(workshopExample(doc), 'Create two-room Workshop source example');
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Two rooms + corridor + ramp
          </button>
          <button onClick={props.onBack}>Back to QuickForge</button>
        </div>
        <p>
          Starting the example replaces the geometry as one undoable edit. Existing assets, starts, objectives and game mode are kept; validation identifies anything that needs moving.
          Save a separate project copy to keep both versions. Admitted native collaboration source requires a
          separate Workshop project.
        </p>
        {error && <Notice>{error}</Notice>}
      </section>
    );
  return (
    <section
      className="bsp-workshop"
      data-history-project={projectId}
      aria-label="Native BSP Workshop"
      data-source-sha={props.report?.sourceSha256 ?? ''}
      data-source-valid={props.report?.valid ?? false}
      data-textures={Object.keys(materialPreview.textures).length}
    >
      <div className="bsp-toolbar">
        <strong>BSP Workshop</strong>
        <span className="bsp-tools">
          {toolList.map(([id, label, help]) => (
            <button
              key={id}
              disabled={disabled}
              className={tool === id ? 'selected' : ''}
              aria-pressed={tool === id}
              title={help}
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          ))}
        </span>
        <label>
          Grid
          <select
            aria-label="BSP grid spacing"
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
          >
            {[0, 0.125, 0.25, 0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                {v || 'Off'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} />
          Wire
        </label>
        <HelpTip help="Rooms represent playable air; solids remove air. Overlap a passage into adjoining rooms to cut real openings. Draw in top/front/side; middle-drag pans, wheel zooms. Select faces/vertices/edges for local edits. Every edit validates before one Undo step. Native builds are in Build tools below." />
      </div>
      {props.readOnly && (
        <Notice>
          Workshop source changes are not yet admitted in a shared editing session. Keep that session intact
          and open a separate Workshop project.
        </Notice>
      )}
      <div className="bsp-body">
        <div
          className={`bsp-views ${maximized ? 'maximized' : ''}`}
          style={{
            gridTemplateColumns: maximized ? '1fr' : `${splitX}% 1fr`,
            gridTemplateRows: maximized ? '1fr' : `${splitY}% 1fr`,
          }}
        >
          {(['perspective', 'top', 'front', 'side'] as BspView[])
            .filter((view) => !maximized || maximized === view)
            .map((view) => (
              <div className="bsp-view" key={view}>
                <header>
                  <b>
                    {view === 'perspective'
                      ? 'Perspective'
                      : `${view[0].toUpperCase()}${view.slice(1)} · ${view === 'top' ? 'X / Y' : view === 'front' ? 'X / Z' : 'Y / Z'}`}
                  </b>
                  <button
                    aria-label={`${maximized ? 'Restore four views' : 'Maximize'} ${view}`}
                    onClick={() => setMaximized(maximized ? null : view)}
                  >
                    {maximized ? 'Four views' : '⛶'}
                  </button>
                </header>
                {view === 'perspective' ? (
                  <Canvas
                    key={String(q.antialias)}
                    dpr={q.dpr}
                    gl={{ antialias: q.antialias, alpha: false }}
                    onPointerMissed={() => setSelection(null)}
                  >
                    <PerspectiveCamera
                      makeDefault
                      position={[36, -36, 28]}
                      up={[0, 0, 1]}
                      fov={60}
                      userData={{ gsEditorCamera: true }}
                    />
                    <OrbitControls makeDefault target={[12, 0, 1]} enableDamping={false} />
                    <ViewportSession id={projectId} channel="bsp" requiresControls />
                    <RightMouseFly />
                    {props.wrlOverlay && <WrlErrorOverlay diagnostics={props.wrlOverlay} />}
                    <SceneEnvironment value={sourceSurfaceEnvironment(doc.environment)} overrideLighting />
                    {props.mesh && (
                      <BspSurfaces
                        mesh={props.mesh}
                        doc={doc}
                        selection={selection}
                        onSelect={setSelection}
                        wire={wire}
                        textures={materialPreview.textures}
                        views={materialPreview.views}
                      />
                    )}
                    {w.brushes.map((b) => (
                      <BrushOutline
                        key={b.id}
                        brush={b}
                        active={brush?.id === b.id}
                        onSelect={() => setSelection({ brushId: b.id })}
                      />
                    ))}
                    {brush && ['move', 'rotate', 'scale'].includes(tool) && !disabled && (
                      <BrushGizmo
                        brush={brush}
                        mode={tool === 'move' ? 'translate' : (tool as 'rotate' | 'scale')}
                        snap={grid}
                        onChange={(b) => updateBrush(b, 'Transform BSP volume')}
                        onDrag={gesture}
                      />
                    )}
                  </Canvas>
                ) : (
                  <Ortho
                    projectId={projectId}
                    view={view}
                    brushes={w.brushes}
                    selected={selection}
                    tool={tool}
                    grid={grid}
                    height={height}
                    disabled={!!disabled}
                    onSelect={setSelection}
                    onBrush={newBrush}
                    onMove={(b) => updateBrush(b, 'Drag BSP geometry')}
                    onGesture={gesture}
                  />
                )}
              </div>
            ))}
          {!maximized && (
            <>
              <div
                className="bsp-split-x"
                aria-label="Resize BSP viewport columns"
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-valuenow={splitX}
                aria-valuemin={25}
                aria-valuemax={75}
                style={{ left: `${splitX}%` }}
                onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                  setSplitX(Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100)));
                }}
                onKeyDown={(e) => {
                  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                    setSplitX(Math.max(25, Math.min(75, splitX + (e.key === 'ArrowRight' ? 2 : -2))));
                  }
                }}
              />
              <div
                className="bsp-split-y"
                aria-label="Resize BSP viewport rows"
                role="separator"
                tabIndex={0}
                aria-orientation="horizontal"
                aria-valuenow={splitY}
                aria-valuemin={25}
                aria-valuemax={75}
                style={{ top: `${splitY}%` }}
                onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                  setSplitY(Math.max(25, Math.min(75, ((e.clientY - rect.top) / rect.height) * 100)));
                }}
                onKeyDown={(e) => {
                  if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.preventDefault();
                    setSplitY(Math.max(25, Math.min(75, splitY + (e.key === 'ArrowDown' ? 2 : -2))));
                  }
                }}
              />
            </>
          )}
        </div>
        <aside className="bsp-properties">
          <div className="bsp-source-list">
            <b>Source volumes</b>
            {w.brushes.map((b) => (
              <button
                key={b.id}
                className={brush?.id === b.id ? 'selected' : ''}
                onClick={() => setSelection({ brushId: b.id })}
              >
                {b.role === 'space' ? '◇' : '◆'} {b.name}
              </button>
            ))}
          </div>
          <div className="bsp-source-fields" aria-busy={busy}>
            <fieldset disabled={disabled}>
              <legend>{brush?.name ?? 'Construction'}</legend>
              {['drawSpace', 'drawSolid'].includes(tool) && (
                <NumberField
                  label="New brush depth / height"
                  value={height}
                  min={0.1}
                  max={512}
                  step={0.5}
                  onCommit={setHeight}
                />
              )}
              {brush && (
                <>
                  <label>
                    Name
                    <input
                      key={brush.id + brush.name}
                      defaultValue={brush.name}
                      onBlur={(e) => {
                        if (e.target.value !== brush.name)
                          updateBrush({ ...brush, name: e.target.value }, 'Rename BSP brush');
                      }}
                    />
                  </label>
                  {fields('Position', brush.position, (v) =>
                    updateBrush({ ...brush, position: v }, 'Move BSP brush'),
                  )}
                  {fields(
                    'Rotation · degrees',
                    brush.rotation.map((v) => (v * 180) / Math.PI) as Vec3,
                    (v) =>
                      updateBrush(
                        { ...brush, rotation: v.map((v) => (v * Math.PI) / 180) as Vec3 },
                        'Rotate BSP brush',
                      ),
                    15,
                  )}
                  {fields(
                    'Scale',
                    brush.scale,
                    (v) => updateBrush({ ...brush, scale: v }, 'Scale BSP brush'),
                    0.1,
                  )}
                  <div className="bsp-inline">
                    <button
                      onClick={() => {
                        const b = {
                          ...structuredClone(brush),
                          id: crypto.randomUUID(),
                          name: `${brush.name} copy`,
                          position: brush.position.map((v, k) => v + (k === 0 ? grid || 1 : 0)) as Vec3,
                        };
                        void apply(
                          { ...doc, workshop: { ...w, brushes: [...w.brushes, b] } },
                          'Duplicate BSP brush',
                        );
                        setSelection({ brushId: b.id });
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => {
                        void apply(
                          { ...doc, workshop: { ...w, brushes: w.brushes.filter((b) => b.id !== brush.id) } },
                          'Delete BSP brush',
                        );
                      }}
                    >
                      Delete volume
                    </button>
                  </div>
                  <label>
                    Source face
                    <select
                      aria-label="BSP source face"
                      value={selection?.faceId ?? ''}
                      onChange={(e) =>
                        setSelection({
                          brushId: brush.id,
                          faceId: e.target.value,
                          vertices:
                            tool === 'face'
                              ? brush.faces.find((f) => f.id === e.target.value)?.vertices
                              : undefined,
                        })
                      }
                    >
                      <option value="">Whole brush</option>
                      {brush.faces.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id} · {f.vertices.length} vertices
                        </option>
                      ))}
                    </select>
                  </label>
                  {face && (
                    <>
                      <NumberField
                        label="Extrude depth"
                        value={depth}
                        min={0.01}
                        max={512}
                        step={0.5}
                        onCommit={setDepth}
                      />
                      <button
                        onClick={() => {
                          try {
                            const next = extrudeFace(brush, face.id, depth, crypto.randomUUID());
                            void apply(
                              { ...doc, workshop: { ...w, brushes: [...w.brushes, next] } },
                              'Extrude BSP face into connected brush',
                            );
                            setSelection({ brushId: next.id });
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      >
                        Extrude face
                      </button>
                    </>
                  )}
                  {selection?.vertices?.length ? (
                    <>
                      {fields('Move selected vertices by', offset, setOffset)}
                      <button
                        onClick={() => {
                          const b = structuredClone(brush);
                          for (const i of selection.vertices!)
                            b.vertices[i] = b.vertices[i].map((v, k) =>
                              snapNumber(v + offset[k], grid),
                            ) as Vec3;
                          updateBrush(b, 'Move BSP sub-selection');
                        }}
                      >
                        Apply vertex / edge offset
                      </button>
                    </>
                  ) : null}
                  {tool === 'clip' && (
                    <fieldset>
                      <legend>Local clip plane · keep axis ≤ distance</legend>
                      <select
                        aria-label="BSP clip normal"
                        value={clipAxis}
                        onChange={(e) => setClipAxis(Number(e.target.value))}
                      >
                        {['X', 'Y', 'Z'].map((a, i) => (
                          <option key={a} value={i}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <NumberField
                        label="Plane distance"
                        value={clipDistance}
                        step={grid || 0.1}
                        onCommit={setClipDistance}
                      />
                      <button
                        onClick={() => {
                          try {
                            updateBrush(
                              clipBrush(
                                brush,
                                [0, 1, 2].map((i) => (i === clipAxis ? 1 : 0)) as Vec3,
                                clipDistance,
                                `cap-${crypto.randomUUID()}`,
                              ),
                              'Clip BSP brush',
                            );
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      >
                        Clip and cap brush
                      </button>
                    </fieldset>
                  )}
                </>
              )}
              <label>
                Surface material
                <select
                  aria-label="BSP material"
                  value={face?.materialId ?? materialId}
                  onChange={(e) => {
                    setMaterialId(e.target.value);
                    if (brush) {
                      updateBrush(
                        {
                          ...brush,
                          faces: brush.faces.map((f) =>
                            !face || f.id === face.id ? { ...f, materialId: e.target.value } : f,
                          ),
                        },
                        'Assign BSP surface material',
                      );
                    }
                  }}
                >
                  {doc.materials
                    .filter((m) => !m.name.startsWith('+'))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              {face && (
                <>
                  <div className="bsp-workshop-vector">
                    {(['uvScale', 'uvOffset'] as const).map((key) => (
                      <fieldset key={key}>
                        <legend>{key === 'uvScale' ? 'UV tiling' : 'UV offset'}</legend>
                        {face[key].map((v, k) => (
                          <NumberField
                            key={k}
                            label={k ? 'V' : 'U'}
                            value={v}
                            step={0.25}
                            onCommit={(value) => {
                              const f = { ...face, [key]: face[key].map((x, j) => (j === k ? value : x)) };
                              updateBrush(
                                { ...brush!, faces: brush!.faces.map((old) => (old.id === f.id ? f : old)) },
                                'Change BSP face UVs',
                              );
                            }}
                          />
                        ))}
                      </fieldset>
                    ))}
                  </div>
                  <NumberField
                    label="UV rotation · degrees"
                    value={face.uvRotation}
                    step={15}
                    onCommit={(value) =>
                      updateBrush(
                        {
                          ...brush!,
                          faces: brush!.faces.map((f) =>
                            f.id === face.id ? { ...f, uvRotation: value } : f,
                          ),
                        },
                        'Rotate BSP UVs',
                      )
                    }
                  />
                </>
              )}
              <details>
                <summary>Halo material paths & player starts</summary>
                {props.textureSources && (
                  <label>
                    Texture source map
                    <select
                      aria-label="Workshop texture source"
                      value={props.materialSource?.project.id ?? ''}
                      onChange={(e) => props.onTextureSource?.(e.target.value)}
                    >
                      <option value="">Choose a loaded map</option>
                      {props.textureSources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {props.materialSource?.inspection && (
                  <label>
                    Assign source-map shader
                    <select
                      aria-label="Assign source-map shader"
                      defaultValue=""
                      onChange={(e) => {
                        const path = e.target.value;
                        if (path)
                          void apply(
                            {
                              ...doc,
                              materials: doc.materials.map((m) =>
                                m.id === (face?.materialId ?? materialId) ? { ...m, shaderPath: path } : m,
                              ),
                            },
                            'Assign exact native shader path',
                          );
                      }}
                    >
                      <option value="">Choose a shader from the loaded source map</option>
                      {props.materialSource.inspection.tags
                        .filter((t) => t.class === 'senv')
                        .map((t) => (
                          <option key={t.id} value={t.path}>
                            {t.path}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {doc.materials
                  .filter((m) => !m.name.startsWith('+'))
                  .map((m) => (
                    <label key={m.id}>
                      {m.name}
                      <input
                        aria-label={`Shader path ${m.id}`}
                        defaultValue={m.shaderPath ?? ''}
                        placeholder="levels/test/tutorial/shaders/example_tutorial_metal_floor"
                        onBlur={(e) => {
                          if ((m.shaderPath ?? '') !== e.target.value)
                            void apply(
                              {
                                ...doc,
                                materials: doc.materials.map((old) =>
                                  old.id === m.id ? { ...old, shaderPath: e.target.value || null } : old,
                                ),
                              },
                              'Set native BSP shader',
                            );
                        }}
                      />
                    </label>
                  ))}
                <label>
                  Halo sky tag
                  <input
                    defaultValue={doc.skyPath ?? ''}
                    onBlur={(e) => {
                      if ((doc.skyPath ?? '') !== e.target.value)
                        void apply({ ...doc, skyPath: e.target.value || null }, 'Set Workshop sky tag');
                    }}
                  />
                </label>
                {doc.spawns.map((s) => (
                  <div key={s.id}>
                    {fields(
                      s.name,
                      s.position,
                      (position) =>
                        void apply(
                          {
                            ...doc,
                            spawns: doc.spawns.map((old) => (old.id === s.id ? { ...old, position } : old)),
                          },
                          'Move Workshop player start',
                        ),
                    )}
                  </div>
                ))}
              </details>
              <details>
                <summary>Doorway portal</summary>
                <p>
                  For the two-room example, create exact portal quads at X = 8 and 20. Edges must seal the
                  evaluated opening; invalid portal edges refuse the edit.
                </p>
                <NumberField label="Doorway X" value={portalX} step={1} onCommit={setPortalX} />
                <button
                  onClick={() => {
                    const material = doc.materials.find((m) => m.name === '+exactportal') ?? {
                      id: 'workshop-exactportal',
                      name: '+exactportal',
                      shaderPath: null,
                      color: [0, 1, 1] as Vec3,
                    };
                    void apply(
                      {
                        ...doc,
                        materials: doc.materials.includes(material)
                          ? doc.materials
                          : [...doc.materials, material],
                        workshop: {
                          ...w,
                          portals: [
                            ...w.portals,
                            {
                              id: crypto.randomUUID(),
                              materialId: material.id,
                              points: [
                                [portalX, -2, 0],
                                [portalX, 2, 0],
                                [portalX, 2, 3],
                                [portalX, -2, 3],
                              ],
                            },
                          ],
                        },
                      },
                      'Author exact doorway portal',
                    );
                  }}
                >
                  Add exact doorway portal
                </button>
                {w.portals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      void apply(
                        { ...doc, workshop: { ...w, portals: w.portals.filter((old) => old.id !== p.id) } },
                        'Remove doorway portal',
                      )
                    }
                  >
                    Remove portal {p.id.slice(0, 8)}
                  </button>
                ))}
              </details>
            </fieldset>
          </div>
          <details>
            <summary>Renderer quality</summary>
            <RendererQuality projectId={projectId} />
          </details>
          <details
            className="bsp-diagnostics"
            open={!!error || !!props.report?.issues.some((i) => i.severity === 'error')}
          >
            <summary>
              Diagnostics · {busy ? 'checking' : props.report?.valid ? 'source valid' : 'pending'}
            </summary>
            {error && <Notice>{error}</Notice>}
            {props.report?.issues.map((i, k) => (
              <button key={k} onClick={() => i.brushIds[0] && setSelection({ brushId: i.brushIds[0] })}>
                {i.severity}: {i.code} · {i.message}
              </button>
            ))}
            <p>
              Native Tool remains authoritative for compiled clusters, PVS, collision and lightmaps. Compiler
              output stays in Build tools. No existing map metadata is transplanted by these source
              operations.
            </p>
          </details>
        </aside>
      </div>
      <footer title={materialPreview.status}>
        {w.brushes.length} editable volumes · {w.portals.length} authored portals ·{' '}
        {props.report?.triangles ?? 0} generated triangles
        <span>
          X <i className="gs-axis-x">■</i> Y <i className="gs-axis-y">■</i> Z <i className="gs-axis-z">■</i> ·
          Z up · native compilation required
        </span>
      </footer>
    </section>
  );
}

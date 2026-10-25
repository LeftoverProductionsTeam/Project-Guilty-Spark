import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  FlyControls,
  TransformControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  Box,
  Copy,
  Eye,
  EyeOff,
  Focus,
  Grid2X2,
  Move3D,
  Rotate3D,
  Scaling,
  Search,
  Trash2,
} from 'lucide-react';
import type { MapInspection, MeshData, Project, SceneObject, Vec3 } from '../types';
import { formatNumber, replaceVector } from '../editor';
import { IconButton, Notice, NumberField, Pill } from './ui';

class ViewportBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h2>3D graphics unavailable</h2>
        <p>
          The graphics context could not start. Update your graphics driver or reopen this workspace. Map and
          tag inspection remain available.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Mesh({
  data,
  wireframe = false,
  color = '#526e79',
}: {
  data: MeshData;
  wireframe?: boolean;
  color?: string;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    g.setIndex(data.indices);
    g.computeVertexNormals();
    return g;
  }, [data]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        roughness={0.85}
        metalness={0.1}
        wireframe={wireframe}
        transparent={wireframe}
        opacity={wireframe ? 0.65 : 1}
      />
    </mesh>
  );
}
const colors: Record<string, string> = {
  'Player spawn': '#8fe1bc',
  Biped: '#f1b073',
  Vehicle: '#81b5e8',
  Weapon: '#d9be76',
  Scenery: '#7d9bb4',
  Equipment: '#ba9eda',
  'Workshop mesh': '#62b9c8',
};
function ObjectVisual({
  object,
  asset,
  selected,
  size,
  wireframe,
}: {
  object: SceneObject;
  asset?: MeshData;
  selected: boolean;
  size: number;
  wireframe: boolean;
}) {
  if (asset) return <Mesh data={asset} color={selected ? '#82ded0' : '#7098ab'} wireframe={wireframe} />;
  return (
    <>
      <mesh>
        <octahedronGeometry args={[size, 0]} />
        <meshBasicMaterial
          color={selected ? '#ceffef' : (colors[object.kind] ?? '#93a7b9')}
          wireframe={!selected}
        />
      </mesh>
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 1.8, size * 0.035, 6, 32]} />
          <meshBasicMaterial color="#72e3c0" />
        </mesh>
      )}
    </>
  );
}
function FrameCamera({
  mesh,
  objects,
  frame,
}: {
  mesh: MeshData | null;
  objects: SceneObject[];
  frame: number;
}) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const box = new THREE.Box3();
    if (mesh?.positions.length) {
      const p = mesh.positions;
      for (const index of mesh.indices) {
        const i = index * 3;
        box.expandByPoint(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
      }
    } else {
      for (const o of objects) box.expandByPoint(new THREE.Vector3(...o.position));
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 10, 10));
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 5);
    camera.up.set(0, 0, 1);
    camera.position.copy(center).add(new THREE.Vector3(size * 0.7, -size * 0.85, size * 0.65));
    camera.lookAt(center);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(0.1, 600 / size);
      camera.updateProjectionMatrix();
    }
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
    orbit?.target?.copy(center);
    orbit?.update?.();
  }, [camera, controls, mesh, frame]);
  return null;
}
function Scene({
  project,
  inspection,
  assetMeshes,
  selected,
  setSelected,
  onTransform,
  mode,
  snap,
  grid,
  wireframe,
  ortho,
  fly,
  frame,
}: {
  project: Project;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  selected: string | null;
  setSelected: (s: string | null) => void;
  onTransform: (o: SceneObject) => void;
  mode: 'translate' | 'rotate' | 'scale';
  snap: boolean;
  grid: boolean;
  wireframe: boolean;
  ortho: boolean;
  fly: boolean;
  frame: number;
}) {
  const group = useRef<THREE.Group>(null);
  const chosen = project.scene.find((o) => o.id === selected);
  const all = project.scene.filter((o) => o.visible);
  const markerSize = inspection ? 0.22 : 0.15;
  return (
    <>
      {ortho ? (
        <OrthographicCamera
          makeDefault
          position={[10, -10, 10]}
          near={0.01}
          far={100000}
          up={[0, 0, 1]}
          zoom={30}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          position={[10, -10, 10]}
          near={0.05}
          far={100000}
          up={[0, 0, 1]}
          fov={55}
        />
      )}
      <ambientLight intensity={1.4} />
      <directionalLight position={[50, -20, 80]} intensity={2.1} />
      <hemisphereLight args={['#b4d9f3', '#19222b', 1.5]} />
      {grid && (
        <gridHelper
          args={[200, 100, '#354854', '#1b2b35']}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.02]}
        />
      )}
      {inspection?.mesh.positions.length ? <Mesh data={inspection.mesh} wireframe={wireframe} /> : null}
      {all
        .filter((o) => o.id !== selected)
        .map((o) => (
          <group
            key={o.id}
            position={o.position}
            rotation={[o.rotation[2], o.rotation[1], o.rotation[0], 'ZYX']}
            scale={o.scale}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(o.id);
            }}
          >
            <ObjectVisual
              object={o}
              asset={o.assetId ? assetMeshes[o.assetId] : undefined}
              selected={false}
              size={markerSize}
              wireframe={wireframe}
            />
          </group>
        ))}
      {chosen?.visible && (
        <TransformControls
          mode={mode}
          enabled={!fly}
          translationSnap={snap ? 0.5 : null}
          rotationSnap={snap ? Math.PI / 12 : null}
          scaleSnap={snap ? 0.1 : null}
          onMouseUp={() => {
            if (group.current) {
              const g = group.current;
              onTransform({
                ...chosen,
                position: g.position.toArray() as Vec3,
                rotation: [g.rotation.z, g.rotation.y, g.rotation.x],
                scale: g.scale.toArray() as Vec3,
              });
            }
          }}
        >
          <group
            ref={group}
            position={chosen.position}
            rotation={[chosen.rotation[2], chosen.rotation[1], chosen.rotation[0], 'ZYX']}
            scale={chosen.scale}
          >
            <ObjectVisual
              object={chosen}
              asset={chosen.assetId ? assetMeshes[chosen.assetId] : undefined}
              selected
              size={markerSize}
              wireframe={wireframe}
            />
          </group>
        </TransformControls>
      )}
      {fly ? (
        <FlyControls movementSpeed={15} rollSpeed={0.4} dragToLook />
      ) : (
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      )}
      <FrameCamera
        mesh={inspection?.mesh ?? Object.values(assetMeshes)[0] ?? null}
        objects={project.scene}
        frame={frame}
      />
    </>
  );
}
export default function World({
  project,
  inspection,
  assetMeshes,
  edit,
  notify,
}: {
  project: Project;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  edit: (p: Project, description: string) => void;
  notify: (m: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [snap, setSnap] = useState(false);
  const [grid, setGrid] = useState(true);
  const [wireframe, setWireframe] = useState(true);
  const [ortho, setOrtho] = useState(false);
  const [fly, setFly] = useState(false);
  const [frame, setFrame] = useState(0);
  const [bsp, setBsp] = useState(0);
  const chosen = project.scene.find((o) => o.id === selected);
  const visibleInspection = useMemo(() => {
    if (!inspection || !inspection.mesh.parts?.length || bsp < 0) return inspection;
    const part = inspection.mesh.parts[bsp];
    return {
      ...inspection,
      mesh: {
        ...inspection.mesh,
        indices: inspection.mesh.indices.slice(part.indexStart, part.indexStart + part.indexCount),
      },
    };
  }, [inspection, bsp]);
  function update(o: SceneObject) {
    edit({ ...project, scene: project.scene.map((s) => (s.id === o.id ? o : s)) }, `Transform ${o.name}`);
  }
  function duplicate() {
    if (!chosen) return;
    const o = {
      ...structuredClone(chosen),
      id: crypto.randomUUID(),
      name: chosen.name + ' copy',
      position: [chosen.position[0] + 1, chosen.position[1], chosen.position[2]] as Vec3,
      sourceOffset: null,
      rotationOffset: null,
    };
    edit({ ...project, scene: [...project.scene, o] }, `Duplicate ${chosen.name} in editor`);
    setSelected(o.id);
    if (!chosen.assetId)
      notify(
        'Duplicated in the project. Exporting additional Halo instances requires a scenario compilation adapter and is currently blocked.',
      );
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches('input,textarea,select') || e.ctrlKey || e.metaKey) return;
      switch (e.key.toLowerCase()) {
        case 'w':
          if (!fly) setMode('translate');
          break;
        case 'e':
          if (!fly) setMode('rotate');
          break;
        case 'r':
          if (!fly) setMode('scale');
          break;
        case 'f':
          setFrame((f) => f + 1);
          break;
        case 'escape':
          setSelected(null);
          break;
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fly]);
  return (
    <div className="world-layout">
      <aside className="panel hierarchy">
        <div className="panel-heading">
          <strong>Scene hierarchy</strong>
          <Pill>{project.scene.length}</Pill>
        </div>
        <div className="panel-search">
          <Search size={14} />
          <input
            placeholder="Find an object…"
            aria-label="Search scene objects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="hierarchy-group">
          <Box size={14} />
          {inspection?.header.name ?? 'Workshop scene'}
        </div>
        <div className="object-list">
          {project.scene
            .filter(
              (o) =>
                o.name.toLowerCase().includes(query.toLowerCase()) ||
                o.kind.toLowerCase().includes(query.toLowerCase()),
            )
            .map((o) => (
              <div className={`object-row ${selected === o.id ? 'selected' : ''}`} key={o.id}>
                <button className="object-name" onClick={() => setSelected(o.id)}>
                  <Box size={13} style={{ color: colors[o.kind] }} />
                  <span>{o.name}</span>
                </button>
                <button
                  className="visibility"
                  aria-label={`${o.visible ? 'Hide' : 'Show'} ${o.name}`}
                  onClick={() =>
                    edit(
                      {
                        ...project,
                        scene: project.scene.map((s) => (s.id === o.id ? { ...s, visible: !s.visible } : s)),
                      },
                      `Toggle visibility: ${o.name}`,
                    )
                  }
                >
                  {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            ))}
        </div>
        <div className="panel-foot">Object markers use actual scenario coordinates.</div>
      </aside>
      <section className="viewport-shell">
        <div className="viewport-toolbar">
          <div className="button-group">
            <IconButton
              label="Translate (W)"
              active={mode === 'translate'}
              onClick={() => setMode('translate')}
            >
              <Move3D size={17} />
            </IconButton>
            <IconButton label="Rotate (E)" active={mode === 'rotate'} onClick={() => setMode('rotate')}>
              <Rotate3D size={17} />
            </IconButton>
            <IconButton label="Scale (R)" active={mode === 'scale'} onClick={() => setMode('scale')}>
              <Scaling size={17} />
            </IconButton>
          </div>
          <span className="toolbar-divider" />
          <button className={snap ? 'small-button active' : 'small-button'} onClick={() => setSnap(!snap)}>
            Snap {snap ? '0.5' : 'off'}
          </button>
          <IconButton label="Toggle grid" active={grid} onClick={() => setGrid(!grid)}>
            <Grid2X2 size={16} />
          </IconButton>
          <span className="toolbar-spacer" />
          <select
            aria-label="Camera projection"
            value={ortho ? 'ortho' : 'perspective'}
            onChange={(e) => setOrtho(e.target.value === 'ortho')}
          >
            <option value="perspective">Perspective</option>
            <option value="ortho">Orthographic</option>
          </select>
          <button className={fly ? 'small-button active' : 'small-button'} onClick={() => setFly(!fly)}>
            Free fly
          </button>
          <button
            className={wireframe ? 'small-button active' : 'small-button'}
            onClick={() => setWireframe(!wireframe)}
          >
            Wireframe
          </button>
          <IconButton label="Frame scene (F)" onClick={() => setFrame((f) => f + 1)}>
            <Focus size={17} />
          </IconButton>
        </div>
        <div className="viewport" data-testid="viewport">
          <ViewportBoundary>
            <Suspense fallback={<div className="loading">Preparing geometry…</div>}>
              <Canvas
                dpr={[1, 1.75]}
                gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
                onPointerMissed={() => setSelected(null)}
              >
                <color attach="background" args={['#101820']} />
                <Scene
                  {...{
                    project,
                    assetMeshes,
                    selected,
                    setSelected,
                    mode,
                    snap,
                    grid,
                    wireframe,
                    ortho,
                    fly,
                    frame,
                  }}
                  inspection={visibleInspection}
                  onTransform={update}
                />
              </Canvas>
            </Suspense>
          </ViewportBoundary>
          <div className="viewport-label">
            <span className="live-dot" />
            {inspection?.mesh.positions.length
              ? 'Imported BSP · collision geometry'
              : project.assets.length
                ? 'Imported workshop geometry'
                : 'Empty project scene'}
          </div>
          {!!inspection?.mesh.parts?.length && (
            <select
              className="bsp-control"
              aria-label="Visible BSP"
              value={bsp}
              onChange={(e) => setBsp(Number(e.target.value))}
            >
              {inspection.mesh.parts.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
              <option value={-1}>All BSPs</option>
            </select>
          )}
          <div className="axis-hint">
            <span>X</span>
            <span>Y</span>
            <span>Z ↑</span>
          </div>
          <div className="viewport-help">
            {fly
              ? 'Drag to look · WASD move · R/F rise/fall · Q/E roll'
              : 'Drag to orbit · right-drag to pan · scroll to zoom · F frame scene'}
          </div>
        </div>
        <div className="viewport-status">
          <span>{formatNumber((visibleInspection?.mesh.indices.length ?? 0) / 3)} BSP triangles</span>
          <span>{project.scene.length} objects</span>
          <span>Halo coordinates · Z up</span>
          <Pill tone="blue">Editor preview</Pill>
        </div>
      </section>
      <aside className="panel inspector">
        <div className="panel-heading">
          <strong>Inspector</strong>
          {chosen && <Pill>{chosen.kind}</Pill>}
        </div>
        {chosen ? (
          <div className="inspector-body">
            <label className="field-label">
              Object name
              <input value={chosen.name} onChange={(e) => update({ ...chosen, name: e.target.value })} />
            </label>
            <div className="inspector-section">
              <div className="section-label">Transform</div>
              {(['position', 'rotation', 'scale'] as const).map((property) => (
                <div className="transform-field" key={property}>
                  <label>
                    {property === 'rotation'
                      ? 'Yaw / pitch / roll'
                      : property[0].toUpperCase() + property.slice(1)}
                    {property === 'rotation' && <small>degrees</small>}
                  </label>
                  <div className="vector-inputs">
                    {chosen[property].map((value, i) => (
                      <div key={i}>
                        <span className={`axis-${i}`}>
                          {property === 'rotation' ? ['Y', 'P', 'R'][i] : ['X', 'Y', 'Z'][i]}
                        </span>
                        <NumberField
                          value={
                            property === 'rotation' ? Number(((value * 180) / Math.PI).toFixed(3)) : value
                          }
                          label={`${property} ${i}`}
                          min={property === 'scale' ? 0.001 : -1e6}
                          onCommit={(v) => {
                            try {
                              update({
                                ...chosen,
                                [property]: replaceVector(
                                  chosen[property],
                                  i,
                                  property === 'rotation' ? (v * Math.PI) / 180 : v,
                                ),
                              });
                            } catch (e) {
                              notify(String(e));
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {chosen.sourceOffset !== null && (
              <Notice>
                Position and rotation can be rebuilt through Invader. Per-instance scale and new Halo
                instances are editor-only.
              </Notice>
            )}
            <div className="inspector-actions">
              <button onClick={duplicate}>
                <Copy size={14} />
                Duplicate
              </button>
              <button
                onClick={() => {
                  edit(
                    { ...project, scene: project.scene.filter((o) => o.id !== chosen.id) },
                    `Remove ${chosen.name} from editor`,
                  );
                  setSelected(null);
                }}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>
            <div className="subtle">
              Source object ID <code>{chosen.id}</code>
            </div>
          </div>
        ) : (
          <div className="inspector-placeholder">
            <Move3D size={26} />
            <p>Select an object in the scene or hierarchy to edit its transform.</p>
            <small>W · translate &nbsp; E · rotate &nbsp; R · scale</small>
          </div>
        )}
      </aside>
    </div>
  );
}

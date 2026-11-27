import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { boxBrush, rampBrush, worldVertex } from '../bspWorkshop';
import { exportMeshObj } from '../haloObj';
import { exportMeshJms } from '../haloJms';
import { plowMesh, type PlowProfile } from '../plowMesh';
import { downloadLocalBlob, downloadLocalText } from '../exportHelpers';
import type { MeshData, Vec3 } from '../types';
import { NumberField } from './ui';
import { useWorkspaceActivity } from './WorkspaceActivity';

const atlasSize = 512;
const paintHistoryLimit = 8;
const shapeLabels = { plow: 'Plow blade', box: 'Box', wedge: 'Wedge' } as const;
type Shape = keyof typeof shapeLabels;

function shapeMesh(shape: Exclude<Shape, 'plow'>, dimensions: Vec3): MeshData {
  const [depth, width, height] = dimensions;
  const low: Vec3 = [-depth / 2, -width / 2, 0];
  const high: Vec3 = [depth / 2, width / 2, height];
  const material = 'painted_part';
  const brush = shape === 'wedge' ? rampBrush('part', low, high, material) : boxBrush('part', 'solid', low, high, material);

  const mesh: MeshData = { positions: [], indices: [], uvs: [], source: 'Spark shape', label: shapeLabels[shape] };
  const padding = 0.025;
  brush.faces.forEach((face, index) => {
    const points = face.vertices.map(id => new THREE.Vector3(...worldVertex(brush, brush.vertices[id])));
    const origin = points[0];
    const tangent = points[1].clone().sub(origin).normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, points[2].clone().sub(origin)).normalize();
    const bitangent = normal.clone().cross(tangent);
    const planar = points.map(point => {
      const relative = point.clone().sub(origin);
      return new THREE.Vector2(relative.dot(tangent), relative.dot(bitangent));
    });
    const bounds = new THREE.Box2().setFromPoints(planar);
    const extent = bounds.getSize(new THREE.Vector2());
    const base = mesh.positions.length / 3;
    points.forEach((point, vertex) => {
      mesh.positions.push(...point.toArray());
      const x = (planar[vertex].x - bounds.min.x) / extent.x;
      const y = (planar[vertex].y - bounds.min.y) / extent.y;
      mesh.uvs!.push((index % 3 + padding + x * (1 - 2 * padding)) / 3,
        (Math.floor(index / 3) + padding + y * (1 - 2 * padding)) / 2);
    });
    // The brush constructors return convex faces with outward winding.
    for (let next = 1; next + 1 < points.length; next++) mesh.indices.push(base, base + next, base + next + 1);
  });
  mesh.parts = [{ name: material, indexStart: 0, indexCount: mesh.indices.length }];
  return mesh;
}

function PaintablePart({ mesh, texture, painting, onPaint }: {
  mesh: MeshData;
  texture: THREE.CanvasTexture;
  painting: boolean;
  onPaint: (uv: THREE.Vector2, start: boolean) => void;
}) {
  const invalidate = useThree(state => state.invalidate);
  const stroke = useRef<number | null>(null);
  useEffect(() => {
    const release = () => { stroke.current = null; };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
  }, []);
  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs!, 2));
    geometry.setIndex(mesh.indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const paint = (event: ThreeEvent<PointerEvent>, start: boolean) => {
    if (!painting || !event.uv || (start ? event.button !== 0 : (event.buttons & 1) === 0)) return;
    if (start) stroke.current = event.pointerId;
    if (stroke.current !== event.pointerId) return;
    event.stopPropagation();
    onPaint(event.uv, start);
    invalidate();
  };
  return <mesh geometry={geometry} onPointerDown={event => paint(event, true)} onPointerMove={event => paint(event, false)}>
    <meshStandardMaterial map={texture} roughness={0.72} metalness={0.24} />
  </mesh>;
}

export default function MeshPartEditor({ selectedMesh, visible }: { selectedMesh?: MeshData; visible: boolean }) {
  const activity = useWorkspaceActivity();
  const [shape, setShape] = useState<Shape | 'selected'>('plow');
  const [size, setSize] = useState<Vec3>([0.22, 2.5, 0.72]);
  const [scoop, setScoop] = useState(80);
  const [wrap, setWrap] = useState(0);
  const [profile, setProfile] = useState<PlowProfile>('moldboard');
  const [painting, setPainting] = useState(false);
  const [color, setColor] = useState('#701b17');
  const [radius, setRadius] = useState(18);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const selectedHasUv = !!selectedMesh?.uvs && selectedMesh.uvs.length * 3 === selectedMesh.positions.length * 2 &&
    selectedMesh.uvs.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
  const form = shape === 'selected' && !selectedHasUv ? 'plow' : shape;
  const mesh = useMemo(() => {
    if (form === 'selected') return selectedMesh!;
    return form === 'plow' ? plowMesh(size, scoop, wrap, profile) : shapeMesh(form, size);
  }, [form, selectedMesh, size, scoop, wrap, profile]);
  const canvas = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = atlasSize;
    canvas.height = atlasSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#62666a';
    ctx.fillRect(0, 0, atlasSize, atlasSize);
    return canvas;
  }, [form, form === 'selected' ? selectedMesh : null]);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const texture = useMemo(() => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const history = useRef<ImageData[]>([]);
  const lastStamp = useRef<{ x: number; y: number; chart: number } | null>(null);
  useEffect(() => { history.current = []; setRevision(0); }, [canvas]);

  function stamp(uv: THREE.Vector2, start: boolean) {
    if (start) {
      history.current.push(ctx.getImageData(0, 0, atlasSize, atlasSize));
      if (history.current.length > paintHistoryLimit) history.current.shift();
      setRevision(value => value + 1);
    }
    const x = uv.x * atlasSize;
    const y = (1 - uv.y) * atlasSize;
    // Procedural shapes have six known UV islands. Never draw a connecting
    // line across those islands or across an unknown seam on an imported OBJ.
    const chart = form === 'selected' ? -1 : Math.floor(uv.x * 3) + 3 * Math.floor(uv.y * 2);
    const previous = start ? null : lastStamp.current;
    const interpolate = previous && chart >= 0 && previous.chart === chart;
    const length = interpolate ? Math.hypot(x - previous.x, y - previous.y) : 0;
    const steps = Math.min(128, Math.max(1, Math.ceil(length / (radius * 0.45))));
    for (let step = 1; step <= steps; step++) {
      const cx = interpolate ? previous.x + (x - previous.x) * step / steps : x;
      const cy = interpolate ? previous.y + (y - previous.y) * step / steps : y;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, color + 'd9');
      gradient.addColorStop(0.5, color + '8c');
      gradient.addColorStop(1, color + '00');
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    lastStamp.current = { x, y, chart };
    texture.needsUpdate = true;
  }

  function exportPart(format: 'obj' | 'jms' | 'png') {
    const name = form === 'selected' ? 'painted_part' : form === 'plow' ? 'plow_steel' : 'painted_shape';
    try {
      if (format === 'png') {
        canvas.toBlob(blob => {
          if (!blob) { setMessage('The paint image could not be saved.'); return; }
          downloadLocalBlob(name + '.png', blob);
          setMessage('Paint exported as a 512 × 512 texture.');
        });
      } else {
        const text = format === 'obj' ? exportMeshObj(mesh, name).text : exportMeshJms(mesh, 'model').text;
        downloadLocalText(name + '.' + format, text);
        setMessage('Shape source exported with its paint UVs.');
      }
    } catch (error) { setMessage(String(error)); }
  }

  return <section className="asset-part-editor" aria-label="Shape and paint" hidden={!visible}>
    <div className="asset-part-viewport">
      {visible && activity.active && activity.graphicsResident && <Canvas frameloop="demand" camera={{ position: [3.4, -4, 2.5], up: [0, 0, 1], fov: 42 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#101c2a']} />
        <ambientLight intensity={1.35} />
        <directionalLight position={[4, -2, 6]} intensity={2} />
        <Bounds fit clip observe margin={1.35}><PaintablePart mesh={mesh} texture={texture} painting={painting} onPaint={stamp}/></Bounds>
        <OrbitControls makeDefault enabled={!painting} />
      </Canvas>}
    </div>
    <div className="asset-part-controls">
      <label>Mesh <select value={form} onChange={event => setShape(event.target.value as typeof shape)}>
        {Object.entries(shapeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        {selectedHasUv && <option value="selected">Selected OBJ</option>}
      </select></label>
      {form !== 'selected' && <div className="asset-part-dimensions">
        {['Depth', 'Width', 'Height'].map((label, axis) => <label key={label}>{label}
          <NumberField label={label} value={size[axis]} min={0.05} max={32} step={0.05}
            onCommit={value => setSize(previous => previous.map((old, index) => index === axis ? value : old) as Vec3)} />
        </label>)}
      </div>}
      {form === 'plow' && <div className="asset-part-dimensions">
        <label>Blade profile <select value={profile} onChange={event => setProfile(event.target.value as PlowProfile)}>
          <option value="moldboard">Road plow</option>
          <option value="rounded">Rounded wings</option>
          <option value="v">V-plow</option>
        </select></label>
        <label>Blade curl (%)
          <NumberField label="Blade curl (%)" value={scoop} min={0} max={100} step={1} onCommit={setScoop} />
        </label>
        <label>Wing sweep (%)
          <NumberField label="Wing sweep (%)" value={wrap} min={0} max={100} step={1} onCommit={setWrap} />
        </label>
      </div>}
      <div className="button-row">
        <button type="button" aria-pressed={!painting} onClick={() => setPainting(false)}>Orbit</button>
        <button type="button" aria-pressed={painting} onClick={() => setPainting(true)}>Paint mesh</button>
        <button type="button" disabled={revision === 0 || !history.current.length} onClick={() => {
          const previous = history.current.pop();
          if (previous) { ctx.putImageData(previous, 0, 0); texture.needsUpdate = true; setRevision(value => value - 1); }
        }}>Undo paint</button>
      </div>
      {painting && <div className="button-row">
        <label>Color <input aria-label="Paint color" type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
        <label>Brush size <input aria-label="Brush size" type="range" min="3" max="60" value={radius} onChange={event => setRadius(Number(event.target.value))} /></label>
      </div>}
      <div className="button-row">
        <button type="button" onClick={() => exportPart('obj')}>Export OBJ</button>
        <button type="button" onClick={() => exportPart('jms')}>Export JMS</button>
        <button type="button" onClick={() => exportPart('png')}>Export paint PNG</button>
      </div>
      <small>Export the part and paint before leaving this tool. A moving vehicle part also needs the vehicle’s native model and collision to be rebuilt.</small>
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
}

import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Edges,
  Html,
  OrbitControls,
  PerspectiveCamera,
  PointerLockControls,
  TransformControls,
} from '@react-three/drei';
import * as THREE from 'three';
import type { ForgeBrush, ForgeMesh, ForgeNode, QuickForgeDocument } from '../forge';
import { forgeNodes, nodeRotation, transformForgeNode } from '../forge';
import { hillAreas, raceCoursePoints, teleporterLinks } from '../haloGametypeScenario';
import type { SpawnZone } from '../firefight';
import type { Vec3 } from '../types';
import { environmentValue, sunlightPosition, toHex } from '../environment';
import { ViewportBoundary } from './World';
import RightMouseFly from './RightMouseFly';
import { createSourceCollisionWorld, resolveSourceBody, stepSourceWalk, WALK_EYE_HEIGHT } from '../liveCollision';
import type { WalkState } from '../liveCollision';
import type { WrlDiagnostics } from '../haloWrl';

export interface ForgeSnapshot {
  mesh: ForgeMesh;
  document: QuickForgeDocument;
}
export type ForgeCamera = 'orbit' | 'fly' | 'walk';
export interface ForgeViewportProps {
  document: QuickForgeDocument;
  snapshot: ForgeSnapshot | null;
  selected: string[];
  onSelect: (id: string | null, additive: boolean) => void;
  onTransform: (nodes: ForgeNode[]) => void;
  mode: 'translate' | 'rotate' | 'scale';
  snap: number;
  grid: boolean;
  wireframe: boolean;
  cutaway: boolean;
  walkCollision: boolean;
  cameraMode: ForgeCamera;
  frame: number;
  errors: Set<string>;
  dropPoint: MutableRefObject<((x: number, y: number) => Vec3 | null) | null>;
  ghost: Vec3 | null;
  /** Source-only, non-colliding visualization of Halo CE King hill flag convex hulls. */
  showHillAreas?: boolean;
  /** Non-colliding source preview of ordered Race routes and teleporter channels. */
  showGameRoutes?: boolean;
  zones: SpawnZone[];
  selectedZone: string | null;
  onZoneSelect: (id: string) => void;
  onZoneMove: (id: string, position: Vec3) => void;
  onError: (message: string) => void;
  wrlOverlay?: WrlDiagnostics | null;
  showWrlOverlay?: boolean;
  focusWrlOverlay?: boolean;
}
function brushGeometry(snapshot: ForgeSnapshot, brush: ForgeBrush, cutaway: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const part = snapshot.mesh.parts.find((p) => p.brushId === brush.id);
  if (!part) return geometry;
  const matrix = new THREE.Matrix4()
    .compose(
      new THREE.Vector3(...brush.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...brush.rotation, 'XYZ')),
      new THREE.Vector3(1, 1, 1),
    )
    .invert();
  const coordinates: number[] = [],
    uvs: number[] = [];
  for (let i = part.indexStart; i < part.indexStart + part.indexCount; i += 3) {
    const triangle = [0, 1, 2].map((n) => {
      const index = snapshot.mesh.indices[i + n];
      return new THREE.Vector3(
        ...(snapshot.mesh.positions.slice(index * 3, index * 3 + 3) as Vec3),
      ).applyMatrix4(matrix);
    });
    if (
      cutaway &&
      brush.kind === 'room' &&
      triangle.every((point) => Math.abs(point.z - brush.dimensions[2] / 2) < 0.001)
    )
      continue;
    triangle.forEach((point, n) => {
      coordinates.push(...point.toArray());
      const index = snapshot.mesh.indices[i + n];
      uvs.push(snapshot.mesh.uvs[index * 2] ?? 0, snapshot.mesh.uvs[index * 2 + 1] ?? 0);
    });
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
function NodeVisual({
  node,
  snapshot,
  document,
  selected,
  wireframe,
  cutaway,
  error,
}: {
  node: ForgeNode;
  snapshot: ForgeSnapshot | null;
  document: QuickForgeDocument;
  selected: boolean;
  wireframe: boolean;
  cutaway: boolean;
  error: boolean;
}) {
  const original = snapshot?.document.geometry.find((b) => b.id === node.value.id);
  const geometry = useMemo(
    () => (original && snapshot ? brushGeometry(snapshot, original, cutaway) : null),
    [original, snapshot, cutaway],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (node.type === 'brush') {
    if (!geometry || !original) return null;
    const material = document.materials.find((m) => m.id === node.value.materialId);
    const color = error
      ? '#e97e72'
      : selected
        ? '#a8e5cf'
        : new THREE.Color(...(material?.color ?? [0.3, 0.48, 0.52]));
    const ratio = node.value.dimensions.map((dimension, i) => dimension / original.dimensions[i]) as Vec3;
    return (
      <mesh geometry={geometry} scale={ratio} userData={{ dropSurface: true, brushId: node.value.id }}>
        <meshStandardMaterial
          color={color}
          roughness={0.86}
          metalness={0.08}
          side={THREE.DoubleSide}
          wireframe={wireframe}
        />
        {selected && <Edges threshold={20} color="#b9ffe1" />}
      </mesh>
    );
  }
  const spawn = node.type === 'spawn',
    objective = node.type === 'objective';
  const color = error
    ? '#ff9d8d'
    : selected
      ? '#d3fff1'
      : spawn
        ? '#80e6ad'
        : objective
          ? ({ctfFlag:'#e5a4c6',hill:'#83f0d6',oddball:'#deb7ff',raceCheckpoint:'#ffd07f',raceVehicle:'#85c9f9',teleportFrom:'#f4a8ef',teleportTo:'#a9dfff'} as Record<string,string>)[node.value.kind] ?? '#dba6ff'
          : '#efcb81';
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.08]}>
        <torusGeometry args={[spawn ? 0.45 : 0.32, 0.035, 6, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, 0, 0.6]}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={color} wireframe={!selected} />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <boxGeometry args={[0.025, 0.025, 0.5]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {spawn && (
        <mesh position={[0.5, 0, 0.08]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.12, 0.35, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
      {selected && (
        <Html center position={[0, 0, 1.1]} style={{ pointerEvents: 'none' }}>
          <span className="forge-world-label">
            {node.value.name || (spawn ? 'Player start' : 'Objective')}
            {node.type === 'placement' && <small>Tag reference · {node.value.tagClass}</small>}
          </span>
        </Html>
      )}
    </group>
  );
}
/** Halo CE King uses 1 marker for a 2x2 area or 3-8 for the XY convex
 * hull. This translucent region is informative only and NEVER participates in
 * source mesh collision, selection, Tool export or runtime game rules. */
function HillRegions({objectives}:{objectives:QuickForgeDocument['objectives']}) {
  const renderAreas = useMemo(() => hillAreas(objectives).filter(area=>area.valid).map(area=>{
    const plane=new THREE.BufferGeometry(), border=new THREE.BufferGeometry();
    const vertices=area.polygon.map(p=>[p[0],p[1],p[2]+0.035] as Vec3);
    plane.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
    const triangles:number[]=[];
    for(let i=1;i+1<vertices.length;i++)triangles.push(0,i,i+1);
    plane.setIndex(triangles);
    plane.computeVertexNormals();
    border.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
    const center=vertices.reduce((sum,p)=>sum.add(new THREE.Vector3(...p)),new THREE.Vector3()).divideScalar(vertices.length);
    return {id:area.usageId,plane,border,center};
  }),[objectives]);
  useEffect(()=>()=>renderAreas.forEach(a=>{a.plane.dispose();a.border.dispose();}),[renderAreas]);
  return <group>
    {renderAreas.map(a=><group key={a.id}>
      <mesh geometry={a.plane} raycast={()=>null} renderOrder={4}>
        <meshBasicMaterial color="#62dbce" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide}/>
      </mesh>
      <lineLoop geometry={a.border} raycast={()=>null} renderOrder={5}>
        <lineBasicMaterial color="#82fce4" depthWrite={false}/>
      </lineLoop>
      <Html center position={[a.center.x,a.center.y,a.center.z+0.45]} style={{pointerEvents:'none'}}>
        <span className="forge-zone-label">King hill {a.id} · source-only</span>
      </Html>
    </group>)}
  </group>;
}
/** Source-only multiplayer editor guides. Never add these non-colliding guide
 * lines to JMS geometry, or treat them as verified runtime vehicle/teleport behavior. */
function NetgameRoutes({objectives}:{objectives:QuickForgeDocument['objectives']}) {
  const lines=useMemo(()=>{
    const result:{id:string;geometry:THREE.BufferGeometry;color:string;label:string;midpoint:Vec3}[]=[];
    const course=raceCoursePoints(objectives);
    if(course.length>=2&&course.length<=32){
      for(let i=0;i<course.length;i++){
        const a=course[i],b=course[(i+1)%course.length];
        const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],a[1],a[2]+0.2),new THREE.Vector3(b[0],b[1],b[2]+0.2)]);
        result.push({id:`race-${i}`,geometry:geom,color:'#ffd07f',label:`Race ${i} → ${(i+1)%course.length}`,midpoint:[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2+0.3]});
      }
    }
    for(const [i,link] of teleporterLinks(objectives).entries()){
      const a=link.start,b=link.end;
      const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],a[1],a[2]+0.3),new THREE.Vector3(b[0],b[1],b[2]+0.3)]);
      result.push({id:`tele-${i}`,geometry:geom,color:'#d09fff',label:`Teleporter channel ${link.channel}`,midpoint:[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2+0.4]});
    }
    return result;
  },[objectives]);
  useEffect(()=>()=>lines.forEach(line=>line.geometry.dispose()),[lines]);
  return <group>
    {lines.map(line=><group key={line.id}>
      <lineSegments geometry={line.geometry} raycast={()=>null} renderOrder={6}>
        <lineBasicMaterial color={line.color} depthTest={false} transparent opacity={0.8} depthWrite={false}/>
      </lineSegments>
      <Html center position={line.midpoint} style={{pointerEvents:'none'}}>
        <span className="forge-zone-label">{line.label} · source guide</span>
      </Html>
    </group>)}
  </group>;
}
function CameraFrame({ document, frame, mode, diagnosticBounds }: { document: QuickForgeDocument; frame: number; mode: ForgeCamera; diagnosticBounds?: WrlDiagnostics['bounds'] | null }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (mode === 'walk') { const start = document.spawns[0]; camera.up.set(0, 0, 1); camera.position.set(...(start?.position ?? [0, 0, 0])); camera.position.z += 1.6; camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.cos(start?.facing ?? 0), Math.sin(start?.facing ?? 0), 0))); return; }
    const bounds = new THREE.Box3();
    if (diagnosticBounds) {
      bounds.expandByPoint(new THREE.Vector3(...diagnosticBounds.min));
      bounds.expandByPoint(new THREE.Vector3(...diagnosticBounds.max));
    }
    for (const brush of (diagnosticBounds ? [] : document.geometry)) {
      const p = new THREE.Vector3(...brush.position),
        half = new THREE.Vector3(...brush.dimensions).multiplyScalar(0.5);
      bounds.expandByPoint(p.clone().add(half));
      bounds.expandByPoint(p.clone().sub(half));
    }
    if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(16, 20, 6));
    const center = bounds.getCenter(new THREE.Vector3()),
      size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), 8);
    camera.up.set(0, 0, 1);
    camera.position.copy(center).add(new THREE.Vector3(size * 0.72, -size * 0.85, size * 0.72));
    camera.lookAt(center);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
    orbit?.target?.copy(center);
    orbit?.update?.();
  }, [frame, camera, controls, mode, diagnosticBounds]);
  return null;
}
/** Overlay a local Halo Tool diagnostic WRL without making it selectable,
 * a drop surface, or a source mesh. Colors are supplied by Tool's VRML file.
 */
function WrlErrorOverlay({ diagnostics }: {diagnostics: WrlDiagnostics}) {
  const geometry = useMemo(() => {
    const linePosition: number[] = [], lineColor: number[] = [];
    const facePosition: number[] = [], faceColor: number[] = [];
    const segment = (a: Vec3, b: Vec3, color: Vec3) => {
      linePosition.push(...a, ...b);
      lineColor.push(...color, ...color);
    };
    for (const s of diagnostics.segments) segment(s.start,s.end,s.color);
    for (const f of diagnostics.faces) {
      facePosition.push(...f.a,...f.b,...f.c);
      faceColor.push(...f.color,...f.color,...f.color);
      segment(f.a,f.b,f.color);segment(f.b,f.c,f.color);segment(f.c,f.a,f.color);
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position',new THREE.Float32BufferAttribute(linePosition,3));
    lines.setAttribute('color',new THREE.Float32BufferAttribute(lineColor,3));
    const faces = new THREE.BufferGeometry();
    faces.setAttribute('position',new THREE.Float32BufferAttribute(facePosition,3));
    faces.setAttribute('color',new THREE.Float32BufferAttribute(faceColor,3));
    return {lines,faces};
  }, [diagnostics]);
  useEffect(() => () => {geometry.lines.dispose();geometry.faces.dispose();}, [geometry]);
  return <group>
    <lineSegments geometry={geometry.lines} renderOrder={100} raycast={() => null}>
      <lineBasicMaterial vertexColors depthTest={false} depthWrite={false} transparent opacity={0.95} />
    </lineSegments>
    <mesh geometry={geometry.faces} renderOrder={99} raycast={() => null}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} depthTest={false} depthWrite={false} transparent opacity={0.25} />
    </mesh>
  </group>;
}

/** First-person, edit-time source-mesh walk sandbox. No live Halo hooks. */
function WalkCamera({ document: doc, snapshot, collisionEnabled, onError }: {
  document: QuickForgeDocument;
  snapshot: ForgeSnapshot | null;
  collisionEnabled: boolean;
  onError: (message: string) => void;
}) {
  const { camera } = useThree();
  // Avoid retriggering collider re-projection/diagnostics when the parent
  // supplies a new notification callback after a render.
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const keys = useRef(new Set<string>());
  const start = doc.spawns[0]?.position ?? [0, 0, 0];
  const state = useRef<WalkState>({ feet: [...start] as Vec3, grounded: false, verticalSpeed: 0, contacts: 0 });
  const collider = useMemo(() => {
    if (!snapshot || !collisionEnabled) return { world: null, error: '' };
    try { return { world: createSourceCollisionWorld(snapshot.mesh), error: '' }; }
    catch (error) { return { world: null, error: String(error) }; }
  }, [snapshot, collisionEnabled]);
  useEffect(() => {
    if (collider.error) errorHandler.current(`Walk preview collision unavailable: ${collider.error}`);
    if (collider.world) {
      const repaired = resolveSourceBody(collider.world, state.current.feet);
      state.current = { ...state.current, ...repaired };
    }
  }, [collider]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (document.pointerLockElement) {
        if (['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(event.code)) event.preventDefault();
        keys.current.add(event.code);
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);
  useFrame((_, delta) => {
    if (!document.pointerLockElement || delta <= 0) return;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.z = 0;
    if (forward.lengthSq() < 1e-7) forward.set(1, 0, 0);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 0, 1)).normalize();
    const input = new THREE.Vector3();
    if (keys.current.has('KeyW')) input.add(forward);
    if (keys.current.has('KeyS')) input.sub(forward);
    if (keys.current.has('KeyD')) input.add(right);
    if (keys.current.has('KeyA')) input.sub(right);
    if (input.lengthSq() > 0) input.normalize();
    const speed = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight') ? 9 : 5;
    const velocity = input.multiplyScalar(speed).toArray() as Vec3;
    const dt = Math.min(delta, 0.05);
    if (collider.world) {
      state.current = stepSourceWalk(collider.world, state.current, velocity, dt);
    } else {
      // Clearly identified no-collision source preview fallback, not game physics.
      state.current = { ...state.current, feet: state.current.feet.map((v, i) => v + velocity[i] * dt) as Vec3 };
    }
    camera.position.set(state.current.feet[0],state.current.feet[1],state.current.feet[2]+WALK_EYE_HEIGHT);
  });
  return <PointerLockControls selector=".forge-enter-walk" />;
}

function ForgeScene(props: ForgeViewportProps) {
  const {
    document: doc,
    snapshot,
    selected,
    onSelect,
    onTransform,
    mode,
    snap,
    cutaway,
    wireframe,
    cameraMode,
    errors,
    ghost,
  } = props;
  const { camera, gl, scene } = useThree();
  const group = useRef<THREE.Group>(null);
  const zoneGroup = useRef<THREE.Group>(null);
  const nodes = forgeNodes(doc).filter((node) => node.value.visible);
  const chosen = nodes.filter((node) => selected.includes(node.value.id) && !node.value.locked);
  const origin = chosen
    .reduce((point, node) => point.add(new THREE.Vector3(...node.value.position)), new THREE.Vector3())
    .divideScalar(chosen.length || 1);
  const base = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...(chosen.length === 1 ? nodeRotation(chosen[0]) : ([0, 0, 0] as Vec3)), 'XYZ'),
  );
  const baseRotation = new THREE.Euler().setFromQuaternion(base, 'XYZ');
  useEffect(() => {
    props.dropPoint.current = (x, y) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      const hit = ray
        .intersectObjects(scene.children, true)
        .find((result) => result.object.userData.dropSurface);
      if (hit) return hit.point.toArray() as Vec3;
      const target = new THREE.Vector3();
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), target)
        ? (target.toArray() as Vec3)
        : null;
    };
    return () => {
      props.dropPoint.current = null;
    };
  }, [camera, gl, scene, props.dropPoint]);
  function visual(node: ForgeNode, anchored = false) {
    const pos = new THREE.Vector3(...node.value.position),
      rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nodeRotation(node), 'XYZ'));
    if (anchored) {
      pos.sub(origin).applyQuaternion(base.clone().invert());
      rotation.premultiply(base.clone().invert());
    }
    const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
    return (
      <group
        key={node.value.id}
        position={pos}
        rotation={euler}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.value.id, event.shiftKey || event.ctrlKey || event.metaKey);
        }}
      >
        <NodeVisual
          node={node}
          document={doc}
          snapshot={snapshot}
          selected={selected.includes(node.value.id)}
          wireframe={wireframe}
          cutaway={cutaway}
          error={errors.has(node.value.id)}
        />
      </group>
    );
  }
  const transformable =
    cameraMode === 'orbit' &&
    chosen.length > 0 &&
    (mode !== 'scale' || (chosen.length === 1 && chosen[0].type === 'brush'));
  return (
    <>
      <PerspectiveCamera
        makeDefault
        up={[0, 0, 1]}
        near={0.03}
        far={20000}
        fov={55}
        position={[25, -30, 25]}
      />
      {(() => {
        const env = environmentValue(doc.environment);
        return env.previewEnabled ? <>
          <ambientLight color={toHex(env.ambientColor)} intensity={env.ambientIntensity} />
          <directionalLight color={toHex(env.sunColor)} position={sunlightPosition(env)} intensity={env.sunIntensity} />
          <color attach="background" args={[toHex(env.skyColor)]} />
          {env.fogEnabled && <fog attach="fog" args={[toHex(env.fogColor), env.fogNear, env.fogFar]} />}
        </> : <>
          <ambientLight intensity={0.75} />
          <hemisphereLight args={['#c2e2ff', '#14252b', 1.5]} />
          <directionalLight position={[30, -20, 50]} intensity={2.2} />
          <color attach="background" args={['#0d1922']} />
        </>;
      })()}
      {props.grid && (
        <gridHelper
          args={[200, 200, '#55747b', '#24434c']}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, 0.025]}
        />
      )}
      {props.showHillAreas && <HillRegions objectives={doc.objectives} />}
      {props.showGameRoutes && <NetgameRoutes objectives={doc.objectives} />}
      {nodes.filter((node) => !chosen.includes(node)).map((node) => visual(node))}
      {chosen.length > 0 && (
        <TransformControls
          mode={mode}
          enabled={transformable}
          space={chosen.length === 1 ? 'local' : 'world'}
          showX={mode !== 'rotate' || chosen.every((n) => n.type === 'brush' || n.type === 'placement')}
          showY={mode !== 'rotate' || chosen.every((n) => n.type === 'brush' || n.type === 'placement')}
          translationSnap={snap || null}
          rotationSnap={snap ? Math.PI / 12 : null}
          scaleSnap={snap ? 0.1 : null}
          onMouseUp={() => {
            if (!group.current) return;
            try {
            const target = group.current;
            target.updateMatrix();
            const deltaRotation = target.quaternion.clone().multiply(base.clone().invert());
            const changed = chosen.map((node) => {
              const position = new THREE.Vector3(...node.value.position)
                .sub(origin)
                .applyQuaternion(base.clone().invert())
                .applyMatrix4(target.matrix)
                .toArray() as Vec3;
              const rotation = new THREE.Euler().setFromQuaternion(
                new THREE.Quaternion()
                  .setFromEuler(new THREE.Euler(...nodeRotation(node), 'XYZ'))
                  .premultiply(deltaRotation),
                'XYZ',
              );
              return transformForgeNode(
                node,
                position,
                [rotation.x, rotation.y, rotation.z],
                chosen.length === 1 ? (target.scale.toArray() as Vec3) : [1, 1, 1],
              );
            });
            onTransform(changed);
            target.scale.set(1, 1, 1);
            } catch (error) { props.onError(String(error)); group.current.position.copy(origin); group.current.rotation.copy(baseRotation); group.current.scale.set(1, 1, 1); }
          }}
        >
          <group ref={group} position={origin} rotation={baseRotation}>
            {chosen.map((node) => visual(node, true))}
          </group>
        </TransformControls>
      )}
      {props.zones
        .filter((zone) => zone.enabled)
        .map((zone) => {
          const visual = <group onClick={(event) => { event.stopPropagation(); props.onZoneSelect(zone.id); }}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[zone.radius, 0.04, 6, 48]} />
              <meshBasicMaterial color="#e2a374" />
            </mesh>
            <Html center position={[0, 0, 0.6]} style={{ pointerEvents: 'none' }}>
              <span className="forge-zone-label">AI zone · {zone.id.slice(0, 8)}</span>
            </Html>
          </group>;
          return zone.id === props.selectedZone ? <TransformControls key={zone.id} mode="translate" enabled={cameraMode === 'orbit'} translationSnap={snap || null} onMouseUp={() => { if (zoneGroup.current) props.onZoneMove(zone.id, zoneGroup.current.position.toArray() as Vec3); }}><group ref={zoneGroup} position={zone.position}>{visual}</group></TransformControls> : <group key={zone.id} position={zone.position}>{visual}</group>;
        })}
      {props.showWrlOverlay && props.wrlOverlay && <WrlErrorOverlay diagnostics={props.wrlOverlay} />}
      {ghost && (
        <group position={ghost}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.4, 0.045, 6, 24]} />
            <meshBasicMaterial color="#baffdf" depthTest={false} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.04, 0.04, 1.2]} />
            <meshBasicMaterial color="#baffdf" depthTest={false} />
          </mesh>
        </group>
      )}
      {cameraMode === 'orbit' ? (
        <OrbitControls makeDefault enableDamping enablePan={false} dampingFactor={0.12} />
      ) : cameraMode === 'fly' ? (
        <RightMouseFly speed={12} />
      ) : (
<WalkCamera document={doc} snapshot={snapshot} collisionEnabled={props.walkCollision} onError={props.onError} />
      )}
      {cameraMode === 'orbit' && <RightMouseFly speed={12} />}
      <CameraFrame document={doc} frame={props.frame} mode={cameraMode} diagnosticBounds={props.focusWrlOverlay ? props.wrlOverlay?.bounds : null} />
    </>
  );
}
export default function ForgeViewport(props: ForgeViewportProps) {
  return (
    <ViewportBoundary>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        onPointerMissed={(event) => {
          if (event.type === 'click' && event.button === 0) props.onSelect(null, false);
        }}
      >
        <Suspense fallback={null}>
          <ForgeScene {...props} />
        </Suspense>
      </Canvas>
    </ViewportBoundary>
  );
}

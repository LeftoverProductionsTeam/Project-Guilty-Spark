import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import TransformControls from './HaloTransformControls';
import { moveWorkshopVertices, workshopPivot } from '../bspWorkshop';
import type { BspBrush, BspTool, WorkshopSelection } from '../bspWorkshop';
import { workshopPartSelection, workshopPickGeometry } from '../bspPicking';
import type { Vec3 } from '../types';

export function BspSourcePicker({
  brushes,
  tool,
  onSelect,
}: {
  brushes: BspBrush[];
  tool: BspTool;
  onSelect: (selection: WorkshopSelection) => void;
}) {
  const { camera, gl } = useThree(),
    surface = useMemo(() => workshopPickGeometry(brushes), [brushes]);
  useEffect(() => () => surface.geometry.dispose(), [surface]);
  return (
    <mesh
      geometry={surface.geometry}
      onClick={(event) => {
        if (event.button !== 0 || event.delta > 5) return;
        event.stopPropagation();
        const hit = surface.hits[event.faceIndex ?? -1];
        if (!hit) return;
        const rect = gl.domElement.getBoundingClientRect();
        onSelect(
          workshopPartSelection(
            hit.brush,
            hit.face,
            tool,
            { x: event.clientX, y: event.clientY },
            (position) => {
              const p = new THREE.Vector3(...position).project(camera);
              return {
                x: rect.left + ((p.x + 1) * rect.width) / 2,
                y: rect.top + ((1 - p.y) * rect.height) / 2,
              };
            },
          ),
        );
      }}
    >
      <meshBasicMaterial side={THREE.DoubleSide} colorWrite={false} depthWrite={false} />
    </mesh>
  );
}

/** Face/edge/vertex movement changes existing brush source. The normal native
 * validation and single transaction remain authoritative when the drag ends. */
export function BspPartGizmo({
  brush,
  vertices,
  snap,
  onChange,
  onDrag,
}: {
  brush: BspBrush;
  vertices: number[];
  snap: number;
  onChange: (brush: BspBrush) => void;
  onDrag: (dragging: boolean) => void;
}) {
  const target = useRef<THREE.Group>(null),
    moving = useRef(false);
  const signature = JSON.stringify([brush, vertices]);
  const pivot = useMemo(
    () => workshopPivot(brush, vertices),
    [signature],
  );
  const [preview, setPreview] = useState<BspBrush | null>(null);
  const surface = useMemo(() => (preview ? workshopPickGeometry([preview]) : null), [preview]);
  useEffect(() => () => surface?.geometry.dispose(), [surface]);
  useEffect(
    () => () => {
      if (moving.current) onDrag(false);
    },
    [],
  );
  const delta = (): Vec3 => target.current!.position.toArray().map((v, k) => v - pivot[k]) as Vec3;
  return (
    <>
      <group ref={target} position={pivot} />
      {surface && (
        <mesh geometry={surface.geometry} raycast={() => {}}>
          <meshBasicMaterial wireframe color="#a3ffe3" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
      <TransformControls
        object={target as React.RefObject<THREE.Object3D>}
        mode="translate"
        space="world"
        translationSnap={snap || null}
        onMouseDown={() => {
          moving.current = true;
          onDrag(true);
        }}
        onObjectChange={() => {
          if (moving.current && target.current) setPreview(moveWorkshopVertices(brush, vertices, delta()));
        }}
        onMouseUp={() => {
          if (!moving.current || !target.current) return;
          const movement = delta();
          moving.current = false;
          setPreview(null);
          // The source remains authoritative even when native validation refuses
          // this edit. Never leave a rejected drag's gizmo at its proposed point.
          target.current.position.fromArray(pivot);
          if (Math.hypot(...movement) > 1e-6) onChange(moveWorkshopVertices(brush, vertices, movement));
          onDrag(false);
        }}
      />
    </>
  );
}

/** Manipulate draft route points in the same snapped world-space controls as brush edits. */
export function BspRouteGizmo({ points, selected, onSelect, snap, enabled, gradeLimit, onChange, onDrag }: {
  points: Vec3[]; selected: number; onSelect: (index: number) => void;
  snap: boolean; enabled: boolean; gradeLimit?: number;
  onChange: (index: number, point: Vec3) => void; onDrag: (dragging: boolean) => void;
}) {
  const [movingPoint, setMovingPoint] = useState<Vec3 | null>(null);
  const group = useRef<THREE.Group>(null);
  const moving = useRef(false);
  const index = Math.min(selected, points.length - 1);
  const pivot = points[index];
  const display = movingPoint ? points.map((point, i) => i === index ? movingPoint : point) : points;
  useEffect(() => () => { if (moving.current) onDrag(false); }, []);
  if (!pivot) return null;
  return <>
    {display.slice(1).map((end, i) => {
      const start = display[i];
      const run = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const excessive = gradeLimit !== undefined && (run < 1e-6 || Math.abs(end[2] - start[2]) > run * gradeLimit);
      return <Line key={i} points={[start,end]} color={excessive ? '#ff617a' : '#9cf8e2'}
        lineWidth={excessive ? 4 : 2} depthTest={false} renderOrder={1001} raycast={() => null} />;
    })}
    {display.map((point, i) => <mesh key={i} position={point} renderOrder={1002}
      onClick={event => { if (enabled && event.button === 0 && event.delta <= 5) { event.stopPropagation(); onSelect(i); }}}>
      <sphereGeometry args={[i === index ? 0.24 : 0.18, 12, 8]} />
      <meshBasicMaterial color={i === index ? '#fff098' : '#66ddc8'} depthTest={false} />
    </mesh>)}
    <group ref={group} position={pivot} />
    <TransformControls object={group as React.RefObject<THREE.Object3D>}
      enabled={enabled} mode='translate' space='world' translationSnap={snap ? 0.5 : null}
      onMouseDown={() => { if (enabled) { moving.current = true; onDrag(true); } }}
      onObjectChange={() => { if (moving.current && group.current) setMovingPoint(group.current.position.toArray() as Vec3); }}
      onMouseUp={() => {
        if (!moving.current || !group.current) return;
        const point = group.current.position.toArray() as Vec3;
        group.current.position.fromArray(pivot);
        moving.current = false;
        setMovingPoint(null);
        onDrag(false);
        if (Math.hypot(...point.map((axis, i) => axis - pivot[i])) > 1e-6) onChange(index, point);
      }} />
  </>;
}

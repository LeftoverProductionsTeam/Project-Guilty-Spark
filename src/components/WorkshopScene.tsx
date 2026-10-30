import TransformControls from './HaloTransformControls';
import { useRef } from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { MeshData, Project, SceneObject, Vec3 } from '../types';
import { Mesh } from './World';
import { NumberField } from './ui';

export function WorkshopObjectFields({
  object,
  update,
  remove,
}: {
  object: SceneObject;
  update: (object: SceneObject) => void;
  remove: () => void;
}) {
  return (
    <div className="viewport-tags">
      <strong>{object.name}</strong>
      <p className="subtle">
        Custom source mesh preview. Compile Halo model/collision and scenario tags before a game build.
      </p>
      {(['position', 'rotation', 'scale'] as const).map((property) => (
        <fieldset key={property}>
          <legend>{property}</legend>
          {object[property].map((value, axis) => (
            <label key={axis}>
              {['X', 'Y', 'Z'][axis]}
              <NumberField
                label={`Custom model ${property} ${axis}`}
                value={value}
                min={property === 'scale' ? 0.001 : -1e6}
                max={1e6}
                onCommit={(next) => {
                  const vector = [...object[property]] as Vec3;
                  vector[axis] = next;
                  update({ ...object, [property]: vector });
                }}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <button onClick={remove}>Remove custom model</button>
    </div>
  );
}
export default function WorkshopScene({
  project,
  meshes,
  selected,
  onSelect,
  onTransform,
  mode,
  snap,
}: {
  project: Project;
  meshes: Record<string, MeshData>;
  selected: string | null;
  onSelect: (id: string) => void;
  onTransform: (object: SceneObject) => void;
  mode: 'translate' | 'rotate' | 'scale';
  snap: number;
}) {
  const group = useRef<THREE.Group>(null),
    chosen = project.scene.find(
      (object) => object.id === selected && object.assetId && meshes[object.assetId],
    );
  const visual = (object: SceneObject) => (
    <Mesh data={meshes[object.assetId!]} color={object.id === selected ? '#a1e6ed' : '#9eacb4'} />
  );
  return (
    <>
      {project.scene
        .filter(
          (object) => object.visible && object.assetId && meshes[object.assetId] && object.id !== selected,
        )
        .map((object) => (
          <group
            userData={{ dropSurface: true }}
            key={object.id}
            position={object.position}
            rotation={[object.rotation[2], object.rotation[1], object.rotation[0], 'ZYX']}
            scale={object.scale}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(object.id);
            }}
          >
            {visual(object)}
          </group>
        ))}
      {chosen && chosen.visible && (
        <>
          <group
            userData={{ dropSurface: true }}
            ref={group}
            position={chosen.position}
            rotation={[chosen.rotation[2], chosen.rotation[1], chosen.rotation[0], 'ZYX']}
            scale={chosen.scale}
          >
            {visual(chosen)}
          </group>
          <TransformControls
            object={group as MutableRefObject<THREE.Group>}
            mode={mode}
            space={mode === 'translate' ? 'world' : 'local'}
            translationSnap={snap || null}
            onMouseUp={() => {
              if (!group.current) return;
              const value = group.current;
              onTransform({
                ...chosen,
                position: value.position.toArray() as Vec3,
                rotation: [value.rotation.z, value.rotation.y, value.rotation.x],
                scale: value.scale.toArray() as Vec3,
              });
            }}
          />
        </>
      )}
    </>
  );
}

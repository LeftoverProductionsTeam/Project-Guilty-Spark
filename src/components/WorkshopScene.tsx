import TransformControls from './HaloTransformControls';
import { useRef } from 'react';
import useEndToFloor from '../useEndToFloor';
import type { DropBody } from '../useEndToFloor';
import type { ForgeSnapshot } from './ForgeViewport';
import { forgeGeometryKey } from '../forge';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { MeshData, Project, SceneObject, Vec3 } from '../types';
import ImportedMesh from './ImportedMesh';
import { NumberField } from './ui';

export function WorkshopObjectFields({
  object,
  update,
  remove,
  project,
  onMaterialBinding,
}: {
  object: SceneObject;
  project?: Project;
  onMaterialBinding?: (name: string, materialId: string) => void;
  update: (object: SceneObject) => void;
  remove: () => void;
}) {
  return (
    <div className="viewport-tags">
      <strong>{object.name}</strong>
      <p className="subtle">
        {project?.quickForge
          ? 'Build & check playtest creates native static scenery and collision from closed OBJ geometry with UVs (4096 triangles per model). Transform edits apply to both.'
          : 'Custom source mesh preview. Use a QuickForge/Workshop source map for native static scenery compilation.'}
      </p>
      {project?.quickForge && onMaterialBinding && (
        <details className="custom-native-materials">
          <summary>Native model materials</summary>
          <p className="subtle">
            Match each OBJ material to an assigned surface. Bindings apply to all imported models using the
            same material name.
          </p>
          {project.assets
            .find((a) => a.id === object.assetId)
            ?.materials.map((name) => {
              const doc = project.quickForge!,
                matching = doc.materials.find((m) => m.name.toLowerCase() === name.toLowerCase()),
                surfaces = doc.materials.filter((m) => m.shaderPath);
              const current =
                matching?.shaderPath ??
                (name === 'default' && surfaces.length === 1 ? surfaces[0].shaderPath : '');
              return (
                <label key={name}>
                  {name}
                  <select
                    aria-label={`Native shader for ${name}`}
                    value={surfaces.find((m) => m.shaderPath === current)?.id ?? ''}
                    onChange={(e) => onMaterialBinding(name, e.target.value)}
                  >
                    <option value="">Choose an assigned Halo surface</option>
                    {surfaces.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.shaderPath}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          <small>
            Add or assign Halo surface paths in Build tools → Materials first. Open meshes, missing UVs,
            ambiguous shaders and changed source bytes stop the build.
          </small>
        </details>
      )}
      {(['position', 'rotation', 'scale'] as const).map((property) => (
        <fieldset key={property} className="workshop-transform-fields">
          <legend>
            {property}
            {property === 'rotation' ? ' · degrees' : property === 'position' ? ' · Halo units' : ''}
          </legend>
          <div className="bsp-workshop-vector">
            {object[property].map((value, axis) => (
              <label key={axis} className="bsp-workshop-axis">
                <span
                  className={
                    ['gs-axis-x', 'gs-axis-y', 'gs-axis-z'][property === 'rotation' ? 2 - axis : axis]
                  }
                >
                  {(property === 'rotation' ? ['Yaw', 'Pitch', 'Roll'] : ['X', 'Y', 'Z'])[axis]}
                </span>
                <NumberField
                  label={`Custom model ${property} ${axis}`}
                  value={property === 'rotation' ? (value * 180) / Math.PI : value}
                  step={property === 'rotation' ? 1 : 0.1}
                  min={property === 'scale' ? 0.001 : -1e6}
                  max={1e6}
                  onCommit={(next) => {
                    const vector = [...object[property]] as Vec3;
                    vector[axis] = property === 'rotation' ? (next * Math.PI) / 180 : next;
                    update({ ...object, [property]: vector });
                  }}
                />
              </label>
            ))}
          </div>
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
  snapshot,
  onError,
  textures = {},
}: {
  textures?: Record<string, THREE.Texture>;
  snapshot?: ForgeSnapshot | null;
  onError?: (message: string) => void;
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
  const body = (object: SceneObject): DropBody => ({
    id: object.id,
    name: object.name,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(...object.position),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(object.rotation[2], object.rotation[1], object.rotation[0], 'ZYX'),
      ),
      new THREE.Vector3(...object.scale),
    ),
    preview: meshes[object.assetId!],
  });
  const current =
    !!snapshot &&
    !!project.quickForge &&
    forgeGeometryKey(snapshot.document) === forgeGeometryKey(project.quickForge);
  useEndToFloor({
    enabled: current && mode === 'translate',
    revision: JSON.stringify([project.quickForge, project.scene]),
    selected: chosen ? [body(chosen)] : [],
    others: [],
    terrain:
      current && snapshot
        ? {
            positions: snapshot.mesh.positions,
            indices: snapshot.mesh.parts
              .filter((p) => !snapshot.document.workshop?.portals.some((portal) => portal.id === p.brushId))
              .flatMap((p) => snapshot.mesh.indices.slice(p.indexStart, p.indexStart + p.indexCount)),
          }
        : null,
    onDrop: (delta) => {
      if (chosen)
        onTransform({
          ...chosen,
          position: [chosen.position[0], chosen.position[1], chosen.position[2] + delta],
        });
    },
    onError: (message) => onError?.(message),
  });
  const visual = (object: SceneObject) => (
    <ImportedMesh
      data={meshes[object.assetId!]}
      document={project.quickForge ?? undefined}
      textures={textures}
      selected={object.id === selected}
    />
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

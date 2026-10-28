import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Matrix3, Raycaster, Vector2, Vector3 } from 'three';
import type { Project, MapInspection, MeshData, Vec3, SceneObject } from '../types';
import LiveObjectInspector from './LiveObjectInspector';
import type { LiveViewportControls, LiveStatus } from './LiveObjectInspector';
import { matchesLiveMap, runtimeScene } from '../liveScene';
import { Notice } from './ui';
const World = lazy(() => import('./World'));
type DropPoint = (x: number, y: number) => Vec3 | null;
function LiveCameraStart({ status }: { status: LiveStatus }) {
  const { camera, controls } = useThree();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !controls) return;
    const actor = status.snapshot.objects.find((o) => o.player);
    if (!actor) return;
    initialized.current = true;
    const position = new Vector3(...actor.position).add(new Vector3(0, 0, 2.4)).addScaledVector(new Vector3(...actor.forward),-3),
      target = new Vector3(...actor.position).add(new Vector3(0,0,1));
    camera.position.copy(position);
    camera.up.set(0, 0, 1);
    camera.lookAt(target);
    const orbit = controls as unknown as { target?: Vector3; update?: () => void };
    orbit.target?.copy(target);
    orbit.update?.();
  }, [camera, controls, status]);
  return null;
}
function DropSurface({ point }: { point: React.MutableRefObject<DropPoint | null> }) {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const ray = new Raycaster();
    point.current = (x, y) => {
      const box = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new Vector2(((x - box.left) / box.width) * 2 - 1, 1 - ((y - box.top) / box.height) * 2),
        camera,
      );
      const hit = ray.intersectObjects(scene.children, true).find((h) => {
        if (h.object.type !== 'Mesh') return false;
        let p: typeof h.object | null = h.object;
        while (p) {
          if (p.type.includes('TransformControls') || p.userData.directorHelper) return false;
          p = p.parent;
        }
        return true;
      });
      return hit
        ? (new Vector3()
            .copy(hit.point)
            .addScaledVector(
              hit.face
                ? hit.face.normal
                    .clone()
                    .applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld))
                : new Vector3(0, 0, 1),
              0.05,
            )
            .toArray() as Vec3)
        : null;
    };
    return () => {
      point.current = null;
    };
  }, [gl, camera, scene, point]);
  return null;
}
interface Props {
  onSourceEdit?:(project:Project,description:string)=>void;
  mode?:'auto'|'source'|'live';
  sourceViewport?:React.ReactNode;
  onLiveState?:(active:boolean)=>void;
  project: Project | null;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  notify: (m: string) => void;
  onOpenMap: () => Promise<void>;
  sourceControls?: React.ReactNode;
  onResourcesConnected?: (open: import('../types').OpenProject) => Promise<void>;
  onBeforeResources?: () => Promise<void>;
}
function LiveViewport({
  controls,
  project,
  inspection,
  assetMeshes,
  notify,
  onOpenMap,
  sourceControls,
  onResourcesConnected,
  onBeforeResources,
  mode='live',sourceViewport,onLiveState,onSourceEdit,
}: Props & { controls: LiveViewportControls }) {
  const [display, setDisplay] = useState<LiveStatus | null>(controls.status),
    [importing, setImporting] = useState(false);
  const dragging = useRef(false),
    drop = useRef<DropPoint | null>(null);
  useEffect(() => {
    if (!dragging.current) setDisplay(controls.status);
  }, [controls.status]);
  useEffect(() => {
    dragging.current = false;
    setDisplay(controls.status);
  }, [controls.status?.snapshot.identity.scenario, controls.status?.snapshot.identity.checksum]);
  const matching=!!controls.status&&matchesLiveMap(project,inspection,controls.status);
  const liveActive=mode!=='source'&&matching;
  useEffect(()=>onLiveState?.(liveActive),[liveActive,onLiveState]);
  async function openRunningMap(){setImporting(true);try{await onOpenMap();}catch(error){notify(String(error));}finally{setImporting(false);}}
  if(mode!=='live'&&!liveActive&&sourceViewport!==undefined)return <div className="level-source-view">
    {mode==='auto'&&controls.status&&!matching&&<div className="level-live-available" role="status">A different map is running in MCC. Editing the open source document.
      <button disabled={importing} onClick={()=>void openRunningMap()}>{importing?'Preserving the loaded cache…':'Preserve and open the running map'}</button></div>}
    {sourceViewport}
  </div>;
  if (!controls.status)
    return (
      <div className="live-world-empty">
        <h2>QuickForge · Live mode</h2>
        <p>
          Connect MCC to load its current objects. Move or uniformly resize existing instances using the same
          world gizmos.
        </p>
        <Notice>
          New object creation and runtime BSP/tunnel replacement require additional engine support. Geometry
          remains editable source and must be compiled/reloaded.
        </Notice>
        {sourceControls}
      </div>
    );
  if (!matchesLiveMap(project, inspection, controls.status) || !display)
    return (
      <div className="live-world-empty">
        <h2>Load the exact running map</h2>
        <p>
          The 3D gizmos require a preserved copy of {controls.status.snapshot.identity.scenario} with the
          matching checksum. An unrelated Blood Gulch variant cannot be used.
        </p>
        <button
          disabled={importing}
          onClick={async () => {
            setImporting(true);
            try {
              await onOpenMap();
            } catch (error) {
              notify(String(error));
            } finally {
              setImporting(false);
            }
          }}
        >
          {importing ? 'Preserving the loaded cache…' : 'Preserve and open the running map'}
        </button>
        {sourceControls}
      </div>
    );
  const scene = runtimeScene(display),
    draft = { ...project!, scene };
  function transform(next: Project,description:string) {
    const changed = next.scene.filter((o) => {
      const before = scene.find((s) => s.id === o.id);
      return !before || JSON.stringify(before) !== JSON.stringify(o);
    });
    if(!changed.length&&next.scene.length===scene.length&&onSourceEdit&&(JSON.stringify(next.renderFeatures)!==JSON.stringify(project!.renderFeatures)||JSON.stringify(next.worldEnvironment)!==JSON.stringify(project!.worldEnvironment))){onSourceEdit({...project!,renderFeatures:next.renderFeatures,worldEnvironment:next.worldEnvironment},description);return;}
    if (next.scene.length !== scene.length || changed.length !== 1) {
      notify(
        'Live duplication, deletion and multi-object source edits need engine support. No game operation was sent.',
      );
      return;
    }
    const after = changed[0],
      before = scene.find((o) => o.id === after.id);
    if (!before) return;
    const datum = Number(after.id.slice(5));
    if (after.rotation.some((v, i) => Math.abs(v - before.rotation[i]) > 0.0001)) {
      notify('Runtime rotation is not enabled by the reviewed adapter. No game operation was sent.');
      return;
    }
    const scaleChanges = after.scale
      .map((v, i) => ({ value: v, difference: Math.abs(v - before.scale[i]) }))
      .sort((a, b) => b.difference - a.difference);
    if (scaleChanges[0].difference > 0.0001) void controls.scale(datum, scaleChanges[0].value);
    else if (after.position.some((v, i) => v !== before.position[i]))
      void controls.move(datum, after.position);
    else notify('This source property is not a live runtime operation. No game operation was sent.');
  }
  return (
    <div
      className="live-world-pane"
      aria-busy={controls.busy}
      onDragOver={(e) => {
        if (!controls.busy && e.dataTransfer.types.includes('application/x-spark-live-instance'))
          e.preventDefault();
      }}
      onDrop={(e) => {
        const value = e.dataTransfer.getData('application/x-spark-live-instance');
        if (!value || controls.busy) return;
        e.preventDefault();
        const datum = Number(value),
          position = drop.current?.(e.clientX, e.clientY);
        if (!position || !controls.status?.snapshot.objects.some((o) => o.datum === datum)) {
          notify('Drop an existing live instance on a supported map surface.');
          return;
        }
        controls.select(datum);
        void controls.move(datum, position);
      }}
    >
      <div className="live-map-state">
        LIVE · {scene.length} independent objects · source viewport + game poses · drag an existing instance
        onto a surface
      </div>
      <Suspense fallback={<p>Loading live-map geometry…</p>}>
        <World
          project={draft}
          inspection={inspection}
          assetMeshes={assetMeshes}
          edit={transform}
          notify={notify}
          onResourcesConnected={onResourcesConnected}
          onBeforeResources={onBeforeResources}
          selectedId={controls.selected === null ? null : 'live:' + controls.selected}
          onSelectObject={(id) => controls.select(id?.startsWith('live:') ? Number(id.slice(5)) : null)}
          onSceneDragStart={() => {
            dragging.current = true;
          }}
          onSceneDragEnd={() => {
            dragging.current = false;
          }}
          viewportChildren={
            <>
              <DropSurface point={drop} />
              <LiveCameraStart status={display} />
            </>
          }
        />
      </Suspense>
      <details className="live-instance-palette">
        <summary>Drag existing live instances · no object cloning</summary>
        <div>
          {controls.status.snapshot.objects
            .filter((o) => o.parentDatum === 4294967295)
            .map((o) => (
              <button
                key={o.datum}
                draggable
                disabled={controls.busy}
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/x-spark-live-instance', String(o.datum))
                }
                onClick={() => controls.select(o.datum)}
              >
                {o.tagPath.split('/').at(-1)} · #{o.datum.toString(16)}
              </button>
            ))}
        </div>
      </details>
    </div>
  );
}
export default function LiveEditor(props: Props) {
  return <LiveObjectInspector presentation={props.sourceViewport!==undefined?'drawer':'sidebar'} controlsOpen={props.mode==='live'}
    keyboardEnabled={status=>!!status&&(props.mode==='live'||(props.mode!=='source'&&matchesLiveMap(props.project,props.inspection,status)))}
    viewport={(controls) => <LiveViewport {...props} controls={controls} />} />;
}

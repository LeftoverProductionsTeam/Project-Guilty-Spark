import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import World from '../../../src/components/World';
import type { Project } from '../../../src/types';
import { PerspectiveCamera, Vector3 } from 'three';
function source(id: string): Project {
  return {
    schemaVersion: 1,
    id,
    title: id,
    createdAt: '2026-10-28',
    modifiedAt: '2026-10-28',
    source: null,
    provenance: {} as Project['provenance'],
    scene: [],
    assets: [],
    tagEdits: [],
    history: [],
    builds: [],
    bspAssembly: {
      schemaVersion: 1,
      donorProjectId: '00000000-0000-0000-0000-000000000000',
      donorTitle: 'Synthetic corridor',
      donorSource: {
        originalPath: 'synthetic.map',
        preservedPath: 'synthetic.map',
        sha256: 'a'.repeat(64),
        cacheVersion: 13,
        engine: 'Synthetic',
        scenarioPath: 'fixture',
      },
      donorTagsDirectory: 'synthetic',
      donorBspIndex: 0,
      translation: [0, 0, 0],
      yawDegrees: 0,
      tunnelPoints: [
        [0, 0, 0],
        [12, 0, 0],
      ],
      tunnelWidth: 4,
      tunnelHeight: 3,
      tunnelShaderPath: 'fixture/metal',
    },
  };
}
function Harness() {
  const [projects, setProjects] = useState([source('zone-map-a'), source('zone-map-b')]),
    [active, setActive] = useState(0),
    [calls, setCalls] = useState<string[]>([]);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header>
        <button onClick={() => setActive(active === 0 ? 1 : 0)}>Switch synthetic map</button>
        <output hidden data-testid="zone-edit-log">
          {JSON.stringify(calls)}
        </output>
        <output hidden data-testid="zone-project">
          {JSON.stringify(projects[active])}
        </output>
      </header>
      <World
        key={projects[active].id}
        project={projects[active]}
        inspection={null}
        assetMeshes={{}}
        notify={() => {}}
        edit={(next, description) => {
          setProjects((old) => old.map((p) => (p.id === next.id ? next : p)));
          setCalls((old) => [...old, next.id + ':' + description]);
        }}
      />
    </div>
  );
}
export function mount() {
  const original = document.querySelector<HTMLElement>('#root');
  if (original) original.style.display = 'none';
  const element = document.createElement('div');
  element.id = 'visibility-zone-test-root';
  document.body.append(element);
  createRoot(element).render(<Harness />);
}
export function portalAxisDrag() {
  const canvas = document.querySelector<HTMLCanvasElement>('#visibility-zone-test-root canvas')!,
    pose = JSON.parse(canvas.dataset.gsCameraPose!),
    rect = canvas.getBoundingClientRect();
  const project = JSON.parse(document.querySelector('[data-testid="zone-project"]')!.textContent!),
    zone = project.bspAssembly.visibilityZones[0];
  const camera = new PerspectiveCamera(55, rect.width / rect.height, 0.05, 100000);
  camera.position.fromArray(pose.position);
  camera.quaternion.fromArray(pose.quaternion);
  camera.zoom = pose.zoom;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const origin = new Vector3(12 * zone.start, 0, 1.5),
    factor =
      (origin.distanceTo(camera.position) *
        Math.min((1.9 * Math.tan((Math.PI * 55) / 360)) / camera.zoom, 7) *
        0.8) /
      4;
  const point = (p: Vector3) => {
    const projected = p.project(camera);
    return {
      x: rect.x + ((projected.x + 1) * rect.width) / 2,
      y: rect.y + ((1 - projected.y) * rect.height) / 2,
    };
  };
  return {
    from: point(origin.clone().add(new Vector3(factor * 0.65, 0, 0))),
    to: point(origin.clone().add(new Vector3(factor * 0.65 + 0.6, 0, 0))),
  };
}

import { useMemo, useRef } from 'react';
import type { Project, MapInspection } from '../types';
import type { AnimationPreview } from '../animation';
import { catalogAssets, placeAsset } from '../forge';
import { sourceSpartan } from '../sourceSpartan';
import { forgeModelKey, useOwnedForgeModels } from '../useOwnedForgeModels';
import MachinimaActor from './MachinimaActor';
import type { RehearsalFrame } from './MachinimaActor';
export default function MachinimaCast({
  project,
  inspection,
  animation,
  onError,
}: {
  project: Project;
  inspection: MapInspection | null;
  animation: AnimationPreview | null;
  onError: (message: string) => void;
}) {
  const take = useRef<RehearsalFrame[]>([]);
  const source = useMemo(() => {
    const biped =
      inspection?.tags.find((t) => t.class === 'bipd' && t.id === animation?.targetTagId) ??
      sourceSpartan(inspection);
    const asset = biped && catalogAssets({ project, inspection }).find((a) => a.tagId === biped.id);
    return asset ? placeAsset(asset, [0, 0, 0]) : null;
  }, [project.id, inspection, animation?.targetTagId]);
  const { models } = useOwnedForgeModels(source ? [source] : []);
  const start = project.scene.find((o) => o.kind === 'Player spawn');
  const actor = useMemo(
    () => ({
      id: 'director-actor',
      name: 'Director actor',
      position: [...(start?.position ?? [0, 0, 0])] as [number, number, number],
      visible: true,
      locked: false,
      facing: start?.rotation[0] ?? 0,
      team: 0,
      gameModes: [],
    }),
    [project.id, start?.id],
  );
  const model = source ? models[forgeModelKey(source)] : null;
  return model && inspection ? (
    <MachinimaActor
      actor={actor}
      sessionId={project.id}
      model={model}
      animation={animation}
      snapshot={{ mesh: inspection.mesh }}
      recording={false}
      take={take}
      onError={onError}
    />
  ) : null;
}

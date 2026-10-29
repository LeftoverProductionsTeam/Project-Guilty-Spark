import type { MapInspection, OpenProject, Project } from './types';

export interface ExternalMapDocument {
  project: Project;
  inspection: MapInspection | null;
  dirty: boolean;
}
export interface ExternalMapCandidate {
  sha256: string;
  cacheVersion: number;
  scenarioPath: string;
  fileSize: number;
  matchesSource: boolean;
}
export interface ExternalWatchReport {
  watchId: string;
  projectId: string;
  path: string;
  status: string;
  candidate: ExternalMapCandidate | null;
  message: string;
}
export interface ExternalRevision {
  previousProjectId: string;
  watchedPath: string;
  opened: OpenProject;
  deduplicated: boolean;
}
export type ExternalRevisionMode = 'replaceClean' | 'openSeparate';

/** Dirty=false also includes saved authoring, so it cannot be the only gate. */
export function hasSourceBoundEdits(project: Project, inspection: MapInspection | null): boolean {
  if (!project.source || !inspection || project.source.sha256 !== inspection.sha256) return true;
  if (
    project.tagEdits.length ||
    project.assets.length ||
    project.tagDuplicates?.length ||
    project.powerups?.length ||
    project.animations?.length ||
    project.animationAssignments?.length ||
    project.quickForge ||
    project.bspAssembly ||
    project.firefight ||
    project.studio ||
    project.worldEnvironment ||
    project.renderFeatures ||
    project.audioPreview ||
    project.gameplayControls ||
    project.conversionProfile
  )
    return true;
  if (project.scene.length !== inspection.objects.length) return true;
  const normalized = (object: Project['scene'][number]) => [
    object.id,
    object.name,
    object.kind,
    object.tagId ?? null,
    object.position,
    object.rotation,
    object.scale,
    object.visible,
    object.sourceOffset ?? null,
    object.rotationOffset ?? null,
    object.assetId ?? null,
  ];
  return project.scene.some(
    (object, index) =>
      JSON.stringify(normalized(object)) !== JSON.stringify(normalized(inspection.objects[index])),
  );
}

export interface ExternalSyncBridge {
  start(projectId: string): Promise<ExternalWatchReport>;
  poll(watchId: string, forceMetadata?: boolean): Promise<ExternalWatchReport>;
  stop(watchId: string): Promise<unknown>;
  import(watchId: string, hash: string): Promise<ExternalRevision>;
}
export interface ExternalSyncCallbacks {
  documents(): ExternalMapDocument[];
  report(report: ExternalWatchReport): void;
  error(projectId: string, message: string): void;
  revision(
    previousId: string,
    opened: OpenProject,
    mode: ExternalRevisionMode,
    path: string,
  ): Promise<void> | void;
}

/** One batch in flight, including imports. Callback guards are rechecked after
 * every await so closing/changing a map cannot apply an old async response. */
export class ExternalMapSyncController {
  private watches = new Map<string, { id: string; source: string }>();
  private active = true;
  private running = false;
  private idleWaiters: (() => void)[] = [];
  constructor(
    private bridge: ExternalSyncBridge,
    private callbacks: ExternalSyncCallbacks,
  ) {}
  private current(id: string, source: string) {
    return this.active
      ? this.callbacks.documents().find((d) => d.project.id === id && d.project.source?.sha256 === source)
      : undefined;
  }
  async poll(forceMetadata = false): Promise<void> {
    if (!this.active) return;
    if (this.running) {
      if (forceMetadata) {
        await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
        return this.poll(true);
      }
      return;
    }
    this.running = true;
    try {
      const documents = this.callbacks
        .documents()
        .filter((d) => d.project.source)
        .slice(0, 32);
      for (const [id, watch] of this.watches)
        if (!this.current(id, watch.source)) {
          this.watches.delete(id);
          await this.bridge.stop(watch.id).catch(() => {});
        }
      for (const document of documents) {
        const id = document.project.id,
          source = document.project.source!.sha256;
        if (!this.current(id, source)) continue;
        try {
          let watch = this.watches.get(id);
          if (!watch) {
            const started = await this.bridge.start(id);
            if (!this.current(id, source)) {
              await this.bridge.stop(started.watchId).catch(() => {});
              continue;
            }
            watch = { id: started.watchId, source };
            this.watches.set(id, watch);
          }
          const report = await this.bridge.poll(watch.id, forceMetadata);
          const latest = this.current(id, source);
          if (!latest || this.watches.get(id)?.id !== report.watchId || report.projectId !== id) continue;
          this.callbacks.report(report);
          if (
            report.candidate?.matchesSource &&
            !latest.dirty &&
            !hasSourceBoundEdits(latest.project, latest.inspection)
          ) {
            await this.acceptInternal(report, source, false);
          }
        } catch (error) {
          const failed = this.watches.get(id);
          this.watches.delete(id);
          if (failed) await this.bridge.stop(failed.id).catch(() => {});
          if (this.current(id, source)) this.callbacks.error(id, String(error));
        }
      }
    } finally {
      this.finish();
    }
  }
  async accept(report: ExternalWatchReport): Promise<void> {
    if (!this.active || !report.candidate) return;
    if (this.running) {
      await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
      return this.accept(report);
    }
    const source = this.callbacks.documents().find((d) => d.project.id === report.projectId)?.project
      .source?.sha256;
    if (!source) return;
    this.running = true;
    try {
      await this.acceptInternal(report, source, true);
    } catch (error) {
      if (this.current(report.projectId, source)) this.callbacks.error(report.projectId, String(error));
    } finally {
      this.finish();
    }
  }
  private async acceptInternal(report: ExternalWatchReport, source: string, explicit: boolean) {
    if (!report.candidate || !this.current(report.projectId, source)) return;
    const revision = await this.bridge.import(report.watchId, report.candidate.sha256);
    const latest = this.current(report.projectId, source);
    if (
      !latest ||
      revision.previousProjectId !== report.projectId ||
      revision.opened.project.source?.sha256 !== report.candidate.sha256
    )
      return;
    const separate =
      explicit ||
      latest.dirty ||
      hasSourceBoundEdits(latest.project, latest.inspection) ||
      !report.candidate.matchesSource ||
      hasSourceBoundEdits(revision.opened.project, revision.opened.inspection);
    await this.callbacks.revision(
      report.projectId,
      revision.opened,
      separate ? 'openSeparate' : 'replaceClean',
      revision.watchedPath,
    );
    if (this.active)
      this.callbacks.report({
        ...report,
        status: 'watching',
        candidate: null,
        message: separate
          ? 'Opened the external revision separately; Spark edits remain in their original map.'
          : 'Updated the clean map tab from the external save; the previous preserved revision remains in the library.',
      });
  }
  dispose() {
    this.active = false;
    for (const watch of this.watches.values()) void this.bridge.stop(watch.id).catch(() => {});
    this.watches.clear();
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
  private finish() {
    this.running = false;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

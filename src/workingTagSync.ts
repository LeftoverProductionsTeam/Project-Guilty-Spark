/** Saved tool tags are source changes. Only a separate compiled revision updates a cache. */
export interface WorkingTagReport {
  watchId: string;
  projectId: string;
  buildId: string;
  tagsDirectory: string;
  status: 'saving' | 'changed' | 'unchanged';
  basis: 'compiledBuild' | 'watchStarted' | 'acceptedNativeRevision';
  revision: number;
  totalFiles: number;
  changedFiles: number;
  changes: { path: string; kind: 'added' | 'modified' | 'removed' }[];
  listTruncated: boolean;
  hashesReadLastScan: number;
  contentAudit?: { bytesReadLastPoll: number; filesCheckedLastPoll: number; completedSweeps: number };
  integrity?: import('./nativeTagIntegrity').NativeTagIntegrityReport;
  writerContext?: string;
  writerEvidence?: import('./nativeTagIntegrity').NativeSaveEvidence;
}
export interface WorkingTagApi {
  start: (projectId: string) => Promise<WorkingTagReport>;
  poll: (watchId: string, force: boolean) => Promise<WorkingTagReport>;
  stop: (watchId: string) => Promise<unknown>;
}
export class WorkingTagSync {
  private disposed = false;
  private watch: string | null = null;
  private pending: Promise<void> | null = null;
  private forceQueued = false;
  constructor(
    private readonly project: string,
    private readonly build: string,
    private readonly api: WorkingTagApi,
    private readonly accept: (report: WorkingTagReport) => void,
    private readonly error: (message: string) => void,
  ) {}
  poll(force = false): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) {
      this.forceQueued ||= force;
      return this.pending;
    }
    const run = async () => {
      try {
        const watched = this.watch;
        const report = watched ? await this.api.poll(watched, force) : await this.api.start(this.project);
        if (this.disposed) {
          if (!watched) await this.api.stop(report.watchId).catch(() => {});
          return;
        }
        if (report.projectId !== this.project || report.buildId !== this.build) {
          await this.api.stop(report.watchId).catch(() => {});
          this.watch = null;
          throw Error('Working tag report belongs to a different map build. Refresh runtime inspection.');
        }
        this.watch = report.watchId;
        this.accept(report);
        this.error('');
      } catch (reason) {
        if (this.disposed) return;
        const previous = this.watch;
        if (/expired|different map build|Saved map changed/.test(String(reason))) {
          this.watch = null;
          if (previous) await this.api.stop(previous).catch(() => {});
        }
        if (!this.disposed) this.error(String(reason));
      }
    };
    this.pending = run().finally(() => {
      this.pending = null;
      if (this.forceQueued && !this.disposed) {
        this.forceQueued = false;
        void this.poll(true);
      }
    });
    return this.pending;
  }
  dispose() {
    this.disposed = true;
    this.forceQueued = false;
    const watch = this.watch;
    this.watch = null;
    if (watch) void this.api.stop(watch).catch(() => {});
  }
}

import type { QuickForgeDocument } from './forge';
export interface StudioPerson {
  id: string;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
  online: boolean;
}
export interface StudioView {
  sessionId: string;
  revision: number;
  document: QuickForgeDocument;
  peers: number;
  lastAuthor: string;
  detail: string;
  game?: { runtimeId: string; scenario: string; checksum: number; tagCount: number };
  authorId?: string;
  role?: 'owner' | 'editor' | 'viewer';
  encrypted?: boolean;
  durable?: boolean;
  participants?: StudioPerson[];
  history?: { id: string; author: string; kind: string; revision: number; acceptedAt?: string }[];
  canUndo?: boolean;
  canRedo?: boolean;
  acknowledgedOperationId?: string | null;
  leases?: { target: string; author: string; remainingMs: number }[];
}
export interface PendingStudioEdit {
  sessionId: string;
  operationId: string;
  revision: number;
  document: QuickForgeDocument;
}
export interface StudioInfo {
  projectId: string;
  projectTitle: string;
  sessionId: string;
  role: 'host' | 'guest';
  transport: 'lan' | 'steamSpacewar';
  endpoint: string;
  key: string | null;
  view: StudioView | null;
  lan: boolean;
  owned?: boolean;
  directoryId?: string | null;
  detail?: string | null;
}
export interface StudioRecord {
  directoryId: string;
  sessionId: string;
  projectId: string;
  title: string;
  createdAt: string;
}
/** A small conflict review, not a binary or topology merge. */
export function studioDifferences(
  local: QuickForgeDocument,
  shared: QuickForgeDocument,
): { target: string; mine: string; shared: string }[] {
  const rows: { target: string; mine: string; shared: string }[] = [];
  const brief = (v: unknown) => {
    const s = JSON.stringify(v) ?? '(absent)';
    return s.length > 120 ? s.slice(0, 117) + '…' : s;
  };
  for (const key of ['geometry', 'materials', 'placements', 'spawns', 'objectives'] as const) {
    for (const id of new Set([...local[key], ...shared[key]].map((value) => value.id))) {
      const item = local[key].find((value) => value.id === id);
      const other = shared[key].find((value) => value.id === id);
      if (!item || !other) {
        rows.push({
          target: key + '/' + id,
          mine: item ? 'Present' : 'Absent',
          shared: other ? 'Present' : 'Absent',
        });
        if (rows.length >= 12) return rows;
        continue;
      }
      for (const [field, value] of Object.entries(item)) {
        if (field === 'sourceProjectId') continue; // Each creator resolves their own library UUID.
        const theirs = (other as unknown as Record<string, unknown>)[field];
        if (JSON.stringify(value) !== JSON.stringify(theirs))
          rows.push({ target: key + '/' + item.id + '/' + field, mine: brief(value), shared: brief(theirs) });
        if (rows.length >= 12) return rows;
      }
    }
  }
  for (const key of ['name', 'gameMode', 'skyPath', 'buildQuality', 'environment'] as const) {
    if (JSON.stringify(local[key]) !== JSON.stringify(shared[key]))
      rows.push({ target: key, mine: brief(local[key]), shared: brief(shared[key]) });
    if (rows.length >= 12) return rows;
  }
  return rows;
}
export function announceStudio(projectId: string, view: StudioView | null, hosting = false, paused = false) {
  window.dispatchEvent(
    new CustomEvent('guilty-spark-studio-status', { detail: { projectId, view, hosting, paused } }),
  );
}

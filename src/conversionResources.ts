import type { Project, Settings } from './types';
export interface BitmapDependencyAudit {
  required: number;
  available: number;
  missing: { path: string; reason: string }[];
  invalid: { path: string; reason: string }[];
  listTruncated: boolean;
}
export interface BitmapRepairPreview {
  planId: string;
  projectId: string;
  expiresAtUnix: number;
  sourceSha256: string;
  sdkTags: string;
  sourceTags: string;
  files: { path: string; source: string; bytes: number; sha256: string }[];
}
export interface BitmapRepairReceipt {
  schemaVersion: number;
  status: string;
  sourceSha256: string;
  originalSdk: string;
  tagsDirectory: string;
  files: BitmapRepairPreview['files'];
  sdkFiles: number;
  sourcePreserved: boolean;
  playableOutput: boolean;
}
export interface BitmapRepairStatus {
  jobId: string;
  projectId: string;
  status: 'copying' | 'ready' | 'failed';
  message: string;
  receipt: BitmapRepairReceipt | null;
}
export function selectRepairedTagset(
  project: Project,
  defaults: Settings,
  receipt: BitmapRepairReceipt,
  newId: () => string = () => crypto.randomUUID(),
): Project {
  if (
    !project.source ||
    project.source.sha256 !== receipt.sourceSha256 ||
    receipt.schemaVersion !== 1 ||
    receipt.status !== 'ready-source-tagset' ||
    !receipt.sourcePreserved ||
    receipt.playableOutput ||
    !receipt.tagsDirectory
  )
    throw Error('The repaired source tagset does not match this map.');
  const targets = project.buildTargets ?? [],
    active = targets.find((t) => t.id === project.activeBuildTarget);
  if (active) {
    if (active.runtimeId !== 'mccSteam' || active.builder !== 'h1a-tool' || active.hekFlavor !== 'h1aEk')
      throw Error('Choose an MCC H1A build target before selecting this repaired tagset.');
    return {
      ...project,
      buildTargets: targets.map((t) =>
        t.id === active.id ? { ...t, tagsDirectory: receipt.tagsDirectory } : t,
      ),
    };
  }
  if (targets.length >= 16) throw Error('Select an existing MCC target before adding another tagset.');
  const id = newId();
  return {
    ...project,
    activeBuildTarget: id,
    buildTargets: [
      ...targets,
      {
        id,
        name: 'MCC Halo CE · repaired tags',
        runtimeId: 'mccSteam',
        builder: 'h1a-tool',
        hekFlavor: 'h1aEk',
        hekDirectory: defaults.hekFlavor === 'h1aEk' ? (defaults.hekDirectory ?? null) : null,
        tagsDirectory: receipt.tagsDirectory,
        invaderDirectory: defaults.invaderDirectory ?? null,
        ceCompatibleTagset: false,
        openSauce: false,
      },
    ],
  };
}

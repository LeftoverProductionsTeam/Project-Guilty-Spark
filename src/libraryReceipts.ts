import type { Bootstrap, LibraryEntry, Project, ProjectBuildHistory } from './types';

/** A build notification must not replace authored fields, source or history. */
export function applyBuildHistory(project: Project, receipt: ProjectBuildHistory): Project {
  if (!receipt || receipt.projectId !== project.id || receipt.sourceSha256 !== (project.source?.sha256 ?? null) || !Array.isArray(receipt.builds))
    throw new Error('Build history does not match this project source. Your working draft is retained.');
  return { ...project, builds: receipt.builds };
}

/** The native save receipt describes the saved project, never the active tab. */
export function checkedSaveReceipt(project: Project, entry: LibraryEntry): LibraryEntry {
  if (!entry || entry.id !== project.id || entry.sha256 !== (project.source?.sha256 ?? null) ||
      entry.version !== (project.source?.cacheVersion ?? null))
    throw new Error('The save receipt does not match this project source. Your working draft is retained.');
  return entry;
}

/** Reuse the backend's committed summary without reloading settings or maps. */
export function applyLibraryReceipt(data: Bootstrap, entry: LibraryEntry): Bootstrap {
  const entries = data.entries.some(row => row.id === entry.id)
    ? data.entries.map(row => row.id === entry.id ? entry : row)
    : [...data.entries, entry];
  return { ...data, entries: entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)) };
}

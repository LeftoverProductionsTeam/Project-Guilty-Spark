import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Bootstrap } from './types';
export const native = isTauri();
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!native)
    throw new Error(
      'This operation needs the Guilty Spark desktop application. The browser preview has no filesystem or Steam access.',
    );
  return invoke<T>(command, args);
}
export const browserBootstrap: Bootstrap = {
  apiVersion: 1,
  installation: {
    steamPath: null,
    steamExecutable: null,
    mccPath: null,
    halo1Installed: false,
    libraries: [],
    editingTools: null,
    manifestPath: null,
    running: false,
    diagnostics: [],
  },
  managed: null,
  settings: {
    steamDirectory: null,
    mccDirectory: null,
    invaderDirectory: null,
    resourceDirectory: null,
    metadataTemplateDirectory: null,
    nativeExecutable: null,
    autoBuild: true,
  },
  entries: [],
  dataDirectory: 'Desktop application required',
  diagnostics: [
    'Browser preview · Native import, persistence and Steam integration are available in the compiled desktop application.',
  ],
  logs: [],
};

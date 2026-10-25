import type { Settings } from './types';

/** Keep locally edited preferences when an unrelated native refresh arrives. */
export function reconcileSettingsDraft(draft: Settings, previous: Settings, incoming: Settings): Settings {
  const next = { ...draft };
  for (const key of Object.keys(incoming) as (keyof Settings)[]) {
    if (JSON.stringify(draft[key]) === JSON.stringify(previous[key]))
      Object.assign(next, { [key]: incoming[key] });
  }
  return next;
}

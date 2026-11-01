/** Opt-in development measurements. No arguments, content or paths are recorded.
 * Off by default; the native acceptance profiler enables it before page startup. */
type ProfileGlobal = typeof globalThis & {
  __GS_PROFILE__?: boolean;
  __GS_PROFILE_GAUGES__?: Record<string, Record<string, number>>;
};
let recorded = 0;
export function profileStart(): number | null {
  return (globalThis as ProfileGlobal).__GS_PROFILE__ === true ? performance.now() : null;
}
export function profileEnd(name: string, start: number | null): void {
  if (start === null || recorded >= 4096 || !/^[a-z0-9_.:-]{1,100}$/i.test(name)) return;
  recorded++;
  performance.measure(name, { start, end: performance.now() });
}
/** Counts and byte budgets only. No content, paths or source identities. */
export function profileGauge(name: string, value: () => Record<string, number>): void {
  const profile = globalThis as ProfileGlobal;
  if (profile.__GS_PROFILE__ !== true || !/^[a-z0-9_.:-]{1,100}$/i.test(name)) return;
  const gauges = (profile.__GS_PROFILE_GAUGES__ ??= {});
  if (!gauges[name] && Object.keys(gauges).length >= 32) return;
  gauges[name] = value();
}

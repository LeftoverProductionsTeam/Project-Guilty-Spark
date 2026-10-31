/** Opt-in development measurements. No arguments, content or paths are recorded.
 * Off by default; the native acceptance profiler enables it before page startup. */
type ProfileGlobal = typeof globalThis & { __GS_PROFILE__?: boolean };
let recorded = 0;
export function profileStart(): number | null {
  return (globalThis as ProfileGlobal).__GS_PROFILE__ === true ? performance.now() : null;
}
export function profileEnd(name: string, start: number | null): void {
  if (start === null || recorded >= 4096 || !/^[a-z0-9_.:-]{1,100}$/i.test(name)) return;
  recorded++;
  performance.measure(name, { start, end: performance.now() });
}

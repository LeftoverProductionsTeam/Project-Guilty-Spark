/** Z-up, editor-only right-mouse camera navigation. Pure calculations are kept
 * separate from DOM/Three so the input math can be tested without a renderer.
 * No game process, compiled map, or file is accessed here.
 */
export type FlightVector = [number, number, number];
export interface FlightAngles { yaw: number; pitch: number }
export const FLIGHT_SENSITIVITY = 0.0024;
export const DEFAULT_FLIGHT_BINDINGS={forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',up:'KeyE',down:'KeyQ'};
export type FlightBindings=typeof DEFAULT_FLIGHT_BINDINGS;
export interface NavigationConfig{speed:number;sensitivity:number;bindings:FlightBindings}
export const DEFAULT_NAVIGATION:NavigationConfig={speed:12,sensitivity:FLIGHT_SENSITIVITY,bindings:DEFAULT_FLIGHT_BINDINGS};
export function navigationConfig(raw:unknown):NavigationConfig{
 const value=raw&&typeof raw==='object'?raw as Partial<NavigationConfig>:{};
 const bindings={...DEFAULT_FLIGHT_BINDINGS};const seen=new Set<string>();
 for(const key of Object.keys(bindings)as(keyof FlightBindings)[]){const code=value.bindings?.[key]??bindings[key];if(!/^Key[A-Z]$/.test(code)||seen.has(code))return {...DEFAULT_NAVIGATION,bindings:{...DEFAULT_FLIGHT_BINDINGS}};bindings[key]=code;seen.add(code);}
 return {bindings,speed:typeof value.speed==='number'&&finite(value.speed)?Math.max(.2,Math.min(100,value.speed)):12,sensitivity:typeof value.sensitivity==='number'&&finite(value.sensitivity)?Math.max(.0002,Math.min(.02,value.sensitivity)):FLIGHT_SENSITIVITY};
}
export function scrollFlightSpeed(speed:number,delta:number):number{if(!finite(speed)||!finite(delta))throw new Error('Invalid navigation speed');return Math.max(.2,Math.min(100,speed*Math.exp(-Math.max(-1000,Math.min(1000,delta))*.001)));}
export const MAX_FLIGHT_PITCH = Math.PI / 2 - 0.025;
const finite = (v: number) => Number.isFinite(v);
export function flightAnglesFromDirection(vector: FlightVector): FlightAngles {
  if (!vector.every(finite)) throw new Error('Camera direction is not finite');
  const length = Math.hypot(...vector);
  if (length < 1e-9) throw new Error('Camera direction is zero');
  return { yaw: Math.atan2(vector[1], vector[0]), pitch: Math.asin(Math.max(-1, Math.min(1, vector[2] / length))) };
}
export function lookFlight(angles: FlightAngles, dx: number, dy: number, sensitivity = FLIGHT_SENSITIVITY): FlightAngles {
  if (![angles.yaw, angles.pitch, dx, dy, sensitivity].every(finite) || sensitivity <= 0 || sensitivity > 0.05)
    throw new Error('Invalid fly-camera rotation');
  // Clamp each DOM event so an OS pointer jump cannot spin the editor uncontrollably.
  const clamp = (n: number) => Math.min(400, Math.max(-400, n));
  return { yaw: angles.yaw - clamp(dx) * sensitivity,
    pitch: Math.max(-MAX_FLIGHT_PITCH, Math.min(MAX_FLIGHT_PITCH, angles.pitch - clamp(dy) * sensitivity)) };
}
export function directionForFlight({ yaw, pitch }: FlightAngles): FlightVector {
  if (![yaw, pitch].every(finite)) throw new Error('Invalid fly-camera angles');
  return [Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)];
}
export function flightVelocity(angles: FlightAngles, codes: ReadonlySet<string>, baseSpeed = 12,bindings:FlightBindings=DEFAULT_FLIGHT_BINDINGS): FlightVector {
  if (!finite(baseSpeed) || baseSpeed <= 0 || baseSpeed > 100) throw new Error('Invalid fly-camera speed');
  const forward = directionForFlight(angles);
  // In Halo's Z-up world, positive screen-right when facing +X is -Y.
  const right: FlightVector = [Math.sin(angles.yaw), -Math.cos(angles.yaw), 0];
  const v: FlightVector = [0, 0, 0];
  const add = (axis: FlightVector, scalar: number) => {for(let i = 0; i < 3; i++) v[i] += axis[i] * scalar;};
  if (codes.has(bindings.forward)) add(forward, 1);
  if (codes.has(bindings.backward)) add(forward, -1);
  if (codes.has(bindings.right)) add(right, 1);
  if (codes.has(bindings.left)) add(right, -1);
  if (codes.has(bindings.up)) v[2] += 1;
  if (codes.has(bindings.down)) v[2] -= 1;
  const magnitude = Math.hypot(...v);
  if (!magnitude) return v;
  const factor = baseSpeed * (codes.has('ShiftLeft') || codes.has('ShiftRight') ? 3 : 1) / magnitude;
  return v.map(x => x * factor) as FlightVector;
}
/** Do not steal keyboard shortcuts while a form or modal has focus. */
export function isEditingText(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]');
}
export const flightKey = (code: string,bindings:FlightBindings=DEFAULT_FLIGHT_BINDINGS) => [...Object.values(bindings),'ShiftLeft','ShiftRight'].includes(code);

export interface GameplayControls {
  sprint: boolean;
  sprintKey: string;
  sprintMultiplier: number;
  dualWield: boolean;
  dualWieldKey: string;
  swordLunge: boolean;
}
export const DEFAULT_GAMEPLAY_CONTROLS: GameplayControls = {
  sprint: false,
  sprintKey: 'ShiftLeft',
  sprintMultiplier: 1.5,
  dualWield: false,
  dualWieldKey: 'KeyQ',
  swordLunge: false,
};
export const GAMEPLAY_KEYS = [
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'Space',
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
];

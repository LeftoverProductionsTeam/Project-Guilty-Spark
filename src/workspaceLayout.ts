export type PanelDock = 'left' | 'right' | 'top' | 'bottom' | 'float';
export interface PanelPlacement {
  open: boolean;
  dock: PanelDock;
  width: number;
  height: number;
  x: number;
  y: number;
  pinned: boolean;
}
export interface WorkspaceLayout {
  version: 1;
  focus: boolean;
  panels: Record<string, PanelPlacement>;
}
export const defaultPanel = (): PanelPlacement => ({
  open: false,
  dock: 'right',
  width: 360,
  height: 420,
  x: 60,
  y: 40,
  pinned: false,
});
const bounded = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function cleanLayout(input: unknown): WorkspaceLayout {
  const value = input && typeof input === 'object' ? (input as Partial<WorkspaceLayout>) : {};
  const panels: Record<string, PanelPlacement> = {};
  for (const [id, raw] of Object.entries(value.panels ?? {}).slice(0, 40)) {
    if (!/^[a-z][\w-]{0,55}$/.test(id) || !raw || typeof raw !== 'object') continue;
    panels[id] = {
      open: raw.open === true,
      dock: ['left', 'right', 'top', 'bottom', 'float'].includes(raw.dock) ? raw.dock : 'right',
      width: bounded(raw.width, 240, 720, 360),
      height: bounded(raw.height, 160, 900, 420),
      x: bounded(raw.x, 0, 4096, 60),
      y: bounded(raw.y, 0, 2160, 40),
      pinned: raw.pinned === true,
    };
  }
  return { version: 1, focus: value.focus === true, panels };
}
export function changePanel(
  layout: WorkspaceLayout,
  id: string,
  patch: Partial<PanelPlacement>,
): WorkspaceLayout {
  const next = cleanLayout({
    ...layout,
    panels: { ...layout.panels, [id]: { ...defaultPanel(), ...layout.panels[id], ...patch } },
  });
  const panel = next.panels[id];
  if (panel?.open && panel.dock !== 'float')
    for (const [other, value] of Object.entries(next.panels))
      if (other !== id && value.dock === panel.dock) value.open = false;
  return next;
}

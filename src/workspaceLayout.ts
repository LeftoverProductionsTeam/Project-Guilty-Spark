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

/** Every docked drawer reserves space. Old pinned metadata stays compatible,
 * but no longer permits a docked panel to obscure the editor. */
export function drawerInsets(panels:Record<string,PanelPlacement>,width:number,height:number){
 const out={left:0,right:0,top:0,bottom:0};
 for(const panel of Object.values(panels))if(panel.open&&panel.dock!=='float')out[panel.dock]=Math.max(out[panel.dock],panel.dock==='left'||panel.dock==='right'?panel.width:panel.height);
 const fit=(a:number,b:number,available:number,minimum:number)=>{
  if(a+b<=available)return[a,b];
  const count=Number(a>0)+Number(b>0),base=Math.min(minimum,available/(count||1));
  const extra=Math.max(0,available-base*count),wanted=Math.max(0,a-base)+Math.max(0,b-base);
  return [a?Math.floor(base+extra*Math.max(0,a-base)/(wanted||1)):0,b?Math.floor(base+extra*Math.max(0,b-base)/(wanted||1)):0];
 };
 const [left,right]=fit(out.left,out.right,Math.max(0,width-240),240);
 const [top,bottom]=fit(out.top,out.bottom,Math.max(0,height-160),160);
 return {left,right,top,bottom};
}

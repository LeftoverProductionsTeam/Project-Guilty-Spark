import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu, PanelLeftClose, X, RotateCcw, SlidersHorizontal, SquareArrowOutUpRight } from 'lucide-react';
import { useMapState } from '../mapSession';
import { useWindowFullscreen } from '../useWindowFullscreen';
import { WindowControls } from './WindowFrame';
import { changePanel, cleanLayout, defaultPanel } from '../workspaceLayout';
import type { PanelPlacement, WorkspaceLayout } from '../workspaceLayout';
import '../workspacePanels.css';
interface Descriptor {
  id: string;
  label: string;
  defaultDock?: PanelPlacement['dock'];
}
interface ContextValue {
  contentHosts: Record<string, HTMLDivElement | null>;
  attachContent: (id: string, element: HTMLDivElement | null) => void;
  host: HTMLDivElement | null;
  panels: Record<string, PanelPlacement>;
  peek: string | null;
  register: (d: Descriptor) => () => void;
  update: (id: string, p: Partial<PanelPlacement>) => void;
  attention: (id: string, count: number) => void;
  reveal: (id: string) => void;
}
const Context = createContext<ContextValue | null>(null);
export default function WorkspacePanels({
  id,
  workspace,
  children,
  actions,
  onNavigationToggle,
  navigationOpen,
  onPopout,
}: {
  id: string;
  workspace: string;
  children: ReactNode;
  actions?: ReactNode;
  onNavigationToggle: () => void;
  navigationOpen: boolean;
  onPopout?:()=>void;
}) {
  const [raw, setRaw] = useMapState<WorkspaceLayout>(id, `layout.${workspace}`, () => ({
    version: 1,
    focus: false,
    panels: {},
  }));
  const layout = useMemo(() => cleanLayout(raw), [raw]);
  const { fullscreen, change: changeFullscreen, error: windowError } = useWindowFullscreen();
  const [peek, setPeek] = useState<string | null>(null);
  const [frameError, setFrameError] = useState('');
  const [windowHost,setWindowHost]=useState<HTMLElement|null>(null);
  useEffect(()=>setWindowHost(document.getElementById('gs-window-actions')),[]);
  const panelButtons = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [contentHosts, setContentHosts] = useState<Record<string, HTMLDivElement | null>>({});
  const attachContent = useCallback((id:string,element:HTMLDivElement|null)=>setContentHosts(old=>old[id]===element?old:{...old,[id]:element}),[]);
  useEffect(() => setPeek(null), [id, workspace]);
  const [descriptors, setDescriptors] = useState<Descriptor[]>([]),
    [host, setHost] = useState<HTMLDivElement | null>(null),
    [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const element=panelButtons.current;if(!element)return;
    const measure=()=>setOverflowing(element.scrollWidth>element.clientWidth+2);
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[descriptors]);
  const context = useMemo<ContextValue>(
    () => ({
      contentHosts,
      attachContent,
      host,
      panels: layout.panels,
      peek,
      register: (d) => {
        setDescriptors((previous) => (previous.some((p) => p.id === d.id) ? previous : [...previous, d]));
        if (d.defaultDock)
          setRaw((old) =>
            cleanLayout(old).panels[d.id]
              ? old
              : changePanel(cleanLayout(old), d.id, { dock: d.defaultDock, open: false }),
          );
        return () => setDescriptors((previous) => previous.filter((p) => p.id !== d.id));
      },
      update: (panel, patch) => {
        if (patch.open === false) setPeek((old) => (old === panel ? null : old));
        if (patch.open === true) setPeek(panel);
        setRaw((old) => changePanel(cleanLayout(old), panel, patch));
      },
      attention: (panel, count) =>
        setCounts((old) => (old[panel] === count ? old : { ...old, [panel]: count })),
      reveal: (panel) => {
        setPeek(panel);
        setRaw((old) => changePanel(cleanLayout(old), panel, { open: true }));
      },
    }),
    [host, layout, peek, setRaw, contentHosts, attachContent],
  );
  useEffect(()=>{const open=(e:Event)=>{const id=(e as CustomEvent).detail?.id;if(typeof id==='string'&&descriptors.some(d=>d.id===id))context.reveal(id);};window.addEventListener('guilty-spark-reveal-drawer',open);return()=>window.removeEventListener('guilty-spark-reveal-drawer',open);},[context,descriptors]);
  useEffect(() => {
    // Retire old saved Focus layouts; fullscreen keeps tabs and editing tools.
    delete document.documentElement.dataset.gsFocusMode;
    document.documentElement.dataset.gsFullscreen = String(fullscreen);
    return () => {
      delete document.documentElement.dataset.gsFocusMode;
      delete document.documentElement.dataset.gsFullscreen;
    };
  }, [fullscreen]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'F11') {
        e.preventDefault();
        void changeFullscreen();
      }
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        const menu=document.querySelector<HTMLDetailsElement>('.gs-panel-options[open],.gs-panel-overflow[open],.gs-layout-menu[open]');
        if(menu){e.preventDefault();menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus();return;}
        const panel =
          peek ??
          (Object.entries(layout.panels)
                .filter(([, value]) => value.open)
                .at(-1)?.[0]);
        if (panel) {
          e.preventDefault();
          setPeek(null);
          setRaw((old) => changePanel(cleanLayout(old), panel, { open: false }));
          const label = descriptors.find((value) => value.id === panel)?.label;
          Array.from(document.querySelectorAll<HTMLButtonElement>('.gs-panel-buttons button'))
            .find((button) => button.getAttribute('aria-label') === `Toggle ${label}`)
            ?.focus();
        } else if (fullscreen) {
          e.preventDefault();
          void changeFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fullscreen, peek, changeFullscreen, setRaw, layout.panels, descriptors]);
  const padding = { left: 0, right: 0, top:0, bottom: 0 };
    for (const placement of Object.values(layout.panels))
      if (placement.open && placement.pinned && placement.dock !== 'float')
        padding[placement.dock] =
          placement.dock === 'bottom'||placement.dock==='top' ? Math.min(placement.height, 360) : Math.min(placement.width, 440);
  return (
    <Context.Provider value={context}>
      <div className="gs-workspace-shell" data-fullscreen={fullscreen}>
        <nav className="gs-workspace-tools" aria-label="Workspace panels">
          <button
            className="gs-navigation-toggle"
            aria-label="Toggle workspace navigation"
            aria-expanded={navigationOpen}
            aria-controls="gs-workspace-navigation"
            title="Workspaces (Ctrl+\)"
            onClick={onNavigationToggle}
          >
            <Menu size={16} />
          </button>
          <button
            aria-label={fullscreen ? 'Exit fullscreen editing' : 'Fullscreen editing'}
            aria-pressed={fullscreen}
            title="Borderless fullscreen (F11). Escape returns to your workspace."
            onClick={() => void changeFullscreen()}
          >
            {fullscreen ? 'Exit fullscreen · F11' : 'Fullscreen · F11'}
          </button>
          {onPopout&&<button aria-label="Pop out workspace" title="Move this workspace to a resizable window for another monitor" onClick={onPopout}><SquareArrowOutUpRight size={14}/></button>}
          {(windowError || frameError) && <span role="alert">{windowError || frameError}</span>}
          <div className="gs-panel-buttons" ref={panelButtons}>
            {descriptors.map((panel) => (
              <button
                key={panel.id}
                type="button"
                aria-label={`Toggle ${panel.label}`}
                aria-expanded={!!layout.panels[panel.id]?.open}
                onClick={() => {
                  context.update(panel.id, { open: !layout.panels[panel.id]?.open });
                }}
              >
                {panel.label}
                {counts[panel.id] > 0 && <span className="gs-panel-count">{counts[panel.id]}</span>}
              </button>
            ))}
          </div>
          {overflowing&&<details className="gs-panel-overflow">
            <summary aria-label="More workspace drawers" title="All workspace drawers">More</summary>
            <div role="menu" aria-label="Workspace drawers">{descriptors.map(panel=><button key={panel.id} role="menuitemcheckbox" aria-checked={!!layout.panels[panel.id]?.open} onClick={event=>{context.reveal(panel.id);event.currentTarget.closest('details')?.removeAttribute('open');}}>{panel.label}</button>)}</div>
          </details>}
          <div className="gs-layout-actions">
            {actions}
            <details className="gs-layout-menu">
              <summary>Layout</summary>
              <div>
                {descriptors.map((panel) => (
                  <label key={panel.id}>
                    <input
                      type="checkbox"
                      checked={!!layout.panels[panel.id]?.open}
                      onChange={(e) => {
                        context.update(panel.id, { open: e.target.checked });
                      }}
                    />
                    {panel.label}
                  </label>
                ))}
                <button
                  onClick={() => {
                    setPeek(null);
                    setRaw({ version: 1, focus: false, panels: {} });
                  }}
                >
                  <RotateCcw size={13} />
                  Reset layout
                </button>
              </div>
            </details>
          </div>
          {windowHost&&createPortal(<WindowControls
            notify={setFrameError}
            fullscreen={fullscreen}
            onExitFullscreen={() => changeFullscreen(false)}
          />,windowHost)}
        </nav>
        <div
          className="gs-workspace-content"
          style={{ paddingLeft: padding.left, paddingRight: padding.right, paddingTop:padding.top, paddingBottom: padding.bottom }}
        >
          {children}
        </div>
        <div className="gs-panel-layer" ref={setHost} />
      </div>
    </Context.Provider>
  );
}
/** Reveal an existing overlay without changing the map, camera or focus layout. */
export function useRevealWorkspacePanel() {
  const context = useContext(Context);
  return context?.reveal ?? (() => {});
}
export function usePanelAttention(id: string, count: number) {
  const context = useContext(Context);
  const ref = useRef(context);
  ref.current = context;
  useEffect(() => {
    ref.current?.attention(id, count);
    return () => ref.current?.attention(id, 0);
  }, [id, count]);
}
/** Add related controls to the existing drawer, with no second registration,
 * button, close control or overlapping panel. The source editor owns its state. */
export function WorkspacePanelAddon({id,children}:{id:string;children:ReactNode}) {
  const context=useContext(Context);
  if(!context)return <>{children}</>;
  const host=context.contentHosts[id];
  return host?createPortal(children,host):null;
}
export function WorkspacePanel({
  id,
  label,
  defaultDock,
  children,
}: {
  id: string;
  label: string;
  defaultDock?: PanelPlacement['dock'];
  children: ReactNode;
}) {
  const context = useContext(Context),
    register = useRef(context?.register);
  register.current = context?.register;
  const attach = context?.attachContent;
  const appendHost = useCallback((element:HTMLDivElement|null)=>attach?.(id,element),[attach,id]);
  const section = useRef<HTMLElement>(null);
  useEffect(() => register.current?.({ id, label, defaultDock }), [id, label, defaultDock]);
  const placement = context?.panels[id] ?? {
    ...defaultPanel(),
    ...(defaultDock ? { dock: defaultDock } : {}),
  };
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; moved:boolean } | null>(null);
  const resize=useRef<{pointer:number;x:number;y:number;width:number;height:number}|null>(null);
  if (!context) return <>{children}</>;
  if (!context.host) return null;
  const styles =
    placement.dock === 'float'
      ? {
          width: placement.width,
          height: placement.height,
          left: `min(${placement.x}px, max(0px, 100% - ${placement.width}px - 8px))`,
          top: `min(${placement.y}px, max(0px, 100% - ${placement.height}px - 8px))`,
        }
      : placement.dock === 'bottom'||placement.dock==='top'
        ? { height: placement.height }
        : { width: placement.width };
  return createPortal(
    <section
      ref={section}
      onPointerUp={() => {
        if (placement.dock === 'float' && section.current) {
          const { offsetWidth: width, offsetHeight: height } = section.current;
          if (Math.abs(width - placement.width) > 2 || Math.abs(height - placement.height) > 2)
            context.update(id, { width, height });
        }
      }}
      hidden={!placement.open}
      className="gs-workspace-panel"
      data-panel-id={id}
      data-dock={placement.dock}
      style={styles}
      aria-label={`${label} panel`}
    >
      <header>
        <span
          className="gs-panel-drag"
          onPointerDown={(e) => {
            if (e.button !== 0 || !section.current||!context.host) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const rect=section.current.getBoundingClientRect(),layer=context.host.getBoundingClientRect();
            drag.current = {
              pointer: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              left: rect.left-layer.left,
              top: rect.top-layer.top,
              moved:false,
            };
          }}
          onPointerMove={(e) => {
            const origin = drag.current;
            if (origin?.pointer === e.pointerId){
              if(!origin.moved&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)<4)return;
              origin.moved=true;
              context.update(id, {
                dock:'float',
                x: origin.left + e.clientX - origin.x,
                y: origin.top + e.clientY - origin.y,
              });
            }
          }}
          onPointerUp={(event) => {
            if(drag.current?.moved&&context.host){
              const layer=context.host.getBoundingClientRect(),x=event.clientX-layer.left,y=event.clientY-layer.top;
              const dock=x<28?'left':x>layer.width-28?'right':y<28?'top':y>layer.height-28?'bottom':'float';
              context.update(id,{dock});
            }
            drag.current = null;
          }}
          onPointerCancel={()=>{drag.current=null;}}
        >
          <PanelLeftClose size={15} />
          {label}
        </span>
        <details className="gs-panel-options">
          <summary aria-label={`${label} drawer options`} title="Drawer position, size and pinning"><SlidersHorizontal size={14}/></summary>
      <div className="gs-panel-placement">
        <select
          aria-label={`${label} position`}
          value={placement.dock}
          onChange={(e) => context.update(id, { dock: e.target.value as PanelPlacement['dock'] })}
        >
          <option value="left">Left edge</option>
          <option value="right">Right edge</option>
          <option value="top">Top edge</option>
          <option value="bottom">Bottom edge</option>
          <option value="float">Floating</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={placement.pinned}
            onChange={(e) => context.update(id, { pinned: e.target.checked })}
          />
          Pin space
        </label>
        <label>
          {placement.dock === 'bottom'||placement.dock==='top' ? 'Height' : 'Width'}
          <input
            aria-label={`${label} size`}
            type="range"
            min={placement.dock === 'bottom'||placement.dock==='top' ? 160 : 240}
            max={placement.dock === 'bottom'||placement.dock==='top' ? 600 : 720}
            value={placement.dock === 'bottom'||placement.dock==='top' ? placement.height : placement.width}
            onChange={(e) =>
              context.update(id, {
                [placement.dock === 'bottom'||placement.dock==='top' ? 'height' : 'width']: Number(e.target.value),
              })
            }
          />
        </label>
      </div>
        </details>
        <button aria-label={`Close ${label}`} onClick={() => context.update(id, { open: false })}>
          <X size={15} />
        </button>
      </header>
      <div className="gs-panel-content">{children}<div ref={appendHost} className="gs-panel-addons"/></div>
      <div className="gs-panel-resize" role="separator" tabIndex={0} aria-label={`Resize ${label} drawer`}
        aria-orientation={placement.dock==='top'||placement.dock==='bottom'?'horizontal':'vertical'}
        onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);resize.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,width:placement.width,height:placement.height};}}
        onPointerMove={event=>{const origin=resize.current;if(!origin||origin.pointer!==event.pointerId)return;const dx=event.clientX-origin.x,dy=event.clientY-origin.y;if(placement.dock==='float')context.update(id,{width:origin.width+dx,height:origin.height+dy});else if(placement.dock==='top'||placement.dock==='bottom')context.update(id,{height:origin.height+dy*(placement.dock==='bottom'?-1:1)});else context.update(id,{width:origin.width+dx*(placement.dock==='right'?-1:1)});}}
        onPointerUp={()=>{resize.current=null;}} onPointerCancel={()=>{resize.current=null;}}
        onKeyDown={event=>{const horizontal=placement.dock==='top'||placement.dock==='bottom',delta=event.key===(horizontal?'ArrowDown':'ArrowRight')?10:event.key===(horizontal?'ArrowUp':'ArrowLeft')?-10:0;if(!delta)return;event.preventDefault();const sign=placement.dock==='right'||placement.dock==='bottom'?-1:1;context.update(id,horizontal?{height:placement.height+delta*sign}:{width:placement.width+delta*sign});}}/>
    </section>,
    context.host,
    id,
  );
}

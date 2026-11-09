import PagedSurface from './PagedSurface';
import WorkspaceSession from './WorkspaceSession';
import {navigateComposite,focusCompositeItem} from '../keyboardNavigation';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceActivity } from './WorkspaceActivity';
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Menu, PanelLeftClose, X, RotateCcw, SlidersHorizontal, SquareArrowOutUpRight, Expand, Shrink, CornerUpLeft } from 'lucide-react';
import { useMapState,readMapSession,writeMapSession } from '../mapSession';
import {native} from '../api';
import {getCurrentWindow} from '@tauri-apps/api/window';
import { useWindowFullscreen } from '../useWindowFullscreen';
import { WindowControls } from './WindowFrame';
import { requestedPanel } from '../detachedPanels';
import { changePanel, cleanLayout, defaultPanel, drawerInsets } from '../workspaceLayout';
import type { PanelPlacement, WorkspaceLayout } from '../workspaceLayout';
import '../workspacePanels.css';
import './mapTabsMenu.css';
interface Descriptor {
  id: string;
  label: string;
  defaultDock?: PanelPlacement['dock'];
}
export interface WorkspaceFileAction {
  id: string; label: string; run: () => void; disabled?: boolean; hint?: string; shortcut?: string; group?: 'new';
}
interface ContextValue {
  scope:string;
  registerFileActions: (scope: string, actions: WorkspaceFileAction[]) => () => void;
  contentHosts: Record<string, HTMLDivElement | null>;
  attachContent: (id: string, element: HTMLDivElement | null) => void;
  host: HTMLDivElement | null;
  panels: Record<string, PanelPlacement>;
  peek: string | null;
  register: (d: Descriptor) => () => void;
  update: (id: string, p: Partial<PanelPlacement>) => void;
  attention: (id: string, count: number) => void;
  reveal: (id: string) => void;
  detach?: (id:string)=>Promise<boolean>;
  canDetach?: (id:string)=>boolean;
  detached: string|null;
  insets:{left:number;right:number;top:number;bottom:number};
}
const Context = createContext<ContextValue | null>(null);
export function closeOtherHeaderMenus(current:HTMLDetailsElement){
  for(const menu of document.querySelectorAll<HTMLDetailsElement>('.gs-file-menu[open],.gs-map-switcher[open],.gs-panel-overflow[open],.gs-layout-menu[open],.gs-studio-menu[open]'))if(menu!==current)menu.open=false;
}
export function headerMenuKeyDown(event:ReactKeyboardEvent<HTMLDetailsElement>){
  if(event.defaultPrevented || event.target instanceof Element&&event.target.closest('input,select,textarea,[role="menu"]')||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const menu=event.currentTarget;menu.open=true;
  const buttons=[...menu.querySelectorAll<HTMLElement>('[role="menuitem"],button:not(:disabled)')].filter(item=>!item.matches(':disabled')&&item.getClientRects().length>0&&!item.closest('[hidden],.gs-surface-pages')&&(!item.closest('[inert]')||!!item.closest('[data-gs-offpage]'))),at=buttons.indexOf(document.activeElement as HTMLElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:at<0?(event.key==='ArrowUp'?buttons.length-1:0):(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
  if(buttons[next])focusCompositeItem(buttons[next]);
}
function HeaderTools({children,target="gs-header-workspace-tools"}:{children:ReactNode;target?:string}){
  const [host,setHost]=useState<HTMLElement|null>(null);
  useEffect(()=>setHost(document.getElementById(target)),[target]);
  return host?createPortal(children,host):children;
}
export default function WorkspacePanels({
  id,
  workspace,
  children,
  actions,
  viewActions,
  onNavigationToggle,
  navigationOpen,
  onPopout,
  onNewWindow,
  fileActions = [],
  onDetachPanel,
  canDetachPanel,
  onSaveLayout,
  onRestoreLayout,
  layoutName,
  layoutNames,
  onLayoutName,
  onListLayouts,
}: {
  id: string;
  workspace: string;
  children: ReactNode;
  actions?: ReactNode;
  viewActions?: ReactNode;
  onNavigationToggle: () => void;
  navigationOpen: boolean;
  onPopout?:()=>void;
  onNewWindow?:()=>void;
  fileActions?: WorkspaceFileAction[];
  onDetachPanel?:(id:string)=>Promise<boolean>;
  canDetachPanel?:(id:string)=>boolean;
  onSaveLayout?:()=>void;
  onRestoreLayout?:()=>void;
  layoutName?:string;
  layoutNames?:string[];
  onLayoutName?:(name:string)=>void;
  onListLayouts?:()=>void;
}) {
  const detached=native?requestedPanel(location.search,workspace):null;
  const contentRoot=useRef<HTMLDivElement>(null);
  const [contentSize,setContentSize]=useState({width:innerWidth,height:innerHeight});
  useLayoutEffect(()=>{const node=contentRoot.current;if(!node)return;const observer=new ResizeObserver(()=>{const r=node.getBoundingClientRect();setContentSize(old=>old.width===r.width&&old.height===r.height?old:{width:r.width,height:r.height});});observer.observe(node);return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>{
    const root=contentRoot.current;
    if(!root||document.documentElement.dataset.gsWorkspaceTransitions==='false'||document.documentElement.dataset.gsReducedMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const animation=root.animate?.([{opacity:.82},{opacity:1}],{duration:160,easing:'ease-out'});
    return()=>animation?.cancel();
  },[id,workspace]);
  const windowLayoutId=native?`${id}:window:${getCurrentWindow().label}`:id;
  const [raw, setRaw] = useMapState<WorkspaceLayout>(windowLayoutId, `layout.${workspace}`, () => readMapSession<WorkspaceLayout>(id,`layout.${workspace}`,{
    version: 1,
    focus: false,
    panels: {},
  }));
  // A new detached view inherits the last layout, then arranges its own panels.
  // Moving a drawer on one monitor must not cover another window's inspector.
  useEffect(()=>{if(!native||detached)return;const persist=()=>writeMapSession(id,`layout.${workspace}`,raw);persist();window.addEventListener('gs:save-viewport-context',persist);return()=>window.removeEventListener('gs:save-viewport-context',persist);},[id,workspace,raw,detached]);
  const layout = useMemo(() => cleanLayout(raw), [raw]);
  const { fullscreen, change: changeFullscreen, error: windowError } = useWindowFullscreen();
  const [peek, setPeek] = useState<string | null>(null);
  const [frameError, setFrameError] = useState('');
  const [windowHost,setWindowHost]=useState<HTMLElement|null>(null);
  useEffect(()=>setWindowHost(document.getElementById('gs-window-actions')),[]);
  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{if(!(event.target instanceof Node))return;
      for(const menu of document.querySelectorAll<HTMLDetailsElement>('.gs-file-menu[open],.gs-panel-overflow[open],.gs-layout-menu[open],.gs-studio-menu[open]'))
        if(!menu.contains(event.target))menu.open=false;
    };
    window.addEventListener('pointerdown',dismiss);return()=>window.removeEventListener('pointerdown',dismiss);
  },[]);
  const [contentHosts, setContentHosts] = useState<Record<string, HTMLDivElement | null>>({});
  const attachContent = useCallback((id:string,element:HTMLDivElement|null)=>setContentHosts(old=>old[id]===element?old:{...old,[id]:element}),[]);
  useEffect(() => setPeek(null), [id, workspace]);
  const [descriptors, setDescriptors] = useState<Descriptor[]>([]),
    [host, setHost] = useState<HTMLDivElement | null>(null),
    [counts, setCounts] = useState<Record<string, number>>({});
  const [fileGroups,setFileGroups] = useState<Record<string,{token:object;actions:WorkspaceFileAction[]}>>({});
  const registerFileActions=useCallback((scope:string,actions:WorkspaceFileAction[])=>{
    const token={};setFileGroups(previous=>({...previous,[scope]:{token,actions}}));
    return()=>setFileGroups(previous=>{if(previous[scope]?.token!==token)return previous;const next={...previous};delete next[scope];return next;});
  },[]);
  const toolGroups=useMemo(()=>{
    const groups=new Map<string,Descriptor[]>();
    for(const panel of descriptors){
      const group=['Inspector','Object tags','Objects','Asset library'].includes(panel.label)?'Edit & inspect'
        :['Camera','Map sounds','Help'].includes(panel.label)?'View & sound'
        :['Game connection','SparkLink','Live Studio','Co-edit setup'].includes(panel.label)?'Live & collaborate':'Project & build';
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group)!.push(panel);
    }
    return [...groups];
  },[descriptors]);
  const padding=useMemo(()=>drawerInsets(detached?{}:layout.panels,contentSize.width,contentSize.height),[detached,layout.panels,contentSize]);
  const context = useMemo<ContextValue>(
    () => ({
      scope:windowLayoutId,
      registerFileActions,
      contentHosts,
      attachContent,
      host,
      panels: layout.panels,
      peek,
      detach:onDetachPanel,
      canDetach:canDetachPanel,
      detached,insets:padding,
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
    [windowLayoutId, host, layout, peek, setRaw, contentHosts, attachContent,onDetachPanel,canDetachPanel,detached,registerFileActions,padding],
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
  // Keep one listener: another shortcut can synchronously render the editor
  // during this same event. Removing/readding a listener then loses Escape.
  const keyState=useRef({fullscreen,peek,detached,panels:layout.panels,changeFullscreen,setRaw});
  keyState.current={fullscreen,peek,detached,panels:layout.panels,changeFullscreen,setRaw};
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      const {fullscreen,peek,detached,panels,changeFullscreen,setRaw}=keyState.current;
      if (e.defaultPrevented) return;
      if (e.key === 'F11') {
        e.preventDefault();
        void changeFullscreen();
      }
      if(e.key==='Escape'&&!document.querySelector('[role="dialog"]')){
        const menu=document.querySelector<HTMLDetailsElement>('.gs-panel-options[open],.gs-file-menu[open],.gs-panel-overflow[open],.gs-layout-menu[open],.gs-studio-menu[open]');
        if(menu){e.preventDefault();menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus();return;}
      }
      if(e.key==='Escape'&&detached&&fullscreen&&!document.querySelector('[role="dialog"]')){
        e.preventDefault();void changeFullscreen(false);return;
      }
      if (e.key === 'Escape' && !detached && !document.querySelector('[role="dialog"]')) {
        const panel =
          peek ??
          (Object.entries(panels)
                .filter(([, value]) => value.open)
                .at(-1)?.[0]);
        if (panel) {
          e.preventDefault();
          setPeek(null);
          setRaw((old) => changePanel(cleanLayout(old), panel, { open: false }));
          document.querySelector<HTMLElement>('.gs-panel-overflow>summary')?.focus();
        } else if (fullscreen) {
          e.preventDefault();
          void changeFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <Context.Provider value={context}>
      <div className="gs-workspace-shell" data-fullscreen={fullscreen} data-workspace={workspace} data-detached-panel={detached??undefined}>
        <HeaderTools target="gs-header-file-tools"><nav className="gs-workspace-menus" aria-label="File and tools">
          <details className="gs-file-menu" onToggle={event=>{if(event.currentTarget.open)closeOtherHeaderMenus(event.currentTarget);}} onKeyDown={headerMenuKeyDown}>
            <summary aria-label="File menu">File <span aria-hidden="true">▾</span></summary>
            <div role="menu" aria-label="File commands" onKeyDown={navigateComposite}><PagedSurface name="file-menu" label="File menu" scope={windowLayoutId} maxHeight={400}>
              {[fileActions,...Object.values(fileGroups).map(group=>group.actions)].filter(group=>group.length).map((group,index)=><section key={index} role="group" aria-label={index===0?'Project files':'Workspace files'}>
                {group.some(command=>command.group==='new')&&<details className="gs-file-new" onKeyDown={event=>{
                  const details=event.currentTarget,summary=details.querySelector('summary')!;
                  if((event.key==='ArrowRight'||event.key==='ArrowDown')&&event.target===summary){event.preventDefault();event.stopPropagation();details.open=true;details.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}
                  else if(event.key==='ArrowLeft'||event.key==='Escape'){event.preventDefault();event.stopPropagation();details.open=false;summary.focus();}
                }}>
                  <summary role="menuitem" aria-haspopup="menu" aria-label="New">New <span aria-hidden="true">▸</span></summary>
                  <div role="menu" aria-label="New project commands" onKeyDown={navigateComposite}>{group.filter(command=>command.group==='new').map(command=><button key={command.id} role="menuitem" aria-label={command.label} disabled={command.disabled} title={command.hint} onClick={event=>{const file=event.currentTarget.closest('.gs-file-menu');file?.querySelector('details')?.removeAttribute('open');file?.removeAttribute('open');command.run();}}>{command.label}</button>)}</div>
                </details>}
                {group.filter(command=>command.group!=='new').map(command=><button key={command.id} role="menuitem" aria-label={command.label} disabled={command.disabled} title={command.hint} aria-keyshortcuts={command.shortcut} onClick={event=>{event.currentTarget.closest('.gs-file-menu')?.removeAttribute('open');command.run();}}><span>{command.label}</span>{command.shortcut&&<kbd>{command.shortcut.replace('Control+','Ctrl+')}</kbd>}</button>)}
              </section>)}</PagedSurface>
            </div>
          </details>
          {!detached&&descriptors.length>0&&<details className="gs-panel-overflow gs-tools-menu" onToggle={event=>{if(event.currentTarget.open){closeOtherHeaderMenus(event.currentTarget);const popup=event.currentTarget.querySelector<HTMLElement>('[role="menu"]');if(popup){popup.style.setProperty('--gs-tools-nudge','0px');requestAnimationFrame(()=>{const rect=popup.getBoundingClientRect();popup.style.setProperty('--gs-tools-nudge',`${Math.max(0,8-rect.left)-Math.max(0,rect.right-innerWidth+8)}px`);});}}}} onKeyDown={headerMenuKeyDown}>
            <summary aria-label="More workspace drawers" title="Workspace tools and panels">Tools <span aria-hidden="true">▾</span>{Object.values(counts).some(count=>count>0)&&<span className="gs-panel-count" aria-label="Tools need review">•</span>}</summary>
            <div role="menu" aria-label="Workspace drawers" onKeyDown={navigateComposite}><PagedSurface name="tools-menu" label="Tools menu" scope={windowLayoutId} maxHeight={360}>{onNewWindow&&<section className="gs-tools-window-command" role="group" aria-label="Windows"><button role="menuitem" onClick={event=>{event.currentTarget.closest('details')!.open=false;onNewWindow();}}><SquareArrowOutUpRight size={13}/><span>New workspace window</span></button></section>}{toolGroups.map(([group,panels])=><section key={group} role="group" aria-label={group}><strong>{group}</strong>{panels.map(panel=><button key={panel.id} data-panel-shortcut={panel.id} role="menuitemcheckbox" aria-label={panel.label} aria-checked={!!layout.panels[panel.id]?.open} onClick={event=>{context.reveal(panel.id);event.currentTarget.closest('details')?.removeAttribute('open');}}>{panel.label}{counts[panel.id]>0&&<span className="gs-panel-count" aria-hidden="true">{counts[panel.id]}</span>}</button>)}</section>)}</PagedSurface></div>
          </details>}
        </nav></HeaderTools>
        <HeaderTools><nav className="gs-workspace-tools" aria-label="Workspace panels">
          {!windowHost&&<button
            className="gs-navigation-toggle"
            aria-label="Toggle workspace navigation"
            aria-expanded={navigationOpen}
            aria-controls="gs-workspace-navigation"
            title="Workspaces (Ctrl+\)"
            onClick={onNavigationToggle}
          >
            <Menu size={16} />
          </button>}
          {detached&&<button className="gs-return-panel" aria-label="Return panel to workspace" title="Save and return this panel to its original workspace" onClick={()=>window.dispatchEvent(new Event('gs:return-panel-to-origin'))}><CornerUpLeft size={14}/>Return</button>}
          {(windowError || frameError) && <span role="alert">{windowError || frameError}</span>}
          <div className="gs-layout-actions">
            {actions}
            <details className="gs-layout-menu gs-view-menu" onToggle={event=>{if(event.currentTarget.open){if(!detached)onListLayouts?.();closeOtherHeaderMenus(event.currentTarget);}}} onKeyDown={headerMenuKeyDown}>
              <summary aria-label="View and window options">View <span aria-hidden="true">▾</span></summary>
              <div><PagedSurface name="view-menu" label="View menu" scope={windowLayoutId} maxHeight={420}>
                <section className="gs-view-commands" aria-label="Window view">
                  <button aria-label={fullscreen?'Exit fullscreen editing':'Fullscreen editing'} aria-pressed={fullscreen} onClick={event=>{event.currentTarget.closest('details')!.open=false;void changeFullscreen();}}>{fullscreen?<Shrink size={15}/>:<Expand size={15}/>}<span>{fullscreen?'Exit fullscreen':'Fullscreen'}</span><kbd>F11</kbd></button>
                  {onPopout&&!detached&&<button aria-label="Pop out workspace" title="Open this workspace in a resizable window for another monitor. Map editors move their current draft and Undo history to that window." onClick={event=>{event.currentTarget.closest('details')!.open=false;onPopout();}}><SquareArrowOutUpRight size={15}/><span>Move workspace to a new window</span></button>}
                </section>
                {viewActions&&<section className="gs-view-audio" aria-label="Map preview sound"><strong>Map preview sound</strong>{viewActions}</section>}
                {!detached&&<>
                {onLayoutName&&<label className="gs-layout-profile">Window layout<input aria-label="Window layout name" maxLength={80} value={layoutName??'Studio'} list="gs-saved-layouts" onChange={event=>onLayoutName(event.target.value)}/><datalist id="gs-saved-layouts">{layoutNames?.map(name=><option key={name} value={name}/>)}</datalist></label>}
                {onSaveLayout&&<button onClick={onSaveLayout}>Save workspace windows</button>}
                {onRestoreLayout&&<button onClick={onRestoreLayout}>Restore workspace windows</button>}
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
                </>}
              </PagedSurface></div>
            </details>
          </div>
          {windowHost&&createPortal(<WindowControls
            notify={setFrameError}
            fullscreen={fullscreen}
            onExitFullscreen={() => changeFullscreen(false)}
          />,windowHost)}
        </nav></HeaderTools>
        <div
          className="gs-workspace-content"
          ref={contentRoot}
          style={{ paddingLeft: padding.left, paddingRight: padding.right, paddingTop:padding.top, paddingBottom: padding.bottom }}
        >
          {children}
        </div>
        <div className="gs-panel-layer" ref={setHost} />
      </div>
    </Context.Provider>
  );
}
/** Register expensive drawers without loading their contents while closed. */
export function useWorkspacePanelOpen(id:string){
  const context=useContext(Context),{active}=useWorkspaceActivity();
  return active&&context?.panels[id]?.open===true;
}
/** Reveal an existing overlay without changing the map, camera or focus layout. */
export function useRevealWorkspacePanel() {
  const context = useContext(Context);
  const {active}=useWorkspaceActivity();
  return active ? context?.reveal ?? (() => {}) : () => {};
}
export function usePanelAttention(id: string, count: number) {
  const {active}=useWorkspaceActivity();
  const context = useContext(Context);
  const ref = useRef(context);
  ref.current = context;
  useEffect(() => {
    if(!active)return;
    ref.current?.attention(id, count);
    return () => ref.current?.attention(id, 0);
  }, [active,id, count]);
}
/** Add related controls to the existing drawer, with no second registration,
 * button, close control or overlapping panel. The source editor owns its state. */
export function useWorkspaceFileActions(scope:string,actions:WorkspaceFileAction[]) {
  const context=useContext(Context),{active}=useWorkspaceActivity();
  const latest=useRef(actions);latest.current=actions;
  const register=context?.registerFileActions;
  const signature=JSON.stringify(actions.map(({id,label,disabled,hint,shortcut})=>({id,label,disabled,hint,shortcut})));
  useEffect(()=>{
    if(!active||!register)return;
    return register(scope,latest.current.map(command=>({...command,run:()=>latest.current.find(next=>next.id===command.id)?.run()})));
  },[scope,active,register,signature]);
}
export function WorkspacePanelAddon({id,children}:{id:string;children:ReactNode}) {
  const context=useContext(Context);
  const {scope}=useWorkspaceActivity();
  if(!context)return <>{children}</>;
  const host=context.contentHosts[`${scope}:${id}`];
  return host?createPortal(children,host):null;
}
export function WorkspacePanel({
  id,
  label,
  defaultDock,
  children,
  onDetach,
}: {
  id: string;
  label: string;
  defaultDock?: PanelPlacement['dock'];
  children: ReactNode;
  onDetach?:()=>Promise<boolean>;
}) {
  const {active,scope}=useWorkspaceActivity();
  const context = useContext(Context),
    register = useRef(context?.register);
  register.current = context?.register;
  const attach = context?.attachContent;
  const appendHost = useCallback((element:HTMLDivElement|null)=>attach?.(`${scope}:${id}`,element),[attach,id,scope]);
  const section = useRef<HTMLElement>(null);
  useEffect(() => active ? register.current?.({ id, label, defaultDock }) : undefined, [active,id, label, defaultDock]);
  const placement = context?.panels[id] ?? {
    ...defaultPanel(),
    ...(defaultDock ? { dock: defaultDock } : {}),
  };
  const detached=context?.detached===id;
  const detachAction=onDetach??(context?.canDetach?.(id)&&context?.detach?()=>context.detach!(id):undefined);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; moved:boolean; placement:PanelPlacement } | null>(null);
  const resize=useRef<{pointer:number;x:number;y:number;width:number;height:number}|null>(null);
  const [detaching,setDetaching]=useState(false),[detachError,setDetachError]=useState('');
  const detach=()=>{
    if(!detachAction||detaching)return;setDetaching(true);setDetachError('');
    void detachAction().then(moved=>{if(moved)context?.update(id,{open:false});}).catch(error=>setDetachError(String(error))).finally(()=>setDetaching(false));
  };
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
        ? { height: detached?placement.height:context.insets[placement.dock] }
        : { width: detached?placement.width:context.insets[placement.dock],top:context.insets.top,bottom:context.insets.bottom };
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
      hidden={!active || (context.detached? !detached : !placement.open)}
      className="gs-workspace-panel"
      data-panel-id={id}
      data-dock={placement.dock}
      data-detached={detached||undefined}
      style={styles}
      aria-label={`${label} panel`}
    >
      <header>
        <span
          className="gs-panel-drag"
          onPointerDown={(e) => {
            if (e.button !== 0 || detached || !section.current||!context.host) return;
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
              placement:{...placement},
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
            if(drag.current?.moved&&detachAction&&(event.clientX<0||event.clientY<0||event.clientX>innerWidth||event.clientY>innerHeight)){context.update(id,drag.current.placement);drag.current=null;detach();return;}
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
        {native&&detachAction&&!context.detached&&<button aria-label={`Detach ${label}`} title={`Move ${label} to a separate native editing window`} disabled={detaching} onClick={detach}><SquareArrowOutUpRight size={14}/></button>}
        {!detached&&<details className="gs-panel-options">
          <summary aria-label={`${label} drawer options`} title="Drawer position and size"><SlidersHorizontal size={14}/></summary>
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
        <small>Docked drawers make space for the editor. Choose Floating or detach for a separate view.</small>
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
        </details>}
        {!detached&&<button aria-label={`Close ${label}`} onClick={() => context.update(id, { open: false })}>
          <X size={15} />
        </button>}
      </header>
      <div className="gs-panel-content"><WorkspaceSession id={context.scope} workspace={'drawer-'+id}><PagedSurface name={id} label={label+' drawer'} scope={context.scope} fill>{detachError&&<p role="alert">{detachError}</p>}{children}<div ref={appendHost} className="gs-panel-addons"/></PagedSurface></WorkspaceSession></div>
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

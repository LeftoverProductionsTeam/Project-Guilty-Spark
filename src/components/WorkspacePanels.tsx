import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu, PanelLeftClose, PanelRightOpen, Scan, X, RotateCcw } from 'lucide-react';
import { useMapState } from '../mapSession';
import { useWindowFullscreen } from '../useWindowFullscreen';
import { changePanel, cleanLayout, defaultPanel } from '../workspaceLayout';
import type { PanelPlacement, WorkspaceLayout } from '../workspaceLayout';
import '../workspacePanels.css';
interface Descriptor {
  id: string;
  label: string;
}
interface ContextValue {
  host: HTMLDivElement | null;
  panels: Record<string, PanelPlacement>;
  focus: boolean;
  peek: string | null;
  register: (d: Descriptor) => () => void;
  update: (id: string, p: Partial<PanelPlacement>) => void;
  attention: (id: string, count: number) => void;
}
const Context = createContext<ContextValue | null>(null);
export default function WorkspacePanels({
  id,
  workspace,
  children,
  actions,
  onNavigationToggle,
  navigationOpen,
  onHeaderToggle,
  headerOpen,
}: {
  id: string;
  workspace: string;
  children: ReactNode;
  actions?: ReactNode;
  onNavigationToggle: () => void;
  navigationOpen: boolean;
  onHeaderToggle: () => void;
  headerOpen: boolean;
}) {
  const [raw, setRaw] = useMapState<WorkspaceLayout>(id, `layout.${workspace}`, () => ({
    version: 1,
    focus: false,
    panels: {},
  }));
  const layout = useMemo(() => cleanLayout(raw), [raw]);
  const { fullscreen, change: changeFullscreen, error: windowError } = useWindowFullscreen();
  const focus = layout.focus || fullscreen;
  const [peek, setPeek] = useState<string | null>(null);
  useEffect(() => setPeek(null), [fullscreen, id, workspace]);
  const [descriptors, setDescriptors] = useState<Descriptor[]>([]),
    [host, setHost] = useState<HTMLDivElement | null>(null),
    [counts, setCounts] = useState<Record<string, number>>({});
  const context = useMemo<ContextValue>(
    () => ({
      host,
      panels: layout.panels,
      focus,
      peek,
      register: (d) => {
        setDescriptors((previous) => (previous.some((p) => p.id === d.id) ? previous : [...previous, d]));
        return () => setDescriptors((previous) => previous.filter((p) => p.id !== d.id));
      },
      update: (panel, patch) => {
        if (patch.open === false) setPeek((old) => (old === panel ? null : old));
        setRaw((old) => changePanel(cleanLayout(old), panel, patch));
      },
      attention: (panel, count) =>
        setCounts((old) => (old[panel] === count ? old : { ...old, [panel]: count })),
    }),
    [host, layout, focus, peek, setRaw],
  );
  async function leaveFocus() {
    if (fullscreen) await changeFullscreen(false);
    setRaw((old) => ({ ...cleanLayout(old), focus: false }));
  }
  useEffect(() => {
    document.documentElement.dataset.gsFocusMode = String(focus);
    document.documentElement.dataset.gsFullscreen = String(fullscreen);
    return () => {
      delete document.documentElement.dataset.gsFocusMode;
      delete document.documentElement.dataset.gsFullscreen;
    };
  }, [focus, fullscreen]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'F11') {
        e.preventDefault();
        void changeFullscreen();
      }
      if (e.key === 'Escape' && focus && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        if (fullscreen && peek) setPeek(null);
        else void leaveFocus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [focus, fullscreen, peek, changeFullscreen, setRaw]);
  const padding = { left: 0, right: 0, bottom: 0 };
  if (!focus)
    for (const placement of Object.values(layout.panels))
      if (placement.open && placement.pinned && placement.dock !== 'float')
        padding[placement.dock] =
          placement.dock === 'bottom' ? Math.min(placement.height, 360) : Math.min(placement.width, 440);
  return (
    <Context.Provider value={context}>
      <div className="gs-workspace-shell" data-focus={focus} data-fullscreen={fullscreen}>
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
            className="gs-header-toggle"
            aria-label="Toggle window and project header"
            aria-expanded={headerOpen}
            aria-controls="gs-window-header"
            title="Window and project controls (Ctrl+Shift+\)"
            onClick={onHeaderToggle}
          >
            Window
          </button>
          <button
            aria-label={fullscreen ? 'Exit fullscreen editing' : 'Fullscreen editing'}
            aria-pressed={fullscreen}
            title="Borderless fullscreen (F11). Escape returns to your workspace."
            onClick={() => void changeFullscreen()}
          >
            {fullscreen ? 'Exit fullscreen · F11' : 'Fullscreen · F11'}
          </button>
          {windowError && <span role="alert">{windowError}</span>}
          <div className="gs-panel-buttons">
            {descriptors.map((panel) => (
              <button
                key={panel.id}
                type="button"
                aria-label={`Toggle ${panel.label}`}
                aria-expanded={(!focus || peek === panel.id) && !!layout.panels[panel.id]?.open}
                onClick={() => {
                  if (fullscreen) {
                    setPeek((old) => (old === panel.id ? null : panel.id));
                    context.update(panel.id, { open: true });
                  } else if (focus) {
                    void leaveFocus();
                    setRaw((old) =>
                      changePanel({ ...cleanLayout(old), focus: false }, panel.id, { open: true }),
                    );
                  } else context.update(panel.id, { open: !layout.panels[panel.id]?.open });
                }}
              >
                <PanelRightOpen size={13} />
                {panel.label}
                {counts[panel.id] > 0 && <span className="gs-panel-count">{counts[panel.id]}</span>}
              </button>
            ))}
          </div>
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
                        if (fullscreen) setPeek(e.target.checked ? panel.id : null);
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
            <button
              type="button"
              aria-pressed={focus}
              onClick={() =>
                focus ? void leaveFocus() : setRaw((old) => ({ ...cleanLayout(old), focus: true }))
              }
            >
              <Scan size={13} />
              {focus ? 'Exit focus · Esc' : 'Focus mode'}
            </button>
          </div>
        </nav>
        <div
          className="gs-workspace-content"
          style={{ paddingLeft: padding.left, paddingRight: padding.right, paddingBottom: padding.bottom }}
        >
          {children}
        </div>
        <div className="gs-panel-layer" ref={setHost} />
      </div>
    </Context.Provider>
  );
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
export function WorkspacePanel({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const context = useContext(Context),
    register = useRef(context?.register);
  register.current = context?.register;
  const section = useRef<HTMLElement>(null);
  useEffect(() => register.current?.({ id, label }), [id, label]);
  const placement = context?.panels[id] ?? defaultPanel();
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);
  if (!context) return <>{children}</>;
  if (!context.host) return null;
  const styles =
    placement.dock === 'float'
      ? {
          width: placement.width,
          height: placement.height,
          left: `min(${placement.x}px, max(0px, 100% - 260px))`,
          top: `min(${placement.y}px, max(0px, 100% - 160px))`,
        }
      : placement.dock === 'bottom'
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
      hidden={(context.focus && context.peek !== id) || !placement.open}
      className="gs-workspace-panel"
      data-dock={placement.dock}
      style={styles}
      aria-label={`${label} panel`}
    >
      <header>
        <span
          className="gs-panel-drag"
          onPointerDown={(e) => {
            if (e.button !== 0 || placement.dock !== 'float') return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              pointer: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              left: placement.x,
              top: placement.y,
            };
          }}
          onPointerMove={(e) => {
            const origin = drag.current;
            if (origin?.pointer === e.pointerId)
              context.update(id, {
                x: origin.left + e.clientX - origin.x,
                y: origin.top + e.clientY - origin.y,
              });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <PanelLeftClose size={15} />
          {label}
        </span>
        <button aria-label={`Close ${label}`} onClick={() => context.update(id, { open: false })}>
          <X size={15} />
        </button>
      </header>
      <div className="gs-panel-placement">
        <select
          aria-label={`${label} position`}
          value={placement.dock}
          onChange={(e) => context.update(id, { dock: e.target.value as PanelPlacement['dock'] })}
        >
          <option value="left">Left edge</option>
          <option value="right">Right edge</option>
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
          {placement.dock === 'bottom' ? 'Height' : 'Width'}
          <input
            aria-label={`${label} size`}
            type="range"
            min={placement.dock === 'bottom' ? 160 : 240}
            max={placement.dock === 'bottom' ? 600 : 720}
            value={placement.dock === 'bottom' ? placement.height : placement.width}
            onChange={(e) =>
              context.update(id, {
                [placement.dock === 'bottom' ? 'height' : 'width']: Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <div className="gs-panel-content">{children}</div>
    </section>,
    context.host,
    id,
  );
}

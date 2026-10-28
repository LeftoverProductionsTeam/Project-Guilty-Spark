import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { readMapSession, writeMapSession } from '../mapSession';
/** Remember each tool's scroll position without retaining hidden WebGL canvases. */
export default function WorkspaceSession({
  id,
  workspace,
  children,
}: {
  id: string;
  workspace: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const key = `scroll.${workspace}`,
      positions = readMapSession<Record<string, [number, number]>>(id, key, {});
    const targets = () =>
      [host.closest('main'), ...host.querySelectorAll<HTMLElement>('*')].filter(
        (e): e is HTMLElement =>
          e instanceof HTMLElement &&
          (e.scrollHeight > e.clientHeight + 4 || e.scrollWidth > e.clientWidth + 4),
      );
    const name = (e: HTMLElement, index: number) =>
      e.tagName === 'MAIN' ? 'main' : `${e.tagName}:${e.className}:${index}`;
    const restore = () =>
      targets().forEach((e, index) => {
        const p = positions[name(e, index)];
        if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) {
          e.scrollTop = p[0];
          e.scrollLeft = p[1];
        }
      });
    const frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      const saved: Record<string, [number, number]> = {};
      targets().forEach((e, index) => {
        saved[name(e, index)] = [e.scrollTop, e.scrollLeft];
      });
      writeMapSession(id, key, saved);
    };
  }, [id, workspace]);
  return (
    <div ref={root} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

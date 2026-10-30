import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import type { Vec3 } from './types';
import type { ViewportAsset } from './viewportAssets';

/** Pointer-driven drags also work when WebView2's native file drop owns HTML5 DnD. */
export function useViewportAssetDrop(
  projectId: string,
  viewport: MutableRefObject<HTMLElement | null>,
  point: MutableRefObject<((x: number, y: number) => Vec3 | null) | null>,
  drop: (key: string, point: Vec3) => void,
  files?: (paths: string[], point: Vec3) => void,
) {
  const [dragging, setDragging] = useState(false),
    callback = useRef(drop);
  callback.current = drop;
  const fileCallback = useRef(files);
  fileCallback.current = files;
  const pending = useRef<{ id: number; key: string; x: number; y: number; moved: boolean } | null>(null),
    suppressClick = useRef(false);
  useEffect(() => {
    const begin=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.projectId===projectId&&typeof d.key==='string'&&d.key.length<512&&[d.pointer,d.x,d.y].every(Number.isFinite))pending.current={id:d.pointer,key:d.key,x:d.x,y:d.y,moved:false};};
    window.addEventListener('guilty-spark-asset-drag-start',begin);
    const cancel = () => {
      pending.current = null;
      setDragging(false);
    };
    const move = (event: PointerEvent) => {
      const current = pending.current;
      if (!current || current.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6) {
        current.moved = true;
        setDragging(true);
        event.preventDefault();
      }
    };
    const up = (event: PointerEvent) => {
      const current = pending.current;
      if (!current || current.id !== event.pointerId) return;
      if (current.moved) {
        suppressClick.current = true;
        const rect = viewport.current?.getBoundingClientRect();
        if (
          rect &&
          rect.width > 0 &&
          viewport.current?.contains(document.elementFromPoint(event.clientX, event.clientY)) &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        ) {
          const hit = point.current?.(event.clientX, event.clientY);
          if (hit) callback.current(current.key, hit);
        }
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      cancel();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pending.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    };
    const fileDrop = (event: Event) => {
      if (event.defaultPrevented || !fileCallback.current) return;
      const detail = (event as CustomEvent).detail;
      if (
        !detail ||
        !Array.isArray(detail.paths) ||
        !detail.paths.length ||
        detail.paths.length > 16 ||
        !detail.paths.every((path: unknown) => typeof path === 'string' && /\.(obj|wav|ogg)$/i.test(path)) ||
        !Number.isFinite(detail.x) ||
        !Number.isFinite(detail.y) ||
        !viewport.current?.contains(document.elementFromPoint(detail.x, detail.y))
      )
        return;
      const hit = point.current?.(detail.x, detail.y);
      if (hit) {
        event.preventDefault();
        fileCallback.current(detail.paths, hit);
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('guilty-spark-asset-file-drop', fileDrop);
    return () => {
      cancel();
      window.removeEventListener('guilty-spark-asset-drag-start',begin);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('guilty-spark-asset-file-drop', fileDrop);
    };
  }, [projectId, viewport, point]);
  return {
    dragging,
    begin: (item: ViewportAsset, event: ReactPointerEvent) => {
      if (event.button === 0)
        pending.current = {
          id: event.pointerId,
          key: item.key,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
    },
    activate: (item: ViewportAsset) => {
      if (suppressClick.current) return;
      const rect = viewport.current?.getBoundingClientRect();
      if (!rect) return;
      const hit = point.current?.(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (hit) callback.current(item.key, hit);
    },
  };
}

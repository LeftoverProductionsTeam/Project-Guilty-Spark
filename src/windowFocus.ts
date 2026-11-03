import { getCurrentWindow } from '@tauri-apps/api/window';
import { native } from './api';
/** WebView document.hasFocus can stay true in two native windows. Use window authority. */
export function observeWindowFocus(callback: (focused: boolean) => void) {
  let alive = true,
    revision = 0;
  const deliver = (focused: boolean) => {
    if (alive) callback(focused);
  };
  if (!native) {
    const focus = () => deliver(true),
      blur = () => deliver(false);
    deliver(document.hasFocus());
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    return () => {
      alive = false;
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
    };
  }
  const current = getCurrentWindow();
  const stop = current
    .onFocusChanged(({ payload }) => {
      revision++;
      deliver(payload);
    })
    .catch(() => () => {});
  void current
    .isFocused()
    .then((focused) => {
      if (!revision) deliver(focused);
    })
    .catch(() => {
      if (!revision) deliver(document.hasFocus());
    });
  return () => {
    alive = false;
    void stop.then((stop) => stop()).catch(() => {});
  };
}

/** WebView2 can keep document.hidden=false for a minimized native window.
 * Resize/focus events query the actual window; no idle polling is needed. */
export function observeWindowVisibility(callback: (visible: boolean) => void) {
  let alive = true, request = 0;
  const current = native ? getCurrentWindow() : null;
  const refresh = () => {
    const ticket = ++request;
    if (!current) { callback(!document.hidden); return; }
    void Promise.all([current.isMinimized(), current.isVisible()]).then(([minimized, visible]) => {
      if (alive && ticket === request) callback(!minimized && visible && !document.hidden);
    }).catch(() => {
      if (alive && ticket === request) callback(!document.hidden);
    });
  };
  const stops = current ? [current.onResized(refresh), current.onFocusChanged(refresh)] : [];
  document.addEventListener('visibilitychange', refresh);
  refresh();
  return () => {
    alive = false;
    request++;
    document.removeEventListener('visibilitychange', refresh);
    for (const stop of stops) void stop.then(unlisten => unlisten()).catch(() => {});
  };
}

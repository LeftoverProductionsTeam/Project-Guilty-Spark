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

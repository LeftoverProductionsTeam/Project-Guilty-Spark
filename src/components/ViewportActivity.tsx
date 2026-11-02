import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { observeWindowFocus } from '../windowFocus';
import { native } from '../api';
import { useWorkspaceActivity } from './WorkspaceActivity';
/** Static editors draw on changes. Camera/gizmo gestures, source walking and
 * recording keep their full frame clock; retained inactive maps never draw. */
export default function ViewportActivity({ continuous = false }: { continuous?: boolean }) {
  const { setFrameloop, invalidate, gl } = useThree();
  const {active} = useWorkspaceActivity();
  useEffect(() => {
    const canvas = gl.domElement;
    let focused = !document.hidden, pressed = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const refresh = (focused: boolean) => {
      if (!active) {gl.domElement.dataset.gsEditorActivity='paused';setFrameloop('never');return;}
      const interactive = focused && (pressed || document.pointerLockElement === canvas);
      gl.domElement.dataset.gsEditorActivity = continuous ? 'continuous' : interactive ? 'interactive' : focused ? 'idle' : 'background';
      setFrameloop(continuous || interactive ? 'always' : 'demand');
      invalidate();
      clearTimeout(settle);
      // Final diagnostics/orbit damping settle after the gesture. This is one
      // frame, not a hidden perpetual render timer.
      if (!continuous && !interactive) settle = setTimeout(() => { if (active) invalidate(); }, 300);
    };
    const down = () => { pressed = true; refresh(focused); };
    const up = () => { pressed = false; refresh(focused); };
    const pointerLock = () => refresh(focused);
    const focus = (value: boolean) => { focused = value; if (!value) pressed = false; refresh(value); };
    canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('lostpointercapture', up);
    document.addEventListener('pointerlockchange', pointerLock);
    let stopFocus: (() => void) | undefined;
    if (native) {
      const visible = () => focus(!document.hidden);
      visible();
      document.addEventListener('visibilitychange', visible);
      stopFocus = () => document.removeEventListener('visibilitychange', visible);
    } else stopFocus = observeWindowFocus(focus);
    return () => {
      clearTimeout(settle);
      stopFocus?.();
      canvas.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('lostpointercapture', up);
      document.removeEventListener('pointerlockchange', pointerLock);
    };
  }, [active, continuous, setFrameloop, invalidate, gl]);
  return null;
}

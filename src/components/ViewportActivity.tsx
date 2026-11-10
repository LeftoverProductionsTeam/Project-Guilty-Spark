import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { observeWindowFocus, observeWindowVisibility } from '../windowFocus';
import { useWorkspaceActivity } from './WorkspaceActivity';
/** Static editors draw on changes. Camera/gizmo gestures, source walking and
 * recording keep their full frame clock; retained inactive maps never draw. */
export default function ViewportActivity({ continuous = false }: { continuous?: boolean }) {
  const { setFrameloop, invalidate, gl, get } = useThree();
  const {active} = useWorkspaceActivity();
  useEffect(() => {
    const canvas = gl.domElement;
    let focused = !document.hidden, visible = !document.hidden, pressed = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const refresh = (focused: boolean) => {
      if (!active || !visible || document.hidden || gl.getContext().isContextLost()) {
        setFrameloop('never');
        // R3F stops accepting invalidations in "never", but an already queued
        // demand frame survives. WebView2 can defer it until after minimization.
        // Retire that pending frame as well; resuming explicitly invalidates.
        get().internal.frames = 0;
        gl.domElement.dataset.gsEditorActivity = 'paused';
        clearTimeout(settle);
        return;
      }
      const interactive = focused && (pressed || document.pointerLockElement === canvas);
      gl.domElement.dataset.gsEditorActivity = continuous ? 'continuous' : interactive ? 'interactive' : focused ? 'idle' : 'background';
      setFrameloop(continuous || interactive ? 'always' : 'demand');
      invalidate();
      clearTimeout(settle);
      // Final diagnostics/orbit damping settle after the gesture. This is one
      // frame, not a hidden perpetual render timer.
      if (!continuous && !interactive) settle = setTimeout(() => { if (active&&visible&&!document.hidden) invalidate(); }, 300);
    };
    const down = () => { pressed = true; refresh(focused); };
    const up = () => { pressed = false; refresh(focused); };
    const pointerLock = () => refresh(focused);
    // Restoring GPU storage does not invalidate a demand-rendered scene.
    // Resume only eligible views; inactive editors keep their paused state.
    const context = () => { pressed = false; refresh(focused); };
    canvas.addEventListener('webglcontextlost', context);
    canvas.addEventListener('webglcontextrestored', context);
    const focus = (value: boolean) => { focused = value; if (!value) pressed = false; refresh(value); };
    canvas.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('lostpointercapture', up);
    document.addEventListener('pointerlockchange', pointerLock);
    const stopFocus = observeWindowFocus(focus);
    const stopVisibility = observeWindowVisibility(value => {visible=value;if(!value)pressed=false;refresh(focused);});
    return () => {
      clearTimeout(settle);
      stopFocus();
      stopVisibility();
      canvas.removeEventListener('webglcontextlost', context);
      canvas.removeEventListener('webglcontextrestored', context);
      canvas.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('lostpointercapture', up);
      document.removeEventListener('pointerlockchange', pointerLock);
    };
  }, [active, continuous, setFrameloop, invalidate, gl, get]);
  return null;
}

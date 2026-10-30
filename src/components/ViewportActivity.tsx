import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { observeWindowFocus } from '../windowFocus';
import { native } from '../api';
/** Keep visible native editors live: WebView focus can refer to its child HWND.
 * Minimized/hidden editors can sleep; a recording Director retains its clock. */
export default function ViewportActivity({ continuous = false }: { continuous?: boolean }) {
  const { setFrameloop, invalidate, gl } = useThree();
  useEffect(() => {
    const refresh = (focused: boolean) => {
      gl.domElement.dataset.gsEditorActivity = continuous ? 'continuous' : focused ? 'active' : 'background';
      setFrameloop(continuous || focused ? 'always' : 'demand');
      invalidate();
    };
    if (native) {
      const visible = () => refresh(!document.hidden);
      visible();
      document.addEventListener('visibilitychange', visible);
      return () => document.removeEventListener('visibilitychange', visible);
    }
    return observeWindowFocus(refresh);
  }, [continuous, setFrameloop, invalidate, gl]);
  return null;
}

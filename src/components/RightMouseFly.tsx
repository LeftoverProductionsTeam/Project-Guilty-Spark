import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { directionForFlight, flightAnglesFromDirection, flightKey, flightVelocity, isEditingText, lookFlight,navigationConfig,DEFAULT_NAVIGATION,scrollFlightSpeed } from '../editorFlight';
import{useMapState}from'../mapSession';
import{observeWindowFocus}from'../windowFocus';
import type { FlightAngles } from '../editorFlight';

/** Hold right mouse + WASD to fly, RMB mouse motion to look, Q/E vertical,
 * Shift boost. Unlike FlyControls this does not capture typing outside the
 * viewport, rotate when clicking a gizmo, or change the editor's map data.
 * OrbitControls is suspended only for the duration of the held right button.
 */
export default function RightMouseFly({ speed = 12 }: { speed?: number }) {
  const { gl, camera, controls, invalidate } = useThree();
  const[raw,setConfig]=useMapState('global','navigation.config',DEFAULT_NAVIGATION);
  const config=navigationConfig(raw),configuration=useRef(config);configuration.current=config;
  const speedRef=useRef(config.speed);speedRef.current=config.speed;
  const held = useRef(false);
  const keys = useRef(new Set<string>());
  const angles = useRef<FlightAngles>({ yaw: 0, pitch: 0 });
  const orbit = controls as unknown as { enabled?: boolean; target?: THREE.Vector3; update?: () => void } | null;

  useEffect(() => {
    const canvas = gl.domElement;
    const sight = new THREE.Vector3();
    const finish = () => {
      if (!held.current) return;
      held.current = false;
      keys.current.clear();
      canvas.removeAttribute('data-gs-fly-active');
      // Keep the orbit pivot in front of the moved camera, avoiding a snap
      // back to the old target when the user returns to orbit controls.
      const forward = directionForFlight(angles.current);
      if (orbit?.target) {
        orbit.target.copy(camera.position).add(new THREE.Vector3(...forward).multiplyScalar(10));
        orbit.enabled = true;
        orbit.update?.();
      }
      invalidate();
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 2 || held.current || isEditingText(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      camera.getWorldDirection(sight);
      angles.current = flightAnglesFromDirection(sight.toArray() as [number, number, number]);
      keys.current.clear();
      held.current = true;
      canvas.setAttribute('data-gs-fly-active', 'true');
      if (orbit) orbit.enabled = false;
      try { canvas.setPointerCapture(event.pointerId); } catch { /* capture may not be available */ }
    };
    const onMove = (event: PointerEvent) => {
      if (!held.current) return;
      event.preventDefault();
      angles.current = lookFlight(angles.current, event.movementX, event.movementY,configuration.current.sensitivity);
      const forward = directionForFlight(angles.current);
      camera.up.set(0, 0, 1);
      camera.lookAt(camera.position.clone().add(new THREE.Vector3(...forward)));
      invalidate();
    };
    const onUp = (event: PointerEvent) => {
      if (event.button !== 2) return;
      finish();
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onDownKey = (event: KeyboardEvent) => {
      if (!held.current || isEditingText(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!flightKey(event.code,configuration.current.bindings)) return;
      event.preventDefault();
      event.stopImmediatePropagation(); // W/E/R editor shortcuts must not move gizmos mid-flight.
      keys.current.add(event.code);
    };
    const onUpKey = (event: KeyboardEvent) => { keys.current.delete(event.code); };
    const onMenu = (event: MouseEvent) => event.preventDefault();
    let indicator:ReturnType<typeof setTimeout>|undefined;
    const wheel=(event:WheelEvent)=>{if(!held.current||isEditingText(document.activeElement))return;event.preventDefault();event.stopImmediatePropagation();const next=scrollFlightSpeed(speedRef.current,event.deltaY);speedRef.current=next;setConfig(old=>({...navigationConfig(old),speed:next}));const host=canvas.parentElement;if(host){host.dataset.navSpeed=`Camera speed · ${next.toFixed(1)} units/s`;clearTimeout(indicator);indicator=setTimeout(()=>{delete host.dataset.navSpeed;},1400);}};
    canvas.addEventListener('wheel',wheel,{capture:true,passive:false});
    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('lostpointercapture', finish);
    window.addEventListener('keydown', onDownKey, true);
    window.addEventListener('keyup', onUpKey, true);
    window.addEventListener('blur', finish);
    const stopFocus=observeWindowFocus(focused=>{if(!focused)finish();});
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('contextmenu', onMenu);
    function onVisibility() { if (document.hidden) finish(); }
    return () => {
      finish();
      stopFocus();
      clearTimeout(indicator);if(canvas.parentElement)delete canvas.parentElement.dataset.navSpeed;canvas.removeEventListener('wheel',wheel,true);
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('lostpointercapture', finish);
      window.removeEventListener('keydown', onDownKey, true);
      window.removeEventListener('keyup', onUpKey, true);
      window.removeEventListener('blur', finish);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('contextmenu', onMenu);
    };
  }, [gl, camera, orbit, invalidate]);
  useFrame((_, delta) => {
    if (!held.current || delta <= 0) return;
    const velocity = flightVelocity(angles.current, keys.current,Math.min(100,speedRef.current*(speed/12)),configuration.current.bindings);
    if (!velocity.some(v => v !== 0)) return;
    const dt = Math.min(0.05, delta);
    camera.position.add(new THREE.Vector3(...velocity).multiplyScalar(dt));
    camera.updateMatrixWorld();
    invalidate();
  });
  return null;
}

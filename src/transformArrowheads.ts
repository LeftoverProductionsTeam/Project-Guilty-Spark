import {Mesh, Object3D} from 'three';

/** three-stdlib mirrors its translation handles towards the camera. Its baked
 * backward cones are reversed a second time by that mirror, pointing inward.
 * Use the forward cone's geometry on both camera-facing variants. Picking,
 * axis signs, transforms and the control's camera behavior stay authoritative. */
export function correctTransformArrowheads(control:Object3D):()=>void {
  const translate=(control as Object3D&{gizmo?:{gizmo?:{translate?:Object3D}}}).gizmo?.gizmo?.translate;
  const restore:(()=>void)[]=[];
  if(translate)for(const axis of ['X','Y','Z']){
    const handles=translate.children as (Object3D&{tag?:string})[];
    const forward=handles.find(h=>h.name===axis&&h.tag==='fwd');
    const backward=handles.find(h=>h.name===axis&&h.tag==='bwd');
    const fwd=forward as Mesh|undefined,bwd=backward as Mesh|undefined;
    if(!fwd?.isMesh||!bwd?.isMesh)continue;
    const original=bwd.geometry, replacement=fwd.geometry.clone();
    bwd.geometry=replacement;
    restore.push(()=>{bwd.geometry=original;replacement.dispose();});
  }
  return()=>restore.forEach(release=>release());
}

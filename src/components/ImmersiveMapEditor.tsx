import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {
  BufferGeometry, CanvasTexture, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Matrix4,
  PerspectiveCamera, PlaneGeometry, Raycaster, SRGBColorSpace, Vector3,
} from 'three';
import type {Object3D,XRTargetRaySpace} from 'three';
import type {SceneObject,Vec3} from '../types';

export type ImmersiveControl = {toggle:()=>Promise<void>; stop:()=>Promise<void>};
type Tool = 'select'|'move'|'place';
type Item = {key:string; name:string};
type Command = 'select'|'move'|'place'|'prev'|'next'|'turn'|'undo'|'redo'|'save'|'exit';
type Props = {
  connect:(control:ImmersiveControl|null)=>void;
  onActive:(active:boolean)=>void;
  onStatus:(message:string)=>void;
  selected:string|null;
  objects:SceneObject[];
  assets:Item[];
  onSelect:(id:string|null)=>void;
  onTransform:(object:SceneObject)=>boolean;
  onPlace:(key:string,position:Vec3)=>Promise<boolean>;
  onHistory:(kind:'undo'|'redo')=>void;
  onSave:()=>Promise<void>;
};
const commands:ReadonlyArray<readonly [Command,string]> = [
  ['select','Select'], ['move','Move'], ['turn','Turn 15°'], ['undo','Undo'], ['redo','Redo'],
  ['prev','Previous asset'], ['next','Next asset'], ['place','Place asset'], ['save','Save'], ['exit','Exit VR'],
];

function panelLabel(width:number,height:number){
  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('The VR tool panel could not create its text surface.');
  const texture=new CanvasTexture(canvas);
  texture.colorSpace=SRGBColorSpace;
  const draw=(label:string,checked=false)=>{
    ctx.fillStyle=checked?'#285d70':'#181d35';
    ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#7aacb8';ctx.lineWidth=2;ctx.strokeRect(1,1,width-2,height-2);
    ctx.fillStyle='#f5fcff';ctx.font='bold 21px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(label,width/2,height/2,width-14);
    texture.needsUpdate=true;
  };
  return {texture,draw};
}

export default function ImmersiveMapEditor(props:Props){
  const {gl,scene,get}=useThree();
  const current=useRef(props);
  current.current=props;
  const motion=useRef<Group|null>(null);
  useEffect(()=>{
    const xr=navigator.xr;
    if(!xr)return;
    let mounted=true;
    let opening=false;
    let session:XRSession|null=null;
    let detach:(()=>void)|undefined;
    const stop=async()=>{if(session)await session.end();};
    const toggle=async()=>{
      if(session){await stop();return;}
      if(opening)return;
      const camera=get().camera;
      if(!(camera instanceof PerspectiveCamera))throw Error('Switch to Perspective before entering VR.');
      opening=true;
      try{
        const opened=await xr.requestSession('immersive-vr');
        if(!mounted){await opened.end();return;}
        session=opened;
        const previous={parent:camera.parent,position:camera.position.clone(),orientation:camera.quaternion.clone()};
        const rig=new Group(), facing=camera.getWorldDirection(new Vector3());
        rig.position.copy(camera.getWorldPosition(new Vector3()));
        rig.rotation.set(Math.PI/2,0,Math.atan2(-facing.x,facing.y),'ZYX');
        const palette=new Group();
        // Palette stays at the first viewpoint and follows translation. It remains
        // outside the central view so its labels do not cover the selected object.
        palette.position.set(0,-0.34,-1.12);
        rig.add(palette);
        const info=panelLabel(640,58);
        const resources:Array<{dispose:()=>void}>=[info.texture];
        const bounds=new PlaneGeometry(0.86,0.08);
        const background=new MeshBasicMaterial({map:info.texture,toneMapped:false});
        resources.push(bounds,background);
        const title=new Mesh(bounds,background);
        title.position.set(0,0.14,0);
        palette.add(title);
        const buttons:Mesh[]=[];
        const keycaps:Array<(active:boolean)=>void>=[];
        const geometry=new PlaneGeometry(0.165,0.064);
        resources.push(geometry);
        commands.forEach(([id,label],index)=>{
          const keycap=panelLabel(200,60);
          const material=new MeshBasicMaterial({map:keycap.texture,toneMapped:false});
          resources.push(keycap.texture,material);
          const button=new Mesh(geometry,material);
          button.position.set((index%5-2)*0.174,0.058-Math.floor(index/5)*0.072,0);
          button.userData.command=id;
          palette.add(button);buttons.push(button);
          keycaps.push(active=>keycap.draw(label,active));
        });
        let tool:Tool='select';
        let item=0;
        let waiting=false;
        const ray=new Raycaster();
        const refresh=()=>{
          const latest=current.current;
          const chosen=latest.objects.find(object=>object.id===latest.selected);
          const asset=latest.assets[item];
          info.draw(tool==='place' ? asset ? 'Place '+asset.name : 'Open the Asset Library to choose assets' :
            tool==='move' ? 'Point at a surface and press the trigger to move' :
            chosen ? chosen.name : 'Point at an object and press the trigger');
          keycaps.forEach((draw,index)=>draw(commands[index][0]===tool));
        };
        refresh();
        const pose=(id:string)=>current.current.objects.find(object=>object.id===id&&object.visible);
        const hitRoot=(object:Object3D)=>{
          let row:Object3D|null=object;
          let surface=false;
          while(row){
            if(!row.visible)return null;
            if(row.userData.sceneObjectId)return {id:String(row.userData.sceneObjectId),surface:true};
            if(row.userData.assetSurface)surface=true;
            row=row.parent;
          }
          return surface?{id:null,surface}:null;
        };
        const act=async(controller:XRTargetRaySpace)=>{
          if(waiting||!xrSessionLive())return;
          const latest=current.current;
          ray.setFromXRController(controller);
          ray.far=1000;
          const panelHit=ray.intersectObjects([...buttons,title],false)[0];
          if(panelHit){
            const command=panelHit.object.userData.command as Command|undefined;
            if(command==='exit'){await stop();return;}
            if(command==='select'||command==='move'||command==='place')tool=command;
            if((command==='prev'||command==='next')&&latest.assets.length){
              item=(item+(command==='prev'?-1:1)+latest.assets.length)%latest.assets.length;
              tool='place';
            }
            if(command==='turn'){
              const object=latest.selected?pose(latest.selected):undefined;
              if(!object){info.draw('Select an object first');return;}
              const [yaw,pitch,roll]=object.rotation;
              const turned=latest.onTransform({...object,rotation:[yaw+Math.PI/12,pitch,roll]});
              info.draw(turned?'Turned '+object.name:'Turn was rejected. Check Spark for details.');
              return;
            }
            if(command==='undo'||command==='redo')latest.onHistory(command);
            if(command==='save'){
              waiting=true;
              info.draw('Saving project…');
              try{await latest.onSave();if(xrSessionLive())info.draw('Project saved');}
              finally{waiting=false;}
              return;
            }
            refresh();return;
          }
          const found=ray.intersectObjects(scene.children,true).map(hit=>({hit,target:hitRoot(hit.object)}))
            .find(({target})=>target&&(tool!=='move'||target.id!==latest.selected));
          if(!found?.target)return;
          if(tool==='select'){latest.onSelect(found.target.id);info.draw(found.target.id ? pose(found.target.id)?.name??'Object selected' : 'Surface selected');return;}
          const position=found.hit.point.toArray() as Vec3;
          if(tool==='move'){
            const chosen=latest.selected ? pose(latest.selected):undefined;
            if(!chosen){info.draw('Select an object first');return;}
            if(!latest.onTransform({...chosen,position})){
              info.draw('Move was rejected. Check Spark for details.');
              return;
            }
            tool='select';refresh();info.draw('Moved '+chosen.name);return;
          }
          const asset=latest.assets[item];
          if(!asset){info.draw('Open the Asset Library to choose assets');return;}
          waiting=true;
          try{const placed=await latest.onPlace(asset.key,position);if(xrSessionLive())info.draw(placed?'Placed '+asset.name:'Placement paused. See Spark for details.');}
          finally{waiting=false;}
        };
        const xrSessionLive=()=>mounted&&session===opened&&gl.xr.isPresenting;
        const headInRig=new Matrix4();
        const panelOffset=new Vector3(0,-0.34,-1.12);
        const recenter=()=>{
          if(!xrSessionLive())return;
          rig.updateWorldMatrix(true,false);
          headInRig.copy(rig.matrixWorld).invert().multiply(gl.xr.getCamera().matrixWorld);
          palette.position.copy(panelOffset).applyMatrix4(headInRig);
          palette.quaternion.setFromRotationMatrix(headInRig);
          palette.updateWorldMatrix(true,true);
        };
        const controllers=[0,1].map(index=>{
          const controller=gl.xr.getController(index);
          rig.add(controller);
          const lineGeometry=new BufferGeometry().setFromPoints([new Vector3(),new Vector3(0,0,-2)]);
          const lineMaterial=new LineBasicMaterial({color:'#a6f2ff',depthTest:true});
          const line=new Line(lineGeometry,lineMaterial);
          controller.add(line);
          resources.push(lineGeometry,lineMaterial);
          const select=()=>void act(controller).catch(error=>{if(xrSessionLive()){current.current.onStatus(String(error));info.draw('See Spark for details');}});
          controller.addEventListener('select',select);
          controller.addEventListener('squeeze',recenter);
          return ()=>{controller.removeEventListener('select',select);controller.removeEventListener('squeeze',recenter);controller.remove(line);rig.remove(controller);};
        });
        const cleanup=()=>{
          if(session!==opened)return;
          session=null;detach=undefined;motion.current=null;
          controllers.forEach(disconnect=>disconnect());
          rig.remove(camera);previous.parent?.add(camera);
          camera.position.copy(previous.position);camera.quaternion.copy(previous.orientation);camera.updateMatrixWorld();
          rig.removeFromParent();
          resources.forEach(resource=>resource.dispose());
          if(mounted)current.current.onActive(false);
        };
        detach=cleanup;
        opened.addEventListener('end',cleanup,{once:true});
        scene.add(rig);rig.add(camera);
        camera.position.set(0,0,0);camera.quaternion.identity();
        motion.current=rig;
        try{
          gl.xr.setReferenceSpaceType('local');
          await gl.xr.setSession(opened);
          if(session===opened&&mounted)current.current.onActive(true);
        }catch(error){try{await opened.end();}finally{cleanup();}throw error;}
      }catch(error){
        if(session){const active=session;try{await active.end();}catch{}detach?.();session=null;}
        throw error;
      }finally{opening=false;}
    };
    if(gl.xr.isPresenting){current.current.onStatus('An immersive session is already active.');return;}
    current.current.connect({toggle,stop});
    return ()=>{
      mounted=false;
      current.current.connect(null);
      if(session){void session.end().catch(()=>detach?.());detach?.();}
    };
  },[get,gl,scene]);

  const heading=useRef(new Vector3());
  const side=useRef(new Vector3());
  useFrame((_state,delta)=>{
    const state=motion.current;
    const session=gl.xr.getSession();
    if(!state||!session)return;
    const dt=Math.min(delta,0.05);
    // WebXRManager supplies a world matrix for its internal array camera.
    // Querying getWorldDirection() would recompute it without our parent rig.
    heading.current.set(0,0,-1).transformDirection(gl.xr.getCamera().matrixWorld);
    heading.current.z=0;
    if(heading.current.lengthSq()<0.0001)return;
    heading.current.normalize();
    side.current.set(heading.current.y,-heading.current.x,0);
    for(const input of session.inputSources){
      const axes=input.gamepad?.axes;
      if(!axes||axes.length<2)continue;
      const x=axes.at(-2)??0, y=axes.at(-1)??0;
      if(input.handedness==='right'){
        if(Math.abs(y)>0.22)state.position.z-=y*1.5*dt;
      }else{
        if(Math.abs(x)>0.22)state.position.addScaledVector(side.current,x*2.5*dt);
        if(Math.abs(y)>0.22)state.position.addScaledVector(heading.current,-y*2.5*dt);
      }
    }
  });
  return null;
}


import { Matrix4, Vector3 } from 'three';
import {poseShot, type CameraPose} from './machinima';
import type {CameraShot} from './creatorStudio';
import type {Vec3} from './types';

// Forerunner HREC 1/2 game identity, player poses and v2 private operator
// camera records. Other records, including chat and player metadata, are skipped.
export const HREC_INPUT_LIMIT = 64 * 1024 ** 2;
const DECODE_LIMIT = 192 * 1024 ** 2;
const SAMPLE_LIMIT = 250_000;
type PlayerSample = {tick:number; eye:Vec3; yaw:number; pitch:number; zoom:boolean};
type OperatorSample = {tick:number; eye:Vec3; forward:Vec3; up:Vec3; fov:number};
type Sample = PlayerSample | OperatorSample;
type Track<T> = {start:number; end:number; samples:T[]};
export type HrecTrack = ({player:number} & Track<PlayerSample>) | ({player:null} & Track<OperatorSample>);
export type HrecTakeSource = {rate:number; mapName:string; mapSha256:string; tracks:HrecTrack[]};

function requireRecording(value:unknown, message:string): asserts value {
  if(!value)throw Error('Forerunner recording: '+message);
}

async function expand(block:Uint8Array<ArrayBuffer>, format:CompressionFormat, available:number) {
  requireRecording(typeof DecompressionStream !== 'undefined','this platform cannot decode compressed HREC blocks.');
  const reader=new Blob([block]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const chunks:Uint8Array[]= [];
  let bytes=0;
  try {
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.length;
      requireRecording(bytes<=available,'decompressed recording exceeds the import limit.');
      chunks.push(value);
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  const output=new Uint8Array(bytes);
  let position=0;
  for(const chunk of chunks){output.set(chunk,position);position+=chunk.length;}
  return output;
}

export async function readHrecTake(input:ArrayBuffer):Promise<HrecTakeSource> {
  const file=new DataView(input);
  requireRecording(input.byteLength>=8 && input.byteLength<=HREC_INPUT_LIMIT,'invalid file size.');
  requireRecording(file.getUint32(0)===0x48524543 && [1,2].includes(file.getUint32(4,true)),'choose an HREC version 1 or 2 file.');
  const version = file.getUint32(4,true);
  const decode=new TextDecoder('utf-8',{fatal:true});
  let rate=0,mapName='',mapSha256='',byteCount=0,sampleCount=0,lastTick=-1;
  const snapshots=new Map<number,PlayerSample[][]>();
  const cameraSpans: Track<OperatorSample>[] = [];
  let camera: Track<OperatorSample> | undefined;
  let lastCameraTick = -1;
  for(let offset=8;offset<input.byteLength;){
    requireRecording(offset+9<=input.byteLength,'truncated block header.');
    const kind=file.getUint8(offset), unpacked=file.getUint32(offset+1,true), packed=file.getUint32(offset+5,true);
    requireRecording(packed>0&&offset+9+packed<=input.byteLength&&[0x52,0x42,0x47].includes(kind),'invalid block size or format.');
    requireRecording(unpacked>0&&unpacked<=DECODE_LIMIT-byteCount,'decompressed block exceeds the import limit.');
    const raw=new Uint8Array(input,offset+9,packed);
    offset+=9+packed;
    const data=kind===0x52?raw:await expand(raw,kind===0x42?'deflate':'gzip',unpacked);
    requireRecording(data.length===unpacked,'block length does not match the recording header.');
    byteCount+=data.length;
    requireRecording(byteCount<=DECODE_LIMIT,'decompressed recording exceeds the import limit.');
    const block=new DataView(data.buffer,data.byteOffset,data.byteLength);
    for(let pos=0;pos<data.length;){
      requireRecording(pos+5<=data.length,'truncated record header.');
      const kind=block.getUint8(pos),length=block.getUint32(pos+1,true);
      pos+=5;
      const end=pos+length;
      requireRecording(end<=data.length,'truncated record data.');
      let at=pos;
      const readText=()=>{
        requireRecording(at<end,'truncated text length.');
        const bytes=block.getUint8(at++);
        requireRecording(at+bytes<=end,'truncated text.');
        const text=decode.decode(data.subarray(at,at+bytes));
        at+=bytes;
        return text;
      };
      if(kind===1){
        requireRecording(length>=9&&rate===0,'missing or repeated game header.');
        rate=block.getUint16(at+4,true);
        requireRecording(rate>=15&&rate<=240,'unsupported simulation rate.');
        at+=6;
        readText();
        mapName=readText().toLowerCase().replace(/^(?:mcc_maps|maps_ce|maps)[/\\]/,'');
        readText();
        requireRecording(mapName.length>0&&mapName.length<=64&&mapName!=='.'&&mapName!=='..'
          &&!/[\\/:\x00-\x1f\x7f-\x9f]/.test(mapName)&&at===end,'invalid game map name.');
      }else if(kind===16){
        requireRecording(length>=34,'invalid map identity.');
        at++;readText();
        requireRecording(at+32===end,'invalid map checksum.');
        mapSha256=Array.from(data.subarray(at,end),byte=>byte.toString(16).padStart(2,'0')).join('').replace(/^0+$/,'');
      }else if(kind===4){
        requireRecording(rate>0&&length>=5,'frame arrived before its game header.');
        const tick=block.getUint32(at,true),count=block.getUint8(at+4);
        requireRecording(tick>lastTick&&count<=16&&length===5+count*26,'invalid player frame.');
        lastTick=tick;
        const seen=new Set<number>();
        for(let i=0;i<count;i++){
          const row=at+5+i*26,player=block.getUint8(row),flags=block.getUint8(row+1);
          requireRecording(player<16&&!seen.has(player),'invalid player slot.');
          seen.add(player);
          // Legacy seat-local positions and predicted remote frames are
          // unsuitable for a world-space recorded camera.
          if (block.getUint8(row+20)===0 || flags&32 || (flags&16) && !(flags&64)) continue;
          const eye:Vec3=[block.getFloat32(row+2,true),block.getFloat32(row+6,true),
            block.getFloat32(row+10,true)+block.getInt16(row+14,true)/1000];
          if(eye.some(value=>!Number.isFinite(value)||Math.abs(value)>4094))continue;
          const yaw=block.getInt16(row+16,true)/10000,pitch=block.getInt16(row+18,true)/10000;
          if(Math.abs(yaw)>3.277||Math.abs(pitch)>1.6)continue;
          requireRecording(++sampleCount<=SAMPLE_LIMIT,'recording has too many camera samples.');
          let spans=snapshots.get(player);
          if(!spans){spans=[];snapshots.set(player,spans);}
          let span=spans.at(-1);
          const previous=span?.at(-1);
          if(!span||!previous||tick-previous.tick>rate/2||
              Math.hypot(...eye.map((value,axis)=>value-previous.eye[axis]))>8){
            span=[];spans.push(span);
          }
          span.push({tick,eye,yaw,pitch,zoom:!!(flags&8)});
        }
      } else if (kind===20 && version===2) {
        requireRecording(rate>0&&(length===4||length===44), 'invalid operator camera record.');
        const tick = block.getUint32(at,true);
        requireRecording(tick>lastCameraTick, 'operator camera ticks are out of order.');
        lastCameraTick = tick;
        if (length===4) {
          if (camera && tick-camera.end<=rate/2) camera.end = tick;
          camera = undefined;
        } else {
          const vector = (offset:number):Vec3 => [0,4,8].map(axis=>block.getFloat32(at+offset+axis,true)) as Vec3;
          const eye = vector(4), forward = vector(16), up = vector(28);
          const radians = block.getFloat32(at+40,true);
          const magnitude = (v:Vec3) => Math.hypot(...v);
          requireRecording(eye.every(value=>Number.isFinite(value)&&Math.abs(value)<=4094)
            && Math.abs(magnitude(forward)-1)<=0.02 && Math.abs(magnitude(up)-1)<=0.02
            && Math.abs(forward.reduce((sum,value,axis)=>sum+value*up[axis],0))<=0.02
            && radians>0 && radians<Math.PI, 'invalid operator camera pose.');
          requireRecording(++sampleCount<=SAMPLE_LIMIT,'recording has too many camera samples.');
          const previous = camera?.samples.at(-1);
          if (!camera || !previous || tick-previous.tick>rate/2
            || Math.hypot(...eye.map((value,axis)=>value-previous.eye[axis]))>8) {
            camera = {start:tick,end:tick,samples:[]};
            cameraSpans.push(camera);
          }
          camera.end = tick;
          camera.samples.push({tick,eye,forward,up,fov:radians*180/Math.PI});
        }
      }
      pos=end;
    }
  }
  const playerTracks = [...snapshots].flatMap(([player,spans])=>spans.filter(samples=>samples.length>=2)
    .map(samples=>({player,start:samples[0].tick,end:samples.at(-1)!.tick,samples})));
  const tracks: HrecTrack[] = [...cameraSpans.map(span=>({...span,player:null})), ...playerTracks];
  requireRecording(tracks.length>0, 'there are no continuous player or operator views.');
  requireRecording(tracks.length<=256, 'this recording has too many separate camera takes to open at once.');
  return {rate,mapName,mapSha256,tracks};
}

function samplePose(sample: Sample):CameraPose {
  const position = sample.eye;
  if ('forward' in sample) {
    const eye = new Vector3(...position);
    const aim = eye.clone().add(new Vector3(...sample.forward).normalize());
    // Match MachinimaRig's Z-up lookAt, including its vertical-view fallback.
    const axes = new Matrix4().lookAt(eye,aim,new Vector3(0,0,1)).elements;
    const recordedUp = new Vector3(...sample.up);
    const right = recordedUp.x*axes[0]+recordedUp.y*axes[1]+recordedUp.z*axes[2];
    const up = recordedUp.x*axes[4]+recordedUp.y*axes[5]+recordedUp.z*axes[6];
    requireRecording(sample.fov>=10&&sample.fov<=140,
      'this operator shot uses a vertical FOV outside the editor’s 10–140° lens range.');
    return {position,lookAt:aim.toArray(),fov:sample.fov,roll:Math.atan2(-right,up)*180/Math.PI};
  }
  const {yaw,pitch,zoom}=sample;
  const direction=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];
  const lookAt=position.map((value,axis)=>value+direction[axis]) as Vec3;
  return {position,lookAt,fov:zoom?30:70,roll:0};
}

export function hrecCameraShots(source:HrecTakeSource, trackIndex:number, title:string, limit=64):CameraShot[] {
  const track=source.tracks[trackIndex];
  requireRecording(track&&Number.isInteger(limit)&&limit>=Math.min(track.samples.length,2)&&limit<=64,
    'choose a take with room for its camera keys.');
  requireRecording(title.trim()&&title.length<=90&&!/[\x00-\x1f\x7f]/.test(title),'enter a take name up to 90 characters.');
  const rate=source.rate,samples=track.samples;
  // Keep a discrete cut when zoom changes. The editable take uses the existing
  // Spark keyframes and their native camera-script limits.
  const step=Math.max(Math.ceil(rate/4),Math.ceil((samples.at(-1)!.tick-track.start)/Math.max(1,limit-1)));
  const selected:Sample[]=[samples[0]];
  for(let i=1;i<samples.length-1&&selected.length<limit-1;i++){
    if(samples[i].tick-selected.at(-1)!.tick>=step)selected.push(samples[i]);
  }
  const tail=samples.at(-1)!;
  if(tail.tick>selected[0].tick)selected.push(tail);
  return selected.map((sample,index)=>{
    const following=selected[index+1];
    const boundary=following?.tick??track.end;
    const duration=Math.round((boundary-sample.tick)*1000/rate);
    requireRecording(duration<=600000,'the selected track is too long for this camera take.');
    return {...poseShot(samplePose(sample),title+' · '+(index+1)),
      durationMs:Math.max(100,duration),
      easing:following&&'zoom' in following&&'zoom' in sample&&following.zoom!==sample.zoom?'cut':'linear'};
  });
}

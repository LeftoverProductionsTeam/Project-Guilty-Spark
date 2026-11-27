import {expect,it} from 'vitest';
import {gzipSync} from 'node:zlib';
import {hrecCameraShots,readHrecTake} from './hrecTake';

const u32=(value:number)=>[value&255,value>>>8&255,value>>>16&255,value>>>24];
const record=(kind:number,bytes:number[])=>[kind,...u32(bytes.length),...bytes];

function recording(){
  const map=[...'timberland'].map(ch=>ch.charCodeAt(0));
  const header=record(1,[...u32(0),60,0,0,map.length,...map,0]);
  const identity=record(16,[1,0,...Array.from({length:32},()=>0xab)]);
  const frame=(tick:number,player:number,x:number,flags:number)=>{
    const bytes=new Uint8Array(26),view=new DataView(bytes.buffer);
    bytes[0]=player;bytes[1]=flags;bytes[20]=255;
    view.setFloat32(2,x,true);view.setInt16(14,1600,true);
    return record(4,[...u32(tick),1,...bytes]);
  };
  const block=[...header,...identity,...frame(0,0,3,0),...frame(15,0,4,8),...frame(75,0,50,0),...frame(90,0,51,0)];
  return Uint8Array.from([72,82,69,67,...u32(2),82,...u32(block.length),...u32(block.length),...block]).buffer;
}

it('uses exact map identity, ticks and live camera poses without bridging player gaps',async()=>{
  const source=await readHrecTake(recording());
  expect(source.mapSha256).toBe('ab'.repeat(32));
  expect(source.mapName).toBe('timberland');
  expect(source.tracks.map(({player,start,end})=>[player,start,end])).toEqual([[0,0,15],[0,75,90]]);
  const shots=hrecCameraShots(source,0,'Arrival');
  expect(shots[0]).toMatchObject({name:'Arrival · 1',cameraPosition:[3,0,1.6],lookAt:[4,0,1.6],fov:70,durationMs:250,easing:'cut'});
  expect(shots[1]).toMatchObject({fov:30});
});
it('refuses a partial recording block without adopting any camera keys',async()=>{
  await expect(readHrecTake(recording().slice(0,-1))).rejects.toThrow('block size');
});

it('uses the same camera data in gzip blocks and refuses misdeclared expansion',async()=>{
  const original=new Uint8Array(recording());
  const payload=original.subarray(17),compressed=gzipSync(payload);
  const gzip=Uint8Array.from([...original.subarray(0,8),71,...u32(payload.length),...u32(compressed.length),...compressed]);
  expect(await readHrecTake(gzip.buffer)).toEqual(await readHrecTake(original.buffer));
  new DataView(gzip.buffer).setUint32(9,payload.length-1,true);
  await expect(readHrecTake(gzip.buffer)).rejects.toThrow('decompressed recording exceeds the import limit');
});

it('imports the detached operator lens and roll with explicit cuts and gaps',async()=>{
  const map=[..."mcc_maps\\fonzie's zombie apocalypse"].map(ch=>ch.charCodeAt(0));
  const header=record(1,[...u32(0),60,0,0,map.length,...map,0]);
  const frame=(tick:number,x:number,forward:number[]=[1,0,0],up:number[]=[0,0.5,Math.sqrt(3)/2])=>{
    const bytes=new Uint8Array(44), view=new DataView(bytes.buffer);
    view.setUint32(0,tick,true);
    [x,1,2,...forward,...up,Math.PI/3].forEach((value,index)=>view.setFloat32(4+index*4,value,true));
    return record(20,[...bytes]);
  };
  const file=(payload:number[])=>Uint8Array.from([
    72,82,69,67,...u32(2),82,...u32(payload.length),...u32(payload.length),...payload,
  ]).buffer;
  const source=await readHrecTake(file([
    ...header,...frame(10,3),...frame(25,4),...record(20,u32(37)),
    ...frame(43,5,[0,0,1],[0,1,0]),...frame(95,6),
  ]));
  expect(source.mapName).toBe("fonzie's zombie apocalypse");
  expect(source.tracks.map(({player,start,end})=>[player,start,end])).toEqual([
    [null,10,37],[null,43,43],[null,95,95],
  ]);
  const shots=hrecCameraShots(source,0,'Operator');
  expect(shots[0]).toMatchObject({cameraPosition:[3,1,2],lookAt:[4,1,2],durationMs:250,easing:'linear'});
  expect(shots[0].fov).toBeCloseTo(60,4);
  expect(shots[0].roll).toBeCloseTo(30,4);
  expect(shots[1].durationMs).toBe(200);
  const still=hrecCameraShots(source,1,'Hold',1);
  expect(still).toHaveLength(1);
  expect(still[0].lookAt).toEqual([5,1,3]);
  await expect(readHrecTake(file([...header,...frame(10,3),...frame(9,4)]))).rejects.toThrow('out of order');
  await expect(readHrecTake(file([...header,...frame(10,3,[1,0,0],[1,0,0])]))).rejects.toThrow('invalid operator camera pose');
});

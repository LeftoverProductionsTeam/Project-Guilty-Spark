import type {MapInspection,Vec3} from './types';
import stockCompactAtlas from './stockCompactAtlas.json';
export const originalMultiplayerMaps=['beavercreek','bloodgulch','boardingaction','carousel','chillout','damnation','dangercanyon','deathisland','gephyrophobia','hangemhigh','icefields','infinity','longest','prisoner','putput','ratrace','sidewinder','timberland','wizard'] as const;
export interface AtlasRegion {id:string;mapName:string;bspName:string;bspIndex:number;cacheSha256:string;cacheVersion:number;scenarioType:number;coordinates:string;minimum:Vec3;maximum:Vec3;collisionTriangles:number;renderTriangles:number;boundaryEdges:number;nonmanifoldEdges:number;degenerateTriangles:number;shaders:string[];runtimes:string[];translation:Vec3;yawDegrees:number}
export interface LayoutRegion {regionId:string;cacheSha256:string;cacheVersion:number;bspIndex:number;mapName:string;bspName:string;minimum:Vec3;maximum:Vec3;translation:Vec3;yawDegrees:number;hexSlot?:[number,number];underground?:boolean;surfaceAccess?:{surfaceRegionId:string;roofClearance:number;headingDegrees:number}}
export interface MegaworldLayout {schemaVersion:1;regions:LayoutRegion[]}
export function planRegion(region:AtlasRegion):LayoutRegion {
  return {regionId:region.id,cacheSha256:region.cacheSha256,cacheVersion:region.cacheVersion,bspIndex:region.bspIndex,mapName:region.mapName,bspName:region.bspName,minimum:[...region.minimum],maximum:[...region.maximum],translation:[0,0,0],yawDegrees:0};
}
export function addLayoutRegions(layout:MegaworldLayout|undefined|null,regions:AtlasRegion[]):MegaworldLayout {
  const next=layout?.regions.slice()??[],seen=new Set(next.map(r=>r.regionId));
  for(const region of regions)if(!seen.has(region.id)){next.push(planRegion(region));seen.add(region.id);}
  if(next.length>64)throw Error('The Atlas layout holds at most 64 region plans.');
  return {schemaVersion:1,regions:next};
}
/** Add already opened or user-imported maps without an installation scan. */
export function addOpenedAtlasBsp(layout:MegaworldLayout|null|undefined,map:MapInspection,bspIndex:number):MegaworldLayout {
  const part=map.mesh.parts?.[bspIndex];
  if(!part||!part.indexCount||part.indexStart<0||part.indexStart+part.indexCount>map.mesh.indices.length)
    throw Error('Choose a BSP with native collision geometry.');
  const minimum:Vec3=[Infinity,Infinity,Infinity],maximum:Vec3=[-Infinity,-Infinity,-Infinity];
  for(let at=part.indexStart;at<part.indexStart+part.indexCount;at++){
    const start=map.mesh.indices[at]*3;
    for(let axis=0;axis<3;axis++){
      const value=map.mesh.positions[start+axis];
      if(!Number.isFinite(value))throw Error('The selected BSP contains invalid native bounds.');
      minimum[axis]=Math.min(minimum[axis],value);
      maximum[axis]=Math.max(maximum[axis],value);
    }
  }
  const row:LayoutRegion={regionId:map.sha256+':'+bspIndex,cacheSha256:map.sha256,cacheVersion:map.header.version,
    bspIndex,mapName:map.header.name,bspName:part.name,minimum,maximum,translation:[0,0,0],yawDegrees:0};
  const regions=layout?.regions??[];
  if(regions.some(old=>old.regionId===row.regionId))return layout!;
  if(regions.length>=64)throw Error('The Atlas layout holds at most 64 region plans.');
  return {schemaVersion:1,regions:[...regions,row]};
}

/** Require an explicit edition when a map name has multiple source hashes. */
export function originalRegions(regions:AtlasRegion[]):{regions:AtlasRegion[];missing:string[]} {
  const result:AtlasRegion[]=[],missing:string[]=[];
  for(const name of originalMultiplayerMaps){const matches=regions.filter(r=>r.scenarioType===1&&r.bspIndex===0&&r.mapName.toLowerCase()===name);
    if(matches.length>1)throw Error('Choose one runtime or add individual source variants for '+name+'.');
    if(matches[0])result.push(matches[0]);else missing.push(name);
  }return {regions:result,missing};
}

interface StockCompactRegion {
  mapName: string;
  cacheSha256: string;
  hexSlot: number[];
  translation: number[];
  yawDegrees: number;
  surface?: string;
  roofClearance?: number;
  headingDegrees?: number;
}

/** Use the surveyed CE609 transforms, the built seed frame, and owned source identities. */
export function applyCompactStockLayout(layout: MegaworldLayout | null | undefined,
  inventory: AtlasRegion[], built: readonly LayoutRegion[] = []): MegaworldLayout {
  const stock: StockCompactRegion[] = stockCompactAtlas;
  const names = new Map(stock.map(row => [row.mapName, row.cacheSha256 + ':0']));
  const specs = new Map(stock.map(row => [row.cacheSha256 + ':0', row]));
  const owned = new Map(inventory.filter(row => row.cacheVersion === 609 && row.bspIndex === 0 && row.scenarioType === 1)
    .map(row => [row.id, planRegion(row)]));
  const saved = new Map(layout?.regions.map(row => [row.regionId, row]) ?? []);
  const unresolved = stock.filter(row => {
    const id = row.cacheSha256 + ':0';
    const source = owned.get(id) ?? saved.get(id);
    return !source || source.cacheVersion !== 609 || source.cacheSha256 !== row.cacheSha256 || source.bspIndex !== 0;
  });
  if (unresolved.length) throw Error('Scan the original Custom Edition maps. Missing ' + unresolved.map(row => row.mapName).join(', ') + '.');

  const reference = built.find(region => specs.has(region.regionId));
  const referenceSpec = reference && specs.get(reference.regionId);
  const yaw = reference && referenceSpec ? reference.yawDegrees - referenceSpec.yawDegrees : 0;
  const angle = yaw * Math.PI / 180;
  const rotate = ([x, y, z]: number[]): Vec3 => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
  const referenceOffset = referenceSpec && rotate(referenceSpec.translation);
  const origin: Vec3 = reference && referenceOffset ? [
    reference.translation[0] - referenceOffset[0],
    reference.translation[1] - referenceOffset[1],
    reference.translation[2] - referenceOffset[2],
  ] : [0, 0, 0];
  const stockRegions = stock.map((spec): LayoutRegion => {
    const id = spec.cacheSha256 + ':0';
    const source = owned.get(id) ?? saved.get(id)!;
    const [x, y, z] = rotate(spec.translation);
    return {
      ...source, translation: [origin[0] + x, origin[1] + y, origin[2] + z],
      yawDegrees: yaw + spec.yawDegrees, hexSlot: [spec.hexSlot[0], spec.hexSlot[1]],
      underground: spec.surface ? true : undefined,
      surfaceAccess: spec.surface ? {
        surfaceRegionId: names.get(spec.surface)!,
        roofClearance: spec.roofClearance!,
        headingDegrees: ((spec.headingDegrees! + yaw + 180) % 360 + 360) % 360 - 180,
      } : undefined,
    };
  });
  for (const region of built) {
    const planned = stockRegions.find(item => item.regionId === region.regionId);
    if (planned && (planned.translation.some((axis, i) => Math.abs(axis - region.translation[i]) > 1e-5)
      || Math.abs(planned.yawDegrees - region.yawDegrees) > 1e-5)) {
      throw Error('The compact layout would move compiled ' + region.mapName + '. Keep its Atlas placement or load the compact layout in another project.');
    }
  }
  const extra = (layout?.regions ?? []).filter(region => !specs.has(region.regionId));
  if (stockRegions.length + extra.length > 64) throw Error('The Atlas layout holds at most 64 region plans.');
  if (extra.some(region => region.hexSlot && stockRegions.some(stockRegion =>
    stockRegion.hexSlot![0] === region.hexSlot![0] && stockRegion.hexSlot![1] === region.hexSlot![1]))) {
    throw Error('A custom region occupies a stock hex slot. Move it before loading the compact stock layout.');
  }
  return {schemaVersion: 1, regions: [...stockRegions, ...extra]};
}

function linkedSurface(a: LayoutRegion, b: LayoutRegion): boolean {
  return Boolean(a.underground && !b.underground && a.surfaceAccess?.surfaceRegionId === b.regionId);
}

export function atlasAdjacentRegions(regions: readonly LayoutRegion[], base: LayoutRegion): LayoutRegion[] {
  const slot=base.hexSlot;
  return regions.filter(region=>{
    if(linkedSurface(base,region)||linkedSurface(region,base))return true;
    if(!slot||!region.hexSlot)return false;
    const q=region.hexSlot[0]-slot[0],r=region.hexSlot[1]-slot[1];
    return Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))===1;
  });
}

/** Keep the solver's full precision when applying its verified boundary alignment. */
export function alignAtlasDonor(layout:MegaworldLayout,base:LayoutRegion,donor:LayoutRegion,
  translation:Vec3,yawDegrees:number,origin=base):MegaworldLayout {
  if(!atlasAdjacentRegions(layout.regions,base).some(row=>row.regionId===donor.regionId))
    throw Error('Arrange both sources as neighboring Atlas regions first.');
  const angle=origin.yawDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const [x,y,z]=translation;
  return {...layout,regions:layout.regions.map(region=>region.regionId!==donor.regionId?region:{...region,
    translation:[origin.translation[0]+c*x-s*y,origin.translation[1]+s*x+c*y,origin.translation[2]+z],
    yawDegrees:origin.yawDegrees+yawDegrees})};
}

export function applyAtlasSurfaceAccess(layout: MegaworldLayout, interiorId: string, surfaceId: string,
  roofClearance: number, translationZ: number, headingDegrees: number): MegaworldLayout {
  const interior=layout.regions.find(region=>region.regionId===interiorId);
  const surface=layout.regions.find(region=>region.regionId===surfaceId);
  if(!interior?.underground||!surface||surface.underground||!Number.isFinite(roofClearance)
      ||roofClearance<0.1||roofClearance>64||!Number.isFinite(translationZ)||Math.abs(translationZ)>1_000_000
      ||!Number.isFinite(headingDegrees)||Math.abs(headingDegrees)>180){
    throw Error('Choose a surface region, supported roof clearance and passage heading.');
  }
  return {...layout,regions:layout.regions.map(region=>region===interior?{
    ...region,translation:[region.translation[0],region.translation[1],translationZ],
    surfaceAccess:{surfaceRegionId:surfaceId,roofClearance,headingDegrees},
  }:region)};
}

export function regionFootprint(r:LayoutRegion):[number,number][] {
  const angle=r.yawDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return [[r.minimum[0],r.minimum[1]],[r.maximum[0],r.minimum[1]],[r.maximum[0],r.maximum[1]],[r.minimum[0],r.maximum[1]]].map(([x,y])=>[x*c-y*s+r.translation[0],x*s+y*c+r.translation[1]]);
}
/** Coarse cover candidates for placement review. The source bounds do not measure terrain thickness. */
export function atlasCoveringRegions(regions:LayoutRegion[],interior:LayoutRegion):LayoutRegion[] {
  const footprint=regionFootprint(interior);
  const roof=interior.maximum[2]+interior.translation[2];
  return regions.filter(surface=>{
    if(surface.underground||surface.regionId===interior.regionId||surface.maximum[2]+surface.translation[2]<=roof)return false;
    const angle=-surface.yawDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    return footprint.every(([worldX,worldY])=>{
      const x=worldX-surface.translation[0],y=worldY-surface.translation[1];
      const localX=x*c-y*s,localY=x*s+y*c;
      return localX>=surface.minimum[0]&&localX<=surface.maximum[0]&&localY>=surface.minimum[1]&&localY<=surface.maximum[1];
    });
  });
}

/** Rotated source bounds only: overlaps are candidates, never collision/seam proof. */
export function overlappingRegions(regions:LayoutRegion[]):[string,string][] {
  const polygons=regions.map(regionFootprint),result:[string,string][]=[];
  for(let a=0;a<regions.length;a++)for(let b=a+1;b<regions.length;b++){
    const ra=regions[a],rb=regions[b];
    if(ra.minimum[2]+ra.translation[2]>=rb.maximum[2]+rb.translation[2]||rb.minimum[2]+rb.translation[2]>=ra.maximum[2]+ra.translation[2])continue;
    const p=polygons[a],q=polygons[b];let separate=false;
    for(const poly of [p,q])for(let i=0;i<4;i++){const u=poly[i],v=poly[(i+1)%4],normal=[u[1]-v[1],v[0]-u[0]];
      if(Math.hypot(...normal)<1e-9)continue;
      const project=(r:number[])=>r[0]*normal[0]+r[1]*normal[1],x=p.map(project),y=q.map(project);
      if(Math.max(...x)<=Math.min(...y)||Math.max(...y)<=Math.min(...x))separate=true;
    }if(!separate)result.push([regions[a].regionId,regions[b].regionId]);
  }return result;
}

/** Hexagonal planning rings preserve each source's dimensions and orientation.
 * Bounds are only a placement proxy; terrain blends/caves require native rebuild. */
export function spreadLayout(layout:MegaworldLayout,centerId=layout.regions[0]?.regionId):MegaworldLayout {
  const sizes=layout.regions.map(r=>{const p=regionFootprint(r);return [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];});
  const order=layout.regions.map((r,i)=>i).sort((a,b)=>Number(layout.regions[b].regionId===centerId)-Number(layout.regions[a].regionId===centerId));
  const slots:[number,number][]=[[0,0]];
  for(let radius=1;slots.length<layout.regions.length;radius++){
    const ring:[number,number][]=[];for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))===radius)ring.push([q,r]);
    ring.sort((a,b)=>Math.atan2(a[1],a[0]+a[1]/2)-Math.atan2(b[1],b[0]+b[1]/2));slots.push(...ring);
  }
  const positions=new Map(order.map((index,i)=>[index,slots[i]]));
  const rows=new Map<number,number[]>();
  for(const [index,[,row]] of positions){
    const members=rows.get(row)??[];
    members.push(index);
    rows.set(row,members);
  }
  const strip=2;
  const centers=new Map<number,[number,number]>();
  let y=0;
  for(const [row,members] of [...rows].sort(([a],[b])=>a-b)){
    members.sort((a,b)=>positions.get(a)![0]-positions.get(b)![0]);
    const widths=members.map(i=>Math.max(1,sizes[i][2]-sizes[i][0]));
    const height=Math.max(1,...members.map(i=>sizes[i][3]-sizes[i][1]));
    let x=-(widths.reduce((total,width)=>total+width,0)+strip*(members.length-1))/2;
    members.forEach((i,column)=>{
      centers.set(i,[x+widths[column]/2,y+height/2]);
      x+=widths[column]+strip;
    });
    y+=height+strip;
  }
  const [originX,originY]=centers.get(order[0])??[0,0];
  const regions=layout.regions.map((r,i)=>{
    const [x,y]=centers.get(i)!;
    const [left,bottom,right,top]=sizes[i];
    return {...r,hexSlot:positions.get(i)!,translation:[
      r.translation[0]+x-originX-(left+right)/2,
      r.translation[1]+y-originY-(bottom+top)/2,
      r.translation[2],
    ] as Vec3};
  });
  const moved=new Map(regions.map((region,index)=>[region.regionId,index]));
  const attached=regions.map((region,index):LayoutRegion=>{
    const parent=region.surfaceAccess&&moved.get(region.surfaceAccess.surfaceRegionId);
    if(parent===undefined||!linkedSurface(region,regions[parent]))return region;
    const original=layout.regions[index].translation;
    const before=layout.regions[parent].translation,after=regions[parent].translation;
    return {...region,translation:[original[0]+after[0]-before[0],original[1]+after[1]-before[1],original[2]]};
  });
  if(attached.some(r=>r.translation.some(n=>!Number.isFinite(n)||Math.abs(n)>1000000)))throw Error('These bounds exceed the supported layout range. Arrange them individually.');
  return {schemaVersion:1,regions:attached};
}

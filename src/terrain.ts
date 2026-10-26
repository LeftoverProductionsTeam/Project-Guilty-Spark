/** Source heightfield sculpting: pure, deterministic, undoable in project history.
 *  Rebuild of render/collision geometry is performed by Rust QuickForge.
 *  No direct writes into compiled Halo BSPs.
 */
import type { ForgeBrush } from './forge';
export type SculptMode = 'raise' | 'lower' | 'flatten' | 'smooth';
export function sculptTerrain(brush: ForgeBrush, gx: number, gy: number, radius: number, strength: number, mode: SculptMode): ForgeBrush {
  if (brush.kind !== 'terrain' || brush.locked) throw new Error('Select an unlocked source terrain tile');
  const n = brush.steps;
  if (!Number.isInteger(n) || n < 2 || n > 32 || !Number.isInteger(gx) || !Number.isInteger(gy) || gx<0 || gx>n || gy<0 || gy>n ||
      !Number.isFinite(radius) || radius<0 || radius>32 || !Number.isFinite(strength) || strength<=0 || strength>16 ||
      !['raise','lower','flatten','smooth'].includes(mode)) throw new Error('Terrain sculpt values exceed safe bounds');
  const heights = brush.heights?.length === (n+1)**2 ? [...brush.heights] : Array((n+1)**2).fill(0);
  const old = [...heights], index = (x:number,y:number) => y*(n+1)+x, target=old[index(gx,gy)];
  const minHeight = -brush.dimensions[2] + 0.1;
  for (let y=0;y<=n;y++) for(let x=0;x<=n;x++) {
    const distance=Math.hypot(x-gx,y-gy);
    if(distance>radius || (radius===0 && distance!==0)) continue;
    const weight=radius===0 ? 1 : Math.max(0,1-(distance/radius)**2);
    const i=index(x,y);
    let desired=old[i];
    switch(mode) {
      case 'raise': desired=old[i]+strength*weight; break;
      case 'lower': desired=old[i]-strength*weight; break;
      case 'flatten': desired=old[i]+(target-old[i])*Math.min(1,strength*weight); break;
      case 'smooth': {
        let total=0, count=0;
        for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) {
          if (x+dx>=0&&x+dx<=n&&y+dy>=0&&y+dy<=n) { total+=old[index(x+dx,y+dy)];count++; }
        }
        desired=old[i]+(total/count-old[i])*Math.min(1,strength*weight);
        break;
      }
    }
    heights[i]=Math.max(minHeight,Math.min(64,Math.round(desired*10000)/10000));
  }
  return {...brush,heights};
}
export function terrainVertexHeight(brush:ForgeBrush,x:number,y:number):number {
  if(brush.kind!=='terrain'||x<0||y<0||x>brush.steps||y>brush.steps) throw new Error('Invalid terrain grid address');
  return brush.heights?.[y*(brush.steps+1)+x] ?? 0;
}

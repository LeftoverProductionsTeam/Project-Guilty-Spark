/** Vertical control pagination. Offsets overlap where a control crosses a page
 * boundary, so every bounded control has at least one complete, reachable view. */
export interface SurfaceRange {top:number;bottom:number}
export function surfacePages(total:number,height:number,ranges:readonly SurfaceRange[]):number[]{
 if(!Number.isFinite(total)||!Number.isFinite(height)||height<1||total<=height)return [0];
 const limit=Math.max(0,total-height),offsets=[0];
 const controls=ranges.filter(r=>Number.isFinite(r.top)&&Number.isFinite(r.bottom)&&r.top>=0&&r.bottom>r.top&&r.bottom-r.top<=height);
 for(let at=height;at<total&&offsets.length<4096;at+=height)offsets.push(Math.min(at,limit));
 for(const row of controls){
  if(!offsets.some(at=>row.top>=at-.5&&row.bottom<=at+height+.5))offsets.push(Math.max(0,Math.min(row.top,limit)));
 }
 return [...new Set(offsets)].sort((a,b)=>a-b);
}

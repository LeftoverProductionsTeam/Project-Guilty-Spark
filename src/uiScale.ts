/** Window-relative UI scale. Never change a map, camera or Windows setting. */
export function windowUiScale(requested:number|null,width:number,height:number){
 const valid=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0;
 if(!valid)return 1;
 const desired=requested===null?Math.max(.8,Math.min(1.5,width/1500,height/950)):Math.max(.75,Math.min(1.5,Number.isFinite(requested)?requested:1));
 // Preserve the existing minimum usable layout when a manually enlarged UI
 // meets a small window; show the applied percentage rather than hiding it.
 const fits=Math.max(.75,Math.min(width/800,height/600));
 return Math.round(Math.min(desired,fits)*100)/100;
}

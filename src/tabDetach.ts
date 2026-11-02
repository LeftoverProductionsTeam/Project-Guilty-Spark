/** Pointer capture preserves the release location when leaving the tab strip;
 * this never uses WebView2's external/native file-drop handler. */
export function shouldDetachTab(start:{x:number;y:number},end:{x:number;y:number},strip:{left:number;right:number;top:number;bottom:number}):boolean{
  return Math.hypot(end.x-start.x,end.y-start.y)>=18&&
    (end.x<strip.left-32||end.x>strip.right+32||end.y<strip.top-32||end.y>strip.bottom+32);
}

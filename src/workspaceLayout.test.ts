import {expect,test} from 'vitest';
import {changePanel,cleanLayout,defaultPanel} from './workspaceLayout';
test('damaged remembered layouts cannot create invisible or unbounded panels',()=>{
 const layout=cleanLayout({focus:'yes',panels:{inspector:{open:true,dock:'unknown',width:Infinity,height:-10,x:1e9,y:NaN},'../escape':defaultPanel()}});
 expect(layout.focus).toBe(false);expect(Object.keys(layout.panels)).toEqual(['inspector']);
 expect(layout.panels.inspector).toMatchObject({open:true,dock:'right',width:360,height:160,x:4096,y:40});
});
test('opening another edge drawer preserves the first layout and leaves floating tools alone',()=>{
 let layout=changePanel(cleanLayout(null),'inspector',{open:true,width:430,pinned:true});
 layout=changePanel(layout,'notes',{open:true,dock:'float',x:50});
 const next=changePanel(layout,'camera',{open:true});
 expect(next.panels.inspector).toMatchObject({open:false,width:430,pinned:true});expect(next.panels.notes.open).toBe(true);expect(next.panels.camera.open).toBe(true);
 expect(layout.panels.inspector.open).toBe(true);
});
test('changing one map layout cannot mutate another stored map snapshot',()=>{
 const mapA=changePanel(cleanLayout(null),'inspector',{open:true,dock:'float',width:520}),mapB=cleanLayout(null);
 const changed=changePanel(mapA,'inspector',{width:300});expect(mapA.panels.inspector.width).toBe(520);expect(changed.panels.inspector.width).toBe(300);expect(mapB.panels).toEqual({});
});

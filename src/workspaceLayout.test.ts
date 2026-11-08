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

test('docked drawers reserve their true bounded size while floating windows do not obscure reserved content',async()=>{
 const {drawerInsets}=await import('./workspaceLayout');const right={...defaultPanel(),open:true,width:720};
 expect(drawerInsets({right},1000,700)).toEqual({left:0,right:720,top:0,bottom:0});
 const both=drawerInsets({right,left:{...right,dock:'left'}},800,600);expect(both.left+both.right).toBeLessThanOrEqual(560);
 expect(drawerInsets({floating:{...right,dock:'float'}},800,600).right).toBe(0);
 expect(drawerInsets({closed:{...right,open:false}},800,600).right).toBe(0);
});

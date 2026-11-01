//! Bounded decoded-map reuse. Eviction releases the cache's Arc, never geometry
//! from a live caller. A miss uses the complete existing inspection pipeline.
use spark_core::maps::{MapInspection,MeshData};
use std::{collections::{HashMap,VecDeque},sync::Arc};
const MAX_ENTRIES:usize=8;
const MAX_BYTES:usize=256*1024*1024;
#[derive(Default)]
pub(super) struct InspectionCache{entries:HashMap<String,(Arc<MapInspection>,usize)>,order:VecDeque<String>,bytes:usize,evictions:u64}
fn mesh_bytes(m:&MeshData)->usize{
    (m.positions.capacity()+m.normals.capacity()+m.uvs.capacity()+m.lightmap_uvs.capacity())*4+m.indices.capacity()*4+
    m.rig.as_ref().map_or(0,|r|r.nodes.capacity()*128+r.indices.capacity()*2+r.weights.capacity()*4)+m.parts.capacity()*96+m.material_ranges.capacity()*64
}
fn weight(i:&MapInspection)->usize{
    // Conservative heap estimate plus an independent entry bound. This is a
    // cache policy, not the process's measured total memory consumption.
    2*(mesh_bytes(&i.mesh)+i.render_mesh.as_ref().map_or(0,mesh_bytes)+i.model_meshes.values().map(mesh_bytes).sum::<usize>()+
    i.tags.iter().map(|t|256+t.path.len()+t.fields.len()*256+t.references.len()*128).sum::<usize>()+i.objects.len()*512+i.decals.len()*256)
}
impl InspectionCache{
    pub fn get(&mut self,id:&str)->Option<Arc<MapInspection>>{let item=self.entries.get(id)?.0.clone();self.order.retain(|key|key!=id);self.order.push_back(id.into());Some(item)}
    pub fn insert(&mut self,id:String,item:Arc<MapInspection>){
        self.remove(&id);let size=weight(&item);
        if size>MAX_BYTES{return;}
        while self.entries.len()>=MAX_ENTRIES||self.bytes+size>MAX_BYTES{let Some(old)=self.order.pop_front()else{break};if let Some((_,bytes))=self.entries.remove(&old){self.bytes-=bytes;self.evictions+=1;}}
        self.bytes+=size;self.order.push_back(id.clone());self.entries.insert(id,(item,size));
    }
    pub fn remove(&mut self,id:&str){if let Some((_,size))=self.entries.remove(id){self.bytes-=size;}self.order.retain(|key|key!=id);}
    pub fn clear(&mut self){self.entries.clear();self.order.clear();self.bytes=0;}
    pub fn stats(&self)->serde_json::Value{serde_json::json!({"entries":self.entries.len(),"estimatedBytes":self.bytes,"maxEntries":MAX_ENTRIES,"maxEstimatedBytes":MAX_BYTES,"evictions":self.evictions})}
}
#[cfg(test)]mod tests{
    use super::*;
    fn inspection()->Arc<MapInspection>{Arc::new(serde_json::from_value(serde_json::json!({"header":{"version":609,"engine":"CE","name":"cache-policy-fixture","build":"","scenarioType":1,"fileSize":2048,"declaredSize":2048,"tagOffset":2048,"tagSize":0,"crc32":0,"flags":0,"demoLayout":false,"compressed":false,"extended":false,"legacyTagSizeRepair":false},"sha256":"a".repeat(64),"tags":[],"objects":[],"mesh":{"positions":[0,0,0,1,0,0,0,1,0],"indices":[0,1,2],"label":"full fixture geometry","source":"fixture"},"encounters":[],"scripts":[],"resources":[],"diagnostics":[],"scenarioPath":"levels/test/fixture"})).unwrap())}
    #[test]fn lru_eviction_does_not_modify_a_live_full_geometry_reference(){let mut cache=InspectionCache::default();let live=inspection();cache.insert("first".into(),live.clone());for n in 0..8{cache.insert(n.to_string(),inspection());}assert!(cache.get("first").is_none());assert_eq!(live.mesh.positions.len(),9);assert_eq!(live.mesh.indices,vec![0,1,2]);cache.get("0");cache.insert("new".into(),inspection());assert!(cache.get("0").is_some());assert!(cache.get("1").is_none());assert_eq!(cache.stats()["entries"],8);cache.clear();assert_eq!(cache.stats()["estimatedBytes"],0);}
}

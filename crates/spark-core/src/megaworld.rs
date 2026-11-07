//! Read-only Atlas of owned Halo caches. Regions keep their exact cache identity;
//! native geometry planning/rebuilds use the existing BSP assembly pipeline.
use crate::{invalid, maps::{self, MapInspection, MeshData}, Result};
use serde::{Deserialize,Serialize};
use std::{collections::{BTreeMap,BTreeSet}, path::{Path,PathBuf}, time::Instant};
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Region {
    pub id:String,pub map_name:String,pub scenario:String,pub bsp_name:String,pub bsp_index:usize,
    pub cache_sha256:String,pub cache_version:u32,pub scenario_type:u16,pub coordinates:String,
    pub minimum:[f32;3],pub maximum:[f32;3],pub collision_triangles:usize,pub collision_vertices:usize,
    pub render_triangles:usize,pub boundary_edges:usize,pub nonmanifold_edges:usize,pub degenerate_triangles:usize,
    pub shaders:Vec<String>,pub missing_shader_references:usize,pub source_paths:Vec<PathBuf>,
    pub runtimes:Vec<String>,pub translation:[f64;3],pub yaw_degrees:f64,
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CacheRecord {pub path:PathBuf,pub runtime:String,pub sha256:Option<String>,pub bytes:u64,pub regions:usize,pub error:Option<String>,pub elapsed_ms:u64}
#[derive(Clone,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct Atlas {pub schema_version:u32,pub regions:Vec<Region>,pub caches:Vec<CacheRecord>,pub elapsed_ms:u64,pub limitations:Vec<String>}

/// Optional Spark layout metadata, not compiled BSP geometry or runtime state.
/// Sources are readmitted by full cache hash before native import/build.
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct LayoutRegion {
    pub region_id:String,pub cache_sha256:String,pub cache_version:u32,pub bsp_index:usize,
    pub map_name:String,pub bsp_name:String,pub minimum:[f64;3],pub maximum:[f64;3],
    pub translation:[f64;3],pub yaw_degrees:f64,
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Layout {pub schema_version:u32,pub regions:Vec<LayoutRegion>}
impl Layout {
    pub fn validate(&self)->Result<()> {
        if self.schema_version!=1||self.regions.len()>64{return invalid("Atlas layout supports schema 1 and at most 64 region plans");}
        let mut seen=BTreeSet::new();
        for r in &self.regions {
            if r.cache_sha256.len()!=64||!r.cache_sha256.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))
                ||r.region_id!=format!("{}:{}",r.cache_sha256,r.bsp_index)||!seen.insert(&r.region_id)
                ||r.bsp_index>=64||![5,6,7,13,609].contains(&r.cache_version) {
                return invalid("Atlas region identity is invalid or duplicated");
            }
            if [&r.map_name,&r.bsp_name].iter().any(|s|s.is_empty()||s.len()>512||s.chars().any(char::is_control)) {
                return invalid("Atlas region labels are invalid");
            }
            if r.minimum.iter().chain(&r.maximum).chain(&r.translation).any(|n|!n.is_finite()||n.abs()>1_000_000.)
                ||!r.yaw_degrees.is_finite()||r.yaw_degrees.abs()>360_000.
                ||(0..3).any(|a|r.minimum[a]>r.maximum[a]) {
                return invalid("Atlas layout has invalid bounds or transform");
            }
        }Ok(())
    }
}

pub fn regions(path:&Path,runtime:&str,i:&MapInspection,mesh:&MeshData)->Result<Vec<Region>>{
    let mut out=vec![];
    for (index,part) in mesh.parts.iter().enumerate(){
        let ids=mesh.indices.get(part.index_start..part.index_start.checked_add(part.index_count).ok_or_else(||crate::SparkError::Invalid("Atlas index range overflow".into()))?).ok_or_else(||crate::SparkError::Invalid("Atlas collision range invalid".into()))?;
        if ids.len()%3!=0{return invalid("Atlas collision is not a triangle list");}
        let mut low=[f32::INFINITY;3];let mut high=[f32::NEG_INFINITY;3];
        let mut vertices=BTreeMap::new();let mut edges=BTreeMap::<(usize,usize),usize>::new();let mut degenerate=0;
        for tri in ids.chunks_exact(3){let mut welded=[0;3];let mut p=[[0f32;3];3];
            for k in 0..3{let start=(tri[k] as usize).checked_mul(3).ok_or_else(||crate::SparkError::Invalid("Atlas vertex overflow".into()))?;p[k]=mesh.positions.get(start..start+3).ok_or_else(||crate::SparkError::Invalid("Atlas vertex outside source".into()))?.try_into().unwrap();
                if p[k].iter().any(|v|!v.is_finite()){return invalid("Atlas has nonfinite source coordinates");}
                for a in 0..3{low[a]=low[a].min(p[k][a]);high[a]=high[a].max(p[k][a]);}
                let key=p[k].map(|v|if v==0.{0}else{v.to_bits()});let next=vertices.len();welded[k]=*vertices.entry(key).or_insert(next);
            }
            let u=std::array::from_fn::<_,3,_>(|a|p[1][a] as f64-p[0][a] as f64);let v=std::array::from_fn::<_,3,_>(|a|p[2][a] as f64-p[0][a] as f64);
            if [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]].iter().map(|x|x*x).sum::<f64>()<1e-16{degenerate+=1;}
            for (a,b) in [(0,1),(1,2),(2,0)]{let x=welded[a];let y=welded[b];*edges.entry((x.min(y),x.max(y))).or_default()+=1;}
        }
        if ids.is_empty(){low=[0.;3];high=[0.;3];}
        let ranges=i.render_mesh.as_ref().map(|m|m.material_ranges.iter().filter(|r|r.bsp_index==index).collect::<Vec<_>>()).unwrap_or_default();
        let mut shaders=BTreeSet::new();let mut missing=BTreeSet::new();
        for r in &ranges{if let Some(tag)=i.tags.iter().find(|t|t.id==r.shader_tag_id){shaders.insert(format!("{} · {}",tag.class,tag.path));}else{missing.insert(r.shader_tag_id);}}
        out.push(Region{id:format!("{}:{index}",i.sha256),map_name:i.header.name.clone(),scenario:i.scenario_path.clone(),bsp_name:part.name.clone(),bsp_index:index,cache_sha256:i.sha256.clone(),cache_version:i.header.version,scenario_type:i.header.scenario_type,coordinates:"Halo native Z-up world units".into(),minimum:low,maximum:high,collision_triangles:ids.len()/3,collision_vertices:vertices.len(),render_triangles:ranges.iter().map(|r|r.index_count/3).sum(),boundary_edges:edges.values().filter(|n|**n==1).count(),nonmanifold_edges:edges.values().filter(|n|**n>2).count(),degenerate_triangles:degenerate,shaders:shaders.into_iter().collect(),missing_shader_references:missing.len(),source_paths:vec![path.into()],runtimes:vec![runtime.into()],translation:[0.;3],yaw_degrees:0.});
    }Ok(out)
}
/// Exact duplicate caches are decoded once. A cache miss still verifies the
/// complete file hash before reusing a prior decoded metadata record.
pub fn inventory(inputs:&[(PathBuf,String)],previous:Option<&Atlas>)->Result<Atlas>{
    if inputs.len()>256{return invalid("Atlas accepts at most 256 owned caches per scan");}
    let start=Instant::now();let mut atlas=Atlas{schema_version:1,limitations:vec!["Atlas topology is source collision metadata, not native rebuild or gameplay acceptance.".into(),"A scenario's BSP references load separately. Megaworld connections require one physically merged resident BSP.".into(),"Shaders are recorded by native identity; their complete editable tag dependency closure is rechecked by the native compiler.".into()],..Default::default()};
    let mut decoded=BTreeSet::new();
    for (path,runtime) in inputs{let now=Instant::now();let bytes=std::fs::metadata(path).map(|m|m.len()).unwrap_or(0);let mut record=CacheRecord{path:path.clone(),runtime:runtime.clone(),sha256:None,bytes,regions:0,error:None,elapsed_ms:0};
        let result=(||->Result<()> {
            crate::reject_links(path)?;let (header,bytes,sha)=maps::read_original_cache_snapshot(path)?;record.sha256=Some(sha.clone());
            if !decoded.contains(&sha){
                let retained=previous.filter(|a|a.schema_version==1).map(|a|a.regions.iter().filter(|r|r.cache_sha256==sha).cloned().collect::<Vec<_>>()).unwrap_or_default();
                if !retained.is_empty(){atlas.regions.extend(retained.into_iter().map(|mut r|{r.source_paths=vec![path.clone()];r.runtimes=vec![runtime.clone()];r}));}else{
                    let bytes=maps::normalize_cache_snapshot(&header,bytes)?;
                    let i=maps::inspect_snapshot(path,path.parent(),header.clone(),&bytes,sha.clone(),false)?;
                    if ![0,1].contains(&i.header.scenario_type){return invalid("Not an original campaign/multiplayer scenario");}
                    let (mesh,_)=maps::collision_snapshot(&header,&bytes,&i)?;atlas.regions.extend(regions(path,runtime,&i,&mesh)?);
                }
                decoded.insert(sha.clone());
            }
            for r in atlas.regions.iter_mut().filter(|r|r.cache_sha256==sha){record.regions+=1;if !r.source_paths.contains(path){r.source_paths.push(path.clone());}if !r.runtimes.contains(runtime){r.runtimes.push(runtime.clone());}}
            Ok(())
        })();if let Err(e)=result{record.error=Some(e.to_string());}record.elapsed_ms=now.elapsed().as_millis() as u64;atlas.caches.push(record);
    }
    atlas.elapsed_ms=start.elapsed().as_millis() as u64;Ok(atlas)
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn topology_and_source_parts_are_scoped_and_bad_indices_refused(){
        let mesh=MeshData{positions:vec![0.,0.,0.,1.,0.,0.,0.,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"one".into(),index_start:0,index_count:3}],..Default::default()};
        let i=MapInspection{header:maps::MapHeader{version:609,name:"fixture".into(),engine:"CE".into(),build:String::new(),scenario_type:1,file_size:4096,declared_size:4096,tag_offset:2048,tag_size:100,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false},sha256:"a".repeat(64),tag_checksum:None,tags:vec![],objects:vec![],decals:vec![],mesh:mesh.clone(),render_mesh:None,model_meshes:Default::default(),encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"levels/test/fixture".into()};
        let r=regions(Path::new("one.map"),"CE",&i,&mesh).unwrap();assert_eq!(r[0].boundary_edges,3);assert_eq!(r[0].collision_vertices,3);assert_eq!(r[0].maximum,[1.,1.,0.]);
        let mut bad=mesh;bad.indices[0]=u32::MAX;assert!(regions(Path::new("one.map"),"CE",&i,&bad).is_err());
    }
}

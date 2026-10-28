//! Owner-run BSP topology inspection; no game files are modified.
use spark_core::{maps,Result};
use std::{collections::BTreeMap,path::Path};
fn main()->Result<()>{
 for file in std::env::args().skip(1){
  let i=maps::inspect_map(Path::new(&file),Path::new(&file).parent())?;
  println!("{}",serde_json::json!({"scenario":i.scenario_path,"sha256":i.sha256,"collision":stats(&i.mesh),"render":i.render_mesh.as_ref().map(stats)}));
 }
 Ok(())
}
fn stats(mesh:&maps::MeshData)->serde_json::Value{
 let mut parts=vec![];
 for p in &mesh.parts{
  let mut edges:BTreeMap<([i64;3],[i64;3]),(usize,i32)>=BTreeMap::new();let mut volume=0.;let mut min=[f64::INFINITY;3];let mut max=[f64::NEG_INFINITY;3];
  for t in mesh.indices[p.index_start..p.index_start+p.index_count].chunks_exact(3){let v:Vec<[f64;3]>=t.iter().map(|i|std::array::from_fn(|k|mesh.positions[*i as usize*3+k] as f64)).collect();for x in &v{for k in 0..3{min[k]=min[k].min(x[k]);max[k]=max[k].max(x[k]);}}volume+=(v[0][0]*(v[1][1]*v[2][2]-v[1][2]*v[2][1])+v[0][1]*(v[1][2]*v[2][0]-v[1][0]*v[2][2])+v[0][2]*(v[1][0]*v[2][1]-v[1][1]*v[2][0]))/6.;let q:Vec<[i64;3]>=v.iter().map(|p|p.map(|x|(x*100000.).round() as i64)).collect();for e in 0..3{let(a,b)=(q[e],q[(e+1)%3]);let(key,direction)=if a<b{((a,b),1)}else{((b,a),-1)};let n=edges.entry(key).or_default();n.0+=1;n.1+=direction;}}
  parts.push(serde_json::json!({"name":p.name,"triangles":p.index_count/3,"volume":volume,"bounds":[min,max],"openEdges":edges.values().filter(|v|v.0==1).count(),"nonManifold":edges.values().filter(|v|v.0!=2||v.1!=0).count()}));
 }
 serde_json::json!({"vertices":mesh.positions.len()/3,"triangles":mesh.indices.len()/3,"parts":parts,"materialRanges":mesh.material_ranges.len()})
}

//! Optional edge-selected seam sections, all rebuilt by the existing native CSG pipeline.
use super::*;
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct SeamEdge {
    pub source_sha256:String,
    pub bsp_index:usize,
    pub vertices:[V;2],
    pub point:V,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct SeamSection {
    pub id:String,
    pub name:String,
    pub points:Vec<V>,
    pub width:f32,
    pub height:f32,
    pub shader_path:String,
    #[serde(default)]
    pub open_road:bool,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub arch_segments:Option<u8>,
    pub edges:[SeamEdge;2],
}
impl SeamEdge {
    fn validate(&self,hash:&str,bsp:usize)->Result<()> {
        if self.source_sha256!=hash||self.bsp_index!=bsp||self.vertices.iter().flatten().chain(self.point.iter()).any(|n|!n.is_finite()||n.abs()>2048.) {
            return invalid("The selected BSP edge belongs to a different source or unsupported coordinates");
        }
        let d=sub(self.vertices[1],self.vertices[0]);let length2=dot(d,d);
        if length2<1e-8{return invalid("Choose a nonzero native BSP edge");}
        let t=dot(sub(self.point,self.vertices[0]),d)/length2;
        if !(-1e-5..=1.+1e-5).contains(&t)||dot(sub(add(self.vertices[0],mul(d,t)),self.point),sub(add(self.vertices[0],mul(d,t)),self.point))>1e-6 {
            return invalid("The selected point is not on its native BSP edge");
        }
        Ok(())
    }
}
pub(super) fn validate_edges(section:&SeamSection,base_hash:&str,plan:&BspAssembly)->Result<()> {
    section.edges[0].validate(base_hash,0)?;section.edges[1].validate(&plan.donor_source.sha256,plan.donor_bsp_index)
}
fn matching_edge(mesh:&MeshData,pick:&SeamEdge)->Result<()> {
    let same=|a:V,b:V|a.iter().zip(b).all(|(a,b)|(*a-b).abs()<0.0001);
    let found=mesh.material_ranges.iter().filter(|r|r.bsp_index==pick.bsp_index).any(|r|{
        mesh.indices[r.index_start..r.index_start+r.index_count].chunks_exact(3).any(|ids|{
            (0..3).any(|i|{let a=vertex(mesh,ids[i]);let b=vertex(mesh,ids[(i+1)%3]);same(a,pick.vertices[0])&&same(b,pick.vertices[1])||same(a,pick.vertices[1])&&same(b,pick.vertices[0])})
        })
    });
    if !found{return invalid("The selected edge is not in this exact native rendered BSP; select it again");}Ok(())
}
pub(super) fn verify_rendered_edge(path:&Path,inspection:&MapInspection,pick:&SeamEdge)->Result<()> {
    if let Some(mesh)=&inspection.render_mesh{matching_edge(mesh,pick)}else{matching_edge(&maps::render_bsp_source(path,inspection,pick.bsp_index)?,pick)}
}
fn anchor(path:&Path,inspection:&MapInspection,pick:&SeamEdge)->Result<V>{
    pick.validate(&inspection.sha256,pick.bsp_index)?;
    let rendered=if let Some(mesh)=&inspection.render_mesh{mesh.clone()}else{maps::render_bsp_source(path,inspection,pick.bsp_index)?};
    matching_edge(&rendered,pick)?;
    let (mesh,faces)=maps::collision_source(path,inspection)?;
    let part=mesh.parts.get(pick.bsp_index).ok_or_else(||SparkError::Invalid("Selected source BSP is unavailable".into()))?;
    let points=mesh.indices[part.index_start..part.index_start+part.index_count].iter().map(|i|vertex(&mesh,*i)).collect::<Vec<_>>();
    let center:(V,V)=(std::array::from_fn(|k|points.iter().map(|p|p[k]).fold(f64::INFINITY,f64::min)),std::array::from_fn(|k|points.iter().map(|p|p[k]).fold(f64::NEG_INFINITY,f64::max)));
    let toward=[(center.0[0]+center.1[0])/2.-pick.point[0],(center.0[1]+center.1[1])/2.-pick.point[1],0.];
    let edge=sub(pick.vertices[1],pick.vertices[0]);let horizontal=edge[0].hypot(edge[1]);
    let mut inward=if horizontal>1e-5 {[-edge[1]/horizontal,edge[0]/horizontal,0.]}else{let length=toward[0].hypot(toward[1]);if length<1e-5{return invalid("Choose an edge with a clear inward floor direction");}mul(toward,1./length)};
    if dot(inward,toward)<0.{inward=mul(inward,-1.);}
    let checker=crate::bsp_clearance::RouteChecker::new(&mesh)?;
    for distance in [1.,2.,4.,8.,12.] {for sign in [1.,-1.] {
        let at=add(pick.point,mul(inward,distance*sign));
        if let Ok((p,_))=terrain::source_floor(&mesh,&faces,pick.bsp_index,at,0.65){
            if (p[2]-pick.point[2]).abs()<=8.&&checker.verify_start(p).is_ok(){return Ok(p);}
        }
    }}
    invalid("No supported entrance within 12 units of this edge. Pick a lower wall or floor edge near the intended doorway")
}
/// Source-bound picks add one independently editable section; no original bytes change.
pub fn append_edge_section(base_path:&Path,base:&MapInspection,plan:&BspAssembly,edges:[SeamEdge;2])->Result<BspAssembly>{
    if plan.sections.len()>=8{return invalid("Use at most eight authored seam sections per two-region build");}
    edges[0].validate(&base.sha256,0)?;edges[1].validate(&plan.donor_source.sha256,plan.donor_bsp_index)?;
    let donor=maps::inspect_map(&plan.donor_source.preserved_path,plan.donor_source.resource_directory.as_deref())?;
    let start=anchor(base_path,base,&edges[0])?;
    let end=transform(anchor(&plan.donor_source.preserved_path,&donor,&edges[1])?,plan.translation,plan.yaw_degrees);
    let mut next=plan.clone();next.sections.push(SeamSection{id:uuid::Uuid::new_v4().to_string(),name:format!("Seam section {}",plan.sections.len()+1),points:vec![start,end],width:4.,height:3.,shader_path:plan.tunnel_shader_path.clone(),open_road:false,arch_segments:Some(6),edges});
    next.validate()?;Ok(next)
}
/// Floor-center, right floor/wall, coarse half-circle, left wall/floor. Height
/// means rectangular head clearance; the arch rises another width/2 above it.
pub(super) fn arch_profile(width:f64,height:f64,segments:u8)->Result<Vec<[f64;2]>>{
    if !(2..=12).contains(&segments)||!width.is_finite()||width<=0.||!height.is_finite()||height<=0.{return invalid("An arch needs 2-12 roof segments and positive dimensions");}
    let half=width/2.;let mut p=vec![[0.,0.],[half,0.],[half,height]];
    for i in 1..=segments {let angle=std::f64::consts::PI*i as f64/segments as f64;p.push([half*angle.cos(),height+half*angle.sin()]);}
    p.push([-half,0.]);Ok(p)
}
pub(super) fn arch_solid(a:V,b:V,side_a:V,side_b:V,width:f64,height:f64,segments:u8,material:usize)->Result<Manifold>{
    let profile=arch_profile(width,height,segments)?;let count=profile.len();
    let mut p=Vec::with_capacity(2*count+2);
    for (at,side) in [(a,side_a),(b,side_b)] {for [across,z] in &profile {p.push(add(add(at,mul(side,*across/(width/2.))),[0.,0.,*z]));}}
    p.extend([add(a,[0.,0.,height/2.]),add(b,[0.,0.,height/2.])]);
    let mut gl=MeshGL64{num_prop:5,..Default::default()};
    let mut triangle=|ids:[usize;3]|{let v=ids.map(|i|p[i]);let n=normal(v[0],v[1],v[2]);let first=gl.num_vert() as u64;for point in v{gl.vert_properties.extend(point);gl.vert_properties.extend(planar_uv(point,n));}gl.tri_verts.extend([first,first+1,first+2]);gl.face_id.push(material as u64);};
    for i in 0..count {let j=(i+1)%count;triangle([i,j,count+j]);triangle([i,count+j,count+i]);triangle([count*2,j,i]);triangle([count*2+1,count+i,count+j]);}
    gl.merge();checked(Manifold::from_mesh_gl64(&gl),"Arched seam section")
}
pub(super) fn arch_portal(center:V,direction:V,width:f64,height:f64,segments:u8)->Result<Vec<V>>{
    let length=direction[0].hypot(direction[1]);if length<0.5{return invalid("Arch portal direction is too short");}
    let side=[-direction[1]/length,direction[0]/length,0.];
    Ok(arch_profile(width,height,segments)?.into_iter().map(|[s,z]|add(add(center,mul(side,s)),[0.,0.,z])).collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn coarse_arches_are_closed_native_solids_with_world_scaled_uvs(){
        for segments in [2,6,12]{let solid=arch_solid([0.,0.,0.],[10.,0.,0.],[0.,2.,0.],[0.,2.,0.],4.,3.,segments,7).unwrap();
            assert_eq!(solid.decompose().len(),1);assert!(solid.volume()>120.&&solid.volume()<185.);let mesh=solid.get_mesh_gl64(-1);assert_eq!(mesh.num_prop,5);assert!(mesh.face_id.iter().all(|id|*id==7));assert!(mesh.num_tri()<=4*(segments as usize+4));
            let portal=arch_portal([5.,0.,0.],[10.,0.,0.],4.,3.,segments).unwrap();assert!(portal.iter().all(|p|p[0]==5.));assert!(portal.iter().map(|p|p[2]).fold(0.,f64::max)>4.);}
        assert!(arch_profile(4.,3.,1).is_err());assert!(arch_profile(4.,3.,13).is_err());
    }
    #[test]
    fn edge_provenance_rejects_other_sources_off_edge_points_and_invented_vertices(){
        let hash="a".repeat(64);let pick=SeamEdge{source_sha256:hash.clone(),bsp_index:0,vertices:[[0.,0.,0.],[2.,0.,0.]],point:[1.,0.,0.]};pick.validate(&hash,0).unwrap();assert!(pick.validate(&"b".repeat(64),0).is_err());assert!(pick.validate(&hash,1).is_err());
        let mut off=pick.clone();off.point[1]=0.1;assert!(off.validate(&hash,0).is_err());
        let mesh=MeshData{positions:vec![0.,0.,0.,2.,0.,0.,0.,2.,0.],indices:vec![0,1,2],material_ranges:vec![maps::MeshMaterialRange{shader_tag_id:1,bsp_index:0,lightmap_index:0,lightmap_page:-1,lightmap_bitmap_tag_id:None,has_lightmap_uvs:false,index_start:0,index_count:3}],..Default::default()};
        matching_edge(&mesh,&pick).unwrap();off=pick.clone();off.vertices[1][0]=3.;assert!(matching_edge(&mesh,&off).is_err());
    }
}

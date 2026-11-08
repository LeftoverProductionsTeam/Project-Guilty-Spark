//! Source-derived terrain ribbon for the existing connected-BSP boolean builder.
//! This is authoring metadata and native source generation, never a runtime patch.
use super::*;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct TerrainSeam {
    pub shoulder_width: f64,
    pub bank_height: f64,
    pub base_shader_path: String,
    pub donor_shader_path: String,
}
impl TerrainSeam {
    pub(super) fn validate(&self, plan:&BspAssembly)->Result<()> {
        if !self.shoulder_width.is_finite() || !(2.0..=24.0).contains(&self.shoulder_width)
            || !self.bank_height.is_finite() || !(0.0..=12.0).contains(&self.bank_height)
            || !plan.open_road || plan.tunnel_points.len()!=2 || plan.yaw_degrees.abs()>1e-7 {
            return invalid("A terrain seam needs one straight open road, unrotated source boundaries, shoulders of 2-24 units and banks of 0-12 units");
        }
        let d=sub(plan.tunnel_points[1],plan.tunnel_points[0]);
        if d[0]<4. || d[0].hypot(d[1])>96. {
            return invalid("A terrain seam must join adjacent east/west boundaries within 96 units; use a nearby supported floor");
        }
        for path in [&self.base_shader_path,&self.donor_shader_path] {
            safe_relative(path)?;if path.len()>200{return invalid("Terrain shader path exceeds its native source limit");}
        }
        Ok(())
    }
}
pub(super) fn source_floor(mesh:&MeshData, faces:&[CollisionFace], part:usize, at:V,min_up:f64)->Result<(V,usize)> {
    let part=mesh.parts.get(part).ok_or_else(||SparkError::Invalid("Terrain source BSP is unavailable".into()))?;
    let mut found:Option<(V,usize)>=None;
    for (index,ids) in mesh.indices[part.index_start..part.index_start+part.index_count].chunks_exact(3).enumerate() {
        let face_index=part.index_start/3+index;let face=&faces[face_index];
        if face.shader.is_none() || face.flags&2!=0 {continue;}
        let p: [V;3]=std::array::from_fn(|k|vertex(mesh,ids[k]));
        if normal(p[0],p[1],p[2])[2]<min_up{continue;}
        let den=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);
        if den.abs()<1e-10 {continue;}
        let u=((p[1][1]-p[2][1])*(at[0]-p[2][0])+(p[2][0]-p[1][0])*(at[1]-p[2][1]))/den;
        let v=((p[2][1]-p[0][1])*(at[0]-p[2][0])+(p[0][0]-p[2][0])*(at[1]-p[2][1]))/den;
        if u < -1e-7 || v < -1e-7 || u+v>1.+1e-7 {continue;}
        let z=u*p[0][2]+v*p[1][2]+(1.-u-v)*p[2][2];
        if found.as_ref().is_none_or(|(old,_)|z>old[2]) {found=Some(([at[0],at[1],z],face_index));}
    }
    found.ok_or_else(||SparkError::Invalid(format!("No visible supported outdoor floor at {:.2}, {:.2}; move the seam away from sky boundaries or overhangs",at[0],at[1])))
}
pub(super) fn render_edge(inspection:&MapInspection,index:usize,east:bool)->Result<f64>{
    let mesh=inspection.render_mesh.as_ref().ok_or_else(||SparkError::Invalid("Recover the original rendered terrain before joining its boundary".into()))?;
    let values=mesh.material_ranges.iter().filter(|r|r.bsp_index==index).flat_map(|r|&mesh.indices[r.index_start..r.index_start+r.index_count]).map(|id|vertex(mesh,*id)[0]);
    let value=if east{values.fold(f64::NEG_INFINITY,f64::max)}else{values.fold(f64::INFINITY,f64::min)};
    if !value.is_finite(){return invalid("Rendered source boundary is empty");}Ok(value)
}
/// Retire only the sky buffer beyond every rendered donor surface. Any visible
/// collision outside that plane refuses the cut; no authored landscape is lost.
pub(super) fn trim_donor(body:Manifold,inspection:&MapInspection,mesh:&MeshData,faces:&[CollisionFace],plan:&BspAssembly,sky:usize,token:&CancelToken)->Result<Manifold>{
    let cut=render_edge(inspection,plan.donor_bsp_index,false)?-0.25;
    let part=&mesh.parts[plan.donor_bsp_index];
    for (index,ids) in mesh.indices[part.index_start..part.index_start+part.index_count].chunks_exact(3).enumerate(){
        let face=&faces[part.index_start/3+index];
        if face.shader.is_some()&&face.flags&2==0&&ids.iter().any(|id|vertex(mesh,*id)[0]<cut-0.001){return invalid("A visible native collision surface lies beyond the proposed sky-buffer cut; choose a protected manual seam instead");}
    }
    if inspection.objects.iter().any(|object|(object.position[0] as f64)<cut){return invalid("A source object lies in the proposed sky-buffer cut; move the seam without dropping it");}
    let points=mesh.indices[part.index_start..part.index_start+part.index_count].iter().map(|id|transform(vertex(mesh,*id),plan.translation,0.)).collect::<Vec<_>>();
    let lo:V=std::array::from_fn(|k|points.iter().map(|p|p[k]).fold(f64::INFINITY,f64::min)-1.);
    let hi:V=std::array::from_fn(|k|points.iter().map(|p|p[k]).fold(f64::NEG_INFINITY,f64::max)+1.);
    let side=[0.,(hi[1]-lo[1])/2.,0.];let y=(lo[1]+hi[1])/2.;
    let clip=passage_solid([cut+plan.translation[0],y,lo[2]],[hi[0],y,lo[2]],side,side,hi[2]-lo[2],sky,Some(sky))?;
    checked(body.boolean_with_engine_and_token(&clip,OpType::Intersect,BooleanEngine::Auto,Some(token)),"Invisible donor sky-buffer trim")
}
pub(super) fn plan(base_path:&Path,base:&MapInspection,donor:&MapInspection,mut plan:BspAssembly)->Result<BspAssembly>{
    let (a,af)=maps::collision_source(base_path,base)?;
    let (b,bf)=maps::collision_source(&plan.donor_source.preserved_path,donor)?;
    let min_b=render_edge(donor,plan.donor_bsp_index,false)?-0.25;
    let max_a=a.positions.chunks_exact(3).map(|p|p[0] as f64).fold(f64::NEG_INFINITY,f64::max);
    let start=plan.tunnel_points[0];let end_local=sub(*plan.tunnel_points.last().unwrap(),plan.translation);
    let (end,donor_face)=(0..12).find_map(|step|source_floor(&b,&bf,plan.donor_bsp_index,[min_b+10.+step as f64*2.,end_local[1],0.],0.8).ok()).ok_or_else(||SparkError::Invalid("No nearby walkable donor terrain; choose a different boundary instead of cutting through a building or cliff".into()))?;
    let (_,base_face)=source_floor(&a,&af,0,start,0.65)?;
    let shader=|inspection:&MapInspection,faces:&[CollisionFace],face:usize|->Result<String>{
        let tag=inspection.tags.iter().find(|t|Some(t.id)==faces[face].shader&&t.class=="senv")
            .ok_or_else(||SparkError::Invalid("Outdoor floor requires its exact native environment shader".into()))?;
        Ok(tag.path.clone())
    };
    plan.translation=[max_a+2.-min_b,start[1]-end[1],start[2]-end[2]];
    plan.tunnel_points=vec![start,add(end,plan.translation)];
    plan.tunnel_width=6.;plan.tunnel_height=4.;plan.open_road=true;
    plan.infantry_tunnel=None;plan.high_ground=None;plan.visibility_zones.clear();
    plan.terrain_seam=Some(TerrainSeam{shoulder_width:8.,bank_height:4.,base_shader_path:shader(base,&af,base_face)?,donor_shader_path:shader(donor,&bf,donor_face)?});
    plan.validate()?;Ok(plan)
}
// Preserve both native edge profiles and split precisely at the material
// boundary. A flat connector needs no uniform subdivision; shaped shoulders
// use at most one station per four world units, not a dense tessellated sheet.
fn stations(length:f64, boundary:f64, flat:bool)->Vec<f64>{
    let spans=if flat {1}else{((length/4.).ceil() as usize).max(2)};
    let mut result=(0..=spans).map(|i|i as f64/spans as f64).collect::<Vec<_>>();
    if boundary>1e-8&&boundary<1.-1e-8 {result.push(boundary);}
    result.sort_by(f64::total_cmp);result.dedup_by(|a,b|(*a-*b).abs()<1e-8);result
}
pub(super) struct Ribbon {
    pub rows:Vec<Vec<V>>,
    pub roof:f64,
    projections:[RenderTri;2],
    source_boundary:f64,
}
impl Ribbon {
    pub fn new(base:&MapInspection,a:&MeshData,af:&[CollisionFace],donor:&MapInspection,b:&MeshData,bf:&[CollisionFace],plan:&BspAssembly)->Result<Self>{
        let seam=plan.terrain_seam.as_ref().unwrap();seam.validate(plan)?;
        let min_b=render_edge(donor,plan.donor_bsp_index,false)?-0.25+plan.translation[0];
        let max_a=a.positions.chunks_exact(3).map(|p|p[0] as f64).fold(f64::NEG_INFINITY,f64::max);
        if !(1.6..=4.).contains(&(min_b-max_a)) {return invalid("Terrain boundaries must be adjacent with a 1.6-4 unit reconstruction strip; replan before building. Saved tunnel prototypes remain available");}
        let start=plan.tunnel_points[0];let end=plan.tunnel_points[1];let d=sub(end,start);let length=d[0].hypot(d[1]);let side=[-d[1]/length,d[0]/length,0.];
        let half=plan.tunnel_width as f64/2.;let w=seam.shoulder_width;
        let offsets=[-half-w,-half-w*0.5,-half,0.,half,half+w*0.5,half+w];
        let mut profiles=[[0.;7];2];
        for (j,offset) in offsets.iter().enumerate() {
            profiles[0][j]=source_floor(a,af,0,add(start,mul(side,*offset)),0.05)?.0[2];
            let local=sub(add(end,mul(side,*offset)),plan.translation);
            profiles[1][j]=source_floor(b,bf,plan.donor_bsp_index,local,0.05)?.0[2]+plan.translation[2];
        }
        let source_boundary=(max_a+min_b)/2.;
        let flat=seam.bank_height==0.;
        let rows=stations(length,(source_boundary-start[0])/d[0],flat).into_iter().map(|t|{
            let center=add(start,mul(d,t));let blend=if flat{0.}else{(std::f64::consts::PI*t).sin().powi(2)};
            offsets.iter().enumerate().map(|(j,offset)|{
                let mut p=add(center,mul(side,*offset));let native=profiles[0][j]*(1.-t)+profiles[1][j]*t;
                let bank=((offset.abs()-half)/w).clamp(0.,1.).powi(2)*seam.bank_height;
                p[2]=if offset.abs()<=half {center[2]}else{native*(1.-blend)+(center[2]+bank)*blend};p
            }).collect::<Vec<_>>()
        }).collect::<Vec<_>>();
        let roof=a.positions.chunks_exact(3).map(|p|p[2] as f64).chain(b.positions.chunks_exact(3).map(|p|p[2] as f64+plan.translation[2])).fold(f64::NEG_INFINITY,f64::max)+0.25;
        let projection=|inspection:&MapInspection,index:usize,path:&str,at:V|->Result<RenderTri>{
            let tag=inspection.tags.iter().find(|tag|tag.class=="senv"&&tag.path==path).ok_or_else(||SparkError::Invalid("Terrain material no longer exists in its original source".into()))?;
            let mut tris=render_triangles(inspection,index).remove(&tag.id).unwrap_or_default();
            tris.retain(|t|t.n[2]< -0.55);tris.into_iter().min_by(|a,b|{
                let distance=|t:&RenderTri|{let c=mul(add(add(t.p[0],t.p[1]),t.p[2]),1./3.);dot(sub(c,at),sub(c,at))};distance(a).total_cmp(&distance(b))
            }).ok_or_else(||SparkError::Invalid("Terrain source has no verified floor UV projection; keep the original and recover its render source before rebuilding".into()))
        };
        let projections=[projection(base,0,&seam.base_shader_path,start)?,projection(donor,plan.donor_bsp_index,&seam.donor_shader_path,sub(end,plan.translation))?];
        Ok(Self{rows,roof,projections,source_boundary})
    }
    pub fn solid(&self,plan:&BspAssembly,materials:[usize;2],sky:usize)->Result<Manifold>{
        let mut gl=MeshGL64{num_prop:5,..Default::default()};
        let mut emit=|points:[V;3],material:usize,source:usize|->Result<()> {
            let first=gl.num_vert() as u64;
            for p in points {
                let local=if source==1{sub(p,plan.translation)}else{p};
                let tri=&self.projections[source];let weights=bary(local,tri).ok_or_else(||SparkError::Invalid("Terrain UV projection is degenerate".into()))?;
                let uv:[f64;2]=std::array::from_fn(|k|(0..3).map(|i|weights[i]*tri.uv[i][k]).sum());
                if uv.iter().any(|v|!v.is_finite()||v.abs()>100_000.){return invalid("Terrain UV projection exceeds native bounds");}
                gl.vert_properties.extend(p);gl.vert_properties.extend(uv);
            }
            gl.tri_verts.extend([first,first+1,first+2]);gl.face_id.push(material as u64);Ok(())
        };
        let top=|p:V|[p[0],p[1],self.roof];let last=self.rows.len()-1;
        for i in 0..last {let source=usize::from((self.rows[i][3][0]+self.rows[i+1][3][0])/2.>=self.source_boundary);for j in 0..6 {
            let(a,b,c,d)=(self.rows[i][j],self.rows[i+1][j],self.rows[i+1][j+1],self.rows[i][j+1]);
            emit([a,d,c],materials[source],source)?;emit([a,c,b],materials[source],source)?;
            emit([top(a),top(b),top(c)],sky,source)?;emit([top(a),top(c),top(d)],sky,source)?;
        }
        for (j,reverse) in [(0,false),(6,true)] {
            let(a,b)=(self.rows[i][j],self.rows[i+1][j]);let mut q=[a,b,top(b),top(a)];if reverse{q.reverse();}
            emit([q[0],q[1],q[2]],sky,source)?;emit([q[0],q[2],q[3]],sky,source)?;
        }}
        for (i,reverse) in [(0,false),(last,true)] {for j in 0..6 {
            let(a,b)=(self.rows[i][j],self.rows[i][j+1]);let mut q=[a,top(a),top(b),b];if reverse{q.reverse();}
            emit([q[0],q[1],q[2]],sky,0)?;emit([q[0],q[2],q[3]],sky,0)?;
        }}
        gl.merge();checked(Manifold::from_mesh_gl64(&gl),"Source-profile terrain seam")
    }
}

/// Terrain cuts span the verified source sky closure, not the small tunnel
/// envelope. Keep the original tunnel portal limits unchanged.
pub(super) fn portal(center:V,direction:V,width:f64,roof:f64)->Result<[V;4]>{
    let length=direction[0].hypot(direction[1]);
    if !length.is_finite()||length<0.5||!width.is_finite()||!(4.8..=64.).contains(&width)||!roof.is_finite()||roof<=center[2]+1.||roof-center[2]>4096. {return invalid("Invalid source-bounded terrain portal");}
    let side=[-direction[1]/length*width/2.,direction[0]/length*width/2.,0.];
    let a=sub(center,side);let b=add(center,side);let points=[a,b,[b[0],b[1],roof],[a[0],a[1],roof]];
    if points.iter().flatten().any(|v|!v.is_finite()||v.abs()>2048.){return invalid("Terrain portal exceeds the original native world bounds");}Ok(points)
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn flat_strip_keeps_exact_edges_and_shader_boundary_with_bounded_geometry(){
        assert_eq!(stations(32.,0.375,true),vec![0.,0.375,1.]);
        assert_eq!(stations(32.,0.5,true),vec![0.,0.5,1.]);
        let shaped=stations(96.,0.37,false);
        assert!(shaped.len()<=26&&shaped.contains(&0.37));
        assert_eq!((shaped[0],*shaped.last().unwrap()),(0.,1.));
        assert!(shaped.windows(2).all(|pair|(pair[1]-pair[0])*96.<=4.+1e-8));
        assert_eq!(stations(32.,0.,true),vec![0.,1.]);
    }
    #[test]
    fn terrain_planes_cover_outdoor_banks_without_relaxing_tunnel_portal_guards(){
        assert!(crate::bsp_visibility::portal_quad([1.,0.,-23.],[1.,0.,0.],22.,81.).is_err());
        let p=portal([1.,0.,-23.],[1.,0.,0.],22.,58.).unwrap();
        assert_eq!(p,[[1.,-11.,-23.],[1.,11.,-23.],[1.,11.,58.],[1.,-11.,58.]]);
        assert!(portal([2047.,0.,0.],[0.,1.,0.],22.,58.).is_err());
        assert!(portal([0.,0.,0.],[1.,0.,0.],f64::NAN,58.).is_err());
    }
    #[test]
    fn ribbon_is_closed_and_uses_source_uv_scale_on_both_sides(){
        let plan:BspAssembly=serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Synthetic only","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":609,"engine":"synthetic","scenarioPath":"fixture"},"donorTagsDirectory":"fixture","donorBspIndex":0,"translation":[20.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[0.,0.,0.],[32.,0.,0.]],"tunnelWidth":6.,"tunnelHeight":4.,"tunnelShaderPath":"fixture/metal","openRoad":true})).unwrap();
        let project=|offset:f64|RenderTri{p:[[offset,0.,0.],[offset+4.,0.,0.],[offset,4.,0.]],uv:[[0.,0.],[1.,0.],[0.,1.]],n:[0.,0.,1.]};
        let rows=(0..=8).map(|i|[-11f64,-7.,-3.,0.,3.,7.,11.].iter().map(|y|[i as f64*4.,*y,((y.abs()-3.)/8.).max(0.).powi(2)*4.]).collect()).collect();
        let ribbon=Ribbon{rows,roof:20.,projections:[project(0.),project(0.)],source_boundary:16.};
        let body=ribbon.solid(&plan,[0,1],2).unwrap();assert!(body.volume()>10_000.);
        let mesh=body.get_mesh_gl64(-1);assert!(mesh.face_id.contains(&0)&&mesh.face_id.contains(&1)&&mesh.face_id.contains(&2));
        for (index,tri) in mesh.tri_verts.chunks_exact(3).enumerate(){let material=mesh.face_id[index];if material==2{continue;}
            for id in tri{let values=&mesh.vert_properties[*id as usize*5..*id as usize*5+5];let local_x=values[0]-if material==1{20.}else{0.};assert!((values[3]-local_x/4.).abs()<1e-8);assert!((values[4]-values[1]/4.).abs()<1e-8);}
        }
        let mut materials=vec![AssemblyMaterial{name:"test-a".into(),source:0,shader_path:Some("fixture/a".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"test-b".into(),source:1,shader_path:Some("fixture/b".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let (collision,_)=collision_layer(&mesh,&mut materials).unwrap();let mut interior=plan.clone();interior.tunnel_points=vec![[1.,0.,0.],[31.,0.,0.]];assert!(verify_route(&collision,&interior).unwrap()>100);
    }
}

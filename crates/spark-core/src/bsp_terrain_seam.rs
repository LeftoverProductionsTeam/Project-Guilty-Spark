//! Source-derived terrain ribbon for the existing connected-BSP boolean builder.
//! This is authoring metadata and native source generation, never a runtime patch.
use super::*;

const ROAD_FILL_DEPTH: f64 = 1.5;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct TerrainSeam {
    pub shoulder_width: f64,
    pub bank_height: f64,
    pub base_shader_path: String,
    pub donor_shader_path: String,
    /// World-space normal of the boundary strip. Legacy terrain uses east.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bearing_degrees: Option<f64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub grade_road: bool,
}
impl TerrainSeam {
    pub(super) fn axis(&self) -> V {
        let (y, x) = self.bearing_degrees.unwrap_or(0.).to_radians().sin_cos();
        [x, y, 0.]
    }

    pub(super) fn validate(&self, plan:&BspAssembly)->Result<()> {
        if !self.shoulder_width.is_finite() || !(2.0..=24.0).contains(&self.shoulder_width)
            || !self.bank_height.is_finite() || !(0.0..=12.0).contains(&self.bank_height)
            || !plan.open_road || plan.tunnel_points.len()!=2
            || self.bearing_degrees.is_none() && plan.yaw_degrees.abs()>1e-7
            || self.bearing_degrees.is_some_and(|angle| !angle.is_finite() || angle.abs() > 360.) {
            return invalid("A terrain seam needs one straight open road, shoulders of 2–24 units and banks of 0–12 units");
        }
        if self.grade_road && self.bearing_degrees.is_none() {
            return invalid("Grade the full road width on a terrain seam placed in Atlas");
        }
        let d=sub(plan.tunnel_points[1],plan.tunnel_points[0]);
        if dot(d,self.axis())<4. || d[0].hypot(d[1])>96. {
            return invalid(if self.bearing_degrees.is_some() {
                "A terrain seam must cross the selected boundary within 96 units; use a nearby supported floor"
            } else {
                "A terrain seam must join adjacent east/west boundaries within 96 units; use a nearby supported floor"
            });
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
        if (0..2).any(|axis| {
            let values=p.map(|point|point[axis]);
            at[axis]<values[0].min(values[1]).min(values[2])-1e-7
                || at[axis]>values[0].max(values[1]).max(values[2])+1e-7
        }) || normal(p[0],p[1],p[2])[2]<min_up {continue;}
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
fn donor_cut(inspection:&MapInspection,index:usize,axis:V)->Result<f64>{
    let mesh=inspection.render_mesh.as_ref().ok_or_else(||SparkError::Invalid("Recover the original rendered terrain before joining its boundary".into()))?;
    let value=mesh.material_ranges.iter().filter(|r|r.bsp_index==index)
        .flat_map(|r|&mesh.indices[r.index_start..r.index_start+r.index_count])
        .map(|id|dot(vertex(mesh,*id),axis)).fold(f64::INFINITY,f64::min);
    if !value.is_finite(){return invalid("Rendered source boundary is empty");}
    Ok(value-0.25)
}

#[derive(Clone, Copy)]
pub(super) struct Boundary {
    pub axis: V,
    pub base_max: f64,
    pub donor_min: f64,
}

impl Boundary {
    fn between(base:&MeshData,donor:&MapInspection,plan:&BspAssembly,axis:V)->Result<Self>{
        let local_axis=transform(axis,[0.;3],-plan.yaw_degrees);
        let donor_min=donor_cut(donor,plan.donor_bsp_index,local_axis)?+dot(plan.translation,axis);
        let base_max=projected_bounds(base,plan.base_bsp_index,[0.;3],0.,axis)?[1];
        Ok(Self{axis,base_max,donor_min})
    }

    fn adjacent(self, placed:bool)->bool{
        let limit=if placed {24.} else {4.};
        (1.6..=limit).contains(&(self.donor_min-self.base_max))
    }
}

fn world_to_donor(point:V,plan:&BspAssembly)->V{
    transform(sub(point,plan.translation),[0.;3],-plan.yaw_degrees)
}
/// Retire only the sky buffer beyond every rendered donor surface. Any visible
/// collision outside that plane refuses the cut; no authored landscape is lost.
pub(super) fn trim_donor(body:Manifold,inspection:&MapInspection,mesh:&MeshData,faces:&[CollisionFace],plan:&BspAssembly,sky:usize,token:&CancelToken)->Result<Manifold>{
    let axis=plan.terrain_seam.as_ref().unwrap().axis();
    let crosswise=[-axis[1],axis[0],0.];
    let local_axis=transform(axis,[0.;3],-plan.yaw_degrees);
    let cut=donor_cut(inspection,plan.donor_bsp_index,local_axis)?;
    let part=&mesh.parts[plan.donor_bsp_index];
    for (index,ids) in mesh.indices[part.index_start..part.index_start+part.index_count].chunks_exact(3).enumerate(){
        let face=&faces[part.index_start/3+index];
        if face.shader.is_some()&&face.flags&2==0&&ids.iter().any(|id|dot(vertex(mesh,*id),local_axis)<cut-0.001){return invalid("A visible native collision surface lies beyond the proposed sky-buffer cut; choose a protected manual seam instead");}
    }
    if inspection.objects.iter().any(|object|dot(object.position.map(f64::from),local_axis)<cut){return invalid("A source object lies in the proposed sky-buffer cut; move the seam without dropping it");}
    let vertical=[0.,0.,1.];
    let bounds=|direction|projected_bounds(mesh,plan.donor_bsp_index,plan.translation,plan.yaw_degrees,direction);
    let [low,high]=bounds(crosswise)?;
    let [bottom,top]=bounds(vertical)?;
    let end=bounds(axis)?[1]+1.;
    let side=mul(crosswise,(high-low)/2.+1.);
    let center=add(mul(crosswise,(low+high)/2.),[0.,0.,bottom-1.]);
    let clip=passage_solid(add(center,mul(axis,cut+dot(plan.translation,axis))),add(center,mul(axis,end)),
        side,side,top-bottom+2.,sky,Some(sky))?;
    checked(body.boolean_with_engine_and_token(&clip,OpType::Intersect,BooleanEngine::Auto,Some(token)),"Invisible donor sky-buffer trim")
}
pub(super) fn plan(base_path:&Path,base:&MapInspection,donor:&MapInspection,plan:BspAssembly)->Result<BspAssembly>{
    plan_terrain(base_path, base, donor, plan, None)
}

pub(super) fn plan_placed(base_path:&Path,base:&MapInspection,donor:&MapInspection,plan:BspAssembly,bearing:f64)->Result<BspAssembly>{
    plan_terrain(base_path, base, donor, plan, Some(bearing))
}

fn plan_terrain(base_path:&Path,base:&MapInspection,donor:&MapInspection,mut plan:BspAssembly,bearing:Option<f64>)->Result<BspAssembly>{
    let (a,af)=maps::collision_source(base_path,base)?;
    let (b,bf)=maps::collision_source(&plan.donor_source.preserved_path,donor)?;
    let shader=|inspection:&MapInspection,faces:&[CollisionFace],face:usize|->Result<String>{
        let tag=inspection.tags.iter().find(|t|Some(t.id)==faces[face].shader&&t.class=="senv")
            .ok_or_else(||SparkError::Invalid("Outdoor floor requires its exact native environment shader".into()))?;
        Ok(tag.path.clone())
    };
    let mut seam=TerrainSeam{shoulder_width:8.,bank_height:4.,base_shader_path:String::new(),donor_shader_path:String::new(),bearing_degrees:None,grade_road:false};
    let start=plan.tunnel_points[0];
    let plan_end=plan.tunnel_points[1];
    let (start,base_face,end,donor_face)=if let Some(bearing)=bearing {
        let mut angles=[bearing,0.,90.,180.,-90.];
        angles[1..].sort_by(|a,b|wrapped_angle(*a-bearing).abs().total_cmp(&wrapped_angle(*b-bearing).abs()));
        let mut closest_gap=None::<f64>;
        let mut supported_boundary=false;
        let mut result=None;
        for angle in angles.into_iter().filter(|angle|wrapped_angle(*angle-bearing).abs()<90.) {
            seam.bearing_degrees=Some(angle);
            let boundary=Boundary::between(&a,donor,&plan,seam.axis())?;
            let gap=boundary.donor_min-boundary.base_max;
            if closest_gap.is_none_or(|old| (gap-2.).abs()<(old-2.).abs()) {
                closest_gap=Some(gap);
            }
            if !boundary.adjacent(true) {continue;}
            supported_boundary=true;
            if let Ok(landings)=aligned_landings(&a,&af,&b,&bf,&plan,boundary) {
                result=Some(landings);
                break;
            }
        }
        result.ok_or_else(||SparkError::Invalid(if supported_boundary {
            "The saved placement leaves a terrain strip, but neither side offers a continuous landing for the road and shoulders. Check the approach width or move the neighboring region.".into()
        } else {
            format!("The closest facing strip measures {:.2} units. Leave 1.6–24 units between the native boundaries before joining them.",closest_gap.unwrap_or(0.))
        }))?
    } else {
        let bounds=Boundary::between(&a,donor,&plan,seam.axis())?;
        let min_b=bounds.donor_min-plan.translation[0];
        let end_local=sub(plan_end,plan.translation);
        let (end,donor_face)=(0..12).find_map(|step|source_floor(&b,&bf,plan.donor_bsp_index,[min_b+10.+step as f64*2.,end_local[1],0.],0.8).ok())
            .ok_or_else(||SparkError::Invalid("No nearby walkable donor terrain; choose a different boundary instead of cutting through a building or cliff".into()))?;
        let (_,base_face)=source_floor(&a,&af,0,start,0.65)?;
        plan.translation=[bounds.base_max+2.-min_b,start[1]-end[1],start[2]-end[2]];
        (start,base_face,add(end,plan.translation),donor_face)
    };
    seam.base_shader_path=shader(base,&af,base_face)?;
    seam.donor_shader_path=shader(donor,&bf,donor_face)?;
    plan.tunnel_points=vec![start,end];
    plan.tunnel_width=6.;plan.tunnel_height=4.;plan.open_road=true;
    plan.infantry_tunnel=None;plan.high_ground=None;plan.visibility_zones.clear();
    plan.terrain_seam=Some(seam);
    plan.validate()?;Ok(plan)
}

fn wrapped_angle(angle:f64)->f64{
    (angle+180.).rem_euclid(360.)-180.
}

/// Fit facing landings in the reviewed world frame without moving either map.
fn aligned_landings(
    a:&MeshData,af:&[CollisionFace],b:&MeshData,bf:&[CollisionFace],plan:&BspAssembly,boundary:Boundary,
)->Result<(V,usize,V,usize)>{
    let axis=boundary.axis;
    let side=[-axis[1],axis[0],0.];
    let proposed=&plan.tunnel_points;
    let lateral=[dot(proposed[0],side),dot(proposed[1],side)];
    let centers=[lateral[0],(lateral[0]+lateral[1])*0.5,lateral[1]];
    let floor=|donor:bool,p:V,min_up:f64|->Result<(V,usize)>{
        if donor {
            let (local,index)=source_floor(b,bf,plan.donor_bsp_index,world_to_donor(p,plan),min_up)?;
            Ok((transform(local,plan.translation,plan.yaw_degrees),index))
        } else {source_floor(a,af,plan.base_bsp_index,p,min_up)}
    };
    for offset in [0.,-4.,4.,-8.,8.,-12.,12.,-20.,20.,-28.,28.] {
        for center in centers {
            let center=mul(side,center+offset);
            let candidates=|donor:bool,distance:f64|{
                let across=if donor {boundary.donor_min+distance} else {boundary.base_max-distance};
                let point=add(center,mul(axis,across));
                let (height,face)=floor(donor,point,0.65).ok()?;
                for lateral in [-11_f64,-7.,-3.,3.,7.,11.] {
                    let (edge,_)=floor(donor,add(point,mul(side,lateral)),0.05).ok()?;
                    if lateral.abs()<=3. && (edge[2]-height[2]).abs()>0.25 {return None;}
                }
                Some((height,face))
            };
            let depths=[6.,10.,14.,18.,22.,26.,30.];
            let base_candidates=depths.into_iter().filter_map(|distance|candidates(false,distance)).collect::<Vec<_>>();
            let donor_candidates=depths.into_iter().filter_map(|distance|candidates(true,distance)).collect::<Vec<_>>();
            for &(start,base_face) in &base_candidates {
                for &(end,donor_face) in &donor_candidates {
                    let run=dot(sub(end,start),axis);
                    if (4. ..=96.).contains(&run)&&(end[2]-start[2]).abs()<=0.30*run {
                        return Ok((start,base_face,end,donor_face));
                    }
                }
            }
        }
    }
    invalid("No supported pair of graded landings")
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
    pub boundary:Boundary,
}
impl Ribbon {
    pub(super) fn base_projection(&self) -> &RenderTri {
        &self.projections[0]
    }

    pub fn new(base:&MapInspection,a:&MeshData,af:&[CollisionFace],donor:&MapInspection,b:&MeshData,bf:&[CollisionFace],plan:&BspAssembly)->Result<Self>{
        let seam=plan.terrain_seam.as_ref().unwrap();seam.validate(plan)?;
        let boundary=Boundary::between(a,donor,plan,seam.axis())?;
        if !boundary.adjacent(seam.bearing_degrees.is_some()) {
            return invalid("The terrain seam no longer spans adjacent boundaries; review its Atlas position and reconnect.");
        }
        let start=plan.tunnel_points[0];let end=plan.tunnel_points[1];let d=sub(end,start);let length=d[0].hypot(d[1]);let side=[-d[1]/length,d[0]/length,0.];
        let half=plan.tunnel_width as f64/2.;let w=seam.shoulder_width;
        let offsets=[-half-w,-half-w*0.5,-half,0.,half,half+w*0.5,half+w];
        let mut profiles=[[0.;7];2];
        for (j,offset) in offsets.iter().enumerate() {
            profiles[0][j]=source_floor(a,af,0,add(start,mul(side,*offset)),0.05)?.0[2];
            let local=world_to_donor(add(end,mul(side,*offset)),plan);
            profiles[1][j]=source_floor(b,bf,plan.donor_bsp_index,local,0.05)?.0[2]+plan.translation[2];
        }
        let source_boundary=(boundary.base_max+boundary.donor_min)/2.;
        let flat=seam.bank_height==0.;
        let placed=seam.bearing_degrees.is_some();
        let mut rows=stations(length,(source_boundary-dot(start,boundary.axis))/dot(d,boundary.axis),flat&&!placed).into_iter().map(|t|{
            let center=add(start,mul(d,t));let blend=if flat{0.}else{(std::f64::consts::PI*t).sin().powi(2)};
            offsets.iter().enumerate().map(|(j,offset)|{
                let mut p=add(center,mul(side,*offset));let native=profiles[0][j]*(1.-t)+profiles[1][j]*t;
                let bank=((offset.abs()-half)/w).clamp(0.,1.).powi(2)*seam.bank_height;
                p[2]=if offset.abs()<=half {
                    if placed {native*(1.-blend)+center[2]*blend} else {center[2]}
                } else {native*(1.-blend)+(center[2]+bank)*blend};
                p
            }).collect::<Vec<_>>()
        }).collect::<Vec<_>>();
        if seam.grade_road {
            let direction=mul([d[0],d[1],0.],1./length);
            let collar=(length*0.18).clamp(1.5,3.);
            let floor_row=|point:V,on_donor:bool|->Result<Vec<V>> {
                offsets.iter().map(|offset| {
                    let mut p=add(point,mul(side,*offset));
                    p[2]=if on_donor {
                        let local=world_to_donor(p,plan);
                        source_floor(b,bf,plan.donor_bsp_index,local,0.05)?.0[2]+plan.translation[2]
                    } else {source_floor(a,af,0,p,0.05)?.0[2]};
                    Ok(p)
                }).collect()
            };
            let before=floor_row(sub(start,mul(direction,collar)),false)?;
            let after=floor_row(add(end,mul(direction,collar)),true)?;
            if (before[3][2]-start[2]).abs()>0.35*collar || (after[3][2]-end[2]).abs()>0.35*collar {
                return invalid("The graded road needs walkable terrain just beyond both landings. Pick a gentler approach." );
            }
            let last=rows.len()-1;
            for (index,row) in rows.iter_mut().enumerate() {
                let t=dot(sub(row[3],start),direction)/length;
                let height=start[2]+(end[2]-start[2])*t;
                for p in &mut row[2..=4] { p[2]=height; }
                // Blend the deck into the existing shoulder across the next half-band.
                for (edge,shoulder) in [(0,1),(6,5)] {
                    if index==0 || index==last {
                        row[shoulder][2]=(row[edge][2]+height)*0.5;
                    }
                }
            }
            rows.insert(0,before);
            rows.push(after);
        }
        let roof=a.positions.chunks_exact(3).map(|p|p[2] as f64).chain(b.positions.chunks_exact(3).map(|p|p[2] as f64+plan.translation[2])).fold(f64::NEG_INFINITY,f64::max)+0.25;
        let projection=|inspection:&MapInspection,index:usize,path:&str,at:V|->Result<RenderTri>{
            let tag=inspection.tags.iter().find(|tag|tag.class=="senv"&&tag.path==path).ok_or_else(||SparkError::Invalid("Terrain material no longer exists in its original source".into()))?;
            let mut renders=render_triangles(inspection,index);
            let aliases=render_shader_aliases(&inspection.tags,&renders.keys().copied().collect());
            let render_id=aliases.get(&tag.id).copied().unwrap_or(tag.id);
            let mut tris=renders.remove(&render_id).unwrap_or_default();
            tris.retain(|t|if placed {t.n[2].abs()>0.55} else {t.n[2]< -0.55});tris.into_iter().min_by(|a,b|{
                let distance=|t:&RenderTri|{let c=mul(add(add(t.p[0],t.p[1]),t.p[2]),1./3.);dot(sub(c,at),sub(c,at))};distance(a).total_cmp(&distance(b))
            }).ok_or_else(||SparkError::Invalid(format!("No verified floor UV projection for {} in {}; recover its rendered source before rebuilding",path,inspection.header.name)))
        };
        let projections=[projection(base,0,&seam.base_shader_path,start)?,projection(donor,plan.donor_bsp_index,&seam.donor_shader_path,world_to_donor(end,plan))?];
        Ok(Self{rows,roof,projections,boundary})
    }
    /// Keep source collision at supported native teleporter pads where a seam overlaps a map.
    /// Clip only the new air volume against the source free-space boundary.
    pub(super) fn preserve_teleporter_floors(
        &self, mut ribbon: Manifold, source_space: &Manifold, path: &Path, map: &MapInspection,
        mesh: &MeshData, bsp: usize, placement: (V,f64), material: usize, lowest: f64, token: &CancelToken,
        protect_air: bool,
    ) -> Result<Manifold> {
        if map.header.scenario_type != 1 { return Ok(ribbon); }
        let existing = maps::scenario_netgame_flags(path, map)?;
        let checker = crate::bsp_clearance::RouteChecker::for_part(mesh, bsp)?;
        let radius = 0.6;
        let min: V = std::array::from_fn(|i| self.rows.iter().flatten().map(|p| p[i]).fold(f64::INFINITY, f64::min));
        let max: V = std::array::from_fn(|i| self.rows.iter().flatten().map(|p| p[i]).fold(f64::NEG_INFINITY, f64::max));
        for flag in existing.iter().filter(|flag| matches!(flag.kind, 6 | 7)) {
            let [x, y, z] = transform(flag.position.map(f64::from), placement.0,placement.1);
            if x < min[0] - radius || x > max[0] + radius || y < min[1] - radius || y > max[1] + radius {
                continue;
            }
            let mut near = flag.position;
            near[2] += 0.05;
            let Some(floor) = checker.native_ground_z(near, 0.5) else { continue; };
            if (flag.position[2] - floor).abs() > 0.15 { continue; }
            const AIR_CLEARANCE: f64 = 0.6;
            let z_limit = if protect_air { min[2] - ROAD_FILL_DEPTH - AIR_CLEARANCE } else { min[2] + 0.03 };
            if f64::from(floor) + placement.0[2] <= z_limit { continue; }
            let side = [0., radius, 0.];
            let envelope = passage_solid([x - radius, y, lowest], [x + radius, y, lowest],
                side, side, z + AIR_CLEARANCE - lowest, material, None)?;
            let operation=if protect_air {OpType::Intersect} else {OpType::Subtract};
            let protected = checked(envelope.boolean_with_engine_and_token(
                source_space, operation, BooleanEngine::Auto, Some(token),
            ), "Native teleporter floor protection")?;
            ribbon = checked(ribbon.boolean_with_engine_and_token(
                &protected, OpType::Subtract, BooleanEngine::Auto, Some(token),
            ), "Terrain seam around a native teleporter floor")?;
        }
        Ok(ribbon)
    }

    pub fn solid(&self,plan:&BspAssembly,materials:[usize;2],sky:usize)->Result<Manifold>{
        self.closed_strip(plan,materials,Some(sky),0..=6)
    }

    pub fn road_support(&self,plan:&BspAssembly,materials:[usize;2])->Result<Manifold>{
        self.closed_strip(plan,materials,None,2..=4)
    }

    fn closed_strip(&self,plan:&BspAssembly,materials:[usize;2],sky:Option<usize>,columns:std::ops::RangeInclusive<usize>)->Result<Manifold>{
        let graded=plan.terrain_seam.as_ref().is_some_and(|seam|seam.grade_road);
        let mut gl=MeshGL64{num_prop:5,..Default::default()};
        let mut emit=|points:[V;3],material:usize,source:usize|->Result<()> {
            let first=gl.num_vert() as u64;
            let vertices=points.map(|p|if source==1{world_to_donor(p,plan)}else{p});
            let face_normal=normal(vertices[0],vertices[1],vertices[2]);
            for (p,local) in points.into_iter().zip(vertices) {
                // Steep fill sides need height in the source chart. A ground-only
                // projection makes a vertical cut face collapse to a line in Tool.
                let uv=if graded && sky != Some(material) {
                    ridge_uv(local,face_normal,&self.projections[source])?
                } else {
                    project_uv(local,&self.projections[source])?
                };
                gl.vert_properties.extend(p);gl.vert_properties.extend(uv);
            }
            gl.tri_verts.extend([first,first+1,first+2]);gl.face_id.push(material as u64);Ok(())
        };
        let top=|p:V|if sky.is_some(){[p[0],p[1],self.roof]}else{p};
        let bottom=|p:V|if sky.is_some(){p}else{[p[0],p[1],p[2]-ROAD_FILL_DEPTH]};
        let (left,right)=(*columns.start(),*columns.end());
        let last=self.rows.len()-1;
        let vertex=|row:usize,column:usize| {
            let mut point=self.rows[row][column];
            if graded && (row==0 || row==last) {
                // Terminate the cut in stock air and the fill below the stock floor.
                point[2]+=if sky.is_some(){0.05}else{-0.05};
            } else if graded && sky.is_some() {
                // Overlap the fill into the cut instead of subtracting a coplanar face.
                point[2]-=match column {2..=4=>0.04,1|5=>0.02,_=>0.};
            }
            point
        };
        let boundary=self.boundary;
        for i in 0..last {
            let section=mul(add(self.rows[i][3],self.rows[i+1][3]),0.5);
            let source=usize::from(dot(section,boundary.axis)>=(boundary.base_max+boundary.donor_min)/2.);
            let upper=sky.unwrap_or(materials[source]);
            for j in left..right {
                let(a,b,c,d)=(vertex(i,j),vertex(i+1,j),vertex(i+1,j+1),vertex(i,j+1));
                emit([bottom(a),bottom(d),bottom(c)],materials[source],source)?;
                emit([bottom(a),bottom(c),bottom(b)],materials[source],source)?;
                emit([top(a),top(b),top(c)],upper,source)?;emit([top(a),top(c),top(d)],upper,source)?;
            }
            for (j,reverse) in [(left,false),(right,true)] {
                let(a,b)=(vertex(i,j),vertex(i+1,j));let mut q=[bottom(a),bottom(b),top(b),top(a)];if reverse{q.reverse();}
                emit([q[0],q[1],q[2]],upper,source)?;emit([q[0],q[2],q[3]],upper,source)?;
            }
        }
        for (i,reverse) in [(0,false),(last,true)] {
            let source=if sky.is_some(){0}else{usize::from(i==last)};
            let material=sky.unwrap_or(materials[source]);
            for j in left..right {
                let(a,b)=(vertex(i,j),vertex(i,j+1));let mut q=[bottom(a),top(a),top(b),bottom(b)];if reverse{q.reverse();}
                emit([q[0],q[1],q[2]],material,source)?;emit([q[0],q[2],q[3]],material,source)?;
            }
        }
        gl.merge();checked(Manifold::from_mesh_gl64(&gl),"Source-profile terrain seam")
    }
}

fn project_uv(point: V, projection: &RenderTri) -> Result<[f64; 2]> {
    let weights = bary(point, projection)
        .ok_or_else(|| SparkError::Invalid("Terrain UV projection is degenerate".into()))?;
    let uv = std::array::from_fn(|axis| (0..3).map(|i| weights[i] * projection.uv[i][axis]).sum::<f64>());
    if uv.iter().any(|v| !v.is_finite() || v.abs() > 100_000.) {
        return invalid("Terrain UV projection exceeds native bounds");
    }
    Ok(uv)
}

/// Continue the native outdoor chart across generated ridge tops and ramps.
/// On steep faces fold vertical distance into the chart so cliffs retain the
/// same texture scale without collapsing to a line in the lightmap baker.
pub(super) fn ridge_uv(point: V, normal: V, projection: &RenderTri) -> Result<[f64; 2]> {
    let origin = projection.p[0];
    let mut projected = point;
    if normal[2].abs() < 0.5 {
        let axis = usize::from(normal[1].abs() > normal[0].abs());
        projected[axis] = origin[axis] + (point[2] - origin[2]) * normal[axis].signum();
    }
    let offset = sub(projected, origin);
    projected[2] = origin[2] - (projection.n[0] * offset[0] + projection.n[1] * offset[1]) / projection.n[2];
    project_uv(projected, projection)
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
    fn ridge_uses_native_ground_scale_and_has_two_uv_axes_on_cliffs() {
        let projection = RenderTri {
            p: [[0., 0., 0.], [100., 0., 10.], [0., 100., 0.]],
            uv: [[0.15, 0.25], [1.15, 0.25], [0.15, 1.25]],
            n: normal([0., 0., 0.], [100., 0., 10.], [0., 100., 0.]),
        };
        let at = |point, face| ridge_uv(point, face, &projection).unwrap();
        let close = |a: [f64; 2], b: [f64; 2]| {
            assert!((a[0] - b[0]).abs() < 1e-9 && (a[1] - b[1]).abs() < 1e-9);
        };
        close(at([30., 20., 12.], [0., 0., 1.]), [0.45, 0.45]);
        close(at([30., 20., 12.], [1., 0., 0.]), [0.27, 0.45]);
        close(at([30., 40., 20.], [1., 0., 0.]), [0.35, 0.65]);
        close(at([30., 40., 20.], [0., -1., 0.]), [0.45, 0.05]);
    }
    #[test]
    fn ribbon_is_closed_and_uses_source_uv_scale_on_both_sides(){
        let plan:BspAssembly=serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Synthetic only","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":609,"engine":"synthetic","scenarioPath":"fixture"},"donorTagsDirectory":"fixture","donorBspIndex":0,"translation":[20.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[0.,0.,0.],[32.,0.,0.]],"tunnelWidth":6.,"tunnelHeight":4.,"tunnelShaderPath":"fixture/metal","openRoad":true})).unwrap();
        let project=|offset:f64|RenderTri{p:[[offset,0.,0.],[offset+4.,0.,0.],[offset,4.,0.]],uv:[[0.,0.],[1.,0.],[0.,1.]],n:[0.,0.,1.]};
        let rows=(0..=8).map(|i|[-11f64,-7.,-3.,0.,3.,7.,11.].iter().map(|y|[i as f64*4.,*y,((y.abs()-3.)/8.).max(0.).powi(2)*4.]).collect()).collect();
        let ribbon=Ribbon{rows,roof:20.,projections:[project(0.),project(0.)],boundary:Boundary{axis:[1.,0.,0.],base_max:15.,donor_min:17.}};
        let body=ribbon.solid(&plan,[0,1],2).unwrap();assert!(body.volume()>10_000.);
        let support=ribbon.road_support(&plan,[0,1]).unwrap();
        assert!((support.volume()-32.*6.*ROAD_FILL_DEPTH).abs()<1e-8);
        assert!(support.get_mesh_gl64(-1).face_id.iter().all(|id| *id==0 || *id==1));
        let mut graded_plan=plan.clone();
        graded_plan.terrain_seam=Some(TerrainSeam {
            shoulder_width:8., bank_height:0., base_shader_path:"fixture/a".into(), donor_shader_path:"fixture/b".into(),
            bearing_degrees:Some(0.), grade_road:true,
        });
        let graded_mesh=ribbon.road_support(&graded_plan,[0,1]).unwrap().get_mesh_gl64(-1);
        let uv=|id:u64|&graded_mesh.vert_properties[id as usize*5+3..id as usize*5+5];
        assert!(graded_mesh.tri_verts.chunks_exact(3).all(|ids| {
            let (a,b,c)=(uv(ids[0]),uv(ids[1]),uv(ids[2]));
            ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])).abs()>1e-8
        }), "all graded fill faces, including the vertical sides, need two UV axes");
        let mesh=body.get_mesh_gl64(-1);assert!(mesh.face_id.contains(&0)&&mesh.face_id.contains(&1)&&mesh.face_id.contains(&2));
        for (index,tri) in mesh.tri_verts.chunks_exact(3).enumerate(){let material=mesh.face_id[index];if material==2{continue;}
            for id in tri{let values=&mesh.vert_properties[*id as usize*5..*id as usize*5+5];let local_x=values[0]-if material==1{20.}else{0.};assert!((values[3]-local_x/4.).abs()<1e-8);assert!((values[4]-values[1]/4.).abs()<1e-8);}
        }
        let mut materials=vec![AssemblyMaterial{name:"test-a".into(),source:0,shader_path:Some("fixture/a".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"test-b".into(),source:1,shader_path:Some("fixture/b".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let (collision,_)=collision_layer(&mesh,&mut materials).unwrap();let mut interior=plan.clone();interior.tunnel_points=vec![[1.,0.,0.],[31.,0.,0.]];assert!(verify_route(&collision,&interior).unwrap()>100);
    }
}

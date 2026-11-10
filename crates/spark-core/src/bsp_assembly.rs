//! Rebuild two source spaces as one connected BSP. Never mutate a source cache.
//! The source collision boundaries supply the solid; shader identities and UVs
//! are recovered separately. This is a derived geometry rebuild, not a campaign
//! script/AI, cluster-property or baked-lightmap transplant.
use crate::{
    invalid,
    maps::{self, CollisionFace, MapInspection, MeshData},
    project::{Project, Source},
    safe_relative, Result, SparkError,
};
use manifold_rust::{
    cancel::CancelToken,
    manifold::Manifold,
    types::{BooleanEngine, Error, MeshGL64, OpType},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap,BTreeSet},
    fmt::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};
#[path="bsp_terrain_seam.rs"]
mod terrain;
pub use terrain::TerrainSeam;
#[path="bsp_seam_sections.rs"]
mod seam_sections;
pub use seam_sections::{SeamEdge,SeamSection,append_edge_section};
type V = [f64; 3];
const MAX_INPUT_TRIANGLES: usize = 100_000;
const MAX_OUTPUT_TRIANGLES: usize = 150_000;
/// Optional second passage in Spark metadata, never an invented Halo tag field.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfantryTunnel {
    pub points: Vec<V>,
    pub width: f32,
    pub height: f32,
    pub shader_path: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BspAssembly {
    pub schema_version: u32,
    pub donor_project_id: String,
    pub donor_title: String,
    pub donor_source: Source,
    /// Explicit matching editable tags for donor materials and their dependencies.
    pub donor_tags_directory: PathBuf,
    pub donor_bsp_index: usize,
    #[serde(default, skip_serializing_if = "is_false")]
    pub include_donor_scenery: bool,
    pub translation: [f64; 3],
    pub yaw_degrees: f64,
    /// Floor centre points, in the destination map's native Z-up world units.
    pub tunnel_points: Vec<[f64; 3]>,
    pub tunnel_width: f32,
    pub tunnel_height: f32,
    pub tunnel_shader_path: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub open_road: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub infantry_tunnel: Option<InfantryTunnel>,
    /// Open ridge route in optional authoring metadata; native source is rebuilt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub high_ground: Option<InfantryTunnel>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub terrain_seam: Option<TerrainSeam>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub sections:Vec<SeamSection>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub arch_segments:Option<u8>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub visibility_zones: Vec<crate::bsp_visibility::VisibilityZone>,
}
fn is_false(value: &bool) -> bool { !*value }
impl BspAssembly {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != 1 || self.donor_bsp_index > 15 || self.donor_title.len() > 256 {
            return invalid("Unsupported BSP assembly");
        }
        uuid::Uuid::parse_str(&self.donor_project_id)
            .map_err(|_| SparkError::Invalid("Invalid donor project identity".into()))?;
        if self.donor_source.sha256.len() != 64
            || !self
                .donor_source
                .sha256
                .bytes()
                .all(|b| b.is_ascii_hexdigit())
        {
            return invalid("Donor source SHA-256 is required");
        }
        if self
            .translation
            .iter()
            .any(|x| !x.is_finite() || x.abs() > 2048.)
            || !self.yaw_degrees.is_finite()
            || self.yaw_degrees.abs() > 360.
        {
            return invalid("Invalid BSP transform");
        }
        if !(0.8..=16.).contains(&self.tunnel_width)
            || !(1.0..=16.).contains(&self.tunnel_height)
            || !(2..=16).contains(&self.tunnel_points.len())
        {
            return invalid(
                "Tunnel needs 2-16 floor points, width 0.8-16 and height 1-16 world units",
            );
        }
        if self.sections.len()>8||self.arch_segments.is_some_and(|n|!(2..=12).contains(&n))||self.arch_segments.is_some()&&(self.open_road||self.terrain_seam.is_some()) {
            return invalid("Choose at most eight seam sections; an enclosed arch needs 2-12 roof segments");
        }
        let mut section_ids=BTreeSet::new();
        for section in &self.sections {
            uuid::Uuid::parse_str(&section.id).map_err(|_|SparkError::Invalid("Invalid seam section identity".into()))?;
            if !section_ids.insert(&section.id)||section.name.trim().is_empty()||section.name.len()>60||section.name.chars().any(char::is_control) {return invalid("Seam sections need unique IDs and a short readable name");}
            let mut route=self.section_plan(section);route.sections.clear();route.validate()?;
        }
        let mut total = 0.;
        for p in &self.tunnel_points {
            if p.iter().any(|x| !x.is_finite() || x.abs() > 2048.) {
                return invalid("Tunnel points exceed the supported world bounds");
            }
        }
        for pair in self.tunnel_points.windows(2) {
            let d = sub(pair[1].map(f64::from), pair[0].map(f64::from));
            let horizontal = d[0].hypot(d[1]);
            if horizontal < 0.5 || d[2].abs() / horizontal > 0.35 {
                return invalid("Tunnel segments need at least 0.5 world units and a walkable slope of at most 19 degrees");
            }
            total += horizontal;
        }
        if total > 1000. {
            return invalid("Tunnel length exceeds 1000 world units");
        }
        safe_relative(&self.tunnel_shader_path)?;
        if self.tunnel_shader_path.len() > 200 {
            return invalid("Tunnel shader path is too long");
        }
        crate::bsp_visibility::validate(&self.visibility_zones, &self.tunnel_points)?;
        if self.open_road && (self.tunnel_width < 3. || self.tunnel_height < 3.) {
            return invalid("An open road needs at least 3 world units of width and clear height; vehicle handling still requires a game test");
        }
        if let Some(seam) = &self.terrain_seam { seam.validate(self)?; }
        if let Some(infantry) = &self.infantry_tunnel {
            let route = self.infantry_plan(infantry);
            route.validate().map_err(|e| SparkError::Invalid(format!("Infantry tunnel: {e}")))?;
            if route.tunnel_points == self.tunnel_points {
                return invalid("The infantry tunnel needs a distinct route; move its bends or entrances away from the road");
            }
        }
        if let Some(ridge) = &self.high_ground {
            let route = self.high_ground_plan(ridge);
            route.validate().map_err(|e| SparkError::Invalid(format!("High-ground route: {e}")))?;
            if route.tunnel_points == self.tunnel_points || self.infantry_tunnel.as_ref().is_some_and(|t|t.points == ridge.points) {
                return invalid("The high-ground route needs its own canyon-top floor points, separate from the lower passages");
            }
        }
        Ok(())
    }
    fn infantry_plan(&self, tunnel: &InfantryTunnel) -> Self {
        let mut route = self.clone();
        route.infantry_tunnel = None; route.high_ground = None; route.open_road = false; route.terrain_seam=None;route.sections.clear();route.arch_segments=None;
        route.tunnel_points = tunnel.points.clone(); route.tunnel_width = tunnel.width;
        route.tunnel_height = tunnel.height; route.tunnel_shader_path = tunnel.shader_path.clone();
        route.visibility_zones.clear(); route
    }
    fn high_ground_plan(&self, ridge: &InfantryTunnel) -> Self {
        let mut route = self.infantry_plan(ridge); route.open_road = true; route
    }
    fn section_plan(&self,section:&SeamSection)->Self {
        let mut route=self.infantry_plan(&InfantryTunnel{points:section.points.clone(),width:section.width,height:section.height,shader_path:section.shader_path.clone()});
        route.open_road=section.open_road;route.arch_segments=section.arch_segments;route
    }
    pub fn route_label(&self,index:usize)->&str {
        if index==0{return "Primary connection";}let mut at=1;
        if self.infantry_tunnel.is_some(){if index==at{return "Infantry tunnel";}at+=1;}
        if self.high_ground.is_some(){if index==at{return "High-ground route";}at+=1;}
        self.sections.get(index-at).map(|section|section.name.as_str()).unwrap_or("Seam section")
    }
    /// Keep the first route's old representation/fingerprint when extras are absent.
    pub fn connection_routes(&self) -> Vec<Self> {
        let mut primary = self.clone(); primary.infantry_tunnel = None; primary.high_ground = None;primary.sections.clear();
        let mut routes = vec![primary];
        if let Some(tunnel) = &self.infantry_tunnel { routes.push(self.infantry_plan(tunnel)); }
        if let Some(ridge) = &self.high_ground { routes.push(self.high_ground_plan(ridge)); }
        routes.extend(self.sections.iter().map(|section|self.section_plan(section)));
        routes
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyMaterial {
    pub name: String,
    pub source: usize,
    pub shader_path: Option<String>,
    pub shader_class: Option<String>,
    pub flags: u8,
    pub collision_only: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteClearance {
    pub label: String,
    pub width: f32,
    pub clear_height: f32,
    pub walk_samples: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyReport {
    pub input_triangles: usize,
    pub output_triangles: usize,
    #[serde(default)]
    pub connector_triangles: usize,
    pub generated_uv_faces: usize,
    pub walk_samples: usize,
    pub portal_count: usize,
    #[serde(default)]
    pub route_clearance: Vec<RouteClearance>,
    #[serde(default)]
    pub donor_scenery: usize,
    pub warnings: Vec<String>,
}
pub struct AssemblyGeometry {
    pub mesh: MeshData,
    pub materials: Vec<AssemblyMaterial>,
    pub triangle_materials: Vec<usize>,
    pub report: AssemblyReport,
}
/// The editor displays this same validated source mesh, using each original
/// map's shader IDs. It is not a compiled lightmap or gameplay receipt.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct AssemblyViewportSurface { pub source: usize, pub mesh: MeshData }
pub fn viewport_surfaces(geometry:&AssemblyGeometry,base:&MapInspection,donor:&MapInspection)->Result<Vec<AssemblyViewportSurface>> {
    if geometry.mesh.normals.len()!=geometry.mesh.positions.len()||geometry.mesh.uvs.len()*3!=geometry.mesh.positions.len()*2||geometry.triangle_materials.len()*3!=geometry.mesh.indices.len()||geometry.mesh.indices.iter().any(|i|*i as usize>=geometry.mesh.positions.len()/3){return invalid("Joined source preview has inconsistent native geometry attributes");}
    let mut result=vec![];
    for source in 0..2 {
        let inspection=if source==0 {base}else{donor};
        let mut mesh=MeshData{label:"Joined BSP source preview".into(),source:inspection.sha256.clone(),..Default::default()};
        let mut remap=BTreeMap::new();
        for (slot,material) in geometry.materials.iter().enumerate().filter(|(_,m)|m.source==source&&!m.collision_only&&m.shader_path.is_some()) {
            let tag=inspection.tags.iter().find(|t|Some(&t.class)==material.shader_class.as_ref()&&material.shader_path.as_ref().is_some_and(|p|t.path.replace('\\',"/").eq_ignore_ascii_case(&p.replace('\\',"/"))))
                .ok_or_else(||SparkError::Invalid(format!("Joined preview material has no verified native tag: {}",material.name)))?;
            let start=mesh.indices.len();
            for (triangle,ids) in geometry.mesh.indices.chunks_exact(3).enumerate().filter(|(i,_)|geometry.triangle_materials[*i]==slot) {
                let _=triangle;
                for id in ids {let mapped=*remap.entry(*id).or_insert_with(||{
                    let old=*id as usize;let next=(mesh.positions.len()/3) as u32;
                    mesh.positions.extend_from_slice(&geometry.mesh.positions[old*3..old*3+3]);
                    mesh.normals.extend_from_slice(&geometry.mesh.normals[old*3..old*3+3]);
                    mesh.uvs.extend_from_slice(&geometry.mesh.uvs[old*2..old*2+2]);next
                });mesh.indices.push(mapped);}
            }
            if mesh.indices.len()>start {mesh.material_ranges.push(maps::MeshMaterialRange{shader_tag_id:tag.id,bsp_index:0,lightmap_index:0,lightmap_page:-1,has_lightmap_uvs:false,has_incident_radiosity:false,lightmap_bitmap_tag_id:None,index_start:start,index_count:mesh.indices.len()-start});}
        }
        if !mesh.indices.is_empty(){result.push(AssemblyViewportSurface{source,mesh});}
    }
    Ok(result)
}
fn sub(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] - b[i])
}
fn add(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] + b[i])
}
fn mul(a: V, s: f64) -> V {
    a.map(|x| x * s)
}
fn dot(a: V, b: V) -> f64 {
    a.iter().zip(b).map(|(a, b)| a * b).sum()
}
fn cross(a: V, b: V) -> V {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn normal(a: V, b: V, c: V) -> V {
    let n = cross(sub(b, a), sub(c, a));
    mul(n, 1. / dot(n, n).sqrt().max(1e-20))
}
fn planar_uv(point: V, n: V) -> [f64; 2] {
    let axis = (0..3)
        .max_by(|a, b| n[*a].abs().total_cmp(&n[*b].abs()))
        .unwrap();
    match axis {
        0 => [point[1], point[2]],
        1 => [point[0], point[2]],
        _ => [point[0], point[1]],
    }
}
fn vertex(mesh: &MeshData, index: u32) -> V {
    std::array::from_fn(|i| mesh.positions[index as usize * 3 + i] as f64)
}
fn transform(p: V, translation: V, yaw: f64) -> V {
    let (s, c) = yaw.to_radians().sin_cos();
    add(
        [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]],
        translation,
    )
}
fn checked(solid: Manifold, phase: &str) -> Result<Manifold> {
    if solid.status() != Error::NoError || solid.is_empty() {
        return invalid(format!("{phase} did not form a closed orientable world: {:?}. Repair the selected source geometry before building.",solid.status()));
    }
    if solid.num_tri() > MAX_OUTPUT_TRIANGLES {
        return invalid("BSP boolean exceeds the 150000-triangle output budget");
    }
    Ok(solid)
}
struct RenderTri {
    p: [V; 3],
    uv: [[f64; 2]; 3],
    n: V,
}
fn render_triangles(i: &MapInspection, index: usize) -> BTreeMap<u32, Vec<RenderTri>> {
    let mut out = BTreeMap::<u32, Vec<RenderTri>>::new();
    let Some(mesh) = &i.render_mesh else {
        return out;
    };
    for r in mesh.material_ranges.iter().filter(|r| r.bsp_index == index) {
        for ids in mesh.indices[r.index_start..r.index_start + r.index_count].chunks_exact(3) {
            let p = std::array::from_fn(|n| vertex(mesh, ids[n]));
            let uv = std::array::from_fn(|n| {
                std::array::from_fn(|k| {
                    mesh.uvs.get(ids[n] as usize * 2 + k).copied().unwrap_or(0.) as f64
                })
            });
            out.entry(r.shader_tag_id).or_default().push(RenderTri {
                n: normal(p[0], p[1], p[2]),
                p,
                uv,
            });
        }
    }
    out
}
fn render_shader_aliases(tags: &[maps::Tag], used: &BTreeSet<u32>) -> BTreeMap<u32,u32> {
    let references=|tag:&maps::Tag|{
        let mut values=tag.references.iter().map(|r|(r.label.clone(),r.class.clone(),r.target_id)).collect::<Vec<_>>();values.sort();values
    };
    let mut aliases=BTreeMap::new();
    for tag in tags.iter().filter(|t|!used.contains(&t.id)) {
        let path=tag.path.replace('\\',"/");
        let Some((parent,name))=path.rsplit_once('/') else {continue};
        let Some(material)=name.strip_prefix("pgs") else {continue};
        let terrain_alias=["ter0","ter1"].iter().any(|prefix|material.strip_prefix(prefix).and_then(|s|s.strip_suffix('x')).is_some_and(|s|s.len()==8&&s.bytes().all(|c|c.is_ascii_hexdigit())));
        let generated=terrain_alias || material.split_once('m').is_some_and(|(hash,index)|hash.len()==8&&hash.bytes().all(|c|c.is_ascii_hexdigit())&&index.strip_suffix('x').is_some_and(|v|!v.is_empty()&&v.bytes().all(|c|c.is_ascii_digit())))
            || ["tunnel","infantry","ridge"].iter().any(|prefix|material.strip_prefix(prefix).and_then(|v|v.strip_suffix('x')).is_some_and(|v|v.len()==8&&v.bytes().all(|c|c.is_ascii_hexdigit())));
        if !generated || !parent.ends_with("/materials") || !parent.rsplit('/').nth(1).is_some_and(|p|p.starts_with("gsbsp_")) || tag.shader_preview.is_none() {continue;}
        let target=format!("{parent}/{}",&name[1..]);
        if let Some(render)=tags.iter().find(|t|used.contains(&t.id)&&t.class==tag.class&&t.path.replace('\\',"/").eq_ignore_ascii_case(&target)) {
            if serde_json::to_value(&tag.shader_preview).ok()==serde_json::to_value(&render.shader_preview).ok() && references(tag)==references(render) {
                aliases.insert(tag.id,render.id);
            }
        }
    }
    aliases
}
fn bary(p: V, t: &RenderTri) -> Option<[f64; 3]> {
    let a = sub(t.p[1], t.p[0]);
    let b = sub(t.p[2], t.p[0]);
    let c = sub(p, t.p[0]);
    let aa = dot(a, a);
    let ab = dot(a, b);
    let bb = dot(b, b);
    let denominator = aa * bb - ab * ab;
    if denominator.abs() < 1e-15 {
        return None;
    }
    let v = (bb * dot(c, a) - ab * dot(c, b)) / denominator;
    let w = (aa * dot(c, b) - ab * dot(c, a)) / denominator;
    Some([1. - v - w, v, w])
}
fn source_solid(
    i: &MapInspection,
    mesh: &MeshData,
    faces: &[CollisionFace],
    index: usize,
    source: usize,
    translation: V,
    yaw: f64,
    materials: &mut Vec<AssemblyMaterial>,
    fallbacks: &mut usize,
) -> Result<Manifold> {
    let part = mesh
        .parts
        .get(index)
        .ok_or_else(|| SparkError::Invalid("Selected BSP no longer exists".into()))?;
    if part.index_count / 3 > MAX_INPUT_TRIANGLES {
        return invalid("A selected BSP exceeds 100000 collision triangles");
    }
    let renders = render_triangles(i, index);
    let render_aliases=render_shader_aliases(&i.tags,&renders.keys().copied().collect());
    let mut slots = BTreeMap::new();
    let mut gl = MeshGL64 {
        num_prop: 5,
        ..Default::default()
    };
    for (offset, ids) in mesh.indices[part.index_start..part.index_start + part.index_count]
        .chunks_exact(3)
        .enumerate()
    {
        let face = &faces[part.index_start / 3 + offset];
        let p: [V; 3] = std::array::from_fn(|n| vertex(mesh, ids[n]));
        let n = normal(p[0], p[1], p[2]);
        if dot(n, n) < 0.5 {
            continue;
        }
        let slot = *slots.entry((face.shader, face.flags)).or_insert_with(|| {
            let slot = materials.len();
            let tag = face
                .shader
                .and_then(|id| i.tags.iter().find(|t| t.id == id));
            materials.push(AssemblyMaterial {
                name: if tag.is_none() {
                    "+sky".into()
                } else {
                    format!("gs{}m{}x", &i.sha256[..8], slot)
                },
                source,
                shader_path: tag.map(|t| t.path.clone()),
                shader_class: tag.map(|t| t.class.clone()),
                flags: face.flags,
                collision_only: false,
            });
            slot
        });
        if face.shader.is_some() && materials[slot].shader_path.is_none() {
            return invalid("A BSP collision shader has no indexed source tag");
        }
        let center = mul(add(add(p[0], p[1]), p[2]), 1. / 3.);
        let chosen = face
            .shader
            .and_then(|id| renders.get(render_aliases.get(&id).unwrap_or(&id)))
            .and_then(|rows| {
                rows.iter()
                    .filter(|t| {
                        dot(n, t.n).abs() > 0.99 && dot(sub(center, t.p[0]), t.n).abs() < 0.025
                    })
                    .filter_map(|t| {
                        bary(center, t).map(|b| {
                            (
                                t,
                                b.iter().map(|v| (-v).max(0.)).sum::<f64>()
                                    + dot(
                                        sub(center, mul(add(add(t.p[0], t.p[1]), t.p[2]), 1. / 3.)),
                                        sub(center, mul(add(add(t.p[0], t.p[1]), t.p[2]), 1. / 3.)),
                                    ) * 1e-7,
                            )
                        })
                    })
                    .min_by(|a, b| a.1.total_cmp(&b.1))
                    .map(|v| v.0)
            });
        if chosen.is_none() && face.shader.is_some() {
            *fallbacks += 1;
        }
        let first = gl.num_vert() as u64;
        for point in p {
            let uv = chosen
                .and_then(|t| {
                    bary(point, t).map(|b| {
                        std::array::from_fn::<_, 2, _>(|k| (0..3).map(|j| b[j] * t.uv[j][k]).sum())
                    })
                })
                .unwrap_or_else(|| planar_uv(point, n));
            let world = transform(point, translation, yaw);
            if world.iter().any(|v| v.abs() > 2048.) {
                return invalid("Transformed BSP exceeds the supported world bounds");
            }
            gl.vert_properties.extend(world);
            gl.vert_properties.extend(uv);
        }
        if dot(n, face.normal.map(f64::from)) >= 0. {
            gl.tri_verts.extend([first, first + 2, first + 1]);
        } else {
            gl.tri_verts.extend([first, first + 1, first + 2]);
        }
        gl.face_id.push(slot as u64);
    }
    gl.merge();
    checked(Manifold::from_mesh_gl64_robust(&gl), "Source BSP import")
}
fn tunnel_sides(points: &[V], width: f64) -> Result<Vec<V>> {
    let sides=points.windows(2).map(|pair| {let d=sub(pair[1],pair[0]);let length=d[0].hypot(d[1]);[-d[1]/length,d[0]/length,0.]}).collect::<Vec<_>>();
    let mut result=vec![mul(sides[0],width/2.)];
    for pair in sides.windows(2) {
        let direction=add(pair[0],pair[1]);let denominator=dot(direction,pair[0]);
        if denominator<0.125 {return invalid("Tunnel bend is too sharp; spread the turn over additional floor points");}
        result.push(mul(direction,width/2./denominator));
    }
    result.push(mul(*sides.last().unwrap(),width/2.));Ok(result)
}
#[cfg(test)]
fn tunnel_solid(a: V, b: V, side_a: V, side_b: V, height: f64, material: usize) -> Result<Manifold> {
    passage_solid(a, b, side_a, side_b, height, material, None)
}
fn passage_solid(a: V, b: V, side_a: V, side_b: V, height: f64, material: usize, sky: Option<usize>) -> Result<Manifold> {
    let up = [0., 0., height];
    let mut p = vec![
        sub(a, side_a),
        add(a, side_a),
        add(b, side_b),
        sub(b, side_b),
        add(sub(a, side_a), up),
        add(add(a, side_a), up),
        add(add(b, side_b), up),
        add(sub(b, side_b), up),
    ];
    let mut gl = MeshGL64 {
        num_prop: 5,
        ..Default::default()
    };
    // A graded miter is generally not a plane. Preserve the authored center
    // line as an edge instead of letting an arbitrary diagonal lift/drop it.
    // Split the end caps too: inserting only floor points creates T-junctions.
    let split=dot(sub(p[3],p[0]),normal(p[0],p[1],p[2])).abs()>1e-7;
    let triangles=if split {
        p.extend([a,b,add(a,up),add(b,up)]);
        vec![8,0,3,8,3,9,8,9,2,8,2,1,
             10,7,4,10,11,7,10,6,11,10,5,6,
             0,8,10,0,10,4,8,1,5,8,5,10,
             1,2,6,1,6,5,
             2,9,11,2,11,6,9,3,7,9,7,11,
             3,0,4,3,4,7]
    }else{vec![0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
    for t in triangles.chunks_exact(3) {
        let points = [p[t[0]], p[t[2]], p[t[1]]];
        let n = normal(points[0], points[1], points[2]);
        let first = gl.num_vert() as u64;
        for point in points {
            gl.vert_properties.extend(point);
            gl.vert_properties.extend(planar_uv(point, n));
        }
        gl.tri_verts.extend([first, first + 1, first + 2]);
    }
    gl.face_id = vec![material as u64; triangles.len()/3];
    if let Some(sky) = sky { let floor=if split{4}else{2};gl.face_id[floor..floor*2].fill(sky as u64); }
    gl.merge();
    checked(Manifold::from_mesh_gl64(&gl), "Tunnel")
}
// A route volume joined into existing outdoor sky cannot raise its floor:
// it is already inside free space. Remove only the explicitly authored strip
// beneath the ridge, leaving a real supported surface and the lower routes.
fn support_high_ground(mut space:Manifold,route:&BspAssembly,material:usize,minimum:f64,token:Option<&CancelToken>)->Result<Manifold>{
    let sides=tunnel_sides(&route.tunnel_points,route.tunnel_width as f64)?;
    for (index,pair) in route.tunnel_points.windows(2).enumerate(){
        let depth=pair[0][2].max(pair[1][2])-minimum;
        if !depth.is_finite()||depth<=0. {return invalid("High-ground support requires a verified lower source boundary");}
        let down=[0.,0.,-depth];
        let support=passage_solid(add(pair[0],down),add(pair[1],down),sides[index],sides[index+1],depth,material,None)?;
        space=checked(space.boolean_with_engine_and_token(&support,OpType::Subtract,BooleanEngine::Auto,token),"Canyon-top terrain support")?;
    }
    Ok(space)
}
pub fn generate(
    base_path: &Path,
    base: &MapInspection,
    assembly: &BspAssembly,
    cancel: &AtomicBool,
) -> Result<AssemblyGeometry> {
    assembly.validate()?;
    if base.mesh.parts.len() != 1 {
        return invalid("The destination must currently have one BSP; importing a donor must not discard destination BSPs");
    }
    let mut donor = maps::inspect_map(
        &assembly.donor_source.preserved_path,
        assembly.donor_source.resource_directory.as_deref(),
    )?;
    if donor.sha256 != assembly.donor_source.sha256 {
        return invalid("Donor map bytes changed; preserve and select it again");
    }
    if donor.header.extended {
        return invalid(
            "OpenSauce BSP extensions need a compatible source conversion before MCC assembly",
        );
    }
    let donor_scenery = crate::bsp_scenery::plan(assembly, &donor)?.len();
    let (base_mesh, base_faces) = maps::collision_source(base_path, base)?;
    let (donor_mesh, donor_faces) =
        maps::collision_source(&assembly.donor_source.preserved_path, &donor)?;
    if donor.render_mesh.is_none() {
        donor.render_mesh = maps::render_bsp_source(
            &assembly.donor_source.preserved_path,
            &donor,
            assembly.donor_bsp_index,
        )
        .ok();
    }
    for section in &assembly.sections {
        seam_sections::validate_edges(section,&base.sha256,assembly)?;
        seam_sections::verify_rendered_edge(base_path,base,&section.edges[0])?;
        seam_sections::verify_rendered_edge(&assembly.donor_source.preserved_path,&donor,&section.edges[1])?;
    }
    let routes = assembly.connection_routes();
    for (index, route) in routes.iter().enumerate() {
        let label = assembly.route_label(index);
        verify_entrance(&base_mesh, &base_faces, 0, [0.;3], 0., route.tunnel_points[0])
            .map_err(|e| SparkError::Invalid(format!("{label} entrance: {e}")))?;
        verify_entrance(&donor_mesh, &donor_faces, route.donor_bsp_index, route.translation,
            route.yaw_degrees, *route.tunnel_points.last().unwrap())
            .map_err(|e| SparkError::Invalid(format!("{label} exit: {e}")))?;
    }
    let mut materials = vec![];
    let mut generated_uv_faces = 0;
    let left = source_solid(
        base,
        &base_mesh,
        &base_faces,
        0,
        0,
        [0.; 3],
        0.,
        &mut materials,
        &mut generated_uv_faces,
    )?;
    let right = source_solid(
        &donor,
        &donor_mesh,
        &donor_faces,
        assembly.donor_bsp_index,
        1,
        assembly.translation.map(f64::from),
        assembly.yaw_degrees as f64,
        &mut materials,
        &mut generated_uv_faces,
    )?;
    let first_connector_material=materials.len();
    let mut passage_materials = vec![];
    for (index, route) in routes.iter().enumerate() {
        let material = materials.len();
        materials.push(AssemblyMaterial {
            name: format!("gs{}{}x",if index==0 {"tunnel".into()}else if assembly.route_label(index)=="Infantry tunnel" {"infantry".into()}else if assembly.route_label(index)=="High-ground route" {"ridge".into()}else{format!("section{index}")}, &base.sha256[..8]),
            source: 0, shader_path: Some(route.tunnel_shader_path.clone()), shader_class: Some("senv".into()),
            flags: 0, collision_only: false,
        });
        passage_materials.push(material);
    }
    let sky_material = if routes.iter().any(|route|route.open_road) {
        Some(materials.iter().position(|m| m.name == "+sky" && m.source == 0).unwrap_or_else(|| {
            let index = materials.len(); materials.push(AssemblyMaterial {name:"+sky".into(),source:0,
                shader_path:None,shader_class:None,flags:0,collision_only:false}); index
        }))
    } else { None };
    let terrain_ribbon=assembly.terrain_seam.as_ref().map(|_|terrain::Ribbon::new(base,&base_mesh,&base_faces,&donor,&donor_mesh,&donor_faces,assembly)).transpose()?;
    let terrain_materials=if let Some(seam)=&assembly.terrain_seam {
        let indices=[materials.len(),materials.len()+1];
        for (source,path) in [&seam.base_shader_path,&seam.donor_shader_path].into_iter().enumerate(){materials.push(AssemblyMaterial{name:format!("gster{}{}x",source,&base.sha256[..8]),source,shader_path:Some(path.clone()),shader_class:Some("senv".into()),flags:0,collision_only:false});}
        Some(indices)
    }else{None};
    let lowest_source=base_mesh.positions.chunks_exact(3).map(|p|p[2] as f64)
        .chain(donor_mesh.positions.chunks_exact(3).map(|p|p[2] as f64+assembly.translation[2])).fold(f64::INFINITY,f64::min);
    let started = Instant::now();
    let token = CancelToken::new();
    let complete = AtomicBool::new(false);
    let merged = std::thread::scope(|scope| -> Result<Manifold> {
        let token_ref = &token;
        let done = &complete;
        scope.spawn(move || {
            while !done.load(Ordering::Relaxed) {
                if cancel.load(Ordering::Relaxed) || started.elapsed() > Duration::from_secs(120) {
                    token_ref.cancel();
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        });
        let result = (|| {
            let right=if assembly.terrain_seam.is_some(){terrain::trim_donor(right,&donor,&donor_mesh,&donor_faces,assembly,sky_material.unwrap(),&token)?}else{right};
            let mut combined = left;
            if let (Some(ribbon),Some(slots))=(&terrain_ribbon,terrain_materials){
                combined=checked(combined.boolean_with_engine_and_token(&ribbon.solid(assembly,slots,sky_material.unwrap())?,OpType::Add,BooleanEngine::Auto,Some(&token)),"Terrain seam join")?;
            }
            for (route_index,(route, material)) in routes.iter().zip(&passage_materials).enumerate() {
            if route_index==0 && terrain_ribbon.is_some(){continue;}
            let sides=tunnel_sides(&route.tunnel_points,route.tunnel_width as f64)?;
            for (index,pair) in route.tunnel_points.windows(2).enumerate() {
                let passage = if let Some(segments)=route.arch_segments {
                    seam_sections::arch_solid(pair[0],pair[1],sides[index],sides[index+1],route.tunnel_width as f64,route.tunnel_height as f64,segments,*material)?
                }else{passage_solid(
                    pair[0].map(f64::from),
                    pair[1].map(f64::from),
                    sides[index],
                    sides[index+1],
                    route.tunnel_height as f64,
                    *material,
                    if route.open_road { sky_material } else { None },
                )?};
                combined = checked(
                    combined.boolean_with_engine_and_token(
                        &passage,
                        OpType::Add,
                        BooleanEngine::Auto,
                        Some(&token),
                    ),
                    "Tunnel join",
                )?;
            }
            }
            let mut united = checked(
                combined.boolean_with_engine_and_token(
                    &right,
                    OpType::Add,
                    BooleanEngine::Auto,
                    Some(&token),
                ),
                "Donor join",
            )?;
            if let Some(ridge)=&assembly.high_ground {
                united=support_high_ground(united,&assembly.high_ground_plan(ridge),passage_materials[1+usize::from(assembly.infantry_tunnel.is_some())],lowest_source-0.25,Some(&token))?;
            }
            checked(
                united.rebuild_solid_with_token(
                    manifold_rust::types::WindingRule::Positive,
                    Some(&token),
                ),
                "World solid regularization",
            )
        })();
        complete.store(true, Ordering::Relaxed);
        result
    })?;
    // Halo Tool welds source vertices at a coarser precision than the boolean
    // kernel. Collapse numerical slivers before narrowing to JMS float data.
    let merged = checked(
        merged.set_tolerance(0.0005).simplify(0.0005),
        "Halo source precision cleanup",
    )?;
    let mut gl = merged.get_mesh_gl64(-1);
    if gl.num_prop != 5 || gl.face_id.len() != gl.num_tri() {
        return invalid("Boolean lost source material or vertex-property provenance");
    }
    crate::bsp_triangulate::improve(&mut gl);
    for material in passage_materials.into_iter().chain(terrain_materials.into_iter().flatten()) { crate::bsp_triangulate::refine_native_needles(&mut gl, MAX_OUTPUT_TRIANGLES, material as u64)?; }
    let (mut mesh, mut triangle_materials) = collision_layer(&gl, &mut materials)?;
    let route_clearance = crate::bsp_clearance::RouteChecker::new(&mesh)?.verify_details(assembly)?;
    let walk_samples = route_clearance.iter().map(|route|route.walk_samples).sum();
    for (face, ids) in gl.tri_verts.chunks_exact(3).enumerate() {
        let slot = gl.face_id[face] as usize;
        if slot >= materials.len() {
            return invalid("Boolean material provenance is invalid");
        }
        if materials[slot].shader_path.is_none() || materials[slot].flags & 2 != 0 {
            continue;
        }
        let first = mesh.positions.len() / 3;
        let order = [ids[0], ids[2], ids[1]];
        let points: [V; 3] = std::array::from_fn(|n| {
            std::array::from_fn(|k| gl.vert_properties[order[n] as usize * 5 + k])
        });
        let n = normal(points[0], points[1], points[2]);
        for (v, p) in points.iter().enumerate() {
            mesh.positions.extend(p.map(|x| x as f32));
            mesh.normals.extend(n.map(|x| x as f32));
            mesh.uvs.extend([
                gl.vert_properties[order[v] as usize * 5 + 3] as f32,
                gl.vert_properties[order[v] as usize * 5 + 4] as f32,
            ]);
        }
        mesh.indices
            .extend([first as u32, first as u32 + 1, first as u32 + 2]);
        triangle_materials.push(slot);
    }
    mesh.parts.push(maps::MeshPart {
        name: "Connected world".into(),
        index_start: 0,
        index_count: mesh.indices.len(),
    });
    let portal_count = add_portals(
        &mut mesh,
        &mut materials,
        &mut triangle_materials,
        assembly,
        &base_mesh,
        &donor_mesh,
        assembly.terrain_seam.as_ref().map(|_|terrain::render_edge(&donor,assembly.donor_bsp_index,false).map(|edge|edge-0.25+assembly.translation[0])).transpose()?,
    )?;
    let connector_triangles=triangle_materials.iter().filter(|&&slot|slot>=first_connector_material&&materials[slot].shader_path.is_some()&&!materials[slot].collision_only).count();
    Ok(AssemblyGeometry{report:AssemblyReport{input_triangles:base_mesh.indices.len()/3+donor_mesh.parts[assembly.donor_bsp_index].index_count/3,output_triangles:mesh.indices.len()/3,connector_triangles,generated_uv_faces,walk_samples,portal_count,route_clearance,donor_scenery,warnings:vec!["Route samples check a standing biped against BSP triangles. Vehicle turning, scenery collision, exposed ridge access and cross-region sniper visibility require separate native game tests.".into(),"This rebuild regenerates collision, portals and lightmaps; original per-cluster weather/sound assignments and render-only decorations require separate review. Donor scenery is optional; campaign actors, scripts and gameplay objects are not imported.".into(),"UVs are projected from source render surfaces where available. Unmatched collision-only surfaces use generated planar UVs.".into(),"A compiled clearance test and successful boot do not replace a manual player walkthrough, including scenery collision at the entrances.".into()]},mesh,materials,triangle_materials})
}
// Automatic cuts may span a change of grade along the same horizontal run.
// Keep authored segment identities intact, and never join around an XY bend.
fn portal_spans(route:&BspAssembly)->Vec<(usize,usize)>{
    let mut spans=vec![(0,1)];
    for index in 1..route.tunnel_points.len()-1 {
        let a=sub(route.tunnel_points[index],route.tunnel_points[index-1]);
        let b=sub(route.tunnel_points[index+1],route.tunnel_points[index]);
        let lengths=a[0].hypot(a[1])*b[0].hypot(b[1]);
        if route.visibility_zones.is_empty()&&lengths>1e-8&&(a[0]*b[0]+a[1]*b[1])/lengths>1.-1e-8 {
            spans.last_mut().unwrap().1=index+1;
        }else{spans.push((index,index+1));}
    }
    spans
}
fn visibility_solid(mesh:&MeshData,slots:&[usize],materials:&[AssemblyMaterial])->Result<Manifold>{
    let mut gl=MeshGL64{num_prop:3,..Default::default()};
    for (face,t) in mesh.indices.chunks_exact(3).enumerate(){
        let material=materials.get(slots[face]).ok_or_else(||SparkError::Invalid("Visibility source material is missing".into()))?;
        if !material.collision_only&&material.shader_path.is_some(){continue;}
        let start=gl.num_vert() as u64;
        for id in [t[0],t[2],t[1]]{gl.vert_properties.extend(mesh.positions[id as usize*3..id as usize*3+3].iter().map(|&v|f64::from(v)));}
        gl.tri_verts.extend([start,start+1,start+2]);gl.face_id.push(0);
    }
    gl.merge();checked(Manifold::from_mesh_gl64_robust(&gl),"Native visibility source import")
}
fn add_portals(
    mesh: &mut MeshData,
    materials: &mut Vec<AssemblyMaterial>,
    slots: &mut Vec<usize>,
    assembly: &BspAssembly,
    base: &MeshData,
    donor: &MeshData,
    trimmed_donor_min: Option<f64>,
) -> Result<usize> {
    fn bounds(mesh: &MeshData, part: usize, translation: V, yaw: f64) -> (V, V) {
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        let p = &mesh.parts[part];
        for id in &mesh.indices[p.index_start..p.index_start + p.index_count] {
            let v = transform(vertex(mesh, *id), translation, yaw);
            for k in 0..3 {
                lo[k] = lo[k].min(v[k]);
                hi[k] = hi[k].max(v[k]);
            }
        }
        (lo, hi)
    }
    let base_bounds = bounds(base, 0, [0.; 3], 0.);
    let mut donor_bounds = bounds(
        donor,
        assembly.donor_bsp_index,
        assembly.translation.map(f64::from),
        assembly.yaw_degrees as f64,
    );
    if let Some(boundary)=trimmed_donor_min{donor_bounds.0[0]=boundary;}
    let inside = |p: V, b: (V, V)| (0..3).all(|k| p[k] >= b.0[k] - 0.1 && p[k] <= b.1[k] + 0.1);
    let source_space=if assembly.terrain_seam.is_some(){Some(visibility_solid(mesh,slots,materials)?)}else{None};
    let slot = materials.len();
    let mut count = 0;
    let mut native_cuts:Vec<Vec<[u32;3]>>=vec![];
    let mut generated_cuts:Vec<([[f64;3];4],bool)>=vec![];
    for (route_index, route) in assembly.connection_routes().into_iter().enumerate() {
    let before = count;let mut covered_by_shared_cut=false;
    for (segment,end) in portal_spans(&route) {
        let (a,b)=(route.tunnel_points[segment],route.tunnel_points[end]);
        let d = sub(b, a);
        let candidates: Vec<_> = route.tunnel_points[segment..=end].windows(2).flat_map(|pair|{
            let delta=sub(pair[1],pair[0]);let steps=(delta[0].hypot(delta[1])/0.4).ceil() as usize;
            (1..steps).map(move|n|add(pair[0],mul(delta,n as f64/steps as f64)))
        }).filter(|p| !inside(*p, base_bounds) && !inside(*p, donor_bounds)).collect();
        let authored = crate::bsp_visibility::authored_centers(&route.visibility_zones, &route.tunnel_points, segment)?;
        if authored.is_none() && candidates.len() < 4 {
            continue;
        }
        let [first, last] = authored.unwrap_or_else(||if route.terrain_seam.is_some(){[candidates[0],*candidates.last().unwrap()]}else{[candidates[candidates.len() / 3],candidates[candidates.len() * 2 / 3]]});
        if [first,last].iter().any(|p|inside(*p,base_bounds)||inside(*p,donor_bounds)) {
            return invalid("Authored visibility cuts must lie in an isolated tunnel segment outside both source BSP bounds; move the portal handles or choose a longer segment");
        }
        let separation_squared=dot(sub(first,last),sub(first,last));
        if authored.is_some() && separation_squared<0.25-1e-8 {
            return invalid("Authored visibility cuts are too close together");
        } else if authored.is_none() && separation_squared<0.25 {
            continue;
        }
        for center in [first, last] {
            let portal_height=route.tunnel_height as f64+if route.arch_segments.is_some(){route.tunnel_width as f64/2.}else{0.};
            let points = if let Some(seam)=&route.terrain_seam {
                // A road-width rectangle cannot split the full outdoor seam.
                // Let Halo Tool clip this source-bounded plane against its banks.
                let bottom=base_bounds.0[2].min(donor_bounds.0[2])-0.1;
                let roof=base_bounds.1[2].max(donor_bounds.1[2])+0.25;
                terrain::portal([center[0],center[1],bottom],d,route.tunnel_width as f64+2.*seam.shoulder_width,roof)?
            }else if authored.is_some(){crate::bsp_visibility::authored_portal_quad(center,d,route.tunnel_width as f64,portal_height)?}else{crate::bsp_visibility::portal_quad(center,d,route.tunnel_width as f64,portal_height)?};
            if generated_cuts.iter().any(|(previous,was_authored)|(*was_authored||authored.is_some())&&crate::bsp_visibility::portals_intersect(previous,&points)) {
                return invalid("Authored visibility planes cross or overlap another portal. Move the handles away from the tunnel bend or other cuts");
            }
            let surface=if let Some(space)=&source_space {
                crate::bsp_visibility::clipped_portal(space,center,d,(route.tunnel_height as f64*0.5).min(0.8))?
            }else{
                let points=if let Some(segments)=route.arch_segments{seam_sections::arch_portal(center,d,route.tunnel_width as f64,route.tunnel_height as f64,segments)?}else{points.to_vec()};
                let triangles=(1..points.len()-1).map(|i|[0,i,i+1]).collect();crate::bsp_visibility::SourcePortal{points,triangles}
            };
            if source_space.is_some(){
                let mut signature:Vec<[u32;3]>=surface.points.iter().map(|point|point.map(|v|(v as f32).to_bits())).collect();signature.sort();signature.dedup();
                if native_cuts.contains(&signature){if authored.is_some(){return invalid("Authored visibility cut duplicates a shared native portal; move the handles");}covered_by_shared_cut=true;continue;}
                native_cuts.push(signature);
            }
            generated_cuts.push((points,authored.is_some()));
            let first=surface.triangles[0];let n=normal(surface.points[first[0]],surface.points[first[1]],surface.points[first[2]]);
            let begin=mesh.positions.len()/3;
            for point in &surface.points{mesh.positions.extend(point.map(|v|v as f32));mesh.normals.extend(n.map(|v|v as f32));mesh.uvs.extend([0.,0.]);}
            for ids in surface.triangles{mesh.indices.extend(ids.map(|i|(begin+i) as u32));slots.push(slot);}
            count += 1;
        }
    }
    if count == before && !covered_by_shared_cut {
        let label = assembly.route_label(route_index);
        return invalid(&format!("{label}: no isolated section is available for visibility portals. Separate the BSP bounds or add a route bend before compiling"));
    }
    }
    if count > 0 {
        materials.push(AssemblyMaterial {
            name: "+portal".into(),
            source: 0,
            shader_path: None,
            shader_class: None,
            flags: 0,
            collision_only: false,
        });
    } else {
        return invalid("No isolated tunnel section is available for visibility portals. Separate the BSP bounds or add a tunnel bend before compiling");
    }
    Ok(count)
}
pub fn generate_project(
    project: &Project,
    base: &MapInspection,
    cancel: &AtomicBool,
) -> Result<AssemblyGeometry> {
    let source = project
        .source
        .as_ref()
        .ok_or_else(|| SparkError::Invalid("Import the destination map first".into()))?;
    let assembly = project
        .bsp_assembly
        .as_ref()
        .ok_or_else(|| SparkError::Invalid("No BSP assembly is authored".into()))?;
    generate(&source.preserved_path, base, assembly, cancel)
}
fn verify_entrance(
    mesh: &MeshData,
    faces: &[CollisionFace],
    part: usize,
    translation: V,
    yaw: f64,
    point: V,
) -> Result<()> {
    let range = mesh
        .parts
        .get(part)
        .ok_or_else(|| SparkError::Invalid("Entrance BSP is unavailable".into()))?;
    for (index, ids) in mesh.indices[range.index_start..range.index_start + range.index_count]
        .chunks_exact(3)
        .enumerate()
    {
        let face = &faces[range.index_start / 3 + index];
        if face.shader.is_none() || face.flags & 2 != 0 {
            continue;
        }
        let p: [V; 3] = std::array::from_fn(|k| transform(vertex(mesh, ids[k]), translation, yaw));
        let n = normal(p[0], p[1], p[2]);
        if n[2] < 0.65 || dot(sub(point, p[0]), n).abs() > 0.12 {
            continue;
        }
        if bary(
            point,
            &RenderTri {
                p,
                n,
                uv: [[0.; 2]; 3],
            },
        )
        .is_some_and(|b| b.iter().all(|v| *v >= -1e-6))
        {
            return Ok(());
        }
    }
    invalid("A tunnel mouth is not on visible walkable source ground. Move it onto the map terrain; sky and invisible boundary floors cannot serve as entrances")
}
fn anchor(mesh: &MeshData, faces: &[CollisionFace], part: usize, east: bool) -> Result<(V, usize)> {
    let range = mesh
        .parts
        .get(part)
        .ok_or_else(|| SparkError::Invalid("BSP selection is unavailable".into()))?;
    let mut low = [f64::INFINITY; 3];
    let mut high = [f64::NEG_INFINITY; 3];
    for id in &mesh.indices[range.index_start..range.index_start + range.index_count] {
        let p = vertex(mesh, *id);
        for k in 0..3 {
            low[k] = low[k].min(p[k]);
            high[k] = high[k].max(p[k]);
        }
    }
    let target = [
        if east { high[0] - 5. } else { low[0] + 5. },
        (low[1] + high[1]) / 2.,
        low[2] + 1.,
    ];
    mesh.indices[range.index_start..range.index_start + range.index_count]
        .chunks_exact(3)
        .enumerate()
        .filter_map(|(index, ids)| {
            let face = faces.get(range.index_start / 3 + index)?;
            if face.shader.is_none() || face.flags & 2 != 0 {
                return None;
            }
            let p: [V; 3] = std::array::from_fn(|n| vertex(mesh, ids[n]));
            let area = dot(
                cross(sub(p[1], p[0]), sub(p[2], p[0])),
                cross(sub(p[1], p[0]), sub(p[2], p[0])),
            )
            .sqrt()
                / 2.;
            if normal(p[0], p[1], p[2])[2] < 0.85 || area < 0.1 {
                return None;
            }
            let center = mul(add(add(p[0], p[1]), p[2]), 1. / 3.);
            let d = sub(center, target);
            Some((
                center,
                range.index_start / 3 + index,
                d[0] * d[0] + d[1] * d[1] * 0.02 + d[2] * d[2] + 0.1 / area,
            ))
        })
        .min_by(|a, b| a.2.total_cmp(&b.2))
        .map(|(p, i, _)| (p, i))
        .ok_or_else(|| {
            SparkError::Invalid("No walkable source floor was found; choose a different BSP".into())
        })
}
/// A new combined document references the verified original cache, not another
/// project's edits, build receipts or Undo history. Publication remains an explicit Save.
pub fn source_project(title:&str,base:&Project,inspection:&MapInspection)->Result<Project>{
    let source=base.source.as_ref().ok_or_else(||SparkError::Invalid("Choose a preserved native source map".into()))?;
    crate::source_identity::validate(source,inspection)?;
    crate::library::validate_local_input_path(&source.preserved_path)?;
    crate::reject_links(&source.preserved_path)?;
    if maps::hash_file(&source.preserved_path)?!=source.sha256{return invalid("The original source changed; no new world was created");}
    if ![6,7,13,609].contains(&source.cache_version){return invalid("This source edition does not yet support the connected-BSP rebuild. Keep it available for inspection and asset recovery");}
    if inspection.header.scenario_type!=1 || inspection.mesh.parts.len()!=1{return invalid("Choose a multiplayer source with one base BSP for this connected-world builder");}
    let mut project=Project::new(title);
    project.source=Some(source.clone());project.scene=inspection.objects.clone();
    project.build_targets=base.build_targets.clone();project.active_build_target=base.active_build_target.clone();
    project.provenance=base.provenance.clone();
    project.provenance.description=format!("New connected-world source based on {} ({}). Original map and project retained.",base.title,source.sha256);
    project.validate()?;Ok(project)
}

/// Resolve only the donor already named by this saved authoring plan. The
/// projection is read-only; it is never another editable library document.
pub fn referenced_donor(owner:&Project,id:&str)->Result<Option<Project>>{
    let Some(plan)=owner.bsp_assembly.as_ref().filter(|plan|plan.donor_project_id==id) else{return Ok(None)};
    plan.validate()?;
    for path in [&plan.donor_source.original_path,&plan.donor_source.preserved_path].into_iter().chain(plan.donor_source.resource_directory.iter()) {
        crate::library::validate_local_input_path(path)?;crate::reject_links(path)?;
    }
    if maps::hash_file(&plan.donor_source.preserved_path)?!=plan.donor_source.sha256{return invalid("The saved donor source changed; reconnect the original map before planning");}
    let mut donor=Project::new(&plan.donor_title);donor.id=id.into();donor.source=Some(plan.donor_source.clone());donor.validate()?;Ok(Some(donor))
}

// A whole-level ground bitmap can contain the map's overhead artwork. It is
// valid on the original UVs, but must not become a repeating tunnel texture.
// Prefer an actual opaque structural material from the source; never invent a tag.
fn connection_shader<'a>(tags: &'a [maps::Tag], anchor: Option<u32>, map_name: &str) -> Option<&'a maps::Tag> {
    let rank = |tag: &maps::Tag| {
        if tag.class != "senv" || tag.path.to_ascii_lowercase().contains("clip")
            || tag.shader_preview.as_ref().is_some_and(|s| s.alpha_test || s.alpha_blended) { return 0; }
        let path = tag.path.replace('\\', "/").to_ascii_lowercase();
        let name = path.rsplit('/').next().unwrap_or("").replace('_', " ");
        let score = if name.contains("metal") && name.contains("plate") && name.contains("floor") { 100 }
            else if name.contains("metal") && name.contains("flat") { 90 }
            else if name.contains("metal") && (name.contains("panel") || name.contains("strip")) { 80 }
            else { 0 };
        score + if score > 0 && path.contains(&map_name.to_ascii_lowercase()) { 1 } else { 0 }
    };
    tags.iter().filter(|tag| rank(tag) > 0).max_by_key(|tag| rank(tag))
        .or_else(|| tags.iter().find(|tag| Some(tag.id) == anchor && tag.class == "senv"))
}

pub fn plan(
    base_project: &Project,
    base: &MapInspection,
    donor_project: &Project,
    donor: &MapInspection,
    index: usize,
    tags: PathBuf,
) -> Result<BspAssembly> {
    if index >= donor.mesh.parts.len() {return invalid("Choose an existing donor BSP section");}
    if base.mesh.parts.len() != 1 || base_project.id == donor_project.id {
        return invalid("Choose a different donor map and a destination with one BSP");
    }
    let (base_mesh, faces) = maps::collision_source(
        &base_project
            .source
            .as_ref()
            .ok_or_else(|| SparkError::Invalid("Destination source missing".into()))?
            .preserved_path,
        base,
    )?;
    let donor_source = donor_project
        .source
        .clone()
        .ok_or_else(|| SparkError::Invalid("Donor is not a preserved map".into()))?;
    let (donor_mesh, donor_faces) = maps::collision_source(&donor_source.preserved_path, donor)?;
    let starts = |i: &MapInspection| {
        i.objects
            .iter()
            .filter(|o| o.kind == "Player spawn")
            .map(|o| o.position.map(f64::from))
            .collect::<Vec<_>>()
    };
    let (start, face) = playable_anchor(&base_mesh, &faces, 0, true, &starts(base))?;
    let (end, _) = playable_anchor(&donor_mesh, &donor_faces, index, false, &starts(donor))?;
    let donor_part = &donor_mesh.parts[index];
    let donor_min = donor_mesh.indices
        [donor_part.index_start..donor_part.index_start + donor_part.index_count]
        .iter()
        .map(|i| vertex(&donor_mesh, *i)[0])
        .fold(f64::INFINITY, f64::min);
    let base_max = base_mesh
        .positions
        .chunks_exact(3)
        .map(|p| p[0] as f64)
        .fold(f64::NEG_INFINITY, f64::max);
    let translation = [
        base_max + 64. - donor_min,
        start[1] - end[1],
        start[2] - end[2],
    ];
    let shader = connection_shader(&base.tags, faces[face].shader, &base.header.name)
        .ok_or_else(|| {
            SparkError::Invalid("Choose a real environment shader for the tunnel".into())
        })?;
    let plan = BspAssembly {
        schema_version: 1,
        donor_project_id: donor_project.id.clone(),
        donor_title: donor_project.title.clone(),
        donor_source,
        donor_tags_directory: tags,
        donor_bsp_index: index,
        include_donor_scenery: false,
        translation,
        yaw_degrees: 0.,
        tunnel_points: vec![start, add(end, translation)],
        tunnel_width: 2.,
        tunnel_height: 1.6,
        tunnel_shader_path: shader.path.clone(),
        open_road: false,
        infantry_tunnel: None,
        high_ground: None,
        terrain_seam: None,
        sections:vec![],arch_segments:None,
        visibility_zones: vec![],
    };
    plan.validate()?;
    Ok(plan)
}
/// A new adjacent terrain proposal; saved corridor plans are not rewritten.
pub fn plan_terrain(base_project:&Project,base:&MapInspection,donor_project:&Project,donor:&MapInspection,index:usize,tags:PathBuf)->Result<BspAssembly>{
    terrain::plan(&base_project.source.as_ref().ok_or_else(||SparkError::Invalid("Destination source is missing".into()))?.preserved_path,base,donor,plan(base_project,base,donor_project,donor,index,tags)?)
}
pub fn verify_route(mesh: &MeshData, assembly: &BspAssembly) -> Result<usize> {
    crate::bsp_clearance::verify_route(mesh, assembly)
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledRouteReport {
    pub cache_sha256: String,
    pub collision_triangles: usize,
    pub walk_samples: Vec<usize>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledWalkthroughStart {
    pub id: String,
    pub position: [f32; 3],
    pub floor_height: Option<f64>,
    pub issue: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledWalkthroughReport {
    pub cache_sha256: String,
    pub collision_triangles: usize,
    pub forward_samples: usize,
    pub return_samples: usize,
    pub starts: Vec<CompiledWalkthroughStart>,
    pub player_traversal_verified: bool,
}
/// Reuse the exact compiled collision checker in both directions and for the
/// scenario's starts. It deliberately grants no native physics/portal/scenery
/// or player acceptance, even when every geometric sample is clear.
pub fn verify_compiled_walkthrough(path: &Path, route: &BspAssembly) -> Result<CompiledWalkthroughReport> {
    route.validate()?;
    let inspection = maps::inspect_map(path, path.parent())?;
    let (collision, _) = maps::collision_source(path, &inspection)?;
    let checker = crate::bsp_clearance::RouteChecker::new(&collision)?;
    let forward_samples = checker.verify(route)?;
    let mut reverse = route.clone();
    reverse.tunnel_points.reverse();
    if let Some(tunnel) = &mut reverse.infantry_tunnel { tunnel.points.reverse(); }
    if let Some(ridge) = &mut reverse.high_ground { ridge.points.reverse(); }
    let return_samples = checker.verify(&reverse)?;
    let points = inspection.objects.iter().filter(|o| o.kind == "Player spawn").collect::<Vec<_>>();
    if points.is_empty() || points.len() > 4096 {
        return invalid("Walkthrough requires 1-4096 actual native player starts");
    }
    let starts = points.into_iter().map(|p| {
        let result = checker.verify_start(p.position.map(f64::from));
        CompiledWalkthroughStart { id: p.id.clone(), position: p.position,
            floor_height: result.as_ref().ok().copied(), issue: result.err().map(|e| e.to_string()) }
    }).collect();
    Ok(CompiledWalkthroughReport { cache_sha256: inspection.sha256,
        collision_triangles: collision.indices.len()/3, forward_samples, return_samples, starts,
        player_traversal_verified: false })
}
/// Recheck earlier connections after extending a world. Routes must use the
/// compiled world's coordinates; BSP checks do not include scenery or physics.
pub fn verify_compiled_routes(path: &Path, routes: &[BspAssembly]) -> Result<CompiledRouteReport> {
    if routes.is_empty() || routes.len() > 16 {
        return invalid("Choose 1-16 connection routes to check in the compiled cache");
    }
    for route in routes { route.validate()?; }
    let inspection = maps::inspect_map(path, path.parent())?;
    let (collision, _) = maps::collision_source(path, &inspection)?;
    let checker = crate::bsp_clearance::RouteChecker::new(&collision)?;
    let mut walk_samples = Vec::with_capacity(routes.len());
    for (index, route) in routes.iter().enumerate() {
        walk_samples.push(checker.verify(route).map_err(|error| {
            SparkError::Invalid(format!("Connection {} ({}): {error}", index + 1, route.donor_title))
        })?);
    }
    Ok(CompiledRouteReport {
        cache_sha256: inspection.sha256,
        collision_triangles: collision.indices.len() / 3,
        walk_samples,
    })
}
fn playable_anchor(
    mesh: &MeshData,
    faces: &[CollisionFace],
    part: usize,
    east: bool,
    starts: &[V],
) -> Result<(V, usize)> {
    let fallback = anchor(mesh, faces, part, east)?;
    let range = &mesh.parts[part];
    let mut candidates = vec![];
    for start in starts {
        let mut floor: Option<(V, usize)> = None;
        for (index, ids) in mesh.indices[range.index_start..range.index_start + range.index_count]
            .chunks_exact(3)
            .enumerate()
        {
            let face = &faces[range.index_start / 3 + index];
            if face.shader.is_none() || face.flags & 2 != 0 {
                continue;
            }
            let p: [V; 3] = std::array::from_fn(|k| vertex(mesh, ids[k]));
            let n = normal(p[0], p[1], p[2]);
            if n[2] < 0.65 {
                continue;
            }
            let z = p[0][2] - (n[0] * (start[0] - p[0][0]) + n[1] * (start[1] - p[0][1])) / n[2];
            if z > start[2] + 0.12 || z < start[2] - 1.5 {
                continue;
            }
            let point = [start[0], start[1], z];
            if !bary(
                point,
                &RenderTri {
                    p,
                    n,
                    uv: [[0.; 2]; 3],
                },
            )
            .is_some_and(|v| v.iter().all(|x| *x >= -1e-6))
            {
                continue;
            }
            if floor.as_ref().is_none_or(|(old, _)| z > old[2]) {
                floor = Some((point, range.index_start / 3 + index));
            }
        }
        if let Some((point, face)) = floor {
            let delta = sub(point, fallback.0);
            // A rebuilt world can retain starts only in its original section.
            // Do not send a new connection back across an entire donor map.
            let distance=dot(delta,delta);
            if distance<=32.*32. { candidates.push((point, face, distance)); }
        }
    }
    Ok(candidates
        .into_iter()
        .min_by(|a, b| a.2.total_cmp(&b.2))
        .map(|(p, f, _)| (p, f))
        .unwrap_or(fallback))
}
fn collision_layer(
    render: &MeshGL64,
    materials: &mut Vec<AssemblyMaterial>,
) -> Result<(MeshData, Vec<usize>)> {
    // UV discontinuities must not force nearly-zero collision triangles. Keep
    // the real shader/flag boundaries, simplify an independent collision layer,
    // and retain the original UV geometry separately for rendering.
    let source = materials.clone();
    let mut canonical = BTreeMap::new();
    let keys: Vec<usize> = source
        .iter()
        .enumerate()
        .map(|(i, m)| {
            *canonical
                .entry((
                    m.source,
                    m.shader_path.clone(),
                    m.shader_class.clone(),
                    m.flags,
                ))
                .or_insert(i)
        })
        .collect();
    let mut input = MeshGL64 {
        num_prop: 3,
        ..Default::default()
    };
    for (face, ids) in render.tri_verts.chunks_exact(3).enumerate() {
        let slot = *keys.get(render.face_id[face] as usize).ok_or_else(|| {
            SparkError::Invalid("Collision source material identity is invalid".into())
        })?;
        let first = input.num_vert() as u64;
        for id in ids {
            input
                .vert_properties
                // Match MeshData/JMS precision before topology cleanup. Casting
                // after Manifold silently collapses distinct boundary vertices,
                // leaving zero-area sky faces and opposing collision surfaces.
                .extend(render.vert_properties[*id as usize * 5..*id as usize * 5 + 3]
                    .iter().map(|&coordinate| f64::from(coordinate as f32)));
        }
        input.tri_verts.extend([first, first + 1, first + 2]);
        input.face_id.push(slot as u64);
    }
    input.merge();
    let body = checked(
        Manifold::from_mesh_gl64_robust(&input),
        "Collision layer import",
    )?;
    let body = checked(
        body.set_tolerance(0.001).simplify(0.001),
        "Collision precision cleanup",
    )?;
    let mut output = body.get_mesh_gl64(-1);
    if output.num_prop != 3 || output.face_id.len() != output.num_tri() {
        return invalid("Collision layer lost its material identity");
    }
    crate::bsp_triangulate::improve(&mut output);
    let mut mesh = MeshData {
        label: "Connected collision and render source".into(),
        source: "spark-bsp-assembly".into(),
        ..Default::default()
    };
    let mut slots = vec![];
    let mut copies = BTreeMap::new();
    for (face, ids) in output.tri_verts.chunks_exact(3).enumerate() {
        let key = output.face_id[face] as usize;
        if key >= source.len() {
            return invalid("Collision simplification crossed a source material boundary");
        }
        let slot = if source[key].shader_path.is_none() {
            key
        } else {
            *copies.entry(key).or_insert_with(|| {
                let mut material = source[key].clone();
                material.name = format!("p{}", material.name);
                material.collision_only = true;
                let slot = materials.len();
                materials.push(material);
                slot
            })
        };
        let order = [ids[0], ids[2], ids[1]];
        let points: [V; 3] = std::array::from_fn(|n| {
            std::array::from_fn(|k| output.vert_properties[order[n] as usize * 3 + k])
        });
        let n = normal(points[0], points[1], points[2]);
        let first = mesh.positions.len() / 3;
        for point in points {
            mesh.positions.extend(point.map(|v| v as f32));
            mesh.normals.extend(n.map(|v| v as f32));
            mesh.uvs.extend([0., 0.]);
        }
        mesh.indices
            .extend([first as u32, first as u32 + 1, first as u32 + 2]);
        slots.push(slot);
    }
    Ok((mesh, slots))
}
pub fn export_jms(geometry: &AssemblyGeometry) -> Result<String> {
    let mut out = String::from("8200\n0\n1\nframe\n-1\n-1\n0\t0\t0\t1\n0\t0\t0\n");
    writeln!(out, "{}", geometry.materials.len()).unwrap();
    for m in &geometry.materials {
        let flags = if m.shader_path.is_none() {
            String::new()
        } else {
            format!(
                "{}{}{}{}",
                if m.flags & 1 != 0 { "%" } else { "" },
                if m.collision_only { "@" } else { "!" },
                if m.flags & 4 != 0 { "^" } else { "" },
                if m.flags & 8 != 0 { "-" } else { "" }
            )
        };
        writeln!(out, "{}{}\n<none>", m.name, flags).unwrap();
    }
    let mesh = &geometry.mesh;
    writeln!(out, "0\n1\n__unnamed\n{}", mesh.positions.len() / 3).unwrap();
    for v in 0..mesh.positions.len() / 3 {
        writeln!(
            out,
            "0\n{:.6}\t{:.6}\t{:.6}\n{:.8}\t{:.8}\t{:.8}\n-1\n0\n{:.6}\n{:.6}\n0",
            mesh.positions[v * 3] as f64 * 100.,
            mesh.positions[v * 3 + 1] as f64 * 100.,
            mesh.positions[v * 3 + 2] as f64 * 100.,
            mesh.normals[v * 3],
            mesh.normals[v * 3 + 1],
            mesh.normals[v * 3 + 2],
            mesh.uvs[v * 2],
            mesh.uvs[v * 2 + 1]
        )
        .unwrap();
    }
    writeln!(out, "{}", mesh.indices.len() / 3).unwrap();
    for (t, m) in mesh
        .indices
        .chunks_exact(3)
        .zip(&geometry.triangle_materials)
    {
        writeln!(out, "0\n{m}\n{}\t{}\t{}", t[0], t[1], t[2]).unwrap();
    }
    Ok(out.replace('\n', "\r\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authored_visibility_exports_real_portal_faces_and_preserves_empty_serialization() {
        let mut plan:BspAssembly=serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Fixture","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":13,"engine":"fixture","scenarioPath":"fixture"},"donorTagsDirectory":"fixture","donorBspIndex":0,"translation":[0.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[1.,0.,0.],[9.,0.,0.]],"tunnelWidth":2.,"tunnelHeight":1.6,"tunnelShaderPath":"fixture/metal"})).unwrap();
        assert!(serde_json::to_value(&plan).unwrap().get("visibilityZones").is_none());
        let bounds=|lo:f32,hi:f32|MeshData{positions:vec![lo,-1.,0.,hi,1.,2.,lo,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(base,donor)=(bounds(0.,2.),bounds(8.,10.));
        plan.visibility_zones=vec![crate::bsp_visibility::VisibilityZone::Tunnel{id:uuid::Uuid::new_v4().to_string(),name:"Portal span".into(),segment:0,start:0.25,end:0.75}];
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        assert_eq!(add_portals(&mut mesh,&mut materials,&mut slots,&plan,&base,&donor,None).unwrap(),2);
        assert_eq!(mesh.positions[0],3.);
        assert_eq!(mesh.positions[12],7.);
        let geometry=AssemblyGeometry{mesh,materials,triangle_materials:slots,report:AssemblyReport{input_triangles:0,output_triangles:4,connector_triangles:0,generated_uv_faces:0,walk_samples:0,portal_count:2,route_clearance:vec![],donor_scenery:0,warnings:vec![]}};
        assert!(export_jms(&geometry).unwrap().contains("+portal\r\n<none>\r\n"));
        if let crate::bsp_visibility::VisibilityZone::Tunnel{start,..}=&mut plan.visibility_zones[0]{*start=0.05;}
        assert!(add_portals(&mut MeshData::default(),&mut vec![],&mut vec![],&plan,&base,&donor,None).is_err());
    }

    fn material() -> AssemblyMaterial {
        AssemblyMaterial {
            name: "floorx".into(),
            source: 0,
            shader_path: Some("fixture/floor".into()),
            shader_class: Some("senv".into()),
            flags: 0,
            collision_only: false,
        }
    }

    #[test]
    fn collision_precision_repairs_collapsed_boundary_edges_without_losing_the_solid() {
        let a=[62.4620166,21.42190674,-12.11817017];
        let b=[76.,a[1],a[2]];
        let sides=tunnel_sides(&[a,b],2.).unwrap();
        let body=tunnel_solid(a,b,sides[0],sides[1],4.,0).unwrap();
        let mut gl=body.get_mesh_gl64(-1);
        let edge=[gl.tri_verts[0],gl.tri_verts[1]];
        let point=|m:&MeshGL64,id:u64|std::array::from_fn::<_,3,_>(|k|m.vert_properties[id as usize*5+k]);
        let ends=edge.map(|id|point(&gl,id));
        let faces=std::mem::take(&mut gl.tri_verts);
        let slots=std::mem::take(&mut gl.face_id);
        let mut split=0;
        for (face,ids) in faces.chunks_exact(3).enumerate() {
            if let Some(k)=(0..3).find(|&k|{
                let x=point(&gl,ids[k]);let y=point(&gl,ids[(k+1)%3]);
                x==ends[0]&&y==ends[1]||x==ends[1]&&y==ends[0]
            }) {
                let [x,y,z]=[ids[k],ids[(k+1)%3],ids[(k+2)%3]];
                let weight=if point(&gl,x)==ends[0]{1e-9}else{1.-1e-9};
                let new=gl.num_vert() as u64;
                for property in 0..5 {
                    let v=gl.vert_properties[x as usize*5+property]*(1.-weight)+gl.vert_properties[y as usize*5+property]*weight;
                    gl.vert_properties.push(v);
                }
                assert_eq!(point(&gl,new).map(|v|v as f32),ends[0].map(|v|v as f32));
                gl.tri_verts.extend([x,new,z,new,y,z]);gl.face_id.extend([slots[face];2]);split+=1;
            } else {gl.tri_verts.extend(ids);gl.face_id.push(slots[face]);}
        }
        assert!(split>=2,"The same closed-solid edge must be split on both sides");
        let mut materials=vec![material()];let (mesh,slots)=collision_layer(&gl,&mut materials).unwrap();
        let mut volume=0.;let mut unique=std::collections::BTreeSet::new();
        for (ids,slot) in mesh.indices.chunks_exact(3).zip(slots) {
            let p=[vertex(&mesh,ids[0]),vertex(&mesh,ids[1]),vertex(&mesh,ids[2])];
            assert!(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),cross(sub(p[1],p[0]),sub(p[2],p[0])))>0.,"Native float output must contain no collapsed face");
            let mut key=p.map(|v|v.map(f64::to_bits));key.sort();assert!(unique.insert(key),"Native collision must contain no coincident opposing faces");
            assert!(materials[slot].collision_only);volume+=dot(p[0],cross(p[1],p[2]))/6.;
        }
        assert!((volume.abs()-body.volume()).abs()<1e-4,"Cleanup must preserve the complete solid volume");
    }

    #[test]
    fn tunnel_keeps_floor_orientation_and_material_across_long_spans() {
        let a = [53.893385569254555, 38.31026649475098, -14.04014778137207];
        let b = [204.56627702713013, a[1], a[2]];
        let sides = tunnel_sides(&[a,b],2.).unwrap();
        let body = tunnel_solid(a, b, sides[0], sides[1], 1.6, 0).unwrap();
        assert!(body.volume() > 400.);
        let source = body.get_mesh_gl64(-1);
        for t in source.tri_verts.chunks_exact(3) {
            let uv: Vec<_> = t
                .iter()
                .map(|id| &source.vert_properties[*id as usize * 5 + 3..*id as usize * 5 + 5])
                .collect();
            let area = (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1])
                - (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0]);
            assert!(
                area.abs() > 1e-6,
                "Every wall needs nondegenerate lightmapper UVs"
            );
        }
        let mut materials = vec![material()];
        let (mesh, slots) = collision_layer(&body.get_mesh_gl64(-1), &mut materials).unwrap();
        assert_eq!(slots.len(), mesh.indices.len() / 3);
        assert!(slots.iter().all(|i| materials[*i].collision_only));
        let floors: Vec<_> = mesh
            .indices
            .chunks_exact(3)
            .filter(|t| {
                let p = [
                    vertex(&mesh, t[0]),
                    vertex(&mesh, t[1]),
                    vertex(&mesh, t[2]),
                ];
                normal(p[0], p[1], p[2])[2] > 0.99
            })
            .collect();
        assert_eq!(floors.len(), 2);
        assert!(floors
            .iter()
            .flat_map(|t| t.iter())
            .all(|id| (vertex(&mesh, *id)[2] - a[2]).abs() < 1e-5));
    }

    #[test]
    fn tunnel_bends_share_a_cap_without_a_collision_wedge() {
        let points=[[0.,0.,0.],[5.,0.,0.],[10.,5.,0.],[15.,5.,0.]];
        let sides=tunnel_sides(&points,2.).unwrap();
        let mut joined=tunnel_solid(points[0],points[1],sides[0],sides[1],1.6,0).unwrap();
        let mut separate=joined.volume();
        for i in 1..points.len()-1 {
            let next=tunnel_solid(points[i],points[i+1],sides[i],sides[i+1],1.6,0).unwrap();
            separate+=next.volume();joined=joined.union(&next);
        }
        assert_eq!(joined.decompose().len(),1,"All tunnel sections must form one connected solid");
        assert!((joined.volume()-separate).abs()<1e-5,"Matching bend caps must meet without a gap or overlapping wedge");
        assert!(tunnel_sides(&[[0.,0.,0.],[5.,0.,0.],[0.,0.01,0.]],2.).is_err());
    }

    #[test]
    fn donor_anchor_uses_facing_edge_instead_of_map_centre() {
        let mut mesh = MeshData::default();
        for x in [0., 10., 20.] {
            let first = (mesh.positions.len() / 3) as u32;
            mesh.positions
                .extend([x, -1., 0., x + 2., -1., 0., x + 1., 1., 0.]);
            mesh.indices.extend([first, first + 1, first + 2]);
        }
        mesh.parts.push(maps::MeshPart {
            name: "floor".into(),
            index_start: 0,
            index_count: 9,
        });
        let mut faces = vec![
            CollisionFace {
                shader: Some(1),
                flags: 0,
                normal: [0., 0., 1.]
            };
            3
        ];
        assert!(anchor(&mesh, &faces, 0, false).unwrap().0[0] < 5.);
        assert!(anchor(&mesh, &faces, 0, true).unwrap().0[0] > 17.);
        let authored = playable_anchor(&mesh, &faces, 0, false, &[[11., 0., 0.05]]).unwrap();
        assert_eq!(
            authored.0,
            [11., 0., 0.],
            "An authored playable start takes priority over an arbitrary edge floor"
        );
        faces[0].flags = 2;
        assert!(
            anchor(&mesh, &faces, 0, false).unwrap().0[0] > 5.,
            "Invisible player-clip floors cannot be map entrances"
        );
        faces[0].flags = 0;
        faces[0].shader = None;
        assert!(
            anchor(&mesh, &faces, 0, false).unwrap().0[0] > 5.,
            "Sky boundaries cannot be map entrances"
        );
    }
    #[test]
    fn chained_world_ignores_starts_remote_from_the_selected_edge() {
        let mut mesh=MeshData::default();
        for x in [0.,200.] {
            let at=(mesh.positions.len()/3) as u32;
            mesh.positions.extend([x,-1.,0.,x+2.,-1.,0.,x+1.,1.,0.]);
            mesh.indices.extend([at,at+1,at+2]);
        }
        mesh.parts.push(maps::MeshPart{name:"joined world".into(),index_start:0,index_count:6});
        let faces=vec![CollisionFace{shader:Some(1),flags:0,normal:[0.,0.,1.]};2];
        let entrance=playable_anchor(&mesh,&faces,0,true,&[[1.,0.,0.05]]).unwrap();
        assert!(entrance.0[0]>199.,"Inherited starts in a remote map must not pull a new tunnel across the joined world");
    }
    #[test]
    fn rebuilt_collision_materials_reuse_only_equivalent_render_uv_sources() {
        let physical=maps::Tag{id:1,index:0,class:"senv".into(),path:"gsbsp_12345678_0/materials/pgsabcdef01m2x".into(),data_offset:None,external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:Some(maps::ShaderPreview::default())};
        let mut render=physical.clone();render.id=2;render.path=render.path.replace("/pgs","/gs");
        let used=BTreeSet::from([2]);
        assert_eq!(render_shader_aliases(&[physical.clone(),render.clone()],&used).get(&1),Some(&2));
        render.shader_preview.as_mut().unwrap().uv_scale=[4.,4.];
        assert!(render_shader_aliases(&[physical,render],&used).is_empty(),"Different shader mappings must never share projected UVs");
    }

    #[test]
    fn tunnel_mouths_cannot_end_on_invisible_boundary_floors_or_in_midair() {
        let mesh = MeshData {
            positions: vec![0., 0., 0., 2., 0., 0., 0., 2., 0.],
            indices: vec![0, 1, 2],
            parts: vec![maps::MeshPart {
                name: "floor".into(),
                index_start: 0,
                index_count: 3,
            }],
            ..Default::default()
        };
        let mut faces = vec![CollisionFace {
            shader: Some(1),
            flags: 0,
            normal: [0., 0., 1.],
        }];
        assert!(verify_entrance(&mesh, &faces, 0, [10., 0., 3.], 90., [9.5, 0.5, 3.]).is_ok());
        assert!(verify_entrance(&mesh, &faces, 0, [0.; 3], 0., [0.5, 0.5, 1.]).is_err());
        faces[0].flags = 2;
        assert!(verify_entrance(&mesh, &faces, 0, [0.; 3], 0., [0.5, 0.5, 0.]).is_err());
        faces[0].flags = 0;
        faces[0].shader = None;
        assert!(verify_entrance(&mesh, &faces, 0, [0.; 3], 0., [0.5, 0.5, 0.]).is_err());
    }
    #[test]
    fn connection_material_prefers_real_tiling_structure_over_whole_map_ground() {
        let tag=|id,path:&str,class:&str|maps::Tag{id,index:id as usize,class:class.into(),path:path.into(),data_offset:None,external:false,fields:vec![],references:vec![],primary_bitmap_status:Some("resolved".into()),shader_preview:None};
        let tags=vec![tag(1,"levels/test/timberland/shaders/timberland_ground","senv"),tag(2,"levels/b30/shaders/metal flat generic","senv"),tag(3,"levels/test/timberland/shaders/timberland_metal_plate_floor","senv"),tag(4,"levels/test/timberland/shaders/player_clip","senv")];
        assert_eq!(connection_shader(&tags,Some(1),"timberland").unwrap().id,3);
        assert_eq!(connection_shader(&tags[..1],Some(1),"timberland").unwrap().id,1);
        assert!(connection_shader(&tags[3..],None,"timberland").is_none());
    }
    fn dual_route_plan() -> BspAssembly {
        serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Fixture","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":13,"engine":"fixture","scenarioPath":"fixture"},"donorTagsDirectory":"fixture","donorBspIndex":0,"translation":[0.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[0.,0.,0.],[100.,0.,0.]],"tunnelWidth":4.,"tunnelHeight":4.,"tunnelShaderPath":"fixture/metal"})).unwrap()
    }
    #[test]
    fn optional_road_and_infantry_metadata_preserve_old_serialization_and_reject_invalid_routes() {
        let mut plan = dual_route_plan(); let old = serde_json::to_value(&plan).unwrap();
        assert!(old.get("openRoad").is_none()); assert!(old.get("infantryTunnel").is_none());
        plan.open_road = true; plan.infantry_tunnel = Some(InfantryTunnel {points:vec![[0.,0.,0.],[25.,8.,0.],[75.,8.,0.],[100.,0.,0.]],width:2.,height:1.6,shader_path:"fixture/stone".into()});
        plan.validate().unwrap(); let routes=plan.connection_routes(); assert_eq!(routes.len(),2);
        assert!(routes[0].open_road); assert!(!routes[1].open_road); assert!(routes.iter().all(|r|r.infantry_tunnel.is_none()));
        assert_eq!(routes[1].tunnel_shader_path,"fixture/stone"); assert_eq!(routes[1].donor_source.sha256,plan.donor_source.sha256);
        let encoded=serde_json::to_vec(&plan).unwrap(); let decoded:BspAssembly=serde_json::from_slice(&encoded).unwrap(); assert_eq!(serde_json::to_vec(&decoded).unwrap(),encoded);
        plan.infantry_tunnel.as_mut().unwrap().points=plan.tunnel_points.clone(); assert!(plan.validate().unwrap_err().to_string().contains("distinct"));
        plan.infantry_tunnel=None;plan.tunnel_width=2.;assert!(plan.validate().unwrap_err().to_string().contains("open road"));
        plan.open_road=false; assert!(plan.validate().is_ok()); assert_eq!(serde_json::to_value(&plan).unwrap().get("infantryTunnel"),None);
    }
    #[test]
    fn native_road_sky_and_separate_tunnel_keep_material_uvs_and_both_clearance_routes() {
        let mut plan=dual_route_plan();plan.open_road=true;plan.infantry_tunnel=Some(InfantryTunnel{points:vec![[0.,0.,0.],[25.,8.,0.],[75.,8.,0.],[100.,0.,0.]],width:2.,height:1.6,shader_path:"fixture/stone".into()});
        let routes=plan.connection_routes();
        // The real routes begin inside their source rooms, not on a closed end cap.
        let a=[-2.,0.,0.];let b=[102.,0.,0.];let sides=tunnel_sides(&[a,b],4.).unwrap();
        let mut body=passage_solid(a,b,sides[0],sides[1],4.,0,Some(2)).unwrap();
        let road=body.get_mesh_gl64(-1);assert_eq!(road.face_id.iter().filter(|m|**m==2).count(),2);
        for (ids,material) in road.tri_verts.chunks_exact(3).zip(&road.face_id) {if *material==2 {assert!(ids.iter().all(|id|(road.vert_properties[*id as usize*5+2]-4.).abs()<1e-8));}}
        let route=&routes[1];let sides=tunnel_sides(&route.tunnel_points,route.tunnel_width as f64).unwrap();
        for (index,pair) in route.tunnel_points.windows(2).enumerate(){let tunnel=passage_solid(pair[0],pair[1],sides[index],sides[index+1],route.tunnel_height as f64,1,None).unwrap();body=checked(body.boolean_with_engine_and_token(&tunnel,OpType::Add,BooleanEngine::Auto,None),"Test route union").unwrap();}
        let gl=body.get_mesh_gl64(-1);assert!(gl.face_id.contains(&1));assert!(gl.face_id.contains(&2));
        let mut materials=vec![material(),AssemblyMaterial{shader_path:Some("fixture/stone".into()),name:"infantryx".into(),..material()},AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let (mesh,_)=collision_layer(&gl,&mut materials).unwrap();let all=verify_route(&mesh,&plan).unwrap();assert!(all>800);
        let only_road=verify_route(&mesh,&routes[0]).unwrap();assert!(all>only_road);
        plan.infantry_tunnel.as_mut().unwrap().points=vec![[0.,0.,0.],[25.,25.,0.],[75.,25.,0.],[100.,0.,0.]];
        assert!(verify_route(&mesh,&plan).unwrap_err().to_string().contains("Infantry tunnel"));
    }
    #[test]
    fn secondary_portals_cannot_hide_a_primary_route_without_isolated_cuts() {
        let mut plan=dual_route_plan();
        plan.infantry_tunnel=Some(InfantryTunnel{points:vec![[0.,0.,0.],[25.,8.,0.],[75.,8.,0.],[100.,0.,0.]],width:2.,height:1.6,shader_path:"fixture/stone".into()});
        let overlap=MeshData{positions:vec![0.,-1.,0.,100.,1.,6.,0.,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        let error=add_portals(&mut mesh,&mut materials,&mut slots,&plan,&overlap,&overlap,None).unwrap_err();
        assert!(error.to_string().contains("Primary connection"));
        assert!(materials.is_empty());
    }
    #[test]
    fn visibility_run_crosses_a_grade_change_without_losing_the_isolated_cut(){
        let mut plan=dual_route_plan();plan.tunnel_points=vec![[0.,0.,0.],[32.,0.,0.]];
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,-4.,1.],[11.5,-4.,3.],[32.,-4.,1.]],width:4.,height:8.,shader_path:"fixture/stone".into()});
        let bounds=|lo:f32,hi:f32|MeshData{positions:vec![lo,-10.,0.,hi,10.,20.,lo,10.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        assert_eq!(add_portals(&mut mesh,&mut materials,&mut slots,&plan,&bounds(0.,10.),&bounds(13.,32.),None).unwrap(),4);
        assert_eq!(materials.len(),1);assert_eq!(slots.len(),8);
        let ridge=plan.high_ground_plan(plan.high_ground.as_ref().unwrap());assert_eq!(portal_spans(&ridge),vec![(0,2)]);
        let mut bend=ridge.clone();bend.tunnel_points[1][1]-=2.;assert_eq!(portal_spans(&bend),vec![(0,1),(1,2)]);
    }
    #[test]
    fn both_connections_export_distinct_native_portal_cuts_with_one_portal_material() {
        let mut plan=dual_route_plan();plan.open_road=true;plan.infantry_tunnel=Some(InfantryTunnel{points:vec![[0.,0.,0.],[25.,8.,0.],[75.,8.,0.],[100.,0.,0.]],width:2.,height:1.6,shader_path:"fixture/stone".into()});
        let bounds=|lo:f32,hi:f32|MeshData{positions:vec![lo,-1.,0.,hi,1.,6.,lo,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        let cuts=add_portals(&mut mesh,&mut materials,&mut slots,&plan,&bounds(0.,10.),&bounds(90.,100.),None).unwrap();
        assert_eq!(cuts,8);assert_eq!(materials.len(),1);assert_eq!(materials[0].name,"+portal");assert_eq!(slots.len(),16);
        assert!(mesh.positions.chunks_exact(3).any(|p|p[1]>6.));
    }


    #[test]
    fn high_ground_is_optional_source_metadata_with_independent_validation_and_no_recursive_routes() {
        let mut plan=dual_route_plan();
        assert!(serde_json::to_value(&plan).unwrap().get("highGround").is_none());
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,-12.,6.],[100.,-12.,6.]],width:4.,height:8.,shader_path:"fixture/stone".into()});
        plan.validate().unwrap();
        let routes=plan.connection_routes();assert_eq!(routes.len(),2);assert_eq!(plan.route_label(1),"High-ground route");
        assert!(!routes[0].open_road);assert!(routes[1].open_road);
        assert!(routes.iter().all(|route|route.infantry_tunnel.is_none()&&route.high_ground.is_none()));
        let encoded=serde_json::to_vec(&plan).unwrap();let decoded:BspAssembly=serde_json::from_slice(&encoded).unwrap();
        assert_eq!(serde_json::to_vec(&decoded).unwrap(),encoded);
        plan.high_ground.as_mut().unwrap().points=plan.tunnel_points.clone();
        assert!(plan.validate().unwrap_err().to_string().contains("separate"));
        plan.high_ground.as_mut().unwrap().points=vec![[0.,-12.,6.],[10.,-12.,16.]];
        assert!(plan.validate().unwrap_err().to_string().contains("High-ground route"));
        plan.high_ground.as_mut().unwrap().points=vec![[0.,-12.,6.],[100.,-12.,6.]];
        plan.high_ground.as_mut().unwrap().width=2.;assert!(plan.validate().is_err());
    }
    #[test]
    fn canyon_route_inside_existing_open_sky_gets_a_real_floor_without_covering_the_lower_road(){
        let mut plan=dual_route_plan();plan.open_road=true;
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,-12.,6.],[100.,-12.,6.]],width:4.,height:8.,shader_path:"fixture/stone".into()});
        let a=[-2.,0.,0.];let b=[102.,0.,0.];let sides=tunnel_sides(&[a,b],40.).unwrap();
        let space=passage_solid(a,b,sides[0],sides[1],20.,0,Some(2)).unwrap();
        let mut slots=vec![material(),material(),AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let original=space.get_mesh_gl64(-1);let (mesh,_)=collision_layer(&original,&mut slots).unwrap();
        assert!(crate::bsp_clearance::RouteChecker::new(&mesh).unwrap().verify(&plan).is_err(),"Open sky alone has no raised floor");
        let supported=support_high_ground(space,&plan.high_ground_plan(plan.high_ground.as_ref().unwrap()),1,-1.,None).unwrap().get_mesh_gl64(-1);
        assert!(supported.num_tri()<100,"A flat ridge must stay coarse");
        let (mesh,_)=collision_layer(&supported,&mut slots).unwrap();
        let report=crate::bsp_clearance::RouteChecker::new(&mesh).unwrap().verify_details(&plan).unwrap();
        assert_eq!(report.len(),2);assert!(report.iter().all(|route|route.walk_samples>=400));
    }
    #[test]
    fn ramped_canyon_support_remains_continuous_at_every_miter(){
        let mut plan=dual_route_plan();plan.tunnel_points=vec![[0.,0.,0.],[32.788,0.,0.]];
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,0.,0.],[6.5576,-12.,0.],[13.1152,-12.,1.96728],[19.6728,-12.,1.96728],[26.2304,-12.,0.],[32.788,0.,0.]],width:4.,height:8.,shader_path:"fixture/stone".into()});
        let a=[-3.,0.,0.];let b=[36.,0.,0.];let sides=tunnel_sides(&[a,b],40.).unwrap();
        let space=passage_solid(a,b,sides[0],sides[1],20.,0,Some(2)).unwrap();
        let ridge=plan.high_ground_plan(plan.high_ground.as_ref().unwrap());
        let supported=support_high_ground(space,&ridge,1,-1.,None).unwrap().get_mesh_gl64(-1);
        let mut slots=vec![material(),material(),AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let (mesh,_)=collision_layer(&supported,&mut slots).unwrap();
        let report=crate::bsp_clearance::RouteChecker::new(&mesh).unwrap().verify_details(&plan).unwrap();
        assert_eq!(report.len(),2);assert!(supported.num_tri()<200);
    }
    #[test]
    fn all_three_authored_routes_are_sampled_and_missing_ridge_collision_cannot_pass_on_lower_routes() {
        let mut plan=dual_route_plan();plan.open_road=true;
        plan.infantry_tunnel=Some(InfantryTunnel{points:vec![[0.,8.,0.],[100.,8.,0.]],width:2.,height:1.6,shader_path:"fixture/cave".into()});
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,-12.,6.],[100.,-12.,6.]],width:4.,height:8.,shader_path:"fixture/stone".into()});
        let routes=plan.connection_routes();assert_eq!(routes.len(),3);assert_eq!(plan.route_label(2),"High-ground route");
        let mut combined:Option<Manifold>=None;
        for (index,route) in routes.iter().enumerate(){
            let a=add(route.tunnel_points[0],[-2.,0.,0.]);let b=add(*route.tunnel_points.last().unwrap(),[2.,0.,0.]);
            let sides=tunnel_sides(&[a,b],route.tunnel_width as f64).unwrap();
            let body=passage_solid(a,b,sides[0],sides[1],route.tunnel_height as f64,index,route.open_road.then_some(3)).unwrap();
            combined=Some(match combined {None=>body,Some(previous)=>checked(previous.boolean_with_engine_and_token(&body,OpType::Add,BooleanEngine::Auto,None),"Fixture routes").unwrap()});
        }
        let gl=combined.unwrap().get_mesh_gl64(-1);
        assert!(gl.face_id.contains(&2));assert!(gl.face_id.contains(&3));
        let mut materials=vec![material(),material(),material(),AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let (mesh,_)=collision_layer(&gl,&mut materials).unwrap();
        let checker=crate::bsp_clearance::RouteChecker::new(&mesh).unwrap();let report=checker.verify_details(&plan).unwrap();
        assert_eq!(report.iter().map(|route|route.label.as_str()).collect::<Vec<_>>(),["Primary connection","Infantry tunnel","High-ground route"]);
        assert!(report.iter().all(|route|route.walk_samples>=400));
        let total=checker.verify(&plan).unwrap();assert_eq!(total,report.iter().map(|route|route.walk_samples).sum::<usize>());
        let mut reverse=plan.clone();reverse.tunnel_points.reverse();reverse.infantry_tunnel.as_mut().unwrap().points.reverse();reverse.high_ground.as_mut().unwrap().points.reverse();
        assert_eq!(checker.verify(&reverse).unwrap(),total);
        // Lower collision within the legacy floor-search tolerance must not
        // falsely certify an elevated sniper route.
        plan.high_ground.as_mut().unwrap().points=vec![[0.,-12.,7.],[100.,-12.,7.]];
        assert!(checker.verify(&plan).unwrap_err().to_string().contains("canyon-top floor"));
        plan.high_ground.as_mut().unwrap().points=vec![[0.,-24.,6.],[100.,-24.,6.]];
        assert!(checker.verify(&plan).unwrap_err().to_string().contains("High-ground route"));
    }

}

#[cfg(test)] mod viewport_source_tests {
 use super::*;
 fn inspected(id:u32)->MapInspection{
  MapInspection{header:maps::MapHeader{version:609,engine:"fixture".into(),name:"fixture".into(),build:"fixture".into(),scenario_type:1,file_size:2048,declared_size:2048,tag_offset:0,tag_size:0,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false},sha256:format!("{id:064x}"),tag_checksum:None,tags:vec![maps::Tag{id,index:0,class:"senv".into(),path:"native/floor".into(),data_offset:None,external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None}],objects:vec![],decals:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"fixture".into()}
 }
 #[test] fn joined_preview_keeps_each_native_shader_owner_world_positions_uvs_and_unbaked_status(){
  let mesh=MeshData{positions:vec![0.,0.,0.,1.,0.,0.,0.,1.,0.],normals:vec![0.,0.,1.,0.,0.,1.,0.,0.,1.],uvs:vec![0.,0.,1.,0.,0.,1.],indices:vec![0,1,2,0,1,2,0,1,2],..Default::default()};
  let mut geometry=AssemblyGeometry{mesh,materials:vec![AssemblyMaterial{name:"base".into(),source:0,shader_path:Some("native/floor".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"donor".into(),source:1,shader_path:Some("native/floor".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"+portal".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}],triangle_materials:vec![0,1,2],report:AssemblyReport{input_triangles:2,output_triangles:3,connector_triangles:0,generated_uv_faces:0,walk_samples:1,portal_count:1,route_clearance:vec![],donor_scenery:0,warnings:vec![]}};
  let base=inspected(10);let donor=inspected(20);let views=viewport_surfaces(&geometry,&base,&donor).unwrap();assert_eq!(views.len(),2);
  for (view,id) in views.iter().zip([10,20]) {assert_eq!(view.mesh.positions,geometry.mesh.positions);assert_eq!(view.mesh.uvs,geometry.mesh.uvs);assert_eq!(view.mesh.indices,vec![0,1,2]);assert_eq!(view.mesh.material_ranges[0].shader_tag_id,id);assert!(!view.mesh.material_ranges[0].has_lightmap_uvs);assert_eq!(view.mesh.material_ranges[0].lightmap_page,-1);}
  let mut missing=donor.clone();missing.tags.clear();assert!(viewport_surfaces(&geometry,&base,&missing).unwrap_err().to_string().contains("native tag"));
  geometry.mesh.normals.clear();assert!(viewport_surfaces(&geometry,&base,&donor).is_err());
 }
}

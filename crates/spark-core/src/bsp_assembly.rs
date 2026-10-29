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
type V = [f64; 3];
const MAX_INPUT_TRIANGLES: usize = 100_000;
const MAX_OUTPUT_TRIANGLES: usize = 150_000;
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
        Ok(())
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
pub struct AssemblyReport {
    pub input_triangles: usize,
    pub output_triangles: usize,
    pub generated_uv_faces: usize,
    pub walk_samples: usize,
    pub portal_count: usize,
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
        let generated=material.split_once('m').is_some_and(|(hash,index)|hash.len()==8&&hash.bytes().all(|c|c.is_ascii_hexdigit())&&index.strip_suffix('x').is_some_and(|v|!v.is_empty()&&v.bytes().all(|c|c.is_ascii_digit())))
            || material.strip_prefix("tunnel").and_then(|v|v.strip_suffix('x')).is_some_and(|v|v.len()==8&&v.bytes().all(|c|c.is_ascii_hexdigit()));
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
fn tunnel_solid(a: V, b: V, side_a: V, side_b: V, height: f64, material: usize) -> Result<Manifold> {
    let up = [0., 0., height];
    let p = [
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
    let triangles = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7,
    ];
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
    gl.face_id = vec![material as u64; 12];
    gl.merge();
    checked(Manifold::from_mesh_gl64(&gl), "Tunnel")
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
    verify_entrance(
        &base_mesh,
        &base_faces,
        0,
        [0.; 3],
        0.,
        assembly.tunnel_points[0],
    )?;
    verify_entrance(
        &donor_mesh,
        &donor_faces,
        assembly.donor_bsp_index,
        assembly.translation,
        assembly.yaw_degrees,
        *assembly.tunnel_points.last().unwrap(),
    )?;
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
    let tunnel_material = materials.len();
    materials.push(AssemblyMaterial {
        name: format!("gstunnel{}x", &base.sha256[..8]),
        source: 0,
        shader_path: Some(assembly.tunnel_shader_path.clone()),
        shader_class: Some("senv".into()),
        flags: 0,
        collision_only: false,
    });
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
            let mut combined = left;
            let sides=tunnel_sides(&assembly.tunnel_points,assembly.tunnel_width as f64)?;
            for (index,pair) in assembly.tunnel_points.windows(2).enumerate() {
                let passage = tunnel_solid(
                    pair[0].map(f64::from),
                    pair[1].map(f64::from),
                    sides[index],
                    sides[index+1],
                    assembly.tunnel_height as f64,
                    tunnel_material,
                )?;
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
            let united = checked(
                combined.boolean_with_engine_and_token(
                    &right,
                    OpType::Add,
                    BooleanEngine::Auto,
                    Some(&token),
                ),
                "Donor join",
            )?;
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
    let (mut mesh, mut triangle_materials) = collision_layer(&gl, &mut materials)?;
    let walk_samples = verify_route(&mesh, assembly)?;
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
    )?;
    Ok(AssemblyGeometry{report:AssemblyReport{input_triangles:base_mesh.indices.len()/3+donor_mesh.parts[assembly.donor_bsp_index].index_count/3,output_triangles:mesh.indices.len()/3,generated_uv_faces,walk_samples,portal_count,donor_scenery,warnings:vec!["This rebuild regenerates collision, portals and lightmaps; original per-cluster weather/sound assignments and render-only decorations require separate review. Donor scenery is optional; campaign actors, scripts and gameplay objects are not imported.".into(),"UVs are projected from source render surfaces where available. Unmatched collision-only surfaces use generated planar UVs.".into(),"A compiled clearance test and successful boot do not replace a manual player walkthrough, including scenery collision at the entrances.".into()]},mesh,materials,triangle_materials})
}
fn add_portals(
    mesh: &mut MeshData,
    materials: &mut Vec<AssemblyMaterial>,
    slots: &mut Vec<usize>,
    assembly: &BspAssembly,
    base: &MeshData,
    donor: &MeshData,
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
    let donor_bounds = bounds(
        donor,
        assembly.donor_bsp_index,
        assembly.translation.map(f64::from),
        assembly.yaw_degrees as f64,
    );
    let inside = |p: V, b: (V, V)| (0..3).all(|k| p[k] >= b.0[k] - 0.1 && p[k] <= b.1[k] + 0.1);
    let slot = materials.len();
    let mut count = 0;
    let mut generated_cuts:Vec<([[f64;3];4],bool)>=vec![];
    for (segment, pair) in assembly.tunnel_points.windows(2).enumerate() {
        let (a, b) = (pair[0].map(f64::from), pair[1].map(f64::from));
        let d = sub(b, a);
        let length = d[0].hypot(d[1]);
        let steps = (length / 0.4).ceil() as usize;
        let candidates: Vec<_> = (1..steps)
            .map(|n| add(a, mul(d, n as f64 / steps as f64)))
            .filter(|p| !inside(*p, base_bounds) && !inside(*p, donor_bounds))
            .collect();
        let authored = crate::bsp_visibility::authored_centers(&assembly.visibility_zones, &assembly.tunnel_points, segment)?;
        if authored.is_none() && candidates.len() < 4 {
            continue;
        }
        let [first, last] = authored.unwrap_or_else(||[candidates[candidates.len() / 3],candidates[candidates.len() * 2 / 3]]);
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
            let points = if authored.is_some(){crate::bsp_visibility::authored_portal_quad(center,d,assembly.tunnel_width as f64,assembly.tunnel_height as f64)?}else{crate::bsp_visibility::portal_quad(center,d,assembly.tunnel_width as f64,assembly.tunnel_height as f64)?};
            if generated_cuts.iter().any(|(previous,was_authored)|(*was_authored||authored.is_some())&&crate::bsp_visibility::portals_intersect(previous,&points)) {
                return invalid("Authored visibility planes cross or overlap another portal. Move the handles away from the tunnel bend or other cuts");
            }
            generated_cuts.push((points,authored.is_some()));
            let n = normal(points[0], points[1], points[2]);
            let begin = mesh.positions.len() / 3;
            for p in points {
                mesh.positions.extend(p.map(|v| v as f32));
                mesh.normals.extend(n.map(|v| v as f32));
                mesh.uvs.extend([0., 0.]);
            }
            mesh.indices.extend([
                begin as u32,
                begin as u32 + 1,
                begin as u32 + 2,
                begin as u32,
                begin as u32 + 2,
                begin as u32 + 3,
            ]);
            slots.extend([slot, slot]);
            count += 1;
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
pub fn plan(
    base_project: &Project,
    base: &MapInspection,
    donor_project: &Project,
    donor: &MapInspection,
    index: usize,
    tags: PathBuf,
) -> Result<BspAssembly> {
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
    let shader = faces[face]
        .shader
        .and_then(|id| base.tags.iter().find(|t| t.id == id && t.class == "senv"))
        .or_else(|| {
            base.tags
                .iter()
                .find(|t| t.class == "senv" && t.path.contains("ground"))
        })
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
        visibility_zones: vec![],
    };
    plan.validate()?;
    Ok(plan)
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
                .extend_from_slice(&render.vert_properties[*id as usize * 5..*id as usize * 5 + 3]);
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
        assert_eq!(add_portals(&mut mesh,&mut materials,&mut slots,&plan,&base,&donor).unwrap(),2);
        assert_eq!(mesh.positions[0],3.);
        assert_eq!(mesh.positions[12],7.);
        let geometry=AssemblyGeometry{mesh,materials,triangle_materials:slots,report:AssemblyReport{input_triangles:0,output_triangles:4,generated_uv_faces:0,walk_samples:0,portal_count:2,donor_scenery:0,warnings:vec![]}};
        assert!(export_jms(&geometry).unwrap().contains("+portal\r\n<none>\r\n"));
        if let crate::bsp_visibility::VisibilityZone::Tunnel{start,..}=&mut plan.visibility_zones[0]{*start=0.05;}
        assert!(add_portals(&mut MeshData::default(),&mut vec![],&mut vec![],&plan,&base,&donor).is_err());
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
}

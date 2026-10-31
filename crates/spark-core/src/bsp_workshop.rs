//! Editable convex volumes. Unioned playable spaces minus solid brushes are
//! exported as inward-facing Halo structure, with exact source-face provenance.
use crate::{
    invalid,
    quickforge::{ForgeMesh, ForgeMeshPart, GeometryIssue, GeometryReport, QuickForgeDocument},
    Result,
};
use manifold_rust::{
    manifold::Manifold,
    types::{Error, MeshGL64, OpType},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
type V = [f64; 3];
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Workshop {
    pub schema_version: u32,
    pub brushes: Vec<Brush>,
    pub portals: Vec<Portal>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Brush {
    pub id: String,
    pub name: String,
    pub role: String,
    pub position: V,
    pub rotation: V,
    pub scale: V,
    pub vertices: Vec<V>,
    pub faces: Vec<Face>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Face {
    pub id: String,
    pub vertices: Vec<usize>,
    pub material_id: String,
    pub uv_scale: [f64; 2],
    pub uv_offset: [f64; 2],
    pub uv_rotation: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Portal {
    pub id: String,
    pub points: Vec<V>,
    pub material_id: String,
}
fn sub(a: V, b: V) -> V {
    std::array::from_fn(|k| a[k] - b[k])
}
fn dot(a: V, b: V) -> f64 {
    (0..3).map(|k| a[k] * b[k]).sum()
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
    let l = dot(n, n).sqrt();
    n.map(|v| v / l)
}
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}
fn world(b: &Brush, p: V) -> V {
    let mut p: V = std::array::from_fn(|k| p[k] * b.scale[k]);
    for axis in 0..3 {
        let (s, c) = b.rotation[axis].sin_cos();
        let i = (axis + 1) % 3;
        let j = (axis + 2) % 3;
        let a = p[i];
        let z = p[j];
        p[i] = a * c - z * s;
        p[j] = a * s + z * c;
    }
    std::array::from_fn(|k| p[k] + b.position[k])
}
fn checked(m: Manifold) -> Result<Manifold> {
    if m.status() != Error::NoError || m.is_empty() {
        return invalid("Workshop boolean produced empty or invalid geometry; the previous source remains available through Undo");
    }
    if m.num_tri() > 32000 {
        return invalid("Workshop exceeds 32000 output triangles");
    }
    Ok(m)
}
fn face_check(b: &Brush, f: &Face) -> Result<V> {
    if f.vertices.len() < 3
        || f.vertices.len() > 128
        || f.vertices.iter().any(|&i| i >= b.vertices.len())
        || f.vertices.iter().collect::<BTreeSet<_>>().len() != f.vertices.len()
    {
        return invalid(format!(
            "Brush {} face {} has invalid/repeated vertex indices",
            b.name, f.id
        ));
    }
    let points = f
        .vertices
        .iter()
        .map(|&i| b.vertices[i])
        .collect::<Vec<_>>();
    let n = normal(points[0], points[1], points[2]);
    if !n.iter().all(|v| v.is_finite()) {
        return invalid(format!(
            "Brush {} face {} has zero area or a short edge",
            b.name, f.id
        ));
    }
    for i in 0..points.len() {
        let a = points[i];
        let c = points[(i + 1) % points.len()];
        let d = points[(i + 2) % points.len()];
        if dot(sub(c, a), sub(c, a)) < 0.000001
            || dot(sub(a, points[0]), n).abs() > 0.00001
            || dot(cross(sub(c, a), sub(d, c)), n) < 0.0000001
        {
            return invalid(format!(
                "Brush {} face {} is nonplanar, concave or has a nearly collapsed edge",
                b.name, f.id
            ));
        }
    }
    if b.vertices
        .iter()
        .any(|p| dot(sub(*p, points[0]), n) > 0.00001)
    {
        return invalid(format!("Brush {} face {} points inward or makes the brush non-convex. Split the brush before moving this vertex",b.name,f.id));
    }
    Ok(n)
}
pub fn validate_source(doc: &QuickForgeDocument) -> Result<()> {
    let Some(w) = &doc.workshop else {
        return Ok(());
    };
    if w.schema_version != 1
        || w.brushes.is_empty()
        || w.brushes.len() > 64
        || w.portals.len() > 32
        || !doc.geometry.is_empty()
    {
        return invalid("Workshop requires 1–64 convex source brushes, at most 32 portals and no mixed legacy geometry. Preserve the old project when converting");
    }
    let mut ids = doc
        .placements
        .iter()
        .map(|v| v.id.clone())
        .chain(doc.spawns.iter().map(|v| v.id.clone()))
        .chain(doc.objectives.iter().map(|v| v.id.clone()))
        .collect::<BTreeSet<_>>();
    for b in &w.brushes {
        if !safe_id(&b.id)
            || !ids.insert(b.id.clone())
            || b.name.is_empty()
            || b.name.len() > 100
            || b.name.chars().any(char::is_control)
            || !["space", "solid"].contains(&b.role.as_str())
            || b.vertices.len() < 4
            || b.vertices.len() > 128
            || b.faces.len() < 4
            || b.faces.len() > 128
        {
            return invalid("Invalid Workshop brush identity, role or topology limits");
        }
        if b.position
            .iter()
            .chain(&b.rotation)
            .chain(&b.scale)
            .chain(b.vertices.iter().flatten())
            .any(|v| !v.is_finite() || v.abs() > 1500.)
            || b.scale.iter().any(|v| *v < 0.01 || *v > 100.)
            || b.vertices
                .iter()
                .any(|p| world(b, *p).iter().any(|v| v.abs() > 1500.))
        {
            return invalid(format!("Invalid/out-of-bounds transform on {}", b.name));
        }
        let mut edge = BTreeMap::<(usize, usize), Vec<(usize, usize)>>::new();
        let mut face_ids = BTreeSet::new();
        let mut volume = 0.;
        for f in &b.faces {
            if !safe_id(&f.id)
                || !face_ids.insert(&f.id)
                || !doc.materials.iter().any(|m| {
                    m.id == f.material_id && (!m.name.starts_with('+') || m.name == "+sky")
                })
                || f.uv_scale
                    .iter()
                    .any(|v| !v.is_finite() || v.abs() < 0.0001 || v.abs() > 100.)
                || f.uv_offset
                    .iter()
                    .any(|v| !v.is_finite() || v.abs() > 1024.)
                || !f.uv_rotation.is_finite()
            {
                return invalid(format!("Invalid face ID, material or UVs on {}", b.name));
            }
            face_check(b, f)?;
            for i in 0..f.vertices.len() {
                let a = f.vertices[i];
                let c = f.vertices[(i + 1) % f.vertices.len()];
                edge.entry((a.min(c), a.max(c))).or_default().push((a, c));
            }
            for i in 1..f.vertices.len() - 1 {
                volume += dot(
                    b.vertices[f.vertices[0]],
                    cross(b.vertices[f.vertices[i]], b.vertices[f.vertices[i + 1]]),
                ) / 6.;
            }
        }
        if volume < 0.00001
            || edge
                .values()
                .any(|v| v.len() != 2 || v[0].0 != v[1].1 || v[0].1 != v[1].0)
        {
            return invalid(format!(
                "Brush {} is open, has reversed normals or non-manifold edges",
                b.name
            ));
        }
    }
    if !w.brushes.iter().any(|b| b.role == "space") {
        return invalid("Add a playable room/space brush before building");
    }
    let mut planes = BTreeSet::new();
    for p in &w.portals {
        if !safe_id(&p.id)
            || !ids.insert(p.id.clone())
            || p.points.len() != 4
            || !p
                .points
                .iter()
                .flatten()
                .all(|v| v.is_finite() && v.abs() < 1500.)
            || !doc.materials.iter().any(|m| {
                m.id == p.material_id && ["+portal", "+exactportal"].contains(&m.name.as_str())
            })
        {
            return invalid("Invalid portal identity, quad or special material");
        }
        let n = normal(p.points[0], p.points[1], p.points[2]);
        if !n.iter().all(|v| v.is_finite())
            || dot(sub(p.points[3], p.points[0]), n).abs() > 0.00001
            || (0..4).any(|i| {
                dot(
                    cross(
                        sub(p.points[(i + 1) % 4], p.points[i]),
                        sub(p.points[(i + 2) % 4], p.points[(i + 1) % 4]),
                    ),
                    n,
                ) < 0.000001
            })
        {
            return invalid(format!("Portal {} must be a planar convex quad", p.id));
        }
        let mut points = p
            .points
            .iter()
            .map(|p| p.map(|v| (v * 1000000.).round() as i64))
            .collect::<Vec<_>>();
        points.sort();
        if !planes.insert(points) {
            return invalid("Two portal quads occupy the same opening; remove the duplicate");
        }
    }
    Ok(())
}
pub fn special_material(doc: &QuickForgeDocument, id: &str) -> bool {
    doc.workshop.is_some()
        && doc.materials.iter().any(|m| {
            m.id == id
                && ["+portal", "+exactportal", "+sky"].contains(&m.name.as_str())
                && m.shader_path.is_none()
        })
}
pub fn portal_material(doc: &QuickForgeDocument, id: &str) -> bool {
    doc.workshop.is_some()
        && doc
            .materials
            .iter()
            .any(|m| m.id == id && ["+portal", "+exactportal"].contains(&m.name.as_str()))
}
fn uv(p: V, n: V, f: &Face) -> [f64; 2] {
    let axis = (0..3)
        .max_by(|a, b| n[*a].abs().total_cmp(&n[*b].abs()))
        .unwrap();
    let v = match axis {
        0 => [p[1], p[2]],
        1 => [p[0], p[2]],
        _ => [p[0], p[1]],
    };
    let (s, c) = f.uv_rotation.to_radians().sin_cos();
    [
        (v[0] * c - v[1] * s) * f.uv_scale[0] + f.uv_offset[0],
        (v[0] * s + v[1] * c) * f.uv_scale[1] + f.uv_offset[1],
    ]
}
fn solid(b: &Brush, slots: &mut Vec<(String, String, String)>) -> Result<Manifold> {
    let mut gl = MeshGL64 {
        num_prop: 5,
        ..Default::default()
    };
    for f in &b.faces {
        let slot = slots.len();
        slots.push((b.id.clone(), f.id.clone(), f.material_id.clone()));
        let n = face_check(b, f)?;
        for j in 1..f.vertices.len() - 1 {
            let first = gl.num_vert() as u64;
            for i in [f.vertices[0], f.vertices[j], f.vertices[j + 1]] {
                let p = b.vertices[i];
                gl.vert_properties.extend(world(b, p));
                gl.vert_properties.extend(uv(p, n, f));
            }
            gl.tri_verts.extend([first, first + 1, first + 2]);
            gl.face_id.push(slot as u64);
        }
    }
    gl.merge();
    checked(Manifold::from_mesh_gl64(&gl))
}
fn point_triangle(p: V, t: [V; 3]) -> bool {
    let n = normal(t[0], t[1], t[2]);
    if dot(sub(p, t[0]), n).abs() > 0.001 {
        return false;
    }
    (0..3).all(|i| dot(cross(sub(t[(i + 1) % 3], t[i]), sub(p, t[i])), n) >= -0.0001)
}
/// Only deterministic derived geometry is cached. Source validation, scenario
/// checks, project fingerprints, native input hashes and compiler checks always run.
/// Two recently used meshes share a bounded 16 MiB cache across preview/validation.
static MESH_CACHE: std::sync::Mutex<std::collections::VecDeque<(Vec<u8>, ForgeMesh, usize)>> =
    std::sync::Mutex::new(std::collections::VecDeque::new());
pub fn mesh(doc: &QuickForgeDocument) -> Result<ForgeMesh> {
    validate_source(doc)?;
    let key = serde_json::to_vec(&doc.workshop)?;
    let mut cache = MESH_CACHE.lock().map_err(|_| {
        crate::SparkError::Invalid(
            "Workshop derived mesh cache is unavailable; reopen Spark".into(),
        )
    })?;
    if let Some(index) = cache.iter().position(|(k, _, _)| k == &key) {
        let entry = cache.remove(index).unwrap();
        let result = entry.1.clone();
        cache.push_back(entry);
        return Ok(result);
    }
    let result = mesh_uncached(doc)?;
    let bytes = key.len()
        + (result.positions.len() + result.normals.len() + result.uvs.len() + result.indices.len())
            * 4
        + result
            .parts
            .iter()
            .map(|p| {
                64 + p.brush_id.len()
                    + p.material_id.len()
                    + p.face_id.as_ref().map_or(0, String::len)
            })
            .sum::<usize>();
    if bytes <= 16 * 1024 * 1024 {
        while cache.len() >= 2
            || cache.iter().map(|e| e.2).sum::<usize>() + bytes > 16 * 1024 * 1024
        {
            cache.pop_front();
        }
        cache.push_back((key, result.clone(), bytes));
    }
    Ok(result)
}
fn mesh_uncached(doc: &QuickForgeDocument) -> Result<ForgeMesh> {
    let w = doc.workshop.as_ref().unwrap();
    let mut slots = vec![];
    let mut space: Option<Manifold> = None;
    for b in w.brushes.iter().filter(|b| b.role == "space") {
        let next = solid(b, &mut slots)?;
        space = Some(match space {
            None => next,
            Some(m) => checked(m.boolean(&next, OpType::Add))?,
        });
    }
    let mut space = space.unwrap();
    for b in w.brushes.iter().filter(|b| b.role == "solid") {
        space = checked(space.boolean(&solid(b, &mut slots)?, OpType::Subtract))?;
    }
    let gl = space.get_mesh_gl64(-1);
    if gl.num_prop != 5 || gl.face_id.len() != gl.num_tri() {
        return invalid("Workshop boolean lost exact face/UV provenance; export refused");
    }
    let mut mesh = ForgeMesh {
        positions: vec![],
        normals: vec![],
        uvs: vec![],
        indices: vec![],
        parts: vec![],
    };
    for (t, tri) in gl.tri_verts.chunks_exact(3).enumerate() {
        let Some((brush, face, material)) = slots.get(gl.face_id[t] as usize) else {
            return invalid("Workshop source face identity was lost");
        };
        let points = [tri[0], tri[2], tri[1]]
            .map(|i| std::array::from_fn(|k| gl.vert_properties[i as usize * 5 + k]));
        let n = normal(points[0], points[1], points[2]);
        let start = mesh.indices.len();
        for (j, i) in [tri[0], tri[2], tri[1]].iter().enumerate() {
            mesh.indices.push(mesh.positions.len() as u32 / 3);
            mesh.positions.extend(points[j].map(|v| v as f32));
            mesh.normals.extend(n.map(|v| v as f32));
            mesh.uvs.extend([
                gl.vert_properties[*i as usize * 5 + 3] as f32,
                gl.vert_properties[*i as usize * 5 + 4] as f32,
            ]);
        }
        mesh.parts.push(ForgeMeshPart {
            brush_id: brush.clone(),
            material_id: material.clone(),
            index_start: start,
            index_count: 3,
            face_id: Some(face.clone()),
        });
    }
    let structure = mesh
        .indices
        .chunks_exact(3)
        .map(|t| {
            std::array::from_fn(|j| {
                std::array::from_fn(|k| mesh.positions[t[j] as usize * 3 + k] as f64)
            })
        })
        .collect::<Vec<[V; 3]>>();
    for p in &w.portals {
        // Exact portals must seal against the actual evaluated wall/floor boundary,
        // not just an overlapping authored brush's conservative bounding box.
        for i in 0..4 {
            for t in [0., 0.25, 0.5, 0.75, 1.] {
                let q = std::array::from_fn(|k| {
                    p.points[i][k] * (1. - t) + p.points[(i + 1) % 4][k] * t
                });
                if !structure.iter().any(|tri| point_triangle(q, *tri)) {
                    return invalid(format!("Portal {} has an unearthed edge; fit every boundary to the evaluated opening",p.id));
                }
            }
        }
        let start = mesh.indices.len();
        let n = normal(p.points[0], p.points[1], p.points[2]);
        for t in [[0, 1, 2], [0, 2, 3]] {
            for i in t {
                mesh.indices.push(mesh.positions.len() as u32 / 3);
                mesh.positions.extend(p.points[i].map(|v| v as f32));
                mesh.normals.extend(n.map(|v| v as f32));
                mesh.uvs.extend([0., 0.]);
            }
        }
        mesh.parts.push(ForgeMeshPart {
            brush_id: p.id.clone(),
            face_id: None,
            material_id: p.material_id.clone(),
            index_start: start,
            index_count: 6,
        });
    }
    Ok(mesh)
}
pub fn report(doc: &QuickForgeDocument) -> Result<GeometryReport> {
    let mesh = mesh(doc)?;
    let mut structure = mesh.clone();
    structure.indices = mesh
        .parts
        .iter()
        .filter(|p| !portal_material(doc, &p.material_id))
        .flat_map(|p| {
            mesh.indices[p.index_start..p.index_start + p.index_count]
                .iter()
                .copied()
        })
        .collect();
    let mut issues = crate::quickforge::validate_mesh(&structure);
    let components = components(&structure);
    if components != 1 {
        issues.push(GeometryIssue {
            severity: "error".into(),
            code: "WORKSHOP_DISCONNECTED".into(),
            message:
                "Rooms are disconnected. Overlap a corridor into both rooms before native export"
                    .into(),
            brush_ids: doc
                .workshop
                .as_ref()
                .unwrap()
                .brushes
                .iter()
                .map(|b| b.id.clone())
                .collect(),
            triangle_indices: vec![],
        });
    }
    for issue in &mut issues {
        issue.brush_ids = mesh
            .parts
            .iter()
            .filter(|p| {
                issue
                    .triangle_indices
                    .iter()
                    .any(|t| t * 3 >= p.index_start && t * 3 < p.index_start + p.index_count)
            })
            .map(|p| p.brush_id.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
    }
    let w = doc.workshop.as_ref().unwrap();
    let contains = |p: V| {
        w.brushes
            .iter()
            .filter(|b| b.role == "space")
            .any(|b| inside(b, p, -0.01))
            && !w
                .brushes
                .iter()
                .filter(|b| b.role == "solid")
                .any(|b| inside(b, p, 0.3))
    };
    for s in &doc.spawns {
        let p = s.position.map(f64::from);
        if ![p, [p[0], p[1], p[2] + 0.75]].into_iter().all(contains) {
            issues.push(GeometryIssue {
                severity: "error".into(),
                code: "WORKSHOP_SPAWN_CLEARANCE".into(),
                message: format!(
                    "Player start {} is outside the playable brush volume or overlaps a solid",
                    s.id
                ),
                brush_ids: vec![s.id.clone()],
                triangle_indices: vec![],
            });
        }
    }
    Ok(GeometryReport {
        valid: !issues.iter().any(|i| i.severity == "error"),
        issues,
        vertices: mesh.positions.len() / 3,
        triangles: mesh.indices.len() / 3,
        closed_components: components,
        source_sha256: crate::hex_bytes(Sha256::digest(serde_json::to_vec(doc)?)),
    })
}
fn components(m: &ForgeMesh) -> usize {
    let mut roots = (0..m.indices.len() / 3).collect::<Vec<_>>();
    let mut edges = BTreeMap::new();
    let key = |i: u32| {
        std::array::from_fn::<i64, 3, _>(|k| {
            (m.positions[i as usize * 3 + k] as f64 * 1000000.).round() as i64
        })
    };
    fn root(roots: &mut [usize], mut i: usize) -> usize {
        while roots[i] != i {
            roots[i] = roots[roots[i]];
            i = roots[i];
        }
        i
    }
    for (i, t) in m.indices.chunks_exact(3).enumerate() {
        for j in 0..3 {
            let a = key(t[j]);
            let b = key(t[(j + 1) % 3]);
            let e = if a < b { (a, b) } else { (b, a) };
            if let Some(previous) = edges.insert(e, i) {
                let old = root(&mut roots, previous);
                let new = root(&mut roots, i);
                roots[old] = new;
            }
        }
    }
    (0..roots.len())
        .map(|i| root(&mut roots, i))
        .collect::<BTreeSet<_>>()
        .len()
}
fn inside(b: &Brush, p: V, margin: f64) -> bool {
    b.faces.iter().all(|f| {
        let a = world(b, b.vertices[f.vertices[0]]);
        let n = normal(
            a,
            world(b, b.vertices[f.vertices[1]]),
            world(b, b.vertices[f.vertices[2]]),
        );
        dot(sub(p, a), n) <= margin
    })
}
pub fn box_brush(id: &str, role: &str, lo: V, hi: V, material: &str) -> Brush {
    let vertices = vec![
        [lo[0], lo[1], lo[2]],
        [hi[0], lo[1], lo[2]],
        [hi[0], hi[1], lo[2]],
        [lo[0], hi[1], lo[2]],
        [lo[0], lo[1], hi[2]],
        [hi[0], lo[1], hi[2]],
        [hi[0], hi[1], hi[2]],
        [lo[0], hi[1], hi[2]],
    ];
    let faces = [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 0, 4, 7],
    ]
    .iter()
    .enumerate()
    .map(|(i, v)| Face {
        id: format!("face-{i}"),
        vertices: v.to_vec(),
        material_id: material.into(),
        uv_scale: [1.; 2],
        uv_offset: [0.; 2],
        uv_rotation: 0.,
    })
    .collect();
    Brush {
        id: id.into(),
        name: id.into(),
        role: role.into(),
        position: [0.; 3],
        rotation: [0.; 3],
        scale: [1.; 3],
        vertices,
        faces,
    }
}
pub fn example() -> Result<QuickForgeDocument> {
    let mut d = crate::quickforge::create_arena("Spark BSP Workshop Rooms", "customBlank")?;
    let mut ramp = box_brush("ramp", "solid", [-3., -3., -0.5], [3., 1., 1.5], "surface");
    ramp.vertices = vec![
        [-3., -3., -0.5],
        [3., -3., -0.5],
        [3., 1., -0.5],
        [-3., 1., -0.5],
        [3., 1., 1.5],
        [-3., 1., 1.5],
    ];
    ramp.faces = [
        [0, 3, 2, 1].to_vec(),
        vec![3, 5, 4, 2],
        vec![0, 1, 4, 5],
        vec![0, 5, 3],
        vec![1, 2, 4],
    ]
    .into_iter()
    .enumerate()
    .map(|(i, v)| Face {
        id: format!("face-{i}"),
        vertices: v,
        material_id: "surface".into(),
        uv_scale: [1.; 2],
        uv_offset: [0.; 2],
        uv_rotation: 0.,
    })
    .collect();
    d.workshop = Some(Workshop {
        schema_version: 1,
        brushes: vec![
            box_brush("room-a", "space", [-8., -6., 0.], [8., 6., 5.], "surface"),
            box_brush("corridor", "space", [7., -2., 0.], [21., 2., 3.], "surface"),
            box_brush("room-b", "space", [20., -6., 0.], [36., 6., 5.], "surface"),
            ramp,
        ],
        portals: vec![],
    });
    for (i, p) in [
        [-5., -4., 0.1],
        [-5., 4., 0.1],
        [32., -4., 0.1],
        [32., 4., 0.1],
    ]
    .iter()
    .enumerate()
    {
        d.spawns.push(crate::quickforge::ForgeSpawn {
            id: format!("start-{i}"),
            name: format!("Player {}", i + 1),
            position: *p,
            facing: 0.,
            team: 0,
            game_modes: vec!["slayer".into()],
            visible: true,
            locked: false,
        });
    }
    Ok(d)
}

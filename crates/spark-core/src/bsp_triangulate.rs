//! Improve coplanar diagonals before Halo Tool's float importer discards
//! needle triangles. For generated terrain, also weld tiny intersection
//! edges while protecting stock vertices, planes and affine UV charts.
use manifold_rust::types::MeshGL64;
use std::collections::{BTreeMap, BTreeSet};
type V = [f64; 3];
fn sub(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] - b[i])
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
fn at(m: &MeshGL64, id: u64) -> V {
    std::array::from_fn(|k| m.vert_properties[id as usize * m.num_prop as usize + k])
}
fn face(m: &MeshGL64, t: [u64; 3]) -> (V, f64) {
    triangle_quality(t.map(|id| at(m, id)))
}
fn triangle_quality([origin, b, c]: [V; 3]) -> (V, f64) {
    let a = sub(b, origin);
    let b = sub(c, origin);
    let n = cross(a, b);
    let size = dot(n, n).sqrt();
    let max = dot(a, a).max(dot(b, b)).max(dot(sub(a, b), sub(a, b)));
    (n.map(|v| v / size.max(1e-30)), size / max.max(1e-30))
}
fn affine(m: &MeshGL64, t: [u64; 3], d: u64, uv_tolerance: f64) -> bool {
    if m.num_prop == 3 {
        return true;
    }
    let Some(weights) = chart_weights(m, t, at(m, d)) else { return false; };
    (3..m.num_prop as usize).all(|k| {
        let value = m.vert_properties[d as usize * m.num_prop as usize + k];
        let projected = chart_property(m, t, weights, k);
        (projected - value).abs() < uv_tolerance.max(1e-6 * (1. + value.abs()))
    })
}
fn chart_weights(m: &MeshGL64, face: [u64; 3], point: V) -> Option<V> {
    let [a, b, c] = face.map(|id| at(m, id));
    let u = sub(b, a);
    let v = sub(c, a);
    let p = sub(point, a);
    let n = cross(u, v);
    let den = dot(n, n);
    if den < 1e-20 { return None; }
    let x = dot(cross(p, v), n) / den;
    let y = dot(cross(u, p), n) / den;
    Some([1. - x - y, x, y])
}
fn chart_property(m: &MeshGL64, face: [u64; 3], weights: V, property: usize) -> f64 {
    face.into_iter().zip(weights).map(|(id, weight)| {
        m.vert_properties[id as usize * m.num_prop as usize + property] * weight
    }).sum()
}
/// Triangulate a clipped convex render polygon without changing its boundary.
/// Prefer the fan whose smallest triangle altitude survives Tool's precision best.
pub(super) fn clipped_render_fan(polygon: &[V]) -> usize {
    let native: Vec<_> = polygon.iter().copied()
        .map(crate::bsp_assembly::native_export_point).collect();
    let mut best = (0, -1.);
    for anchor in 0..native.len() {
        let mut altitude = f64::INFINITY;
        for index in 1..native.len() - 1 {
            let a = native[anchor];
            let b = native[(anchor + index) % native.len()];
            let c = native[(anchor + index + 1) % native.len()];
            let ab = sub(b, a);
            let ac = sub(c, a);
            let bc = sub(c, b);
            let longest = dot(ab, ab).max(dot(ac, ac)).max(dot(bc, bc));
            let normal = cross(ab, ac);
            altitude = altitude.min(dot(normal, normal) / longest.max(1e-30));
        }
        if altitude > best.1 { best = (anchor, altitude); }
    }
    best.0
}

pub(crate) fn improve(m: &mut MeshGL64) -> usize { improve_material(m, None, false) }
pub(crate) fn improve_at_native_precision(m: &mut MeshGL64) -> usize { improve_material(m, None, true) }
fn improve_material(m: &mut MeshGL64, selected: Option<u64>, native_render: bool) -> usize {
    if m.num_prop < 3 || m.face_id.len() != m.num_tri() {
        return 0;
    }
    let point = |mesh: &MeshGL64, id| {
        let position = at(mesh, id);
        if native_render { crate::bsp_assembly::native_export_point(position) } else { position }
    };
    let quality = |mesh: &MeshGL64, ids: [u64; 3]| triangle_quality(ids.map(|id| point(mesh, id)));
    let mut flips = 0;
    for _ in 0..16 {
        let mut edges: BTreeMap<(u64, u64), Vec<(usize, u64, u64, u64)>> = BTreeMap::new();
        for (f, t) in m.tri_verts.chunks_exact(3).enumerate() {
            for k in 0..3 {
                let (a, b, c) = (t[k], t[(k + 1) % 3], t[(k + 2) % 3]);
                edges
                    .entry((a.min(b), a.max(b)))
                    .or_default()
                    .push((f, a, b, c));
            }
        }
        let mut changed = vec![false; m.num_tri()];
        let mut new_edges = BTreeSet::new();
        let before = flips;
        for pair in edges.values().filter(|p| p.len() == 2) {
            let (f, a, b, c) = pair[0];
            let (g, u, v, d) = pair[1];
            if changed[f]
                || changed[g]
                || a != v
                || b != u
                || c == d
                || m.face_id[f] != m.face_id[g]
                || selected.is_some_and(|material| m.face_id[f] != material)
            {
                continue;
            }
            let old = [a, b, c];
            let other = [b, a, d];
            let (n, q) = quality(m, old);
            let (n2, q2) = quality(m, other);
            // Check the fourth UV against the better-conditioned chart.
            // Projecting from a nearly collinear triangle magnifies rounding
            // and can reject a valid diagonal in the same affine chart.
            // A collapsed render triangle has no normal after float narrowing.
            // Use its nondegenerate neighbor's plane to check the replacement.
            let reference = if native_render && q == 0. && q2 > 0. {
                n2
            } else if native_render && q2 == 0. && q > 0. {
                n
            } else if dot(n, n2) >= 1. - 1e-10 {
                n
            } else {
                continue;
            };
            if [c, d].into_iter().any(|id| dot(sub(point(m, id), point(m, a)), reference).abs() > 1e-7) {
                continue;
            }
            // Only exported render slivers may vary slightly within the same
            // shared UV chart. The original UVs and source seams stay fixed.
            let uv_tolerance = if native_render && q.min(q2) < 0.001 { 1. / 2048. } else { 0. };
            let compatible_uv = if q < q2 {
                affine(m, other, c, uv_tolerance)
            } else {
                affine(m, old, d, uv_tolerance)
            };
            if !compatible_uv {
                continue;
            }
            let left = [c, d, b];
            let right = [d, c, a];
            let (nl, ql) = quality(m, left);
            let (nr, qr) = quality(m, right);
            let diagonal = (c.min(d), c.max(d));
            if edges.contains_key(&diagonal) || new_edges.contains(&diagonal)
                || dot(reference, nl) < 1. - 1e-10
                || dot(reference, nr) < 1. - 1e-10
                || ql.min(qr) <= q.min(q2) * 1.01 + 1e-10
            {
                continue;
            }
            m.tri_verts[f * 3..f * 3 + 3].copy_from_slice(&left);
            m.tri_verts[g * 3..g * 3 + 3].copy_from_slice(&right);
            changed[f] = true;
            changed[g] = true;
            new_edges.insert(diagonal);
            flips += 1;
        }
        if flips == before {
            break;
        }
    }
    flips
}
/// Condition generated tunnel fans without moving their surface or UV seams.
/// A long boundary beside a nearby concave cut cannot be repaired by repeatedly
/// adding interior points. Bisect its geometric edge on every adjacent face,
/// including aliases with another material/UV, then improve coplanar diagonals.
pub(crate) fn refine_native_needles(m: &mut MeshGL64, maximum: usize, generated_material: u64) -> crate::Result<usize> {
    refine_generated_faces(m, maximum, generated_material, 0., f64::INFINITY)
}

/// At a stock doorway the lining includes short, constrained faces. Once a
/// face fits in five centimeters and survives native import precision, keep
/// its existing chart and boundary. Further subdivision cannot remove the
/// constraint and can create vertices that collapse in Tool.
pub(crate) fn refine_entrance_lining(m: &mut MeshGL64, maximum: usize, generated_material: u64) -> crate::Result<usize> {
    refine_generated_faces(m, maximum, generated_material, 0.05, f64::INFINITY)
}


/// Weld sub-centimetre slivers at the join between generated and stock solids.
/// Stock vertices are fixed. A Boolean cut in a stock face may slide within
/// its original plane and UV chart, even when it meets multiple materials.
pub(crate) fn weld_generated_slivers(mesh: &mut MeshGL64, materials: &[usize], stock_points: &[V]) -> usize {
    const MAX_EDGE: f64 = 0.012;
    const MAX_ALTITUDE: f64 = 0.01;
    const MAX_WELDS: usize = 32;
    let generated = |face: usize| materials.iter().any(|&id| mesh.face_id[face] == id as u64);
    let key = |mesh: &MeshGL64, id| at(mesh, id).map(|coordinate| {
        if coordinate == 0. { 0 } else { coordinate.to_bits() }
    });
    let mut candidates = BTreeMap::new();
    for (index, ids) in mesh.tri_verts.chunks_exact(3).enumerate() {
        if !generated(index) {
            continue;
        }
        let lengths = [0, 1, 2].map(|i| {
            let edge = sub(at(mesh, ids[i]), at(mesh, ids[(i + 1) % 3]));
            dot(edge, edge).sqrt()
        });
        let shortest = (0..3).min_by(|&a, &b| lengths[a].total_cmp(&lengths[b])).unwrap();
        let longest = lengths.into_iter().fold(0., f64::max);
        let quality = face(mesh, [ids[0], ids[1], ids[2]]).1;
        if lengths[shortest] <= MAX_EDGE && quality < 0.03 && quality * longest < MAX_ALTITUDE {
            let a = key(mesh, ids[shortest]);
            let b = key(mesh, ids[(shortest + 1) % 3]);
            if a != b {
                candidates.insert((a.min(b), a.max(b)), ());
            }
        }
    }
    let mut welds = 0;
    for (a, b) in candidates.into_keys().take(64) {
        if welds == MAX_WELDS {
            break;
        }
        if weld_generated_edge(mesh, a, b, materials, stock_points)
            || weld_generated_edge(mesh, b, a, materials, stock_points)
        {
            welds += 1;
        }
    }
    welds
}

fn weld_generated_edge(
    mesh: &mut MeshGL64,
    from: [u64; 3],
    to: [u64; 3],
    materials: &[usize],
    stock_points: &[V],
) -> bool {
    const SOURCE_PLANE_PRECISION: f64 = 0.00001;
    let key = |id| at(mesh, id).map(|value| if value == 0. { 0 } else { value.to_bits() });
    let width = mesh.num_prop as usize;
    let mut incident = Vec::new();
    let mut targets = BTreeMap::<u64, Vec<u64>>::new();
    let mut removed = 0;
    for (i, ids) in mesh.tri_verts.chunks_exact(3).enumerate() {
        let positions = [key(ids[0]), key(ids[1]), key(ids[2])];
        let material = mesh.face_id[i];
        if let Some(j) = positions.iter().position(|p| *p == to) {
            targets.entry(material).or_default().push(ids[j]);
        }
        if let Some(j) = positions.iter().position(|p| *p == from) {
            let stock = !materials.contains(&(material as usize));
            let erase = positions.contains(&to);
            removed += usize::from(erase);
            incident.push((i, j, erase, stock));
        }
    }
    if removed != 2 {
        return false;
    }
    let position = from.map(f64::from_bits);
    let point = to.map(f64::from_bits);
    // A generated intersection close to an anchor can move toward it.
    // Never move an exact or numerically perturbed stock corner away.
    if stock_points.iter().any(|p| {
        let from_delta = sub(*p, position);
        let to_delta = sub(*p, point);
        let from_distance = dot(from_delta, from_delta);
        from_distance <= SOURCE_PLANE_PRECISION * SOURCE_PLANE_PRECISION
            && dot(to_delta, to_delta) >= from_distance
    }) {
        return false;
    }
    let mut changes = BTreeMap::new();
    let mut chart_vertices = Vec::<Vec<f64>>::new();
    let original_vertex_count = mesh.num_vert();
    for (index, corner, erase, stock) in incident {
        if erase {
            changes.insert(index, None);
            continue;
        }
        let start = index * 3;
        let ids = [mesh.tri_verts[start], mesh.tri_verts[start + 1], mesh.tri_verts[start + 2]];
        let property_distance = |target: u64| (3..width).map(|k| {
            (mesh.vert_properties[target as usize * width + k]
                - mesh.vert_properties[ids[corner] as usize * width + k]).abs()
        }).fold(0., f64::max);
        let (normal, _) = face(mesh, ids);
        let on_plane = dot(normal, sub(point, at(mesh, ids[corner]))).abs() <= SOURCE_PLANE_PRECISION;
        if stock && !on_plane { return false; }
        let mut positions = ids.map(|id| at(mesh, id));
        positions[corner] = point;
        let (new_normal, quality) = triangle_quality(positions);
        if quality < 1e-5 || dot(normal, new_normal) < 0.98 { return false; }

        // A geometric vertex may have no property vertex in this UV chart.
        // Reuse a compatible alias or evaluate this face's own affine chart
        // at the welded point. Keep its material and all other UVs exactly.
        let alias = targets.get(&mesh.face_id[index]).and_then(|options| {
            options.iter().copied().filter(|&id| {
                property_distance(id) <= 0.025 && (!stock || affine(mesh, ids, id, 0.000002))
            }).min_by(|&a, &b| property_distance(a).total_cmp(&property_distance(b)))
        });
        let target = if let Some(alias) = alias {
            alias
        } else {
            if !on_plane { return false; }
            let Some(weights) = chart_weights(mesh, ids, point) else { return false; };
            let mut vertex = point.to_vec();
            for property in 3..width {
                let value = chart_property(mesh, ids, weights, property);
                let old = mesh.vert_properties[ids[corner] as usize * width + property];
                if !value.is_finite() || (value - old).abs() > 0.025 { return false; }
                vertex.push(value);
            }
            let target = (original_vertex_count + chart_vertices.len()) as u64;
            chart_vertices.push(vertex);
            target
        };
        let mut welded = ids;
        welded[corner] = target;
        changes.insert(index, Some(welded));
    }

    let mut result = MeshGL64 { num_prop: mesh.num_prop, ..Default::default() };
    let mut compact = BTreeMap::new();
    for (i, ids) in mesh.tri_verts.chunks_exact(3).enumerate() {
        let welded = match changes.get(&i) {
            Some(Some(ids)) => *ids,
            Some(None) => continue,
            None => [ids[0], ids[1], ids[2]],
        };
        for id in welded {
            let compact_id = *compact.entry(id).or_insert_with(|| {
                let new_id = result.num_vert() as u64;
                let index = id as usize;
                if index < original_vertex_count {
                    let start = index * width;
                    result.vert_properties.extend_from_slice(&mesh.vert_properties[start..start + width]);
                } else {
                    result.vert_properties.extend_from_slice(&chart_vertices[index - original_vertex_count]);
                }
                new_id
            });
            result.tri_verts.push(compact_id);
        }
        result.face_id.push(mesh.face_id[i]);
    }
    result.merge();
    let section = manifold_rust::manifold::Manifold::from_mesh_gl64(&result);
    if section.status() != manifold_rust::types::Error::NoError || section.is_empty() {
        return false;
    }
    *mesh = result;
    true
}

/// Keep long standalone connector charts within the native baker's working
/// span; the collision layer is emitted from the original manifold.
pub(crate) fn refine_connector_charts(m: &mut MeshGL64, maximum: usize) -> crate::Result<usize> {
    refine_generated_faces(m, maximum, 0, 0., 64.)
}

fn refine_generated_faces(
    m: &mut MeshGL64, maximum: usize, generated_material: u64, minimum_span: f64, maximum_span: f64,
) -> crate::Result<usize> {
    const QUALITY: f64 = 0.002;
    if m.num_prop < 3 || m.face_id.len() != m.num_tri() {
        return crate::invalid("Native triangle refinement lost source properties");
    }
    let mut splits = 0;
    let mut first_needle = None;
    loop {
        let selected = m.tri_verts.chunks_exact(3).enumerate().find_map(|(index,t)| {
            let vertices = [t[0],t[1],t[2]];
            if m.face_id[index] != generated_material { return None; }
            let points = vertices.map(|id| at(m, id));
            let span_squared = (0..3).map(|edge| {
                let delta = sub(points[edge], points[(edge + 1) % 3]);
                dot(delta, delta)
            }).fold(0., f64::max);
            let too_short_to_split = span_squared <= minimum_span * minimum_span
                && triangle_quality(points.map(crate::bsp_assembly::native_export_point)).1 > 0.;
            (span_squared > maximum_span * maximum_span
                || (!too_short_to_split && triangle_quality(points).1 < QUALITY)).then_some(vertices)
        });
        let Some(t) = selected else { return Ok(splits); };
        let initial = first_needle.get_or_insert_with(|| t.map(|id| at(m, id)));
        let k = (0..3).max_by(|&a,&b| {
            let length = |k:usize| { let d=sub(at(m,t[k]),at(m,t[(k+1)%3]));dot(d,d) };
            length(a).total_cmp(&length(b))
        }).unwrap();
        let endpoints = [at(m,t[k]),at(m,t[(k+1)%3])];
        let direction=sub(endpoints[1],endpoints[0]);
        if dot(direction,direction)<=1e-24 || face(m,t).1<=1e-14 {
            return crate::invalid("Native source contains a degenerate triangle; repair the source surface");
        }
        let adjacent: Vec<_> = m.tri_verts.chunks_exact(3).enumerate().filter_map(|(i,t)| {
            (0..3).find(|&k| {let a=at(m,t[k]);let b=at(m,t[(k+1)%3]);[a,b]==endpoints || [b,a]==endpoints}).map(|k|(i,[t[k],t[(k+1)%3],t[(k+2)%3]]))
        }).collect();
        if adjacent.is_empty() || adjacent.len()>2 { return crate::invalid("Native refinement found a non-manifold edge; repair the source surface"); }
        if m.num_tri().saturating_add(adjacent.len()) > maximum || splits >= 256 {
            return crate::invalid(format!("Native triangle conditioning exceeds the existing BSP budget; simplify the source connection (material {generated_material}, {} triangles, {splits} refinements, quality {:.8}, points {:?}; first unsplit face {initial:?})",m.num_tri(),face(m,t).1,t.map(|id|at(m,id))));
        }
        // Identical geometric edges can have distinct UV vertex identities.
        // Interpolate each identity separately and preserve every face's slot.
        let mut midpoints = BTreeMap::new();
        let offset = m.num_prop as usize;
        for (index,[a,b,c]) in adjacent {
            let midpoint = *midpoints.entry((a.min(b),a.max(b))).or_insert_with(|| {
                let id=m.num_vert() as u64;
                for k in 0..offset { m.vert_properties.push((m.vert_properties[a as usize*offset+k]+m.vert_properties[b as usize*offset+k])*0.5); }
                id
            });
            let material=m.face_id[index];
            m.tri_verts[index*3..index*3+3].copy_from_slice(&[a,midpoint,c]);
            m.tri_verts.extend([midpoint,b,c]);m.face_id.push(material);
        }
        splits += 1;
        improve_material(m, Some(generated_material), false);
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_render_recovers_a_vertex_on_the_shared_diagonal() {
        let mut mesh = MeshGL64 {
            num_prop: 5,
            tri_verts: vec![0, 1, 2, 1, 0, 3],
            face_id: vec![17, 17],
            vert_properties: vec![
                0., 0., 0., 0., 0.,
                4., 0., 0., 1., 0.,
                2., 0., 1e-48, 0.5, 0.,
                2., -4., 0., 0.5, -1.,
            ],
            ..Default::default()
        };
        let original = mesh.vert_properties.clone();
        assert_eq!(improve_at_native_precision(&mut mesh), 1);
        assert_eq!(mesh.vert_properties, original);
        assert_eq!(mesh.face_id, [17, 17]);
        assert_eq!(mesh.tri_verts, [2, 3, 1, 3, 2, 0]);
    }

    #[test]
    fn native_render_retriangulates_the_danger_canyon_radiosity_sliver() {
        // Measured native floor quad from Halo Tool's blue WRL witness.
        let mut input = MeshGL64 {
            num_prop: 5,
            tri_verts: vec![0, 1, 2, 2, 3, 0],
            face_id: vec![65, 65],
            vert_properties: vec![
                -127.265605, 242.831484, -14.702904, 0.244777, 0.336563,
                -127.266943, 239.524141, -14.702904, 0.243454, 0.307545,
                -127.266943, 236.216797, -14.702904, 0.242760, 0.278797,
                -123.854912, 244.438457, -14.702904, 0.217012, 0.351287,
            ],
            ..Default::default()
        };
        let authored = input.vert_properties.clone();
        assert_eq!(improve(&mut input), 0);
        assert_eq!(improve_at_native_precision(&mut input), 1);
        assert_eq!(input.vert_properties, authored);
        assert_eq!(input.face_id, [65, 65]);
        assert!(input.tri_verts.chunks_exact(3).all(|t| face(&input, [t[0], t[1], t[2]]).1 > 0.08));
    }


    #[test]
    fn welds_generated_edge_even_at_a_protected_anchor() {
        let points = [
            [1., 0., 0.], [1., 0.005, 0.], [1., 1., 0.],
            [-1., 1., 0.], [-1., -1., 0.], [1., -1., 0.],
            [0., 0., 1.], [0., 0., -1.],
        ];
        let mut mesh = MeshGL64 { num_prop: 5, ..Default::default() };
        for p in points {
            mesh.vert_properties.extend(p);
            mesh.vert_properties.extend([p[0], p[1]]);
        }
        for i in 0..6 {
            let next = (i + 1) % 6;
            mesh.tri_verts.extend([6, i, next, 7, next, i]);
            mesh.face_id.extend([17, 17]);
        }
        // This face owns the anchor, but not the disposable generated endpoint.
        mesh.face_id[10] = 29;
        let stock = [6, 5, 0].map(|id| at(&mesh, id));
        let faces = mesh.num_tri();
        // An authored short edge may never collapse across a stock face.
        mesh.face_id[2] = 29;
        assert_eq!(weld_generated_slivers(&mut mesh, &[17], &points), 0);
        // A generated intersection borrowed by a stock plane may slide along
        // that plane as long as the original anchor and UV chart stay fixed.
        assert_eq!(weld_generated_slivers(&mut mesh, &[17], &[points[0]]), 1);
        assert_eq!(mesh.num_tri(), faces - 2);
        let (tri, _) = mesh.tri_verts.chunks_exact(3).zip(&mesh.face_id)
            .filter(|(_, slot)| **slot == 29).last().unwrap();
        assert_eq!([tri[0], tri[1], tri[2]].map(|id| at(&mesh, id)), stock);
    }

    #[test]
    fn micron_scale_intersection_is_not_an_authored_anchor() {
        let points = [
            [1., 0., 0.], [1., 0.000003, 0.], [1., 1., 0.],
            [-1., 1., 0.], [-1., -1., 0.], [1., -1., 0.],
            [0., 0., 1.], [0., 0., -1.],
        ];
        let mut mesh = MeshGL64 { num_prop: 5, ..Default::default() };
        for point in points {
            mesh.vert_properties.extend(point);
            mesh.vert_properties.extend(point[..2].iter().copied());
        }
        for edge in 0..6 {
            let next = (edge + 1) % 6;
            mesh.tri_verts.extend([6, edge, next, 7, next, edge]);
            mesh.face_id.extend([17, 17]);
        }
        // The stock face at the generated corner has no target alias in its
        // material. The weld must carry that face's chart onto the anchor.
        mesh.face_id[2] = 29;
        mesh.face_id[10] = 30;
        assert_eq!(weld_generated_slivers(&mut mesh, &[17], &points[..2]), 0);
        assert_eq!(weld_generated_slivers(&mut mesh, &[17], &points[..1]), 1);
        assert!((0..mesh.num_vert() as u64).any(|id| at(&mesh, id) == points[0]));
        assert!((0..mesh.num_vert() as u64).all(|id| at(&mesh, id) != points[1]));
        let stock_face = mesh.face_id.iter().position(|&id| id == 29).unwrap();
        for &id in &mesh.tri_verts[stock_face * 3..stock_face * 3 + 3] {
            let properties = &mesh.vert_properties[id as usize * 5..][..5];
            assert!((properties[0] - properties[3]).abs() < 1e-12);
            assert!((properties[1] - properties[4]).abs() < 1e-12);
        }
    }

    fn needle() -> MeshGL64 {
        let mut m = MeshGL64 {
            num_prop: 5,
            tri_verts: vec![0, 1, 2, 0, 2, 3],
            face_id: vec![0, 0],
            ..Default::default()
        };
        for p in [
            [0., -1., 0.],
            [89.5, 1., 0.],
            [89.75, 1., 0.],
            [89.75, -1., 0.],
        ] {
            m.vert_properties.extend(p);
            m.vert_properties.extend([p[0], p[1]]);
        }
        m
    }
    #[test]
    fn long_floor_needle_is_retriangulated_without_moving_vertices_or_uvs() {
        let mut m = needle();
        let original = m.vert_properties.clone();
        let q = face(&m, [0, 1, 2]).1;
        assert!(improve(&mut m) > 0);
        assert_eq!(m.vert_properties, original);
        assert_eq!(m.face_id, vec![0, 0]);
        assert!(m.tri_verts.chunks_exact(3).all(|t| {
            let (n, quality) = face(&m, [t[0], t[1], t[2]]);
            n[2] < -0.99 && quality > q * 10.
        }));
    }
    #[test]
    fn generated_material_improvement_does_not_touch_another_repairable_surface() {
        let mut m = needle();
        let second = needle();
        m.vert_properties.extend(second.vert_properties);
        m.tri_verts.extend(second.tri_verts.iter().map(|id| id + 4));
        m.face_id = vec![17,17,29,29];
        let positions=m.vert_properties.clone();let other=m.tri_verts[6..].to_vec();
        assert!(improve_material(&mut m, Some(17), false)>0);
        assert_eq!(m.vert_properties,positions);
        assert_eq!(&m.tri_verts[6..],&other);
        assert!(improve_material(&mut m, Some(29), false)>0);
        assert_eq!(m.face_id,vec![17,17,29,29]);
    }
    #[test]
    fn source_material_and_nonplanar_boundaries_are_preserved() {
        let mut m = needle();
        m.face_id[1] = 1;
        assert_eq!(improve(&mut m), 0);
        let mut m = needle();
        m.vert_properties[3 * 5 + 2] = 1.;
        assert_eq!(improve(&mut m), 0);
    }
    #[test]
    fn authored_uv_discontinuities_are_preserved() {
        let mut m = needle();
        m.vert_properties[3 * 5 + 3] += 1.;
        assert_eq!(improve(&mut m), 0);
    }
    #[test]
    fn native_lightmapper_wall_needle_is_refined_without_changing_its_mapping_or_boundary() {
        // Exact failing native tunnel-wall coordinates, converted from Tool's cm.
        let points = [
            [144.02473450, 35.69912338, -20.63878632],
            [144.02473450, 35.69912338, -20.60655022],
            [38.99323654, 35.69912338, -21.07504272],
        ];
        let mut m = MeshGL64 { num_prop: 5, tri_verts: vec![0, 1, 2, 3, 0, 2, 1, 4, 2, 4, 5, 2], face_id: vec![17; 4], ..Default::default() };
        for p in points.into_iter().chain([[points[0][0],points[0][1],points[2][2]],[points[0][0],points[0][1],points[2][2]+1.6],[points[2][0],points[0][1],points[2][2]+1.6]]) { m.vert_properties.extend(p); m.vert_properties.extend([p[0], p[2]]); }
        let original = m.vert_properties.clone();
        let area = |mesh: &MeshGL64| mesh.tri_verts.chunks_exact(3).map(|t| {
            let n = cross(sub(at(mesh, t[1]), at(mesh, t[0])), sub(at(mesh, t[2]), at(mesh, t[0]))); dot(n, n).sqrt()
        }).sum::<f64>();
        let before = area(&m); let orientation = face(&m, [0, 1, 2]).0;
        improve(&mut m);
        assert!(refine_native_needles(&mut m, 150_000, 17).unwrap() > 0);
        assert_eq!(&m.vert_properties[..original.len()], &original);
        assert!((area(&m) - before).abs() < before * 1e-10);
        assert!(m.face_id.iter().all(|&id| id == 17));
        for t in m.tri_verts.chunks_exact(3) {
            let (normal, quality) = face(&m, [t[0], t[1], t[2]]);
            assert!(dot(normal, orientation) > 0.999999 && quality >= 0.002 - 1e-12);
        }
        for v in m.vert_properties.chunks_exact(5) { assert!((v[1] - points[0][1]).abs() < 1e-12); assert_eq!(v[0], v[3]); assert_eq!(v[2], v[4]); }
    }

    #[test]
    fn native_refinement_preserves_nonplanar_material_boundaries_and_their_uv_seam() {
        let points = [
            [144.02473450,35.69912338,-20.63878632], [144.02473450,35.69912338,-20.60655022],
            [38.99323654,35.69912338,-21.07504272], [144.02473450,35.69912338,-21.07504272],
            [144.02473450,35.69912338,-19.47504272], [38.99323654,35.69912338,-19.47504272],
        ];
        let mut m = MeshGL64 {num_prop:5,tri_verts:vec![0,1,2,3,0,2,1,4,2,4,5,2,6,7,8],face_id:vec![17,17,17,17,29],..Default::default()};
        for p in points {m.vert_properties.extend(p);m.vert_properties.extend([p[0],p[2]]);}
        for p in [points[2],points[3],[points[3][0],points[3][1]+2.,points[3][2]]] {m.vert_properties.extend(p);m.vert_properties.extend([100.+p[1],200.+p[0]]);}
        let original=m.vert_properties.clone();
        assert!(refine_native_needles(&mut m,150_000,17).unwrap()>0);
        assert_eq!(&m.vert_properties[..original.len()],&original);
        assert_eq!(m.tri_verts.chunks_exact(3).zip(&m.face_id).filter(|(_,material)|**material==29).map(|(t,_)|t.to_vec()).collect::<Vec<_>>(),vec![vec![6,7,8]]);
        for (t,material) in m.tri_verts.chunks_exact(3).zip(&m.face_id) {for &id in t {
            let v=&m.vert_properties[id as usize*5..id as usize*5+5];let expected=if *material==17 {[v[0],v[2]]}else{[100.+v[1],200.+v[0]]};
            assert!((v[3]-expected[0]).abs()<1e-10&&(v[4]-expected[1]).abs()<1e-10);
        }}
        assert!(m.vert_properties.chunks_exact(5).skip(9).all(|v|v[2]>points[2][2]),"Interior conditioning must not create a boundary T-junction");
    }

    #[test]
    fn native_refinement_refuses_an_unresolved_constrained_strip_in_bounded_work() {
        // Keep the harder rejected repair fixture as an explicit refusal, not
        // a fabricated success or permission to move its original UV seam.
        let mut m=MeshGL64{num_prop:5,tri_verts:vec![0,1,2,0,2,3,0,3,4,0,4,5,6,7,8],face_id:vec![17,17,17,17,29],..Default::default()};
        for (i,p) in [[0.,0.,0.],[100.,0.,0.],[100.,0.,0.02],[100.,0.,0.04],[100.,0.,2.],[0.,0.,2.],[0.,0.,0.],[0.,2.,0.],[100.,0.,0.]].into_iter().enumerate(){m.vert_properties.extend(p);m.vert_properties.extend(if i<6{[p[0],p[2]]}else{[10.+p[1],20.+p[0]]});}
        let original=m.vert_properties.clone();
        assert!(refine_native_needles(&mut m,150_000,17).unwrap_err().to_string().contains("budget"));
        assert_eq!(&m.vert_properties[..original.len()],&original);assert!(m.num_tri()<=5+256*2);
    }
    #[test]
    fn native_arch_roof_sliver_preserves_its_surface_and_uv_seam() {
        // Exact generated roof patch from the original Timberland/Sidewinder
        // arch fixture: six planar faces, not a packaged original map/model.
        let points = [
            [121.59999084472656,46.61436483184136,-17.072433934279417],
            [118.0098652756816,47.44912338256836,-16.34299202201236],
            [121.59999084472656,45.81272202313707,-16.34299202201236],
            [118.16883444601625,48.181174190137234,-17.075042829581236],
            [144.8380639859736,36.0251750099245,-17.075042829581236],
            [140.51961811026098,37.21344297283865,-16.365197732704097],
            [140.9073561041133,37.01230595136674,-16.34299202201236],
            [144.53444338941605,35.359057213879176,-16.34299202201236],
        ];
        let mut m=MeshGL64 { num_prop:5, tri_verts:vec![0,1,2,0,3,1,4,3,0,5,4,0,4,6,7,6,4,5], face_id:vec![17;6], ..Default::default() };
        for p in points { m.vert_properties.extend(p);m.vert_properties.extend([p[0],p[1]]); }
        // The long roof edge is also a boundary of another native material,
        // with different UVs/vertex IDs. Refinement must remain conforming.
        let adjacent=[points[3],points[4],[(points[3][0]+points[4][0])/2.,(points[3][1]+points[4][1])/2.,points[3][2]-1.]];
        for p in adjacent { m.vert_properties.extend(p);m.vert_properties.extend([100.+p[0],200.+p[2]]); }
        m.tri_verts.extend([8,9,10]);m.face_id.push(29);
        let original=m.vert_properties.clone();
        let area=|m:&MeshGL64,material:u64| m.tri_verts.chunks_exact(3).zip(&m.face_id).filter(|(_,id)|**id==material).map(|(t,_)| {let n=cross(sub(at(m,t[1]),at(m,t[0])),sub(at(m,t[2]),at(m,t[0])));dot(n,n).sqrt()*0.5}).sum::<f64>();
        let before=[area(&m,17),area(&m,29)];
        assert!(refine_native_needles(&mut m,150_000,17).unwrap()>0);
        assert_eq!(&m.vert_properties[..original.len()],&original);
        for (i,material) in [17,29].into_iter().enumerate(){assert!((area(&m,material)-before[i]).abs()<1e-7);}
        assert!(m.tri_verts.chunks_exact(3).zip(&m.face_id).filter(|(_,id)|**id==17).all(|(t,_)|face(&m,[t[0],t[1],t[2]]).1>=0.002));
        assert!(m.face_id.iter().filter(|id|**id==29).count()>1,"Shared native boundary must split on both sides");
        for (t,material) in m.tri_verts.chunks_exact(3).zip(&m.face_id){for id in t {
            let v=&m.vert_properties[*id as usize*5..*id as usize*5+5];
            let expected=if *material==17 {[v[0],v[1]]}else{[100.+v[0],200.+v[2]]};
            assert!((v[3]-expected[0]).abs()<1e-10&&(v[4]-expected[1]).abs()<1e-10);
        }}
        let segments = |material:u64| {
            let direction=sub(points[4],points[3]);let length=dot(direction,direction);
            let on_edge=|p:V| {let delta=sub(p,points[3]);let n=cross(delta,direction);dot(n,n)<1e-18 && (-1e-10..=1.+1e-10).contains(&(dot(delta,direction)/length))};
            let mut edges=std::collections::BTreeSet::new();
            for (t,_) in m.tri_verts.chunks_exact(3).zip(&m.face_id).filter(|(_,id)|**id==material) {
                for k in 0..3 {let a=at(&m,t[k]);let b=at(&m,t[(k+1)%3]);if on_edge(a)&&on_edge(b) {let mut key=[a.map(f64::to_bits),b.map(f64::to_bits)];key.sort();edges.insert(key);}}
            }
            edges
        };
        assert!(segments(17).len()>1);
        assert_eq!(segments(17),segments(29),"Distinct UV identities must share exactly the same subdivided geometric boundary");
        assert!(m.num_tri()<=7+256*2);
    }

    #[test]
    fn short_doorway_needle_keeps_its_native_boundary_and_mapping() {
        let points = [
            [949.6651325310145, 137.49211140303748, -15.704373344601434],
            [949.6638940363114, 137.49334989744364, -15.704363481684343],
            [949.6651325310145, 137.49211140303748, -15.704370309857712],
        ];
        let mut mesh = MeshGL64 { num_prop: 5, tri_verts: vec![0, 1, 2], face_id: vec![15], ..Default::default() };
        for point in points {
            mesh.vert_properties.extend(point);
            mesh.vert_properties.extend([point[0], point[2]]);
        }
        let before = mesh.vert_properties.clone();
        assert!(face(&mesh, [0, 1, 2]).1 < 0.002);
        assert_eq!(refine_entrance_lining(&mut mesh, 1, 15).unwrap(), 0);
        assert_eq!(mesh.vert_properties, before);
        assert_eq!(mesh.tri_verts, [0, 1, 2]);
    }

    #[test]
    fn native_refinement_refuses_the_existing_budget_before_mutating_the_mesh() {
        let mut m = needle(); let positions = m.vert_properties.clone(); let indices = m.tri_verts.clone(); let materials = m.face_id.clone();
        assert!(refine_native_needles(&mut m, 2, 0).unwrap_err().to_string().contains("budget"));
        assert_eq!(m.vert_properties, positions);assert_eq!(m.tri_verts,indices);assert_eq!(m.face_id,materials);
    }
}

#[cfg(test)]
mod clipped_render_fan_tests {
    use super::*;

    #[test]
    fn clipped_stock_polygon_avoids_a_native_collapsed_fan() {
        // In Tool's float centimeter coordinates the second vertex lies on
        // the bottom edge. Rotating the fan triangulates both strips.
        let polygon = [
            [945., 140., -15.7],
            [945.02, 140.000001, -15.7],
            [945.10, 140., -15.7],
            [945., 140.10, -15.7],
        ];
        assert_eq!(clipped_render_fan(&polygon), 1);
    }
}

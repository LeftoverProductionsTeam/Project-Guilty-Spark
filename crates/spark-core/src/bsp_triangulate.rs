//! Improve coplanar diagonals before Halo Tool's float importer discards
//! needle triangles. Positions, material boundaries and affine UVs stay fixed.
use manifold_rust::types::MeshGL64;
use std::collections::BTreeMap;
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
    let a = sub(at(m, t[1]), at(m, t[0]));
    let b = sub(at(m, t[2]), at(m, t[0]));
    let n = cross(a, b);
    let size = dot(n, n).sqrt();
    let max = dot(a, a).max(dot(b, b)).max(dot(sub(a, b), sub(a, b)));
    (n.map(|v| v / size.max(1e-30)), size / max.max(1e-30))
}
fn affine(m: &MeshGL64, t: [u64; 3], d: u64) -> bool {
    if m.num_prop == 3 {
        return true;
    }
    let (a, b, c) = (at(m, t[0]), at(m, t[1]), at(m, t[2]));
    let u = sub(b, a);
    let v = sub(c, a);
    let p = sub(at(m, d), a);
    let (uu, uv, vv, pu, pv) = (dot(u, u), dot(u, v), dot(v, v), dot(p, u), dot(p, v));
    let den = uu * vv - uv * uv;
    if den.abs() < 1e-20 {
        return false;
    }
    let x = (vv * pu - uv * pv) / den;
    let y = (uu * pv - uv * pu) / den;
    (3..m.num_prop as usize).all(|k| {
        let value = |id: u64| m.vert_properties[id as usize * m.num_prop as usize + k];
        let projected = value(t[0]) * (1. - x - y) + value(t[1]) * x + value(t[2]) * y;
        (projected - value(d)).abs() < 1e-6 * (1. + value(d).abs())
    })
}
pub(crate) fn improve(m: &mut MeshGL64) -> usize {
    if m.num_prop < 3 || m.face_id.len() != m.num_tri() {
        return 0;
    }
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
            {
                continue;
            }
            let old = [a, b, c];
            let other = [b, a, d];
            let (n, q) = face(m, old);
            let (n2, q2) = face(m, other);
            if dot(n, n2) < 1. - 1e-10
                || dot(sub(at(m, d), at(m, a)), n).abs() > 1e-7
                || !affine(m, old, d)
            {
                continue;
            }
            let left = [c, d, b];
            let right = [d, c, a];
            let (nl, ql) = face(m, left);
            let (nr, qr) = face(m, right);
            if dot(n, nl) < 1. - 1e-10
                || dot(n, nr) < 1. - 1e-10
                || ql.min(qr) <= q.min(q2) * 1.01 + 1e-10
            {
                continue;
            }
            m.tri_verts[f * 3..f * 3 + 3].copy_from_slice(&left);
            m.tri_verts[g * 3..g * 3 + 3].copy_from_slice(&right);
            changed[f] = true;
            changed[g] = true;
            flips += 1;
        }
        if flips == before {
            break;
        }
    }
    flips
}
#[cfg(test)]
mod tests {
    use super::*;
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
}

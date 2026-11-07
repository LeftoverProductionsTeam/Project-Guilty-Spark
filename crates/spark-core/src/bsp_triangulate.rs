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
/// Condition generated tunnel fans for Halo's float lightmapper. An interior
/// point near the short edge permits better coplanar diagonals; blindly bisecting
/// long edges reproduces the acute fan. Original vertices, boundary edges, source
/// materials and affine texture mapping remain unchanged.
pub(crate) fn refine_native_needles(m: &mut MeshGL64, maximum: usize, generated_material: u64) -> crate::Result<usize> {
    const QUALITY: f64 = 0.002;
    if m.num_prop < 3 || m.face_id.len() != m.num_tri() {
        return crate::invalid("Native triangle refinement lost source properties");
    }
    let mut splits = 0;
    loop {
        let selected = m.tri_verts.chunks_exact(3).enumerate().find_map(|(index,t)| {
            (m.face_id[index] == generated_material && face(m,[t[0],t[1],t[2]]).1 < QUALITY)
                .then_some((index,[t[0],t[1],t[2]]))
        });
        let Some((index,t)) = selected else { return Ok(splits); };
        if m.num_tri().saturating_add(2) > maximum || splits >= 256 {
            return crate::invalid("Native triangle conditioning exceeds the existing BSP budget; simplify the source connection");
        }
        let k = (0..3).min_by(|&a,&b| {
            let length = |k:usize| { let d=sub(at(m,t[k]),at(m,t[(k+1)%3]));dot(d,d) };
            length(a).total_cmp(&length(b))
        }).unwrap();
        let [a,b,c] = [t[k],t[(k+1)%3],t[(k+2)%3]];
        let edge = sub(at(m,b),at(m,a)); let short = dot(edge,edge).sqrt();
        let n = cross(edge,sub(at(m,c),at(m,a))); let height = dot(n,n).sqrt()/short;
        if !height.is_finite() || height <= 1e-12 || short <= 1e-12 {
            return crate::invalid("Native source contains a degenerate triangle; repair the source surface");
        }
        let weight = (short*0.5/height).min(0.25);
        let midpoint = m.num_vert() as u64; let offset = m.num_prop as usize;
        for k in 0..offset {
            m.vert_properties.push((1.-weight)*(m.vert_properties[a as usize*offset+k]+m.vert_properties[b as usize*offset+k])*0.5+weight*m.vert_properties[c as usize*offset+k]);
        }
        m.tri_verts[index*3..index*3+3].copy_from_slice(&[a,b,midpoint]);
        m.tri_verts.extend([b,c,midpoint,c,a,midpoint]);m.face_id.extend([generated_material;2]);
        splits += 1; improve(m);
    }
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
    fn native_refinement_refuses_the_existing_budget_before_mutating_the_mesh() {
        let mut m = needle(); let positions = m.vert_properties.clone(); let indices = m.tri_verts.clone(); let materials = m.face_id.clone();
        assert!(refine_native_needles(&mut m, 2, 0).unwrap_err().to_string().contains("budget"));
        assert_eq!(m.vert_properties, positions);assert_eq!(m.tri_verts,indices);assert_eq!(m.face_id,materials);
    }
}

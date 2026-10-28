//! Conservative route checks against real source/compiled triangles. This is
//! geometry validation, not a replacement for Halo's biped physics or walking.
use crate::{bsp_assembly::BspAssembly, invalid, maps::MeshData, Result, SparkError};
type V = [f64; 3];
type Tri = [V; 3];
fn sub(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] - b[i])
}
fn add(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] + b[i])
}
fn mul(a: V, s: f64) -> V {
    a.map(|v| v * s)
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
struct Node {
    low: V,
    high: V,
    children: Option<Box<(Node, Node)>>,
    ids: Vec<usize>,
}
impl Node {
    fn build(triangles: &[Tri], mut ids: Vec<usize>) -> Self {
        let mut low = [f64::INFINITY; 3];
        let mut high = [f64::NEG_INFINITY; 3];
        for id in &ids {
            for p in triangles[*id] {
                for k in 0..3 {
                    low[k] = low[k].min(p[k]);
                    high[k] = high[k].max(p[k]);
                }
            }
        }
        let mut node = Self {
            low,
            high,
            children: None,
            ids: vec![],
        };
        if ids.len() <= 24 {
            node.ids = ids;
            return node;
        }
        let axis = (0..3)
            .max_by(|a, b| (high[*a] - low[*a]).total_cmp(&(high[*b] - low[*b])))
            .unwrap();
        ids.sort_unstable_by(|a, b| {
            let center = |id: usize| triangles[id].iter().map(|p| p[axis]).sum::<f64>();
            center(*a).total_cmp(&center(*b)).then_with(|| a.cmp(b))
        });
        let right = ids.split_off(ids.len() / 2);
        node.children = Some(Box::new((
            Self::build(triangles, ids),
            Self::build(triangles, right),
        )));
        node
    }
    fn query(&self, low: V, high: V, out: &mut Vec<usize>) {
        if (0..3).any(|k| self.high[k] < low[k] || self.low[k] > high[k]) {
            return;
        }
        if let Some(children) = &self.children {
            children.0.query(low, high, out);
            children.1.query(low, high, out);
        } else {
            out.extend(&self.ids);
        }
    }
}
struct Index {
    triangles: Vec<Tri>,
    root: Node,
}
impl Index {
    fn new(mesh: &MeshData) -> Result<Self> {
        if mesh.positions.len() % 3 != 0
            || mesh.indices.len() % 3 != 0
            || mesh.indices.len() > 1_800_000
            || mesh
                .positions
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 4096.)
            || mesh
                .indices
                .iter()
                .any(|id| *id as usize >= mesh.positions.len() / 3)
        {
            return invalid("Compiled route geometry is malformed or exceeds its clearance budget");
        }
        if mesh.indices.is_empty() {
            return invalid("No collision triangles are available for this connection");
        }
        let triangles: Vec<Tri> = mesh
            .indices
            .chunks_exact(3)
            .map(|t| {
                std::array::from_fn(|v| {
                    std::array::from_fn(|k| mesh.positions[t[v] as usize * 3 + k] as f64)
                })
            })
            .collect();
        let root = Node::build(&triangles, (0..triangles.len()).collect());
        Ok(Self { triangles, root })
    }
    fn floor(&self, at: V, scratch: &mut Vec<usize>) -> Option<f64> {
        scratch.clear();
        self.root.query(
            [at[0] - 1e-5, at[1] - 1e-5, at[2] - 2.],
            [at[0] + 1e-5, at[1] + 1e-5, at[2] + 0.12],
            scratch,
        );
        let mut best: Option<f64> = None;
        for id in scratch.iter() {
            let p = self.triangles[*id];
            let n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
            let length = dot(n, n).sqrt();
            if length < 1e-12 || n[2] / length < 0.65 {
                continue;
            }
            let z = p[0][2] - (n[0] * (at[0] - p[0][0]) + n[1] * (at[1] - p[0][1])) / n[2];
            if z > at[2] + 0.12 || z < at[2] - 2. {
                continue;
            }
            let test = [at[0], at[1], z];
            if dot(sub(closest(test, p), test), sub(closest(test, p), test)) < 1e-10 {
                best = Some(best.map_or(z, |v| v.max(z)));
            }
        }
        best
    }
    fn clear(&self, point: V, radius: f64, scratch: &mut Vec<usize>) -> bool {
        scratch.clear();
        self.root.query(
            point.map(|v| v - radius),
            point.map(|v| v + radius),
            scratch,
        );
        scratch.iter().all(|id| {
            let delta = sub(point, closest(point, self.triangles[*id]));
            dot(delta, delta) >= (radius - 0.002).powi(2)
        })
    }
}
// Closest-point region tests include edges and vertices, so a thin obstacle at
// a triangle seam cannot disappear from a plane-only clearance test.
fn closest(p: V, t: Tri) -> V {
    let [a, b, c] = t;
    let ab = sub(b, a);
    let ac = sub(c, a);
    let ap = sub(p, a);
    let d1 = dot(ab, ap);
    let d2 = dot(ac, ap);
    if d1 <= 0. && d2 <= 0. {
        return a;
    }
    let bp = sub(p, b);
    let d3 = dot(ab, bp);
    let d4 = dot(ac, bp);
    if d3 >= 0. && d4 <= d3 {
        return b;
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0. && d1 >= 0. && d3 <= 0. {
        return add(a, mul(ab, d1 / (d1 - d3)));
    }
    let cp = sub(p, c);
    let d5 = dot(ab, cp);
    let d6 = dot(ac, cp);
    if d6 >= 0. && d5 <= d6 {
        return c;
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0. && d2 >= 0. && d6 <= 0. {
        return add(a, mul(ac, d2 / (d2 - d6)));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0. && (d4 - d3) >= 0. && (d5 - d6) >= 0. {
        return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    }
    let denominator = va + vb + vc;
    if denominator.abs() < 1e-24 {
        return a;
    }
    add(a, add(mul(ab, vb / denominator), mul(ac, vc / denominator)))
}
pub(crate) fn verify_route(mesh: &MeshData, assembly: &BspAssembly) -> Result<usize> {
    assembly.validate()?;
    let index = Index::new(mesh)?;
    let mut scratch = vec![];
    let mut samples = 0;
    let mut previous: Option<f64> = None;
    for pair in assembly.tunnel_points.windows(2) {
        let (a, b) = (pair[0].map(f64::from), pair[1].map(f64::from));
        let d = sub(b, a);
        let steps = (dot(d, d).sqrt() / 0.25).ceil() as usize;
        for step in 0..=steps {
            let p = add(a, mul(d, step as f64 / steps as f64));
            let z=index.floor(p,&mut scratch).ok_or_else(||SparkError::Invalid(format!("Tunnel floor is not continuous near {:.2}, {:.2}, {:.2}; adjust its floor points",p[0],p[1],p[2])))?;
            if previous.is_some_and(|old| (z - old).abs() > 0.12) {
                return invalid(
                    "Tunnel floor has a step higher than 0.12 world units; add a ramp waypoint",
                );
            }
            previous = Some(z);
            for height in [0.20, 0.36, 0.52] {
                if !index.clear([p[0], p[1], z + height], 0.18, &mut scratch) {
                    return invalid("The connection contains a wall, narrow edge or insufficient biped head clearance; adjust the tunnel path");
                }
            }
            samples += 1;
        }
    }
    Ok(samples)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::Source;
    fn plan() -> BspAssembly {
        BspAssembly {
            schema_version: 1,
            donor_project_id: uuid::Uuid::nil().to_string(),
            donor_title: "Synthetic room".into(),
            donor_source: Source {
                original_path: "synthetic.map".into(),
                preserved_path: "synthetic.map".into(),
                sha256: "a".repeat(64),
                cache_version: 13,
                engine: "synthetic fixture".into(),
                scenario_path: "fixture".into(),
                archive: None,
                resource_directory: None,
                resource_sha256: Default::default(),
            },
            donor_tags_directory: "fixture-tags".into(),
            donor_bsp_index: 0,
            translation: [0.; 3],
            yaw_degrees: 0.,
            tunnel_points: vec![[0.5, 0., 0.], [9.5, 0., 0.]],
            tunnel_width: 2.,
            tunnel_height: 1.6,
            tunnel_shader_path: "fixture/stone".into(),
        }
    }
    fn quad(mesh: &mut MeshData, p: [V; 4]) {
        let at = mesh.positions.len() / 3;
        for v in p {
            mesh.positions.extend(v.map(|x| x as f32));
        }
        mesh.indices.extend([
            at as u32,
            at as u32 + 1,
            at as u32 + 2,
            at as u32,
            at as u32 + 2,
            at as u32 + 3,
        ]);
    }
    fn corridor(width: f64, height: f64) -> MeshData {
        let mut m = MeshData::default();
        let w = width / 2.;
        quad(
            &mut m,
            [[0., -w, 0.], [10., -w, 0.], [10., w, 0.], [0., w, 0.]],
        );
        quad(
            &mut m,
            [
                [0., -w, height],
                [0., w, height],
                [10., w, height],
                [10., -w, height],
            ],
        );
        quad(
            &mut m,
            [
                [0., -w, 0.],
                [0., -w, height],
                [10., -w, height],
                [10., -w, 0.],
            ],
        );
        quad(
            &mut m,
            [[0., w, 0.], [10., w, 0.], [10., w, height], [0., w, height]],
        );
        m
    }
    #[test]
    fn actual_clear_route_and_blocked_door_are_distinguished() {
        let mut m = corridor(2., 1.6);
        assert!(verify_route(&m, &plan()).unwrap() > 30);
        quad(
            &mut m,
            [[5., -1., 0.], [5., 1., 0.], [5., 1., 1.6], [5., -1., 1.6]],
        );
        assert!(verify_route(&m, &plan())
            .unwrap_err()
            .to_string()
            .contains("clearance"));
    }
    #[test]
    fn capsule_checks_head_and_sides_instead_of_only_the_camera() {
        assert!(verify_route(&corridor(2., 0.65), &plan()).is_err());
        assert!(verify_route(&corridor(0.30, 1.6), &plan()).is_err());
    }
    #[test]
    fn missing_floor_and_invalid_collision_never_pass() {
        let mut m = corridor(2., 1.6);
        m.indices.drain(0..6);
        assert!(verify_route(&m, &plan()).is_err());
        let mut m = corridor(2., 1.6);
        m.indices[0] = u32::MAX;
        assert!(verify_route(&m, &plan()).is_err());
    }
    #[test]
    fn unreasonable_paths_and_nonfinite_points_are_rejected() {
        let mut p = plan();
        p.tunnel_points[1][2] = 20.;
        assert!(p.validate().is_err());
        p = plan();
        p.tunnel_points[0][1] = f64::NAN;
        assert!(p.validate().is_err());
    }
    #[test]
    fn abrupt_drops_are_not_certified_as_bidirectional_walkthroughs() {
        let mut m = corridor(2., 1.6);
        m.indices.drain(0..6);
        quad(
            &mut m,
            [[0., -1., 0.], [5., -1., 0.], [5., 1., 0.], [0., 1., 0.]],
        );
        quad(
            &mut m,
            [
                [5., -1., -0.4],
                [10., -1., -0.4],
                [10., 1., -0.4],
                [5., 1., -0.4],
            ],
        );
        assert!(verify_route(&m, &plan())
            .unwrap_err()
            .to_string()
            .contains("step"));
    }
}

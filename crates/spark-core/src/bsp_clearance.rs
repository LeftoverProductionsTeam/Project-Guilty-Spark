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
    planes: Vec<(V, f64)>,
    root: Node,
}
impl Index {
    fn new(mesh: &MeshData, indices: &[u32]) -> Result<Self> {
        if mesh.positions.len() % 3 != 0
            || indices.len() % 3 != 0
            || indices.len() > 1_800_000
            || mesh
                .positions
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 4096.)
            || indices.iter().any(|id| *id as usize >= mesh.positions.len() / 3)
        {
            return invalid("Compiled route geometry is malformed or exceeds its clearance budget");
        }
        if indices.is_empty() {
            return invalid("No collision triangles are available for this connection");
        }
        let triangles: Vec<Tri> = indices.chunks_exact(3)
            .map(|t| {
                std::array::from_fn(|v| {
                    std::array::from_fn(|k| mesh.positions[t[v] as usize * 3 + k] as f64)
                })
            })
            .collect();
        let root = Node::build(&triangles, (0..triangles.len()).collect());
        let planes = triangles.iter().map(|p| { let n = cross(sub(p[1],p[0]),sub(p[2],p[0])); (n,dot(n,n)) }).collect();
        Ok(Self { triangles, planes, root })
    }
    fn floor(&self, at: V, scratch: &mut Vec<usize>) -> Option<f64> {
        self.floor_in_range(at,scratch,2.,0.12)
    }
    fn floor_in_range(&self,at:V,scratch:&mut Vec<usize>,drop:f64,rise:f64)->Option<f64>{
        scratch.clear();
        self.root.query(
            [at[0] - 1e-5, at[1] - 1e-5, at[2] - drop],
            [at[0] + 1e-5, at[1] + 1e-5, at[2] + rise],
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
            if z > at[2] + rise || z < at[2] - drop {
                continue;
            }
            let test = [at[0], at[1], z];
            if dot(sub(closest(test, p), test), sub(closest(test, p), test)) < 1e-10 {
                best = Some(best.map_or(z, |v| v.max(z)));
            }
        }
        best
    }
    fn nearby_surface(&self,at:V,range:f64)->Option<f64>{
        let mut ids=vec![];self.root.query([at[0]-1e-5,at[1]-1e-5,at[2]-range],[at[0]+1e-5,at[1]+1e-5,at[2]+range],&mut ids);
        let mut best:Option<f64>=None;
        for id in ids{let triangle=self.triangles[id];let(normal,square)=self.planes[id];if square<1e-20||normal[2].abs()<1e-12{continue;}
            let z=triangle[0][2]-(normal[0]*(at[0]-triangle[0][0])+normal[1]*(at[1]-triangle[0][1]))/normal[2];
            if !z.is_finite()||(z-at[2]).abs()>range{continue;}let point=[at[0],at[1],z];let delta=sub(closest(point,triangle),point);
            if dot(delta,delta)<1e-10&&best.is_none_or(|old|(z-at[2]).abs()<(old-at[2]).abs()){best=Some(z);}
        }best
    }
    fn floor_diagnostic(&self,at:V)->String {
        let mut ids=vec![];self.root.query([at[0]-0.3,at[1]-0.3,at[2]-4.],[at[0]+0.3,at[1]+0.3,at[2]+4.],&mut ids);
        let mut near=ids.into_iter().map(|id|{let p=self.triangles[id];let d=sub(closest(at,p),at);(dot(d,d),id)}).collect::<Vec<_>>();
        near.sort_by(|a,b|a.0.total_cmp(&b.0));
        let rows=near.into_iter().take(3).map(|(distance,id)|{let p=self.triangles[id];let (n,square)=self.planes[id];serde_json::json!({"distance":distance.sqrt(),"up":n[2]/square.sqrt().max(1e-30),"points":p})}).collect::<Vec<_>>();
        format!("{} nearby triangles; closest {}",rows.len(),serde_json::to_string(&rows).unwrap_or_default())
    }
    fn clear_segment(&self,a:V,b:V,radius:f64,scratch:&mut Vec<usize>)->bool {self.blocking_triangle(a,b,radius,scratch).is_none()}
    fn blocking_triangle(&self, a: V, b: V, radius: f64, scratch: &mut Vec<usize>) -> Option<Tri> {
        scratch.clear();
        self.root.query(
            std::array::from_fn(|k| a[k].min(b[k]) - radius),
            std::array::from_fn(|k| a[k].max(b[k]) + radius),
            scratch,
        );
        scratch.iter().find_map(|id| {
            let (n, length_squared) = self.planes[*id];
            let da = dot(n, sub(a, self.triangles[*id][0]));
            let db = dot(n, sub(b, self.triangles[*id][0]));
            // Plane distance is a conservative lower bound. Most floor/wall
            // candidates can avoid the exact segment/triangle region tests.
            if length_squared > 1e-20 && da * db > 0.
                && (da * da).min(db * db) >= (radius - 0.002).powi(2) * length_squared { return None; }
            (segment_triangle_distance(a, b, self.triangles[*id]) < (radius - 0.002).powi(2)).then_some(self.triangles[*id])
        })
    }
}
fn segment_distance(a: V, b: V, c: V, d: V) -> f64 {
    let u = sub(b, a); let v = sub(d, c); let r = sub(a, c);
    let aa = dot(u, u); let ee = dot(v, v); let ff = dot(v, r);
    let (s, t) = if aa <= 1e-20 && ee <= 1e-20 { (0., 0.) }
    else if aa <= 1e-20 { (0., (ff / ee).clamp(0., 1.)) }
    else {
        let cc = dot(u, r);
        if ee <= 1e-20 { ((-cc / aa).clamp(0., 1.), 0.) }
        else {
            let bb = dot(u, v); let denominator = aa * ee - bb * bb;
            let mut s = if denominator > 1e-20 { ((bb * ff - cc * ee) / denominator).clamp(0., 1.) } else { 0. };
            let mut t = (bb * s + ff) / ee;
            if t < 0. { t = 0.; s = (-cc / aa).clamp(0., 1.); }
            else if t > 1. { t = 1.; s = ((bb - cc) / aa).clamp(0., 1.); }
            (s, t)
        }
    };
    let delta = sub(add(a, mul(u, s)), add(c, mul(v, t)));
    dot(delta, delta)
}
fn triangle_crossing(a: V, direction: V, triangle: Tri, normal: V) -> Option<f64> {
    let denominator = dot(normal, direction);
    if denominator.abs() <= 1e-20 { return None; }
    let t = dot(normal, sub(triangle[0], a)) / denominator;
    if !(0. ..=1.).contains(&t) { return None; }
    let point = add(a, mul(direction, t));
    let delta = sub(point, closest(point, triangle));
    (dot(delta, delta) < 1e-16).then_some(t)
}
fn segment_triangle_distance(a: V, b: V, triangle: Tri) -> f64 {
    let normal = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]));
    if triangle_crossing(a, sub(b, a), triangle, normal).is_some() { return 0.; }
    let distance = |p| { let delta = sub(p, closest(p, triangle)); dot(delta, delta) };
    (0..3).map(|k| segment_distance(a, b, triangle[k], triangle[(k + 1) % 3]))
        .fold(distance(a).min(distance(b)), f64::min)
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
pub(crate) struct RouteChecker { index: Index }
impl RouteChecker {
    pub(crate) fn new(mesh: &MeshData) -> Result<Self> { Ok(Self { index: Index::new(mesh, &mesh.indices)? }) }

    pub(crate) fn for_part(mesh: &MeshData, index: usize) -> Result<Self> {
        let part = mesh.parts.get(index).ok_or_else(|| SparkError::Invalid("Missing compiled partition collision".into()))?;
        let indices = part.index_start.checked_add(part.index_count)
            .and_then(|end| mesh.indices.get(part.index_start..end))
            .ok_or_else(|| SparkError::Invalid("Compiled partition exceeds its collision index bounds".into()))?;
        Ok(Self { index: Index::new(mesh, indices)? })
    }
    /// Independent triangle projection for native ground-bound waypoint review.
    /// The compiler remains authoritative for collision-surface/cluster binding.
    pub(crate) fn native_surface_z(&self,point:[f32;3])->Option<f32>{self.index.nearby_surface(point.map(f64::from),0.5).map(|z|z as f32)}
    /// Closest upward-facing ground below the requested point, never an upward
    /// teleport or an assertion of native navigation/vehicle clearance.
    pub(crate) fn native_ground_z(&self,point:[f32;3],drop:f32)->Option<f32>{
        if !drop.is_finite()||!(0.5..=64.).contains(&drop)||point.iter().any(|v|!v.is_finite()||v.abs()>1e6){return None;}
        self.index.floor_in_range(point.map(f64::from),&mut vec![],f64::from(drop),0.).map(|z|z as f32)
    }
    /// Earliest two-sided crossing of a collision triangle along a straight
    /// centerline. An endpoint on ground and coplanar travel are separate.
    pub(crate) fn native_route_crossing(
        &self,
        from: [f32; 3],
        to: [f32; 3],
        scratch: &mut Vec<usize>,
        budget: &mut usize,
    ) -> Result<Option<f64>> {
        let (a, b) = (from.map(f64::from), to.map(f64::from));
        let direction = sub(b, a);
        let length = dot(direction, direction).sqrt();
        let end_trim = 0.001 / length;
        if end_trim >= 0.5 { return Ok(None); }
        scratch.clear();
        self.index.root.query(
            std::array::from_fn(|k| a[k].min(b[k]) - 1e-8),
            std::array::from_fn(|k| a[k].max(b[k]) + 1e-8),
            scratch,
        );
        *budget = budget.checked_sub(scratch.len()).ok_or_else(||
            SparkError::Invalid("Route leg review exceeds its collision budget. Review a shorter route.".into())
        )?;
        Ok(scratch.iter().filter_map(|id| {
            let fraction = triangle_crossing(a, direction, self.index.triangles[*id], self.index.planes[*id].0)?;
            (fraction > end_trim && fraction < 1. - end_trim).then_some(fraction)
        }).min_by(f64::total_cmp))
    }
    /// Static standing-capsule check, not a native movement/scenery test.
    pub(crate) fn verify_start(&self, position: V) -> Result<f64> {
        if position.iter().any(|v| !v.is_finite() || v.abs() > 4096.) {
            return invalid("Player start has nonfinite or unsupported coordinates");
        }
        let mut scratch = vec![];
        let floor = self.index.floor(position, &mut scratch)
            .ok_or_else(|| SparkError::Invalid("Player start has no nearby supporting BSP floor".into()))?;
        if position[2] < floor - 0.02 || position[2] - floor > 0.25 {
            return invalid("Player start is embedded in or too far above its supporting BSP floor");
        }
        for height in [0.20, 0.36, 0.52] {
            let p = [position[0], position[1], floor + height];
            if !self.index.clear_segment(p, p, 0.18, &mut scratch) {
                return invalid("Player start standing capsule intersects BSP walls or ceiling");
            }
        }
        Ok(floor)
    }
    /// Sample the same world points in each separately resident BSP.
    pub(crate) fn floor_profile(&self, [start, end]: [V; 2]) -> Result<Vec<f64>> {
        let delta = sub(end, start);
        let steps = (dot(delta, delta).sqrt() / 0.25).ceil() as usize;
        if !(1..=128).contains(&steps) {
            return invalid("The shared passage exceeds its overlap review budget");
        }
        let mut scratch = vec![];
        (0..=steps).map(|step| {
            let point = add(start, mul(delta, step as f64 / steps as f64));
            self.index.floor(point, &mut scratch).ok_or_else(|| SparkError::Invalid(format!(
                "Shared passage has no floor in this BSP at {:.3}, {:.3}, {:.3}", point[0], point[1], point[2],
            )))
        }).collect()
    }
    pub(crate) fn verify(&self, assembly: &BspAssembly) -> Result<usize> {
        Ok(self.verify_details(assembly)?.iter().map(|route|route.walk_samples).sum())
    }
    pub(crate) fn verify_return(&self, assembly: &BspAssembly) -> Result<usize> {
        Ok(self.verify_details_in_order(assembly, true)?.iter().map(|route| route.walk_samples).sum())
    }
    pub(crate) fn verify_land_bridge(&self, bridge: &BspAssembly) -> Result<[usize; 2]> {
        bridge.validate()?;
        let forward = self.verify_one(bridge, true)?;
        let mut returning = bridge.clone();
        returning.tunnel_points.reverse();
        Ok([forward, self.verify_one(&returning, true)?])
    }
    pub(crate) fn verify_details(&self, assembly: &BspAssembly) -> Result<Vec<crate::bsp_assembly::RouteClearance>> {
        self.verify_details_in_order(assembly, false)
    }
    fn verify_details_in_order(&self, assembly: &BspAssembly, reverse: bool) -> Result<Vec<crate::bsp_assembly::RouteClearance>> {
        assembly.validate()?;
        assembly.connection_routes().into_iter().enumerate().map(|(index, mut route)| {
            let label = assembly.route_label(index);
            // Direction changes the sample order. The authored seam must still
            // keep its original orientation for boundary and material validation.
            if reverse { route.tunnel_points.reverse(); }
            self.verify_one(&route, label == "High-ground route").map(|walk_samples|crate::bsp_assembly::RouteClearance {
                label:label.into(),width:route.tunnel_width,clear_height:route.tunnel_height,walk_samples,
            }).map_err(|e| SparkError::Invalid(format!("{label}: {e}")))
        }).collect()
    }
    fn verify_one(&self, assembly: &BspAssembly, strict_floor: bool) -> Result<usize> {
    let index = &self.index;
    let mut scratch = vec![];
    let mut samples = 0;
    let mut previous: Option<(V, f64)> = None;
    // Match the same mitered cross sections used by the ridge solid. A lane
    // sampled at a segment's perpendicular can cross onto the next graded
    // segment near a turn and compare the next ramp height to the old one.
    let lane_sides = (strict_floor && assembly.tunnel_width >= 6.)
        .then(|| crate::bsp_assembly::tunnel_sides(&assembly.tunnel_points, 3.))
        .transpose()?;
    for (segment, pair) in assembly.tunnel_points.windows(2).enumerate() {
        let (a, b) = (pair[0].map(f64::from), pair[1].map(f64::from));
        let d = sub(b, a);
        let steps = (dot(d, d).sqrt() / 0.25).ceil() as usize;
        for step in 0..=steps {
            let t = step as f64 / steps as f64;
            let p = add(a, mul(d, t));
            let z=index.floor(p,&mut scratch).ok_or_else(||SparkError::Invalid(format!("Tunnel floor is not continuous in segment {} near {:.2}, {:.2}, {:.2}; adjust its floor points ({})",segment + 1,p[0],p[1],p[2],index.floor_diagnostic(p))))?;
            // A nearby lower road cannot stand in for a canyon-top route.
            if strict_floor && (z-p[2]).abs() > 0.12 {
                return invalid(format!("The canyon-top floor is {:.2} units below its authored route near {:.2}, {:.2}; align the ridge with real supported terrain, not the lower passage",p[2]-z,p[0],p[1]));
            }
            if let Some(sides) = &lane_sides {
                let lateral = add(sides[segment], mul(sub(sides[segment + 1], sides[segment]), t));
                // A centerline can cross a narrow triangle or hide a tear
                // under one wheel. Review both sides at the same elevation.
                for sign in [-1., 1.] {
                    let point = add([p[0], p[1], z], mul(lateral, sign));
                    if index.floor_in_range(point, &mut scratch, 0.30, 0.30).is_none() {
                        return invalid(format!(
                            "Canyon-top deck loses lateral floor support near {:.2}, {:.2}, {:.2}. Fill the tear or move the ridge onto a wider floor.",
                            point[0], point[1], point[2],
                        ));
                    }
                }
            }
            if previous.is_some_and(|(_, old)| (z - old).abs() > 0.12) {
                return invalid(format!(
                    "Tunnel floor has a step higher than 0.12 world units in segment {} near {:.2}, {:.2}, {:.2}; add a ramp waypoint",
                    segment + 1, p[0], p[1], z,
                ));
            }
            for height in [0.20, 0.36, 0.52] {
                let (old, old_floor) = previous.unwrap_or((p, z));
                // A permitted small step lifts the body before it advances.
                // Check that lift, the full horizontal sweep and the descent;
                // interpolating through a curb would reject a walkable step.
                let raised = z.max(old_floor) + height;
                let from = [old[0], old[1], old_floor + height];
                let high_from = [old[0], old[1], raised];
                let high_to = [p[0], p[1], raised];
                let to = [p[0], p[1], z + height];
                if (old_floor + height < raised - 1e-10 && !index.clear_segment(from, high_from, 0.18, &mut scratch))
                    || !index.clear_segment(high_from, high_to, 0.18, &mut scratch)
                    || (z + height < raised - 1e-10 && !index.clear_segment(high_to, to, 0.18, &mut scratch)) {
                    let blocker=index.blocking_triangle(high_from,high_to,0.18,&mut scratch).or_else(||index.blocking_triangle(from,high_from,0.18,&mut scratch)).or_else(||index.blocking_triangle(high_to,to,0.18,&mut scratch));
                    return invalid(format!("The connection contains a wall, narrow edge or insufficient biped head clearance in segment {} near {:.2}, {:.2}, {:.2}; adjust the tunnel path. Blocking source triangle: {:?}", segment + 1, p[0], p[1], z,blocker));
                }
            }
            previous = Some((p, z));
            samples += 1;
        }
    }
    Ok(samples)
    }
}
pub(crate) fn verify_route(mesh: &MeshData, assembly: &BspAssembly) -> Result<usize> {
    assembly.validate()?;
    RouteChecker::new(mesh)?.verify(assembly)
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_flight_centerline_finds_nearest_bsp_crossing_in_either_direction() {
        let mesh = MeshData {
            positions: vec![2., -1., -1., 2., 1., -1., 2., 0., 1., 1., -1., -1., 1., 1., -1., 1., 0., 1.],
            indices: vec![0, 1, 2, 3, 4, 5],
            ..Default::default()
        };
        let checker = RouteChecker::new(&mesh).unwrap();
        let mut scratch = Vec::new();
        let mut budget = 32;
        let a = [0., 0., 0.];
        let b = [3., 0., 0.];
        assert_eq!(checker.native_route_crossing(a, b, &mut scratch, &mut budget).unwrap(), Some(1. / 3.));
        assert_eq!(checker.native_route_crossing(b, a, &mut scratch, &mut budget).unwrap(), Some(1. / 3.));
        assert_eq!(checker.native_route_crossing(a, [1., 0., 0.], &mut scratch, &mut budget).unwrap(), None);
        assert_eq!(checker.native_route_crossing([0., 0., 2.], [3., 0., 2.], &mut scratch, &mut budget).unwrap(), None);
        assert_eq!(checker.native_route_crossing(a, a, &mut scratch, &mut budget).unwrap(), None);
        assert!(checker.native_route_crossing(a, b, &mut scratch, &mut 0).is_err());
    }
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
                audio_resources: None,
            },
            donor_tags_directory: "fixture-tags".into(),
            donor_bsp_index: 0,
            base_bsp_index: 0,
            separate_native_bsps: false,
            preserve_donor_bsp: false,
            tunnel_bake_fill: false,
            include_donor_scenery: false,
            translation: [0.; 3],
            yaw_degrees: 0.,
            tunnel_points: vec![[0.5, 0., 0.], [9.5, 0., 0.]],
            tunnel_width: 2.,
            tunnel_height: 1.6,
            tunnel_shader_path: "fixture/stone".into(),
            open_road: false,
            infantry_tunnel: None,
            high_ground: None,
            terrain_seam: None,
            sections:vec![],arch_segments:None,
            visibility_zones: vec![],
            native_seals: vec![],
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
        let error = verify_route(&m, &plan()).unwrap_err().to_string();
        assert!(error.contains("clearance in segment 1 near 5.00, 0.00, 0.00"), "{error}");
    }
    #[test]
    fn return_sampling_keeps_the_authored_terrain_orientation() {
        let mut road = plan();
        road.open_road = true;
        road.tunnel_width = 6.;
        road.tunnel_height = 4.;
        road.terrain_seam = Some(crate::bsp_assembly::TerrainSeam {
            shoulder_width: 8.,
            bank_height: 0.,
            base_shader_path: "fixture/grass".into(),
            donor_shader_path: "fixture/snow".into(),
        });
        let mesh = corridor(road.tunnel_width.into(), road.tunnel_height.into());
        let checker = RouteChecker::new(&mesh).unwrap();
        assert_eq!(checker.verify(&road).unwrap(), checker.verify_return(&road).unwrap());
        road.tunnel_points.reverse();
        assert!(checker.verify_return(&road).unwrap_err().to_string().contains("east/west boundaries"));
    }
    #[test]
    fn saved_assembly_can_reopen_a_compiled_mcc_world_with_inherited_connections() {
        let mut source = plan().donor_source;
        source.cache_version = 13;
        let mut project = crate::project::Project::new("Retained MCC world");
        project.source = Some(source);
        project.inherited_bsp_connections.push(plan());
        let serialized = serde_json::to_vec(&project).unwrap();
        let mut reopened: crate::project::Project = serde_json::from_slice(&serialized).unwrap();
        reopened.validate().unwrap();
        reopened.source.as_mut().unwrap().cache_version = 7;
        assert!(reopened.validate().is_err());
    }
    #[test]
    #[ignore = "Read-only survey of the exact retained Derelict connector after the Forerunner approach test"]
    fn derelict_native_approach_capsule_survey() {
        let path = std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_DERELICT_CACHE").unwrap());
        let map = crate::maps::inspect_map(&path, None).unwrap();
        assert_eq!(map.sha256, "cec966dc2c258bc37e2756c078fc8507d83bb6bb71c9bc3e4db1a27d52dc7df8");
        let (mesh, _) = crate::maps::collision_source(&path, &map).unwrap();
        let center = [784.9712407987176, 104.96808922299356, -31.898722330729164];
        let near = |along, side| add(center, [along * 0.707106781 - side * 0.707106781, along * 0.707106781 + side * 0.707106781, 0.]);
        for slot in [2usize, 3] {
            let checker = RouteChecker::for_part(&mesh, slot).unwrap();
            let mut scratch = vec![];
            let sweep = |name, start: V, end: V, checker: &RouteChecker, scratch: &mut Vec<usize>| {
                let hits = [0.20, 0.36, 0.52].map(|height| {
                    checker.index.blocking_triangle(add(start, [0., 0., height]), add(end, [0., 0., height]), 0.18, scratch)
                });
                eprintln!("Derelict BSP {slot} {name}: {hits:?}");
            };
            sweep("center", near(-2.3, 0.), near(2.3, 0.), &checker, &mut scratch);
            sweep("near right edge", near(-2.3, -0.8), near(2.3, -0.8), &checker, &mut scratch);
            sweep("near left edge", near(-2.3, 0.8), near(2.3, 0.8), &checker, &mut scratch);
            for (name, stop) in [("actual center approach stop", [784.721, 103.587, -31.899]),
                ("actual offset approach stop", [783.435, 104.353, -31.899])] {
                sweep(name, stop, add(stop, [0.5, 0.5, 0.]), &checker, &mut scratch);
            }
        }
        assert_eq!(crate::maps::hash_file(&path).unwrap(), map.sha256);
    }

    #[test]
    fn capsule_checks_head_and_sides_instead_of_only_the_camera() {
        assert!(verify_route(&corridor(2., 0.65), &plan()).is_err());
        assert!(verify_route(&corridor(0.30, 1.6), &plan()).is_err());
    }
    #[test]
    fn native_surface_anchors_are_separate_from_standing_capsule_clearance(){
        let mesh=corridor(2.,1.6);let checker=RouteChecker::new(&mesh).unwrap();
        for z in [-0.25f32,0.,0.25,0.5]{assert_eq!(checker.native_surface_z([5.,0.,z]),Some(0.));}
        assert_eq!(checker.native_surface_z([5.,0.,0.5001]),None);assert_eq!(checker.native_surface_z([11.,0.,0.]),None);
        assert!(checker.verify_start([5.,0.,0.5]).is_err());
    }
    #[test]
    fn ground_projection_is_bounded_downward_up_facing_and_selects_the_nearest_floor(){
        let mut mesh=corridor(2.,10.);
        let checker=RouteChecker::new(&mesh).unwrap();
        assert_eq!(checker.native_ground_z([5.,0.,8.],16.),Some(0.));
        assert_eq!(checker.native_ground_z([5.,0.,8.],7.),None);
        assert_eq!(checker.native_ground_z([5.,0.,-0.01],16.),None);
        assert_eq!(checker.native_ground_z([11.,0.,8.],16.),None);
        for drop in [0.,0.49,64.01,f32::NAN,f32::INFINITY]{assert_eq!(checker.native_ground_z([5.,0.,8.],drop),None);}
        quad(&mut mesh,[[0.,-1.,4.],[10.,-1.,4.],[10.,1.,4.],[0.,1.,4.]]);
        let checker=RouteChecker::new(&mesh).unwrap();
        assert_eq!(checker.native_ground_z([5.,0.,8.],16.),Some(4.));
        assert_eq!(checker.native_ground_z([5.,0.,3.],16.),Some(0.));
        assert_eq!(checker.native_ground_z([5.,0.,4.],0.5),Some(4.));
    }
    #[test]
    fn starting_capsules_require_close_floor_and_clear_body_not_just_a_valid_coordinate() {
        let check = RouteChecker::new(&corridor(2., 1.6)).unwrap();
        assert_eq!(check.verify_start([5., 0., 0.125]).unwrap(), 0.);
        for p in [[5., 0., 0.5], [5., 0., -0.1], [5., 0.95, 0.125], [11., 0., 0.125], [f64::NAN, 0., 0.]] {
            assert!(check.verify_start(p).is_err(), "{p:?}");
        }
        assert!(RouteChecker::new(&corridor(2., 0.65)).unwrap().verify_start([5.,0.,0.125]).is_err());
    }
    #[test]
    fn a_thin_shoulder_obstacle_between_samples_blocks_both_directions() {
        let mut mesh = corridor(2., 1.6);
        quad(&mut mesh, [
            [1.125, 0.17, 0.05], [1.125, 0.18, 0.05],
            [1.125, 0.18, 0.65], [1.125, 0.17, 0.65],
        ]);
        let mut route = plan();
        assert!(verify_route(&mesh, &route).is_err(), "A shoulder obstacle between samples must block the route");
        route.tunnel_points.reverse();
        assert!(verify_route(&mesh, &route).is_err());
    }
    #[test]
    fn a_small_curb_allows_lifting_and_lowering_without_sweeping_through_its_edge() {
        let mut mesh = corridor(2., 1.6);
        mesh.indices.drain(0..6);
        quad(&mut mesh, [[0.,-1.,0.],[1.125,-1.,0.],[1.125,1.,0.],[0.,1.,0.]]);
        quad(&mut mesh, [[1.125,-1.,0.064],[10.,-1.,0.064],[10.,1.,0.064],[1.125,1.,0.064]]);
        quad(&mut mesh, [[1.125,-1.,0.],[1.125,1.,0.],[1.125,1.,0.064],[1.125,-1.,0.064]]);
        let mut route = plan();
        assert!(verify_route(&mesh, &route).is_ok());
        route.tunnel_points.reverse();
        assert!(verify_route(&mesh, &route).is_ok());
    }
    #[test]
    fn vehicle_width_ridge_checks_both_sides_of_the_deck() {
        let mut route = plan();
        route.tunnel_width = 6.;
        route.tunnel_height = 4.;
        route.open_road = true;
        let full = RouteChecker::new(&corridor(6., 4.)).unwrap();
        assert!(full.verify_one(&route, true).is_ok());

        let thin = RouteChecker::new(&corridor(2., 4.)).unwrap();
        assert!(thin.verify_one(&route, false).is_ok());
        assert!(thin.verify_one(&route, true).unwrap_err().to_string().contains("lateral floor support"));
        route.tunnel_points.reverse();
        assert!(thin.verify_one(&route, true).is_err());
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

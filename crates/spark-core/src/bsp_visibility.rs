//! Authored Halo 1 tunnel portal cuts and explicitly editor-only zone bounds.
//! Tool builds the actual clusters/PVS from +portal source; boxes are never PVS.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
pub type Point = [f64; 3];
pub const MAX_ZONES: usize = 32;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum VisibilityZone {
    Tunnel {
        id: String,
        name: String,
        segment: usize,
        start: f64,
        end: f64,
    },
    EditorBounds {
        id: String,
        name: String,
        min: Point,
        max: Point,
    },
}
impl VisibilityZone {
    fn identity(&self) -> (&str, &str) {
        match self {
            Self::Tunnel { id, name, .. } | Self::EditorBounds { id, name, .. } => (id, name),
        }
    }
}

pub fn validate(zones: &[VisibilityZone], points: &[Point]) -> Result<()> {
    if zones.len() > MAX_ZONES {
        return invalid("At most 32 visibility zones are supported per connection");
    }
    let mut ids = BTreeSet::new();
    let mut segments = BTreeSet::new();
    for zone in zones {
        let (id, name) = zone.identity();
        if uuid::Uuid::parse_str(id).is_err()
            || !ids.insert(id)
            || name.trim().is_empty()
            || name.chars().count() > 80
            || name.chars().any(char::is_control)
        {
            return invalid("Visibility zones need unique UUIDs and names of 1-80 characters without control characters");
        }
        match zone {
            VisibilityZone::Tunnel {
                segment,
                start,
                end,
                ..
            } => {
                let Some(pair) = points.get(*segment..).and_then(|tail| tail.get(..2)) else {
                    return invalid("Visibility zone references a removed tunnel segment");
                };
                if !segments.insert(*segment) {
                    return invalid(
                        "Use one visibility zone per tunnel segment; duplicate cuts cannot compile",
                    );
                }
                let length = (pair[1][0] - pair[0][0]).hypot(pair[1][1] - pair[0][1]);
                if !start.is_finite()
                    || !end.is_finite()
                    || *start < 0.05
                    || *end > 0.95
                    || start >= end
                    || pair
                        .iter()
                        .flatten()
                        .any(|v| !v.is_finite() || v.abs() > 2048.)
                    || !length.is_finite()
                    || (end - start) * length < 0.5 - 1e-8
                {
                    return invalid("Tunnel zone entrance/exit must be ordered between 5% and 95%, at least 0.5 world units apart");
                }
            }
            VisibilityZone::EditorBounds { min, max, .. } => {
                if (0..3).any(|i| {
                    !min[i].is_finite()
                        || !max[i].is_finite()
                        || min[i].abs() > 2048.
                        || max[i].abs() > 2048.
                        || max[i] - min[i] < 0.1
                }) {
                    return invalid("Editor zone bounds must be finite, ordered, at least 0.1 units wide and within +/-2048");
                }
            }
        }
    }
    Ok(())
}

pub fn authored_centers(
    zones: &[VisibilityZone],
    points: &[Point],
    segment: usize,
) -> Result<Option<[Point; 2]>> {
    validate(zones, points)?;
    Ok(zones.iter().find_map(|zone| match zone {
        VisibilityZone::Tunnel {
            segment: at,
            start,
            end,
            ..
        } if *at == segment => {
            let a = points[segment];
            let b = points[segment + 1];
            Some([*start, *end].map(|t| std::array::from_fn(|i| a[i] + (b[i] - a[i]) * t)))
        }
        _ => None,
    }))
}

pub fn portal_quad(center: Point, direction: Point, width: f64, height: f64) -> Result<[Point; 4]> {
    let length = direction[0].hypot(direction[1]);
    if !length.is_finite()
        || length < 0.5
        || center.iter().any(|v| !v.is_finite())
        || !width.is_finite()
        || !height.is_finite()
        || !(0.8..=16.).contains(&width)
        || !(1.0..=16.).contains(&height)
    {
        return invalid("Invalid bounded tunnel portal geometry");
    }
    let side = [
        -direction[1] / length * width / 2.,
        direction[0] / length * width / 2.,
        0.,
    ];
    Ok([
        std::array::from_fn(|i| center[i] - side[i]),
        std::array::from_fn(|i| center[i] + side[i]),
        [center[0] + side[0], center[1] + side[1], center[2] + height],
        [center[0] - side[0], center[1] - side[1], center[2] + height],
    ])
}

/// Authored cuts overlap the surrounding solid by 0.01 world units so Tool
/// clips their edges to the corridor rather than retaining floating edges.
/// Legacy automatic cut geometry remains unchanged.
pub fn authored_portal_quad(
    center: Point,
    direction: Point,
    width: f64,
    height: f64,
) -> Result<[Point; 4]> {
    let mut quad = portal_quad(center, direction, width, height)?;
    let length = direction[0].hypot(direction[1]);
    let side = [-direction[1] / length * 0.01, direction[0] / length * 0.01];
    for (i, p) in quad.iter_mut().enumerate() {
        let sign = if i == 0 || i == 3 { -1. } else { 1. };
        p[0] += side[0] * sign;
        p[1] += side[1] * sign;
        p[2] += if i < 2 { -0.01 } else { 0.01 };
    }
    Ok(quad)
}

/// All supported cuts are vertical rectangles. Reject overlapping planes or
/// crossings inside their horizontal spans; shared boundary edges are allowed.
pub fn portals_intersect(a: &[Point; 4], b: &[Point; 4]) -> bool {
    let height_overlap = a[3][2].min(b[3][2]) - a[0][2].max(b[0][2]);
    if height_overlap <= 1e-6 { return false; }
    let u=[a[1][0]-a[0][0],a[1][1]-a[0][1]];
    let v=[b[1][0]-b[0][0],b[1][1]-b[0][1]];
    let w=[b[0][0]-a[0][0],b[0][1]-a[0][1]];
    let cross=|x:[f64;2],y:[f64;2]|x[0]*y[1]-x[1]*y[0];
    let determinant=cross(u,v);
    if determinant.abs()>1e-8 {
        let x=cross(w,v)/determinant;let y=cross(w,u)/determinant;
        return x>1e-6&&x<1.-1e-6&&y>1e-6&&y<1.-1e-6;
    }
    if cross(w,u).abs()>1e-6 {return false;}
    let squared=u[0]*u[0]+u[1]*u[1];
    if squared<1e-10{return true;}
    let project=|p:Point|((p[0]-a[0][0])*u[0]+(p[1]-a[0][1])*u[1])/squared;
    let(x,y)=(project(b[0]),project(b[1]));
    x.max(y).min(1.)-x.min(y).max(0.)>1e-6
}

/// Re-emit a native rectangular tunnel cut with Tool's existing solid overlap.
pub(crate) fn retained_tunnel_quad(ring: &[Point]) -> Result<[Point; 4]> {
    if ring.len() < 4 { return invalid("Retained tunnel portal needs a reviewed rectangular boundary"); }
    let start = ring[0];
    let end = ring.iter().copied().max_by(|a, b| {
        (a[0] - start[0]).hypot(a[1] - start[1])
            .total_cmp(&(b[0] - start[0]).hypot(b[1] - start[1]))
    }).unwrap();
    let size = (end[0] - start[0]).hypot(end[1] - start[1]);
    if size < 0.5 { return invalid("Retained tunnel portal is too narrow to reconstruct"); }
    let axis = [(end[0] - start[0]) / size, (end[1] - start[1]) / size];
    let normal = [axis[1], -axis[0], 0.];
    let bottom = ring.iter().map(|p| p[2]).fold(f64::INFINITY, f64::min);
    let top = ring.iter().map(|p| p[2]).fold(f64::NEG_INFINITY, f64::max);
    let local: Vec<_> = ring.iter().map(|p| {
        let delta = [p[0] - start[0], p[1] - start[1]];
        (delta[0] * axis[0] + delta[1] * axis[1], delta[0] * normal[0] + delta[1] * normal[1], p[2])
    }).collect();
    let tolerance = ring.iter().flatten().copied().map(f64::abs).fold(1., f64::max) * 8. * f64::from(f32::EPSILON);
    let area = local.iter().zip(local.iter().cycle().skip(1))
        .map(|(a, b)| a.0 * (b.2 - bottom) - b.0 * (a.2 - bottom)).sum::<f64>().abs() * 0.5;
    if local.iter().any(|p| p.1.abs() > tolerance || p.0 < -tolerance || p.0 > size + tolerance)
        || (area - size * (top - bottom)).abs() > tolerance * (size + top - bottom)
    {
        return invalid("A retained portal has a nonrectangular native boundary; review its original portal source");
    }
    authored_portal_quad([(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, bottom], normal, size, top - bottom)
}

/// Triangulates a convex compiled outline without replacing its sealed edges.
pub(crate) fn exact_outline_triangles(points: &[Point]) -> Result<Vec<[usize; 3]>> {
    if !(3..=128).contains(&points.len()) || points.iter().flatten().any(|v| !v.is_finite()) {
        return invalid("Exact portal needs 3–128 finite native vertices");
    }
    let origin = points[0];
    let relative = |p: Point| std::array::from_fn::<_, 3, _>(|i| p[i] - origin[i]);
    let cross = |a: Point, b: Point| [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let dot = |a: Point, b: Point| a.iter().zip(b).map(|(a,b)| a*b).sum::<f64>();
    let mut plane = [0.; 3];
    for pair in points[1..].windows(2) {
        let n = cross(relative(pair[0]), relative(pair[1]));
        for axis in 0..3 { plane[axis] += n[axis]; }
    }
    let length = dot(plane, plane).sqrt();
    if length < 1e-8 {
        return invalid("Exact portal outline has no usable plane");
    }
    plane = plane.map(|v| v / length);
    let tolerance = points.iter().flatten().copied().map(f64::abs).fold(1., f64::max) * 8. * f64::from(f32::EPSILON);
    if points.iter().any(|&p| dot(relative(p), plane).abs() > tolerance) {
        return invalid("Exact portal outline is not planar");
    }
    for (&a, &b) in points.iter().zip(points.iter().cycle().skip(1)) {
        let edge = std::array::from_fn(|i| b[i] - a[i]);
        let edge_length = dot(edge, edge).sqrt();
        if edge_length <= 1e-8 || points.iter().any(|&p| {
            let offset = std::array::from_fn(|i| p[i] - a[i]);
            dot(cross(edge, offset), plane) < -tolerance * edge_length
        }) {
            return invalid("Exact portal needs a convex outline without collapsed edges");
        }
    }
    // A fan can preserve intermediate collinear edges if its pivot is off
    // their line. Refuse outlines that need general polygon subdivision.
    for start in 0..points.len() {
        let triangles = (1..points.len()-1).map(|i| [start, (start+i)%points.len(), (start+i+1)%points.len()]).collect::<Vec<_>>();
        if triangles.iter().all(|&[a,b,c]| {
            dot(cross(std::array::from_fn(|i| points[b][i]-points[a][i]), std::array::from_fn(|i| points[c][i]-points[a][i])), plane) > 1e-8
        }) {
            return Ok(triangles);
        }
    }
    invalid("Exact portal outline needs additional subdivision to retain all its edges")
}

/// A portal follows the actual closed air volume, not a rectangle guessed from
/// world bounds. Parallel road/ridge spaces can overlap and need one full cut.
#[derive(Debug)]
pub(crate) struct SourcePortal {
    pub points: Vec<Point>,
    pub triangles: Vec<[usize; 3]>,
}
fn native_contours(polygons: Vec<Vec<manifold_rust::linalg::Vec2>>, world_scale:f64)->Result<Vec<Vec<manifold_rust::linalg::Vec2>>> {
    // Slice triangulation leaves redundant near-collinear vertices. Remove
    // only detail below the source's f32 coordinate precision; retain real
    // corners and holes instead of moving a creator's visibility plane.
    let count=polygons.len();
    let cleaned=manifold_rust::cross_section::CrossSection::new(polygons).simplify(world_scale.max(1.)*f64::from(f32::EPSILON)).to_polygons();
    if cleaned.len()!=count || cleaned.iter().any(|ring|ring.len()<3) { return invalid("Native visibility precision would remove an opening or obstruction; move the cut away from this feature"); }
    Ok(cleaned)
}
pub(crate) fn clipped_portal(space:&manifold_rust::manifold::Manifold, center:Point, direction:Point, probe_height:f64)->Result<SourcePortal>{
    if !probe_height.is_finite() || probe_height <= 0. {
        return invalid("Invalid native visibility probe");
    }
    portal_section(space, center, direction, Some(probe_height))
}

pub(crate) fn complete_portal_section(
    space: &manifold_rust::manifold::Manifold,
    center: Point,
    direction: Point,
) -> Result<SourcePortal> {
    portal_section(space, center, direction, None)
}

fn portal_section(
    space: &manifold_rust::manifold::Manifold,
    center: Point,
    direction: Point,
    route_probe: Option<f64>,
) -> Result<SourcePortal> {
    use manifold_rust::linalg::{Vec2,Vec3};
    let length=direction[0].hypot(direction[1]);
    if !length.is_finite()||length<0.5||center.iter().any(|v|!v.is_finite()) {return invalid("Invalid native visibility section");}
    let normal=[direction[0]/length,direction[1]/length,0.];let side=[-normal[1],normal[0],0.];
    let local=space.translate(Vec3::new(-center[0],-center[1],-center[2])).rotate(0.,0.,-direction[1].atan2(direction[0]).to_degrees()).rotate(0.,90.,0.);
    let polygons=local.slice(0.).to_polygons();
    if polygons.len()>256||polygons.iter().map(Vec::len).sum::<usize>()>4096 {return invalid("Native visibility section exceeds its bounded source complexity");}
    let area=|p:&Vec<Vec2>|p.iter().zip(p.iter().cycle().skip(1)).map(|(a,b)|a.x*b.y-b.x*a.y).sum::<f64>()*0.5;
    let contains=|p:&Vec<Vec2>,point:Vec2|{let mut inside=false;for(a,b)in p.iter().zip(p.iter().cycle().skip(1)){if (a.y>point.y)!=(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x{inside=!inside;}}inside};
    let selected = if let Some(probe_height) = route_probe {
    let probe=Vec2::new(probe_height,0.);
    let outer=polygons.iter().filter(|p|area(p)>0.&&contains(p,probe)).min_by(|a,b|area(a).total_cmp(&area(b))).ok_or_else(||crate::SparkError::Invalid("Visibility cut has no closed air section at the route; move the handle away from walls or junctions".into()))?;
    let mut selected=vec![outer.clone()];
    for hole in polygons.iter().filter(|p|area(p)<0.&&p.first().is_some_and(|point|contains(outer,*point))){if contains(hole,probe){return invalid("Visibility cut lies inside a structural obstruction");}selected.push(hole.clone());}
    selected
    } else {
        if polygons.is_empty() { return invalid("Outdoor sky split crosses no closed air section"); }
        polygons
    };
    let world_scale=selected.iter().flatten().flat_map(|p|[center[0]+side[0]*p.y,center[1]+side[1]*p.y,center[2]+p.x]).map(f64::abs).fold(1.,f64::max);
    let selected=native_contours(selected,world_scale)?;
    let flat:Vec<_>=selected.iter().flatten().copied().collect();
    let points:Vec<Point>=flat.iter().map(|p|[center[0]+side[0]*p.y,center[1]+side[1]*p.y,center[2]+p.x]).collect();
    if points.iter().flatten().any(|v|!v.is_finite()||v.abs()>2048.){return invalid("Native portal leaves the supported world bounds");}
    let triangles=manifold_rust::polygon::triangulate(&selected,1e-8,false).into_iter().map(|t|[t.x as usize,t.y as usize,t.z as usize]).collect::<Vec<_>>();
    if triangles.is_empty()||triangles.iter().flatten().any(|&i|i>=points.len()){return invalid("Closed native visibility section could not be triangulated");}
    Ok(SourcePortal{points,triangles})
}

#[cfg(test)]
mod tests {
    #[test]
    fn native_portal_fan_keeps_trapezoidal_edges_and_rejects_twists() {
        let gate = [[4.,0.,0.], [4.,0.2,1.], [4.,1.1,1.], [4.,1.3,0.]];
        assert_eq!(super::exact_outline_triangles(&gate).unwrap(), vec![[0,1,2], [0,2,3]]);
        let mut twisted = gate;
        twisted[2][0] += 0.1;
        assert!(super::exact_outline_triangles(&twisted).is_err());
        assert!(super::exact_outline_triangles(&[gate[0], gate[2], gate[1], gate[3]]).is_err());
    }

    use super::*;
    fn tunnel(segment: usize, start: f64, end: f64) -> VisibilityZone {
        VisibilityZone::Tunnel {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Tunnel visibility".into(),
            segment,
            start,
            end,
        }
    }
    #[test]
    fn native_arch_contour_keeps_all_real_corners_without_sub_float_slice_vertices() {
        use manifold_rust::linalg::Vec2;
        // Actual native portal Y/Z outline. All nine true arch corners stay;
        // the extra fourteen vertices are slicing/float interpolation noise.
        let points=[[43.96125793,-18.03289795],[43.95098495,-18.07504272],[43.95098495,-18.15253067],[43.95098495,-20.98648453],[43.95098495,-21.07504272],[47.25692749,-21.07504272],[47.59071732,-21.07504272],[47.59071732,-21.0418911],[47.59071732,-21.00536919],[47.59071732,-18.2176609],[47.59071732,-18.07504272],[47.57353592,-18.00456619],[47.34690094,-17.07504272],[47.34563828,-17.07365036],[47.02045441,-16.7162838],[46.68078613,-16.34299278],[46.16997528,-16.19257355],[45.77085114,-16.07504272],[45.18622208,-16.24720001],[44.86091995,-16.34299278],[44.39152527,-16.85884666],[44.19544983,-17.07432747],[44.19480133,-17.07504272]];
        let mut ring:Vec<_>=points.into_iter().map(|p|Vec2::new(p[0],p[1])).collect();
        let area=ring.iter().zip(ring.iter().cycle().skip(1)).map(|(a,b)|a.x*b.y-a.y*b.x).sum::<f64>();if area<0.{ring.reverse();}
        let cleaned=native_contours(vec![ring],120.).unwrap();assert_eq!(cleaned.len(),1);assert_eq!(cleaned[0].len(),9);
        for p in [points[1],points[4],points[6],points[10],points[12],points[15],points[17],points[19],points[22]] {
            assert!(cleaned[0].iter().any(|v|(v.x-p[0]).hypot(v.y-p[1])<2e-5),"True arch corner must survive native precision cleanup");
        }
        let outer=vec![Vec2::new(0.,0.),Vec2::new(4.,0.),Vec2::new(4.,4.),Vec2::new(0.,4.)];
        let hole=vec![Vec2::new(1.,1.),Vec2::new(1.,1.+1e-8),Vec2::new(1.+1e-8,1.+1e-8),Vec2::new(1.+1e-8,1.)];
        assert!(native_contours(vec![outer,hole],120.).is_err(),"Never silently drop a sub-resolution obstruction");
    }

    #[test]
    fn authored_cuts_follow_slopes_and_span_the_tunnel_without_collision_geometry() {
        let points = [[0., 0., 0.], [10., 0., 2.]];
        let centers = authored_centers(&[tunnel(0, 0.25, 0.75)], &points, 0)
            .unwrap()
            .unwrap();
        assert_eq!(centers, [[2.5, 0., 0.5], [7.5, 0., 1.5]]);
        assert_eq!(
            portal_quad(centers[0], [10., 0., 2.], 2., 1.6).unwrap(),
            [
                [2.5, -1., 0.5],
                [2.5, 1., 0.5],
                [2.5, 1., 2.1],
                [2.5, -1., 2.1]
            ]
        );
    }
    #[test]
    fn editor_bounds_never_generate_portal_cuts() {
        let zone = VisibilityZone::EditorBounds {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Plan only".into(),
            min: [0.; 3],
            max: [5.; 3],
        };
        assert!(authored_centers(&[zone], &[[0.; 3], [10., 0., 0.]], 0)
            .unwrap()
            .is_none());
    }
    #[test]
    fn intersecting_and_duplicate_cuts_are_rejected_but_shared_edges_are_allowed() {
        let a=portal_quad([3.,0.,0.],[1.,0.,0.],2.,2.).unwrap();
        let b=portal_quad([3.,0.,0.],[0.,1.,0.],2.,2.).unwrap();
        assert!(portals_intersect(&a,&b));assert!(portals_intersect(&a,&a));
        let adjacent=portal_quad([3.,2.,0.],[1.,0.,0.],2.,2.).unwrap();
        assert!(!portals_intersect(&a,&adjacent));
        let separate=portal_quad([4.,0.,0.],[1.,0.,0.],2.,2.).unwrap();
        assert!(!portals_intersect(&a,&separate));
    }
    #[test]
    fn rejects_removed_segments_duplicates_degenerate_nonfinite_and_oversized_zones() {
        let points = [[0.; 3], [10., 0., 0.]];
        for zones in [
            vec![tunnel(1, 0.2, 0.8)],
            vec![tunnel(0, 0.2, 0.8), tunnel(0, 0.3, 0.7)],
            vec![tunnel(0, 0.4, 0.41)],
            vec![tunnel(0, f64::NAN, 0.8)],
            vec![tunnel(0, 0., 1.)],
        ] {
            assert!(validate(&zones, &points).is_err());
        }
        assert!(validate(
            &(0..33).map(|_| tunnel(0, 0.2, 0.8)).collect::<Vec<_>>(),
            &points
        )
        .is_err());
    }
}

#[cfg(test)] mod native_section_tests {
    use super::*;use manifold_rust::{manifold::Manifold,linalg::Vec3};
    fn area(surface:&SourcePortal)->f64 {surface.triangles.iter().map(|ids|{let [a,b,c]=ids.map(|i|surface.points[i]);((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1])).abs()*0.5}).sum()}
    #[test]
    fn retained_tunnel_keeps_native_cut_and_rejects_a_notched_outline() {
        let mut ring = vec![
            [10., 20., 0.], [10., 20., 2.], [10., 21., 2.], [10., 22., 2.],
            [10., 22., 0.], [10., 21., 0.],
        ];
        let quad = retained_tunnel_quad(&ring).unwrap();
        assert!(quad.iter().all(|p| (p[0] - 10.).abs() < 1e-9));
        assert!(quad.iter().any(|p| p[1] < 20.) && quad.iter().any(|p| p[1] > 22.));
        assert!(quad.iter().any(|p| p[2] < 0.) && quad.iter().any(|p| p[2] > 2.));
        ring[2][2] = 1.;
        assert!(retained_tunnel_quad(&ring).is_err());
    }

    #[test] fn shared_road_ridge_portal_reaches_the_complete_closed_boundary(){
        let road=Manifold::cube(Vec3::new(12.,6.,10.),false).translate(Vec3::new(0.,-3.,0.));
        let ridge=Manifold::cube(Vec3::new(12.,4.,8.),false).translate(Vec3::new(0.,-5.,0.));
        let joined=road.union(&ridge);let cut=clipped_portal(&joined,[6.,0.,0.],[1.,0.,0.],0.8).unwrap();
        assert!(cut.points.iter().all(|p|(p[0]-6.).abs()<1e-8));assert!((area(&cut)-76.).abs()<1e-7);
        assert!(cut.points.iter().any(|p|(p[1]+5.).abs()<1e-8));assert!(cut.points.iter().any(|p|(p[2]-8.).abs()<1e-8));
    }
    #[test]
    fn complete_outdoor_cut_closes_both_disconnected_air_openings() {
        let road = Manifold::cube(Vec3::new(12., 6., 10.), false).translate(Vec3::new(0., -3., 0.));
        let cave = Manifold::cube(Vec3::new(12., 2., 2.), false).translate(Vec3::new(0., 10., 0.));
        let cut = complete_portal_section(&road.union(&cave), [6., 0., 0.], [1., 0., 0.]).unwrap();
        assert!((area(&cut) - 64.).abs() < 1e-7);
        assert!(cut.points.iter().all(|point| (point[0] - 6.).abs() < 1e-8));
        assert!(cut.points.iter().any(|point| point[1] > 9.));
    }

    #[test] fn independent_cave_cut_does_not_include_an_unrelated_outdoor_region(){
        let road=Manifold::cube(Vec3::new(12.,6.,10.),false).translate(Vec3::new(0.,-3.,0.));
        let cave=Manifold::cube(Vec3::new(12.,2.,2.),false).translate(Vec3::new(0.,10.,0.));
        let joined=road.union(&cave);let cut=clipped_portal(&joined,[6.,11.,0.],[1.,0.,0.],0.8).unwrap();
        assert!((area(&cut)-4.).abs()<1e-7);assert!(cut.points.iter().all(|p|p[1]>=10.-1e-8&&p[1]<=12.+1e-8));
        assert!(clipped_portal(&joined,[6.,7.,0.],[1.,0.,0.],0.8).is_err());
    }
}

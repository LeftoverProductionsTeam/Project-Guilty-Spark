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

#[cfg(test)]
mod tests {
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

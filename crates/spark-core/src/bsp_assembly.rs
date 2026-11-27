//! Rebuild two source spaces as one connected BSP. Never mutate a source cache.
//! The source collision boundaries supply the solid; shader identities and UVs
//! are recovered separately. This is a derived geometry rebuild, not a campaign
//! script/AI, cluster-property or baked-lightmap transplant.
use crate::{
    bsp_clearance::{clip_connector_face, TriangleBounds},
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

// H1A Tool validates collision vertices per axis in native world units.
const NATIVE_STRUCTURE_BOUND: f64 = 1500.;

fn validate_native_bsp_point(point: V) -> Result<()> {
    if let Some((axis, value)) = ["X", "Y", "Z"].into_iter().zip(point)
        .find(|(_, value)| !value.is_finite() || value.abs() > NATIVE_STRUCTURE_BOUND)
    {
        return invalid(format!("Native BSP coordinate {axis} {value:+.2} exceeds Halo Tool’s ±{NATIVE_STRUCTURE_BOUND:.0} world-unit bound"));
    }
    Ok(())
}
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
    /// The original Atlas frame at the start of a merged native world.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atlas_origin: Option<crate::megaworld::LayoutRegion>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atlas_from_region_id: Option<String>,
    pub donor_project_id: String,
    pub donor_title: String,
    pub donor_source: Source,
    /// Explicit matching editable tags for donor materials and their dependencies.
    pub donor_tags_directory: PathBuf,
    pub donor_bsp_index: usize,
    #[serde(default, skip_serializing_if = "is_zero_index")]
    pub base_bsp_index: usize,
    #[serde(default, skip_serializing_if = "is_false")]
    pub separate_native_bsps: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub preserve_donor_bsp: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub restore_donor_sky_portals: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outdoor_sky_split: Option<f64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub tunnel_bake_fill: bool,
    /// Fit the connector floor across the two directional donor switches.
    #[serde(default, skip_serializing_if = "is_false")]
    pub directional_donor_landing: bool,
    /// Continue the authored floor where an enclosed passage meets native air.
    #[serde(default, skip_serializing_if = "is_false")]
    pub fit_passage_floor: bool,
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
    /// Ordered world-space boundaries reviewed against a native Tool diagnostic.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub native_seals: Vec<NativeSeal>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum NativeSeal {
    Flat(Vec<V>),
    Raised { vertices: [V; 3], lift: f64 },
}

impl NativeSeal {
    fn vertices(&self) -> &[V] {
        match self { Self::Flat(vertices) => vertices, Self::Raised { vertices, .. } => vertices }
    }
}

fn is_false(value: &bool) -> bool { !*value }
fn is_zero_index(value: &usize) -> bool { *value == 0 }
impl BspAssembly {
    pub fn validate(&self) -> Result<()> {
        if let Some(origin) = &self.atlas_origin {
            crate::megaworld::Layout { schema_version: 1, regions: vec![origin.clone()], extraction: Default::default() }.validate()?;
        }
        if self.schema_version != 1 || self.donor_bsp_index > 15 || self.base_bsp_index > 15
            || (!self.separate_native_bsps && self.base_bsp_index != 0) || self.donor_title.len() > 256
        {
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
        if self.separate_native_bsps { self.validate_partition_route()?; }
        if self.preserve_donor_bsp && (!self.separate_native_bsps || self.yaw_degrees != 0. || !self.native_seals.is_empty()) {
            return invalid("An intact donor requires separate BSPs, translation without yaw, and no boundary seals");
        }
        if self.tunnel_bake_fill && (!self.preserve_donor_bsp || self.open_road) {
            return invalid("Tunnel bake lighting requires an enclosed connector between intact BSPs");
        }
        if self.fit_passage_floor && (self.open_road || self.separate_native_bsps) {
            return invalid("Fitted passage floors require a combined, enclosed tunnel");
        }
        if self.directional_donor_landing && (!self.preserve_donor_bsp || self.open_road) {
            return invalid("Directional landing requires an enclosed connector with the donor BSP intact");
        }
        if self.sections.len()>8||self.arch_segments.is_some_and(|n|!(2..=12).contains(&n))||self.arch_segments.is_some()&&(self.open_road||self.terrain_seam.is_some()) {
            return invalid("Choose at most eight seam sections; an enclosed arch needs 2-12 roof segments");
        }
        if self.native_seals.len() > 8 || self.native_seals.iter().any(|seal| {
            let vertices = seal.vertices();
            !matches!(vertices.len(), 3 | 4)
                || vertices.iter().flatten().any(|p| !p.is_finite() || p.abs() > 2048.)
                || matches!(seal, NativeSeal::Raised { lift, .. } if !(0.002..=0.25).contains(&lift.abs()))
        }) {
            return invalid("Use up to eight native seals. Flat seals take three or four vertices. Raised seals take three vertices and an offset of 0.002 to 0.25 world units in either direction.");
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
        if self.outdoor_sky_split.is_some_and(|fraction|
            !(0.05..=0.95).contains(&fraction) || !self.open_road || self.terrain_seam.is_none()
                || self.tunnel_points.len() != 2 || self.separate_native_bsps || self.preserve_donor_bsp)
        {
            return invalid("Outdoor sky splits require a straight combined terrain seam and a cut between 5% and 95%");
        }
        if self.restore_donor_sky_portals && (self.separate_native_bsps || self.preserve_donor_bsp) {
            return invalid("Restore donor sky portals applies to combined BSP geometry");
        }
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
    fn validate_partition_route(&self) -> Result<()> {
        let allows_bends = self.preserve_donor_bsp && !self.open_road;
        if self.donor_bsp_index != 0 || (!allows_bends && self.tunnel_points.len() != 2)
            || (self.open_road && !self.preserve_donor_bsp)
            || self.terrain_seam.is_some() || self.arch_segments.is_some()
            || self.infantry_tunnel.is_some() || self.high_ground.is_some()
            || !self.sections.is_empty() || !self.visibility_zones.is_empty()
        {
            return invalid("Separate native BSPs require a single-BSP donor and no custom portal cuts. Bends and open bridges require Preserve donor BSP; bridges stay straight.");
        }
        if self.open_road && (self.tunnel_width < 6. || self.tunnel_height < 4.) {
            return invalid("An intact land bridge needs at least six world units of width and four of clearance");
        }
        let end = *self.tunnel_points.last().unwrap();
        if horizontal_run(self.tunnel_points[0], end) < 12. {
            return invalid("Allow at least twelve world units for separate corridor caps and switch volumes");
        }
        Ok(())
    }
    fn infantry_plan(&self, tunnel: &InfantryTunnel) -> Self {
        let mut route = self.clone();
        route.infantry_tunnel = None; route.high_ground = None; route.open_road = false; route.terrain_seam=None;route.sections.clear();route.arch_segments=None;
        route.tunnel_points = tunnel.points.clone(); route.tunnel_width = tunnel.width;
        route.tunnel_height = tunnel.height; route.tunnel_shader_path = tunnel.shader_path.clone();
        route.visibility_zones.clear(); route.native_seals.clear();
        route.outdoor_sky_split = None;
        route.fit_passage_floor = false;
        route
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
    #[serde(default)]
    pub lateral_samples: usize,
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
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblySourceIssue {
    pub triangle: usize,
    pub material: String,
    pub center: V,
    pub vertices: [V; 3],
    pub reason: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlaps_triangle: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlapping_vertices: Option<[V; 3]>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblySourcePreflight {
    pub blocked_faces: usize,
    pub lighting_risks: usize,
    pub overlap_check_incomplete: bool,
    pub lighting_examples: Vec<AssemblySourceIssue>,
    pub examples: Vec<AssemblySourceIssue>,
}

impl AssemblySourcePreflight {
    pub(crate) fn require_buildable(&self) -> Result<()> {
        if let Some(issue) = self.examples.first() {
            let other = issue.overlaps_triangle.map_or_else(String::new, |id| format!(" with triangle {id}"));
            return invalid(format!(
                "Join BSP source preflight found {} blocked faces. Triangle {} ({}) at ({:.3}, {:.3}, {:.3}): {}{}. Inspect the connection preview and adjust the join before building.",
                self.blocked_faces, issue.triangle, issue.material,
                issue.center[0], issue.center[1], issue.center[2], issue.reason, other
            ));
        }
        Ok(())
    }
}

pub struct AssemblyGeometry {
    pub mesh: MeshData,
    pub materials: Vec<AssemblyMaterial>,
    pub triangle_materials: Vec<usize>,
    pub exact_sky_portals: Vec<Vec<V>>,
    pub report: AssemblyReport,
}
// The test runs on positions rounded to JMS precision. A shared edge or vertex
// has zero intersection area, even when the faces have opposite winding.
const PREFLIGHT_PLANE_EPSILON: f64 = 2.0e-8;
const PREFLIGHT_OVERLAP_BUDGET: usize = 4_000_000;

fn coplanar_overlap(face: [V; 3], normal: V, other: [V; 3], other_normal: V,
    polygon: &mut Vec<V>, clipped: &mut Vec<V>) -> bool {
    if dot(normal, other_normal).abs() < 1. - 1e-12
        || other.iter().any(|&p| dot(normal, sub(p, face[0])).abs() > PREFLIGHT_PLANE_EPSILON)
        || face.iter().any(|&p| dot(other_normal, sub(p, other[0])).abs() > PREFLIGHT_PLANE_EPSILON)
    {
        return false;
    }
    polygon.clear();
    polygon.extend(other);
    for edge in 0..3 {
        let start = face[edge];
        let inward = cross(normal, sub(face[(edge + 1) % 3], start));
        clip_connector_face(polygon, clipped, |p| dot(inward, sub(p, start)));
    }
    let Some((&first, rest)) = polygon.split_first() else { return false; };
    let double_area: f64 = rest.windows(2)
        .map(|edge| dot(normal, cross(sub(edge[0], first), sub(edge[1], first))))
        .sum();
    let perimeter: f64 = polygon.iter().zip(polygon.iter().cycle().skip(1))
        .map(|(&a, &b)| { let edge = sub(a, b); dot(edge, edge).sqrt() }).sum();
    double_area.abs() > perimeter * PREFLIGHT_PLANE_EPSILON
}

// JMS writes world positions as centimeters with six decimal places.
fn native_export_point(point: V) -> V {
    point.map(|coordinate| (f64::from(coordinate as f32) * 1e8).round() / 1e8)
}

fn triangle_area_normal([a, b, c]: [V; 3]) -> V {
    cross(sub(b, a), sub(c, a))
}

impl AssemblyGeometry {
    /// Check the precision passed to Tool, before namespace extraction or compilation.
    /// Collision and render layers can intentionally cover the same footprint.
    pub fn source_preflight(&self) -> Result<AssemblySourcePreflight> {
        let mesh = &self.mesh;
        let vertices = mesh.positions.len() / 3;
        if mesh.positions.len() != vertices * 3
            || mesh.normals.len() != vertices * 3
            || mesh.uvs.len() != vertices * 2
            || mesh.indices.len() != self.triangle_materials.len() * 3
            || mesh.indices.iter().any(|&index| index as usize >= vertices)
            || self.triangle_materials.iter().any(|&slot| slot >= self.materials.len())
            || mesh.positions.iter().chain(&mesh.normals).any(|value| !value.is_finite())
        {
            return invalid("Join BSP source has invalid geometry attributes");
        }

        let mut report = AssemblySourcePreflight::default();
        let mut collision_faces = BTreeSet::new();
        let mut overlap_faces = Vec::new();
        let mut overlap_sources = Vec::new();
        for (triangle, (ids, &slot)) in mesh.indices.chunks_exact(3)
            .zip(&self.triangle_materials).enumerate()
        {
            let material = &self.materials[slot];
            let points: [V; 3] = std::array::from_fn(|corner| {
                let start = ids[corner] as usize * 3;
                native_export_point(std::array::from_fn(|axis| mesh.positions[start + axis].into()))
            });
            let [a, b, c] = points;
            let ab = sub(b, a);
            let ac = sub(c, a);
            let bc = sub(c, b);
            let area_normal = triangle_area_normal(points);
            let twice_area = dot(area_normal, area_normal).sqrt();
            let uv: [[f64; 2]; 3] = std::array::from_fn(|corner| {
                let start = ids[corner] as usize * 2;
                std::array::from_fn(|axis| {
                    (f64::from(mesh.uvs[start + axis]) * 1e6).round() / 1e6
                })
            });

            let solid = material.collision_only || material.name == "+sky";
            let terrain = material.name.starts_with("gster") && material.shader_path.is_some();
            let mut lighting_risk = false;
            let reason = if uv.iter().flatten().any(|value| !value.is_finite()) {
                Some("a UV coordinate is invalid")
            } else if twice_area == 0. {
                Some("triangle collapses at native export precision")
            } else if solid {
                let mut footprint = points.map(|point| {
                    point.map(|coordinate| (coordinate * 1e8).round() as i64)
                });
                footprint.sort_unstable();
                (!collision_faces.insert(footprint)).then_some("coincident coplanar collision faces")
            } else if terrain {
                // The west-valley lightmapper rejected a shallow terrain sliver while
                // accepting larger charts with the same stock texture scale. Limit
                // this guard to newly authored terrain and require both conditions.
                let longest_edge = dot(ab, ab).max(dot(ac, ac)).max(dot(bc, bc)).sqrt();
                let [u, v, w] = uv;
                let uv_area = ((v[0] - u[0]) * (w[1] - u[1])
                    - (v[1] - u[1]) * (w[0] - u[0])).abs();
                let altitude = twice_area / longest_edge;
                let shortest_edge = dot(ab, ab).min(dot(ac, ac)).min(dot(bc, bc)).sqrt();
                // Halo Tool's terrain bake can refuse a short, skinny
                // intersection despite valid source UVs and sealed collision.
                let short_seam = shortest_edge <= 0.015 && altitude < 0.012
                    && altitude / longest_edge < 0.006;
                lighting_risk = uv_area > 0. && (short_seam || (altitude < 0.006 && uv_area < 1e-7));
                (uv_area == 0.).then_some("terrain UVs collapse at native export precision")
            } else {
                None
            };
            if reason.is_none() && (solid || terrain) {
                overlap_faces.push(points);
                overlap_sources.push((triangle, solid, mul(area_normal, 1. / twice_area)));
            }
            if lighting_risk {
                report.lighting_risks += 1;
                if report.lighting_examples.len() < 8 {
                    report.lighting_examples.push(AssemblySourceIssue {
                        triangle, material: material.name.clone(),
                        center: mul(add(add(a, b), c), 1. / 3.),
                        vertices: points,
                        reason: "thin terrain chart may fail native lighting",
                        overlapping_vertices: None,
                        overlaps_triangle: None,
                    });
                }
            }
            if let Some(reason) = reason {
                report.blocked_faces += 1;
                if report.examples.len() < 8 {
                    report.examples.push(AssemblySourceIssue {
                        triangle, material: material.name.clone(),
                        center: mul(add(add(a, b), c), 1. / 3.),
                        vertices: points, reason, overlaps_triangle: None, overlapping_vertices: None,
                    });
                }
            }
        }
        // Stock render, portal and collision layers can deliberately coincide.
        // Compare solid faces with solid faces, and new terrain with new terrain.
        if overlap_faces.len() > 1 {
            let bounds = TriangleBounds::build(&overlap_faces, (0..overlap_faces.len()).collect());
            let mut budget = PREFLIGHT_OVERLAP_BUDGET;
            let (mut nearby, mut polygon, mut clipped) =
                (Vec::new(), Vec::with_capacity(6), Vec::with_capacity(6));
            for (index, &face) in overlap_faces.iter().enumerate().skip(1) {
                let (triangle, solid, normal) = overlap_sources[index];
                nearby.clear();
                let low = std::array::from_fn(|k| face[0][k].min(face[1][k]).min(face[2][k]) - PREFLIGHT_PLANE_EPSILON);
                let high = std::array::from_fn(|k| face[0][k].max(face[1][k]).max(face[2][k]) + PREFLIGHT_PLANE_EPSILON);
                bounds.query(low, high, &mut nearby);
                let Some(remaining) = budget.checked_sub(nearby.len()) else {
                    report.overlap_check_incomplete = true;
                    break;
                };
                budget = remaining;
                if let Some(&other) = nearby.iter().find(|&&other| {
                    other < index && overlap_sources[other].1 == solid &&
                        coplanar_overlap(face, normal, overlap_faces[other], overlap_sources[other].2,
                            &mut polygon, &mut clipped)
                }) {
                    report.blocked_faces += 1;
                    if report.examples.len() < 8 {
                        let [a, b, c] = face;
                        report.examples.push(AssemblySourceIssue {
                            triangle, material: self.materials[self.triangle_materials[triangle]].name.clone(),
                            center: mul(add(add(a, b), c), 1. / 3.),
                            reason: if solid { "coplanar collision faces overlap" } else { "coplanar terrain faces overlap" },
                            vertices: face,
                            overlaps_triangle: Some(overlap_sources[other].0),
                            overlapping_vertices: Some(overlap_faces[other]),
                        });
                    }
                }
            }
        }
        Ok(report)
    }
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
            if mesh.indices.len()>start {mesh.material_ranges.push(maps::MeshMaterialRange{shader_permutation:0,shader_tag_id:tag.id,bsp_index:0,lightmap_index:0,lightmap_page:-1,has_lightmap_uvs:false,has_incident_radiosity:false,lightmap_bitmap_tag_id:None,index_start:start,index_count:mesh.indices.len()-start});}
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
pub(crate) fn transform(p: V, translation: V, yaw: f64) -> V {
    let (s, c) = yaw.to_radians().sin_cos();
    add(
        [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]],
        translation,
    )
}
pub(crate) fn transform_facing(facing: f32, yaw: f64) -> f32 {
    ((f64::from(facing) + yaw.to_radians() + std::f64::consts::PI)
        .rem_euclid(std::f64::consts::TAU) - std::f64::consts::PI) as f32
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
fn nearest_terrain_chart(charts: &[RenderTri], center: V, surface_normal: V) -> Option<&RenderTri> {
    charts.iter()
        .filter(|chart| chart.n[2].abs() >= 0.55 && (surface_normal[2].abs() < 0.5 || dot(surface_normal, chart.n).abs() > 0.8))
        .filter_map(|chart| {
            let delta = sub(center, mul(add(add(chart.p[0], chart.p[1]), chart.p[2]), 1. / 3.));
            bary(center, chart).map(|_| (dot(delta, delta), chart))
        })
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, chart)| chart)
}

fn source_solid(
    i: &MapInspection,
    mesh: &MeshData,
    faces: &[CollisionFace],
    index: usize,
    source: usize,
    translation: V,
    yaw: f64,
    terrain_shader: Option<&str>,
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
        let render_charts = face.shader.and_then(|id| renders.get(render_aliases.get(&id).unwrap_or(&id)));
        let chosen = render_charts.and_then(|rows| {
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
        // An unmatched collision triangle on the selected landscape shader
        // still needs the source UV scale. A unit chart repeats the whole
        // original terrain image across newly exposed pieces of the slope.
        let terrain_chart = if chosen.is_none() && terrain_shader.is_some_and(|expected| {
            materials[slot].shader_path.as_ref().is_some_and(|path|
                path.replace('\\', "/").eq_ignore_ascii_case(&expected.replace('\\', "/")))
        }) {
            render_charts.and_then(|charts| nearest_terrain_chart(charts, center, n))
        } else {
            None
        };
        if chosen.is_none() && terrain_chart.is_none() && face.shader.is_some() {
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
                .map_or_else(
                    || terrain_chart.map_or_else(|| Ok(planar_uv(point, n)), |chart| terrain::ridge_uv(point, n, chart)),
                    Ok,
                )?;
            let world = transform(point, translation, yaw);
            validate_native_bsp_point(world)?;
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
pub(crate) fn tunnel_sides(points: &[V], width: f64) -> Result<Vec<V>> {
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
const LEVEL_PASSAGE_TRIANGLES: [[usize; 3]; 12] = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
];

fn passage_corners(a: V, b: V, side_a: V, side_b: V, height: f64) -> [V; 8] {
    let up = [0., 0., height];
    [
        sub(a, side_a),
        add(a, side_a),
        add(b, side_b),
        sub(b, side_b),
        add(sub(a, side_a), up),
        add(add(a, side_a), up),
        add(add(b, side_b), up),
        add(sub(b, side_b), up),
    ]
}

fn passage_floor_needs_center(points: &[V]) -> bool {
    dot(sub(points[3], points[0]), normal(points[0], points[1], points[2])).abs() > 1e-7
}

fn mitered_connector_floor(points: &[V], sides: &[V]) -> Result<Vec<crate::bsp_clearance::ConnectorFloor>> {
    use crate::bsp_clearance::ConnectorFloor;
    let mut faces = Vec::new();
    for (points, sides) in points.windows(2).zip(sides.windows(2)) {
        let [a, b] = [points[0], points[1]];
        let p = passage_corners(a, b, sides[0], sides[1], 0.);
        let direction = horizontal_direction(points);
        if dot(sub(p[3], p[0]), direction) <= 0.002 || dot(sub(p[2], p[1]), direction) <= 0.002 {
            return invalid("The inside wall folds at a tunnel bend. Move the floor points farther apart or soften the turn.");
        }
        let pieces = [[a, p[0], p[3]], [a, p[3], b], [a, b, p[2]], [a, p[2], p[1]]];
        let flat = [[p[0], p[2], p[1]], [p[0], p[3], p[2]]];
        let triangles = if passage_floor_needs_center(&p) { &pieces[..] } else { &flat[..] };
        for &triangle in triangles {
            faces.push(ConnectorFloor::new(triangle)?);
        }
    }
    Ok(faces)
}

fn passage_solid(a: V, b: V, side_a: V, side_b: V, height: f64, material: usize, sky: Option<usize>) -> Result<Manifold> {
    let points = passage_corners(a, b, side_a, side_b, height);
    let mut gl = MeshGL64 { num_prop: 5, ..Default::default() };
    append_passage_shell(&mut gl, points, [a, b], height, [true, true], passage_floor_needs_center(&points), material, sky);
    gl.merge();
    checked(Manifold::from_mesh_gl64(&gl), "Tunnel")
}

fn append_passage_shell(
    gl: &mut MeshGL64, points: [V; 8], center: [V; 2], height: f64, caps: [bool; 2], split: bool,
    material: usize, sky: Option<usize>,
) {
    let [a, b] = center;
    let up = [0., 0., height];
    let mut p = points.to_vec();
    // Graded miters keep the authored centerline. Neighboring panels use the same split at their shared section.
    let triangles=if split {
        p.extend([a,b,add(a,up),add(b,up)]);
        vec![8,0,3,8,3,9,8,9,2,8,2,1,
             10,7,4,10,11,7,10,6,11,10,5,6,
             0,8,10,0,10,4,8,1,5,8,5,10,
             1,2,6,1,6,5,
             2,9,11,2,11,6,9,3,7,9,7,11,
             3,0,4,3,4,7]
    } else {
        LEVEL_PASSAGE_TRIANGLES.into_iter().flatten().collect()
    };
    let (start_cap, end_cap) = if split { (8..12, 14..18) } else { (4..6, 8..10) };
    let floor_faces = if split { 4 } else { 2 };
    for (index, t) in triangles.chunks_exact(3).enumerate() {
        if (start_cap.contains(&index) && !caps[0]) || (end_cap.contains(&index) && !caps[1]) {
            continue;
        }
        let points = [p[t[0]], p[t[2]], p[t[1]]];
        let n = normal(points[0], points[1], points[2]);
        let first = gl.num_vert() as u64;
        for point in points {
            gl.vert_properties.extend(point);
            gl.vert_properties.extend(planar_uv(point, n));
        }
        gl.tri_verts.extend([first, first + 1, first + 2]);
        let face_material = if (floor_faces..2 * floor_faces).contains(&index) { sky.unwrap_or(material) } else { material };
        gl.face_id.push(face_material as u64);
    }
}
// A route volume joined into existing outdoor sky cannot raise its floor:
// it is already inside free space. Remove only the explicitly authored strip
// beneath the ridge, leaving a real supported surface and the lower routes.
fn support_route_floor(
    mut space:Manifold, route:&BspAssembly, material:usize,
    depth_for:impl Fn([V;2])->f64, token:Option<&CancelToken>, label:&str,
)->Result<Manifold>{
    let sides=tunnel_sides(&route.tunnel_points,route.tunnel_width as f64)?;
    for (index,pair) in route.tunnel_points.windows(2).enumerate(){
        let depth=depth_for([pair[0],pair[1]]);
        if !depth.is_finite()||depth<=0. {return invalid("Terrain support requires a verified lower source boundary");}
        let down=[0.,0.,-depth];
        let support=passage_solid(add(pair[0],down),add(pair[1],down),sides[index],sides[index+1],depth,material,None)?;
        space=checked(space.boolean_with_engine_and_token(&support,OpType::Subtract,BooleanEngine::Auto,token),label)?;
    }
    Ok(space)
}

fn support_high_ground(space:Manifold,route:&BspAssembly,material:usize,minimum:f64,token:Option<&CancelToken>)->Result<Manifold>{
    support_route_floor(space,route,material,|pair|pair[0][2].max(pair[1][2])-minimum,token,"Canyon-top terrain support")
}

// The tunnel is an air union. In a stock landing that air is already present,
// so cutting the route alone can leave a step down to the original lower floor.
fn fit_passage_floor(space:Manifold,route:&BspAssembly,material:usize,token:Option<&CancelToken>)->Result<Manifold>{
    support_route_floor(space,route,material,|_|0.75,token,"Continuous enclosed passage floor")
}
#[derive(Clone, Copy)]
enum PartitionEnd { Base, Donor }

struct PartitionRoute {
    start: V, end: V, cap_before: V, cap_after: V, overlap_before: V, overlap_after: V,
    separation_axis: V,
    donor_grade_start: Option<V>,
}

fn retained_grade_start(start: V, end: V) -> Option<V> {
    if (end[2] - start[2]).abs() <= 1e-6 { return None; }
    let delta = sub(end, start);
    let horizontal = delta[0].hypot(delta[1]);
    Some(add(start, [3. * delta[0] / horizontal, 3. * delta[1] / horizontal, 0.]))
}

fn donor_partition_points(first: V, grade_start: Option<V>, end: V) -> Vec<V> {
    std::iter::once(first).chain(grade_start).chain(std::iter::once(end)).collect()
}

/// Paired standard Halo trigger volumes in native world coordinates.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartitionSwitch {
    pub name: String,
    pub geometry: maps::ScenarioLogicVolumeGeometry,
}

fn partition_switch(
    from: usize, to: usize, front: V, forward: V, width: f32, height: f32,
) -> PartitionSwitch {
    let sideways = [-forward[1], forward[0], 0.];
    let corner = add(front, mul(sideways, -f64::from(width) / 2.));
    PartitionSwitch {
        name: format!("bsp{from},{to}"),
        geometry: maps::ScenarioLogicVolumeGeometry {
            forward: forward.map(|x| x as f32), up: [0., 0., 1.],
            corner: [corner[0] as f32, corner[1] as f32, corner[2] as f32 - 0.2],
            dimensions: [0.9, width, height + 0.4],
        },
    }
}

pub struct PreservedConnector {
    pub geometry: AssemblyGeometry,
    pub switches: [PartitionSwitch; 4],
    pub overlaps: [[V; 2]; 2],
}

pub struct PartitionedAssembly {
    pub base: Option<AssemblyGeometry>,
    pub donor: AssemblyGeometry,
    pub switches: [PartitionSwitch; 2],
    pub overlap: [V; 2],
    pub overlap_samples: usize,
    pub max_floor_delta: f64,
}

pub fn generate(
    base_path: &Path,
    base: &MapInspection,
    assembly: &BspAssembly,
    cancel: &AtomicBool,
) -> Result<AssemblyGeometry> {
    generate_end(base_path, base, assembly, cancel, None, &[]).map(|(geometry, _)| geometry)
}

fn generate_end(
    base_path: &Path, base: &MapInspection, assembly: &BspAssembly, cancel: &AtomicBool,
    partition: Option<(&PartitionRoute, PartitionEnd)>, inherited: &[BspAssembly],
) -> Result<(AssemblyGeometry, Option<Vec<f64>>)> {
    assembly.validate()?;
    if assembly.base_bsp_index >= base.mesh.parts.len()
        || (base.mesh.parts.len() != 1 && !matches!(partition, Some((_, PartitionEnd::Donor))))
    {
        return invalid("Choose an existing base BSP. A multi-BSP source can only receive a separate donor BSP.");
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
    let (base_mesh, base_faces) = maps::collision_shell_source(base_path, base)?;
    let (donor_mesh, donor_faces) =
        maps::collision_shell_source(&assembly.donor_source.preserved_path, &donor)?;
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
        verify_entrance(&base_mesh, &base_faces, assembly.base_bsp_index, [0.;3], 0., route.tunnel_points[0])
            .map_err(|e| SparkError::Invalid(format!("{label} entrance: {e}")))?;
        verify_entrance(&donor_mesh, &donor_faces, route.donor_bsp_index, route.translation,
            route.yaw_degrees, *route.tunnel_points.last().unwrap())
            .map_err(|e| SparkError::Invalid(format!("{label} exit: {e}")))?;
    }
    let mut route_geometry = assembly.clone();
    if let Some((seam, end)) = partition {
        route_geometry.tunnel_points = match end {
            PartitionEnd::Base => vec![seam.start, seam.cap_after],
            PartitionEnd::Donor => donor_partition_points(seam.cap_before, seam.donor_grade_start, seam.end),
        };
    }
    let routes = route_geometry.connection_routes();
    let mut materials = vec![];
    let mut generated_uv_faces = 0;
    let left = (!matches!(partition, Some((_, PartitionEnd::Donor)))).then(|| source_solid(
        base,
        &base_mesh,
        &base_faces,
        0,
        0,
        [0.; 3],
        0.,
        assembly.terrain_seam.as_ref().map(|seam| seam.base_shader_path.as_str()),
        &mut materials,
        &mut generated_uv_faces,
    )).transpose()?;
    let right = (!matches!(partition, Some((_, PartitionEnd::Base)))).then(|| source_solid(
        &donor,
        &donor_mesh,
        &donor_faces,
        assembly.donor_bsp_index,
        1,
        assembly.translation.map(f64::from),
        assembly.yaw_degrees as f64,
        assembly.terrain_seam.as_ref().map(|seam| seam.donor_shader_path.as_str()),
        &mut materials,
        &mut generated_uv_faces,
    )).transpose()?;
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
            let (mut combined, right) = match (left, right) {
                (Some(left), right) => (left, right),
                (None, Some(right)) => (right, None),
                (None, None) => return invalid("No source BSP selected for rebuild"),
            };
            let right = if assembly.terrain_seam.is_some() {
                let right = right.ok_or_else(|| SparkError::Invalid("The terrain seam needs two regions".into()))?;
                Some(terrain::trim_donor(right, &donor, &donor_mesh, &donor_faces, assembly, sky_material.unwrap(), &token)?)
            } else { right };
            let mut road_support=None;
            if let (Some(ribbon),Some(slots))=(&terrain_ribbon,terrain_materials){
                let generated = ribbon.solid(assembly, slots, sky_material.unwrap())?;
                let generated = ribbon.preserve_teleporter_floors(generated, &combined, base_path, base,
                    &base_mesh, assembly.base_bsp_index, ([0.; 3],0.), slots[0], lowest_source - 1., &token,false)?;
                let donor_space = right.as_ref().ok_or_else(|| SparkError::Invalid("The terrain seam needs its stock donor".into()))?;
                let generated = ribbon.preserve_teleporter_floors(generated, donor_space, &assembly.donor_source.preserved_path, &donor,
                    &donor_mesh, assembly.donor_bsp_index, (assembly.translation,assembly.yaw_degrees), slots[1], lowest_source - 1., &token,false)?;
                if assembly.terrain_seam.as_ref().is_some_and(|seam|seam.grade_road) {
                    let support=ribbon.road_support(assembly,slots)?;
                    let support=ribbon.preserve_teleporter_floors(support,&combined,base_path,base,
                        &base_mesh,assembly.base_bsp_index,([0.;3],0.),slots[0],lowest_source-1.,&token,true)?;
                    road_support=Some(ribbon.preserve_teleporter_floors(support,donor_space,&assembly.donor_source.preserved_path,&donor,
                        &donor_mesh,assembly.donor_bsp_index,(assembly.translation,assembly.yaw_degrees),slots[1],lowest_source-1.,&token,true)?);
                }
                combined=checked(combined.boolean_with_engine_and_token(&generated,OpType::Add,BooleanEngine::Auto,Some(&token)),"Terrain seam join")?;
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
            let mut united = if let Some(right) = right {
                checked(combined.boolean_with_engine_and_token(
                    &right, OpType::Add, BooleanEngine::Auto, Some(&token),
                ), "Donor join")?
            } else { combined };
            if let Some(support)=road_support {
                united=checked(united.boolean_with_engine_and_token(&support,OpType::Subtract,BooleanEngine::Auto,Some(&token)),
                    "Graded terrain road support")?;
            }
            if matches!(partition, Some((seam, PartitionEnd::Donor)) if seam.separation_axis[2] != 0.) {
                // Where the approach crosses an outdoor region, its ramp
                // must remain solid even above the donor's lower ground.
                united = support_high_ground(
                    united, &routes[0], passage_materials[0], lowest_source - 0.25, Some(&token),
                )?;
            }
            if assembly.fit_passage_floor {
                united=fit_passage_floor(united,&routes[0],passage_materials[0],Some(&token))?;
            }
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
    let mut weld_materials = Vec::new();
    if let Some(terrain_slots) = terrain_materials {
        weld_materials.extend(terrain_slots);
        if assembly.high_ground.is_some() {
            weld_materials.push(passage_materials[1 + usize::from(assembly.infantry_tunnel.is_some())]);
        }
    } else if matches!(partition, Some((_, PartitionEnd::Donor))) || assembly.fit_passage_floor {
        // A tunnel breaking into a retained floor can leave short Boolean
        // edges at the join. Restore those edges before needle refinement.
        weld_materials.extend(passage_materials.iter().copied());
    }
    let welded = if weld_materials.is_empty() {
        0
    } else {
        let stock_points = base_mesh.positions.chunks_exact(3)
            .map(|p| [p[0].into(), p[1].into(), p[2].into()])
            .chain(donor_mesh.positions.chunks_exact(3).map(|p| {
                transform([p[0].into(), p[1].into(), p[2].into()], assembly.translation, assembly.yaw_degrees)
            }))
            .collect::<Vec<_>>();
        crate::bsp_triangulate::weld_generated_slivers(&mut gl, &weld_materials, &stock_points)
    };
    for material in passage_materials.iter().copied().chain(terrain_materials.into_iter().flatten()) { crate::bsp_triangulate::refine_native_needles(&mut gl, MAX_OUTPUT_TRIANGLES, material as u64)?; }
    let (mut mesh, mut triangle_materials) = collision_layer(&gl, &mut materials)?;
    // The base half does not contain the donor boundary to be sealed.
    if !matches!(partition, Some((_, PartitionEnd::Base))) {
        seam_sections::append_native_seals(&assembly.native_seals, &mut mesh, &mut materials, &mut triangle_materials)?;
    }
    for point in mesh.positions.chunks_exact(3) {
        validate_native_bsp_point([point[0].into(), point[1].into(), point[2].into()])?;
    }
    let mut clearance_route = route_geometry.clone();
    clearance_route.separate_native_bsps = false;
    clearance_route.base_bsp_index = 0;
    if let Some((seam, end)) = partition {
        // Keep clearance samples away from each partition’s own closed cap.
        clearance_route.tunnel_points = match end {
            PartitionEnd::Base => vec![seam.start, seam.overlap_after],
            PartitionEnd::Donor => donor_partition_points(seam.overlap_before, seam.donor_grade_start, seam.end),
        };
    }
    let checker = crate::bsp_clearance::RouteChecker::new(&mesh)?;
    let mut route_clearance = checker.verify_details(&clearance_route)?;
    if matches!(partition, Some((_, PartitionEnd::Donor))) || assembly.fit_passage_floor
        || assembly.terrain_seam.as_ref().is_some_and(|seam|seam.bearing_degrees.is_some()) {
        checker.verify_return(&clearance_route)?;
    }
    for previous in inherited {
        route_clearance.extend(checker.verify_details(previous).map_err(|error| SparkError::Invalid(format!("Inherited {} route: {error}", previous.donor_title)))?);
    }
    let overlap_floor = partition.map(|(seam, _)| checker.floor_profile([seam.overlap_before, seam.overlap_after])).transpose()?;
    let walk_samples = route_clearance.iter().map(|route|route.walk_samples).sum();
    // At native render precision, another diagonal can eliminate a sliver
    // without moving the exported positions or crossing a material/UV seam.
    // The collision hull and its original surface flags are already sealed.
    let retriangulated = crate::bsp_triangulate::improve_native_render(&mut gl);
    let ridge_projection = assembly.high_ground.as_ref().and_then(|ridge| {
        let seam = assembly.terrain_seam.as_ref()?;
        let ribbon = terrain_ribbon.as_ref()?;
        if !ridge.shader_path.replace('\\', "/").eq_ignore_ascii_case(&seam.base_shader_path.replace('\\', "/")) {
            return None;
        }
        let slot = passage_materials[1 + usize::from(assembly.infantry_tunnel.is_some())];
        Some((slot, ribbon.base_projection()))
    });
    let collapsed = append_render_faces(&gl, &materials, &mut mesh, &mut triangle_materials, ridge_projection)?;
    let connector_triangles = triangle_materials.iter().filter(|&&slot|
        slot >= first_connector_material && materials[slot].shader_path.is_some() && !materials[slot].collision_only
    ).count();
    if !matches!(partition, Some((_, PartitionEnd::Donor))) {
        append_source_surface_effects(base, assembly.base_bsp_index, 0, [0.; 3], 0.,
            &mut mesh, &mut materials, &mut triangle_materials, &[])?;
    }
    if !matches!(partition, Some((_, PartitionEnd::Base))) {
        let water_exclusions = if matches!(partition, Some((_, PartitionEnd::Donor))) {
            enclosed_passage_planes(&route_geometry.tunnel_points,
                route_geometry.tunnel_width.into(), route_geometry.tunnel_height.into())?
        } else {
            Vec::new()
        };
        append_source_surface_effects(&donor, assembly.donor_bsp_index, 1, assembly.translation, assembly.yaw_degrees,
            &mut mesh, &mut materials, &mut triangle_materials, &water_exclusions)?;
    }
    mesh.parts.push(maps::MeshPart {
        name: "Connected world".into(),
        index_start: 0,
        index_count: mesh.indices.len(),
    });
    let mut portal_count = add_portals(
        &mut mesh,
        &mut materials,
        &mut triangle_materials,
        &route_geometry,
        &base_mesh,
        &donor_mesh,
        terrain_ribbon.as_ref().map(|ribbon|ribbon.boundary),
        partition.map(|(seam, end)| (end, seam.separation_axis)),
    )?;
    let exact_sky_portals = if assembly.restore_donor_sky_portals {
        donor_sky_portal_outlines(assembly, &donor)?
    } else {
        Vec::new()
    };
    portal_count += append_exact_portals(
        &exact_sky_portals, &mut mesh, &mut materials, &mut triangle_materials,
    )?;
    let base_input = if matches!(partition, Some((_, PartitionEnd::Donor))) { 0 } else { base_mesh.indices.len() / 3 };
    let donor_input = if matches!(partition, Some((_, PartitionEnd::Base))) { 0 } else { donor_mesh.parts[assembly.donor_bsp_index].index_count / 3 };
    let donor_scenery = if donor_input == 0 { 0 } else { donor_scenery };

    let rebuild_scope = if partition.is_some() {
        "Separate BSPs rebuild collision, portals and lightmaps. The build imports donor multiplayer pickups. MCC13 also imports donor starts and teleporters. Review per-cluster ambience, scenery and other gameplay separately."
    } else {
        "This rebuild regenerates collision, portals and lightmaps. Original per-cluster weather, sound and render-only details require review. Donor scenery is optional. Campaign actors, scripts and gameplay objects are outside this build."
    };
    let mut warnings = vec!["Route samples check a standing biped against BSP triangles. Vehicle turning, scenery collision, exposed ridge access and cross-region sniper visibility require separate native game tests.".into(),rebuild_scope.into(),"UVs are projected from source render surfaces where available. Unmatched collision-only surfaces use generated planar UVs.".into(),"A compiled clearance test and successful boot do not replace a manual player walkthrough, including scenery collision at the entrances.".into()];
    if welded > 0 {
        warnings.push(format!("Welded {welded} short intersection edges at the connection while keeping its stock vertices and material seams. Review the repaired join before building."));
    }
    if retriangulated > 0 || collapsed > 0 {
        warnings.push(format!("Render repair applied to this preview. Retriangulated {retriangulated} coplanar pairs and omitted {collapsed} fragments with zero export area. Review the repaired surfaces before building."));
    }
    Ok((AssemblyGeometry{report:AssemblyReport{input_triangles:base_input+donor_input,output_triangles:mesh.indices.len()/3,connector_triangles,generated_uv_faces,walk_samples,portal_count,route_clearance,donor_scenery,warnings},mesh,materials,triangle_materials,exact_sky_portals}, overlap_floor))
}
fn is_source_surface_effect(tag: &maps::Tag) -> bool {
    if tag.class == "swat" {
        return true;
    }
    if !matches!(tag.class.as_str(), "schi" | "scex") {
        return false;
    }
    let name = tag.path.rsplit(['/', '\\']).next().unwrap_or_default().to_ascii_lowercase();
    ["waterfall", "water fall", "light", "glow", "gseffect"].iter().any(|part| name.contains(part))
}

type PassagePlanes = [(V, V); 6];

fn enclosed_passage_planes(path: &[V], width: f64, height: f64) -> Result<Vec<PassagePlanes>> {
    let sides = tunnel_sides(path, width)?;
    Ok(path.windows(2).zip(sides.windows(2)).map(|(points, sides)| {
        let corners = passage_corners(points[0], points[1], sides[0], sides[1], height);
        let inside = add(mul(add(points[0], points[1]), 0.5), [0., 0., height * 0.5]);
        std::array::from_fn(|i| {
            let [a, b, c] = LEVEL_PASSAGE_TRIANGLES[i * 2].map(|corner| corners[corner]);
            let n = normal(a, b, c);
            (a, if dot(n, sub(inside, a)) < 0. { mul(n, -1.) } else { n })
        })
    }).collect())
}

/// Remove only the part of a source water triangle inside the closed passage.
/// Each split leaves a convex polygon, with unchanged vertices outside the cut.
fn exclude_passage_water(triangle: [V; 3], volumes: &[PassagePlanes]) -> Vec<Vec<V>> {
    use crate::bsp_clearance::clip_connector_face;

    let mut polygons = vec![triangle.to_vec()];
    let mut clipped = Vec::new();
    for planes in volumes {
        let mut outside = Vec::new();
        for polygon in polygons {
            let mut inside = polygon.clone();
            let mut fragments = Vec::new();
            for &(origin, normal) in planes {
                let distance = |point: V| dot(normal, sub(point, origin));
                if inside.iter().all(|&point| distance(point) >= 0.) {
                    continue;
                }
                let mut fragment = inside.clone();
                clip_connector_face(&mut fragment, &mut clipped, |point| -distance(point));
                if fragment.len() >= 3 {
                    fragments.push(fragment);
                }
                clip_connector_face(&mut inside, &mut clipped, distance);
                if inside.len() < 3 {
                    break;
                }
            }
            let cuts_area = inside.len() >= 3 && inside[1..].windows(2).any(|pair| {
                let area = cross(sub(pair[0], inside[0]), sub(pair[1], inside[0]));
                dot(area, area) > 1e-16
            });
            if !cuts_area {
                outside.push(polygon);
            } else {
                outside.extend(fragments);
            }
        }
        polygons = outside;
    }
    polygons
}

// Preserve noncolliding water and illuminated panels with their native materials.
fn append_source_surface_effects(
    inspection: &MapInspection,
    bsp_index: usize,
    source: usize,
    translation: V,
    yaw: f64,
    mesh: &mut MeshData,
    materials: &mut Vec<AssemblyMaterial>,
    slots: &mut Vec<usize>,
    water_exclusions: &[PassagePlanes],
) -> Result<()> {
    let Some(render) = inspection.render_mesh.as_ref() else { return Ok(()); };
    let restored: BTreeSet<_> = materials.iter().filter(|m| m.source == source).filter_map(|m| m.shader_path.clone()).collect();
    let mut effect_slots = BTreeMap::new();
    for range in render.material_ranges.iter().filter(|range| range.bsp_index == bsp_index) {
        let Some(tag) = inspection.tags.iter().find(|tag| tag.id == range.shader_tag_id) else { continue; };
        if !is_source_surface_effect(tag) || restored.contains(&tag.path) {
            continue;
        }
        if range.shader_permutation != 0 {
            return invalid(format!("Source surface effect shader {} uses an unsupported shader permutation", tag.path));
        }
        let end = range.index_start.checked_add(range.index_count)
            .ok_or_else(|| SparkError::Invalid("Source surface effect triangle range exceeds the source mesh".into()))?;
        let indices = render.indices.get(range.index_start..end)
            .filter(|indices| indices.len() % 3 == 0)
            .ok_or_else(|| SparkError::Invalid("Source surface effect has incomplete source triangles".into()))?;
        if slots.len() + indices.len() / 3 > MAX_OUTPUT_TRIANGLES {
            return invalid("Preserving native surface effects would exceed the BSP output triangle budget");
        }
        let slot = *effect_slots.entry(tag.id).or_insert_with(|| {
            let slot = materials.len();
            materials.push(AssemblyMaterial {
                // Keep an identifiable alias when this build becomes a subsequent donor.
                name: format!("gseffect{}m{}x", &inspection.sha256[..8], slot),
                source,
                shader_path: Some(tag.path.clone()),
                shader_class: Some(tag.class.clone()),
                flags: 0,
                collision_only: false,
            });
            slot
        });
        for triangle in indices.chunks_exact(3) {
            let mut points = [[0.; 3]; 3];
            let mut normals = [[0.; 3]; 3];
            let mut uvs = [[0.; 2]; 3];
            for (corner, &id) in triangle.iter().enumerate() {
                let id = id as usize;
                let point = render.positions.get(id*3..id*3+3);
                let normal = render.normals.get(id*3..id*3+3);
                let uv = render.uvs.get(id*2..id*2+2);
                let (Some(point), Some(normal), Some(uv)) = (point, normal, uv) else {
                    return invalid("Source surface effect is missing its original render vertices, normals or UVs");
                };
                points[corner] = transform([point[0].into(), point[1].into(), point[2].into()], translation, yaw);
                validate_native_bsp_point(points[corner])?;
                normals[corner] = transform([normal[0].into(), normal[1].into(), normal[2].into()], [0.; 3], yaw);
                uvs[corner] = [f64::from(uv[0]), f64::from(uv[1])];
                if normals[corner].iter().chain(&uvs[corner]).any(|value| !value.is_finite()) {
                    return invalid("Source surface effect has non-finite native normals or UVs");
                }
            }
            let volumes = if tag.class == "swat" { water_exclusions } else { &[] };
            let source = RenderTri { p: points, n: normal(points[0], points[1], points[2]), uv: uvs };
            for polygon in exclude_passage_water(points, volumes) {
                for pair in polygon[1..].windows(2) {
                    let surface = [polygon[0], pair[0], pair[1]];
                    let exported = surface.map(|point| point.map(|axis| f64::from(axis as f32)));
                    let edge = cross(sub(exported[1], exported[0]), sub(exported[2], exported[0]));
                    if !volumes.is_empty() && surface != points && dot(edge, edge) <= 1e-16 {
                        continue;
                    }
                    if slots.len() >= MAX_OUTPUT_TRIANGLES {
                        return invalid("Clipping native water would exceed the BSP output triangle budget");
                    }
                    for point in surface {
                        let weights = if let Some(corner) = points.iter().position(|&p| p == point) {
                            std::array::from_fn(|i| if i == corner { 1. } else { 0. })
                        } else {
                            bary(point, &source).ok_or_else(|| SparkError::Invalid(
                                "Could not preserve UV coordinates at a cut water edge".into()))?
                        };
                        let interpolate = |values: [f64; 3]| {
                            (0..3).map(|i| values[i] * weights[i]).sum::<f64>() as f32
                        };
                        mesh.indices.push((mesh.positions.len()/3) as u32);
                        mesh.positions.extend(point.map(|value| value as f32));
                        mesh.normals.extend((0..3).map(|axis| interpolate(normals.map(|n| n[axis]))));
                        mesh.uvs.extend((0..2).map(|axis| interpolate(uvs.map(|uv| uv[axis]))));
                    }
                    slots.push(slot);
                }
            }
        }
    }
    Ok(())
}
fn append_render_faces(
    gl: &MeshGL64,
    materials: &[AssemblyMaterial],
    mesh: &mut MeshData,
    slots: &mut Vec<usize>,
    terrain_projection: Option<(usize, &RenderTri)>,
) -> Result<usize> {
    let mut collapsed = 0;
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
        // A Boolean can leave render fragments with no area at JMS precision.
        // Collision was emitted separately. These fragments cover no surface in
        // the export, even if their original double-precision coordinates differ.
        if triangle_area_normal(points.map(native_export_point)) == [0.; 3] {
            collapsed += 1;
            continue;
        }
        let points = points.map(|point| point.map(|axis| f64::from(axis as f32)));
        let n = normal(points[0], points[1], points[2]);
        for (v, p) in points.iter().enumerate() {
            mesh.positions.extend(p.map(|x| x as f32));
            mesh.normals.extend(n.map(|x| x as f32));
            let uv = match terrain_projection {
                Some((terrain_slot, projection)) if slot == terrain_slot => {
                    terrain::ridge_uv(*p, n, projection)?.map(|value| value as f32)
                }
                _ => [
                    gl.vert_properties[order[v] as usize * 5 + 3] as f32,
                    gl.vert_properties[order[v] as usize * 5 + 4] as f32,
                ],
            };
            mesh.uvs.extend(uv);
        }
        mesh.indices
            .extend([first as u32, first as u32 + 1, first as u32 + 2]);
        slots.push(slot);
    }
    Ok(collapsed)
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
        // The portal sectioner operates on the original manifold. Reviewed
        // native seals close holes that Tool introduces when it omits two-sided
        // faces from its structural hull.
        if matches!(material.name.as_str(), "+seamsealer" | "+portal" | "+exactportal") || !material.collision_only && material.shader_path.is_some() {
            continue;
        }
        let start=gl.num_vert() as u64;
        for id in [t[0],t[2],t[1]]{gl.vert_properties.extend(mesh.positions[id as usize*3..id as usize*3+3].iter().map(|&v|f64::from(v)));}
        gl.tri_verts.extend([start,start+1,start+2]);gl.face_id.push(0);
    }
    gl.merge();checked(Manifold::from_mesh_gl64_robust(&gl),"Native visibility source import")
}
fn projected_bounds(mesh: &MeshData, index: usize, translation: V, yaw: f64, direction: V) -> Result<[f64; 2]> {
    let part = mesh.parts.get(index).ok_or_else(|| SparkError::Invalid("Missing corridor source BSP".into()))?;
    let mut bounds = [f64::INFINITY, f64::NEG_INFINITY];
    for &id in &mesh.indices[part.index_start..part.index_start + part.index_count] {
        let distance = dot(transform(vertex(mesh, id), translation, yaw), direction);
        bounds[0] = bounds[0].min(distance);
        bounds[1] = bounds[1].max(distance);
    }
    if !bounds.iter().all(|value| value.is_finite()) { return invalid("No usable collision bounds for the corridor source"); }
    Ok(bounds)
}

fn add_portals(
    mesh: &mut MeshData,
    materials: &mut Vec<AssemblyMaterial>,
    slots: &mut Vec<usize>,
    assembly: &BspAssembly,
    base: &MeshData,
    donor: &MeshData,
    terrain_boundary: Option<terrain::Boundary>,
    partition: Option<(PartitionEnd, V)>,
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
    if assembly.terrain_seam.as_ref().is_some_and(|seam|seam.bearing_degrees.is_none()) {
        if let Some(boundary)=terrain_boundary {donor_bounds.0[0]=boundary.donor_min;}
    }
    let inside = |p: V, b: (V, V)| (0..3).all(|k| p[k] >= b.0[k] - 0.1 && p[k] <= b.1[k] + 0.1);
    // Diagonal corridors can be outside the region along their heading
    // even while they are inside its world-aligned bounding rectangle.
    let along = sub(*assembly.tunnel_points.last().unwrap(), assembly.tunnel_points[0]);
    let aim = mul([along[0], along[1], 0.], 1. / along[0].hypot(along[1]));
    let axis = partition.map_or(aim, |(_, axis)| axis);
    let projection = match partition {
        Some((PartitionEnd::Base, _)) => Some(projected_bounds(base, 0, [0.; 3], 0., axis)?),
        Some((PartitionEnd::Donor, _)) => Some(projected_bounds(donor, assembly.donor_bsp_index, assembly.translation, assembly.yaw_degrees, axis)?),
        None => None,
    };
    let inside_retained_source = |p| projection.map_or_else(
        || inside(p, base_bounds) || inside(p, donor_bounds),
        |[low, high]| (low - 0.1..=high + 0.1).contains(&dot(p, axis)),
    );
    // Authored sections can widen or cross the primary passage just like the
    // outdoor terrain join. A route-sized portal cannot close that joined air
    // volume; slice its actual source boundary and share coincident cuts.
    let source_space=if assembly.terrain_seam.is_some() || !assembly.sections.is_empty(){Some(visibility_solid(mesh,slots,materials)?)}else{None};
    let slot = materials.len();
    let mut count = 0;
    let mut native_cuts:Vec<Vec<[u32;3]>>=vec![];
    let mut generated_cuts:Vec<([[f64;3];4],bool)>=vec![];
    for (route_index, route) in assembly.connection_routes().into_iter().enumerate() {
    let inside_route_source=|p|{
        if let Some(boundary)=terrain_boundary.filter(|_|route.terrain_seam.as_ref().is_some_and(|seam|seam.bearing_degrees.is_some())){
            let along=dot(p,boundary.axis);
            along<=boundary.base_max+0.1||along>=boundary.donor_min-0.1
        }else{inside_retained_source(p)}
    };
    let before = count;let mut covered_by_shared_cut=false;
    for (segment,end) in portal_spans(&route) {
        let (a,b)=(route.tunnel_points[segment],route.tunnel_points[end]);
        let d = sub(b, a);
        let candidates: Vec<_> = route.tunnel_points[segment..=end].windows(2).flat_map(|pair|{
            let delta=sub(pair[1],pair[0]);let steps=(delta[0].hypot(delta[1])/0.4).ceil() as usize;
            (1..steps).map(move|n|add(pair[0],mul(delta,n as f64/steps as f64)))
        }).filter(|p| !inside_route_source(*p)).collect();
        let authored = crate::bsp_visibility::authored_centers(&route.visibility_zones, &route.tunnel_points, segment)?;
        if authored.is_none() && candidates.len() < 4 {
            continue;
        }
        let [first, last] = authored.unwrap_or_else(||if route.terrain_seam.is_some(){[candidates[0],*candidates.last().unwrap()]}else{[candidates[candidates.len() / 3],candidates[candidates.len() * 2 / 3]]});
        if [first,last].iter().any(|p|inside_route_source(*p)) {
            return invalid("Authored visibility cuts must lie in an isolated tunnel segment outside both source BSP bounds; move the portal handles or choose a longer segment");
        }
        let separation_squared=dot(sub(first,last),sub(first,last));
        if authored.is_some() && separation_squared<0.25-1e-8 {
            return invalid("Authored visibility cuts are too close together");
        } else if authored.is_none() && separation_squared<0.25 {
            continue;
        }
        // A placed terrain join opens along the Atlas boundary. An oblique
        // road must not tilt that full-height cut back through retained terrain.
        let cut_direction = route.terrain_seam.as_ref()
            .filter(|seam| seam.bearing_degrees.is_some())
            .map_or(d, TerrainSeam::axis);
        for center in [first, last] {
            let portal_height=route.tunnel_height as f64+if route.arch_segments.is_some(){route.tunnel_width as f64/2.}else{0.};
            let points = if let Some(seam)=&route.terrain_seam {
                // A road-width rectangle cannot split the full outdoor seam.
                // Let Halo Tool clip this source-bounded plane against its banks.
                let bottom=base_bounds.0[2].min(donor_bounds.0[2])-0.1;
                let roof=base_bounds.1[2].max(donor_bounds.1[2])+0.25;
                terrain::portal([center[0],center[1],bottom],cut_direction,route.tunnel_width as f64+2.*seam.shoulder_width,roof)?
            }else if authored.is_some(){crate::bsp_visibility::authored_portal_quad(center,d,route.tunnel_width as f64,portal_height)?}else{crate::bsp_visibility::portal_quad(center,d,route.tunnel_width as f64,portal_height)?};
            if generated_cuts.iter().any(|(previous,was_authored)|(*was_authored||authored.is_some())&&crate::bsp_visibility::portals_intersect(previous,&points)) {
                return invalid("Authored visibility planes cross or overlap another portal. Move the handles away from the tunnel bend or other cuts");
            }
            let surface=if let Some(space)=&source_space {
                crate::bsp_visibility::clipped_portal(space,center,cut_direction,(route.tunnel_height as f64*0.5).min(0.8))?
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
fn donor_sky_portal_outlines(plan: &BspAssembly, donor: &MapInspection) -> Result<Vec<Vec<V>>> {
    if plan.donor_source.sha256 != donor.sha256 {
        return invalid("Restored sky portal donor changed after it was selected");
    }
    let path = &plan.donor_source.preserved_path;
    let source = crate::bsp_audio::inspect_ambience_for_bsp(path, &donor.sha256, Some(plan.donor_bsp_index))?;
    let clusters = &source.bsps.first().ok_or_else(|| SparkError::Invalid("Donor BSP has no native visibility data".into()))?.clusters;
    let portals = maps::compiled_portals(path, donor, plan.donor_bsp_index)?;
    portals.into_iter().enumerate().filter_map(|(index, portal)| {
        let front = clusters.get(usize::try_from(portal.front_cluster).ok()?)?;
        let back = clusters.get(usize::try_from(portal.back_cluster).ok()?)?;
        (front.sky != back.sky).then_some((index, portal))
    }).map(|(index, portal)| {
        if portal.flags != 0 {
            return invalid(format!("Donor sky portal {index} has native flags that require source review"));
        }
        Ok(portal.ring.into_iter().map(|point| transform(point, plan.translation, plan.yaw_degrees)).collect())
    }).collect()
}

fn append_exact_portals(
    outlines: &[Vec<V>],
    mesh: &mut MeshData,
    materials: &mut Vec<AssemblyMaterial>,
    slots: &mut Vec<usize>,
) -> Result<usize> {
    let cuts = outlines.iter().map(|points| {
        let triangles = crate::bsp_visibility::exact_outline_triangles(points)?;
        Ok((points, triangles))
    }).collect::<Result<Vec<_>>>()?;
    let triangles: usize = cuts.iter().map(|(_, indices)| indices.len()).sum();
    if mesh.indices.len() / 3 + triangles > MAX_OUTPUT_TRIANGLES {
        return invalid("Restored donor sky portals exceed the connected source triangle budget");
    }
    if cuts.is_empty() {
        return Ok(0);
    }
    let slot = materials.iter().position(|material| material.name == "+exactportal")
        .unwrap_or_else(|| {
            let slot = materials.len();
            materials.push(AssemblyMaterial {
                name: "+exactportal".into(),
                source: 1,
                shader_path: None,
                shader_class: None,
                flags: 0,
                collision_only: false,
            });
            slot
        });
    for (points, triangles) in &cuts {
        let [a, b, c] = triangles[0].map(|index| points[index]);
        let n = normal(a, b, c);
        let first = (mesh.positions.len() / 3) as u32;
        for point in *points {
            mesh.positions.extend(point.map(|axis| axis as f32));
            mesh.normals.extend(n.map(|axis| axis as f32));
            mesh.uvs.extend([0., 0.]);
        }
        for triangle in triangles {
            mesh.indices.extend(triangle.map(|index| first + index as u32));
            slots.push(slot);
        }
    }
    Ok(cuts.len())
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
    let mut geometry = generate(&source.preserved_path, base, assembly, cancel)?;
    retain_base_portals(project, base, &mut geometry)?;
    add_outdoor_sky_splits(project, assembly, &mut geometry)?;
    Ok(geometry)
}

fn outdoor_cut(plan: &BspAssembly) -> Option<(V, V)> {
    let (Some(fraction), [start, end]) = (plan.outdoor_sky_split, plan.tunnel_points.as_slice()) else {
        return None;
    };
    let delta = sub(*end, *start);
    Some((add(*start, mul(delta, fraction)), delta))
}

pub(crate) fn outdoor_sky_witnesses(plan: &BspAssembly) -> Option<[[f32; 3]; 2]> {
    let (center, delta) = outdoor_cut(plan)?;
    let shift = mul(delta, 0.5 / delta[0].hypot(delta[1]));
    let eye = add(center, [0., 0., 0.65]);
    Some([sub(eye, shift), add(eye, shift)].map(|point| point.map(|axis| axis as f32)))
}

pub(crate) fn outdoor_stock_sky(plan: &BspAssembly) -> Result<String> {
    let source = &plan.donor_source;
    let metadata = crate::bsp_audio::inspect_ambience_for_bsp(&source.preserved_path, &source.sha256, Some(plan.donor_bsp_index))?;
    let slots = metadata.bsps.first().ok_or_else(|| SparkError::Invalid("Stock sky source has no selected BSP".into()))?
        .clusters.iter().filter_map(|cluster| usize::try_from(cluster.sky).ok()).collect::<std::collections::BTreeSet<_>>();
    if slots.len() != 1 { return invalid(format!("{} must have one original outdoor sky on the selected BSP", plan.donor_title)); }
    metadata.skies.get(*slots.first().unwrap()).and_then(Option::as_ref).cloned()
        .ok_or_else(|| SparkError::Invalid("Original outdoor sky dependency is missing".into()))
}

pub(crate) fn verify_compiled_outdoor_sky_splits(project: &Project, path: &Path, map: &MapInspection) -> Result<usize> {
    let cuts = project.inherited_bsp_connections.iter().chain(project.bsp_assembly.iter())
        .filter_map(|plan| outdoor_sky_witnesses(plan).map(|witnesses| (plan, witnesses))).collect::<Vec<_>>();
    if cuts.is_empty() { return Ok(0); }
    let ambience = crate::bsp_audio::inspect_ambience_for_bsp(path, &map.sha256, Some(0))?;
    let native = ambience.bsps.first().ok_or_else(|| SparkError::Invalid("Outdoor sky split output has no BSP".into()))?;
    let tree = native.listener_tree.as_ref()
        .ok_or_else(|| SparkError::Invalid("Outdoor sky split output has no native cluster tree".into()))?;
    for (plan, [base, donor]) in &cuts {
        let behind = tree.cluster_at(*base);
        let ahead = tree.cluster_at(*donor);
        if behind.is_none() || ahead.is_none() || behind == ahead {
            return invalid(format!("Outdoor sky split at ({:.2}, {:.2}, {:.2}) did not separate native road clusters. Adjust the seam plane before accepting this build.", donor[0], donor[1], donor[2]));
        }
        let read_sky = |cluster: usize| native.clusters.get(cluster)
            .and_then(|cluster| usize::try_from(cluster.sky).ok())
            .and_then(|slot| ambience.skies.get(slot))
            .and_then(Option::as_deref);
        let expected = outdoor_stock_sky(plan)?;
        let equal = |first: &str, second: &str| first.replace('\\', "/").eq_ignore_ascii_case(&second.replace('\\', "/"));
        if !read_sky(ahead.unwrap()).is_some_and(|sky| equal(sky, &expected))
            || read_sky(behind.unwrap()).is_some_and(|sky| equal(sky, &expected))
        {
            return invalid(format!("Compiled {} road clusters did not retain distinct stock sky assignments", plan.donor_title));
        }
    }
    Ok(cuts.len())
}

fn add_outdoor_sky_splits(
    project: &Project,
    assembly: &BspAssembly,
    geometry: &mut AssemblyGeometry,
) -> Result<()> {
    let plans = project.inherited_bsp_connections.iter().chain(std::iter::once(assembly));
    let splits = plans.filter_map(outdoor_cut).collect::<Vec<_>>();
    if splits.is_empty() { return Ok(()); }
    let hull = visibility_solid(&geometry.mesh, &geometry.triangle_materials, &geometry.materials)?;
    let slot = geometry.materials.iter().position(|material| material.name == "+portal")
        .ok_or_else(|| SparkError::Invalid("Outdoor sky split has no native portal material".into()))?;
    for (center, delta) in splits {
        let surface = crate::bsp_visibility::complete_portal_section(&hull, center, delta)?;
        if geometry.mesh.indices.len() / 3 + surface.triangles.len() > MAX_OUTPUT_TRIANGLES {
            return invalid("Outdoor sky boundary exceeds the native source triangle budget");
        }
        let first = (geometry.mesh.positions.len() / 3) as u32;
        let n = [-delta[0] / delta[0].hypot(delta[1]), -delta[1] / delta[0].hypot(delta[1]), 0.];
        for point in surface.points {
            geometry.mesh.positions.extend(point.map(|axis| axis as f32));
            geometry.mesh.normals.extend(n.map(|axis| axis as f32));
            geometry.mesh.uvs.extend([0., 0.]);
        }
        for triangle in surface.triangles {
            geometry.mesh.indices.extend(triangle.map(|i| first + i as u32));
            geometry.triangle_materials.push(slot);
        }
        geometry.report.portal_count += 1;
        geometry.report.output_triangles = geometry.mesh.indices.len() / 3;
    }
    Ok(())
}

fn same_portal_perimeter(a: &[V], b: &[V]) -> bool {
    // Tool can subdivide polygon edges when it welds the exact portal to
    // adjacent structure triangles. Compare continuous edges in both directions.
    const TOLERANCE_SQUARED: f64 = 0.002 * 0.002;
    let is_on_boundary = |point, ring: &[V]| {
        ring.iter().zip(ring.iter().cycle().skip(1)).any(|(&start, &end)| {
            let edge = sub(end, start);
            let length_squared = dot(edge, edge);
            let offset = sub(point, start);
            let residual = if length_squared > 0. {
                sub(offset, mul(edge, (dot(offset, edge) / length_squared).clamp(0., 1.)))
            } else {
                offset
            };
            dot(residual, residual) <= TOLERANCE_SQUARED
        })
    };
    a.len() >= 3 && b.len() >= 3
        && a.iter().all(|&point| is_on_boundary(point, b))
        && b.iter().all(|&point| is_on_boundary(point, a))
}

fn find_compiled_sky_portal(outline: &[V], compiled: &[maps::CompiledPortal]) -> Result<Option<usize>> {
    let mut candidates = compiled.iter().enumerate().filter(|(_, portal)| same_portal_perimeter(outline, &portal.ring));
    let Some((index, portal)) = candidates.next() else {
        return Ok(None);
    };
    if candidates.next().is_some() {
        return invalid("Compiled BSP has overlapping restored sky portals");
    }
    if portal.flags != 0 || portal.front_cluster < 0 || portal.back_cluster < 0
        || portal.front_cluster == portal.back_cluster
    {
        return invalid("A compiled sky portal with the same outline has incompatible flags or cluster boundaries");
    }
    Ok(Some(index))
}

pub(crate) fn verify_compiled_sky_portals(
    manifest: &serde_json::Value,
    path: &Path,
    map: &MapInspection,
) -> Result<usize> {
    let Some(value) = manifest.get("exactSkyPortals") else { return Ok(0) };
    let outlines: Vec<Vec<V>> = serde_json::from_value(value.clone())?;
    if outlines.is_empty() { return Ok(0); }
    let compiled = maps::compiled_portals(path, map, 0)?;
    let mut matched = std::collections::BTreeSet::new();
    for outline in &outlines {
        let index = find_compiled_sky_portal(outline, &compiled)?
            .ok_or_else(|| SparkError::Invalid("Compiled BSP is missing a restored sky portal between distinct clusters".into()))?;
        if !matched.insert(index) {
            return invalid("Authored sky portal outlines overlap");
        }
    }
    Ok(matched.len())
}

fn inherited_sky_portals(
    connections: &[BspAssembly],
    compiled: &[maps::CompiledPortal],
) -> Result<(Vec<Vec<V>>, std::collections::BTreeSet<usize>)> {
    let mut outlines = Vec::new();
    let mut matched = std::collections::BTreeSet::new();
    for plan in connections.iter().filter(|plan| plan.restore_donor_sky_portals) {
        let source = &plan.donor_source;
        let donor = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        for outline in donor_sky_portal_outlines(plan, &donor)? {
            if outlines.iter().any(|previous: &Vec<V>| same_portal_perimeter(previous, &outline)) {
                return invalid(format!("Inherited {} sky portal overlaps another selected doorway", plan.donor_title));
            }
            if let Some(index) = find_compiled_sky_portal(&outline, compiled)
                .map_err(|err| SparkError::Invalid(format!("Inherited {} sky portal: {err}", plan.donor_title)))?
            {
                matched.insert(index);
            }
            // A creator can enable this on an earlier donor whose last build
            // predates sky-portal restoration. The output must still prove a
            // unique exact cut between two clusters before it is accepted.
            outlines.push(outline);
        }
    }
    Ok((outlines, matched))
}

pub(crate) fn verify_compiled_inherited_sky_portals(project: &Project, path: &Path, map: &MapInspection) -> Result<usize> {
    if !project.inherited_bsp_connections.iter().any(|plan| plan.restore_donor_sky_portals) {
        return Ok(0);
    }
    let native = maps::compiled_portals(path, map, 0)?;
    let (expected, matched) = inherited_sky_portals(&project.inherited_bsp_connections, &native)?;
    if matched.len() != expected.len() {
        return invalid("Native BSP partition omitted a restored doorway sky portal");
    }
    Ok(matched.len())
}

fn retain_base_portals(project: &Project, base: &MapInspection, geometry: &mut AssemblyGeometry) -> Result<()> {
    if !project.inherited_bsp_connections.is_empty() {
        let source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing base source".into()))?;
        let slot = geometry.materials.iter().position(|material| material.name == "+portal")
            .ok_or_else(|| SparkError::Invalid("Connected world has no portal source material".into()))?;
        if base.mesh.parts.len() != 1 {
            return invalid("Retaining visibility cuts requires a single compiled BSP");
        }
        let rings = maps::compiled_portals(&source.preserved_path, base, 0)?;
        let (exact, matched) = inherited_sky_portals(&project.inherited_bsp_connections, &rings)?;
        let sky_planes = project.inherited_bsp_connections.iter().chain(project.bsp_assembly.iter())
            .filter_map(outdoor_cut).collect::<Vec<_>>();
        let on_rebuilt_plane = |ring: &[V]| sky_planes.iter().any(|&(center, delta)| ring.iter().all(|&p|
            dot(sub(p, center), [delta[0], delta[1], 0.]).abs() <= 0.002 * delta[0].hypot(delta[1])));
        let cuts: Vec<_> = rings.iter().enumerate()
            .filter(|(index, portal)| !matched.contains(index) && portal.flags == 0 && !on_rebuilt_plane(&portal.ring))
            .filter_map(|(_, portal)| crate::bsp_visibility::retained_tunnel_quad(&portal.ring).ok())
            .collect();
        let needs_review = rings.len() - cuts.len() - matched.len();
        geometry.report.portal_count += append_exact_portals(
            &exact, &mut geometry.mesh, &mut geometry.materials, &mut geometry.triangle_materials,
        )?;
        geometry.exact_sky_portals.extend(exact);
        if needs_review > 0 {
            geometry.report.warnings.push(format!(
                "{needs_review} inherited portal outlines need source review. This rebuild retains the simple tunnel cuts and regenerates visibility for the rest.",
            ));
        }
        if geometry.mesh.indices.len() / 3 + cuts.len() * 2 > MAX_OUTPUT_TRIANGLES {
            return invalid("Retained portal cuts exceed the connected source triangle budget");
        }
        for points in cuts {
            let n = normal(points[0], points[1], points[2]);
            let start = geometry.mesh.positions.len() as u32 / 3;
            for point in points {
                geometry.mesh.positions.extend(point.map(|v| v as f32));
                geometry.mesh.normals.extend(n.map(|v| v as f32));
                geometry.mesh.uvs.extend([0., 0.]);
            }
            geometry.mesh.indices.extend([start, start + 1, start + 2, start, start + 2, start + 3]);
            geometry.triangle_materials.extend([slot, slot]);
            geometry.report.portal_count += 1;
        }
        geometry.report.output_triangles = geometry.mesh.indices.len() / 3;
    }
    Ok(())
}

/// Generate independently closed regions with the same floor through the
/// common passage. The ordinary single-world join remains a separate action.
pub fn generate_partitioned_project(
    project: &Project, base: &MapInspection, cancel: &AtomicBool,
) -> Result<PartitionedAssembly> {
    let source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing base source".into()))?;
    let assembly = project.bsp_assembly.as_ref().ok_or_else(|| SparkError::Invalid("Author a BSP connection first".into()))?;
    assembly.validate()?;
    if !matches!(source.cache_version, 609 | 13) || source.sha256 != base.sha256 || maps::hash_file(&source.preserved_path)? != base.sha256 {
        return invalid("Open the exact preserved CE609 or MCC13 base for a native partition");
    }
    assembly.validate_partition_route()?;
    let start = assembly.tunnel_points[0];
    let end = assembly.tunnel_points[1];
    let delta = sub(end, start);
    let length = delta[0].hypot(delta[1]);
    let direction = mul(delta, 1. / length);
    let aim = [direction[0], direction[1], 0.];
    let donor = maps::inspect_map(&assembly.donor_source.preserved_path, assembly.donor_source.resource_directory.as_deref())?;
    if donor.sha256 != assembly.donor_source.sha256 { return invalid("The preserved donor changed"); }
    if donor.mesh.parts.len() != 1 { return invalid("Choose a donor map with exactly one native BSP"); }
    let base_count = base.mesh.parts.len();
    let retaining = base_count > 1;
    if base_count == 0 || base_count >= 16 || assembly.base_bsp_index >= base_count
        || (retaining && !can_extend_partitions(project, base))
    {
        return invalid("Choose a retained MCC13 assembly with fewer than sixteen native BSPs and an existing entrance slot");
    }
    let port = projected_bounds(&base.mesh, assembly.base_bsp_index, [0.; 3], 0., aim)?[1].max(dot(start, aim));
    let arrival = projected_bounds(&donor.mesh, assembly.donor_bsp_index, assembly.translation, assembly.yaw_degrees, aim)?[0].min(dot(end, aim));
    let separation_axis = if arrival - port >= 8. {
        aim
    } else if retaining {
        // Keep every original BSP physically separate from a vertically
        // offset donor. Only the new ramp and shared landing may cross layers.
        let vertical = [0., 0., if end[2] >= start[2] { 1. } else { -1. }];
        let mut retained_top = f64::NEG_INFINITY;
        for slot in 0..base_count {
            retained_top = retained_top.max(projected_bounds(&base.mesh, slot, [0.; 3], 0., vertical)?[1]);
        }
        let [donor_bottom, _] = projected_bounds(
            &donor.mesh, assembly.donor_bsp_index, assembly.translation, assembly.yaw_degrees, vertical,
        )?;
        if donor_bottom - retained_top < 8. {
            return invalid("Leave eight world units of horizontal separation, or place the entire donor eight units above or below every retained BSP");
        }
        vertical
    } else {
        return invalid("Leave at least eight world units between the projected region bounds for the overlap, caps and visibility cuts");
    };
    // A new corridor enters the existing floor before the retained wall.
    // Its first authored point is the center of the shared switch area.
    let center = if retaining { start } else { add(start, mul(direction, (port + arrival) * 0.5 - dot(start, aim))) };
    let vertical_join = separation_axis[2] != 0.;
    let overlap_direction = if vertical_join { aim } else { direction };
    let offset = |distance| add(center, mul(overlap_direction, distance));
    let seam = PartitionRoute {
        start, end, cap_before: offset(-3.), cap_after: offset(3.),
        overlap_before: offset(-2.3), overlap_after: offset(2.3), separation_axis,
        donor_grade_start: if vertical_join { retained_grade_start(start, end) } else { None },
    };
    let overlap = [seam.overlap_before, seam.overlap_after];
    let (left, left_floor) = if retaining {
        let (collision, _) = maps::collision_source(&source.preserved_path, base)?;
        let checker = crate::bsp_clearance::RouteChecker::for_part(&collision, assembly.base_bsp_index)?;
        let mut approach = assembly.clone();
        // This is a bounded clearance sample, not another authored connection.
        approach.separate_native_bsps = false;
        approach.base_bsp_index = 0;
        approach.tunnel_points = overlap.to_vec();
        checker.verify(&approach).map_err(|e| SparkError::Invalid(format!("Shared passage in retained BSP {}: {e}", assembly.base_bsp_index)))?;
        checker.verify_return(&approach)?;
        (None, Some(checker.floor_profile(overlap)?))
    } else {
        let (mut geometry, floor) = generate_end(&source.preserved_path, base, assembly, cancel, Some((&seam, PartitionEnd::Base)), &project.inherited_bsp_connections)?;
        retain_base_portals(project, base, &mut geometry)?;
        add_outdoor_sky_splits(project, assembly, &mut geometry)?;
        (Some(geometry), floor)
    };
    let (right, right_floor) = generate_end(&source.preserved_path, base, assembly, cancel, Some((&seam, PartitionEnd::Donor)), &[])?;
    let (left_floor, right_floor) = left_floor.zip(right_floor).ok_or_else(|| SparkError::Invalid("Both partitions require shared floor measurements".into()))?;
    let overlap_samples = left_floor.len();
    if overlap_samples == 0 || overlap_samples != right_floor.len() { return invalid("Partition floor sample sets differ"); }
    let max_floor_delta = left_floor.into_iter().zip(right_floor).map(|(a, b)| (a - b).abs()).fold(0., f64::max);
    if max_floor_delta > 0.02 {
        return invalid(&format!("The shared floors differ by {max_floor_delta:.3} world units. Align the two passage profiles before compiling"));
    }
    let forward = [direction[0], direction[1], 0.];
    let trigger = |from, to, distance: f64| partition_switch(
        from, to, offset(distance - 0.45), forward, assembly.tunnel_width, assembly.tunnel_height,
    );
    Ok(PartitionedAssembly {
        base: left, donor: right,
        switches: [trigger(assembly.base_bsp_index, base_count, 1.3),
                   trigger(base_count, assembly.base_bsp_index, -1.3)],
        overlap, overlap_samples, max_floor_delta,
    })
}
/// Build the only new geometry in an intact partition connection. Landings
/// stay level across the switch footprints and the native parent BSPs are
/// consulted as collision inputs only.
pub fn generate_preserved_connector(
    project: &Project, base: &MapInspection, cancel: &AtomicBool,
) -> Result<PreservedConnector> {
    let plan = project.bsp_assembly.as_ref().ok_or_else(|| SparkError::Invalid("Author a BSP connection first".into()))?;
    let source = project.source.as_ref().ok_or_else(|| SparkError::Invalid("Missing base source".into()))?;
    plan.validate()?;
    if !plan.separate_native_bsps || !can_extend_partitions(project, base) || base.mesh.parts.len() > 14
        || source.sha256 != base.sha256 || maps::hash_file(&source.preserved_path)? != base.sha256
        || plan.donor_source.cache_version != 609 || plan.yaw_degrees != 0. || !plan.native_seals.is_empty() {
        return invalid("An intact connector needs a retained MCC13 parent with two free BSP slots, one standard CE donor, translation without yaw and no source seal edits");
    }
    let donor = maps::inspect_map(&plan.donor_source.preserved_path, plan.donor_source.resource_directory.as_deref())?;
    if donor.sha256 != plan.donor_source.sha256 || donor.header.extended || donor.header.version != 609
        || donor.header.scenario_type != 1 || donor.mesh.parts.len() != 1 {
        return invalid("The exact standard single-BSP Custom Edition multiplayer donor is required");
    }
    if plan.translation != [0.; 3] {
        maps::preflight_bsp_relocation(&plan.donor_source.preserved_path, &donor, plan.translation)?;
    }
    let route = &plan.tunnel_points;
    let (start, end) = (route[0], *route.last().unwrap());
    let base_forward = horizontal_direction(&route[..2]);
    let donor_forward = horizontal_direction(&route[route.len() - 2..]);
    let forward = horizontal_direction(&[start, end]);
    let bent = route.len() > 2;
    let side = mul([-forward[1], forward[0], 0.], f64::from(plan.tunnel_width) / 2.);
    let mut review = plan.clone();
    review.separate_native_bsps = false;
    review.preserve_donor_bsp = false;
    review.tunnel_bake_fill = false;
    review.directional_donor_landing = false;
    review.base_bsp_index = 0;

    let common_separation = intact_common_separation(&base.mesh, base.mesh.parts.len(), &donor.mesh, 0, plan.translation, forward)?;

    let (base_collision, _) = maps::collision_source(&source.preserved_path, base)?;
    let (donor_collision, _) = maps::collision_source(&plan.donor_source.preserved_path, &donor)?;
    let base_vehicles = crate::bsp_vehicles::edited_base_vehicles(project, base)?;
    let donor_vehicles = maps::scenario_vehicles(&plan.donor_source.preserved_path, &donor)?;
    let base_span = intact_span_before_vehicles(start, mul(base_forward, -1.), plan.tunnel_width, plan.tunnel_height,
        base_vehicles.iter().filter(|row| row.tag.is_some()).map(|row| row.position.map(f64::from)));
    let checker = crate::bsp_clearance::RouteChecker::for_part(&base_collision, plan.base_bsp_index)?;
    let base_landing = choose_intact_landing_bounded(&checker, &mut review, start, [0.; 3], base_forward, base_span)
        .map_err(|error| SparkError::Invalid(format!("Retained connector landing: {error}")))?;
    let donor_span = intact_span_before_vehicles(end, donor_forward, plan.tunnel_width, plan.tunnel_height,
        donor_vehicles.iter().map(|row| add(row.position.map(f64::from), plan.translation)));
    let checker = crate::bsp_clearance::RouteChecker::for_part(&donor_collision, 0)?;
    let donor_landing = choose_intact_landing_bounded(&checker, &mut review, end, plan.translation, donor_forward, donor_span)
        .map_err(|error| SparkError::Invalid(format!("Donor connector landing: {error}")))?;
    let landings = [base_landing, donor_landing];
    let overlaps = [landings[0].0, landings[1].0];
    let corridor = base.mesh.parts.len();
    let island = corridor + 1;
    let trigger = |from, to, center, aim, distance: f64| partition_switch(
        from, to, add(center, mul(aim, distance - 0.45)), aim, plan.tunnel_width, plan.tunnel_height,
    );
    // Keep the two 0.9-unit triggers disjoint within the verified landing.
    let base_switch = intact_switch_distance(landings[0].1);
    let donor_switch = intact_switch_distance(landings[1].1);
    let switches = [
        trigger(plan.base_bsp_index, corridor, start, base_forward, base_switch),
        trigger(corridor, plan.base_bsp_index, start, base_forward, -base_switch),
        trigger(corridor, island, end, donor_forward, donor_switch),
        trigger(island, corridor, end, donor_forward, -donor_switch),
    ];
    let prior = maps::scenario_bsp_transitions(&source.preserved_path, base)?;
    let volumes = maps::scenario_volume_readback(&source.preserved_path, base)?;
    verify_intact_switch_spacing(&switches, &prior.transitions, &volumes)?;
    let landing = plan.directional_donor_landing.then(|| {
        fit_directional_landing(&checker, end, donor_forward, donor_switch, plan.tunnel_width, plan.translation)
    }).transpose()?;
    let points = intact_route_points(overlaps, plan, landing.as_ref())?;
    if bent || !common_separation {
        verify_intact_neighborhood((&base.mesh, &base_collision), (&donor.mesh, &donor_collision),
            0, plan.translation, base.mesh.parts.len(), plan, &points)?;
    }
    review.tunnel_points = points[1..points.len() - 1].to_vec();
    review.validate()?;

    let height = f64::from(plan.tunnel_height);
    let width = f64::from(plan.tunnel_width);
    let sides = bent.then(|| tunnel_sides(&points, width)).transpose()?;
    let shape = sides.as_ref().map(|sides| mitered_connector_floor(&points, sides)).transpose()?;
    if !plan.open_road {
        verify_preserved_tunnel_intrusions(&points, sides.as_deref(), width, height, [
            ("Retained", Some(&base_collision), plan.base_bsp_index, [0.; 3]),
            ("Donor", Some(&donor_collision), 0, plan.translation),
            ("Retained render", base.render_mesh.as_ref(), plan.base_bsp_index, [0.; 3]),
            ("Donor render", donor.render_mesh.as_ref(), 0, plan.translation),
        ])?;
    }
    let contains = |position| shape.as_ref().map_or_else(
        || intact_connector_contains_placement(&points, forward, width, height, position),
        |shape| shape.iter().any(|face| face.contains(position, height)),
    );
    verify_connector_vehicle_placements(plan.translation, &base_vehicles, &donor_vehicles, contains)?;
    for (index, pickup) in maps::scenario_netgame_pickups(&plan.donor_source.preserved_path, &donor)?.into_iter().enumerate() {
        let position = add(pickup.position.map(f64::from), plan.translation);
        if contains(position) {
            return invalid(format!("Donor pickup {index} at {position:?} lies inside the new connector; move the passage clear of the original pickup"));
        }
    }
    let mut materials = vec![AssemblyMaterial {
        name: format!("gsconnector{}x", &base.sha256[..8]),
        source: 0, shader_path: Some(plan.tunnel_shader_path.clone()), shader_class: Some("senv".into()),
        flags: 0, collision_only: false,
    }];
    let sky = plan.open_road.then(|| {
        materials.push(AssemblyMaterial {
            name: "+sky".into(), source: 0, shader_path: None, shader_class: None, flags: 0, collision_only: false,
        });
        materials.len() - 1
    });
    let body = if let Some(sides) = &sides {
        joined_passage_solid(&points, sides, height, sky, cancel)?
    } else {
        intact_connector_solid(&points, side, height, sky, cancel)?
    };
    let collision_source = body.get_mesh_gl64(-1);
    let (mut mesh, mut triangle_materials) = collision_layer(&collision_source, &mut materials)?;
    for point in mesh.positions.chunks_exact(3) {
        validate_native_bsp_point([point[0].into(), point[1].into(), point[2].into()])?;
    }
    review.tunnel_points.insert(0, overlaps[0][0]);
    review.tunnel_points.push(landing.as_ref().map_or(overlaps[1][1], |ramp| ramp.point(overlaps[1][1])));
    let checker = crate::bsp_clearance::RouteChecker::new(&mesh)?;
    let route_clearance = if plan.open_road {
        let [walk_samples, _] = checker.verify_land_bridge(&review)?;
        vec![RouteClearance { label: "Open land bridge".into(), width: plan.tunnel_width,
            clear_height: plan.tunnel_height, walk_samples, lateral_samples: 0 }]
    } else {
        checker.verify_return(&review)?;
        checker.verify_details(&review)?
    };
    for overlap in &overlaps[..if landing.is_some() { 1 } else { 2 }] {
        if checker.floor_profile(*overlap)?.into_iter().any(|z| (z - overlap[0][2]).abs() > 0.02) {
            return invalid("Connector surface does not match a reviewed landing");
        }
    }
    let directional_drop = landing.as_ref().map(|ramp| verify_directional_landing(&checker, ramp)).transpose()?;
    let level_span = [points[0], *points.last().unwrap()];
    let chart_points = if points.iter().all(|point| point[2] == points[0][2]) { &level_span[..] } else { &points[..] };
    let mut render = if bent { collision_source } else { connector_charts(chart_points, side, height, sky) };
    // The structural caps close this BSP beyond the switch footprints. Adjacent
    // BSPs can draw at the same time, so a visible cap would wall off a mouth.
    open_connector_render_ends(&mut render, &points, sides.as_deref(), side);
    crate::bsp_triangulate::refine_connector_charts(&mut render, MAX_OUTPUT_TRIANGLES)?;
    let collapsed = append_render_faces(&render, &materials, &mut mesh, &mut triangle_materials, None)?;
    mesh.parts.push(maps::MeshPart { name: "Intact BSP connector".into(), index_start: 0, index_count: mesh.indices.len() });
    let mut warnings = vec![format!("Shared floor spans {:.2} and {:.2} units. Runtime travel requires playtesting.",
        2. * landings[0].1, 2. * landings[1].1)];
    if let Some((ramp, drop)) = landing.as_ref().zip(directional_drop) {
        warnings.push(format!("Donor switches have a {:.1}% connector grade and an at most {:.3}-unit sampled step down.", ramp.grade * 100., drop));
    } else {
        warnings.push(format!("Maximum floor difference is {:.3} units.", landings[0].2.max(landings[1].2)));
    }
    if collapsed > 0 {
        warnings.push(format!("Render repair omitted {collapsed} fragments with zero export area. Review the connector preview before building."));
    }
    let report = AssemblyReport {
        input_triangles: 0, output_triangles: mesh.indices.len() / 3, connector_triangles: render.num_tri() - collapsed,
        generated_uv_faces: render.num_tri() - collapsed, walk_samples: route_clearance.iter().map(|route| route.walk_samples).sum(),
        portal_count: 0, route_clearance, donor_scenery: 0,
        warnings,
    };
    Ok(PreservedConnector {
        geometry: AssemblyGeometry { mesh, materials, triangle_materials, exact_sky_portals: Vec::new(), report },
        switches,
        overlaps,
    })
}

fn verify_preserved_tunnel_intrusions(
    points: &[V], sides: Option<&[V]>, width: f64, height: f64,
    sources: [(&str, Option<&MeshData>, usize, V); 4],
) -> Result<()> {
    let inner = 1..points.len() - 1;
    let passage = &points[inner.clone()];
    let bent_floor = sides.map(|sides| mitered_connector_floor(passage, &sides[inner])).transpose()?;
    for (name, mesh, slot, translation) in sources {
        let Some(mesh) = mesh.filter(|mesh| mesh.parts.get(slot).is_some_and(|part| part.index_count > 0)) else {
            continue;
        };
        let source = crate::bsp_clearance::RouteChecker::for_part(mesh, slot)?;
        let obstruction = if let Some(floor) = &bent_floor {
            source.mitered_connector_intrusion(floor, height, translation)
        } else {
            source.connector_intrusion(passage, width, height, translation)
        };
        if let Some([x, y, z]) = obstruction {
            return invalid(format!(
                "{name} BSP crosses the tunnel beyond its landing near ({x:.2}, {y:.2}, {z:.2}). \
                 Adjust the route or cut a clear passage before preserving this BSP."
            ));
        }
    }
    Ok(())
}

fn horizontal_run(start: V, end: V) -> f64 {
    (end[0] - start[0]).hypot(end[1] - start[1])
}

fn horizontal_direction(pair: &[V]) -> V {
    let delta = sub(pair[1], pair[0]);
    let length = horizontal_run(pair[0], pair[1]);
    [delta[0] / length, delta[1] / length, 0.]
}

fn intact_common_separation(
    base: &MeshData, count: usize, donor: &MeshData, donor_slot: usize, translation: V, forward: V,
) -> Result<bool> {
    for direction in [forward, [0., 0., 1.], [0., 0., -1.]] {
        let donor_near = projected_bounds(donor, donor_slot, translation, 0., direction)?[0];
        let mut base_far = f64::NEG_INFINITY;
        for slot in 0..count {
            base_far = base_far.max(projected_bounds(base, slot, [0.; 3], 0., direction)?[1]);
        }
        if donor_near - base_far >= 8. { return Ok(true); }
    }
    Ok(false)
}

fn separated_bounds<const N: usize>(left: [[f64; 2]; N], right: [[f64; 2]; N], clearance: f64) -> bool {
    left.into_iter().zip(right).any(|(a, b)| b[0] - a[1] >= clearance || a[0] - b[1] >= clearance)
}

/// A region in a gap between existing BSPs can be clear on a different axis
/// from each neighbor. Protect both render and collision bounds, then check
/// the entire passage envelope against every nonparticipating BSP.
fn verify_intact_neighborhood(
    base: (&MeshData, &MeshData), donor: (&MeshData, &MeshData), donor_index: usize,
    translation: V, count: usize, plan: &BspAssembly, points: &[V],
) -> Result<()> {
    let route = &plan.tunnel_points;
    let forward = horizontal_direction(&[route[0], *route.last().unwrap()]);
    // The retained routes can be much longer than the new connector. A
    // world-aligned separating plane may be tighter than the route's axes.
    let axes = [forward, [-forward[1], forward[0], 0.], [0., 0., 1.], [1., 0., 0.], [0., 1., 0.]];
    let sides = tunnel_sides(points, f64::from(plan.tunnel_width))?;
    let height = f64::from(plan.tunnel_height);
    let box_for = |meshes: (&MeshData, &MeshData), slot, shift| -> Result<[[f64; 2]; 5]> {
        let mut bounds = [[0.; 2]; 5];
        for (index, axis) in axes.into_iter().enumerate() {
            let a = projected_bounds(meshes.0, slot, shift, 0., axis)?;
            let b = projected_bounds(meshes.1, slot, shift, 0., axis)?;
            bounds[index] = [a[0].min(b[0]), a[1].max(b[1])];
        }
        Ok(bounds)
    };
    let donor_bounds = box_for(donor, donor_index, translation)?;
    let corridor = points.windows(2).zip(sides.windows(2)).map(|(path, side)| {
        let corners = passage_corners(path[0], path[1], side[0], side[1], height);
        axes.map(|axis| corners.iter().map(|point| dot(*point, axis))
            .fold([f64::INFINITY, f64::NEG_INFINITY], |[lo, hi], value| [lo.min(value), hi.max(value)]))
    }).collect::<Vec<_>>();
    for slot in 0..count {
        let retained = box_for(base, slot, [0.; 3])?;
        if !separated_bounds(donor_bounds, retained, 8.) {
            return invalid(format!("The intact donor needs eight units of separation from BSP {slot}"));
        }
        if slot != plan.base_bsp_index && corridor.iter().any(|&section| !separated_bounds(retained, section, 0.05)) {
            return invalid(format!("The proposed passage intersects the bounds of unrelated BSP {slot}"));
        }
    }
    Ok(())
}

fn verify_intact_connector_vehicles(
    points: &[V], forward: V, plan: &BspAssembly, base: &[maps::NativeVehicle], donor: &[maps::NativeVehicle],
) -> Result<()> {
    verify_connector_vehicle_placements(plan.translation, base, donor, |position| {
        intact_connector_contains_placement(points, forward, f64::from(plan.tunnel_width), f64::from(plan.tunnel_height), position)
    })
}

fn verify_connector_vehicle_placements(
    shift: V, base: &[maps::NativeVehicle], donor: &[maps::NativeVehicle], contains: impl Fn(V) -> bool,
) -> Result<()> {
    for (name, vehicles, translation) in [("Retained", base, [0.; 3]), ("Donor", donor, shift)] {
        for (index, vehicle) in vehicles.iter().enumerate().filter(|(_, row)| row.tag.is_some()) {
            let position = add(vehicle.position.map(f64::from), translation);
            if contains(position) {
                return invalid(format!("{name} vehicle {index} at {position:?} lies inside the new connector. Move the passage clear of the vehicle."));
            }
        }
    }
    Ok(())
}

fn intact_connector_contains_placement(points: &[V], forward: V, width: f64, height: f64, position: V) -> bool {
    let sideways = [-forward[1], forward[0], 0.];
    if dot(sub(position, points[0]), sideways).abs() > width / 2. {
        return false;
    }
    let along = dot(position, forward);
    for [start, end] in points.windows(2).map(|pair| [pair[0], pair[1]]) {
        let (lo, hi) = (dot(start, forward), dot(end, forward));
        if !(lo..=hi).contains(&along) { continue; }
        let floor = start[2] + (end[2] - start[2]) * (along - lo) / (hi - lo);
        // Match native placement membership, including origins on a floor plane.
        return position[2] <= floor + height && position[2] >= floor - 0.05;
    }
    false
}

fn connector_charts(points: &[V], side: V, height: f64, sky: Option<usize>) -> MeshGL64 {
    let mut render = MeshGL64 { num_prop: 5, ..Default::default() };
    for (segment, pair) in points.windows(2).enumerate() {
        let [start, end] = [pair[0], pair[1]];
        let delta = sub(end, start);
        let panels = (dot(delta, delta).sqrt() / 48.).ceil() as usize;
        let point = |index| if index == panels { end } else { add(start, mul(delta, index as f64 / panels as f64)) };
        let full = passage_corners(start, end, side, side, height);
        for panel in 0..panels {
            let corners = passage_corners(point(panel), point(panel + 1), side, side, height);
            for (index, [a, c, b]) in LEVEL_PASSAGE_TRIANGLES.into_iter().enumerate() {
                let internal_start = (4..=5).contains(&index) && (segment > 0 || panel > 0);
                let internal_end = (8..=9).contains(&index) && (segment + 2 < points.len() || panel + 1 < panels);
                if internal_start || internal_end {
                    continue;
                }
                let uv_normal = normal(full[a], full[b], full[c]);
                let first = render.num_vert() as u64;
                for corner in [corners[a], corners[b], corners[c]] {
                    render.vert_properties.extend(corner);
                    render.vert_properties.extend(planar_uv(corner, uv_normal));
                }
                render.tri_verts.extend([first, first + 1, first + 2]);
                render.face_id.push(if (2..=3).contains(&index) { sky.unwrap_or(0) as u64 } else { 0 });
            }
        }
    }
    render
}

fn intact_connector_solid(points: &[V], side: V, height: f64, sky: Option<usize>, cancel: &AtomicBool) -> Result<Manifold> {
    if cancel.load(Ordering::Relaxed) { return invalid("BSP connector generation cancelled"); }
    // A level passage needs no coplanar joins at the landing zones. Unioning
    // them adds needless narrow charts when the corridor is oblique.
    let end = *points.last().unwrap();
    if points.iter().all(|point| point[2] == end[2]) {
        return passage_solid(points[0], end, side, side, height, 0, sky);
    }
    joined_passage_solid(points, &vec![side; points.len()], height, sky, cancel)
}

fn joined_passage_solid(points: &[V], sides: &[V], height: f64, sky: Option<usize>, cancel: &AtomicBool) -> Result<Manifold> {
    // With strictly ordered cross-sections, panels can only touch at their shared
    // boundary. Retain the existing union for routes that double back or overlap
    // on this axis. It still operates solely on the generated passage.
    let forward = horizontal_direction(&[points[0], *points.last().unwrap()]);
    let projected = points.iter().zip(sides).map(|(&point, &side)| {
        let center = dot(point, forward);
        let extent = dot(side, forward).abs();
        [center - extent, center + extent]
    }).collect::<Vec<_>>();
    let ordered = projected.windows(2).all(|pair| pair[0][1] + 0.002 < pair[1][0]);
    let matched_caps = points.windows(2).zip(sides.windows(2)).all(|(pair, sides)| {
        let advance = sub(pair[1], pair[0]);
        let normal = |side: V| [side[1], -side[0], 0.];
        let [a, b] = [normal(sides[0]), normal(sides[1])];
        dot(advance, a) > dot(sides[1], a).abs() + 0.002
            && dot(advance, b) > dot(sides[0], b).abs() + 0.002
    });
    if ordered && matched_caps {
        let corners = points.windows(2).zip(sides.windows(2)).map(|(pair, side)| {
            passage_corners(pair[0], pair[1], side[0], side[1], height)
        }).collect::<Vec<_>>();
        let split = corners.iter().any(|points| passage_floor_needs_center(points));
        let mut shell = MeshGL64 { num_prop: 5, ..Default::default() };
        for (index, panel) in corners.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) { return invalid("BSP connector generation cancelled"); }
            append_passage_shell(&mut shell, *panel, [points[index], points[index + 1]], height,
                [index == 0, index + 1 == corners.len()], split, 0, sky);
        }
        shell.merge();
        return checked(Manifold::from_mesh_gl64(&shell), "Stitched BSP connector");
    }
    let mut solids = points.windows(2).zip(sides.windows(2))
        .map(|(pair, side)| passage_solid(pair[0], pair[1], side[0], side[1], height, 0, sky));
fn open_connector_render_ends(mesh: &mut MeshGL64, points: &[V], sides: Option<&[V]>, side: V) {
    let end = points.len() - 1;
    let planes = [0, end].map(|index| {
        let across = sides.map_or(side, |sides| sides[index]);
        let width = across[0].hypot(across[1]);
        let outward = [across[1] / width, -across[0] / width, 0.];
        (points[index], outward)
    });
    let triangles = std::mem::take(&mut mesh.tri_verts);
    let ids = std::mem::take(&mut mesh.face_id);
    for (triangle, material) in triangles.chunks_exact(3).zip(ids) {
        let cap = planes.iter().any(|&(point, axis)| triangle.iter().all(|&vertex| {
            let at = vertex as usize * mesh.num_prop as usize;
            let position = [mesh.vert_properties[at], mesh.vert_properties[at + 1], mesh.vert_properties[at + 2]];
            dot(sub(position, point), axis).abs() <= 0.0001
        }));
        if !cap {
            mesh.tri_verts.extend_from_slice(triangle);
            mesh.face_id.push(material);
        }
    }
}

    let mut body = solids.next().unwrap()?;
    for solid in solids {
        if cancel.load(Ordering::Relaxed) { return invalid("BSP connector generation cancelled"); }
        body = checked(body.boolean_with_engine_and_token(&solid?, OpType::Add, BooleanEngine::Auto, None), "Intact BSP connector")?;
    }
    Ok(body)
}

// The shell continues 0.7 units beyond its flat switch overlap.
const CONNECTOR_END_CAP: f64 = 0.7;

fn intact_span_before_vehicles(
    center: V, forward: V, width: f32, height: f32, positions: impl IntoIterator<Item = V>,
) -> f64 {
    let side = [-forward[1], forward[0], 0.];
    positions.into_iter().filter_map(|point| {
        let offset = sub(point, center);
        let along = dot(offset, forward);
        if along < 0. || dot(offset, side).abs() > f64::from(width) * 0.5 + 0.15
            || !(-0.05..=(f64::from(height) + 0.05)).contains(&offset[2]) {
            return None;
        }
        Some(along - CONNECTOR_END_CAP - 0.25)
    }).fold(f64::INFINITY, f64::min)
}


fn choose_intact_landing_bounded(
    checker: &crate::bsp_clearance::RouteChecker, review: &mut BspAssembly,
    center: V, displacement: V, forward: V, max_span: f64,
) -> Result<([V; 2], f64, f64)> {
    let mut first_error = None;
    for span in [2.3, 1.75, 1.4].into_iter().filter(|&span| span <= max_span) {
        let direction = mul(forward, span);
        let world = [sub(center, direction), add(center, direction)];
        let local = world.map(|point| sub(point, displacement));
        review.tunnel_points = local.to_vec();
        let checked = (|| {
            if review.open_road {
                checker.verify_land_bridge(review)?;
            } else {
                checker.verify(review)?;
                checker.verify_return(review)?;
            }
            let difference = checker.floor_profile(local)?.into_iter()
                .map(|z| (z + displacement[2] - center[2]).abs()).fold(0., f64::max);
            if difference > 0.02 {
                return invalid(format!("Floor differs from the level connector by {difference:.3} units"));
            }
            Ok(difference)
        })();
        match checked {
            Ok(difference) => return Ok((world, span, difference)),
            Err(error) => { first_error.get_or_insert(error); }
        }
    }
    Err(first_error.unwrap_or_else(|| SparkError::Invalid("Choose a landing clear of the native vehicle placements".into())))
}

fn verify_intact_switch_spacing(
    proposed: &[PartitionSwitch], retained: &[maps::NativeBspTransition], volumes: &[maps::ScenarioLogicVolume],
) -> Result<()> {
    for switch in proposed {
        let (source, _) = maps::native_bsp_switch_name(&switch.name)
            .ok_or_else(|| SparkError::Invalid("Invalid new native BSP switch name".into()))?;
        for existing in retained.iter().filter(|existing| existing.source_bsp == source) {
            let geometry = volumes.get(existing.trigger_index).and_then(|volume| volume.geometry.as_ref())
                .filter(|geometry| geometry.valid())
                .ok_or_else(|| SparkError::Invalid(format!("Cannot verify retained native BSP switch {}", existing.trigger_name)))?;
            if geometry.intersects(&switch.geometry) {
                return invalid(format!(
                    "New switch {} overlaps retained switch {} in BSP {source}; move the landing clear of its entrance",
                    switch.name, existing.trigger_name,
                ));
            }
        }
    }
    Ok(())
}

fn intact_switch_distance(span: f64) -> f64 {
    (span - 0.75).min(1.3)
}

struct DirectionalLanding {
    center: V,
    forward: V,
    grade: f64,
    floor_z: f64,
    samples: Vec<LandingSample>,
}

struct LandingSample {
    point: V,
    station: f64,
    stock_z: f64,
    into_donor: bool,
}

impl DirectionalLanding {
    fn point(&self, mut point: V) -> V {
        point[2] = self.floor_z + self.grade * dot(sub(point, self.center), self.forward);
        point
    }
}

const LANDING_MIN_DROP: f64 = 0.002;
const LANDING_MAX_DROP: f64 = 0.09;

fn fit_directional_landing(
    stock: &crate::bsp_clearance::RouteChecker, center: V, forward: V,
    switch_distance: f64, width: f32, translation: V,
) -> Result<DirectionalLanding> {
    let half_width = f64::from(width) / 2. - 0.02;
    let side = [-forward[1], forward[0], 0.];
    let mut samples = Vec::with_capacity(162);
    for into_donor in [false, true] {
        let switch_center = if into_donor { switch_distance } else { -switch_distance };
        for step in 0..=8 {
            let station = switch_center - 0.43 + 0.86 * f64::from(step) / 8.;
            for lane in -4..=4 {
                let point = add(add(center, mul(forward, station)), mul(side, half_width * f64::from(lane) / 4.));
                let local = sub(point, translation).map(|axis| axis as f32);
                let stock_z = stock.native_surface_z(local).map(|z| f64::from(z) + translation[2])
                    .ok_or_else(|| SparkError::Invalid("A directional donor switch has unsupported floor. Move its landing clear of the gap.".into()))?;
                samples.push(LandingSample { point, station, stock_z, into_donor });
            }
        }
    }
    let (grade, floor_z) = solve_directional_landing(&samples).ok_or_else(|| SparkError::Invalid(
        "The donor switches cannot both receive a shallow downhill step within a 10% grade. Choose a different landing.".into()
    ))?;
    Ok(DirectionalLanding { center, forward, grade, floor_z, samples })
}

fn solve_directional_landing(samples: &[LandingSample]) -> Option<(f64, f64)> {
    // Leave headroom for the compiler's float conversion and triangle planes.
    let min = LANDING_MIN_DROP + 0.001;
    let max = LANDING_MAX_DROP - 0.001;
    for step in 0..=100 {
        let grade = f64::from(step) / 1000.;
        let (mut low, mut high) = (f64::NEG_INFINITY, f64::INFINITY);
        for sample in samples {
            let level = sample.stock_z - grade * sample.station;
            let (min_delta, max_delta) = if sample.into_donor { (min, max) } else { (-max, -min) };
            low = low.max(level + min_delta);
            high = high.min(level + max_delta);
        }
        if low <= high && low.is_finite() && high.is_finite() {
            return Some((grade, (low + high) * 0.5));
        }
    }
    None
}

fn verify_directional_landing(
    connector: &crate::bsp_clearance::RouteChecker, landing: &DirectionalLanding,
) -> Result<f64> {
    let mut max_drop: f64 = 0.;
    for sample in &landing.samples {
        let expected = landing.point(sample.point);
        let z = connector.native_surface_z(expected.map(|p| p as f32))
            .map(f64::from).ok_or_else(|| SparkError::Invalid("Directional connector floor is missing inside a switch".into()))?;
        let drop = if sample.into_donor { z - sample.stock_z } else { sample.stock_z - z };
        if !(LANDING_MIN_DROP..=LANDING_MAX_DROP).contains(&drop) || (z - expected[2]).abs() > 0.001 {
            return invalid(format!("Directional connector floor differs from the reviewed downhill step ({drop:.4} units)"));
        }
        max_drop = max_drop.max(drop);
    }
    Ok(max_drop)
}

fn intact_route_points(overlaps: [[V; 2]; 2], plan: &BspAssembly, landing: Option<&DirectionalLanding>) -> Result<Vec<V>> {
    let path = &plan.tunnel_points;
    let first = horizontal_direction(&path[..2]);
    if path.len() == 2 {
        return intact_floor_points(overlaps, first, plan.open_road, landing);
    }
    let last = horizontal_direction(&path[path.len() - 2..]);
    let cap = add(overlaps[1][1], mul(last, CONNECTOR_END_CAP));
    let start = add(overlaps[0][1], mul(first, 0.2));
    let end = sub(overlaps[1][0], mul(last, 0.2));
    if dot(sub(path[1], start), first) < 0.5 || dot(sub(end, path[path.len() - 2]), last) < 0.5 {
        return invalid("A bend overlaps the checked landing. Move it farther from the native switches.");
    }
    let mut points = vec![sub(overlaps[0][0], mul(first, CONNECTOR_END_CAP)), start];
    points.extend_from_slice(&path[1..path.len() - 1]);
    points.extend([landing.map_or(end, |ramp| ramp.point(end)), landing.map_or(cap, |ramp| ramp.point(cap))]);
    Ok(points)
}

fn intact_floor_points(overlaps: [[V; 2]; 2], forward: V, open_road: bool, landing: Option<&DirectionalLanding>) -> Result<Vec<V>> {
    let outside = mul(forward, CONNECTOR_END_CAP);
    let slope_margin = mul(forward, 0.2);
    let start = add(overlaps[0][1], slope_margin);
    let end = sub(overlaps[1][0], slope_margin);
    let end = landing.map_or(end, |ramp| ramp.point(end));
    let mut points = vec![sub(overlaps[0][0], outside), start];
    let rise = end[2] - start[2];
    if open_road && rise != 0. {
        // Keep the switches level and put the grade on the low end, leaving a flat deck.
        let ramp_length = (rise.abs() / 0.25).max(0.5);
        if dot(sub(end, start), forward) < ramp_length + 4. {
            return invalid("The land bridge needs room for its level deck and an approach of at most 25% grade. Pick landings closer in elevation or farther apart.");
        }
        let (low, direction) = if rise > 0. { (start, forward) } else { (end, mul(forward, -1.)) };
        let mut deck = add(low, mul(direction, ramp_length));
        deck[2] = start[2].max(end[2]);
        points.push(deck);
    }
    let cap = add(overlaps[1][1], outside);
    points.extend([end, landing.map_or(cap, |ramp| ramp.point(cap))]);
    Ok(points)
}

pub(crate) fn verify_intact_connector_collision(
    cache: &Path, compiled: &MapInspection, plan: &BspAssembly,
    overlaps: [[V; 2]; 2], original_count: usize,
) -> Result<serde_json::Value> {
    let (collision, _) = maps::collision_source(cache, compiled)?;
    if collision.parts.len() != original_count + 2 {
        return invalid("Compiled intact extension has the wrong BSP count");
    }
    let connector = crate::bsp_clearance::RouteChecker::for_part(&collision, original_count)?;
    let mut route = plan.clone();
    route.separate_native_bsps = false;
    route.preserve_donor_bsp = false;
    route.tunnel_bake_fill = false;
    route.directional_donor_landing = false;
    route.base_bsp_index = 0;
    let mut samples = Vec::with_capacity(2);
    let mut max_delta: f64 = 0.;
    let donor_slot = original_count + 1;
    for (slot, overlap) in [plan.base_bsp_index, donor_slot].into_iter().zip(overlaps) {
        let region = crate::bsp_clearance::RouteChecker::for_part(&collision, slot)?;
        route.tunnel_points = overlap.to_vec();
        let both = if plan.open_road { region.verify_land_bridge(&route)? }
            else { [region.verify(&route)?, region.verify_return(&route)?] };
        samples.push(both);
        if slot == donor_slot && plan.directional_donor_landing { continue; }
        let original = region.floor_profile(overlap)?;
        let added = connector.floor_profile(overlap)?;
        if original.len() != added.len() || original.is_empty() {
            return invalid("Compiled intact connector has incompatible overlap measurements");
        }
        let delta = original.into_iter().zip(added).map(|(a,b)| (a-b).abs()).fold(0., f64::max);
        max_delta = max_delta.max(delta);
    }
    if max_delta > 0.02 { return invalid("Compiled intact connector landing floors are misaligned"); }
    let path = &plan.tunnel_points;
    let end = *path.last().unwrap();
    let donor_forward = horizontal_direction(&path[path.len() - 2..]);
    let forward = horizontal_direction(&[path[0], end]);
    let mut directional_review = None;
    let landing = if plan.directional_donor_landing {
        let stock = crate::bsp_clearance::RouteChecker::for_part(&collision, donor_slot)?;
        let span = dot(sub(overlaps[1][1], end), donor_forward);
        let ramp = fit_directional_landing(&stock, end, donor_forward, intact_switch_distance(span), plan.tunnel_width, [0.; 3])?;
        let drop = verify_directional_landing(&connector, &ramp)?;
        max_delta = max_delta.max(drop);
        directional_review = Some(serde_json::json!({"grade": ramp.grade, "maxSwitchDrop": drop, "samples": ramp.samples.len()}));
        Some(ramp)
    } else { None };
    let points = intact_route_points(overlaps, plan, landing.as_ref())?;
    if path.len() > 2 {
        let width = f64::from(plan.tunnel_width);
        let sides = tunnel_sides(&points, width)?;
        verify_preserved_tunnel_intrusions(&points, Some(&sides), width, f64::from(plan.tunnel_height), [
            ("Compiled retained", Some(&collision), plan.base_bsp_index, [0.; 3]),
            ("Compiled donor", Some(&collision), donor_slot, [0.; 3]),
            ("Compiled retained render", compiled.render_mesh.as_ref(), plan.base_bsp_index, [0.; 3]),
            ("Compiled donor render", compiled.render_mesh.as_ref(), donor_slot, [0.; 3]),
        ])?;
    }
    // Apply the same neighboring-region proof to the compiled route.
    if path.len() > 2 || !intact_common_separation(&compiled.mesh, original_count, &compiled.mesh, donor_slot, [0.; 3], forward)? {
        verify_intact_neighborhood((&compiled.mesh, &collision), (&compiled.mesh, &collision), donor_slot,
            [0.; 3], original_count, plan, &points)?;
    }
    route.tunnel_points = [overlaps[0][0]].into_iter()
        .chain(points[1..points.len() - 1].iter().copied())
        .chain([landing.as_ref().map_or(overlaps[1][1], |ramp| ramp.point(overlaps[1][1]))]).collect();
    let corridor = if plan.open_road { connector.verify_land_bridge(&route)? }
        else { [connector.verify(&route)?, connector.verify_return(&route)?] };
    Ok(serde_json::json!({
        "connectorSamples": corridor, "landingSamples": samples, "maxFloorDelta": max_delta,
        "directionalDonorLanding": directional_review,
        "bspCollisionTriangles": collision.parts.iter().map(|part| part.index_count / 3).collect::<Vec<_>>(),
    }))
}

pub(crate) fn verify_bound_partition_collision(
    cache: &Path, map: &MapInspection, plan: &BspAssembly, inherited: &[BspAssembly], overlap: [V; 2], original_count: usize,
) -> Result<serde_json::Value> {
    let (collision, _) = maps::collision_source(cache, map)?;
    if collision.parts.len() != original_count + 1 || plan.tunnel_points.len() != 2 {
        return invalid("Compiled partition count or straight passage differs from the source");
    }
    let original = crate::bsp_clearance::RouteChecker::for_part(&collision, plan.base_bsp_index)?;
    let extension = crate::bsp_clearance::RouteChecker::for_part(&collision, original_count)?;
    let mut approach = plan.clone();
    approach.separate_native_bsps = false;
    approach.base_bsp_index = 0;
    approach.tunnel_points = vec![if original_count == 1 { plan.tunnel_points[0] } else { overlap[0] }, overlap[1]];
    let base_samples = [original.verify(&approach)?, original.verify_return(&approach)?];
    let grade_start = if original_count > 1 && overlap[0][2] == overlap[1][2] {
        retained_grade_start(plan.tunnel_points[0], plan.tunnel_points[1])
    } else { None };
    approach.tunnel_points = donor_partition_points(overlap[0], grade_start, plan.tunnel_points[1]);
    let donor_samples = [extension.verify(&approach)?, extension.verify_return(&approach)?];
    let floor_a = original.floor_profile(overlap)?;
    let floor_b = extension.floor_profile(overlap)?;
    let overlap_samples = floor_a.len();
    let max_delta = floor_a.into_iter().zip(floor_b).map(|(a, b)| (a-b).abs()).fold(0., f64::max);
    if max_delta > 0.02 { return invalid("The two compiled corridor floors are misaligned"); }
    let inherited_samples = if original_count == 1 {
        inherited.iter().map(|route| original.verify(route)).collect::<Result<Vec<_>>>()?
    } else { Vec::new() }; // Existing geometry and native switches are independently compared to the parent.
    Ok(serde_json::json!({"bspCollisionTriangles": collision.parts.iter().map(|part| part.index_count / 3).collect::<Vec<_>>(),
        "baseSamples": base_samples, "donorSamples": donor_samples, "overlapSamples": overlap_samples,
        "maxFloorDelta": max_delta, "inheritedSamples": inherited_samples}))
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
#[cfg(test)]
fn anchor(mesh: &MeshData, faces: &[CollisionFace], part: usize, toward: V) -> Result<(V, usize)> {
    anchor_in_region(mesh, faces, part, toward, &|_| true)
}

fn anchor_in_region(mesh: &MeshData, faces: &[CollisionFace], part: usize, toward: V, in_region: &dyn Fn(V) -> bool) -> Result<(V, usize)> {
    let range = mesh
        .parts
        .get(part)
        .ok_or_else(|| SparkError::Invalid("BSP selection is unavailable".into()))?;
    let lateral = [-toward[1], toward[0], 0.];
    let projected = |p: V| [dot(p, toward), dot(p, lateral), p[2]];
    let mut low = [f64::INFINITY; 3];
    let mut high = [f64::NEG_INFINITY; 3];
    for id in &mesh.indices[range.index_start..range.index_start + range.index_count] {
        let point = vertex(mesh, *id);
        if !in_region(point) { continue; }
        let p = projected(point);
        for k in 0..3 {
            low[k] = low[k].min(p[k]);
            high[k] = high[k].max(p[k]);
        }
    }
    let target = [high[0] - 5., (low[1] + high[1]) / 2., low[2] + 1.];
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
            if !in_region(center) { return None; }
            let d = sub(projected(center), target);
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
    project.inherited_bsp_connections.clone_from(&base.inherited_bsp_connections);
    project.megaworld_layout.clone_from(&base.megaworld_layout);
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
    plan_in_direction(base_project, base, donor_project, donor, index, tags, 0.)
}

pub fn can_extend_partitions(project: &Project, map: &MapInspection) -> bool {
    map.header.version == 13 && map.header.scenario_type == 1 && (2..16).contains(&map.mesh.parts.len())
        && project.inherited_bsp_connections.iter().any(|route| route.separate_native_bsps)
}

/// Seed a physical tunnel on a chosen side of the existing world.
/// Both supports come from the same native collision selection as the default.
pub fn plan_in_direction(
    base_project: &Project,
    base: &MapInspection,
    donor_project: &Project,
    donor: &MapInspection,
    index: usize,
    tags: PathBuf,
    direction_degrees: f64,
) -> Result<BspAssembly> {
    plan_from_bsp(base_project, base, donor_project, donor, 0, index, tags, direction_degrees, None)
}

pub fn plan_from_bsp(
    base_project: &Project, base: &MapInspection, donor_project: &Project, donor: &MapInspection,
    base_index: usize, index: usize, tags: PathBuf, direction_degrees: f64,
    regional_preset: Option<RegionalConnectionPreset>,
) -> Result<BspAssembly> {
    plan_from_bsp_placement(base_project, base, donor_project, donor, base_index, index, tags,
        direction_degrees, regional_preset, None, &|_| true)
}

fn atlas_transform(origin: &crate::megaworld::LayoutRegion, region: &crate::megaworld::LayoutRegion) -> (V, f64) {
    (transform(sub(region.translation, origin.translation), [0.; 3], -origin.yaw_degrees),
        (region.yaw_degrees - origin.yaw_degrees + 180.).rem_euclid(360.) - 180.)
}

/// Recover the original frame for an earlier verified single-BSP Atlas build.
pub fn legacy_atlas_origin(
    source: &Source, layout: &crate::megaworld::Layout, plan: &BspAssembly,
) -> Option<crate::megaworld::LayoutRegion> {
    if plan.separate_native_bsps { return None; }
    let from_id = format!("{}:{}", source.sha256, plan.base_bsp_index);
    let to_id = format!("{}:{}", plan.donor_source.sha256, plan.donor_bsp_index);
    let (from, to) = layout.connection(&from_id, &to_id).ok()?;
    let (translation, yaw) = atlas_transform(from, to);
    (from.cache_version == source.cache_version && to.cache_version == plan.donor_source.cache_version
        && sub(translation, plan.translation).iter().all(|axis| axis.abs() <= 1e-6)
        && (yaw - plan.yaw_degrees).abs() <= 1e-6).then(|| from.clone())
}

fn atlas_base_frame<'a>(
    project: &'a Project, base: &MapInspection, from: &'a crate::megaworld::LayoutRegion,
    to: &crate::megaworld::LayoutRegion,
) -> Result<(&'a crate::megaworld::LayoutRegion, V, f64)> {
    if from.cache_sha256 == base.sha256 && from.cache_version == base.header.version {
        if project.inherited_bsp_connections.first().is_some_and(|plan| plan.atlas_origin.is_some()) {
            return invalid("Choose an original region of this compiled Atlas world as the connection origin");
        }
        return Ok((from, [0.; 3], 0.));
    }
    let routes = &project.inherited_bsp_connections;
    let Some(origin) = routes.first().and_then(|plan| plan.atlas_origin.as_ref()) else {
        return invalid("Open a compiled Atlas world or the original map for the selected region");
    };
    if base.mesh.parts.len() != 1 || routes.iter().any(|plan| plan.separate_native_bsps) {
        return invalid("Compiled Atlas continuation currently requires one merged native BSP");
    }
    let matches = |plan: &BspAssembly, region: &crate::megaworld::LayoutRegion| {
        plan.atlas_origin.as_ref().is_some_and(|frame| frame.region_id == origin.region_id
            && frame.translation == origin.translation && frame.yaw_degrees == origin.yaw_degrees)
            && plan.donor_source.sha256 == region.cache_sha256
            && plan.donor_source.cache_version == region.cache_version && plan.donor_bsp_index == region.bsp_index
    };
    if origin.region_id == to.region_id || routes.iter().any(|plan|
        plan.donor_source.sha256 == to.cache_sha256 && plan.donor_bsp_index == to.bsp_index)
    {
        return invalid("The neighboring Atlas region is already built into this map");
    }
    let (translation, yaw) = if origin.region_id == from.region_id {
        ([0.; 3], 0.)
    } else {
        let route = routes.iter().find(|plan| matches(plan, from))
            .ok_or_else(|| SparkError::Invalid("This Atlas region is not authored in the compiled map".into()))?;
        (route.translation, route.yaw_degrees)
    };
    let (saved_translation, saved_yaw) = atlas_transform(origin, from);
    if sub(translation, saved_translation).iter().any(|axis| axis.abs() > 1e-6)
        || (yaw - saved_yaw).abs() > 1e-6 {
        return invalid("The saved base placement differs from the compiled map. Restore its compiled Atlas position before adding a neighbor");
    }
    Ok((origin, translation, yaw))
}

/// Keep Atlas-authored builds tied to their reviewed source placement and adjacency.
pub fn verify_atlas_plan(project: &Project, base: &MapInspection, plan: &BspAssembly) -> Result<()> {
    let Some(from_id) = &plan.atlas_from_region_id else { return Ok(()); };
    let layout = project.megaworld_layout.as_ref().ok_or_else(||
        SparkError::Invalid("Restore the saved Atlas for this native connection".into()))?;
    let to_id = format!("{}:{}", plan.donor_source.sha256, plan.donor_bsp_index);
    let (from, to) = layout.connection(from_id, &to_id)?;
    let (origin, _, _) = atlas_base_frame(project, base, from, to)?;
    let (translation, yaw) = atlas_transform(origin, to);
    let base_index = if from.cache_sha256 == base.sha256 { from.bsp_index } else { 0 };
    let yaw_delta = (plan.yaw_degrees - yaw + 180.).rem_euclid(360.) - 180.;
    if plan.atlas_origin.as_ref() != Some(origin) || plan.base_bsp_index != base_index
        || to.cache_version != plan.donor_source.cache_version
        || sub(plan.translation, translation).iter().any(|axis| axis.abs() > 1e-6)
        || yaw_delta.abs() > 1e-6
    {
        return invalid("Native placement differs from the saved Atlas. Apply matching Atlas and Construction settings before building");
    }
    if to.underground && (plan.open_road || (!from.underground && to.maximum[2] + translation[2] >= plan.tunnel_points[0][2])) {
        return invalid("Keep the underground neighbor covered and use an enclosed approach");
    }
    if from.underground && plan.open_road {
        return invalid("Use an enclosed approach for the underground Atlas region");
    }
    Ok(())
}

/// Prepare an actual native connection in the original Atlas frame.
pub fn plan_from_atlas(
    base_project: &Project, base: &MapInspection, donor_project: &Project, donor: &MapInspection,
    from: &crate::megaworld::LayoutRegion, to: &crate::megaworld::LayoutRegion, tags: PathBuf,
    terrain_seam: bool,
) -> Result<BspAssembly> {
    if to.cache_sha256 != donor.sha256 || to.cache_version != donor.header.version {
        return invalid("The donor must match its saved Atlas source identity");
    }
    let (origin, base_translation, base_yaw) = atlas_base_frame(base_project, base, from, to)?;
    let (translation, yaw) = atlas_transform(origin, to);
    let center = |region: &crate::megaworld::LayoutRegion| mul(add(region.minimum, region.maximum), 0.5);
    let approach = sub(transform(center(to), translation, yaw), transform(center(from), base_translation, base_yaw));
    let continuation = from.cache_sha256 != base.sha256;
    let in_region = |point: V| {
        if !continuation { return true; }
        let local = transform(sub(point, base_translation), [0.; 3], -base_yaw);
        (0..3).all(|axis| (from.minimum[axis] - 0.001..=from.maximum[axis] + 0.001).contains(&local[axis]))
    };
    let surface_heading = crate::megaworld::surface_access_for(from, to).map(|(surface, _, access)| {
        let reverse = if from.region_id == surface.region_id { 0. } else { 180. };
        (access.heading_degrees + reverse - origin.yaw_degrees + 180.).rem_euclid(360.) - 180.
    });
    if surface_heading.is_none() && approach[0].hypot(approach[1]) < 1. {
        return invalid("Move the neighboring Atlas region to leave a horizontal approach");
    }
    if terrain_seam && (from.underground || to.underground || from.bsp_index != 0 || base.mesh.parts.len() != 1) {
        return invalid("Choose two surface regions with one base BSP for a terrain seam");
    }
    let direction = surface_heading.unwrap_or_else(|| approach[1].atan2(approach[0]).to_degrees());
    let base_index = if continuation { 0 } else { from.bsp_index };
    let mut plan = plan_from_bsp_placement(base_project, base, donor_project, donor, base_index,
        to.bsp_index, tags, direction, None, Some((translation, yaw)), &in_region)?;
    plan.atlas_origin = Some(origin.clone());
    plan.atlas_from_region_id = Some(from.region_id.clone());
    plan.include_donor_scenery = true;
    plan.fit_passage_floor = surface_heading.is_some() && !plan.separate_native_bsps;
    if to.underground && !from.underground {
        let roof = to.maximum[2] + translation[2];
        if plan.fit_passage_floor {
            plan_buried_approach(base_project,base,donor,&mut plan,direction,roof,&in_region)?;
        }
        if roof >= plan.tunnel_points[0][2] {
            return invalid("Lower the underground Atlas region below the surface entrance before building");
        }
    }
    if terrain_seam {
        let source=base_project.source.as_ref().ok_or_else(|| SparkError::Invalid("Destination source is missing".into()))?;
        return terrain::plan_placed(&source.preserved_path, base, donor, plan, direction);
    }
    plan.validate()?;
    Ok(plan)
}

/// Select the actual surface landing behind the buried entry along the Atlas
/// heading. The whole-map edge is not an entrance when the room lies below it.
fn plan_buried_approach(
    base_project:&Project,base:&MapInspection,donor:&MapInspection,plan:&mut BspAssembly,
    heading:f64,roof:f64,in_region:&dyn Fn(V)->bool,
)->Result<()>{
    let source=base_project.source.as_ref().ok_or_else(||SparkError::Invalid("Destination source is missing".into()))?;
    let (base_mesh,base_faces)=maps::collision_source(&source.preserved_path,base)?;
    let (donor_mesh,donor_faces)=maps::collision_source(&plan.donor_source.preserved_path,donor)?;
    let (y,x)=heading.to_radians().sin_cos();
    let donor_heading=transform([-x,-y,0.],[0.;3],-plan.yaw_degrees);
    let starts=donor.objects.iter().filter(|row|row.kind=="Player spawn").map(|row|row.position.map(f64::from)).collect::<Vec<_>>();
    let mouths=playable_anchor_candidates(&donor_mesh,&donor_faces,plan.donor_bsp_index,donor_heading,&starts,32.,&|_|true)?;
    let base_checker=crate::bsp_clearance::RouteChecker::for_part(&base_mesh,plan.base_bsp_index)?;
    let donor_checker=crate::bsp_clearance::RouteChecker::for_part(&donor_mesh,plan.donor_bsp_index)?;
    let lane=f64::from(plan.tunnel_width)*0.5-0.2;
    let clear=|checker:&crate::bsp_clearance::RouteChecker,point:V,axis:V|{
        [-lane,0.,lane].into_iter().all(|offset|{
            let mut step=add(point,mul(axis,offset));
            step[2]+=0.08;
            checker.verify_start(step).is_ok()
        })
    };
    for angle in [0.,-15.,15.,-30.,30.,-45.,45.] {
        let (y,x)=(heading+angle).to_radians().sin_cos();
        let toward=[x,y,0.];
        let side=[-y,x,0.];
        let local_side=transform(side,[0.;3],-plan.yaw_degrees);
        let clear_mouths=mouths.iter().map(|&(point,_)|point)
            .filter(|&point|clear(&donor_checker,point,local_side)).take(24).collect::<Vec<_>>();
        for run in [20.,24.,32.,40.,48.,56.,64.,72.,84.] {
            for &mouth in &clear_mouths {
                let end=transform(mouth,plan.translation,plan.yaw_degrees);
                let sample=sub(end,mul(toward,run));
                let Ok((start,face))=terrain::source_floor(&base_mesh,&base_faces,plan.base_bsp_index,sample,0.65) else{continue;};
                if !in_region(start)||start[2]<=roof||(start[2]-end[2]).abs()>0.30*run
                    || !clear(&base_checker,start,side) {continue;}
                if let Some(shader)=connection_shader(&base.tags,base_faces[face].shader,&base.header.name) {
                    plan.tunnel_shader_path=shader.path.clone();
                }
                plan.tunnel_points=vec![start,end];
                return plan.validate();
            }
        }
    }
    invalid("No clear surface approach fits the saved underground heading and depth. Rotate the entrance or move it nearer a walkable surface landing.")
}

fn plan_from_bsp_placement(
    base_project: &Project, base: &MapInspection, donor_project: &Project, donor: &MapInspection,
    base_index: usize, index: usize, tags: PathBuf, direction_degrees: f64,
    regional_preset: Option<RegionalConnectionPreset>, placement: Option<(V, f64)>,
    in_base_region: &dyn Fn(V) -> bool,
) -> Result<BspAssembly> {
    if !direction_degrees.is_finite() || direction_degrees.abs() > 360. {
        return invalid("Tunnel direction must be a finite angle within 360 degrees");
    }
    let (y, x) = direction_degrees.to_radians().sin_cos();
    let toward = [x, y, 0.];
    let crosswise = [-y, x, 0.];
    if index >= donor.mesh.parts.len() {return invalid("Choose an existing donor BSP section");}
    let retaining = can_extend_partitions(base_project, base);
    if base_index >= base.mesh.parts.len() || (base.mesh.parts.len() != 1 && !retaining) || base_project.id == donor_project.id {
        return invalid("Choose a different donor and an existing destination BSP");
    }
    if retaining && (donor.header.version != 609 || donor.mesh.parts.len() != 1) {
        return invalid("A retained MCC13 assembly requires a single-BSP Custom Edition donor");
    }
    let base_source = base_project.source.as_ref()
        .ok_or_else(|| SparkError::Invalid("Destination source missing".into()))?;
    let (base_mesh, faces) = maps::collision_source(&base_source.preserved_path, base)?;
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
    let radius = if regional_preset.is_some() { 96. } else { 32. };
    let base_anchors=playable_anchor_candidates(&base_mesh,&faces,base_index,toward,&starts(base),radius,in_base_region)?;
    let yaw = placement.map_or(0., |(_, yaw)| yaw);
    let donor_direction = transform(mul(toward, -1.), [0.; 3], -yaw);
    let donor_anchors=playable_anchor_candidates(&donor_mesh,&donor_faces,index,donor_direction,&starts(donor),radius,&|_| true)?;
    let (start,face)=base_anchors[0];
    let (end,_)=donor_anchors[0];
    let donor_part = &donor_mesh.parts[index];
    let donor_min = donor_mesh.indices
        [donor_part.index_start..donor_part.index_start + donor_part.index_count]
        .iter()
        .map(|i| dot(vertex(&donor_mesh, *i), toward))
        .fold(f64::INFINITY, f64::min);
    let base_max = projected_bounds(&base_mesh, base_index, [0.; 3], 0., toward)?[1];
    let place = |start: V, end: V| add(
        mul(toward, base_max + 64. - donor_min),
        add(mul(crosswise, dot(sub(start, end), crosswise)), [0., 0., start[2] - end[2]]),
    );
    let translation = placement.map_or_else(|| place(start,end), |(translation, _)| translation);
    let shader = connection_shader(&base.tags, faces[face].shader, &base.header.name)
        .ok_or_else(|| {
            SparkError::Invalid("Choose a real environment shader for the tunnel".into())
        })?;
    let mut plan = BspAssembly {
        schema_version: 1,
        atlas_origin: None,
        atlas_from_region_id: None,
        donor_project_id: donor_project.id.clone(),
        donor_title: donor_project.title.clone(),
        donor_source,
        donor_tags_directory: tags,
        donor_bsp_index: index,
        base_bsp_index: base_index,
        separate_native_bsps: retaining,
        preserve_donor_bsp: false,
        tunnel_bake_fill: false,
        directional_donor_landing: false,
        fit_passage_floor: false,
        include_donor_scenery: false,
        translation,
        yaw_degrees: yaw,
        tunnel_points: vec![start, transform(end, translation, yaw)],
        tunnel_width: 2.,
        tunnel_height: 1.6,
        tunnel_shader_path: shader.path.clone(),
        open_road: false,
        infantry_tunnel: None,
        high_ground: None,
        terrain_seam: None,
        sections:vec![],arch_segments:None,
        visibility_zones: vec![],
        native_seals: vec![],
        restore_donor_sky_portals: false,
        outdoor_sky_split: None,
    };
    if let Some(preset) = regional_preset {
        if !retaining || base.mesh.parts.len() > 14 {
            return invalid("Regional presets need a retained MCC13 world with two available BSP slots");
        }
        let mut review = plan.clone();
        review.separate_native_bsps = false;
        review.base_bsp_index = 0;
        review.open_road = matches!(preset,RegionalConnectionPreset::SurfaceLandBridge);
        if !matches!(preset,RegionalConnectionPreset::UndergroundInfantryTunnel) {
            review.tunnel_width = 6.;
            review.tunnel_height = 4.;
        }
        let base_vehicles = crate::bsp_vehicles::edited_base_vehicles(base_project, base)?;
        let donor_vehicles = maps::scenario_vehicles(&plan.donor_source.preserved_path, donor)?;
        let donor_pickups=maps::scenario_netgame_pickups(&plan.donor_source.preserved_path,donor)?;
        let mut pick = |mesh:&MeshData, part, candidates:Vec<(V,usize)>, label, donor_side:bool| {
            let checker=crate::bsp_clearance::RouteChecker::for_part(mesh,part)?;
            let (vehicles, outward) = if donor_side { (&donor_vehicles, toward) } else { (&base_vehicles, mul(toward, -1.)) };
            for candidate in candidates.into_iter().take(32) {
                let bound = intact_span_before_vehicles(candidate.0, outward, review.tunnel_width, review.tunnel_height,
                    vehicles.iter().filter(|row| row.tag.is_some()).map(|row| row.position.map(f64::from)));
                if let Ok((overlap,_,_))=choose_intact_landing_bounded(&checker, &mut review, candidate.0, [0.; 3], toward, bound) {
                    let donor_cap=[
                        sub(overlap[0],mul(toward,1.)),
                        add(overlap[1],mul(toward,CONNECTOR_END_CAP)),
                    ];
                    if donor_side && donor_pickups.iter().any(|row|intact_connector_contains_placement(
                        &donor_cap,toward,f64::from(review.tunnel_width),f64::from(review.tunnel_height),row.position.map(f64::from),
                    )) { continue; }
                    return Ok((candidate,overlap));
                }
            }
            invalid(format!("No unobstructed level {label} landing fits this direction and passage width. Try another heading or pick both floors with the regular tunnel planner."))
        };
        let ((start,face),base_overlap)=pick(&base_mesh,base_index,base_anchors,"surface-side",false)?;
        let ((end,_),donor_overlap)=pick(&donor_mesh,index,donor_anchors,"donor-side",true)?;
        plan.translation=place(start,end);
        plan.tunnel_points=vec![start,add(end,plan.translation)];
        if let Some(shader)=connection_shader(&base.tags,faces[face].shader,&base.header.name) {
            plan.tunnel_shader_path=shader.path.clone();
        }
        let count=base.mesh.parts.len();
        let draft=apply_regional_connection_preset(plan,count,donor,preset)?;
        // Existing regions may occupy the projected route. Keep the reviewed
        // local landing points and search farther in the requested direction.
        let mut first_problem=None;
        for advance in [0.,8.,16.,32.,48.,64.,96.,128.] {
            let mut placed=draft.clone();
            placed.translation=add(placed.translation,mul(toward,advance));
            placed.tunnel_points[1]=add(end,placed.translation);
            let overlaps=[base_overlap,donor_overlap.map(|point|add(point,placed.translation))];
            let checked=(|| {
                placed.validate()?;
                let points=intact_floor_points(overlaps,toward,placed.open_road,None)?;
                verify_intact_connector_vehicles(&points, toward, &placed, &base_vehicles, &donor_vehicles)?;
                for point in &points {validate_native_bsp_point(*point)?;}
                if donor_pickups.iter().any(|row|intact_connector_contains_placement(
                    &points,toward,f64::from(placed.tunnel_width),f64::from(placed.tunnel_height),
                    add(row.position.map(f64::from),placed.translation),
                )) {
                    return invalid("The planned passage overlaps a native donor pickup. Choose another heading or move the landing clear of the original item.");
                }
                if !intact_common_separation(&base.mesh,count,&donor.mesh,index,placed.translation,toward)? {
                    verify_intact_neighborhood((&base.mesh,&base_mesh),(&donor.mesh,&donor_mesh),
                        index,placed.translation,count,&placed,&points)?;
                }
                Ok(())
            })();
            match checked {
                Ok(())=>return Ok(placed),
                Err(error)=>{first_problem.get_or_insert(error);}
            }
        }
        return Err(first_problem.unwrap());
    }
    // Atlas fitting replaces these preliminary mouth points before validation.
    if placement.is_none() { plan.validate()?; }
    Ok(plan)
}
#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RegionalConnectionPreset {
    SurfaceLandBridge,
    UndergroundTunnel,
    UndergroundInfantryTunnel,
}

/// Fit a new connection using the existing intact-donor plan and native BSP slots.
fn apply_regional_connection_preset(
    mut plan: BspAssembly,
    base_bsp_count: usize,
    donor: &MapInspection,
    preset: RegionalConnectionPreset,
) -> Result<BspAssembly> {
    if !plan.separate_native_bsps || !(2..=14).contains(&base_bsp_count) || plan.yaw_degrees != 0.
        || donor.header.extended || donor.header.version != 609 || donor.header.scenario_type != 1
        || donor.sha256 != plan.donor_source.sha256 || donor.mesh.parts.len() != 1
    {
        return invalid("A surface bridge or underground tunnel needs a retained MCC13 world with two free BSP slots and an original single-BSP CE multiplayer donor");
    }
    plan.validate()?;
    plan.preserve_donor_bsp = true;
    plan.open_road = matches!(preset, RegionalConnectionPreset::SurfaceLandBridge);
    plan.tunnel_bake_fill = !plan.open_road;
    if matches!(preset, RegionalConnectionPreset::UndergroundInfantryTunnel) {
        plan.tunnel_width = 2.;
        plan.tunnel_height = 1.6;
    } else {
        plan.tunnel_width = plan.tunnel_width.max(6.);
        plan.tunnel_height = plan.tunnel_height.max(4.);
    }
    if !plan.open_road {
        let [start, end] = [plan.tunnel_points[0], plan.tunnel_points[1]];
        let roof = projected_bounds(&donor.mesh, plan.donor_bsp_index, plan.translation, 0., [0., 0., 1.])?;
        // Reserve terrain above the donor's entire native collision hull and enough
        // approach distance for the landing caps and a moderate vehicle grade.
        let lower_by = (roof[1] - (start[2] - 8.)).max(0.);
        let gap = sub(end, start);
        let run = gap[0].hypot(gap[1]);
        let grade_run = (end[2] - lower_by - start[2]).abs() / 0.25 + 24.;
        let additional_run = (grade_run - run).max(0.);
        let shift = [gap[0] / run * additional_run, gap[1] / run * additional_run, -lower_by];
        plan.translation = add(plan.translation, shift);
        plan.tunnel_points[1] = add(end, shift);
        let donor_z = roof.map(|z| z - lower_by);
        for z in donor_z {
            validate_native_bsp_point([plan.tunnel_points[1][0], plan.tunnel_points[1][1], z])?;
        }
    }
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
    pub route_clearance: Vec<Vec<RouteClearance>>,
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
    let return_samples = checker.verify_return(route)?;
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

pub const MAX_COMPILED_CONNECTIONS: usize = 64;

/// Recheck earlier connections after extending a world. Routes must use the
/// compiled world's coordinates; BSP checks do not include scenery or physics.
pub fn verify_compiled_routes(path: &Path, routes: &[BspAssembly]) -> Result<CompiledRouteReport> {
    if routes.is_empty() || routes.len() > MAX_COMPILED_CONNECTIONS {
        return invalid(format!("Choose 1–{MAX_COMPILED_CONNECTIONS} connections to check in the compiled cache"));
    }
    for route in routes { route.validate()?; }
    let inspection = maps::inspect_map(path, path.parent())?;
    let (collision, _) = maps::collision_source(path, &inspection)?;
    let checker = crate::bsp_clearance::RouteChecker::new(&collision)?;
    let mut walk_samples = Vec::with_capacity(routes.len());
    let mut route_clearance = Vec::with_capacity(routes.len());
    for (index, route) in routes.iter().enumerate() {
        let details = checker.verify_details(route).map_err(|error| {
            SparkError::Invalid(format!("Connection {} ({}): {error}", index + 1, route.donor_title))
        })?;
        if route.fit_passage_floor || route.terrain_seam.as_ref().is_some_and(|seam|seam.bearing_degrees.is_some()) {
            checker.verify_return(route).map_err(|error| SparkError::Invalid(format!(
                "Return through connection {} ({}): {error}",index+1,route.donor_title,
            )))?;
        }
        walk_samples.push(details.iter().map(|detail| detail.walk_samples).sum());
        route_clearance.push(details);
    }
    Ok(CompiledRouteReport {
        cache_sha256: inspection.sha256,
        collision_triangles: collision.indices.len() / 3,
        walk_samples,
        route_clearance,
    })
}
#[cfg(test)]
fn playable_anchor(
    mesh: &MeshData,
    faces: &[CollisionFace],
    part: usize,
    toward: V,
    starts: &[V],
) -> Result<(V, usize)> {
    Ok(playable_anchor_candidates(mesh,faces,part,toward,starts,32.,&|_| true)?.into_iter().next().unwrap())
}

fn playable_anchor_candidates(
    mesh:&MeshData, faces:&[CollisionFace], part:usize, toward:V, starts:&[V], radius:f64,
    in_region: &dyn Fn(V) -> bool,
) -> Result<Vec<(V,usize)>> {
    let fallback = anchor_in_region(mesh, faces, part, toward, in_region)?;
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
            if !in_region(point) || !bary(
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
            // Bound the search in the map plane. A nearby playable floor can
            // sit far above a closed BSP's bottom. Rank admitted floors in
            // three dimensions to favor the nearest supported elevation.
            if delta[0].hypot(delta[1]) <= radius {
                candidates.push((point, face, dot(delta, delta)));
            }
        }
    }
    candidates.sort_by(|a,b|a.2.total_cmp(&b.2));
    Ok(candidates.into_iter().map(|(p,f,_)|(p,f)).chain([fallback]).collect())
}
// Simplification can leave two sides of a sub-float miter fin distinct in
// f64 but coincident in the exported f32 mesh. Rebuild that rounded closed
// volume, keeping material IDs, rather than deleting individual faces/edges.
fn collision_precision_cleanup(mut output: MeshGL64) -> Result<MeshGL64> {
    let problem = |mesh:&MeshGL64| {
        let mut faces=std::collections::BTreeSet::new();
        mesh.tri_verts.chunks_exact(3).enumerate().any(|(face,t)| {
            let p:[V;3]=std::array::from_fn(|k|std::array::from_fn(|j|f64::from(mesh.vert_properties[t[k] as usize*3+j] as f32)));
            let n=cross(sub(p[1],p[0]),sub(p[2],p[0]));
            let mut key=p.map(|v|v.map(f64::to_bits));key.sort();
            dot(n,n)==0. || !faces.insert((mesh.face_id[face],key))
        })
    };
    for _ in 0..3 {
        crate::bsp_triangulate::improve(&mut output);
        if !problem(&output) { return Ok(output); }
        for value in &mut output.vert_properties { *value=f64::from(*value as f32); }
        output.merge();
        let body=checked(Manifold::from_mesh_gl64_robust(&output),"Rounded collision import")?;
        let body=checked(body.rebuild_solid(manifold_rust::types::WindingRule::Positive),"Rounded collision regularization")?;
        output=body.get_mesh_gl64(-1);
        if output.num_prop!=3 || output.face_id.len()!=output.num_tri() || output.num_tri()>MAX_OUTPUT_TRIANGLES { return invalid("Rounded collision lost native material identities or exceeded the BSP budget"); }
    }
    if problem(&output) { return invalid("Collision still has collapsed or coincident native faces after bounded precision repair; adjust the source connection"); }
    Ok(output)
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
    let output = body.get_mesh_gl64(-1);
    if output.num_prop != 3 || output.face_id.len() != output.num_tri() {
        return invalid("Collision layer lost its material identity");
    }
    let output = collision_precision_cleanup(output)?;
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
    fn join_preflight_distinguishes_collision_overlaps_from_render_and_portals() {
        let material = |name: &str, collision_only| AssemblyMaterial {
            name: name.into(), source: 0, shader_path: (!name.starts_with('+')).then(|| "floor".into()),
            shader_class: None, flags: 0, collision_only,
        };
        let mut geometry = AssemblyGeometry {
            mesh: MeshData {
                positions: vec![0., 0., 0., 1., 0., 0., 0., 1., 0., 1., 0.004, 0.],
                normals: vec![0.; 12],
                uvs: vec![0., 0., 0.25, 0., 0., 0.25, 0.25, 0.0000001],
                indices: vec![0, 1, 2, 2, 0, 1, 0, 1, 2, 0, 2, 1, 0, 1, 3, 0, 1, 1],
                ..Default::default()
            },
            materials: vec![
                material("collision", true), material("render", false),
                material("+exactportal", false), material("gster_test", false),
            ],
            triangle_materials: vec![0, 1, 2, 0, 3, 1],
            exact_sky_portals: Vec::new(),
            report: AssemblyReport {
                input_triangles: 0, output_triangles: 6, connector_triangles: 1, generated_uv_faces: 1,
                walk_samples: 0, portal_count: 1, route_clearance: vec![], donor_scenery: 0, warnings: vec![],
            },
        };
        let report = geometry.source_preflight().unwrap();
        assert_eq!(report.blocked_faces, 3);
        assert_eq!(report.examples.into_iter().map(|issue| issue.triangle).collect::<Vec<_>>(), [3, 4, 5]);
        geometry.mesh.uvs[7] = f32::NAN;
        assert_eq!(geometry.source_preflight().unwrap().examples[1].reason, "a UV coordinate is invalid");
        geometry.mesh.uvs[2] = 0.03;
        geometry.mesh.uvs[7] = 0.000001;
        let report = geometry.source_preflight().unwrap();
        assert_eq!(report.blocked_faces, 2);
        assert_eq!(report.lighting_risks, 1);
        assert_eq!(report.lighting_examples[0].triangle, 4);
        geometry.mesh.uvs[7] = 0.001;
        geometry.mesh.indices.truncate(9);
        geometry.triangle_materials.truncate(3);
        geometry.source_preflight().unwrap().require_buildable().unwrap();

        // Vertical faces, a reversed-winding partial overlap, a shared edge,
        // and a nearby parallel face beyond the export precision tolerance.
        geometry.mesh.positions = vec![
            0., 0., 0., 0., 4., 0., 0., 0., 4., 0., 0., -4.,
            0., 2., 0., 0., 6., 0., 0., 2., 4.,
            0.001, 0., 0., 0.001, 4., 0., 0.001, 0., 4.,
        ];
        geometry.mesh.normals = vec![0.; 30];
        geometry.mesh.uvs = vec![0.; 20];
        geometry.mesh.indices = vec![0, 1, 2, 1, 0, 3, 4, 6, 5, 7, 8, 9, 0, 1, 2, 0, 1, 2];
        geometry.triangle_materials = vec![0, 0, 0, 0, 1, 2];
        let report = geometry.source_preflight().unwrap();
        assert_eq!(report.blocked_faces, 1);
        assert_eq!(report.examples[0].triangle, 2);
        assert_eq!(report.examples[0].overlaps_triangle, Some(0));
        assert!(report.require_buildable().unwrap_err().to_string().contains("with triangle 0"));
    }

    #[test]
    fn native_render_emits_only_faces_with_area_at_jms_precision() {
        let gl = MeshGL64 {
            num_prop: 5,
            tri_verts: vec![0, 1, 2, 0, 1, 3],
            face_id: vec![0, 0],
            vert_properties: vec![
                0., 0., 0., 0., 0.,
                4., 0., 0., 1., 0.,
                2., 2e-9, 0., 0.5, 0.,
                2., 2e-8, 0., 0.5, 1.,
            ],
            ..Default::default()
        };
        let material = AssemblyMaterial {
            name: "donor".into(), source: 1, shader_path: Some("stock/floor".into()),
            shader_class: Some("senv".into()), flags: 0, collision_only: false,
        };
        let (mut mesh, mut slots) = (MeshData::default(), Vec::new());
        assert_eq!(append_render_faces(&gl, &[material], &mut mesh, &mut slots, None).unwrap(), 1);
        assert_eq!(mesh.indices, [0, 1, 2]);
        assert_eq!(slots, [0]);
        assert_eq!(mesh.positions, [0., 0., 0., 2., 2e-8, 0., 4., 0., 0.]);
        assert_eq!(mesh.uvs, [0., 0., 0.5, 1., 1., 0.]);
    }

    #[test]
    fn join_preflight_only_counts_positive_area_face_intersections() {
        let face = [[0., 0., 0.], [4., 0., 0.], [0., 4., 0.]];
        let normal = [0., 0., 1.];
        let (mut polygon, mut clipped) = (Vec::new(), Vec::new());
        let mut overlaps = |other| coplanar_overlap(face, normal, other, normal, &mut polygon, &mut clipped);
        assert!(overlaps([[1., 1., 0.], [2., 1., 0.], [1., 2., 0.]]));
        assert!(!overlaps([[4., 0., 0.], [5., 0., 0.], [4., 1., 0.]]));
        // Bounding boxes overlap but the diagonal half-planes are disjoint.
        assert!(!overlaps([[2.1, 2.1, 0.], [4., 2.1, 0.], [2.1, 4., 0.]]));
    }

    #[test]
    fn native_structure_bound_includes_exact_edges_and_checks_each_axis() {
        for axis in 0..3 {
            let mut point = [0.; 3];
            point[axis] = -1500.;
            validate_native_bsp_point(point).unwrap();
            point[axis] = 1500.;
            validate_native_bsp_point(point).unwrap();
            point[axis] += 0.01;
            assert!(validate_native_bsp_point(point).is_err());
        }
    }

    #[test]
    fn native_pickup_clearance_checks_the_whole_connecting_passage() {
        use std::f64::consts::FRAC_1_SQRT_2 as DIAG;
        let end = [1382.361813213609, -626.9062963984237, -18.20604133605957];
        let forward = [DIAG, -DIAG, 0.];
        let point = |distance| add(end, mul(forward, distance));
        let route = [point(-840.), point(-830.), point(-2.), point(2.5)];
        let pickup = [1376.3582, -619.83777, -18.205042];
        assert!(intact_connector_contains_placement(&route, forward, 2., 1.6, pickup));
        assert!(!intact_connector_contains_placement(&route, forward, 2., 1.6, add(pickup, [1.5, 1.5, 0.])));
        assert!(!intact_connector_contains_placement(&route, forward, 2., 1.6, add(pickup, [0., 0., 2.])));
    }

    #[test]
    fn a_preserved_connector_turn_has_matching_floor_and_full_clearance() {
        let points = [[0., 0., 0.], [8., 0., 0.], [16., 8., 2.], [16., 16., 2.]];
        let sides = tunnel_sides(&points, 2.).unwrap();
        let floor = mitered_connector_floor(&points, &sides).unwrap();
        assert!(floor.iter().any(|face| face.contains([12., 4., 1.2], 1.6)));
        assert!(!floor.iter().any(|face| face.contains([10., 5., 1.2], 1.6)));

        let body = joined_passage_solid(&points, &sides, 1.6, None, &AtomicBool::new(false)).unwrap();
        assert!(body.get_mesh_gl64(-1).num_tri() > 12);
        let obstruction = MeshData {
            positions: vec![12., 4.6, 0., 12., 4.6, 3., 12., 5.8, 3.],
            indices: vec![0, 1, 2],
            ..Default::default()
        };
        let checker = crate::bsp_clearance::RouteChecker::new(&obstruction).unwrap();
        assert!(checker.mitered_connector_intrusion(&floor, 1.6, [0.; 3]).is_some());
        assert!(checker.mitered_connector_intrusion(&floor, 1.6, [0., 5., 0.]).is_none());
    }

    #[test]
    fn a_long_diagonal_level_connector_bakes_charts_without_collision_slivers() {
        let forward = [std::f64::consts::FRAC_1_SQRT_2, -std::f64::consts::FRAC_1_SQRT_2, 0.];
        let start = [732., 52., -18.];
        let end = add(start, mul(forward, 900.));
        let points = [start, add(start, mul(forward, 5.)), sub(end, mul(forward, 5.)), end];
        let side = [-forward[1], forward[0], 0.];
        let body = intact_connector_solid(&points, side, 1.6, None, &AtomicBool::new(false)).unwrap();
        assert_eq!(body.get_mesh_gl64(-1).num_tri(), 12);
        let mut render = connector_charts(&[start, end], side, 1.6, None);
        assert_eq!(render.num_tri(), 156);
        assert_eq!(crate::bsp_triangulate::refine_connector_charts(&mut render, MAX_OUTPUT_TRIANGLES).unwrap(), 0);

    }

    #[test]
    fn a_long_graded_connector_uses_chart_panels_without_internal_caps() {
        use std::f64::consts::FRAC_1_SQRT_2 as DIAG;
        let start = [790., -35., -32.];
        let section = |distance, elevation| add(start, [DIAG * distance, -DIAG * distance, elevation]);
        let points = [start, section(4., 0.), section(840., 14.), section(844., 14.)];
        let side = [DIAG, DIAG, 0.];
        let mut render = connector_charts(&points, side, 1.6, None);
        // Two short approaches, eighteen grade panels, and just two outer caps.
        assert_eq!(render.num_tri(), 20 * 8 + 4);
        assert_eq!(crate::bsp_triangulate::refine_connector_charts(&mut render, MAX_OUTPUT_TRIANGLES).unwrap(), 0);
    }

    #[test]
    fn intact_open_bridge_uses_sky_above_a_level_vehicle_deck_and_protected_landings() {
        let forward = [1., 0., 0.];
        let side = [0., 3., 0.];
        for [west, east] in [[0., 0.], [0., 3.], [3., 0.]] {
            let landings = [[[0., 0., west], [3., 0., west]], [[33., 0., east], [36., 0., east]]];
            let points = intact_floor_points(landings, forward, true, None).unwrap();
            assert_eq!(points.len(), if west == east { 4 } else { 5 });
            assert_eq!([points[0][2], points[1][2]], [west, west]);
            assert_eq!([points[points.len()-2][2], points[points.len()-1][2]], [east, east]);
            assert!(points[1..points.len() - 1].windows(2).any(|pair|
                pair[1][2] == pair[0][2] && pair[1][0] - pair[0][0] >= 4.));
            for pair in points.windows(2) {
                assert!((pair[1][2]-pair[0][2]).abs() / (pair[1][0]-pair[0][0]) <= 0.25);
            }
            let body = intact_connector_solid(&points, side, 4., Some(1), &AtomicBool::new(false)).unwrap();
            assert!(body.get_mesh_gl64(-1).face_id.contains(&1));
            let flat = connector_charts(&[[0., 0., 0.], [36., 0., 0.]], side, 4., Some(1));
            assert_eq!(flat.face_id.iter().filter(|&&slot| slot == 1).count(), 2);
        }
        let too_steep = [[[0., 0., 0.], [3., 0., 0.]], [[11., 0., 3.], [14., 0., 3.]]];
        assert!(intact_floor_points(too_steep, forward, true, None).is_err());
    }

    #[test]
    fn directional_donor_landing_keeps_both_receiving_floors_downhill() {
        let donor = maps::MeshData {
            positions: vec![-2., -1., -0.04, 2., -1., 0.04, 2., 1., 0.05, -2., 1., -0.03],
            indices: vec![0, 1, 2, 0, 2, 3],
            ..Default::default()
        };
        let stock = crate::bsp_clearance::RouteChecker::new(&donor).unwrap();
        let forward = [1., 0., 0.];
        let ramp = fit_directional_landing(&stock, [0.; 3], forward, 0.65, 2., [0.; 3]).unwrap();
        let landings = [[[-32., 0., 0.], [-28., 0., 0.]], [[-1.4, 0., 0.], [1.4, 0., 0.]]];
        let connector = |fit| {
            let points = intact_floor_points(landings, forward, false, fit).unwrap();
            let body = intact_connector_solid(&points, [0., 1., 0.], 1.6, None, &AtomicBool::new(false)).unwrap();
            let mut materials = vec![AssemblyMaterial {
                name: "tunnel".into(), source: 0, shader_path: None, shader_class: None,
                flags: 0, collision_only: false,
            }];
            let (mesh, _) = collision_layer(&body.get_mesh_gl64(-1), &mut materials).unwrap();
            crate::bsp_clearance::RouteChecker::new(&mesh).unwrap()
        };
        assert!(verify_directional_landing(&connector(None), &ramp).is_err());
        assert!(verify_directional_landing(&connector(Some(&ramp)), &ramp).unwrap() <= LANDING_MAX_DROP);

        let blocked = [
            LandingSample { point: [0.; 3], station: -0.65, stock_z: 0., into_donor: false },
            LandingSample { point: [0.; 3], station: 0.65, stock_z: 1., into_donor: true },
        ];
        assert!(solve_directional_landing(&blocked).is_none());
    }

    #[test]
    fn overlapping_outgoing_switches_cannot_compete_for_the_same_source() {
        use std::f64::consts::FRAC_1_SQRT_2 as DIAG;
        let old = partition_switch(1, 5, [0., 0., 0.], [1., 0., 0.], 2., 1.6);
        let fields = [maps::ScenarioLogicVolume { name: old.name.clone(), kind: 1, geometry: Some(old.geometry) }];
        let retained = [maps::NativeBspTransition { trigger_index: 0, trigger_name: old.name,
            source_bsp: 1, destination_bsp: 5, arrival_marker: None, geometry: None }];
        let overlapping = partition_switch(1, 7, [0.2, 0.2, 0.], [DIAG, -DIAG, 0.], 2., 1.6);
        assert!(verify_intact_switch_spacing(&[overlapping], &retained, &fields).unwrap_err().to_string().contains("bsp1,5"));
        let independent = partition_switch(2, 7, [0.2, 0.2, 0.], [DIAG, -DIAG, 0.], 2., 1.6);
        verify_intact_switch_spacing(&[independent], &retained, &fields).unwrap();
        let clear = partition_switch(1, 7, [4., 4., 0.], [DIAG, -DIAG, 0.], 2., 1.6);
        verify_intact_switch_spacing(&[clear], &retained, &fields).unwrap();
    }

    #[test]
    fn intact_neighbor_separation_allows_different_axes_without_overlapping() {
        let donor = [[-10., 10.], [-10., 10.], [-10., 10.]];
        assert!(separated_bounds(donor, [[18., 30.], [-20., 20.], [-20., 20.]], 8.));
        assert!(separated_bounds(donor, [[-20., 20.], [-20., 20.], [18., 30.]], 8.));
        assert!(!separated_bounds(donor, [[17.9, 30.], [-20., 20.], [-20., 20.]], 8.));
        assert!(!separated_bounds(donor, [[0., 20.], [0., 20.], [0., 20.]], 0.05));
    }

    #[test]
    fn intact_overlap_uses_shorter_supported_floor_and_disjoint_native_switches() {
        let deck = |half: f32, height: f32| MeshData {
            positions: vec![-half,-1.,height, half,-1.,height, half,1.,height, -half,1.,height],
            indices: vec![0,1,2,0,2,3],
            ..Default::default()
        };
        let center = [0.; 3];
        let forward = [1., 0., 0.];
        let mut plan = dual_route_plan();
        let short = crate::bsp_clearance::RouteChecker::new(&deck(1.6, 0.)).unwrap();
        let wide = crate::bsp_clearance::RouteChecker::new(&deck(2.6, 0.)).unwrap();
        let outside = crate::bsp_clearance::RouteChecker::new(&deck(2.6, 0.1)).unwrap();
        let (shared, span, height) = choose_intact_landing_bounded(&short, &mut plan, center, center, forward, f64::INFINITY).unwrap();
        assert_eq!((shared, span, height), ([[-1.4, 0., 0.], [1.4, 0., 0.]], 1.4, 0.));
        assert_eq!(choose_intact_landing_bounded(&wide, &mut plan, center, center, forward, f64::INFINITY).unwrap().1, 2.3);
        let stock_vehicle = add(center, mul(forward, 2.66));
        let bound = intact_span_before_vehicles(center, forward, plan.tunnel_width, plan.tunnel_height, [stock_vehicle]);
        assert_eq!(choose_intact_landing_bounded(&wide, &mut plan, center, center, forward, bound).unwrap().1, 1.4);
        let reverse = mul(forward, -1.);
        let retained_vehicle = mul(stock_vehicle, -1.);
        let bound = intact_span_before_vehicles(center, reverse, plan.tunnel_width, plan.tunnel_height, [retained_vehicle]);
        assert_eq!(choose_intact_landing_bounded(&wide, &mut plan, center, center, forward, bound).unwrap().1, 1.4);
        assert!(intact_span_before_vehicles(center, reverse, plan.tunnel_width, plan.tunnel_height, [stock_vehicle]).is_infinite());
        assert!(choose_intact_landing_bounded(&outside, &mut plan, center, center, forward, f64::INFINITY).is_err());
        let d = intact_switch_distance(span);
        let from = partition_switch(0, 1, [-d - 0.45, 0., 0.], forward, 1., 1.6).geometry;
        let to = partition_switch(1, 0, [d - 0.45, 0., 0.], forward, 1., 1.6).geometry;
        assert!(f64::from(from.corner[0]) >= shared[0][0]);
        assert!(from.corner[0] + from.dimensions[0] < to.corner[0]);
        assert!(f64::from(to.corner[0] + to.dimensions[0]) <= shared[1][0]);
    }

    #[test]
    fn graded_retained_route_levels_the_shared_landing() {
        let start = [0., 0., -15.];
        let end = [300., 400., 70.];
        assert_eq!(retained_grade_start(start, end), Some([1.8, 2.4, -15.]));
        assert_eq!(retained_grade_start(start, [10., 0., -15.]), None);
    }

    #[test]
    fn authored_visibility_exports_real_portal_faces_and_preserves_empty_serialization() {
        let mut plan:BspAssembly=serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Fixture","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":13,"engine":"fixture","scenarioPath":"fixture"},"donorTagsDirectory":"fixture","donorBspIndex":0,"translation":[0.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[1.,0.,0.],[9.,0.,0.]],"tunnelWidth":2.,"tunnelHeight":1.6,"tunnelShaderPath":"fixture/metal"})).unwrap();
        assert!(serde_json::to_value(&plan).unwrap().get("visibilityZones").is_none());
        let bounds=|lo:f32,hi:f32|MeshData{positions:vec![lo,-1.,0.,hi,1.,2.,lo,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(base,donor)=(bounds(0.,2.),bounds(8.,10.));
        plan.visibility_zones=vec![crate::bsp_visibility::VisibilityZone::Tunnel{id:uuid::Uuid::new_v4().to_string(),name:"Portal span".into(),segment:0,start:0.25,end:0.75}];
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        assert_eq!(add_portals(&mut mesh,&mut materials,&mut slots,&plan,&base,&donor,None,None).unwrap(),2);
        assert_eq!(mesh.positions[0],3.);
        assert_eq!(mesh.positions[12],7.);
        let geometry=AssemblyGeometry{exact_sky_portals: vec![],mesh,materials,triangle_materials:slots,report:AssemblyReport{input_triangles:0,output_triangles:4,connector_triangles:0,generated_uv_faces:0,walk_samples:0,portal_count:2,route_clearance:vec![],donor_scenery:0,warnings:vec![]}};
        assert!(export_jms(&geometry).unwrap().contains("+portal\r\n<none>\r\n"));
        if let crate::bsp_visibility::VisibilityZone::Tunnel{start,..}=&mut plan.visibility_zones[0]{*start=0.05;}
        assert!(add_portals(&mut MeshData::default(),&mut vec![],&mut vec![],&plan,&base,&donor,None,None).is_err());
    }

    #[test]
    fn overlapping_arch_sections_cut_the_actual_joined_air_volume() {
        let mut plan: BspAssembly = serde_json::from_value(serde_json::json!({"schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Fixture","donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":"a".repeat(64),"cacheVersion":609,"engine":"fixture","scenarioPath":"fixture"},"donorTagsDirectory":"fixture","donorBspIndex":0,"translation":[0.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[1.,0.,0.],[9.,0.,0.]],"tunnelWidth":2.,"tunnelHeight":2.,"tunnelShaderPath":"fixture/metal"})).unwrap();
        let edge = SeamEdge { source_sha256: "a".repeat(64), bsp_index: 0, vertices: [[0.;3],[1.,0.,0.]], point: [0.;3] };
        plan.sections.push(SeamSection { id: uuid::Uuid::new_v4().to_string(), name: "Wider arch".into(), points: vec![[1.,1.,0.],[9.,1.,0.]], width: 4., height: 3., shader_path: "fixture/metal".into(), open_road: false, arch_segments: Some(6), edges: [edge.clone(),edge] });
        let narrow = tunnel_solid([1.,0.,0.],[9.,0.,0.],[0.,1.,0.],[0.,1.,0.],2.,0).unwrap();
        let arch = seam_sections::arch_solid([1.,1.,0.],[9.,1.,0.],[0.,2.,0.],[0.,2.,0.],4.,3.,6,0).unwrap();
        let body = checked(narrow.union(&arch), "Fixture union").unwrap();
        let mut materials = vec![material()];
        let (mut mesh, mut slots) = collision_layer(&body.get_mesh_gl64(-1), &mut materials).unwrap();
        let first_portal_vertex = mesh.positions.len()/3;
        let bounds = |lo:f32,hi:f32| MeshData { positions: vec![lo,-5.,0.,hi,5.,6.,lo,5.,0.], indices: vec![0,1,2], parts: vec![maps::MeshPart {name:"fixture".into(),index_start:0,index_count:3}], ..Default::default() };
        let count = add_portals(&mut mesh,&mut materials,&mut slots,&plan,&bounds(0.,2.),&bounds(8.,10.),None,None).unwrap();
        assert_eq!(count, 2, "The same native cut must be shared by overlapping routes");
        // A width-two rectangle lies inside this width-four closed arch and
        // cannot partition it. Every exported cut must reach its outer roof.
        let mut planes = std::collections::BTreeMap::<u32,Vec<[f32;3]>>::new();
        for p in mesh.positions[first_portal_vertex*3..].chunks_exact(3) { planes.entry(p[0].to_bits()).or_default().push([p[0],p[1],p[2]]); }
        for points in planes.values() {
            assert!(points.iter().any(|p| (p[1]-3.).abs()<1e-5), "Portal must reach the joined arch side");
            assert!(points.iter().any(|p| (p[2]-5.).abs()<1e-5), "Portal must reach the joined arch roof");
        }
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
    fn native_collision_regularizes_the_actual_opposing_arch_cap_without_volume_loss() {
        let a=[38.811767578125,34.44912338256836,-21.075042829581236];
        let b=[65.13874816894531,46.44912338256836,-21.075042829581236];
        let sides=tunnel_sides(&[a,b],4.).unwrap();
        let body=seam_sections::arch_solid(a,b,sides[0],sides[1],4.,3.,6,0).unwrap();
        let mut mesh=body.get_mesh_gl64(-1);
        mesh.vert_properties=mesh.vert_properties.chunks_exact(5).flat_map(|p|p[..3].iter().copied()).collect();mesh.num_prop=3;
        let first=mesh.num_vert() as u64;
        // Exact native Tool red-edge cap, in world units. Opposing faces are
        // a numerical fin, not two different material/physics surfaces.
        for p in [[65.57305908,44.44912338,-18.07504272],[65.51486969,44.71707153,-17.07504272],[65.35590363,45.44912338,-16.34299278]] { mesh.vert_properties.extend(p); }
        mesh.tri_verts.extend([first,first+1,first+2,first,first+2,first+1]);mesh.face_id.extend([0,0]);
        let output=collision_precision_cleanup(mesh).unwrap();
        let repaired=checked(Manifold::from_mesh_gl64_robust(&output),"Repaired cap readback").unwrap();
        assert!((repaired.volume()-body.volume()).abs()<1e-3);
        assert!(output.face_id.iter().all(|id|*id==0));
        let mut faces=std::collections::BTreeSet::new();
        for t in output.tri_verts.chunks_exact(3) {let mut key=t.iter().map(|id|std::array::from_fn::<_,3,_>(|k|(output.vert_properties[*id as usize*3+k] as f32).to_bits())).collect::<Vec<_>>();key.sort();assert!(faces.insert(key));}
    }

    #[test]
    fn native_arch_miter_collision_has_no_opposing_float_faces() {
        let points=[[38.811767578125,34.44912338256836,-21.075042829581236],[65.13874816894531,46.44912338256836,-21.075042829581236],[117.79270935058594,46.44912338256836,-21.075042829581236]];
        let sides=tunnel_sides(&points,4.).unwrap();
        let first=seam_sections::arch_solid(points[0],points[1],sides[0],sides[1],4.,3.,6,0).unwrap();
        let second=seam_sections::arch_solid(points[1],points[2],sides[1],sides[2],4.,3.,6,0).unwrap();
        for offset in [0.,1e-10,1e-8,1e-6] {
        let shifted=second.translate(manifold_rust::linalg::Vec3::new(offset,0.,0.));
        let body=checked(first.union(&shifted),"Arch miter fixture").unwrap();
        let mut materials=vec![material()];let (mesh,slots)=collision_layer(&body.get_mesh_gl64(-1),&mut materials).unwrap();
        let mut faces=std::collections::BTreeSet::new();let mut volume=0.;
        for (t,slot) in mesh.indices.chunks_exact(3).zip(slots) {
            let p:[V;3]=std::array::from_fn(|k|vertex(&mesh,t[k]));
            let mut key=p.map(|v|v.map(f64::to_bits));key.sort();
            assert!(faces.insert(key),"Native float narrowing must not leave opposing arch-cap faces");
            let n=cross(sub(p[1],p[0]),sub(p[2],p[0]));assert!(dot(n,n)>0.);
            assert!(materials[slot].collision_only);volume+=dot(p[0],cross(p[1],p[2]))/6.;
        }
    #[test]
    fn intact_connector_caps_close_collision_without_rendering_mouth_walls() {
        let points = [[0., 0., 0.], [9., 0., 0.], [16., 7., 0.]];
        let cancel = AtomicBool::new(false);
        let side = [0., 1., 0.];
        let straight = &points[..2];
        let body = intact_connector_solid(straight, side, 2., None, &cancel).unwrap();
        let mut render = connector_charts(straight, side, 2., None);
        assert_eq!(body.get_mesh_gl64(-1).num_tri(), 12);
        open_connector_render_ends(&mut render, straight, None, side);
        assert_eq!(render.num_tri(), 8);
        assert_eq!(render.face_id.len(), render.num_tri());

        let sides = tunnel_sides(&points, 2.).unwrap();
        let bent = joined_passage_solid(&points, &sides, 2., None, &cancel).unwrap();
        let collision = bent.get_mesh_gl64(-1);
        let mut render = bent.get_mesh_gl64(-1);
        open_connector_render_ends(&mut render, &points, Some(&sides), side);
        assert_eq!(render.num_tri() + 4, collision.num_tri());
        assert_eq!(render.face_id.len(), render.num_tri());
        assert!(bent.volume() > 0.);
    }

        assert!((volume.abs()-body.volume()).abs()<1e-3);
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
        let stitched = joined_passage_solid(&points, &sides, 1.6, None, &AtomicBool::new(false)).unwrap();
        assert_eq!(stitched.decompose().len(), 1);
        assert!((stitched.volume() - separate).abs() < 1e-5);
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
        assert!(anchor(&mesh, &faces, 0, [-1., 0., 0.]).unwrap().0[0] < 5.);
        assert!(anchor(&mesh, &faces, 0, [1., 0., 0.]).unwrap().0[0] > 17.);
        let mut north = mesh.clone();
        for point in north.positions.chunks_exact_mut(3) {
            let x = point[0];
            point[0] = -point[1];
            point[1] = x;
        }
        assert!(anchor(&north, &faces, 0, [0., 1., 0.]).unwrap().0[1] > 17.);
        let authored = playable_anchor(&mesh, &faces, 0, [-1., 0., 0.], &[[11., 0., 0.05]]).unwrap();
        assert_eq!(
            authored.0,
            [11., 0., 0.],
            "An authored playable start takes priority over an arbitrary edge floor"
        );
        faces[0].flags = 2;
        assert!(
            anchor(&mesh, &faces, 0, [-1., 0., 0.]).unwrap().0[0] > 5.,
            "Invisible player-clip floors cannot be map entrances"
        );
        faces[0].flags = 0;
        faces[0].shader = None;
        assert!(
            anchor(&mesh, &faces, 0, [-1., 0., 0.]).unwrap().0[0] > 5.,
            "Sky boundaries cannot be map entrances"
        );
    }
    #[test]
    fn a_nearby_playable_floor_can_be_above_the_bsp_bottom() {
        let mesh = MeshData {
            positions: vec![0., -2., -50., 4., -2., -50., 2., 2., -50.,
                            0., -2., 0., 4., -2., 0., 2., 2., 0.],
            indices: vec![0, 1, 2, 3, 4, 5],
            parts: vec![maps::MeshPart { name: "Stacked floors".into(), index_start: 0, index_count: 6 }],
            ..Default::default()
        };
        let faces = vec![CollisionFace { shader: Some(1), flags: 0, normal: [0., 0., 1.] }; 2];
        let toward = [-1., 0., 0.];
        assert_eq!(anchor(&mesh, &faces, 0, toward).unwrap().0[2], -50.);
        assert_eq!(playable_anchor(&mesh, &faces, 0, toward, &[[2., 0., 0.1]]).unwrap(),
            ([2., 0., 0.], 1));
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
        let entrance=playable_anchor(&mesh,&faces,0,[1.,0.,0.],&[[1.,0.,0.05]]).unwrap();
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
    fn exposed_ground_uses_the_nearest_compatible_source_chart() {
        let chart = |x| RenderTri {
            p: [[x, 0., 0.], [x + 10., 0., 0.], [x, 10., 0.]],
            uv: [[0.4, 0.4], [0.5, 0.4], [0.4, 0.5]],
            n: [0., 0., 1.],
        };
        let charts = [chart(-15.), chart(30.)];
        let normal = [0., 0., 1.];
        let p = [34., 2., 0.15];
        let picked = nearest_terrain_chart(&charts, p, normal).unwrap();
        assert_eq!(picked.p[0], [30., 0., 0.]);
        let uv = terrain::ridge_uv(p, normal, picked).unwrap();
        assert!((uv[0] - 0.44).abs() < 1e-9);
        assert!((uv[1] - 0.42).abs() < 1e-9);
        let cliff = nearest_terrain_chart(&charts, p, [1., 0., 0.]).unwrap();
        assert_eq!(cliff.p[0], [30., 0., 0.]);
        let cliff_uv = terrain::ridge_uv(p, [1., 0., 0.], cliff).unwrap();
        assert!((cliff_uv[0] - 0.4015).abs() < 1e-9);
        assert!((cliff_uv[1] - 0.42).abs() < 1e-9);
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
    fn outdoor_sky_cut_stays_on_the_primary_terrain_route() {
        let mut plan = dual_route_plan();
        plan.tunnel_points[1][0] = 32.;
        plan.open_road = true;
        plan.terrain_seam = Some(TerrainSeam {
            shoulder_width: 8.,
            bank_height: 0.,
            bearing_degrees: None,
            grade_road: false,
            base_shader_path: "fixture/base".into(),
            donor_shader_path: "fixture/donor".into(),
        });
        plan.outdoor_sky_split = Some(0.5);
        let passage = |y| InfantryTunnel {
            points: vec![[0., y, 0.], [32., y, 0.]],
            width: 4.,
            height: 4.,
            shader_path: "fixture/metal".into(),
        };
        plan.infantry_tunnel = Some(passage(10.));
        plan.high_ground = Some(passage(20.));
        plan.validate().unwrap();
        assert_eq!(
            plan.connection_routes().iter().map(|route| route.outdoor_sky_split).collect::<Vec<_>>(),
            vec![Some(0.5), None, None],
        );
    }

    #[test]
    fn native_bends_require_an_enclosed_preserved_donor_and_clear_end_spans() {
        let mut plan = dual_route_plan();
        assert!(serde_json::to_value(&plan).unwrap().get("separateNativeBsps").is_none());
        plan.separate_native_bsps = true;
        let stored = serde_json::to_value(&plan).unwrap();
        assert_eq!(stored["separateNativeBsps"], true);
        let mut restored: BspAssembly = serde_json::from_value(stored).unwrap();
        restored.validate().unwrap();
        restored.tunnel_points.insert(1, [50., 2., 0.]);
        assert!(restored.validate().unwrap_err().to_string().contains("Preserve donor BSP"));
        restored.preserve_donor_bsp = true;
        restored.validate().unwrap();
        restored.tunnel_points[1] = [2.5, 0., 0.];
        let overlaps = [[[-2.3, 0., 0.], [2.3, 0., 0.]], [[97.7, 0., 0.], [102.3, 0., 0.]]];
        assert!(intact_route_points(overlaps, &restored, None).unwrap_err().to_string().contains("checked landing"));
        restored.tunnel_points[1] = [50., 2., 0.];
        restored.open_road = true;
        assert!(restored.validate().unwrap_err().to_string().contains("bridges stay straight"));
        restored.open_road = false;
        restored.preserve_donor_bsp = false;
        restored.tunnel_points.remove(1);
        restored.tunnel_points[1] = [10., 0., 0.];
        assert!(restored.validate().unwrap_err().to_string().contains("twelve world units"));
        restored.tunnel_points[1] = [100., 0., 0.];
        restored.open_road = true;
        assert!(restored.validate().unwrap_err().to_string().contains("Preserve donor BSP"));
        restored.preserve_donor_bsp = true;
        assert!(restored.validate().unwrap_err().to_string().contains("six world units"));
        restored.tunnel_width = 6.;
        restored.validate().unwrap();
        restored.tunnel_bake_fill = true;
        assert!(restored.validate().unwrap_err().to_string().contains("enclosed connector"));
        restored.open_road = false;
        restored.validate().unwrap();
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
    fn placed_terrain_validates_a_south_facing_rotated_donor_without_changing_legacy_plans() {
        let mut road=dual_route_plan();
        road.open_road=true;
        road.tunnel_points=vec![[0.,0.,0.],[0.,-18.,0.]];
        road.yaw_degrees=90.;
        road.terrain_seam=Some(TerrainSeam{
            shoulder_width:8.,bank_height:4.,bearing_degrees:None,grade_road:false,
            base_shader_path:"fixture/grass".into(),donor_shader_path:"fixture/snow".into(),
        });
        assert!(road.validate().is_err());
        road.terrain_seam.as_mut().unwrap().bearing_degrees=Some(-90.);
        assert!(road.validate().is_ok());
        road.tunnel_points.reverse();
        assert!(road.validate().is_err());
        road.terrain_seam.as_mut().unwrap().bearing_degrees=Some(90.);
        assert!(road.validate().is_ok());
    }

    #[test]
    fn fitted_passage_eliminates_a_drop_in_a_stock_landing_without_raising_the_adjacent_floor() {
        let mut route=dual_route_plan();
        route.terrain_seam=None;
        route.outdoor_sky_split=None;
        route.tunnel_width=2.;
        route.tunnel_height=1.6;
        route.fit_passage_floor=true;
        route.tunnel_points=vec![[-2.,0.,0.],[2.,0.,0.],[5.,0.,-0.5]];
        let span=[0.,3.,0.];
        let near=passage_solid([-3.,0.,0.],[0.1,0.,0.],span,span,2.,0,None).unwrap();
        let far=passage_solid([0.,0.,-0.5],[6.,0.,-0.5],span,span,2.5,0,None).unwrap();
        let space=checked(near.boolean_with_engine_and_token(&far,OpType::Add,BooleanEngine::Auto,None),"Test rooms").unwrap();
        let mut slots=vec![material(),material()];
        let (before,_)=collision_layer(&space.get_mesh_gl64(-1),&mut slots).unwrap();
        assert!(verify_route(&before,&route).is_err());
        let fitted=fit_passage_floor(space,&route,1,None).unwrap();
        let (after,_)=collision_layer(&fitted.get_mesh_gl64(-1),&mut slots).unwrap();
        let checker=crate::bsp_clearance::RouteChecker::new(&after).unwrap();
        assert_eq!(checker.verify(&route).unwrap(),checker.verify_return(&route).unwrap());
        assert_eq!(checker.native_ground_z([1.,1.5,1.],2.),Some(-0.5));
    }

    #[test]
    fn restored_sky_portal_matches_only_its_native_perimeter() {
        let trapezoid = [[4., 0., 0.], [4., 0.2, 1.], [4., 1.1, 1.], [4., 1.3, 0.]];
        let split = [[4.000031, 0., 0.], [4.000031, 0.1, 0.5], [4.000031, 0.2, 1.],
            [4.000031, 1.1, 1.], [4.000031, 1.3, 0.]];
        assert!(same_portal_perimeter(&trapezoid, &split));
        let mut moved = split;
        moved[1][1] += 0.04;
        assert!(!same_portal_perimeter(&trapezoid, &moved));
        assert!(!same_portal_perimeter(&trapezoid, &split.map(|[x,y,z]| [x+0.01,y,z])));
        assert_eq!(find_compiled_sky_portal(&trapezoid, &[]).unwrap(), None);
        let mut native = maps::CompiledPortal { front_cluster: 6, back_cluster: 4, flags: 0, ring: split.to_vec() };
        assert_eq!(find_compiled_sky_portal(&trapezoid, std::slice::from_ref(&native)).unwrap(), Some(0));
        native.back_cluster = 6;
        assert!(find_compiled_sky_portal(&trapezoid, &[native]).is_err());
    }

    #[test]
    fn secondary_portals_cannot_hide_a_primary_route_without_isolated_cuts() {
        let mut plan=dual_route_plan();
        plan.infantry_tunnel=Some(InfantryTunnel{points:vec![[0.,0.,0.],[25.,8.,0.],[75.,8.,0.],[100.,0.,0.]],width:2.,height:1.6,shader_path:"fixture/stone".into()});
        let overlap=MeshData{positions:vec![0.,-1.,0.,100.,1.,6.,0.,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        let error=add_portals(&mut mesh,&mut materials,&mut slots,&plan,&overlap,&overlap,None,None).unwrap_err();
        assert!(error.to_string().contains("Primary connection"));
        assert!(materials.is_empty());
    }
    #[test]
    fn visibility_run_crosses_a_grade_change_without_losing_the_isolated_cut(){
        let mut plan=dual_route_plan();plan.tunnel_points=vec![[0.,0.,0.],[32.,0.,0.]];
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,-4.,1.],[11.5,-4.,3.],[32.,-4.,1.]],width:4.,height:8.,shader_path:"fixture/stone".into()});
        let bounds=|lo:f32,hi:f32|MeshData{positions:vec![lo,-10.,0.,hi,10.,20.,lo,10.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        assert_eq!(add_portals(&mut mesh,&mut materials,&mut slots,&plan,&bounds(0.,10.),&bounds(13.,32.),None,None).unwrap(),4);
        assert_eq!(materials.len(),1);assert_eq!(slots.len(),8);
        let ridge=plan.high_ground_plan(plan.high_ground.as_ref().unwrap());assert_eq!(portal_spans(&ridge),vec![(0,2)]);
        let mut bend=ridge.clone();bend.tunnel_points[1][1]-=2.;assert_eq!(portal_spans(&bend),vec![(0,1),(1,2)]);
    }
    #[test]
    fn both_connections_export_distinct_native_portal_cuts_with_one_portal_material() {
        let mut plan=dual_route_plan();plan.open_road=true;plan.infantry_tunnel=Some(InfantryTunnel{points:vec![[0.,0.,0.],[25.,8.,0.],[75.,8.,0.],[100.,0.,0.]],width:2.,height:1.6,shader_path:"fixture/stone".into()});
        let bounds=|lo:f32,hi:f32|MeshData{positions:vec![lo,-1.,0.,hi,1.,6.,lo,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"fixture".into(),index_start:0,index_count:3}],..Default::default()};
        let(mut mesh,mut materials,mut slots)=(MeshData::default(),vec![],vec![]);
        let cuts=add_portals(&mut mesh,&mut materials,&mut slots,&plan,&bounds(0.,10.),&bounds(90.,100.),None,None).unwrap();
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
        plan.high_ground=Some(InfantryTunnel{points:vec![[0.,0.,0.],[6.5576,-12.,0.],[13.1152,-12.,1.96728],[19.6728,-12.,1.96728],[26.2304,-12.,0.],[32.788,0.,0.]],width:6.,height:8.,shader_path:"fixture/stone".into()});
        let a=[-3.,0.,0.];let b=[36.,0.,0.];let sides=tunnel_sides(&[a,b],40.).unwrap();
        let space=passage_solid(a,b,sides[0],sides[1],20.,0,Some(2)).unwrap();
        let ridge=plan.high_ground_plan(plan.high_ground.as_ref().unwrap());
        let supported=support_high_ground(space,&ridge,1,-1.,None).unwrap().get_mesh_gl64(-1);
        let mut slots=vec![material(),material(),AssemblyMaterial{name:"+sky".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}];
        let (mesh,_)=collision_layer(&supported,&mut slots).unwrap();
        let checker=crate::bsp_clearance::RouteChecker::new(&mesh).unwrap();
        let report=checker.verify_details(&plan).unwrap();
        assert_eq!(checker.verify_return(&plan).unwrap(),report.iter().map(|route|route.walk_samples).sum::<usize>());
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
        assert_eq!(checker.verify_return(&plan).unwrap(),total);
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
  MapInspection{header:maps::MapHeader{version:609,engine:"fixture".into(),name:"fixture".into(),build:"fixture".into(),scenario_type:1,file_size:2048,declared_size:2048,tag_offset:0,tag_size:0,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false},sha256:format!("{id:064x}"),tag_checksum:None,tags:vec![maps::Tag{id,index:0,class:"senv".into(),path:"native/floor".into(),data_offset:None,external:false,fields:vec![],references:vec![],primary_bitmap_status:None,shader_preview:None}],objects:vec![],decals:vec![],mesh:MeshData::default(),render_mesh:None,model_meshes:Default::default(),player_starting_profiles:None,encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"fixture".into()}
 }
 #[test]
 fn regional_preset_keeps_native_slots_and_reserves_terrain_above_the_donor() {
    let mut donor=inspected(12);
    donor.mesh=MeshData { positions:vec![-4.,-5.,0.,4.,5.,20.,-4.,5.,0.], indices:vec![0,1,2],
        parts:vec![maps::MeshPart {name:"Indoor".into(),index_start:0,index_count:3}], ..Default::default() };
    let plan: BspAssembly=serde_json::from_value(serde_json::json!({
        "schemaVersion":1,"donorProjectId":uuid::Uuid::nil(),"donorTitle":"Indoor",
        "donorSource":{"originalPath":"fixture.map","preservedPath":"fixture.map","sha256":donor.sha256,
            "cacheVersion":609,"engine":"fixture","scenarioPath":"fixture"},
        "donorTagsDirectory":"fixture","donorBspIndex":0,"baseBspIndex":1,"separateNativeBsps":true,
        "translation":[64.,0.,0.],"yawDegrees":0.,"tunnelPoints":[[0.,0.,0.],[64.,0.,0.]],
        "tunnelWidth":2.,"tunnelHeight":1.6,"tunnelShaderPath":"fixture/metal",
    })).unwrap();
    let surface=apply_regional_connection_preset(plan.clone(),13,&donor,RegionalConnectionPreset::SurfaceLandBridge).unwrap();
    assert_eq!(surface.translation, plan.translation);
    assert!(surface.preserve_donor_bsp&&surface.open_road&&!surface.tunnel_bake_fill);
    assert_eq!((surface.tunnel_width,surface.tunnel_height),(6.,4.));
    let buried=apply_regional_connection_preset(plan.clone(),13,&donor,RegionalConnectionPreset::UndergroundInfantryTunnel).unwrap();
    assert_eq!(buried.base_bsp_index,1);
    assert!(buried.preserve_donor_bsp&&!buried.open_road&&buried.tunnel_bake_fill);
    assert_eq!(buried.translation[2]+20.,-8.);
    assert_eq!((buried.tunnel_width,buried.tunnel_height),(2.,1.6));
    assert_eq!(buried.tunnel_points,vec![[0.,0.,0.],[136.,0.,-28.]]);
    assert!(apply_regional_connection_preset(plan,15,&donor,RegionalConnectionPreset::UndergroundTunnel).is_err());
 }

 #[test]
 fn water_rebuild_keeps_world_transform_material_and_original_uvs_in_render_layer() {
    let mut source = inspected(10);
    source.tags[0].class = "scex".into();
    source.tags[0].path = "native/timberland_waterfall".into();
    let range = maps::MeshMaterialRange {
        shader_tag_id: 10, shader_permutation: 0, bsp_index: 0, lightmap_index: 0,
        lightmap_page: -1, has_lightmap_uvs: false, has_incident_radiosity: false,
        lightmap_bitmap_tag_id: None, index_start: 0, index_count: 3,
    };
    source.render_mesh = Some(MeshData {
        positions: vec![1.,0.,0., 1.,1.,0., 1.,0.,1.],
        normals: vec![1.,0.,0., 1.,0.,0., 1.,0.,0.],
        uvs: vec![0.125,0.25, 0.75,0.25, 0.125,0.9],
        indices: vec![0,1,2],
        material_ranges: vec![range],
        ..Default::default()
    });
    let (mut mesh, mut materials, mut slots) = (MeshData::default(), vec![], vec![]);
    append_source_surface_effects(&source, 0, 1, [2.,3.,4.], 90., &mut mesh, &mut materials, &mut slots, &[]).unwrap();
    assert_eq!(mesh.positions, [2.,4.,4., 1.,4.,4., 2.,4.,5.]);
    assert!(mesh.normals.chunks_exact(3).all(|n| n[0].abs() < 1e-6 && n[1] == 1. && n[2] == 0.));
    assert_eq!(mesh.uvs, source.render_mesh.as_ref().unwrap().uvs);
    assert_eq!(slots, [0]);
    let saved = &materials[0];
    let mut panel = source.tags[0].clone();
    panel.class = "schi".into();
    panel.path = "native/timberland_base_lights_blue".into();
    assert!(is_source_surface_effect(&panel));
    panel.path = "native/gseffect12345678m1x".into();
    assert!(is_source_surface_effect(&panel));
    panel.path = "native/paint".into();
    assert!(!is_source_surface_effect(&panel));
    assert!(!saved.collision_only);
    assert_eq!(saved.source, 1);
    assert_eq!(saved.shader_path.as_deref(), Some("native/timberland_waterfall"));
    assert_eq!(saved.shader_class.as_deref(), Some("scex"));

    let (mut mesh, mut slots) = (MeshData::default(), vec![]);
    append_source_surface_effects(&source, 0, 1, [2.,3.,4.], 90., &mut mesh, &mut materials, &mut slots, &[]).unwrap();
    assert!(slots.is_empty());
 }
 #[test]
 fn water_rebuild_clips_only_the_closed_passage_and_preserves_uvs() {
    let volumes = enclosed_passage_planes(&[[0., 0., 0.], [4., 0., 0.]], 2., 2.).unwrap();
    let mut source = inspected(10);
    source.tags[0].class = "swat".into();
    source.render_mesh = Some(MeshData {
        positions: vec![-1., -2., 1., 5., -2., 1., 5., 2., 1., -1., 2., 1.],
        normals: vec![0., 0., 1., 0., 0., 1., 0., 0., 1., 0., 0., 1.],
        uvs: vec![0., 0., 1., 0., 1., 1., 0., 1.],
        indices: vec![0, 1, 2, 0, 2, 3],
        material_ranges: vec![maps::MeshMaterialRange {
            shader_tag_id: 10, shader_permutation: 0, bsp_index: 0, lightmap_index: 0,
            lightmap_page: -1, has_lightmap_uvs: false, has_incident_radiosity: false,
            lightmap_bitmap_tag_id: None, index_start: 0, index_count: 6,
        }],
        ..Default::default()
    });
    let (mut mesh, mut materials, mut slots) = (MeshData::default(), vec![], vec![]);
    append_source_surface_effects(&source, 0, 1, [0.; 3], 0., &mut mesh, &mut materials, &mut slots, &volumes).unwrap();
    let area: f64 = mesh.indices.chunks_exact(3).map(|ids| {
        let [a, b, c] = [ids[0], ids[1], ids[2]].map(|id| vertex(&mesh, id));
        cross(sub(b, a), sub(c, a))[2] * 0.5
    }).sum();
    assert!((area - 16.).abs() < 1e-5);
    assert!(slots.iter().all(|&slot| materials[slot].shader_class.as_deref() == Some("swat") && !materials[slot].collision_only));
    for (point, uv) in mesh.positions.chunks_exact(3).zip(mesh.uvs.chunks_exact(2)) {
        assert!((uv[0] - (point[0] + 1.) / 6.).abs() < 1e-6);
        assert!((uv[1] - (point[1] + 2.) / 4.).abs() < 1e-6);
    }
 }
 #[test] fn joined_preview_keeps_each_native_shader_owner_world_positions_uvs_and_unbaked_status(){
  let mesh=MeshData{positions:vec![0.,0.,0.,1.,0.,0.,0.,1.,0.],normals:vec![0.,0.,1.,0.,0.,1.,0.,0.,1.],uvs:vec![0.,0.,1.,0.,0.,1.],indices:vec![0,1,2,0,1,2,0,1,2],..Default::default()};
  let mut geometry=AssemblyGeometry{exact_sky_portals: vec![],mesh,materials:vec![AssemblyMaterial{name:"base".into(),source:0,shader_path:Some("native/floor".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"donor".into(),source:1,shader_path:Some("native/floor".into()),shader_class:Some("senv".into()),flags:0,collision_only:false},AssemblyMaterial{name:"+portal".into(),source:0,shader_path:None,shader_class:None,flags:0,collision_only:false}],triangle_materials:vec![0,1,2],report:AssemblyReport{input_triangles:2,output_triangles:3,connector_triangles:0,generated_uv_faces:0,walk_samples:1,portal_count:1,route_clearance:vec![],donor_scenery:0,warnings:vec![]}};
  let base=inspected(10);let donor=inspected(20);let views=viewport_surfaces(&geometry,&base,&donor).unwrap();assert_eq!(views.len(),2);
  for (view,id) in views.iter().zip([10,20]) {assert_eq!(view.mesh.positions,geometry.mesh.positions);assert_eq!(view.mesh.uvs,geometry.mesh.uvs);assert_eq!(view.mesh.indices,vec![0,1,2]);assert_eq!(view.mesh.material_ranges[0].shader_tag_id,id);assert!(!view.mesh.material_ranges[0].has_lightmap_uvs);assert_eq!(view.mesh.material_ranges[0].lightmap_page,-1);}
  let mut missing=donor.clone();missing.tags.clear();assert!(viewport_surfaces(&geometry,&base,&missing).unwrap_err().to_string().contains("native tag"));
  geometry.mesh.normals.clear();assert!(viewport_surfaces(&geometry,&base,&donor).is_err());
 }
}

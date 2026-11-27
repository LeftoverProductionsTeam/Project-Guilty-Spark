//! Read-only Atlas of owned Halo caches. Regions keep their exact cache identity;
//! native geometry planning/rebuilds use the existing BSP assembly pipeline.
use crate::{invalid, maps::{self, MapInspection, MeshData}, Result};
use serde::{Deserialize,Serialize};
use std::{collections::{BTreeMap,BTreeSet}, path::{Path,PathBuf}, time::Instant};
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Region {
    pub id:String,pub map_name:String,pub scenario:String,pub bsp_name:String,pub bsp_index:usize,
    pub cache_sha256:String,pub cache_version:u32,pub scenario_type:u16,pub coordinates:String,
    pub minimum:[f32;3],pub maximum:[f32;3],pub collision_triangles:usize,pub collision_vertices:usize,
    pub render_triangles:usize,pub boundary_edges:usize,pub nonmanifold_edges:usize,pub degenerate_triangles:usize,
    pub shaders:Vec<String>,pub missing_shader_references:usize,pub source_paths:Vec<PathBuf>,
    pub runtimes:Vec<String>,pub translation:[f64;3],pub yaw_degrees:f64,
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CacheRecord {pub path:PathBuf,pub runtime:String,pub sha256:Option<String>,pub bytes:u64,pub regions:usize,pub error:Option<String>,pub elapsed_ms:u64}
#[derive(Clone,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct Atlas {pub schema_version:u32,pub regions:Vec<Region>,pub caches:Vec<CacheRecord>,pub elapsed_ms:u64,pub limitations:Vec<String>}

/// Optional Spark layout metadata, not compiled BSP geometry or runtime state.
/// Sources are readmitted by full cache hash before native import/build.
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct LayoutRegion {
    pub region_id:String,pub cache_sha256:String,pub cache_version:u32,pub bsp_index:usize,
    pub map_name:String,pub bsp_name:String,pub minimum:[f64;3],pub maximum:[f64;3],
    pub translation:[f64;3],pub yaw_degrees:f64,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub hex_slot: Option<[i32; 2]>,
    #[serde(default, skip_serializing_if="std::ops::Not::not")]
    pub underground: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_access: Option<SurfaceAccess>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SurfaceAccess {
    pub surface_region_id: String,
    pub roof_clearance: f64,
    pub heading_degrees: f64,
}

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Layout {
    pub schema_version: u32,
    pub regions: Vec<LayoutRegion>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub extraction: BTreeMap<String, ExtractionPool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtractionPool {
    pub player_starts: [u16; 2],
    pub weapons: Vec<u16>,
    pub vehicles: Vec<u16>,
}

impl ExtractionPool {
    fn validate(&self, cache_version: u32) -> Result<()> {
        if !matches!(cache_version, 609 | 13) { return invalid("Extraction pools require CE609 or MCC13 sources"); }
        for (rows, minimum, limit) in [
            (self.player_starts.as_slice(), 2, maps::player_start_read_limit(cache_version)),
            (self.weapons.as_slice(), 3, maps::netgame_equipment_read_limit(cache_version)),
            (self.vehicles.as_slice(), 1, crate::bsp_vehicles::limit(cache_version)),
        ] {
            if !(minimum..=limit).contains(&rows.len())
                || rows.iter().any(|&row| usize::from(row) >= limit)
                || rows.iter().collect::<BTreeSet<_>>().len() != rows.len()
            {
                return invalid("Extraction needs two distinct starts and enough distinct native points for three weapons and one vehicle");
            }
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionPoint {
    row: u16,
    label: String,
    position: [f32; 3],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionPoints {
    player_starts: Vec<ExtractionPoint>,
    weapons: Vec<ExtractionPoint>,
    vehicles: Vec<ExtractionPoint>,
}

/// Resolve authored stock positions against the exact source region. The
/// indices reference the source rows, not the rebuilt scenario's indices.
pub fn review_extraction_points(region: &LayoutRegion, path: &Path, map: &MapInspection) -> Result<ExtractionPoints> {
    read_supported_extraction_points(region, path, map, true)
}

fn read_supported_extraction_points(region: &LayoutRegion, path: &Path, map: &MapInspection, distinct_positions: bool) -> Result<ExtractionPoints> {
    if map.sha256 != region.cache_sha256 || map.header.version != region.cache_version
        || map.header.scenario_type != 1 || map.header.extended || !matches!(map.header.version, 609 | 13)
        || map.mesh.parts.get(region.bsp_index).is_none()
    {
        return invalid("Extraction points need the exact owned CE609 or MCC13 multiplayer region");
    }
    let slot = region.bsp_index as u16;
    let point = |row: usize, label: String, position| ExtractionPoint { row: row as u16, label, position };
    let starts = maps::scenario_region_starts(path, map)?.into_iter().enumerate()
        .filter(|(_, row)| row.bsp_index == -1 || row.bsp_index == slot as i16)
        .map(|(index, row)| point(index, format!("Player start {}", index + 1), row.position))
        .collect::<Vec<_>>();
    let pickups = maps::scenario_netgame_pickups(path, map)?;
    let names = pickups.iter().map(|row| row.collection.clone()).collect::<BTreeSet<_>>();
    let collections = maps::native_item_collections(path, map, &names)?;
    let weapons = pickups.into_iter().enumerate().filter_map(|(index, row)| {
        let mut items = collections.get(&row.collection)?.permutations.iter().filter_map(|(weight, tag)| {
            let weight = f32::from_bits(*weight);
            (weight.is_finite() && weight > 0.).then_some(tag)
        }).peekable();
        let is_weapon = items.peek().is_some() && items.all(|tag| tag.ends_with(".weapon"));
        is_weapon.then(|| point(index, row.collection, row.position))
    }).collect::<Vec<_>>();
    let vehicles = maps::scenario_vehicles(path, map)?.into_iter().enumerate()
        .take(crate::bsp_vehicles::limit(map.header.version))
        .filter_map(|(index, row)| row.tag.map(|tag| point(index, tag, row.position)))
        .collect::<Vec<_>>();

    let supported = |candidates: Vec<ExtractionPoint>| -> Result<Vec<ExtractionPoint>> {
        let mut review: Vec<ExtractionPoint> = Vec::new();
        for chunk in candidates.chunks(1024) {
            let poses = chunk.iter().map(|point| point.position).collect::<Vec<_>>();
            let locations = maps::bsp_point_locations(path, map, &poses, None)?;
            for (point, location) in chunk.iter().zip(locations) {
                if location.bsps == [slot] && location.supports.iter().any(|surface| surface.bsp == slot)
                    && (!distinct_positions || !review.iter().any(|existing| existing.position == point.position))
                {
                    review.push(ExtractionPoint { row: point.row, label: point.label.clone(), position: point.position });
                }
            }
        }
        Ok(review)
    };
    let floor = crate::bsp_clearance::RouteChecker::for_part(&map.mesh, region.bsp_index)?;
    let player_starts = supported(starts)?.into_iter()
        .filter(|point| floor.verify_start(point.position.map(f64::from)).is_ok())
        .collect();
    Ok(ExtractionPoints {
        player_starts,
        weapons: supported(weapons)?,
        vehicles: supported(vehicles)?,
    })
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionRowBinding {
    pub source_row: u16,
    pub compiled_row: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionBindings {
    pub region_id: String,
    pub bsp_index: usize,
    pub player_starts: Vec<ExtractionRowBinding>,
    pub weapons: Vec<ExtractionRowBinding>,
    pub vehicles: Vec<ExtractionRowBinding>,
}

fn pickup_namespace(path: &str) -> &str {
    let Some((prefix, rest)) = path.split_once('/') else { return path; };
    let Some(suffix) = prefix.strip_prefix("gspickup_") else { return path; };
    if matches!(suffix.len(), 8 | 17) && suffix.split('_').all(|id| id.len() == 8 && id.bytes().all(|byte| byte.is_ascii_hexdigit())) {
        pickup_namespace(rest)
    } else {
        path
    }
}

fn bind_extraction_rows(
    source: &[ExtractionPoint], compiled: &[ExtractionPoint], region: &LayoutRegion, asset_tag: bool,
) -> Vec<ExtractionRowBinding> {
    source.iter().filter_map(|point| {
        let expected = crate::bsp_assembly::transform(point.position.map(f64::from), region.translation, region.yaw_degrees);
        let mut matches = compiled.iter().filter(|candidate|
            (!asset_tag || pickup_namespace(&candidate.label) == pickup_namespace(&point.label)) &&
            candidate.position.iter().zip(expected).all(|(axis, target)| (f64::from(*axis) - target).abs() <= 0.0002)
        );
        let candidate = matches.next()?;
        if matches.next().is_some() { return None; }
        Some(ExtractionRowBinding { source_row: point.row, compiled_row: candidate.row })
    }).collect()
}

/// This readback expects the transform in compiled-cache coordinates. Resolve
/// each stock point at its transformed pose and require one physical BSP owner.
/// Logical regions can share that physical slot.
pub fn review_compiled_extraction_bindings(
    region: &LayoutRegion, source: (&Path, &MapInspection), compiled: (&Path, &MapInspection), bsp_index: usize,
) -> Result<ExtractionBindings> {
    if compiled.1.header.version != 13 {
        return invalid("Compiled regional Extraction bindings require MCC13");
    }
    let original = review_extraction_points(region, source.0, source.1)?;
    let compiled_region = LayoutRegion {
        region_id: format!("{}:{bsp_index}", compiled.1.sha256), cache_sha256: compiled.1.sha256.clone(),
        cache_version: 13, bsp_index, translation: [0.; 3], yaw_degrees: 0., ..region.clone()
    };
    let target = read_supported_extraction_points(&compiled_region, compiled.0, compiled.1, false)?;
    Ok(ExtractionBindings {
        region_id: region.region_id.clone(),
        bsp_index,
        player_starts: bind_extraction_rows(&original.player_starts, &target.player_starts, region, false),
        weapons: bind_extraction_rows(&original.weapons, &target.weapons, region, true),
        vehicles: bind_extraction_rows(&original.vehicles, &target.vehicles, region, true),
    })
}

impl Layout {
    pub fn connection(&self, base: &str, donor: &str) -> Result<(&LayoutRegion, &LayoutRegion)> {
        self.validate()?;
        let find = |id| self.regions.iter().find(|region| region.region_id == id)
            .ok_or_else(|| crate::SparkError::Invalid("Save both Atlas regions before preparing a connection".into()));
        let (a, b) = (find(base)?, find(donor)?);
        if surface_access_for(a, b).is_some() {
            return Ok((a, b));
        }
        let (Some([aq, ar]), Some([bq, br])) = (a.hex_slot, b.hex_slot) else {
            return invalid("Arrange the saved regions in the hex cluster first");
        };
        let (q, r) = (bq-aq, br-ar);
        if q.abs().max(r.abs()).max((q+r).abs()) != 1 {
            return invalid("Choose adjacent saved Atlas regions");
        }
        Ok((a, b))
    }

    pub fn validate(&self)->Result<()> {
        if self.schema_version!=1||self.regions.len()>64{return invalid("Atlas layout supports schema 1 and at most 64 region plans");}
        let mut seen=BTreeSet::new();
        let mut slots=BTreeSet::new();
        for r in &self.regions {
            if r.hex_slot.is_some_and(|slot| slot.iter().any(|axis| !(-63..=63).contains(axis)) || !slots.insert(slot)) {
                return invalid("Atlas hex slots are out of range or duplicated");
            }
            if r.cache_sha256.len()!=64||!r.cache_sha256.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))
                ||r.region_id!=format!("{}:{}",r.cache_sha256,r.bsp_index)||!seen.insert(&r.region_id)
                ||r.bsp_index>=64||![5,6,7,13,609].contains(&r.cache_version) {
                return invalid("Atlas region identity is invalid or duplicated");
            }
            if [&r.map_name,&r.bsp_name].iter().any(|s|s.is_empty()||s.len()>512||s.chars().any(char::is_control)) {
                return invalid("Atlas region labels are invalid");
            }
            if r.minimum.iter().chain(&r.maximum).chain(&r.translation).any(|n|!n.is_finite()||n.abs()>1_000_000.)
                ||!r.yaw_degrees.is_finite()||r.yaw_degrees.abs()>360_000.
                ||(0..3).any(|a|r.minimum[a]>r.maximum[a]) {
                return invalid("Atlas layout has invalid bounds or transform");
            }
        }
        for (id, pool) in &self.extraction {
            let region = self.regions.iter().find(|row| &row.region_id == id)
                .ok_or_else(|| crate::SparkError::Invalid("Extraction pool refers to a removed Atlas region".into()))?;
            pool.validate(region.cache_version)?;
        }
        for room in &self.regions {
            let Some(access) = &room.surface_access else { continue; };
            if !room.underground
                || !access.roof_clearance.is_finite()
                || !(0.1..=64.).contains(&access.roof_clearance)
                || !(-180. ..=180.).contains(&access.heading_degrees)
                || !self.regions.iter().any(|surface|
                    surface.region_id == access.surface_region_id && !surface.underground)
            {
                return invalid("Underground access needs an existing surface, valid roof clearance and passage heading");
            }
        }
        Ok(())
    }
}

pub fn surface_access_for<'a>(a: &'a LayoutRegion, b: &'a LayoutRegion) -> Option<(&'a LayoutRegion, &'a LayoutRegion, &'a SurfaceAccess)> {
    let (surface, room) = match (a.underground, b.underground) {
        (false, true) => (a, b),
        (true, false) => (b, a),
        _ => return None,
    };
    room.surface_access.as_ref().filter(|access| access.surface_region_id == surface.region_id)
        .map(|access| (surface, room, access))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BurialReview {
    pub footprint_area: f64,
    pub uncovered_area: f64,
    pub roof_z: f64,
    pub cover_z: Option<f64>,
    pub suggested_translation_z: Option<f64>,
}

/// Review the whole projected roof rectangle against actual upward-facing
/// native collision surfaces. This is cover geometry, separate from checking
/// the doorway, interior clearances, or terrain between the two layers.
pub fn review_burial(
    surface: &LayoutRegion, interior: &LayoutRegion,
    surface_cache: (&Path, &MapInspection), interior_cache: (&Path, &MapInspection),
    clearance: f64,
) -> Result<BurialReview> {
    let checked_mesh = |region: &LayoutRegion, (path, map): (&Path, &MapInspection)| -> Result<_> {
        if map.sha256 != region.cache_sha256 || map.header.version != region.cache_version {
            return invalid("The owned source differs from the saved Atlas region. Rebind its original cache.");
        }
        let (mesh, faces) = maps::collision_source(path, map)?;
        let part = mesh.parts.get(region.bsp_index).ok_or_else(||
            crate::SparkError::Invalid("The saved Atlas BSP is unavailable in its source.".into()))?;
        let mut low = [f64::INFINITY; 3];
        let mut high = [f64::NEG_INFINITY; 3];
        for &index in &mesh.indices[part.index_start..part.index_start + part.index_count] {
            for axis in 0..3 {
                let coordinate = f64::from(mesh.positions[index as usize * 3 + axis]);
                low[axis] = low[axis].min(coordinate);
                high[axis] = high[axis].max(coordinate);
            }
        }
        if part.index_count == 0 || (0..3).any(|axis|
            (low[axis]-region.minimum[axis]).abs() > 0.002 || (high[axis]-region.maximum[axis]).abs() > 0.002) {
            return invalid("The saved Atlas bounds differ from native collision. Re-add this region from its owned source.");
        }
        Ok((mesh, faces))
    };
    checked_mesh(interior, interior_cache)?;
    let (mesh, faces) = checked_mesh(surface, surface_cache)?;
    review_burial_geometry(surface, interior, &mesh, &faces, clearance)
}

fn review_burial_geometry(
    surface: &LayoutRegion, interior: &LayoutRegion, mesh: &MeshData,
    faces: &[maps::CollisionFace], clearance: f64,
) -> Result<BurialReview> {
    use manifold_rust::{cross_section::CrossSection, linalg::Vec2};
    if surface.underground || !interior.underground || surface.region_id == interior.region_id
        || !clearance.is_finite() || !(0.1..=64.).contains(&clearance) {
        return invalid("Choose different surface and underground regions and a roof clearance from 0.1 to 64 world units.");
    }
    let left = interior.minimum[0];
    let bottom = interior.minimum[1];
    let width = interior.maximum[0] - left;
    let length = interior.maximum[1] - bottom;
    if width <= 0. || length <= 0. {
        return invalid("The underground source has no roof footprint to review.");
    }

    let rotate = |[x, y]: [f64; 2], (sin, cos): (f64, f64)| [x * cos - y * sin, x * sin + y * cos];
    let basis = (surface.yaw_degrees - interior.yaw_degrees).to_radians().sin_cos();
    let offset = rotate([surface.translation[0] - interior.translation[0],
        surface.translation[1] - interior.translation[1]], (-interior.yaw_degrees).to_radians().sin_cos());
    let geometry = &mesh.parts[surface.bsp_index];
    let mut triangles = Vec::new();
    let mut lowest = f64::INFINITY;
    let mut highest = f64::NEG_INFINITY;

    let range = geometry.index_start..geometry.index_start + geometry.index_count;
    for (face, indices) in faces[range.start / 3..range.end / 3].iter().zip(mesh.indices[range].chunks_exact(3)) {
        // Match the native entrance selector: invisible/no-material boundary
        // planes can seal the map, but they are not a terrain roof.
        if face.shader.is_none() || face.flags & 2 != 0 {
            continue;
        }
        let triangle: [[f64; 3]; 3] = std::array::from_fn(|vertex| {
            let index = indices[vertex] as usize * 3;
            let [x,y,z] = [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]].map(f64::from);
            let [x,y] = rotate([x,y], basis);
            [x + offset[0] - left, y + offset[1] - bottom, z + surface.translation[2]]
        });
        if triangle.iter().all(|p| p[0] < 0.) || triangle.iter().all(|p| p[0] > width)
            || triangle.iter().all(|p| p[1] < 0.) || triangle.iter().all(|p| p[1] > length) {
            continue;
        }
        let a: [f64;3] = std::array::from_fn(|axis| triangle[1][axis] - triangle[0][axis]);
        let b: [f64;3] = std::array::from_fn(|axis| triangle[2][axis] - triangle[0][axis]);
        let cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        // A visible cliff can cover a room even when its slope is too steep
        // for an entrance. Native construction checks walking surfaces separately.
        if cross[2] <= 1e-10 {
            continue;
        }
        for point in &triangle {
            lowest = lowest.min(point[2]);
            highest = highest.max(point[2]);
        }
        triangles.push(triangle);
    }
    let footprint = CrossSection::square_vec2(Vec2::new(width, length), false);
    let exposed_area = |floor_z: f64| -> f64 {
        let covers = triangles.iter().filter_map(|triangle| {
            let mut polygon = Vec::with_capacity(4);
            let mut previous = triangle[2];
            for &point in triangle {
                if (previous[2] >= floor_z) != (point[2] >= floor_z) {
                    let mix = (floor_z - previous[2]) / (point[2] - previous[2]);
                    polygon.push(Vec2::new(previous[0] + (point[0] - previous[0])*mix,
                        previous[1] + (point[1] - previous[1])*mix));
                }
                if point[2] >= floor_z {
                    polygon.push(Vec2::new(point[0],point[1]));
                }
                previous = point;
            }
            (polygon.len() >= 3).then_some(polygon)
        }).collect();
        footprint.difference(&CrossSection::new(covers)).area()
    };

    const NUMERIC_AREA: f64 = 1e-6;
    let roof_z = interior.maximum[2] + interior.translation[2];
    let uncovered_area = exposed_area(roof_z + clearance);
    let cover_z = (!triangles.is_empty() && exposed_area(lowest) <= NUMERIC_AREA).then(|| {
        while highest - lowest > 0.01 {
            let middle = (lowest + highest) / 2.;
            if exposed_area(middle) <= NUMERIC_AREA { lowest = middle; } else { highest = middle; }
        }
        lowest
    });
    Ok(BurialReview {
        footprint_area: footprint.area(), uncovered_area, roof_z, cover_z,
        suggested_translation_z: cover_z.filter(|_| uncovered_area > NUMERIC_AREA)
            .map(|z| z - clearance - interior.maximum[2]),
    })
}

pub fn regions(path:&Path,runtime:&str,i:&MapInspection,mesh:&MeshData)->Result<Vec<Region>>{
    let mut out=vec![];
    for (index,part) in mesh.parts.iter().enumerate(){
        let ids=mesh.indices.get(part.index_start..part.index_start.checked_add(part.index_count).ok_or_else(||crate::SparkError::Invalid("Atlas index range overflow".into()))?).ok_or_else(||crate::SparkError::Invalid("Atlas collision range invalid".into()))?;
        if ids.len()%3!=0{return invalid("Atlas collision is not a triangle list");}
        let mut low=[f32::INFINITY;3];let mut high=[f32::NEG_INFINITY;3];
        let mut vertices=BTreeMap::new();let mut edges=BTreeMap::<(usize,usize),usize>::new();let mut degenerate=0;
        for tri in ids.chunks_exact(3){let mut welded=[0;3];let mut p=[[0f32;3];3];
            for k in 0..3{let start=(tri[k] as usize).checked_mul(3).ok_or_else(||crate::SparkError::Invalid("Atlas vertex overflow".into()))?;p[k]=mesh.positions.get(start..start+3).ok_or_else(||crate::SparkError::Invalid("Atlas vertex outside source".into()))?.try_into().unwrap();
                if p[k].iter().any(|v|!v.is_finite()){return invalid("Atlas has nonfinite source coordinates");}
                for a in 0..3{low[a]=low[a].min(p[k][a]);high[a]=high[a].max(p[k][a]);}
                let key=p[k].map(|v|if v==0.{0}else{v.to_bits()});let next=vertices.len();welded[k]=*vertices.entry(key).or_insert(next);
            }
            let u=std::array::from_fn::<_,3,_>(|a|p[1][a] as f64-p[0][a] as f64);let v=std::array::from_fn::<_,3,_>(|a|p[2][a] as f64-p[0][a] as f64);
            if [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]].iter().map(|x|x*x).sum::<f64>()<1e-16{degenerate+=1;}
            for (a,b) in [(0,1),(1,2),(2,0)]{let x=welded[a];let y=welded[b];*edges.entry((x.min(y),x.max(y))).or_default()+=1;}
        }
        if ids.is_empty(){low=[0.;3];high=[0.;3];}
        let ranges=i.render_mesh.as_ref().map(|m|m.material_ranges.iter().filter(|r|r.bsp_index==index).collect::<Vec<_>>()).unwrap_or_default();
        let mut shaders=BTreeSet::new();let mut missing=BTreeSet::new();
        for r in &ranges{if let Some(tag)=i.tags.iter().find(|t|t.id==r.shader_tag_id){shaders.insert(format!("{} · {}",tag.class,tag.path));}else{missing.insert(r.shader_tag_id);}}
        out.push(Region{id:format!("{}:{index}",i.sha256),map_name:i.header.name.clone(),scenario:i.scenario_path.clone(),bsp_name:part.name.clone(),bsp_index:index,cache_sha256:i.sha256.clone(),cache_version:i.header.version,scenario_type:i.header.scenario_type,coordinates:"Halo native Z-up world units".into(),minimum:low,maximum:high,collision_triangles:ids.len()/3,collision_vertices:vertices.len(),render_triangles:ranges.iter().map(|r|r.index_count/3).sum(),boundary_edges:edges.values().filter(|n|**n==1).count(),nonmanifold_edges:edges.values().filter(|n|**n>2).count(),degenerate_triangles:degenerate,shaders:shaders.into_iter().collect(),missing_shader_references:missing.len(),source_paths:vec![path.into()],runtimes:vec![runtime.into()],translation:[0.;3],yaw_degrees:0.});
    }Ok(out)
}
/// Exact duplicate caches are decoded once. A cache miss still verifies the
/// complete file hash before reusing a prior decoded metadata record.
pub fn inventory(inputs:&[(PathBuf,String)],previous:Option<&Atlas>)->Result<Atlas>{
    if inputs.len()>256{return invalid("Atlas accepts at most 256 owned caches per scan");}
    let start=Instant::now();let mut atlas=Atlas{schema_version:1,limitations:vec!["Atlas topology is source collision metadata, not native rebuild or gameplay acceptance.".into(),"A scenario's BSP references load separately. Megaworld connections require one physically merged resident BSP.".into(),"Shaders are recorded by native identity; their complete editable tag dependency closure is rechecked by the native compiler.".into()],..Default::default()};
    let mut decoded=BTreeSet::new();
    for (path,runtime) in inputs{let now=Instant::now();let bytes=std::fs::metadata(path).map(|m|m.len()).unwrap_or(0);let mut record=CacheRecord{path:path.clone(),runtime:runtime.clone(),sha256:None,bytes,regions:0,error:None,elapsed_ms:0};
        let result=(||->Result<()> {
            crate::reject_links(path)?;let (header,bytes,sha)=maps::read_original_cache_snapshot(path)?;record.sha256=Some(sha.clone());
            if !decoded.contains(&sha){
                let retained=previous.filter(|a|a.schema_version==1).map(|a|a.regions.iter().filter(|r|r.cache_sha256==sha).cloned().collect::<Vec<_>>()).unwrap_or_default();
                if !retained.is_empty(){atlas.regions.extend(retained.into_iter().map(|mut r|{r.source_paths=vec![path.clone()];r.runtimes=vec![runtime.clone()];r}));}else{
                    let bytes=maps::normalize_cache_snapshot(&header,bytes)?;
                    let i=maps::inspect_snapshot(path,path.parent(),header.clone(),&bytes,sha.clone(),false)?;
                    if ![0,1].contains(&i.header.scenario_type){return invalid("Not an original campaign/multiplayer scenario");}
                    let (mesh,_)=maps::collision_snapshot(&header,&bytes,&i)?;atlas.regions.extend(regions(path,runtime,&i,&mesh)?);
                }
                decoded.insert(sha.clone());
            }
            for r in atlas.regions.iter_mut().filter(|r|r.cache_sha256==sha){record.regions+=1;if !r.source_paths.contains(path){r.source_paths.push(path.clone());}if !r.runtimes.contains(runtime){r.runtimes.push(runtime.clone());}}
            Ok(())
        })();if let Err(e)=result{record.error=Some(e.to_string());}record.elapsed_ms=now.elapsed().as_millis() as u64;atlas.caches.push(record);
    }
    atlas.elapsed_ms=start.elapsed().as_millis() as u64;Ok(atlas)
}
#[cfg(test)]mod tests{
    #[test]
    fn rejects_conflicting_atlas_extraction_rows() {
        let mut pool = ExtractionPool { player_starts: [1, 2], weapons: vec![3, 5, 9], vehicles: vec![4] };
        assert!(pool.validate(609).is_ok());
        pool.player_starts = [1, 1];
        assert!(pool.validate(609).is_err());
        pool.player_starts = [1, 2];
        pool.weapons = vec![3, 3, 9];
        assert!(pool.validate(609).is_err());
        pool.weapons = vec![3, 5, 9];
        pool.vehicles.clear();
        assert!(pool.validate(609).is_err());
    }

    #[test]
    #[ignore = "requires owner-installed stock Timberland; set SPARK_REVIEW_STOCK_TIMBERLAND"]
    fn reviews_native_timberland_extraction_points() {
        let source = std::env::var_os("SPARK_REVIEW_STOCK_TIMBERLAND").expect("provide owned Timberland cache");
        let path = Path::new(&source);
        let map = maps::inspect_map(path, path.parent()).unwrap();
        assert_eq!(map.header.name, "timberland");
        let region = LayoutRegion {
            region_id: format!("{}:0", map.sha256), cache_sha256: map.sha256.clone(),
            cache_version: 609, bsp_index: 0, map_name: "timberland".into(), bsp_name: "timberland".into(),
            minimum: [0.; 3], maximum: [0.; 3], translation: [0.; 3], yaw_degrees: 0.,
            hex_slot: None, underground: false, surface_access: None,
        };
        let points = review_extraction_points(&region, path, &map).unwrap();
        assert!(points.player_starts.len() >= 2);
        assert!(points.weapons.len() >= 3);
        assert!(!points.vehicles.is_empty());
        let mut wrong_source = region;
        wrong_source.cache_sha256 = "0".repeat(64);
        assert!(review_extraction_points(&wrong_source, path, &map).is_err());
        println!("Reviewed {} player starts, {} weapon points and {} vehicle points",
            points.player_starts.len(), points.weapons.len(), points.vehicles.len());
    }

    use super::*;
    #[test]
    fn native_burial_measures_rotated_roof_and_refuses_to_fill_missing_ground() {
        let region = |id: &str, bounds, translation, yaw, underground| LayoutRegion {
            region_id: id.into(), cache_sha256: "a".repeat(64), cache_version: 609, bsp_index: 0,
            map_name: id.into(), bsp_name: id.into(), minimum: bounds, maximum: [4., 4., 1.],
            translation, yaw_degrees: yaw, hex_slot: None, underground, surface_access: None,
        };
        let surface = region("surface", [0.; 3], [20., 10., 0.], 90., false);
        let mut interior = region("interior", [0.; 3], [18., 11., 1.], 0., true);
        interior.maximum = [1., 2., 1.];
        let mut mesh = MeshData {
            positions: vec![0., 0., 3., 4., 0., 5., 4., 4., 5., 0., 4., 3.],
            indices: vec![0, 1, 2, 0, 2, 3],
            parts: vec![maps::MeshPart { name: "floor".into(), index_start: 0, index_count: 6 }],
            ..Default::default()
        };
        let faces: [_; 2] = std::array::from_fn(|_| maps::CollisionFace { shader: Some(1), flags: 0, normal: [0., 0., 1.] });
        let report = review_burial_geometry(&surface, &interior, &mesh, &faces, 2.).unwrap();
        assert!((report.footprint_area - 2.).abs() < 1e-6);
        assert!((report.uncovered_area - 1.).abs() < 1e-6);
        let depth = report.suggested_translation_z.unwrap();
        assert!((0.49..=0.50).contains(&depth), "{report:?}");
        interior.translation[2] = depth;
        assert!(review_burial_geometry(&surface, &interior, &mesh, &faces, 2.).unwrap().uncovered_area <= 1e-6);
        // The same full footprint remains covered by a face steeper than a
        // player can climb. The roof check and entrance check are independent.
        mesh.positions[5] = 15.;
        mesh.positions[8] = 15.;
        let cliff = review_burial_geometry(&surface, &interior, &mesh, &faces, 2.).unwrap();
        assert!(cliff.uncovered_area <= 1e-6 && cliff.cover_z.is_some());
        mesh.positions[5] = 5.;
        mesh.positions[8] = 5.;
        mesh.indices.truncate(3);
        mesh.parts[0].index_count = 3;
        interior.translation[0] = 16.5;
        let missing = review_burial_geometry(&surface, &interior, &mesh, &faces, 2.).unwrap();
        assert!(missing.uncovered_area > 1.);
        assert!(missing.suggested_translation_z.is_none());
    }

    #[test]fn topology_and_source_parts_are_scoped_and_bad_indices_refused(){
        let mesh=MeshData{positions:vec![0.,0.,0.,1.,0.,0.,0.,1.,0.],indices:vec![0,1,2],parts:vec![maps::MeshPart{name:"one".into(),index_start:0,index_count:3}],..Default::default()};
        let i=MapInspection{header:maps::MapHeader{version:609,name:"fixture".into(),engine:"CE".into(),build:String::new(),scenario_type:1,file_size:4096,declared_size:4096,tag_offset:2048,tag_size:100,crc32:0,flags:0,demo_layout:false,compressed:false,extended:false,legacy_tag_size_repair:false},sha256:"a".repeat(64),tag_checksum:None,tags:vec![],objects:vec![],decals:vec![],mesh:mesh.clone(),render_mesh:None,model_meshes:Default::default(),player_starting_profiles:None,encounters:vec![],scripts:vec![],resources:vec![],diagnostics:vec![],scenario_path:"levels/test/fixture".into()};
        let r=regions(Path::new("one.map"),"CE",&i,&mesh).unwrap();assert_eq!(r[0].boundary_edges,3);assert_eq!(r[0].collision_vertices,3);assert_eq!(r[0].maximum,[1.,1.,0.]);
        let mut bad=mesh;bad.indices[0]=u32::MAX;assert!(regions(Path::new("one.map"),"CE",&i,&bad).is_err());
    }
}

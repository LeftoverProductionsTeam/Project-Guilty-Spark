//! Owner-run source and compiler acceptance of a connected imported BSP.
use spark_core::{bsp_assembly, library::Library, maps, Result};
use std::{fs, path::Path, sync::atomic::AtomicBool};
fn main() -> Result<()> {
    let mut a: Vec<_> = std::env::args().collect();
    let plan_only = a.get(1).is_some_and(|arg| arg == "--plan-only");
    if plan_only { a.remove(1); }
    let direction = if a.get(1).is_some_and(|arg| arg == "--direction") {
        a.remove(1);
        let angle = a.get(1).and_then(|arg| arg.parse::<f64>().ok())
            .ok_or_else(|| spark_core::SparkError::Invalid("Missing tunnel direction in degrees".into()))?;
        a.remove(1);
        angle
    } else { 0. };
    let terrain=a.get(1).is_some_and(|v|v=="--terrain");if terrain{a.remove(1);}
    let edge_section = if a.get(1).is_some_and(|v| v == "--edge-section") {
        a.remove(1);
        let offset: f64 = a.get(1).ok_or_else(|| spark_core::SparkError::Invalid("Choose an explicit seam-section branch offset".into()))?.parse().map_err(|_| spark_core::SparkError::Invalid("Invalid seam-section offset".into()))?;
        if !offset.is_finite() || offset.abs() > 64. { return spark_core::invalid("Section offset must be finite and within 64 units"); }
        a.remove(1); Some(offset)
    } else { None };
    if a.len() == 9 && a[1] == "--review-render-rays" {
        let file = Path::new(&a[2]);
        let read = |value: &str| value.parse::<f64>().ok().filter(|p| p.is_finite() && p.abs() <= 32768.)
            .ok_or_else(|| spark_core::SparkError::Invalid("Expected a finite camera coordinate or angle".into()));
        let slot = a[3].parse::<usize>().map_err(|_| spark_core::SparkError::Invalid("Expected native BSP slot".into()))?;
        let eye = [read(&a[4])?, read(&a[5])?, read(&a[6])?];
        let yaw = read(&a[7])?.to_radians();
        let pitch = read(&a[8])?.to_radians();
        let direction = [yaw.cos() * pitch.cos(), yaw.sin() * pitch.cos(), pitch.sin()];
        let right = [-yaw.sin(), yaw.cos(), 0.];
        let cross = |a: [f64; 3], b: [f64; 3]| [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        let dot = |a: [f64; 3], b: [f64; 3]| a.into_iter().zip(b).map(|(x,y)|x*y).sum::<f64>();
        let sub = |a: [f64; 3], b: [f64; 3]| std::array::from_fn(|i|a[i]-b[i]);
        let up = cross(direction, right);
        let map = maps::inspect_map(file, file.parent())?;
        let mesh = map.render_mesh.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("Compiled render BSP is unavailable".into()))?;
        let ranges = mesh.material_ranges.iter().filter(|row| row.bsp_index==slot).collect::<Vec<_>>();
        let collision = map.mesh.parts.get(slot).ok_or_else(|| spark_core::SparkError::Invalid("Compiled collision BSP is unavailable".into()))?;
        if ranges.is_empty() { return spark_core::invalid("No native render material ranges for the chosen BSP"); }
        let mut hits = Vec::new();
        for [lateral,elevation] in [[0.,0.],[-0.2,0.],[0.2,0.],[0.,-0.1],[-0.2,-0.1],[0.2,-0.1],[0.,-0.25],[-0.2,-0.25],[0.2,-0.25],[0.,0.15]] {
            let ray: [f64; 3] = std::array::from_fn(|i|direction[i]+right[i]*lateral+up[i]*elevation);
            let ray = ray.map(|p| p / dot(ray,ray).sqrt());
            let find = |mesh: &maps::MeshData, start: usize, count: usize| {
                mesh.indices[start..start+count].chunks_exact(3).enumerate().filter_map(|(i,tris)| {
                    let point = |index: usize| -> [f64; 3] {
                        let base = tris[index] as usize*3;
                        std::array::from_fn(|i| f64::from(mesh.positions[base+i]))
                    };
                    let a=point(0);let ab=sub(point(1),a);let ac=sub(point(2),a);
                    let p=cross(ray,ac);let det=dot(ab,p);if det.abs()<1e-10{return None;}
                    let t=sub(eye,a);let u=dot(t,p)/det;let q=cross(t,ab);let v=dot(ray,q)/det;let d=dot(ac,q)/det;
                    (u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001&&(0.001..=64.).contains(&d)).then_some((d,start/3+i,det>0.))
                }).min_by(|a,b|a.0.total_cmp(&b.0))
            };
            let rendered = ranges.iter().filter_map(|range| find(mesh,range.index_start,range.index_count).map(|hit| (hit,*range)))
                .min_by(|a,b| a.0.0.total_cmp(&b.0.0)).map(|((distance,triangle,front),range)| {
                    let shader=map.tags.iter().find(|tag|tag.id==range.shader_tag_id);
                    serde_json::json!({ "distance":distance,"triangle":triangle,"front":front,
                        "shader":shader.map(|tag|&tag.path),"class":shader.map(|tag|&tag.class),
                        "lightmapPage":range.lightmap_page,"hasLightmapUvs":range.has_lightmap_uvs,
                        "point":std::array::from_fn::<_,3,_>(|i|eye[i]+distance*ray[i])})
                });
            hits.push(serde_json::json!({"offset":[lateral,elevation],"render":rendered,
                "collision":find(&map.mesh,collision.index_start,collision.index_count).map(|(distance,triangle,front)|
                    serde_json::json!({"distance":distance,"triangle":triangle,"front":front}))}));
        }
        println!("{}",serde_json::json!({"cacheSha256":map.sha256,"bsp":slot,"eye":eye,"hits":hits}));
        return Ok(());
    }

    if a.len() >= 3 && a[1] == "--review-pickup-support" {
        for source in &a[2..] {
            let path = Path::new(source);
            let map = maps::inspect_map(path, None)?;
            let pickups: Vec<_> = map.objects.iter().filter(|row| row.kind == "Netgame item").collect();
            if pickups.is_empty() {
                println!("{}", serde_json::json!({"cacheSha256":map.sha256,"scenario":map.scenario_path,"pickups":0}));
                continue;
            }
            let points: Vec<_> = pickups.iter().map(|row| row.position).collect();
            let regions = (map.mesh.parts.len() > 1).then(|| maps::native_bsp_placements(path, &map)).transpose()?;
            let review = maps::bsp_point_locations(path, &map, &points, Some(64.))?;
            let region_names = map.mesh.parts.iter().map(|part| &part.name).collect::<Vec<_>>();
            let mut no_owner = 0;
            let mut no_floor = 0;
            let mut elevated = 0;
            let mut examples = Vec::new();
            for (pickup, result) in pickups.iter().zip(review) {
                let mask = regions.as_ref().map_or(1, |regions| pickup.source_offset
                    .and_then(|offset| regions.memberships.get(&offset).copied()).unwrap_or(0));
                let floor = result.ground.iter().filter(|support| mask & (1u16 << support.bsp) != 0)
                    .max_by(|a, b| a.z.total_cmp(&b.z));
                let height = floor.map(|support| pickup.position[2] - support.z);
                no_owner += usize::from(mask == 0);
                no_floor += usize::from(mask != 0 && height.is_none());
                elevated += usize::from(height.is_some_and(|gap| gap > 2.));
                if (height.is_none() || height.is_some_and(|gap| gap > 2.)) && examples.len() < 24 {
                    examples.push(serde_json::json!({"id":pickup.id,"name":pickup.name,"point":pickup.position,
                        "owners":mask,"floorBsp":floor.map(|support| support.bsp),"height":height,
                        "nearbySurfaces":result.supports,"anyFloor":result.ground}));
                }
            }
            println!("{}", serde_json::json!({"cacheSha256":map.sha256,"scenario":map.scenario_path,
                "pickups":pickups.len(),"noClusterOwner":no_owner,"noOwnerFloorWithin64":no_floor,
                "ownerFloorOver2Below":elevated,"regions":region_names,"examples":examples}));
        }
        return Ok(());
    }
    if matches!(a.len(), 5 | 6) && a[1] == "--review-region-placement-moves" {
        let file = Path::new(&a[2]);
        let map = maps::inspect_map(file, None)?;
        let regions = maps::native_bsp_placements(file, &map)?;
        let slot: usize = a[3].parse().map_err(|_| spark_core::SparkError::Invalid("Expected a native BSP slot".into()))?;
        let delta: [f64; 3] = serde_json::from_str(&a[4])?;
        if slot >= regions.bsp_count || delta.iter().any(|v| !v.is_finite() || v.abs() > 1500.) {
            return spark_core::invalid("Invalid native region or relocation");
        }
        let bit = 1u16 << slot;
        let mut objects = Vec::new();
        let mut overlapping = Vec::new();
        for object in &map.objects {
            let mask = object.source_offset.and_then(|offset| regions.memberships.get(&offset).copied()).unwrap_or(0);
            if mask & bit == 0 { continue; }
            if mask != bit {
                overlapping.push(serde_json::json!({"id":object.id,"kind":object.kind,"ownerMask":mask,"position":object.position}));
                continue;
            }
            let translated = std::array::from_fn::<_, 3, _>(|i| f64::from(object.position[i]) + delta[i]);
            if translated.iter().any(|v| v.abs() > 1500.) {
                return spark_core::invalid("A relocated placement exceeds native coordinate bounds");
            }
            objects.push(serde_json::json!({"id":object.id,"kind":object.kind,"position":object.position,"translated":translated}));
        }
        let mut supplemental = Vec::new();
        if let Some(input) = a.get(5) {
            let input = Path::new(input);
            spark_core::reject_links(input)?;
            if fs::metadata(input)?.len() > 1024 * 1024 { return spark_core::invalid("Supplemental native point input exceeds one MiB"); }
            let rows: Vec<serde_json::Value> = serde_json::from_slice(&fs::read(input)?)?;
            if rows.is_empty() || rows.len() > 1024 { return spark_core::invalid("Review up to 1024 supplemental scenario positions"); }
            let points = rows.iter().map(|row| serde_json::from_value(row["point"].clone()))
                .collect::<std::result::Result<Vec<[f32; 3]>, _>>()?;
            let locations = maps::bsp_point_locations(file, &map, &points, None)?;
            for (row, location) in rows.into_iter().zip(locations) {
                if location.bsps.contains(&(slot as u16)) {
                    supplemental.push(serde_json::json!({"row":row,"owners":location.bsps}));
                }
            }
        }
        println!("{}", serde_json::json!({"sourceSha256":map.sha256,"slot":slot,"delta":delta,
            "objects":objects,"overlapping":overlapping,"supplemental":supplemental}));
        return Ok(());
    }
    if matches!(a.len(), 7 | 8) && a[1] == "--verify-rebuilt-connector" {
        let cache = Path::new(&a[2]);
        let project = spark_core::project::load_project(Path::new(&a[3]))?;
        let plan = project.bsp_assembly.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("Expected reviewed connector plan".into()))?;
        let overlaps = Path::new(&a[4]);
        spark_core::reject_links(overlaps)?;
        if fs::metadata(overlaps)?.len() > 16_384 { return spark_core::invalid("Connector readback exceeds 16 KiB"); }
        let json: serde_json::Value = serde_json::from_slice(&fs::read(overlaps)?)?;
        let slots = [a[5].parse(), a[6].parse()].map(|slot| slot.map_err(|_| spark_core::SparkError::Invalid("Expected physical BSP slot".into())));
        let [connector, donor] = slots;
        let compiled = maps::inspect_map(cache, None)?;
        let ramps = if let Some(file) = a.get(7) {
            let file = Path::new(file);
            spark_core::reject_links(file)?;
            if fs::metadata(file)?.len() > 16_384 { return spark_core::invalid("Entrance review exceeds 16 KiB"); }
            let repairs: [bsp_assembly::ReviewedEntranceRepair; 2] = serde_json::from_slice(&fs::read(file)?)?;
            repairs.map(|repair| repair.vehicle_ramp)
        } else { [None; 2] };
        let proof = bsp_assembly::verify_rebuilt_connector_collision(cache, &compiled, plan,
            serde_json::from_value(json["overlaps"].clone())?, [connector?, donor?],
            [json["entrance"].is_object(), json["donorEntrance"].is_object()], ramps)?;
        println!("{}", serde_json::to_string(&proof)?);
        return Ok(());
    }
    if a.len() == 4 && a[1] == "--verify-walkthrough" {
        let p = spark_core::project::load_project(Path::new(&a[3]))?;
        let route = p.bsp_assembly.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("Project has no connection route".into()))?;
        let report = bsp_assembly::verify_compiled_walkthrough(Path::new(&a[2]), route)?;
        println!("{}", serde_json::to_string(&report)?);
        if report.starts.iter().any(|s| s.issue.is_some()) { std::process::exit(2); }
        return Ok(());
    }
    if a.len() == 6 && a[1] == "--review-extraction-vehicle-parking" {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Review {
            cache_sha256: String,
            regions: Vec<(u16, Vec<u16>)>,
        }
        let cache = Path::new(&a[2]);
        let compiled = maps::inspect_map(cache, None)?;
        let file = Path::new(&a[3]);
        spark_core::reject_links(file)?;
        if fs::metadata(file)?.len() > 65536 { return spark_core::invalid("Parking review exceeds 64 KiB"); }
        let review: Review = serde_json::from_slice(&fs::read(file)?)?;
        if review.cache_sha256 != compiled.sha256 || review.regions.is_empty() || review.regions.len() > 64 {
            return spark_core::invalid("Parking review does not match the compiled map or logical region limit");
        }
        let radius = a[4].parse().map_err(|_| spark_core::SparkError::Invalid("Enter the reviewed vehicle bound".into()))?;
        let resting = a[5].parse().map_err(|_| spark_core::SparkError::Invalid("Enter the reviewed vehicle resting offset".into()))?;
        let parking = spark_core::megaworld::review_extraction_vehicle_parking(cache, &compiled, &review.regions, radius, resting)?;
        println!("{}", serde_json::json!({"cacheSha256":compiled.sha256,"parking":parking}));
        return Ok(());
    }
    if a.len() == 6 && a[1] == "--review-extraction-start-clearance" {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Review {
            cache_sha256: String,
            points: Vec<[u16; 2]>,
        }
        let cache = Path::new(&a[2]);
        let compiled = maps::inspect_map(cache, None)?;
        let file = Path::new(&a[3]);
        spark_core::reject_links(file)?;
        if fs::metadata(file)?.len() > 65536 {
            return spark_core::invalid("Extraction body review exceeds 64 KiB");
        }
        let review: Review = serde_json::from_slice(&fs::read(file)?)?;
        if review.cache_sha256 != compiled.sha256 || review.points.is_empty() {
            return spark_core::invalid("Extraction body review does not match the compiled cache or start budget");
        }
        let biped_tags = [a[4].as_str(), a[5].as_str()];
        let pills = [maps::compiled_biped_standing_pill(cache, &compiled, biped_tags[0])?,
            maps::compiled_biped_standing_pill(cache, &compiled, biped_tags[1])?];
        let starts = spark_core::megaworld::review_extraction_start_clearance(cache, &compiled, biped_tags, &review.points)?;
        println!("{}", serde_json::json!({"cacheSha256":compiled.sha256,"pills":pills,"starts":starts}));
        return Ok(());
    }
    if a.len() == 4 && a[1] == "--review-extraction-layout" {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct RegionInput {
            path: std::path::PathBuf,
            sha256: String,
            translation: [f64; 3],
            yaw_degrees: f64,
        }

        let cache = Path::new(&a[2]);
        let compiled = maps::inspect_map(cache, None)?;
        let input = Path::new(&a[3]);
        spark_core::reject_links(input)?;
        if fs::metadata(input)?.len() > 65536 {
            return spark_core::invalid("Extraction layout review exceeds 64 KiB");
        }
        let rows: Vec<RegionInput> = serde_json::from_slice(&fs::read(input)?)?;
        if rows.is_empty() || rows.len() > 64 {
            return spark_core::invalid("Review between one and 64 owned regions");
        }
        let mut seen = std::collections::BTreeSet::new();
        let mut results = Vec::new();
        for row in rows {
            spark_core::reject_links(&row.path)?;
            let source = maps::inspect_map(&row.path, row.path.parent())?;
            if source.sha256 != row.sha256 || !seen.insert(row.sha256) || source.mesh.parts.len() != 1
                || !row.translation.into_iter().chain([row.yaw_degrees]).all(|value| value.is_finite() && value.abs() <= 1500.) {
                return spark_core::invalid(format!("Unreviewed or repeated source {}", row.path.display()));
            }
            let region = spark_core::megaworld::LayoutRegion {
                region_id: format!("{}:0", source.sha256), cache_sha256: source.sha256.clone(),
                cache_version: source.header.version, bsp_index: 0, map_name: source.header.name.clone(),
                bsp_name: source.mesh.parts[0].name.clone(), minimum: [0.; 3], maximum: [0.; 3],
                translation: row.translation, yaw_degrees: row.yaw_degrees, hex_slot: None,
                underground: false, surface_access: None,
            };
            results.push(spark_core::megaworld::review_extraction_layout_region(&region, &row.path, &source, cache, &compiled)?);
        }
        println!("{}", serde_json::json!({"cacheSha256":compiled.sha256,"regions":results}));
        return Ok(());
    }
    if a.len() == 9 && a[1] == "--review-extraction-bindings" {
        let cache = Path::new(&a[2]);
        let stock = Path::new(&a[3]);
        let compiled = maps::inspect_map(cache, None)?;
        let source = maps::inspect_map(stock, stock.parent())?;
        let number = |value: &str| value.parse::<f64>().ok().filter(|v| v.is_finite() && v.abs() <= 1500.)
            .ok_or_else(|| spark_core::SparkError::Invalid("Translation and yaw must be finite and within native bounds".into()));
        let slot = a[4].parse::<usize>().map_err(|_| spark_core::SparkError::Invalid("A native BSP slot is required".into()))?;
        let region = spark_core::megaworld::LayoutRegion {
            region_id: format!("{}:0", source.sha256), cache_sha256: source.sha256.clone(),
            cache_version: source.header.version, bsp_index: 0, map_name: source.header.name.clone(),
            bsp_name: source.mesh.parts.first().ok_or_else(|| spark_core::SparkError::Invalid("Source BSP missing".into()))?.name.clone(),
            minimum: [0.; 3], maximum: [0.; 3],
            translation: [number(&a[5])?, number(&a[6])?, number(&a[7])?], yaw_degrees: number(&a[8])?,
            hex_slot: None, underground: false, surface_access: None,
        };
        let bindings = spark_core::megaworld::review_compiled_extraction_bindings(
            &region, (stock, &source), (cache, &compiled), slot)?;
        println!("{}", serde_json::json!({"cacheSha256": compiled.sha256,"bindings": bindings}));
        return Ok(());
    }
    if a.len() == 3 && a[1] == "--read-native-transitions" {
        let file = Path::new(&a[2]);
        let map = maps::inspect_map(file, None)?;
        println!("{}", serde_json::to_string(&maps::scenario_bsp_transitions(file, &map)?)?);
        return Ok(());
    }
    if a.len() >= 4 && a[1] == "--verify-cache" {
        if a.len() - 3 > bsp_assembly::MAX_COMPILED_CONNECTIONS {
            return spark_core::invalid(format!("Choose at most {} connection projects", bsp_assembly::MAX_COMPILED_CONNECTIONS));
        }
        let file = Path::new(&a[2]);
        let mut projects = vec![];
        let mut plans = vec![];
        for source in &a[3..] {
            let p = spark_core::project::load_project(Path::new(source))?;
            let plan = p.bsp_assembly.as_ref().ok_or_else(|| {
                spark_core::SparkError::Invalid(format!("{} has no connection route", p.title))
            })?;
            plans.push(plan.clone());
            projects.push(p);
        }
        let report = bsp_assembly::verify_compiled_routes(file, &plans)?;
        let mut routes = vec![];
        for ((p, source), samples) in projects.iter().zip(&a[3..]).zip(report.walk_samples) {
            routes.push(serde_json::json!({
                "projectTitle": p.title,
                "projectFileSha256": maps::hash_file(Path::new(source))?,
                "donorTitle": p.bsp_assembly.as_ref().unwrap().donor_title,
                "walkSamples": samples,
            }));
        }
        println!("{}", serde_json::json!({
            "cacheSha256": report.cache_sha256,
            "collisionTriangles": report.collision_triangles,
            "routes": routes,
            "status": "PASS",
            "scope": "BSP collision route sampling only; scenery and player physics need in-game testing",
        }));
        return Ok(());
    }
    if matches!(a.len(), 4 | 6 | 7 | 8) && a[1] == "--export-intact-connector" {
        let p = spark_core::project::load_project(Path::new(&a[2]))?;
        let source = p.source.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("No preserved base map".into()))?;
        let base = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        let cancel = AtomicBool::new(false);
        let connector = if a.len() >= 6 {
            let slot = |value: &str| value.parse::<usize>()
                .map_err(|_| spark_core::SparkError::Invalid("Expected a native BSP slot number".into()));
            let [connector, donor] = [slot(&a[4])?, slot(&a[5])?];
            #[derive(serde::Deserialize)]
            #[serde(untagged)]
            enum RepairFile {
                Repairs([bsp_assembly::ReviewedEntranceRepair; 2]),
                Seals([Vec<bsp_assembly::NativeSeal>; 2]),
            }
            let repairs = if let Some(file) = a.get(7) {
                let file = Path::new(file);
                spark_core::reject_links(file)?;
                if fs::metadata(file)?.len() > 16_384 { return spark_core::invalid("Entrance repair review exceeds 16 KiB"); }
                match serde_json::from_slice(&fs::read(file)?)? {
                    RepairFile::Repairs(repairs) => repairs,
                    RepairFile::Seals(seals) => seals.map(|seals| bsp_assembly::ReviewedEntranceRepair {
                        seals, ..Default::default()
                    }),
                }
            } else { [Default::default(), Default::default()] };
            match a.get(6).map(String::as_str) {
                None => bsp_assembly::rebuild_preserved_connector(&p, &base, connector, donor, &cancel)?,
                Some("--open-entrance") => bsp_assembly::rebuild_preserved_connector_with_repairs(
                    &p, &base, connector, donor, [true, false], &repairs, &cancel)?,
                Some("--open-entrances") => bsp_assembly::rebuild_preserved_connector_with_repairs(
                    &p, &base, connector, donor, [true, true], &repairs, &cancel)?,
                Some(_) => return spark_core::invalid("Expected --open-entrance or --open-entrances"),
            }
        } else {
            bsp_assembly::generate_preserved_connector(&p, &base, &cancel)?
        };
        let output = Path::new(&a[3]);
        spark_core::reject_links(output)?;
        fs::create_dir(output)?;
        fs::write(output.join("connector.jms"), bsp_assembly::export_jms(&connector.geometry)?)?;
        fs::write(output.join("connector-materials.json"), serde_json::to_vec(&connector.geometry.materials)?)?;
        if let Some(entrance) = &connector.rebuilt_entrance {
            fs::write(output.join("entrance.jms"), bsp_assembly::export_jms(entrance)?)?;
            fs::write(output.join("entrance-materials.json"), serde_json::to_vec(&entrance.materials)?)?;
        }
        if let Some(entrance) = &connector.rebuilt_donor_entrance {
            fs::write(output.join("donor-entrance.jms"), bsp_assembly::export_jms(entrance)?)?;
            fs::write(output.join("donor-entrance-materials.json"), serde_json::to_vec(&entrance.materials)?)?;
        }
        let receipt = serde_json::json!({
            "report": connector.geometry.report, "switches": connector.switches, "overlaps": connector.overlaps,
            "entrance": connector.rebuilt_entrance.as_ref().map(|geometry| &geometry.report),
            "donorEntrance": connector.rebuilt_donor_entrance.as_ref().map(|geometry| &geometry.report),
        });
        fs::write(output.join("connector-scenario.json"), serde_json::to_vec_pretty(&receipt)?)?;
        println!("{receipt}");
        return Ok(());
    }
    if a.len() == 4 && a[1] == "--export-partitions" {
        let p = spark_core::project::load_project(Path::new(&a[2]))?;
        let source = p.source.as_ref().ok_or_else(|| spark_core::SparkError::Invalid("No preserved base map".into()))?;
        let i = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        let parts = bsp_assembly::generate_partitioned_project(&p, &i, &AtomicBool::new(false))?;
        let output = Path::new(&a[3]);
        fs::create_dir(output)?;
        for (name, geometry) in parts.base.iter().map(|base| ("base", base)).chain(std::iter::once(("donor", &parts.donor))) {
            fs::write(output.join(format!("{name}.jms")), bsp_assembly::export_jms(geometry)?)?;
            fs::write(output.join(format!("{name}-materials.json")), serde_json::to_vec(&geometry.materials)?)?;
        }
        let receipt = serde_json::json!({"base":parts.base.as_ref().map(|base| &base.report),"donor":parts.donor.report,"overlap":parts.overlap,"overlapSamples":parts.overlap_samples,"maxFloorDelta":parts.max_floor_delta,"switches":parts.switches});
        fs::write(output.join("partitions.json"), serde_json::to_vec_pretty(&receipt)?)?;
        println!("{receipt}");
        return Ok(());
    }
    if a.len() == 4 && a[1] == "--check" {
        let p = spark_core::project::load_project(Path::new(&a[2]))?;
        let source = p.source.as_ref().unwrap();
        let i = maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
        let cancel = AtomicBool::new(false);
        let geometry = if p.bsp_assembly.as_ref().is_some_and(|plan| plan.preserve_donor_bsp) {
            bsp_assembly::generate_editor_connector(&p, &i, &cancel)?.geometry
        } else {
            bsp_assembly::generate_project(&p, &i, &cancel)?
        };
        let output = Path::new(&a[3]);
        if output.exists() {
            return Err(spark_core::SparkError::Invalid(
                "Recheck output must be a fresh JMS file".into(),
            ));
        }
        fs::write(output, bsp_assembly::export_jms(&geometry)?)?;
        println!("{}", serde_json::to_string(&geometry.report)?);
        return Ok(());
    }
    if a.len() != 6 {
        eprintln!("qa_bsp_assembly [--plan-only] [--direction <degrees>] [--terrain | --edge-section <branch offset>] <base.map> <donor.map> <donor BSP index> <donor tags> <fresh output directory>");
        eprintln!("qa_bsp_assembly --export-partitions <connection-project.gsproject> <fresh output directory>");
        eprintln!("qa_bsp_assembly --read-native-transitions <compiled.map>");
        eprintln!("qa_bsp_assembly --review-pickup-support <compiled.map> [...]");
        eprintln!("qa_bsp_assembly --verify-cache <compiled.map> <connection-project.gsproject> [...]");
        eprintln!("qa_bsp_assembly --verify-walkthrough <compiled.map> <connection-project.gsproject>");
        std::process::exit(2);
    }
    let out = Path::new(&a[5]);
    fs::create_dir(out)?;
    let out = fs::canonicalize(out)?;
    let lib = Library::open(&out.join("library"))?;
    let (mut p, i) = lib.import_map(Path::new(&a[1]), None)?;
    if i.header.version == 13 {
        if let Some(root) = Path::new(&a[1]).parent().and_then(Path::parent) {
            let packs = root.join("prebuild/paks");
            if packs.is_dir() {
                let source = p.source.as_mut().unwrap();
                source.resource_sha256 = spark_core::mcc_textures::pin(&packs, &i.header.name)?;
                source.resource_directory = Some(packs);
            }
        }
    }
    let (d, j) = lib.import_map(Path::new(&a[2]), None)?;
    let index = a[3]
        .parse()
        .map_err(|_| spark_core::SparkError::Invalid("Invalid BSP index".into()))?;
    let plan = if terrain{bsp_assembly::plan_terrain(&p,&i,&d,&j,index,fs::canonicalize(&a[4])?)?}else{bsp_assembly::plan_in_direction(&p, &i, &d, &j, index, fs::canonicalize(&a[4])?, direction)?};
    let plan = if let Some(offset) = edge_section {
        // Exercise genuine rendered source edges, never manufactured points or
        // a shortcut around the same entrance checks used by viewport picks.
        let start = plan.tunnel_points[0];
        let base_edge = nearest_edge(&i, Path::new(&a[1]), 0, start)?;
        let end = *plan.tunnel_points.last().unwrap();
        let donor_at = std::array::from_fn(|k| end[k] - plan.translation[k]);
        let donor_edge = nearest_edge(&j, Path::new(&a[2]), index, donor_at)?;
        let mut next = bsp_assembly::append_edge_section(Path::new(&a[1]), &i, &plan, [base_edge, donor_edge])?;
        // Model a creator reshaping the section after the two genuine picks:
        // retain established walkable landings and branch in the free gap.
        let bend = |t: f64| std::array::from_fn(|k| start[k] + (end[k] - start[k]) * t + if k == 1 { offset } else { 0. });
        next.sections[0].points = vec![start, bend(0.25), bend(0.75), end];
        next.validate()?;
        next
    } else { plan };
    eprintln!("plan {}", serde_json::to_string(&plan)?);
    p.bsp_assembly = Some(plan);
    spark_core::project::save_project(&out.join("project.gsproject"), &p)?;
    if plan_only { return Ok(()); }
    let geometry = bsp_assembly::generate_project(&p, &i, &AtomicBool::new(false))?;
    fs::write(
        out.join("combined.jms"),
        bsp_assembly::export_jms(&geometry)?,
    )?;
    fs::write(
        out.join("geometry.json"),
        serde_json::to_vec(&geometry.mesh)?,
    )?;
    fs::write(
        out.join("materials.json"),
        serde_json::to_vec_pretty(&geometry.materials)?,
    )?;
    lib.save(&p, Some(&i))?;
    spark_core::project::save_project(&out.join("project.gsproject"), &p)?;
    fs::write(
        out.join("report.json"),
        serde_json::to_vec_pretty(&geometry.report)?,
    )?;
    println!("{}", serde_json::to_string(&geometry.report)?);
    Ok(())
}

/// Deterministic installed-map fixture pick. Production still gets its edge
/// from the viewport; append_edge_section independently verifies this pick.
fn nearest_edge(i: &maps::MapInspection, source: &Path, bsp: usize, at: [f64; 3]) -> Result<bsp_assembly::SeamEdge> {
    let rendered = i.render_mesh.as_ref().ok_or_else(|| spark_core::SparkError::Invalid(format!("Source render geometry unavailable: {}", source.display())))?;
    let vertex = |id: u32| std::array::from_fn::<_, 3, _>(|k| rendered.positions[id as usize * 3 + k] as f64);
    let mut nearest: Option<(f64, [[f64; 3]; 2], [f64; 3])> = None;
    for range in rendered.material_ranges.iter().filter(|r| r.bsp_index == bsp) {
        for ids in rendered.indices[range.index_start..range.index_start + range.index_count].chunks_exact(3) {
            for n in 0..3 {
                let vertices = [vertex(ids[n]), vertex(ids[(n + 1) % 3])];
                let delta: [f64; 3] = std::array::from_fn(|k| vertices[1][k] - vertices[0][k]);
                let length = delta.iter().map(|v| v * v).sum::<f64>();
                if length < 1e-8 { continue; }
                let t = ((0..3).map(|k| (at[k] - vertices[0][k]) * delta[k]).sum::<f64>() / length).clamp(0., 1.);
                let point: [f64; 3] = std::array::from_fn(|k| vertices[0][k] + t * delta[k]);
                let distance = (0..3).map(|k| (point[k] - at[k]).powi(2)).sum();
                if nearest.as_ref().is_none_or(|(best, _, _)| distance < *best) { nearest = Some((distance, vertices, point)); }
            }
        }
    }
    let (_, vertices, point) = nearest.ok_or_else(|| spark_core::SparkError::Invalid("Source has no rendered BSP edges".into()))?;
    Ok(bsp_assembly::SeamEdge { source_sha256: i.sha256.clone(), bsp_index: bsp, vertices, point })
}

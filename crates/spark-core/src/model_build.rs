//! Imported OBJ -> native static scenery. Recipes are generated locally from
//! pinned source bytes; neither executable input nor binary patches are accepted.
use crate::{
    assets,
    build::Runner,
    invalid, maps,
    project::{self, Asset, Project},
    quickforge::{ForgePlacement, QuickForgeDocument},
    safe_relative, Result, SparkError,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub tag: String,
    pub source: PathBuf,
    pub source_sha256: String,
    pub jms_sha256: String,
    pub triangles: usize,
    pub radius: f32,
    pub bounds: [[f32; 3]; 2],
    #[serde(skip)]
    pub jms: String,
}
#[derive(Debug)]
pub struct Plan {
    pub document: QuickForgeDocument,
    pub models: Vec<Model>,
}
fn fail(message: impl Into<String>) -> SparkError {
    SparkError::Invalid(message.into())
}
fn transform(v: [f32; 3], scale: [f32; 3], ypr: [f32; 3], normal: bool) -> [f32; 3] {
    let mut p = std::array::from_fn::<_, 3, _>(|k| {
        if normal {
            v[k] as f64 / scale[k] as f64
        } else {
            v[k] as f64 * scale[k] as f64
        }
    });
    for (axis, angle) in [ypr[2], ypr[1], ypr[0]].into_iter().enumerate() {
        let (a, b) = ((axis + 1) % 3, (axis + 2) % 3);
        let (s, c) = (angle as f64).sin_cos();
        (p[a], p[b]) = (p[a] * c - p[b] * s, p[a] * s + p[b] * c);
    }
    if normal {
        let length = p.iter().map(|x| x * x).sum::<f64>().sqrt();
        p = p.map(|x| x / length);
    }
    p.map(|x| x as f32)
}
/// A single unnamed OBJ material may use the one explicitly assigned surface.
/// Multi-material meshes require an exact material-name binding, never a guessed shader.
fn shaders(doc: &QuickForgeDocument, names: &[String]) -> Result<Vec<String>> {
    let surfaces = doc
        .materials
        .iter()
        .filter(|m| m.shader_path.is_some())
        .collect::<Vec<_>>();
    names.iter().map(|name| {
        let matches=surfaces.iter().filter(|m|m.name.eq_ignore_ascii_case(name)).collect::<Vec<_>>();
        let material=if matches.len()==1 {matches[0]} else if matches.is_empty() && names.len()==1 && name=="default" && surfaces.len()==1 {&surfaces[0]} else {
            return invalid(format!("OBJ material '{name}' needs one matching named surface with an assigned Halo shader in Build tools → Materials. No native files were changed"));
        };
        let path=material.shader_path.as_ref().unwrap();safe_relative(path)?;
        let name=path.rsplit(['/', '\\']).next().unwrap();
        if name.is_empty() || name.len()>100 || !name.bytes().all(|b|b.is_ascii_alphanumeric()||b"_ -".contains(&b)) {return invalid("Imported model shader needs a safe native material basename");}
        Ok(name.to_string())
    }).collect()
}
fn read_source(asset: &Asset) -> Result<assets::ObjImport> {
    if asset.kind != "obj"
        || !asset
            .path
            .extension()
            .is_some_and(|x| x.eq_ignore_ascii_case("obj"))
    {
        return invalid("Native custom scenery accepts preserved OBJ source only");
    }
    crate::reject_links(&asset.path)?;
    let meta = fs::metadata(&asset.path)?;
    if !meta.is_file() || meta.len() > 64 * 1024 * 1024 {
        return invalid("Imported OBJ exceeds 64 MiB");
    }
    // Read once with a hard limit. Hash and parse the exact same bytes.
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(
        &mut std::io::Read::take(fs::File::open(&asset.path)?, 64 * 1024 * 1024 + 1),
        &mut bytes,
    )?;
    if bytes.len() > 64 * 1024 * 1024 || format!("{:x}", Sha256::digest(&bytes)) != asset.sha256 {
        return invalid(format!(
            "Imported OBJ '{}' changed; restore or re-import it before building",
            asset.name
        ));
    }
    let imported = assets::parse_obj(
        std::str::from_utf8(&bytes).map_err(|_| fail("OBJ source must be UTF-8"))?,
    )?;

    Ok(imported)
}
fn checked_shape(
    imported: &assets::ObjImport,
    scale: [f32; 3],
    rotation: [f32; 3],
    name: &str,
) -> Result<(Vec<[f32; 3]>, Vec<[f32; 3]>)> {
    if scale.iter().any(|v| !v.is_finite() || *v <= 0.) || rotation.iter().any(|v| !v.is_finite()) {
        return invalid("Source collision transform must be finite with positive scale");
    }
    if imported.mesh.indices.len() / 3 > 4096 || imported.mesh.positions.len() / 3 > 65535 {
        return invalid("Custom collision source exceeds 4096 triangles or 65535 vertices; simplify it before compiling");
    }
    let positions = imported
        .mesh
        .positions
        .chunks_exact(3)
        .map(|p| transform([p[0], p[1], p[2]], scale, rotation, false))
        .collect::<Vec<_>>();
    if positions
        .iter()
        .flatten()
        .any(|v| !v.is_finite() || v.abs() > 64.)
    {
        return invalid("Transformed scenery extends beyond ±64 Halo units; reduce/recenter the model before collision generation");
    }
    let normals = imported
        .mesh
        .normals
        .chunks_exact(3)
        .map(|p| transform([p[0], p[1], p[2]], scale, rotation, true))
        .collect::<Vec<_>>();
    let audit = crate::quickforge::ForgeMesh {
        positions: positions.iter().flatten().copied().collect(),
        normals: normals.iter().flatten().copied().collect(),
        uvs: imported.mesh.uvs.clone(),
        indices: imported.mesh.indices.clone(),
        parts: vec![],
    };
    if crate::quickforge::validate_mesh(&audit)
        .iter()
        .any(|i| i.severity == "error" && i.code != "INVALID_NORMAL")
    {
        return invalid(format!(
            "{} needs closed, consistently wound collision geometry. Original OBJ remains intact",
            name
        ));
    }

    // Smooth authored normals may be perpendicular at hard corners; do
    // not replace them with BSP flat normals. Closure/winding is checked
    // by edges, and the signed source volume must face outward.
    let volume = imported
        .mesh
        .indices
        .chunks_exact(3)
        .map(|t| {
            let a = positions[t[0] as usize];
            let b = positions[t[1] as usize];
            let c = positions[t[2] as usize];
            (a[0] as f64 * (b[1] as f64 * c[2] as f64 - b[2] as f64 * c[1] as f64)
                + a[1] as f64 * (b[2] as f64 * c[0] as f64 - b[0] as f64 * c[2] as f64)
                + a[2] as f64 * (b[0] as f64 * c[1] as f64 - b[1] as f64 * c[0] as f64))
                / 6.
        })
        .sum::<f64>();
    if volume <= 1e-6 {
        return invalid("Custom collision needs positive outward volume; repair inverted faces in the original model editor");
    }

    Ok((positions, normals))
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCollision {
    pub positions: Vec<f32>,
    pub indices: Vec<u32>,
}
/// Reads the pinned original source again for every snap. A cached visual mesh
/// cannot establish current source integrity or supply invented box collision.
pub fn source_collision(
    project: &Project,
    asset_id: &str,
    source_sha256: &str,
    scale: [f32; 3],
    rotation: [f32; 3],
) -> Result<SourceCollision> {
    let mut matches = project.assets.iter().filter(|a| a.id == asset_id);
    let asset = matches
        .next()
        .ok_or_else(|| fail("Source collision asset does not belong to this project"))?;
    if matches.next().is_some() || asset.sha256 != source_sha256 {
        return invalid("Source collision identity changed; reload the selected model");
    }
    let imported = read_source(asset)?;
    let _ = checked_shape(&imported, scale, rotation, &asset.name)?;
    if maps::hash_file(&asset.path)? != asset.sha256 {
        return invalid("Imported OBJ changed while its source collision was checked");
    }
    Ok(SourceCollision {
        positions: imported.mesh.positions,
        indices: imported.mesh.indices,
    })
}

pub fn plan(project: &Project) -> Result<Plan> {
    if project.scene.iter().any(|o| o.source_model.is_some()) {
        return invalid("Recovered compiled-map previews need extracted, compiled Halo model and scenario tags. Preserve the source and use a verified native tag placement");
    }
    let mut doc = project
        .quick_forge
        .clone()
        .ok_or_else(|| fail("Custom scenery builds need a QuickForge/Workshop source map"))?;
    let objects = project
        .scene
        .iter()
        .filter(|o| o.asset_id.is_some())
        .collect::<Vec<_>>();
    if !objects.is_empty() && doc.native.is_some() {
        return invalid("Custom OBJ compilation is local source authoring. Publish native assets through the reviewed SparkLink workflow; OBJ transfer is not yet negotiated");
    }
    if objects.len() > 128 {
        return invalid("Custom static scenery is limited to 128 placements per build");
    }
    let mut models = Vec::new();
    let mut recipes = BTreeMap::<String, String>::new();
    let mut total = 0;
    for object in objects {
        let id = object.asset_id.as_ref().unwrap();
        let candidates = project
            .assets
            .iter()
            .filter(|a| &a.id == id)
            .collect::<Vec<_>>();
        if candidates.len() != 1 {
            return invalid("Custom placement references a missing or ambiguous imported asset");
        }
        let asset = candidates[0];
        let imported = read_source(asset)?;
        if !imported.complete_uvs {
            return invalid(format!(
                "{} needs complete UV coordinates before native scenery compilation",
                asset.name
            ));
        }
        if imported.mesh.indices.len() / 3 > 4096 || imported.mesh.positions.len() / 3 > 65535 {
            return invalid("Custom collision source exceeds 4096 triangles or 65535 vertices; simplify it before compiling");
        }
        let bindings = shaders(&doc, &imported.materials)?;
        let recipe = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(
                &asset.sha256,
                object.scale,
                object.rotation,
                &bindings
            ))?)
        );
        let tag = if let Some(tag) = recipes.get(&recipe) {
            tag.clone()
        } else {
            if models.len() >= 64 {
                return invalid("Custom scenery exceeds 64 distinct model transforms");
            }
            total += imported.mesh.indices.len() / 3;
            if total > 32768 {
                return invalid(
                    "Custom scenery exceeds the total 32768-triangle collision source budget",
                );
            }
            let name = format!("mesh_{}", &recipe[..20]);
            let tag = format!(
                "scenery/spark_{}/{name}/{name}",
                &project.id.replace('-', "")[..12]
            );
            let (positions, normals) =
                checked_shape(&imported, object.scale, object.rotation, &asset.name)?;
            let mut jms = String::from("8200\n0\n1\nframe\n-1\n-1\n0\t0\t0\t1\n0\t0\t0\n");
            writeln!(jms, "{}", bindings.len()).unwrap();
            for shader in &bindings {
                writeln!(jms, "{shader}\n<none>").unwrap();
            }
            writeln!(jms, "0\n1\n__unnamed\n{}", positions.len()).unwrap();
            let mut bounds = [[f32::INFINITY; 3], [f32::NEG_INFINITY; 3]];
            let mut radius = 0f32;
            for (i, p) in positions.iter().enumerate() {
                for k in 0..3 {
                    bounds[0][k] = bounds[0][k].min(p[k]);
                    bounds[1][k] = bounds[1][k].max(p[k]);
                }
                radius = radius.max(p.iter().map(|v| v * v).sum::<f32>().sqrt());
                let n = normals[i];
                let uv = &imported.mesh.uvs[i * 2..i * 2 + 2];
                writeln!(
                    jms,
                    "0\n{:.6}\t{:.6}\t{:.6}\n{:.8}\t{:.8}\t{:.8}\n-1\n0\n{:.6}\n{:.6}\n0",
                    p[0] * 100.,
                    p[1] * 100.,
                    p[2] * 100.,
                    n[0],
                    n[1],
                    n[2],
                    uv[0],
                    uv[1]
                )
                .unwrap();
            }
            writeln!(jms, "{}", imported.mesh.indices.len() / 3).unwrap();
            for (slot, part) in imported.mesh.parts.iter().enumerate() {
                let slot = imported
                    .materials
                    .iter()
                    .position(|m| m == &part.name)
                    .ok_or_else(|| fail(format!("Unknown OBJ material group {slot}")))?;
                for t in imported.mesh.indices
                    [part.index_start..part.index_start + part.index_count]
                    .chunks_exact(3)
                {
                    writeln!(jms, "0\n{slot}\n{}\t{}\t{}", t[0], t[1], t[2]).unwrap();
                }
            }
            let jms_sha256 = format!("{:x}", Sha256::digest(jms.as_bytes()));
            models.push(Model {
                tag: tag.clone(),
                source: asset.path.clone(),
                source_sha256: asset.sha256.clone(),
                jms_sha256,
                jms,
                triangles: imported.mesh.indices.len() / 3,
                radius,
                bounds,
            });
            recipes.insert(recipe, tag.clone());
            tag
        };
        // Rotation and nonuniform scale are baked into BOTH native meshes. Halo
        // scenario placement uses the preserved origin, with unit transform.
        doc.placements.push(ForgePlacement {
            id: format!(
                "obj_{}",
                &format!("{:x}", Sha256::digest(object.id.as_bytes()))[..24]
            ),
            name: object.name.clone(),
            tag_id: None,
            tag_path: tag,
            tag_class: "scen".into(),
            source_project_id: None,
            source_sha256: None,
            position: object.position,
            rotation: [0.; 3],
            team: -1,
            respawn_seconds: 0,
            visible: object.visible,
            locked: false,
            published_asset_id: None,
        });
    }
    crate::quickforge::validate_document(&doc)?;
    Ok(Plan {
        document: doc,
        models,
    })
}
impl Plan {
    pub fn generated(&self) -> BTreeSet<String> {
        self.models
            .iter()
            .map(|m| format!("{}.scenery", m.tag))
            .collect()
    }
    pub fn export(&self, workspace: &Path) -> Result<()> {
        for model in &self.models {
            let folder = model.tag.rsplit_once('/').unwrap().0;
            for directory in ["models", "physics"] {
                project::atomic_write(
                    &workspace
                        .join("data")
                        .join(safe_relative(folder)?)
                        .join(directory)
                        .join("base superhigh.jms"),
                    model.jms.as_bytes(),
                    false,
                )?;
            }
        }
        if !self.models.is_empty() {
            project::atomic_write(
                &workspace.join("custom-model-sources.json"),
                &serde_json::to_vec_pretty(&self.models)?,
                false,
            )?;
        }
        Ok(())
    }
    pub(crate) fn compile(
        &self,
        workspace: &Path,
        tool: &Path,
        prefix: &[String],
        edit: &Path,
        runner: &Runner<'_>,
    ) -> Result<()> {
        let stage = workspace.join("tags");
        for model in &self.models {
            for ext in ["gbxmodel", "model_collision_geometry", "scenery"] {
                let p = stage.join(safe_relative(&format!("{}.{ext}", model.tag))?);
                crate::reject_links(&p)?;
                if p.exists() {
                    return invalid(
                        "Generated custom model namespace already exists; no tag is overwritten",
                    );
                }
            }
            let folder = model.tag.rsplit_once('/').unwrap().0.replace('/', "\\");
            for verb in ["model", "collision-geometry"] {
                let mut args = prefix.to_vec();
                args.extend([verb.into(), folder.clone()]);
                let log = runner.run(tool, &args, workspace, "custom-model", 24)?;
                if log.lines().any(|line| {
                    let s = line.to_ascii_lowercase();
                    s.contains("### error")
                        || s.contains("exception halt")
                        || s.contains("exception_breakpoint")
                }) {
                    return invalid(format!("Halo Tool rejected {verb} for {}. Review custom-model logs/WRL; original OBJ is unchanged",model.tag));
                }
            }
            for ext in ["gbxmodel", "model_collision_geometry"] {
                let p = stage.join(safe_relative(&format!("{}.{ext}", model.tag))?);
                crate::reject_links(&p)?;
                if !p.is_file() || fs::metadata(p)?.len() < 64 {
                    return invalid(
                        "Halo Tool did not generate complete custom render and collision tags",
                    );
                }
            }
            let tag = model.tag.replace('/', "\\");
            runner.run(
                edit,
                &[
                    "-t".into(),
                    stage.to_string_lossy().into_owned(),
                    "-N".into(),
                    "-S".into(),
                    "model".into(),
                    format!("{tag}.gbxmodel"),
                    "-S".into(),
                    "collision_model".into(),
                    format!("{tag}.model_collision_geometry"),
                    "-S".into(),
                    "bounding_radius".into(),
                    format!("{:.8}", model.radius + 0.01),
                    format!("{tag}.scenery"),
                ],
                workspace,
                "custom-scenery",
                24,
            )?;
        }
        Ok(())
    }
    pub fn verify_sources(&self) -> Result<()> {
        for model in &self.models {
            crate::reject_links(&model.source)?;
            if maps::hash_file(&model.source)? != model.source_sha256 {
                return invalid("Imported OBJ source changed during compilation; build rejected");
            }
        }
        Ok(())
    }
    pub fn verify_cache(&self, inspection: &maps::MapInspection, output: &Path) -> Result<()> {
        if self.models.is_empty() {
            return Ok(());
        }
        let (_, bytes, hash) = maps::read_cache_snapshot(output)?;
        if hash != inspection.sha256 {
            return invalid("Compiled content changed during custom model verification");
        }
        let mut evidence = Vec::new();
        for model in &self.models {
            let tag = inspection
                .tags
                .iter()
                .find(|t| {
                    t.class == "scen" && t.path.replace('\\', "/").eq_ignore_ascii_case(&model.tag)
                })
                .ok_or_else(|| fail("Compiled cache omits custom scenery tag"))?;
            let (_, mesh) = crate::render::object_model_mesh(
                &bytes,
                &inspection.header,
                &inspection.tags,
                tag.id,
                0,
            )?;
            let collision = crate::render::object_collision_mesh(
                &bytes,
                &inspection.header,
                &inspection.tags,
                tag.id,
            )?
            .ok_or_else(|| fail("Compiled custom scenery has no native collision"))?;
            if mesh.indices.len() / 3 != model.triangles || collision.indices.is_empty() {
                return invalid(
                    "Compiled custom render/collision geometry differs from imported source",
                );
            }
            for actual in [&mesh, &collision] {
                for k in 0..3 {
                    let lo = actual
                        .positions
                        .chunks_exact(3)
                        .map(|p| p[k])
                        .fold(f32::INFINITY, f32::min);
                    let hi = actual
                        .positions
                        .chunks_exact(3)
                        .map(|p| p[k])
                        .fold(f32::NEG_INFINITY, f32::max);
                    if (lo - model.bounds[0][k]).abs() > 0.002
                        || (hi - model.bounds[1][k]).abs() > 0.002
                    {
                        return invalid("Compiled custom model/collision bounds do not match the authored transform");
                    }
                }
            }
            for placement in self
                .document
                .placements
                .iter()
                .filter(|p| p.tag_path == model.tag)
            {
                if !inspection.objects.iter().any(|o| {
                    o.tag_id == Some(tag.id)
                        && o.position
                            .iter()
                            .zip(placement.position)
                            .all(|(a, b)| (a - b).abs() < 0.001)
                }) {
                    return invalid(
                        "Compiled scenario omits a custom asset placement or changed its position",
                    );
                }
            }
            evidence.push(serde_json::json!({"tag":model.tag,"sourceSha256":model.source_sha256,"jmsSha256":model.jms_sha256,"renderTriangles":mesh.indices.len()/3,"collisionTriangles":collision.indices.len()/3,"bounds":model.bounds}));
        }
        project::atomic_write(
            &output
                .parent()
                .unwrap()
                .join("custom-model-verification.json"),
            &serde_json::to_vec_pretty(&evidence)?,
            false,
        )?;
        Ok(())
    }
}

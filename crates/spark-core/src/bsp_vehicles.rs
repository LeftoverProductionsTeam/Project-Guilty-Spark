//! Preserve native multiplayer vehicle placements in the same staged donor import as pickups.
use crate::{
    bsp_assembly::{self, BspAssembly},
    bsp_audio::PlacementRegions,
    invalid,
    maps::{self, MapInspection, NativeVehicle},
    project::Project,
    Result, SparkError,
};
use std::{collections::BTreeMap, path::Path};

pub(crate) fn limit(cache_version: u32) -> usize {
    if cache_version == 13 { 256 } else { 80 }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedVehicles {
    base: Vec<NativeVehicle>,
    donor: Vec<NativeVehicle>,
    membership: Vec<bool>,
}

impl PreparedVehicles {
    pub(crate) fn donor_count(&self) -> usize { self.donor.len() }

    pub(crate) fn from_sources(
        project: &Project, base: &MapInspection, assembly: &BspAssembly, donor: &MapInspection,
        cache_version: u32, contains: impl Fn([f32; 3]) -> bool,
    ) -> Result<Self> {
        let source = project.source.as_ref()
            .ok_or_else(|| SparkError::Invalid("Missing native vehicle base source".into()))?;
        let mut base = maps::scenario_vehicles(&source.preserved_path, base)?;
        let donor = maps::scenario_vehicles(&assembly.donor_source.preserved_path, donor)?;
        for (index, row) in base.iter_mut().enumerate() {
            if let Some(item) = project.scene.iter().find(|item| item.id == format!("Vehicle-{index}")) {
                row.position = item.position;
                row.rotation = item.rotation;
            }
        }
        Self::from_rows(base, donor, assembly.translation, assembly.yaw_degrees, cache_version, contains)
    }

    pub(crate) fn from_rows(
        base: Vec<NativeVehicle>, mut donor: Vec<NativeVehicle>, translation: [f64; 3], yaw: f64,
        cache_version: u32, contains: impl Fn([f32; 3]) -> bool,
    ) -> Result<Self> {
        let total = base.len() + donor.len();
        let limit = limit(cache_version);
        if !donor.is_empty() && total > limit {
            return invalid(format!("This join needs {total} native vehicles. Cache version {cache_version} supports {limit}."));
        }
        let membership = donor.iter().map(|row| contains(row.position)).collect();
        for (index, row) in donor.iter_mut().enumerate() {
            if row.tag.is_none() || row.not_placed & !0x1f != 0 || row.unit_flags & !1 != 0
                || row.spawn_flags & !0x0f0f != 0
                || !(0. ..=1.).contains(&row.body_vitality)
                || (cache_version != 13 && row.appearance_player != 0)
            {
                return invalid(format!("Donor vehicle {} has unsupported native placement fields", index + 1));
            }
            let position = bsp_assembly::transform(row.position.map(f64::from), translation, yaw);
            if position.iter().any(|v| !v.is_finite() || v.abs() > 2048.) {
                return invalid(format!("Donor vehicle {} falls outside the supported world bounds", index + 1));
            }
            row.position = position.map(|v| v as f32);
            row.rotation[0] = bsp_assembly::transform_facing(row.rotation[0], yaw);
        }
        Ok(Self { base, donor, membership })
    }

    pub(crate) fn supported_donor_positions(&self) -> impl Iterator<Item = [f32; 3]> + '_ {
        self.donor.iter().zip(&self.membership).filter(|(_, inside)| **inside).map(|(row, _)| row.position)
    }

    pub(crate) fn set_staged_base(&mut self, rows: Vec<NativeVehicle>) {
        self.base = rows;
    }

    pub(crate) fn rows(&self) -> impl Iterator<Item = &NativeVehicle> {
        self.base.iter().chain(&self.donor)
    }

    pub(crate) fn roots(&self) -> impl Iterator<Item = String> + '_ {
        self.donor.iter().filter_map(|row| row.tag.clone())
    }

    pub(crate) fn append(
        &mut self, aliases: &BTreeMap<String, String>, cache_version: u32,
        run: impl Fn(Vec<String>) -> Result<String>,
    ) -> Result<()> {
        if self.donor.is_empty() { return Ok(()); }
        let count = |key: &str| -> Result<usize> {
            run(vec!["-C".into(), key.into()])?.parse()
                .map_err(|_| SparkError::Invalid(format!("Unreadable native {key} count")))
        };
        let array = |key: &str, field: &str| -> Result<Vec<String>> {
            let n = count(key)?;
            if n == 0 { return Ok(vec![]); }
            let raw = run(vec!["-G".into(), format!("{key}[*].{field}")])?;
            let values = raw.lines().map(str::to_owned).collect::<Vec<_>>();
            if values.len() != n { return invalid(format!("Unreadable native {key} values")); }
            Ok(values)
        };
        if count("vehicles")? != self.base.len() {
            return invalid("Staged native vehicles differ from the base cache");
        }
        let palette = array("vehicle_palette", "name")?;
        let names = array("object_names", "name")?;
        let mut staged_palette = palette.iter().enumerate().map(|(i, tag)| (tag.replace('\\', "/").to_ascii_lowercase(), i))
            .collect::<BTreeMap<_, _>>();
        let mut staged_names = names.iter().map(|name| name.to_ascii_lowercase()).collect::<std::collections::BTreeSet<_>>();
        let mut palette_count = palette.len();
        let mut name_count = names.len();
        let mut inserts = Vec::new();
        let mut palette_slots = Vec::with_capacity(self.donor.len());
        let mut name_slots = Vec::with_capacity(self.donor.len());
        for row in &mut self.donor {
            let source = row.tag.as_mut().expect("reviewed donor vehicle tag");
            if let Some(alias) = aliases.get(source) { source.clone_from(alias); }
            let slot = *staged_palette.entry(source.clone()).or_insert_with(|| {
                let slot = palette_count;
                palette_count += 1;
                insert(&mut inserts, "vehicle_palette", 1);
                set(&mut inserts, format!("vehicle_palette[{slot}].name"), source.replace('/', "\\"));
                slot
            });
            palette_slots.push(slot);
            let name_slot = if let Some(name) = &row.name {
                if !staged_names.insert(name.to_ascii_lowercase()) {
                    return invalid(format!("The donor vehicle name {name:?} already exists in this scenario"));
                }
                let slot = name_count;
                name_count += 1;
                insert(&mut inserts, "object_names", 1);
                set(&mut inserts, format!("object_names[{slot}].name"), name.clone());
                slot as i32
            } else { -1 };
            name_slots.push(name_slot);
        }
        let palette_limit = if cache_version == 13 { 256 } else { 100 };
        if palette_count > palette_limit || name_count > 512 {
            return invalid("Donor vehicles exceed the target vehicle palette or object names capacity");
        }
        insert(&mut inserts, "vehicles", self.donor.len());
        run(inserts)?;

        for (batch, rows) in self.donor.chunks(8).enumerate() {
            let mut args = Vec::new();
            for (offset, row) in rows.iter().enumerate() {
                let index = batch * 8 + offset;
                let prefix = format!("vehicles[{}]", self.base.len() + index);
                let mut field = |key: &str, value: String| set(&mut args, format!("{prefix}.{key}"), value);
                field("type", palette_slots[index].to_string());
                field("name", name_slots[index].to_string());
                field("position", vector(row.position));
                field("rotation", vector(row.rotation));
                field("desired_permutation", row.permutation.to_string());
                if cache_version == 13 && row.appearance_player != 0 {
                    field("appearance_player_index", (row.appearance_player as i8).to_string());
                }
                field("body_vitality", row.body_vitality.to_string());
                field("multiplayer_team_index", row.team.to_string());
                for (bit, key) in ["automatically", "on_easy", "on_normal", "on_hard", "use_player_appearance"].into_iter().enumerate() {
                    field(&format!("not_placed.{key}"), ((row.not_placed >> bit) & 1).to_string());
                }
                field("flags.dead", (row.unit_flags & 1).to_string());
                for (bit, mode) in ["slayer", "ctf", "king", "oddball"].into_iter().enumerate() {
                    field(&format!("multiplayer_spawn_flags.{mode}_default"), ((row.spawn_flags >> bit) & 1).to_string());
                    field(&format!("multiplayer_spawn_flags.{mode}_allowed"), ((row.spawn_flags >> (bit + 8)) & 1).to_string());
                }
            }
            run(args)?;
        }
        if count("vehicles")? != self.base.len() + self.donor.len() {
            return invalid("Native writer did not retain the reviewed vehicle count");
        }
        Ok(())
    }

    pub(crate) fn verify(&self, path: &Path, map: &MapInspection) -> Result<usize> {
        let actual = maps::scenario_vehicles(path, map)?;
        self.verify_rows(&actual)?;
        if !self.donor.is_empty() {
            let positions = actual[self.base.len()..].iter().map(|row| row.position);
            let (_, regions) = crate::bsp_audio::inspect_placement_regions(path, &map.sha256, positions)?;
            self.verify_membership(&actual[self.base.len()..], &regions)?;
        }
        Ok(self.donor.len())
    }

    pub(crate) fn verify_rows(&self, actual: &[NativeVehicle]) -> Result<()> {
        if actual.len() != self.base.len() + self.donor.len() || self.donor.len() != self.membership.len() {
            return invalid("Compiled native vehicle count differs from the reviewed inventory");
        }
        for (index, (a, b)) in actual.iter().zip(self.base.iter().chain(&self.donor)).enumerate() {
            if a.tag != b.tag || a.name != b.name || a.not_placed != b.not_placed || a.permutation != b.permutation
                || a.appearance_player != b.appearance_player || (a.body_vitality - b.body_vitality).abs() > 0.00002
                || a.unit_flags != b.unit_flags || a.team != b.team || a.spawn_flags != b.spawn_flags
                || a.position.iter().zip(b.position).any(|(x, y)| (*x - y).abs() > 0.0002)
                || a.rotation.iter().zip(b.rotation).any(|(x, y)| {
                    let angle = x - y;
                    angle.sin().atan2(angle.cos()).abs() > 0.00002
                })
            {
                return invalid(format!("Compiled vehicle {} differs from its reviewed native row", index + 1));
            }
        }
        Ok(())
    }

    fn verify_membership(&self, donor: &[NativeVehicle], regions: &PlacementRegions) -> Result<()> {
        let home = regions.len().checked_sub(1)
            .ok_or_else(|| SparkError::Invalid("Missing compiled vehicle region".into()))?;
        for (index, (row, originally_inside)) in donor.iter().zip(&self.membership).enumerate() {
            if *originally_inside && regions.unique_slot(row.position) != Some(home) {
                return invalid(format!("Donor vehicle {} lost its unique native BSP home", index + 1));
            }
        }
        Ok(())
    }
}

fn set(args: &mut Vec<String>, field: String, value: String) {
    args.extend(["-S".into(), field, value]);
}

fn insert(args: &mut Vec<String>, array: &str, count: usize) {
    args.extend(["-I".into(), array.into(), count.to_string(), "end".into()]);
}

fn vector(position: [f32; 3]) -> String {
    position.iter().map(f32::to_string).collect::<Vec<_>>().join(",")
}

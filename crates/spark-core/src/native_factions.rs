//! Forerunner's documented native faction controls/equipment profiles.
//! Uses the existing reviewed source writer; never grants inventory or edits originals.
use super::*;
// Parse each device's group references once, shared by faction and squad checks.
fn device_group_bindings(fields: &str) -> Result<Vec<(&'static str, u16, [i16; 2])>> {
    let mut result = vec![];
    for (array, class) in [("controls", "ctrl"), ("machines", "mach")] {
        let table = array_listing(fields, array)?;
        for (index, item) in array_items(&table, array)?.into_iter().enumerate() {
            let row = direct_struct_fields(item)?;
            result.push((
                class,
                u16::try_from(index).map_err(|_| {
                    crate::SparkError::Invalid("Native device index exceeds its field".into())
                })?,
                [
                    native_index(&row, "power_group")?,
                    native_index(&row, "position_group")?,
                ],
            ));
        }
    }
    Ok(result)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeFactionKit {
    pub faction: String,
    pub control_tag_path: String,
    pub position: [f32; 3],
    pub rotation_radians: [f32; 3],
    pub profile: crate::firefight::NativePlayerProfile,
}
impl NativeFactionKit {
    pub fn name(&self) -> String {
        format!("extraction_{}", self.faction)
    }
    pub fn validate(&self) -> Result<()> {
        if !["unsc", "covenant"].contains(&self.faction.as_str()) {
            return invalid("Choose a native UNSC or Covenant faction");
        }
        validate_hub_pose(&self.control_tag_path, self.position, self.rotation_radians)?;
        crate::firefight::native_equipment_profile_arguments(&self.profile, 0, &self.name())?;
        Ok(())
    }
}
fn named(fields: &str, array: &str) -> Result<Vec<String>> {
    array_items(&array_listing(fields, array)?, array)?
        .iter()
        .map(|row| native_name(&direct_struct_fields(row)?))
        .collect()
}
fn groups(fields: &str) -> Result<Vec<(String, f32, bool)>> {
    array_items(&array_listing(fields, "device_groups")?, "device_groups")?
        .iter()
        .map(|row| {
            let root = direct_struct_fields(row)?;
            let flat = root.lines().map(str::trim).collect::<Vec<_>>().join("\n");
            Ok((
                native_name(&root)?,
                number(&root, "initial_value")? as f32,
                number(&flat, "can_change_only_once")? != 0.,
            ))
        })
        .collect()
}
pub(super) fn validate_batch(kits: &[NativeFactionKit]) -> Result<()> {
    if kits.is_empty() || kits.len() > 2 {
        return invalid("Review one or both faction kits together");
    }
    let mut names = std::collections::BTreeSet::new();
    for kit in kits {
        kit.validate()?;
        if !names.insert(&kit.faction) {
            return invalid("Each faction can be appended once");
        }
    }
    Ok(())
}
#[derive(Clone)]
struct HubControl {
    name: String,
    control_tag_path: String,
    position: [f32; 3],
    rotation_radians: [f32; 3],
    readiness: bool,
}
impl From<&NativeFactionKit> for HubControl {
    fn from(kit: &NativeFactionKit) -> Self {
        Self {
            name: kit.name(),
            control_tag_path: kit.control_tag_path.clone(),
            position: kit.position,
            rotation_radians: kit.rotation_radians,
            readiness: false,
        }
    }
}
fn control_layout(
    fields: &str,
    kits: &[HubControl],
    added_profiles: usize,
) -> Result<(usize, usize, usize, usize, Vec<String>)> {
    let names = named(fields, "object_names")?;
    let controls = array_listing(fields, "controls")?;
    let palette = named(fields, "control_palette")?;
    let group = groups(fields)?;
    let profiles = named(fields, "player_starting_profile")?;
    if names.len() + kits.len() > 512
        || controls.count + kits.len() > 100
        || palette.len() > 100
        || group.len()
            + kits
                .iter()
                .map(|kit| 2 + usize::from(kit.readiness))
                .sum::<usize>()
            > 128
        || profiles.len() + added_profiles > 256
    {
        return invalid("Native hub append exceeds the reviewed classic scenario capacity");
    }
    for kit in kits {
        let name = kit.name.clone();
        if names
            .iter()
            .chain(&profiles)
            .any(|old| old.eq_ignore_ascii_case(&name))
            || group.iter().any(|(old, _, _)| {
                old.eq_ignore_ascii_case(&(name.clone() + "_power"))
                    || old.eq_ignore_ascii_case(&(name.clone() + "_position"))
                    || kit.readiness && old.eq_ignore_ascii_case(&(name.clone() + "_ready"))
            })
        {
            return invalid("A faction control/profile/group name already exists; preserve it and edit its source instead of appending duplicates");
        }
    }
    let mut palette = palette;
    for kit in kits {
        let reference = format!("{}.device_control", kit.control_tag_path.replace('\\', "/"));
        if !palette
            .iter()
            .any(|p| p.replace('\\', "/").eq_ignore_ascii_case(&reference))
        {
            palette.push(reference);
        }
    }
    if palette.len() > 100 {
        return invalid("Native control palette has no remaining capacity");
    }
    for array in ["controls", "machines"] {
        for row in array_items(&array_listing(fields, array)?, array)? {
            let root = direct_struct_fields(&row)?;
            for key in ["power_group", "position_group"] {
                let index = native_index(&root, key)?;
                if index >= 0 && index as usize >= group.len() {
                    return invalid("Resolve dangling original device-group references before appending hub groups");
                }
            }
        }
    }
    let volumes = scenario_volume_choices(fields)?;
    let hub = unique_volume(&volumes, "extraction_return")?;
    let field = unique_volume(&volumes, "extraction_zone")?;
    for kit in kits {
        if !hub.contains(kit.position) || field.contains(kit.position) {
            return invalid("Hub terminals must be inside the hub and outside activation");
        }
    }
    Ok((
        names.len(),
        controls.count,
        group.len(),
        profiles.len(),
        palette,
    ))
}
fn layout(
    fields: &str,
    kits: &[NativeFactionKit],
) -> Result<(usize, usize, usize, usize, Vec<String>)> {
    validate_batch(kits)?;
    control_layout(
        fields,
        &kits.iter().map(HubControl::from).collect::<Vec<_>>(),
        kits.len(),
    )
}
fn append_hub_controls(
    tags: &Path,
    tag: &str,
    before: &str,
    controls: &[HubControl],
    added_profiles: usize,
) -> Result<Vec<String>> {
    let (name, control, mut group, _, palette) = control_layout(before, controls, added_profiles)?;
    let old_palette = array_listing(before, "control_palette")?.count;
    let mut args = vec![
        "-t".into(),
        tags.to_string_lossy().into_owned(),
        "-n".into(),
    ];
    let insert = |args: &mut Vec<String>, array: &str| {
        args.extend(["-I".into(), array.into(), "1".into(), "end".into()])
    };
    let set =
        |args: &mut Vec<String>, key: String, value: String| args.extend(["-S".into(), key, value]);
    for (index, path) in palette.iter().enumerate().skip(old_palette) {
        insert(&mut args, "control_palette");
        set(
            &mut args,
            format!("control_palette[{index}].name"),
            path.clone(),
        );
    }
    for (index, entry) in controls.iter().enumerate() {
        insert(&mut args, "object_names");
        set(
            &mut args,
            format!("object_names[{}].name", name + index),
            entry.name.clone(),
        );
        for (offset, suffix, value) in [(0, "power", "1"), (1, "position", "0"), (2, "ready", "0")]
        {
            if offset == 2 && !entry.readiness {
                continue;
            }
            let key = group + offset;
            insert(&mut args, "device_groups");
            for (field, value) in [
                ("name", format!("{}_{suffix}", entry.name)),
                ("initial_value", value.into()),
                ("flags.can_change_only_once", "0".into()),
            ] {
                set(&mut args, format!("device_groups[{key}].{field}"), value);
            }
        }
        insert(&mut args, "controls");
        let key = format!("controls[{}]", control + index);
        let reference = format!(
            "{}.device_control",
            entry.control_tag_path.replace('\\', "/")
        );
        let palette_index = palette
            .iter()
            .position(|p| p.replace('\\', "/").eq_ignore_ascii_case(&reference))
            .unwrap();
        for (field, value) in [
            ("type", palette_index.to_string()),
            ("name", (name + index).to_string()),
            ("position", entry.position.map(|n| n.to_string()).join(",")),
            (
                "rotation",
                entry.rotation_radians.map(|n| n.to_string()).join(","),
            ),
            ("power_group", group.to_string()),
            ("position_group", (group + 1).to_string()),
            ("device_flags.initially_off", "0".into()),
        ] {
            set(&mut args, format!("{key}.{field}"), value);
        }
        group += 2 + usize::from(entry.readiness);
    }
    args.push(tag.into());
    Ok(args)
}
pub fn arguments(
    tags: &Path,
    tag: &str,
    before: &str,
    kits: &[NativeFactionKit],
) -> Result<Vec<String>> {
    validate_batch(kits)?;
    let mut args = append_hub_controls(
        tags,
        tag,
        before,
        &kits.iter().map(HubControl::from).collect::<Vec<_>>(),
        kits.len(),
    )?;
    args.pop();
    let profile = array_listing(before, "player_starting_profile")?.count;
    for (index, kit) in kits.iter().enumerate() {
        args.extend(crate::firefight::native_equipment_profile_arguments(
            &kit.profile,
            profile + index,
            &kit.name(),
        )?);
    }
    args.push(tag.into());
    Ok(args)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeFactionBody {
    pub faction: String,
    pub biped_tag_path: String,
    pub permutation: i16,
    #[serde(default, skip_serializing_if = "command_append_is_false")]
    pub include_first_person_arms: bool,
}

impl NativeFactionBody {
    fn name(&self) -> String { format!("extraction_{}_body", self.faction) }

    pub fn arms_path(&self) -> String { arms_path(&self.biped_tag_path) }

    pub fn validate(&self) -> Result<()> {
        if !["unsc", "covenant"].contains(&self.faction.as_str()) || self.permutation < -1
            || self.biped_tag_path.to_ascii_lowercase().ends_with(".biped")
        {
            return invalid("Choose a faction, native biped tag without its extension and a valid permutation");
        }
        if self.include_first_person_arms {
            validate_hub_pose(&self.arms_path(), [0.; 3], [0.; 3])?;
        }
        validate_hub_pose(&self.biped_tag_path, [0.; 3], [0.; 3])
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeFactionBodyBinding {
    pub biped_tag_path: String,
    pub permutation: i16,
    pub index: u16,
    pub name_index: u16,
    pub position: [f32; 3],
    #[serde(default, skip_serializing_if = "command_append_is_false")]
    pub first_person_arms: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeFactionSnapshot {
    pub kit: NativeFactionKit,
    pub control_index: u16,
    pub name_index: u16,
    pub profile_index: usize,
    pub power_group: i16,
    pub position_group: i16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<NativeFactionBodyBinding>,
}

pub(crate) fn arms_path(biped: &str) -> String {
    format!("{}_fp", biped.replace(char::from(92), "/"))
}

fn arms_palette_index(fields: &str, biped: &str) -> Result<(usize, bool)> {
    let palette = array_listing(fields, "scenery_palette")?;
    let path = arms_path(biped);
    let mut index = None;
    for (i, item) in array_items(&palette, "scenery_palette")?.iter().enumerate() {
        let tag = native_dependency_path(&direct_struct_fields(item)?, "name", "scenery")?;
        if tag.as_deref().is_some_and(|tag| tag.eq_ignore_ascii_case(&path)) && index.replace(i).is_some() {
            return invalid("The faction arms scenery carrier appears twice in the native palette");
        }
    }
    Ok((index.unwrap_or(palette.count), index.is_some()))
}

pub fn verify_arms_source(
    body: &NativeFactionBody, profile: &crate::firefight::NativePlayerProfile,
    mut read: impl FnMut(&str) -> Result<String>,
) -> Result<Vec<String>> {
    let path = body.arms_path();
    let carrier = format!("{path}.scenery");
    let model = format!("{path}.gbxmodel");
    let scenery = read(&carrier)?;
    if native_dependency_path(&scenery, "model", "gbxmodel")?.as_deref() != Some(&path) {
        return invalid(format!("{carrier} must point to {model}"));
    }
    let nodes = |fields: &str| -> Result<std::collections::BTreeSet<String>> {
        let list = array_listing(fields, "nodes")?;
        if !(1..=64).contains(&list.count) { return invalid("First-person arms and weapon graphs need 1–64 named nodes"); }
        let values = array_items(&list, "nodes")?.iter()
            .map(|item| native_name(&direct_struct_fields(item)?)).collect::<Result<std::collections::BTreeSet<_>>>()?;
        if values.len() != list.count || values.contains("") { return invalid("First-person model or animation graph has missing or duplicate nodes"); }
        Ok(values)
    };
    let model_nodes = nodes(&read(&model)?)?;
    let mut weapons = Vec::new();
    for path in std::iter::once(&profile.primary_weapon).chain(profile.secondary_weapon.iter()) {
        let weapon = format!("{path}.weapon");
        let fields = read(&weapon)?;
        let graph = native_dependency_path(&fields, "first_person_animations", "model_animations")?
            .ok_or_else(|| crate::SparkError::Invalid(format!("{weapon} has no first-person animation graph")))?;
        let graph_nodes = nodes(&read(&format!("{graph}.model_animations"))?)?;
        if let Some(node) = model_nodes.difference(&graph_nodes).next() {
            return invalid(format!("{weapon} cannot animate the selected arms. The graph has no node {node}"));
        }
        weapons.push(weapon);
    }
    Ok(weapons)
}

fn existing_body(fields: &str, names: &[String], faction: &str) -> Result<Option<NativeFactionBodyBinding>> {
    let name = format!("extraction_{faction}_body");
    let matching = names.iter().enumerate().filter(|(_, row)| row.eq_ignore_ascii_case(&name)).collect::<Vec<_>>();
    if matching.is_empty() { return Ok(None); }
    if matching.len() != 1 || matching[0].1 != &name { return invalid("Faction body name is ambiguous or incorrectly cased"); }
    let name_index = matching[0].0;
    let placement_block = array_listing(fields, "bipeds")?;
    let placements = array_items(&placement_block, "bipeds")?;
    let rows = placements.iter().map(|row| direct_struct_fields(row)).collect::<Result<Vec<_>>>()?;
    let mut found = None;
    for (index, row) in rows.iter().enumerate() {
        if native_index(row, "name")? != name_index as i16 { continue; }
        let (_, flags) = native_children(row, "not_placed", "bitmask", 5)?;
        if found.is_some() || !flags.iter().any(|(_, flag)| flag.split_whitespace().eq(["automatically", "(1)", "bitfield"])) {
            return invalid("Faction body needs exactly one nonautomatic native biped placement");
        }
        let palette_index = usize::try_from(native_index(row, "type")?).map_err(|_| crate::SparkError::Invalid("Faction biped placement has no palette entry".into()))?;
        let palette_block = array_listing(fields, "biped_palette")?;
        let palette = array_items(&palette_block, "biped_palette")?;
        let entry = palette.get(palette_index).ok_or_else(|| crate::SparkError::Invalid("Faction biped palette index is missing".into()))?;
        let biped_tag_path = native_dependency_path(&direct_struct_fields(entry)?, "name", "biped")?
            .ok_or_else(|| crate::SparkError::Invalid("Faction biped palette reference is null".into()))?;
        let permutation = native_index(row, "desired_permutation")?;
        let (_, first_person_arms) = arms_palette_index(fields, &biped_tag_path)?;
        let request = NativeFactionBody { faction: faction.into(), biped_tag_path, permutation, include_first_person_arms: first_person_arms };
        request.validate()?;
        let (position, _) = native_vector(row, "position")?;
        validate_hub_pose(&request.biped_tag_path, position, [0.; 3])?;
        found = Some(NativeFactionBodyBinding { biped_tag_path: request.biped_tag_path, permutation: request.permutation,
            index: index as u16, name_index: name_index as u16, position, first_person_arms });
    }
    found.map(Some).ok_or_else(|| crate::SparkError::Invalid("Faction body name does not bind to a native biped".into()))
}

struct BodyLayout {
    snapshots: Vec<NativeFactionSnapshot>,
    binding: NativeFactionBodyBinding,
    palette: usize,
    append_palette: bool,
    arms_palette: Option<usize>,
}

fn body_layout(fields: &str, body: &NativeFactionBody, replace_existing: bool) -> Result<BodyLayout> {
    body.validate()?;
    let snapshots = snapshots(fields)?;
    let kit = snapshots.iter().find(|row| row.kit.faction == body.faction)
        .ok_or_else(|| crate::SparkError::Invalid("Author the matching faction terminal and equipment profile first".into()))?;
    if kit.body.is_some() != replace_existing {
        return invalid(if replace_existing {
            "There is no faction body to rebind. Refresh the source review"
        } else {
            "This faction already has a named player body. Preview a rebind explicitly"
        });
    }

    let palette = named(fields, "biped_palette")?;
    let requested_path = body.biped_tag_path.replace('\\', "/");
    let reference = format!("{requested_path}.biped");
    let matches = palette.iter().enumerate().filter_map(|(index, entry)| {
        let path = entry.replace('\\', "/");
        path.eq_ignore_ascii_case(&reference).then_some((index, path))
    }).collect::<Vec<_>>();
    // Native CE scenario limits: 128 biped placements and 100 palette entries.
    if palette.len() + usize::from(matches.is_empty()) > 100 || matches.len() > 1 {
        return invalid("Faction biped exceeds native palette capacity or the reference is ambiguous");
    }
    let (palette_index, path) = match matches.first() {
        Some((index, path)) => (*index, path.strip_suffix(".biped").ok_or_else(|| {
            crate::SparkError::Invalid("Faction biped palette tag class is invalid".into())
        })?.to_owned()),
        None => (palette.len(), requested_path),
    };

    let (arms_index, arms_present) = arms_palette_index(fields, &path)?;
    let append_arms = body.include_first_person_arms && !arms_present;
    if append_arms && arms_index >= 100 {
        return invalid("Faction arms exceed the native scenery palette capacity");
    }
    let first_person_arms = arms_present || append_arms;
    let binding = if let Some(original) = &kit.body {
        if original.biped_tag_path.eq_ignore_ascii_case(&path) && original.permutation == body.permutation && !append_arms {
            return invalid("The faction body already uses this biped, permutation and arms binding");
        }
        NativeFactionBodyBinding { biped_tag_path: path, permutation: body.permutation, first_person_arms, ..original.clone() }
    } else {
        let names = array_listing(fields, "object_names")?.count;
        let bipeds = array_listing(fields, "bipeds")?.count;
        if names >= 512 || bipeds >= 128 {
            return invalid("Faction biped append exceeds native name or placement capacity");
        }
        NativeFactionBodyBinding {
            biped_tag_path: path,
            permutation: body.permutation,
            index: bipeds as u16,
            name_index: names as u16,
            position: kit.kit.position,
            first_person_arms,
        }
    };
    Ok(BodyLayout { snapshots, binding, palette: palette_index, append_palette: matches.is_empty(), arms_palette: append_arms.then_some(arms_index) })
}

pub fn body_arguments(tags: &Path, tag: &str, before: &str, body: &NativeFactionBody, replace_existing: bool) -> Result<Vec<String>> {
    let layout = body_layout(before, body, replace_existing)?;
    let binding = layout.binding;
    let mut args = vec!["-t".into(), tags.to_string_lossy().into_owned()];
    if !replace_existing {
        // Initial binding needs the guarded native name table unlock.
        args.push("-n".into());
        for array in ["object_names", "bipeds"] {
            args.extend(["-I".into(), array.into(), "1".into(), "end".into()]);
        }
    }
    if layout.append_palette {
        args.extend(["-I".into(), "biped_palette".into(), "1".into(), "end".into()]);
    }
    if layout.arms_palette.is_some() {
        args.extend(["-I".into(), "scenery_palette".into(), "1".into(), "end".into()]);
    }
    let mut set = |key: String, value: String| args.extend(["-S".into(), key, value]);
    if let Some(index) = layout.arms_palette {
        set(format!("scenery_palette[{index}].name"), format!("{}.scenery", arms_path(&binding.biped_tag_path)));
    }
    if layout.append_palette {
        set(format!("biped_palette[{}].name", layout.palette), format!("{}.biped", binding.biped_tag_path));
    }
    let row = format!("bipeds[{}]", binding.index);
    set(format!("{row}.type"), layout.palette.to_string());
    set(format!("{row}.desired_permutation"), binding.permutation.to_string());
    if !replace_existing {
        set(format!("object_names[{}].name", binding.name_index), body.name());
        set(format!("{row}.name"), binding.name_index.to_string());
        set(format!("{row}.not_placed.automatically"), "1".into());
        set(format!("{row}.position"), binding.position.map(|n| n.to_string()).join(","));
    }
    args.push(tag.into());
    Ok(args)
}

// Compare every exposed source cell except the two admitted scalar fields on
// this one existing biped. The compiled snapshot separately checks their values.
fn without_body_binding(fields: &str, index: usize) -> Result<String> {
    let array = array_listing(fields, "bipeds")?;
    let rows = array_items(&array, "bipeds")?;
    let target = rows.get(index)
        .ok_or_else(|| crate::SparkError::Invalid("Reviewed faction biped placement is missing".into()))?;
    let start = array.start + 1 + rows[..index].iter().map(|row| row.len()).sum::<usize>();
    let mut lines: Vec<_> = fields.lines().collect();
    for (prefix, masked) in [
        ("        type (", "        type (reviewed)"),
        ("        desired_permutation (", "        desired_permutation (reviewed)"),
    ] {
        let offsets: Vec<_> = target.iter().enumerate().filter_map(|(offset, line)| {
            line.starts_with(prefix).then_some(offset)
        }).collect();
        if offsets.len() != 1 {
            return invalid("Native faction biped binding field is missing or ambiguous");
        }
        lines[start + offsets[0]] = masked;
    }
    Ok(lines.join("\n"))
}

pub fn review_body(before: &str, after: &str, body: &NativeFactionBody, replace_existing: bool) -> Result<Vec<FieldDifference>> {
    let layout = body_layout(before, body, replace_existing)?;
    let palette_change = ("biped_palette", usize::from(layout.append_palette));
    let arms_change = ("scenery_palette", usize::from(layout.arms_palette.is_some()));
    let mut expected = layout.snapshots;
    let binding = layout.binding;
    let index = usize::from(binding.index);
    if replace_existing {
        transport::preserved_arrays(&without_body_binding(before, index)?, &without_body_binding(after, index)?, &[palette_change, arms_change])?;
    } else {
        transport::preserved_arrays(before, after, &[("object_names", 1), ("bipeds", 1), palette_change, arms_change])?;
    }
    let kit = expected.iter_mut().find(|row| row.kit.faction == body.faction).unwrap();
    let previous = kit.body.replace(binding.clone());
    if expected != snapshots(after)? {
        return invalid("Native body and matching profiles differ from the reviewed binding");
    }
    let describe = |binding: &NativeFactionBodyBinding| format!(
        "{} uses {} · permutation {} · biped index {} · dormant{}",
        body.name(), binding.biped_tag_path, binding.permutation, binding.index,
        if binding.first_person_arms { " · includes first-person arms" } else { "" },
    );
    Ok(vec![FieldDifference {
        before: previous.as_ref().map_or_else(|| format!("No {}", body.name()), describe),
        after: describe(&binding),
    }])
}
fn profile_from_fields(root: &str) -> Result<crate::firefight::NativePlayerProfile> {
    let count = |key: &str| -> Result<u16> {
        let value = number(root, key)?;
        if value.fract() != 0. || !(0.0..=32767.).contains(&value) {
            return invalid("Faction ammunition/grenade field is outside native bounds");
        }
        Ok(value as u16)
    };
    let profile = crate::firefight::NativePlayerProfile {
        primary_weapon: native_dependency_path(root, "primary_weapon", "weapon")?
            .ok_or_else(|| crate::SparkError::Invalid("Faction primary weapon is null".into()))?,
        secondary_weapon: native_dependency_path(root, "secondary_weapon", "weapon")?,
        primary_loaded: count("primary_rounds_loaded")?,
        primary_reserved: count("primary_rounds_reserved")?,
        secondary_loaded: count("secondary_rounds_loaded")?,
        secondary_reserved: count("secondary_rounds_reserved")?,
        health: number(root, "starting_health_modifier")? as f32,
        shields: number(root, "starting_shield_modifier")? as f32,
        fragmentation_grenades: u8::try_from(count("starting_fragmentation_grenade_count")?)
            .map_err(|_| crate::SparkError::Invalid("Invalid native grenade count".into()))?,
        plasma_grenades: u8::try_from(count("starting_plasma_grenade_count")?)
            .map_err(|_| crate::SparkError::Invalid("Invalid native grenade count".into()))?,
    };
    crate::firefight::native_equipment_profile_arguments(&profile, 0, "extraction_unsc")?;
    Ok(profile)
}
pub fn snapshots(fields: &str) -> Result<Vec<NativeFactionSnapshot>> {
    let names = named(fields, "object_names")?;
    let profiles = array_listing(fields, "player_starting_profile")?;
    let profile_items = array_items(&profiles, "player_starting_profile")?;
    let profile_names = profile_names(&profile_items)?;
    let devices = scenario_device_choices(fields)?;
    let bindings = device_group_bindings(fields)?;
    let control_items = array_listing(fields, "controls")?;
    let control_items = array_items(&control_items, "controls")?;
    let groups = groups(fields)?;
    let mut result = vec![];
    for faction in ["unsc", "covenant"] {
        let name = format!("extraction_{faction}");
        let named = names
            .iter()
            .enumerate()
            .filter(|(_, n)| n.eq_ignore_ascii_case(&name))
            .collect::<Vec<_>>();
        let profiles = profile_names
            .iter()
            .enumerate()
            .filter(|(_, n)| n.eq_ignore_ascii_case(&name))
            .collect::<Vec<_>>();
        let body = existing_body(fields, &names, faction)?;
        if named.is_empty() && profiles.is_empty() && body.is_none() {
            continue;
        }
        if named.len() != 1 || profiles.len() != 1 || *named[0].1 != name || *profiles[0].1 != name
        {
            return invalid("Faction control and equipment profile must be uniquely paired");
        }
        let rows = devices
            .iter()
            .filter(|d| d.class == "ctrl" && d.name == name)
            .collect::<Vec<_>>();
        if rows.len() != 1 {
            return invalid("Faction name must bind one native control");
        }
        let row = rows[0];
        let root =
            direct_struct_fields(control_items.get(row.index as usize).ok_or_else(|| {
                crate::SparkError::Invalid("Faction control index is missing".into())
            })?)?;
        let power = native_index(&root, "power_group")?;
        let position = native_index(&root, "position_group")?;
        for (index, value) in [(power, 1.), (position, 0.)] {
            let group = usize::try_from(index)
                .ok()
                .and_then(|i| groups.get(i))
                .ok_or_else(|| {
                    crate::SparkError::Invalid("Faction control groups are missing".into())
                })?;
            if group.1 != value || group.2 {
                return invalid("Faction groups must start powered/inactive and remain repeatable");
            }
        }
        if bindings.iter().any(|(class, index, groups)| {
            !(*class == "ctrl" && *index == row.index)
                && groups
                    .iter()
                    .any(|index| *index == power || *index == position)
        }) {
            return invalid("Faction groups must not be shared by another device");
        }
        let flat = root.lines().map(str::trim).collect::<Vec<_>>().join("\n");
        if number(&flat, "initially_off")? != 0. || power == position {
            return invalid(
                "Faction terminals need independent live power and inactive position groups",
            );
        }
        let kit = NativeFactionKit {
            faction: faction.into(),
            control_tag_path: row.tag_path.clone(),
            position: row.position,
            rotation_radians: row.rotation_radians,
            profile: profile_from_fields(&direct_struct_fields(profile_items[profiles[0].0])?)?,
        };
        kit.validate()?;
        result.push(NativeFactionSnapshot {
            kit,
            control_index: row.index,
            name_index: row.name_index as u16,
            profile_index: profiles[0].0,
            power_group: power,
            position_group: position,
            body,
        });
    }
    Ok(result)
}
pub fn reviewed(
    before: &str,
    after: &str,
    kits: &[NativeFactionKit],
) -> Result<Vec<FieldDifference>> {
    let (name, control, group, profile, palette) = layout(before, kits)?;
    transport::preserved_arrays(
        before,
        after,
        &[
            ("object_names", kits.len()),
            ("controls", kits.len()),
            ("device_groups", kits.len() * 2),
            ("player_starting_profile", kits.len()),
            (
                "control_palette",
                palette.len() - array_listing(before, "control_palette")?.count,
            ),
        ],
    )?;
    let actual = snapshots(after)?;
    let mut differences = vec![];
    for (index, kit) in kits.iter().enumerate() {
        let row = actual
            .iter()
            .find(|row| row.kit.faction == kit.faction)
            .ok_or_else(|| crate::SparkError::Invalid("Appended faction kit is missing".into()))?;
        if row.control_index as usize != control + index
            || row.name_index as usize != name + index
            || row.profile_index != profile + index
            || row.power_group as usize != group + index * 2
            || row.position_group as usize != group + index * 2 + 1
            || row.kit.control_tag_path.replace('\\', "/")
                != kit.control_tag_path.replace('\\', "/")
            || !positions_close(row.kit.position, kit.position)
            || row
                .kit
                .rotation_radians
                .iter()
                .zip(kit.rotation_radians)
                .any(|(a, b)| !facings_close(*a, b))
            || row.kit.profile != kit.profile
            || row.body.is_some()
        {
            return invalid(
                "Native faction output differs from the reviewed profile/control request",
            );
        }
        differences.push(FieldDifference{before:format!("No {} kit",kit.name()),after:format!("Append {} control/profile at {:?}; zero vitality modifiers; originals and indices retained",kit.name(),kit.position)});
    }
    Ok(differences)
}
pub fn verify_cache(
    expected: &[NativeFactionSnapshot],
    cache: &Path,
    map: &crate::maps::MapInspection,
) -> Result<()> {
    if expected.len() > 2 || map.header.scenario_type != 0 || map.header.version != 609 {
        return invalid("Faction kits need native CE609 solo output");
    }
    let read = crate::maps::scenario_logic_readback(cache, map)?;
    for row in expected {
        let actual = crate::maps::scenario_faction_body_readback(cache, map, &format!("{}_body", row.kit.name()))?;
        if actual != row.body { return invalid("Compiled native faction biped binding differs from source"); }
        row.kit.validate()?;
        crate::firefight::verify_native_equipment_profile(
            &row.kit.profile,
            &row.kit.name(),
            row.profile_index,
            map,
        )?;
        let name = read.names.get(row.name_index as usize).ok_or_else(|| {
            crate::SparkError::Invalid("Compiled faction name index is absent".into())
        })?;
        if name.name != row.kit.name()
            || name.object_type != 8
            || name.object_index != row.control_index as i16
        {
            return invalid("Compiled faction native name/type/index differs from reviewed source");
        }
        let devices = read
            .devices
            .iter()
            .filter(|d| {
                d.class == "ctrl"
                    && d.index == row.control_index as usize
                    && d.name_index == row.name_index as i16
            })
            .collect::<Vec<_>>();
        if devices.len() != 1
            || devices[0].tag_path.replace('\\', "/") != row.kit.control_tag_path.replace('\\', "/")
            || !positions_close(devices[0].position, row.kit.position)
            || devices[0]
                .rotation_radians
                .iter()
                .zip(row.kit.rotation_radians)
                .any(|(a, b)| !facings_close(*a, b))
            || devices[0].power_group != Some(row.power_group)
            || devices[0].position_group != Some(row.position_group)
        {
            return invalid("Compiled faction terminal pose/palette/groups differ from source");
        }
        if read.devices.iter().any(|other| {
            !(other.class == "ctrl" && other.index == row.control_index as usize)
                && [other.power_group, other.position_group]
                    .iter()
                    .flatten()
                    .any(|index| *index == row.power_group || *index == row.position_group)
        }) {
            return invalid(
                "Compiled faction control shares a power/position group with another device",
            );
        }
        for (index, value) in [(row.power_group, 1.), (row.position_group, 0.)] {
            let group = usize::try_from(index)
                .ok()
                .and_then(|i| read.groups.get(i))
                .ok_or_else(|| {
                    crate::SparkError::Invalid("Compiled faction device group is absent".into())
                })?;
            if group.initial_value != value || group.flags != 0 {
                return invalid("Compiled faction group startup/flags differ from reviewed source");
            }
        }
        let hub = unique_volume(&read.volumes, "extraction_return")?;
        let field = unique_volume(&read.volumes, "extraction_zone")?;
        if !hub.contains(row.kit.position) || field.contains(row.kit.position) {
            return invalid("Compiled faction terminal is outside its safe hub");
        }
    }
    Ok(())
}

pub fn validate_control_source(fields: &str) -> Result<()> {
    let (_, rows) = native_children(fields, "triggers_when", "enum", 2)?;
    let tokens = rows
        .iter()
        .map(|(_, text)| text.split_whitespace().collect::<Vec<_>>())
        .collect::<Vec<_>>();
    if tokens
        != [
            vec!["touched_by_player", "(*)", "enum", "value"],
            vec!["destroyed", "enum", "value"],
        ]
    {
        return invalid("Hub selection requires an actual touched-by-player control tag; source was not changed");
    }
    Ok(())
}

fn unique_volume<'a>(
    volumes: &'a [crate::maps::ScenarioLogicVolume],
    name: &str,
) -> Result<&'a crate::maps::ScenarioLogicVolumeGeometry> {
    let rows = volumes
        .iter()
        .filter(|v| v.name.eq_ignore_ascii_case(name))
        .collect::<Vec<_>>();
    if rows.len() != 1 || rows[0].name != name {
        return invalid(format!("Author one uniquely named native {name} volume"));
    }
    rows[0]
        .geometry
        .as_ref()
        .filter(|g| g.valid())
        .ok_or_else(|| {
            crate::SparkError::Invalid(format!(
                "Native {name} requires readable valid rotational geometry"
            ))
        })
}
/// Scalar reads from the independently extracted compiled control/scenario.
pub fn verify_control_values(trigger: &str, initially_off: &str) -> Result<()> {
    if trigger.trim().replace('_', " ") != "touched by player" || initially_off.trim() != "0" {
        return invalid("Compiled faction terminal is not touched-by-player and initially enabled");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn kit() -> NativeFactionKit {
        NativeFactionKit {
            faction: "unsc".into(),
            control_tag_path: "devices/terminal".into(),
            position: [1., 1., 1.],
            rotation_radians: [0.; 3],
            profile: crate::firefight::NativePlayerProfile {
                primary_weapon: "weapons/rifle".into(),
                primary_loaded: 30,
                primary_reserved: 90,
                secondary_weapon: None,
                secondary_loaded: 0,
                secondary_reserved: 0,
                health: 0.,
                shields: 0.,
                fragmentation_grenades: 1,
                plasma_grenades: 0,
            },
        }
    }
    #[test]
    fn faction_body_uses_signed_native_selection_and_requires_a_matching_kit() {
        let body = NativeFactionBody { faction: "covenant".into(), biped_tag_path: "characters/grunt/grunt".into(), permutation: -1, include_first_person_arms: false };
        let operation = Operation::FactionBody { body: body.clone(), replace_existing: false, source_sha256: "a".repeat(64) };
        let serialized = serde_json::to_value(&operation).unwrap();
        assert_eq!(serialized["body"]["permutation"], -1);
        assert_eq!(serde_json::from_value::<Operation>(serialized).unwrap(), operation);
        operation.validate("scnr", "test.scenario").unwrap();
        assert!(body_arguments(Path::new("owned"), "test.scenario", &before(), &body, false).is_err());
        assert!(NativeFactionBody { permutation: -2, ..body.clone() }.validate().is_err());
        assert!(NativeFactionBody { biped_tag_path: "../grunt".into(), ..body }.validate().is_err());
    }

    #[test]
    fn faction_arms_require_the_exact_carrier_model_and_each_weapon_graph_node() {
        let body = NativeFactionBody {
            faction: "covenant".into(), biped_tag_path: "owned/characters/elite".into(),
            permutation: -1, include_first_person_arms: true,
        };
        let profile = kit().profile;
        let review = |weapon_node: &str, carrier_model: &str| verify_arms_source(&body, &profile, |tag| {
            Ok(match tag {
                "owned/characters/elite_fp.scenery" => format!("model ({carrier_model}.gbxmodel) dependency"),
                "owned/characters/elite_fp.gbxmodel" => "nodes[1] array\n    nodes[0] struct\n        name (bip01 r hand) string".into(),
                "weapons/rifle.weapon" => "first_person_animations (weapons/rifle/fp.model_animations) dependency".into(),
                "weapons/rifle/fp.model_animations" => format!(
                    "nodes[1] array\n    nodes[0] struct\n        name ({weapon_node}) string"
                ),
                _ => return invalid("Unexpected native field lookup"),
            })
        });
        assert_eq!(review("bip01 r hand", "owned/characters/elite_fp").unwrap(), ["weapons/rifle.weapon"]);
        assert!(review("bip01 left hand", "owned/characters/elite_fp").unwrap_err().to_string().contains("bip01 r hand"));
        assert!(review("bip01 r hand", "owned/characters/other").unwrap_err().to_string().contains("must point"));
        let palette = "scenery_palette[1] array\n    scenery_palette[0] struct\n        name (owned/characters/elite_fp.scenery) dependency";
        assert_eq!(arms_palette_index(palette, &body.biped_tag_path).unwrap(), (0, true));
        assert_eq!(arms_palette_index(palette, "owned/characters/other").unwrap(), (1, false));
    }
    #[test]
    #[ignore = "Requires a disposable Black Echo tag tree and legally sourced Elite dependencies"]
    fn replace_faction_body_and_read_back_native_cache() {
        use std::path::PathBuf;
        use std::process::Command;

        let root = PathBuf::from(std::env::var_os("SPARK_BUILD_WORKSPACE").unwrap());
        let tags = PathBuf::from(std::env::var_os("SPARK_FACTION_QA_TAGS").unwrap());
        assert!(tags.canonicalize().unwrap().starts_with(root.canonicalize().unwrap()));
        let invader = PathBuf::from(std::env::var_os("SPARK_FACTION_QA_INVADER").unwrap());
        let cache = tags.parent().unwrap().join("elite.map");
        assert!(!cache.exists(), "The native test must write fresh output");
        let scenario = std::env::var("SPARK_FACTION_QA_SCENARIO").unwrap();
        let run = |tool: &str, args: &[String]| {
            let result = Command::new(invader.join(format!("{tool}.exe")))
                .args(args).output().unwrap();
            assert!(result.status.success(), "{tool}: {}", String::from_utf8_lossy(&result.stderr));
            String::from_utf8(result.stdout).unwrap()
        };

        let donor = PathBuf::from(std::env::var_os("SPARK_FACTION_QA_DONOR").unwrap());
        let elite = format!("{}/characters/elite/elite", std::env::var("SPARK_FACTION_QA_NAMESPACE").unwrap());
        assert!(donor.canonicalize().unwrap().starts_with(root.canonicalize().unwrap()));
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let runner = crate::build::Runner { id: "elite-body", project: "native-faction-qa",
            cancel: &cancel, event: &|_| {} };
        let inventory = crate::tool_transaction::inventory(&donor).unwrap().into_iter()
            .map(|(path, hash)| (path.replace(char::from(92), "/"), hash)).collect();
        let converted = crate::native_staging::convert_imported_pc_models(&donor, &inventory,
            &invader.join("invader-convert.exe"), &invader.join("invader-refactor.exe"),
            &invader.join("invader-edit.exe"), &runner, tags.parent().unwrap()).unwrap();
        assert!(converted.iter().any(|model| model.output == format!("{elite}.gbxmodel")));
        let tags_arg = tags.to_str().unwrap();
        let read = || run("invader-edit", &["-t".into(), tags_arg.into(), "-L".into(), scenario.clone()]);
        let before = read();
        let snapshots = super::snapshots(&before).unwrap();
        let old_body = snapshots.iter().find(|row| row.kit.faction == "covenant")
            .unwrap().body.as_ref().unwrap();
        assert!(old_body.biped_tag_path.contains("grunt"));
        let body = NativeFactionBody {
            faction: "covenant".into(),
            biped_tag_path: elite.clone(),
            permutation: old_body.permutation,
            include_first_person_arms: false,
        };
        assert!(body_arguments(&tags, &scenario, &before, &body, false).is_err());
        run("invader-edit", &body_arguments(&tags, &scenario, &before, &body, true).unwrap());
        let after = read();
        review_body(&before, &after, &body, true).unwrap();
        assert!(body_arguments(&tags, &scenario, &after, &body, true).is_err());
        let expected = super::snapshots(&after).unwrap();

        let banks = std::env::var("SPARK_FACTION_QA_BANKS").unwrap();
        run("invader-build", &[
            "-g".into(), "gbx-custom".into(), "-t".into(), tags_arg.into(), "-m".into(), banks,
            "-t".into(), donor.to_str().unwrap().into(), "-o".into(), cache.to_str().unwrap().into(),
            scenario.strip_suffix(".scenario").unwrap().into(),
        ]);
        let map = crate::maps::inspect_map(&cache, None).unwrap();
        verify_cache(&expected, &cache, &map).unwrap();
        let input = PathBuf::from(std::env::var_os("SPARK_FACTION_QA_PARENT").unwrap());
        let original = crate::maps::inspect_map(&input, None).unwrap();
        assert!(!original.scripts.is_empty(), "The baseline needs real HaloScript");
        let scripts = |readback: &crate::maps::MapInspection| readback.scripts.iter()
            .map(|script| (script.name.clone(), script.script_type, script.return_type)).collect::<Vec<_>>();
        assert_eq!(scripts(&original), scripts(&map), "Preserve original native script indices");
        let recovered = tags.parent().unwrap().join("independent");
        std::fs::create_dir(&recovered).unwrap();
        run("invader-extract", &["-t".into(), recovered.to_str().unwrap().into(), "-s".into(),
            scenario.clone(), cache.to_str().unwrap().into()]);
        let names = |root: &Path| run("invader-edit", &["-t".into(), root.to_str().unwrap().into(),
            "-G".into(), "scripts[*].name".into(), "-G".into(), "globals[*].name".into(), scenario.clone()]);
        assert_eq!(names(&tags), names(&recovered), "Independent script/global name and order readback");
        assert!(map.tags.iter().any(|tag| tag.path.replace(char::from(92), "/") == elite
            && tag.class == "bipd"));
        println!("Elite CE609 {} {}", std::fs::metadata(&cache).unwrap().len(),
            map.sha256);
    }
    fn before() -> String {
        let mut fields="object_names[1] array\n    object_names[0] struct\n        name (original) string\ncontrols[0] array\ncontrol_palette[0] array\ndevice_groups[0] array\nplayer_starting_profile[0] array\nmachines[0] array\ntrigger_volumes[2] array\n".replace("\\n","\n");
        for (index, name, x) in [(0, "extraction_return", 0), (1, "extraction_zone", 20)] {
            fields.push_str(&format!("    trigger_volumes[{index}] struct\n        type enum\n            fixed enum value\n            rotational (*) enum value\n        name ({name}) tagstring\n        rotation_vector_forward (1,0,0) vector3d\n        rotation_vector_up (0,0,1) vector3d\n        starting_corner ({x},0,0) point3d\n        ending_corner_offset (10,10,10) vector3d\n"));
        }
        fields
    }
    #[test]
    fn squad_terminals_append_isolated_gates_without_profiles_and_refuse_unsafe_source() {
        let first = NativeSquadTerminal {
            number: 1,
            control_tag_path: "devices/terminal".into(),
            position: [1., 1., 1.],
            rotation_radians: [0.; 3],
            readiness: false,
        };
        let second = NativeSquadTerminal {
            number: 2,
            readiness: true,
            ..first.clone()
        };
        let fields = before();
        let args = squad_arguments(
            Path::new("owned"),
            "test.scenario",
            &fields,
            &[first.clone(), second.clone()],
        )
        .unwrap();
        assert!(!args
            .iter()
            .any(|arg| arg.starts_with("player_starting_profile")));
        for pair in [
            ["object_names[1].name", "extraction_squad_01"],
            ["object_names[2].name", "extraction_squad_02"],
            ["device_groups[4].name", "extraction_squad_02_ready"],
            ["device_groups[4].initial_value", "0"],
            ["controls[1].power_group", "2"],
            ["controls[1].position_group", "3"],
        ] {
            assert!(args.windows(2).any(|w| w == pair));
        }
        assert!(squad_arguments(
            Path::new("owned"),
            "test.scenario",
            &fields,
            &[first.clone(), first.clone()]
        )
        .is_err());
        assert!(squad_arguments(
            Path::new("owned"),
            "test.scenario",
            &fields.replace("name (original)", "name (Extraction_Squad_01)"),
            &[first.clone()]
        )
        .is_err());
        assert!(squad_arguments(
            Path::new("owned"),
            "test.scenario",
            &fields.replace("controls[0] array", "controls[100] array"),
            &[first.clone()]
        )
        .is_err());
        for mut bad in [first.clone(), first.clone(), first.clone(), first.clone()]
            .into_iter()
            .enumerate()
        {
            match bad.0 {
                0 => bad.1.number = 23,
                1 => bad.1.position = [25., 1., 1.],
                2 => bad.1.control_tag_path = "../original".into(),
                _ => bad.1.rotation_radians[0] = f32::NAN,
            };
            assert!(
                squad_arguments(Path::new("owned"), "test.scenario", &fields, &[bad.1]).is_err()
            );
        }
        assert_eq!(fields, before(), "Review never mutates the caller's source");
    }
    #[test]
    fn actual_empty_native_dependencies_are_distinct_from_missing_or_duplicated_fields() {
        assert_eq!(
            native_dependency_path(
                "secondary_weapon     dependency",
                "secondary_weapon",
                "weapon"
            )
            .unwrap(),
            None
        );
        for source in [
            "",
            "secondary_weapon int16",
            "secondary_weapon dependency\nsecondary_weapon (weapons/rifle.weapon) dependency",
            "secondary_weapon dependency\nsecondary_weapon dependency",
        ] {
            assert!(native_dependency_path(source, "secondary_weapon", "weapon").is_err());
        }
    }
    #[test]
    fn equipment_profiles_reuse_writer_without_weakening_spawn_profiles() {
        let mut value = kit();
        let args =
            crate::firefight::native_equipment_profile_arguments(&value.profile, 1, &value.name())
                .unwrap();
        assert!(args
            .windows(2)
            .any(|w| w == ["player_starting_profile[1].starting_health_modifier", "0"]));
        assert!(crate::firefight::native_player_profile_arguments(
            &value.profile,
            1,
            "normal_start"
        )
        .is_err());
        for health in [0.1, f32::NAN] {
            value.profile.health = health;
            assert!(value.validate().is_err());
        }
        value = kit();
        value.profile.secondary_loaded = 1;
        assert!(value.validate().is_err());
        value = kit();
        value.profile.secondary_weapon = Some(value.profile.primary_weapon.clone());
        assert!(value.validate().is_err());
    }
    #[test]
    fn append_requires_real_hub_unique_names_and_native_capacity() {
        let value = kit();
        let source = before();
        let args = arguments(
            Path::new("owned"),
            "level.scenario",
            &source,
            &[value.clone()],
        )
        .unwrap();
        assert!(args.windows(3).any(|w| w == ["-I", "controls", "1"]));
        assert!(args.windows(2).any(|w| w == ["controls[0].name", "1"]));
        for changed in [
            source.replace("name (original)", "name (Extraction_UNSC)"),
            source.replace("name (extraction_zone)", "name (extraction_return)"),
            source.replace("device_groups[0] array", "device_groups[128] array"),
            source.replace("starting_corner (0,0,0)", "starting_corner (5,5,5)"),
        ] {
            assert!(arguments(
                Path::new("owned"),
                "level.scenario",
                &changed,
                &[value.clone()]
            )
            .is_err());
        }
        assert!(validate_batch(&[value.clone(), value.clone()]).is_err());
        let mut outside = value.clone();
        outside.position = [30., 1., 1.];
        assert!(arguments(Path::new("owned"), "level.scenario", &source, &[outside]).is_err());
        let mut unsafe_tag = value;
        unsafe_tag.control_tag_path = "../original".into();
        assert!(unsafe_tag.validate().is_err());
    }
    #[test]
    fn compiled_control_interaction_refuses_destroyed_disabled_and_ambiguous_reads() {
        verify_control_values("touched_by_player\n", "0\n").unwrap();
        for (a, b) in [
            ("destroyed", "0"),
            ("touched_by_player", "1"),
            ("touched_by_player\ndestroyed", "0"),
            ("touched_by_player", ""),
        ] {
            assert!(verify_control_values(a, b).is_err());
        }
        let listing =
            "triggers_when enum\n    touched_by_player (*) enum value\n    destroyed enum value\n";
        validate_control_source(listing).unwrap();
        assert!(validate_control_source(
            &listing
                .replace("touched_by_player (*)", "touched_by_player")
                .replace("destroyed enum", "destroyed (*) enum")
        )
        .is_err());
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeSquadTerminal {
    pub number: u8,
    pub control_tag_path: String,
    pub position: [f32; 3],
    pub rotation_radians: [f32; 3],
    #[serde(default)]
    pub readiness: bool,
}
impl NativeSquadTerminal {
    pub fn name(&self) -> String {
        format!("extraction_squad_{:02}", self.number)
    }
    pub fn validate(&self) -> Result<()> {
        if !(1..=22).contains(&self.number) {
            return invalid(
                "Choose native squad01–22; this interface range is not player-count acceptance",
            );
        }
        validate_hub_pose(&self.control_tag_path, self.position, self.rotation_radians)
    }
}
fn validate_hub_pose(tag: &str, position: [f32; 3], rotation: [f32; 3]) -> Result<()> {
    if tag.is_empty()
        || tag.len() > 230
        || tag.starts_with('-')
        || tag.ends_with(".device_control")
        || position.iter().any(|v| !v.is_finite() || v.abs() > 2048.)
        || rotation
            .iter()
            .any(|v| !v.is_finite() || v.abs() > std::f32::consts::TAU)
    {
        return invalid("Choose an existing native touched control and finite hub pose");
    }
    safe_relative(tag)?;
    Ok(())
}
impl From<&NativeSquadTerminal> for HubControl {
    fn from(row: &NativeSquadTerminal) -> Self {
        Self {
            name: row.name(),
            control_tag_path: row.control_tag_path.clone(),
            position: row.position,
            rotation_radians: row.rotation_radians,
            readiness: row.readiness,
        }
    }
}
pub fn validate_squad_batch(terminals: &[NativeSquadTerminal]) -> Result<()> {
    if terminals.is_empty() || terminals.len() > 22 {
        return invalid("Review1–22native squad terminals");
    }
    let mut seen = std::collections::BTreeSet::new();
    for terminal in terminals {
        terminal.validate()?;
        if !seen.insert(terminal.number) {
            return invalid("Each native squad terminal must have a unique number");
        }
    }
    Ok(())
}
pub fn squad_arguments(
    tags: &Path,
    tag: &str,
    before: &str,
    terminals: &[NativeSquadTerminal],
) -> Result<Vec<String>> {
    validate_squad_batch(terminals)?;
    append_hub_controls(
        tags,
        tag,
        before,
        &terminals.iter().map(HubControl::from).collect::<Vec<_>>(),
        0,
    )
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeSquadTerminalSnapshot {
    pub terminal: NativeSquadTerminal,
    pub control_index: u16,
    pub name_index: u16,
    pub power_group: i16,
    pub position_group: i16,
    pub ready_group: Option<i16>,
}

pub fn squad_snapshots(fields: &str) -> Result<Vec<NativeSquadTerminalSnapshot>> {
    let names = named(fields, "object_names")?;
    let devices = scenario_device_choices(fields)?;
    let bindings = device_group_bindings(fields)?;
    let control_items = array_listing(fields, "controls")?;
    let control_items = array_items(&control_items, "controls")?;
    let group = groups(fields)?;
    let volumes = scenario_volume_choices(fields)?;
    let mut result = vec![];
    let mut seen = std::collections::BTreeSet::new();
    for name in &names {
        let Some(digits) = name
            .to_ascii_lowercase()
            .strip_prefix("extraction_squad_")
            .map(str::to_owned)
        else {
            continue;
        };
        let n = digits
            .parse::<u8>()
            .ok()
            .filter(|n| (1..=22).contains(n))
            .ok_or_else(|| {
                crate::SparkError::Invalid(
                    "Native squad control name needs exact01–22 suffix".into(),
                )
            })?;
        if *name != format!("extraction_squad_{n:02}") || !seen.insert(n) {
            return invalid("Native squad controls need unique exact two-digit names");
        }
        let rows = devices
            .iter()
            .filter(|d| d.class == "ctrl" && d.name == *name)
            .collect::<Vec<_>>();
        if rows.len() != 1 {
            return invalid("Native squad name must bind exactly one live control");
        }
        let row = rows[0];
        let root =
            direct_struct_fields(control_items.get(row.index as usize).ok_or_else(|| {
                crate::SparkError::Invalid("Squad control index is missing".into())
            })?)?;
        let power = native_index(&root, "power_group")?;
        let position = native_index(&root, "position_group")?;
        let ready = group
            .iter()
            .enumerate()
            .filter(|(_, g)| g.0.eq_ignore_ascii_case(&format!("{name}_ready")))
            .collect::<Vec<_>>();
        if ready.len() > 1 {
            return invalid("Native squad readiness group is ambiguous");
        }
        let ready = ready.first().map(|(index, _)| *index as i16);
        checked_squad_groups(&bindings, &group, row, power, position, ready)?;
        let flat = root.lines().map(str::trim).collect::<Vec<_>>().join("\n");
        if number(&flat, "initially_off")? != 0. {
            return invalid("Squad terminal must start live");
        }
        let terminal = NativeSquadTerminal {
            number: n,
            control_tag_path: row.tag_path.clone(),
            position: row.position,
            rotation_radians: row.rotation_radians,
            readiness: ready.is_some(),
        };
        terminal.validate()?;
        if !unique_volume(&volumes, "extraction_return")?.contains(row.position)
            || unique_volume(&volumes, "extraction_zone")?.contains(row.position)
        {
            return invalid("Squad terminal must be inside the return hub and outside activation");
        }
        result.push(NativeSquadTerminalSnapshot {
            terminal,
            control_index: row.index,
            name_index: row.name_index as u16,
            power_group: power,
            position_group: position,
            ready_group: ready,
        });
    }
    Ok(result)
}

fn checked_squad_groups(
    bindings: &[(&str, u16, [i16; 2])],
    groups: &[(String, f32, bool)],
    row: &NativeDevicePlacement,
    power: i16,
    position: i16,
    ready: Option<i16>,
) -> Result<()> {
    if power == position || ready == Some(power) || ready == Some(position) {
        return invalid("Squad terminal groups must be independent");
    }
    for (index, suffix, value) in [
        (Some(power), "power", 1.),
        (Some(position), "position", 0.),
        (ready, "ready", 0.),
    ] {
        if let Some(index) = index {
            let actual = usize::try_from(index)
                .ok()
                .and_then(|i| groups.get(i))
                .ok_or_else(|| {
                    crate::SparkError::Invalid("Native squad group is missing".into())
                })?;
            if actual.0 != format!("{}_{suffix}", row.name) || actual.1 != value || actual.2 {
                return invalid(
                    "Squad groups need exact names, powered/inactive startup and repeatable flags",
                );
            }
            if bindings.iter().any(|(class, other, groups)| {
                !(*class == "ctrl" && *other == row.index) && groups.contains(&index)
            }) {
                return invalid("Squad groups cannot be shared by another native device");
            }
        }
    }
    Ok(())
}
pub fn reviewed_squads(
    before: &str,
    after: &str,
    terminals: &[NativeSquadTerminal],
) -> Result<Vec<FieldDifference>> {
    validate_squad_batch(terminals)?;
    let controls = terminals.iter().map(HubControl::from).collect::<Vec<_>>();
    let (name, control, mut group, _, palette) = control_layout(before, &controls, 0)?;
    transport::preserved_arrays(
        before,
        after,
        &[
            ("object_names", terminals.len()),
            ("controls", terminals.len()),
            (
                "device_groups",
                terminals.iter().map(|v| 2 + usize::from(v.readiness)).sum(),
            ),
            (
                "control_palette",
                palette.len() - array_listing(before, "control_palette")?.count,
            ),
        ],
    )?;
    let actual = squad_snapshots(after)?;
    let mut differences = vec![];
    for (index, terminal) in terminals.iter().enumerate() {
        let row = actual
            .iter()
            .find(|row| row.terminal.number == terminal.number)
            .ok_or_else(|| {
                crate::SparkError::Invalid("Appended squad terminal is missing".into())
            })?;
        if row.control_index as usize != control + index
            || row.name_index as usize != name + index
            || row.power_group as usize != group
            || row.position_group as usize != group + 1
            || row.ready_group != terminal.readiness.then_some((group + 2) as i16)
            || row.terminal.control_tag_path.replace('\\', "/")
                != terminal.control_tag_path.replace('\\', "/")
            || !positions_close(row.terminal.position, terminal.position)
            || row
                .terminal
                .rotation_radians
                .iter()
                .zip(terminal.rotation_radians)
                .any(|(a, b)| !facings_close(*a, b))
        {
            return invalid("Native squad output differs from the reviewed pose/control/groups");
        }
        differences.push(FieldDifference {
            before: format!("No {} terminal", terminal.name()),
            after: format!(
                "Append {} at {:?}; readiness gate {}; native source and indices retained",
                terminal.name(),
                terminal.position,
                terminal.readiness
            ),
        });
        group += 2 + usize::from(terminal.readiness);
    }
    Ok(differences)
}

impl NativeSquadTerminalSnapshot {
    pub fn validate(&self) -> Result<()> {
        self.terminal.validate()?;
        if self.control_index >= 100
            || self.name_index >= 512
            || !(0..128).contains(&self.power_group)
            || !(0..128).contains(&self.position_group)
            || self.power_group == self.position_group
            || self.ready_group.is_some() != self.terminal.readiness
            || self.ready_group.is_some_and(|g| {
                !(0..128).contains(&g) || g == self.power_group || g == self.position_group
            })
        {
            return invalid("Invalid native squad source snapshot");
        }
        Ok(())
    }
}
pub fn verify_squad_cache(
    expected: &[NativeSquadTerminalSnapshot],
    cache: &Path,
    map: &crate::maps::MapInspection,
) -> Result<()> {
    if expected.len() > 22
        || map.header.scenario_type != 0
        || map.header.version != 609
        || map.header.extended
    {
        return invalid("Squad terminals require standard CE609 solo output");
    }
    let read = crate::maps::scenario_logic_readback(cache, map)?;
    let mut seen = std::collections::BTreeSet::new();
    for row in expected {
        row.validate()?;
        if !seen.insert(row.terminal.number) {
            return invalid("Duplicate squad readback target");
        }
        let name = read
            .names
            .get(row.name_index as usize)
            .ok_or_else(|| crate::SparkError::Invalid("Compiled squad name is absent".into()))?;
        if name.name != row.terminal.name()
            || name.object_type != 8
            || name.object_index != row.control_index as i16
        {
            return invalid("Compiled squad name/type/index differs from source");
        }
        let devices = read
            .devices
            .iter()
            .filter(|device| {
                device.class == "ctrl"
                    && device.index == row.control_index as usize
                    && device.name_index == row.name_index as i16
            })
            .collect::<Vec<_>>();
        if devices.len() != 1 {
            return invalid("Compiled squad control binding is missing or ambiguous");
        }
        let device = devices[0];
        if device.tag_path.replace('\\', "/") != row.terminal.control_tag_path.replace('\\', "/")
            || !positions_close(device.position, row.terminal.position)
            || device
                .rotation_radians
                .iter()
                .zip(row.terminal.rotation_radians)
                .any(|(a, b)| !facings_close(*a, b))
            || device.power_group != Some(row.power_group)
            || device.position_group != Some(row.position_group)
        {
            return invalid("Compiled squad pose/reference/groups differ from source");
        }
        for (index, suffix, value) in [
            (Some(row.power_group), "power", 1.),
            (Some(row.position_group), "position", 0.),
            (row.ready_group, "ready", 0.),
        ] {
            if let Some(index) = index {
                let group = read.groups.get(index as usize).ok_or_else(|| {
                    crate::SparkError::Invalid("Compiled squad group is absent".into())
                })?;
                if group.name != format!("{}_{suffix}", row.terminal.name())
                    || group.initial_value != value
                    || group.flags != 0
                    || read
                        .groups
                        .iter()
                        .filter(|g| g.name.eq_ignore_ascii_case(&group.name))
                        .count()
                        != 1
                {
                    return invalid(
                        "Compiled squad group identity/startup/flags differ from source",
                    );
                }
                if read.devices.iter().any(|other| {
                    !(other.class == "ctrl" && other.index == row.control_index as usize)
                        && [other.power_group, other.position_group].contains(&Some(index))
                }) {
                    return invalid("Compiled squad group is shared by another device");
                }
            }
        }
        if !unique_volume(&read.volumes, "extraction_return")?.contains(device.position)
            || unique_volume(&read.volumes, "extraction_zone")?.contains(device.position)
        {
            return invalid("Compiled squad terminal is outside its safe hub");
        }
    }
    Ok(())
}

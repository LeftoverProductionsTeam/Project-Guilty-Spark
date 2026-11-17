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
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeFactionSnapshot {
    pub kit: NativeFactionKit,
    pub control_index: u16,
    pub name_index: u16,
    pub profile_index: usize,
    pub power_group: i16,
    pub position_group: i16,
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
        if named.is_empty() && profiles.is_empty() {
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

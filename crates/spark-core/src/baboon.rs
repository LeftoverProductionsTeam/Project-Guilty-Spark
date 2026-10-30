//! Source-aware integration with separately installed Baboon. No upstream parser,
//! definitions, executable or native tag extension is bundled with Spark.
use crate::{invalid, maps, reject_links, safe_relative, Result, SparkError};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Kit {
    pub game: &'static str,
    pub names: &'static [&'static str],
    pub flag: &'static str,
    pub family: &'static str,
}
pub const KITS: &[Kit] = &[
    Kit {
        game: "haloce_mcc",
        names: &["HCEEK", "H1EK"],
        flag: "-HCEEK",
        family: "halo1",
    },
    Kit {
        game: "halo2_mcc",
        names: &["H2EK"],
        flag: "-H2EK",
        family: "halo2",
    },
    Kit {
        game: "halo3_mcc",
        names: &["H3EK"],
        flag: "-H3EK",
        family: "halo3",
    },
    Kit {
        game: "halo3odst_mcc",
        names: &["H3ODSTEK"],
        flag: "-H3ODSTEK",
        family: "halo3Odst",
    },
    Kit {
        game: "haloreach_mcc",
        names: &["HREK"],
        flag: "-HREK",
        family: "haloReach",
    },
    Kit {
        game: "halo4_mcc",
        names: &["H4EK"],
        flag: "-H4EK",
        family: "halo4",
    },
    Kit {
        game: "halo2amp_mcc",
        names: &["H2AMPEK", "H2AEK"],
        flag: "-H2AMPEK",
        family: "halo2",
    },
];
pub fn kit(id: &str) -> Result<&'static Kit> {
    KITS.iter().find(|k|k.game==id || k.names.iter().any(|n|n.eq_ignore_ascii_case(id)))
        .ok_or_else(||SparkError::Invalid("This Baboon route requires supported loose MCC editing-kit tags; legacy compiled .map caches and game containers need a different workflow".into()))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DefinitionSet {
    file_count: usize,
    sha256: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    version: String,
    exe_sha256: String,
    release_url: String,
    definition_sets: BTreeMap<String, DefinitionSet>,
}
fn profile() -> &'static Profile {
    static PROFILE: OnceLock<Profile> = OnceLock::new();
    PROFILE.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../docs/fixtures/c37-baboon-profile.json"
        ))
        .expect("Reviewed Baboon release metadata")
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub directory: PathBuf,
    pub executable: PathBuf,
    pub executable_sha256: String,
    pub version: String,
    pub game: String,
    pub definition_files: BTreeMap<String, String>,
    pub definitions_sha256: String,
    pub release_url: String,
}
pub fn inspect(directory: &Path, game: &str) -> Result<Installation> {
    let kit = kit(game)?;
    reject_links(directory)?;
    let root = fs::canonicalize(directory)?;
    let executable = root.join("Baboon.exe");
    reject_links(&executable)?;
    let meta = fs::metadata(&executable)?;
    if !meta.is_file() || meta.len() > 128 * 1024 * 1024 {
        return invalid(
            "Select an ordinary installed Baboon.exe from the verified portable release",
        );
    }
    let executable_sha256 = maps::hash_file(&executable)?;
    if executable_sha256 != profile().exe_sha256 {
        return invalid(format!("This Baboon executable is not the reviewed Windows {} build. Set up the official verified release; an executable name alone does not establish compatibility",profile().version));
    }
    let expected = profile().definition_sets.get(kit.game).ok_or_else(|| {
        SparkError::Invalid("No verified Baboon definition set for this editing kit".into())
    })?;
    let definitions = root.join("definitions").join(kit.game);
    reject_links(&definitions)?;
    let mut files = BTreeMap::new();
    for entry in fs::read_dir(&definitions)? {
        let path = entry?.path();
        reject_links(&path)?;
        if path.extension().and_then(|p| p.to_str()) != Some("json") {
            continue;
        }
        if !path.is_file() || fs::metadata(&path)?.len() > 8 * 1024 * 1024 || files.len() >= 2048 {
            return invalid("Baboon definitions exceed the reviewed native schema bounds");
        }
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| SparkError::Invalid("Definition escaped its installation".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        safe_relative(&relative)?;
        files.insert(relative, maps::hash_file(&path)?);
    }
    let mut digest = Sha256::new();
    for (path, hash) in &files {
        digest.update(path.as_bytes());
        digest.update([0]);
        digest.update(hash.as_bytes());
        digest.update(b"\n");
    }
    let definitions_sha256 = format!("{:x}", digest.finalize());
    if files.len() != expected.file_count || definitions_sha256 != expected.sha256 {
        return invalid("Baboon's required definitions are missing or differ from the reviewed release. Restore its matching definitions folder before editing these tags");
    }
    Ok(Installation {
        directory: root,
        executable,
        executable_sha256,
        version: profile().version.clone(),
        game: kit.game.into(),
        definition_files: files,
        definitions_sha256,
        release_url: profile().release_url.clone(),
    })
}
fn copy_verified(input: &Path, output: &Path, hash: &str) -> Result<()> {
    reject_links(input)?;
    if maps::hash_file(input)? != hash {
        return invalid(
            "The installed Baboon package changed before the handoff; inspect it again",
        );
    }
    fs::create_dir_all(output.parent().unwrap())?;
    let mut target = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)?;
    std::io::copy(&mut fs::File::open(input)?, &mut target)?;
    drop(target);
    if maps::hash_file(output)? != hash {
        return invalid("Baboon portable instance did not match the verified installation");
    }
    Ok(())
}
/// Isolate per-map kit context and recovery state using Baboon's own documented
/// portable preference mode. Never repoint or overwrite the user's preferences.
pub fn prepare_instance(
    installation: &Installation,
    output: &Path,
    kit_root: &Path,
) -> Result<PathBuf> {
    let fresh = inspect(&installation.directory, &installation.game)?;
    if fresh.executable_sha256 != installation.executable_sha256
        || fresh.definitions_sha256 != installation.definitions_sha256
    {
        return invalid("Baboon installation changed after inspection");
    }
    reject_links(kit_root)?;
    let kit_root = fs::canonicalize(kit_root)?;
    if !kit_root.join("tags").is_dir() {
        return invalid("Prepare a complete isolated native tags folder before launching Baboon");
    }
    reject_links(
        output
            .parent()
            .ok_or_else(|| SparkError::Invalid("Missing portable instance parent".into()))?,
    )?;
    let parent = fs::canonicalize(output.parent().unwrap())?;
    if parent.starts_with(&installation.directory) || parent.starts_with(&kit_root) {
        return invalid(
            "The portable editor must be outside its installed package and native kit source tree",
        );
    }
    if output.exists() {
        return invalid("A portable Baboon instance already owns that folder; preserve it and create a fresh session");
    }
    fs::create_dir(output)?;
    let executable = output.join("Baboon.exe");
    copy_verified(
        &installation.executable,
        &executable,
        &installation.executable_sha256,
    )?;
    for (relative, hash) in &installation.definition_files {
        copy_verified(
            &installation.directory.join(safe_relative(relative)?),
            &output.join(safe_relative(relative)?),
            hash,
        )?;
    }
    let prefs = serde_json::json!({"first_run_complete":true,"check_updates_on_startup":false,"reopen_previous_session":false,"editing_kit_profiles":[{"id":"bab00000-0000-4000-8000-000000000000","name":"Spark working copy","game":installation.game,"root":kit_root,"read_only":false,"git_tracked":false}]});
    crate::project::atomic_write(
        &output.join("prefs.json"),
        &serde_json::to_vec_pretty(&prefs)?,
        false,
    )?;
    Ok(executable)
}
pub fn launch_arguments(game: &str, tags: &Path, tag: &Path) -> Result<Vec<String>> {
    let kit = kit(game)?;
    reject_links(tags)?;
    reject_links(tag)?;
    let tags = fs::canonicalize(tags)?;
    let tag = fs::canonicalize(tag)?;
    if !tag.starts_with(&tags)
        || !tag.is_file()
        || tag.extension().and_then(|p| p.to_str()) == Some("map")
    {
        return invalid("Baboon can open a supported loose tag inside this configured kit; a compiled cache is not a tag source");
    }
    let relative = tag
        .strip_prefix(&tags)
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    safe_relative(&relative)?;
    use std::io::Read;
    let mut header = [0u8; 64];
    fs::File::open(&tag)?.read_exact(&mut header)?;
    if &header[60..64] != b"blam" && &header[60..64] != b"BLAM" && &header[60..64] != b"MALB" {
        return invalid("Selected file has no supported native loose-tag header; extract/build a matching tag source first");
    }
    // Absolute paths fail closed if Baboon selects a different configured kit.
    // A relative weapon path also present in the SDK could open the SDK original.
    Ok(vec![kit.flag.into(), tag.to_string_lossy().into_owned()])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn kit_aliases_are_authoring_contexts_and_never_legacy_cache_or_game_protocols() {
        assert_eq!(kit("H1EK").unwrap().flag, "-HCEEK");
        assert_eq!(kit("H2AEK").unwrap().game, "halo2amp_mcc");
        for value in ["macDemo", "haloCustomEdition", "MCC", "unknown"] {
            assert!(kit(value).is_err());
        }
        assert_eq!(profile().version, "0.3.2");
        assert_eq!(profile().definition_sets["haloce_mcc"].file_count, 83);
    }
    #[test]
    fn launch_is_kit_contained_and_preserves_paths_with_spaces_as_one_argument() {
        let root = tempfile::tempdir().unwrap();
        let tags = root.path().join("tags");
        fs::create_dir(&tags).unwrap();
        let tag = tags.join("my pistol.weapon");
        let mut bytes = [0u8; 64];
        bytes[60..64].copy_from_slice(b"blam");
        fs::write(&tag, bytes).unwrap();
        let args = launch_arguments("HCEEK", &tags, &tag).unwrap();
        assert_eq!(args[0], "-HCEEK");
        assert_eq!(PathBuf::from(&args[1]), fs::canonicalize(&tag).unwrap());
        let cache = tags.join("test.map");
        fs::write(&cache, bytes).unwrap();
        assert!(launch_arguments("HCEEK", &tags, &cache).is_err());
        let outside = root.path().join("outside.weapon");
        fs::write(&outside, bytes).unwrap();
        assert!(launch_arguments("HCEEK", &tags, &outside).is_err());
        fs::write(tag, b"not a native tag").unwrap();
        assert!(launch_arguments("HCEEK", &tags, &tags.join("my pistol.weapon")).is_err());
    }
}

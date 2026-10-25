use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub steam_path: Option<PathBuf>,
    pub steam_executable: Option<PathBuf>,
    pub mcc_path: Option<PathBuf>,
    pub halo1_installed: bool,
    pub libraries: Vec<PathBuf>,
    pub editing_tools: Option<PathBuf>,
    pub manifest_path: Option<PathBuf>,
    pub running: bool,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug)]
pub enum Vdf {
    Text(String),
    Object(BTreeMap<String, Vdf>),
}
impl Vdf {
    pub fn get(&self, key: &str) -> Option<&Self> {
        match self {
            Self::Object(o) => o.get(key),
            _ => None,
        }
    }
    pub fn text(&self) -> Option<&str> {
        match self {
            Self::Text(s) => Some(s),
            _ => None,
        }
    }
}
pub fn parse_vdf(text: &str) -> Result<Vdf> {
    if text.len() > 4 * 1024 * 1024 {
        return invalid("VDF exceeds 4 MiB");
    }
    let chars: Vec<char> = text.chars().collect();
    let mut at = 0;
    let mut tokens = vec![];
    while at < chars.len() {
        let c = chars[at];
        if c.is_whitespace() {
            at += 1;
            continue;
        }
        if c == '/' && chars.get(at + 1) == Some(&'/') {
            while at < chars.len() && chars[at] != '\n' {
                at += 1;
            }
            continue;
        }
        if c == '{' || c == '}' {
            tokens.push(c.to_string());
            at += 1;
            continue;
        }
        let mut s = String::new();
        if c == '"' {
            at += 1;
            while at < chars.len() && chars[at] != '"' {
                if chars[at] == '\\' && chars.get(at + 1).is_some_and(|n| *n == '\\' || *n == '"') {
                    at += 1;
                }
                s.push(chars[at]);
                at += 1;
            }
            if at >= chars.len() {
                return invalid("Unterminated VDF string");
            }
            at += 1;
        } else {
            while at < chars.len()
                && !chars[at].is_whitespace()
                && chars[at] != '{'
                && chars[at] != '}'
            {
                s.push(chars[at]);
                at += 1;
            }
        }
        tokens.push(s);
        if tokens.len() > 200000 {
            return invalid("VDF token limit exceeded");
        }
    }
    fn object(tokens: &[String], at: &mut usize, depth: u8, nested: bool) -> Result<Vdf> {
        if depth > 32 {
            return invalid("VDF nesting exceeds 32");
        }
        let mut out = BTreeMap::new();
        while *at < tokens.len() {
            if tokens[*at] == "}" {
                if !nested {
                    return invalid("Unexpected VDF closing brace");
                }
                *at += 1;
                return Ok(Vdf::Object(out));
            }
            let key = tokens[*at].clone();
            *at += 1;
            let val = tokens
                .get(*at)
                .ok_or_else(|| crate::SparkError::Invalid("Missing VDF value".into()))?;
            *at += 1;
            let value = if val == "{" {
                object(tokens, at, depth + 1, true)?
            } else if val == "}" {
                return invalid("Missing VDF value before closing brace");
            } else {
                Vdf::Text(val.clone())
            };
            out.insert(key, value);
        }
        if nested {
            return invalid("Unclosed VDF object");
        }
        Ok(Vdf::Object(out))
    }
    object(&tokens, &mut 0, 0, false)
}
pub fn libraries(steam: &Path) -> Result<Vec<PathBuf>> {
    let mut out = vec![steam.to_path_buf()];
    let path = steam.join("steamapps/libraryfolders.vdf");
    if path.exists() {
        let v = parse_vdf(&fs::read_to_string(path)?)?;
        if let Some(Vdf::Object(entries)) = v.get("libraryfolders") {
            for (key, val) in entries {
                if key.parse::<u32>().is_ok() {
                    if let Some(s) = val.get("path").and_then(Vdf::text).or_else(|| val.text()) {
                        let p = PathBuf::from(s);
                        if !out.contains(&p) {
                            out.push(p);
                        }
                    }
                }
            }
        }
    }
    Ok(out)
}
pub fn mcc_in_library(library: &Path) -> Result<Option<PathBuf>> {
    let manifest = library.join("steamapps/appmanifest_976730.acf");
    if !manifest.is_file() {
        return Ok(None);
    }
    let v = parse_vdf(&fs::read_to_string(manifest)?)?;
    let state = v
        .get("AppState")
        .ok_or_else(|| crate::SparkError::Invalid("Missing AppState".into()))?;
    if state.get("appid").and_then(Vdf::text) != Some("976730") {
        return invalid("Steam app manifest has the wrong app ID");
    }
    let name = state
        .get("installdir")
        .and_then(Vdf::text)
        .ok_or_else(|| crate::SparkError::Invalid("MCC app manifest has no installdir".into()))?;
    let rel = crate::safe_relative(name)?;
    if rel.components().count() != 1 {
        return invalid("Steam installdir must be a single directory name");
    }
    let path = library.join("steamapps/common").join(rel);
    Ok(path.is_dir().then_some(path))
}

pub fn command(name: &str) -> Command {
    let mut c = Command::new(name);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    c
}
pub fn is_mcc_running() -> bool {
    #[cfg(windows)]
    {
        let output = command("tasklist.exe").args(["/FO", "CSV", "/NH"]).output();
        output
            .map(|r| {
                if !r.status.success() {
                    return true;
                }
                let s = String::from_utf8_lossy(&r.stdout).to_ascii_lowercase();
                [
                    "mcc-win64-shipping.exe",
                    "mcclauncher.exe",
                    "mccwinstore-win64-shipping.exe",
                ]
                .iter()
                .any(|n| s.contains(n))
            })
            .unwrap_or(true)
    }
    #[cfg(not(windows))]
    {
        if let Ok(o) = command("ps").args(["-A", "-o", "comm="]).output() {
            let s = String::from_utf8_lossy(&o.stdout).to_ascii_lowercase();
            return s.contains("mcc-win64") || s.contains("mcclauncher");
        }
        true
    }
}
pub fn discover(steam_override: Option<&Path>, mcc_override: Option<&Path>) -> Installation {
    let mut out = Installation::default();
    let mut candidates = vec![];
    if let Some(p) = steam_override {
        candidates.push(p.into());
    }
    #[cfg(windows)]
    {
        if let Ok(v) = command("reg.exe")
            .args(["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"])
            .output()
        {
            let s = String::from_utf8_lossy(&v.stdout);
            for line in s.lines() {
                if let Some((_, p)) = line.split_once("REG_SZ") {
                    candidates.push(PathBuf::from(p.trim()));
                }
            }
        }
        if let Some(p) = std::env::var_os("ProgramFiles(x86)") {
            candidates.push(PathBuf::from(p).join("Steam"));
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(h) = std::env::var_os("HOME") {
            let home = PathBuf::from(h);
            candidates.extend([
                home.join(".steam/steam"),
                home.join(".local/share/Steam"),
                home.join("Library/Application Support/Steam"),
            ]);
        }
    }
    for candidate in candidates {
        if candidate.join("steamapps").is_dir() {
            out.steam_path = Some(candidate.clone());
            out.steam_executable = if cfg!(windows) {
                candidate
                    .join("steam.exe")
                    .is_file()
                    .then(|| candidate.join("steam.exe"))
            } else {
                Some(PathBuf::from("steam"))
            };
            match libraries(&candidate) {
                Ok(list) => out.libraries = list,
                Err(e) => out.diagnostics.push(e.to_string()),
            }
            break;
        }
    }
    if let Some(p) = mcc_override {
        if p.join("halo1").is_dir() {
            out.mcc_path = Some(p.into());
        } else {
            out.diagnostics
                .push("Selected MCC folder does not contain halo1".into());
        }
    }
    if out.mcc_path.is_none() {
        for lib in &out.libraries {
            match mcc_in_library(lib) {
                Ok(Some(path)) => {
                    out.mcc_path = Some(path);
                    break;
                }
                Ok(None) => {}
                Err(e) => out.diagnostics.push(e.to_string()),
            }
        }
    }
    out.halo1_installed = out
        .mcc_path
        .as_ref()
        .is_some_and(|p| p.join("halo1/maps").is_dir());
    for lib in &out.libraries {
        let common = lib.join("steamapps/common");
        if let Ok(entries) = fs::read_dir(common) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_ascii_lowercase();
                if name.contains("halo")
                    && name.contains("editing")
                    && e.path().join("tool.exe").is_file()
                {
                    out.editing_tools = Some(e.path());
                }
            }
        }
    }
    #[cfg(windows)]
    {
        out.manifest_path = std::env::var_os("USERPROFILE")
            .map(|p| PathBuf::from(p).join("AppData/LocalLow/MCC/Config/ModManifest.txt"));
    }
    #[cfg(not(windows))]
    {
        out.diagnostics.push("MCC local registration is Windows-only; the editor and source tools are cross-platform.".into());
    }
    out.running = is_mcc_running();
    out
}
pub fn launch_steam(installation: &Installation) -> Result<()> {
    let steam = installation.steam_executable.as_ref().ok_or_else(|| {
        crate::SparkError::Invalid(
            "Steam was not found. Choose its installation folder in Settings.".into(),
        )
    })?;
    // Valve's normal app launch workflow. No undocumented launch-option indexes or EAC flags.
    command(steam.to_string_lossy().as_ref())
        .args(["-applaunch", "976730"])
        .spawn()?;
    Ok(())
}

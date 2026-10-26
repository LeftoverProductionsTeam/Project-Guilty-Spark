//! Historical Halo editors may work *beside* Spark, never as embedded dependencies.
//! All discovery is read-only, all launches opt-in, and no old tools ship with Spark.
use serde::{Deserialize, Serialize};
use spark_core::{maps, reject_links};
use std::{fs, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}, process::Command};

pub type Reply<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Registration {
    pub id: String,
    pub tool_id: String,
    pub format: String,
    pub path: PathBuf,
    pub executable_sha256: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct RuntimeCandidate {
    pub id: String,
    pub available: bool,
    pub detail: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct ToolOffer {
    pub id: &'static str,
    pub name: &'static str,
    pub historical_role: &'static str,
    pub preferred_format: &'static str,
    pub runtime_hint: String,
    pub runtime_detected: bool,
    pub registered: bool,
    pub installed: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct RegistrationStatus {
    pub id: String,
    pub tool_id: String,
    pub name: String,
    pub file_name: String,
    pub format: String,
    pub status: String,
    pub detail: String,
    pub runtime: String,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Dashboard {
    pub host_os: &'static str,
    pub host_arch: &'static str,
    pub runtimes: Vec<RuntimeCandidate>,
    pub catalog: Vec<ToolOffer>,
    pub registrations: Vec<RegistrationStatus>,
    pub discovery_scope: &'static str,
}

const CATALOG: &[(&str,&str,&str,&str)] = &[
    ("escha", "Eschaton", "Mac-era cache and tag experimentation", "mac-app"),
    ("hmt", "Halo Map Tools (HMT)", "Windows tag exploration and bitmap/model work", "windows-pe"),
    ("swordedit", "SwordEdit", "Mac-era 3D map and scenario placement", "mac-app"),
    ("sparkedit", "SparkEdit", "Windows-era visual scenario editing", "windows-pe"),
    ("guerilla", "Guerilla", "Halo Editing Kit tag authoring", "windows-pe"),
    ("sapien", "Sapien", "Halo Editing Kit scenario and mission editing", "windows-pe"),
    ("reclaimer", "Reclaimer", "Read and extract supported game asset data", "windows-pe"),
    ("custom", "Other user-owned Halo utility", "Registered external editor (not assessed by Spark)", "windows-pe"),
];
fn tool_name(tool: &str) -> Option<&'static str> {
    CATALOG.iter().find(|e| e.0==tool).map(|e|e.1)
}

// Only recognize standard system-managed locations; never execute an arbitrary PATH entry.
// The presence of Wine proves nothing about support for one particular application.
fn wine_candidate() -> Option<PathBuf> {
    if cfg!(target_os="windows") {return None;}
    for name in ["/usr/bin/wine", "/usr/local/bin/wine", "/opt/homebrew/bin/wine", "/usr/bin/wine64", "/usr/local/bin/wine64"] {
        let path=Path::new(name);
        if path.is_file() {
            if let Ok(actual)=fs::canonicalize(path) {
                if actual.is_file() { return Some(actual); }
            }
        }
    }
    None
}
fn runtime_for(format: &str) -> (String, bool, String) {
    match format {
        "windows-pe" if cfg!(target_os="windows") => ("Windows native".into(),true,"Windows PE loader present; application-specific compatibility untested".into()),
        "windows-pe" if wine_candidate().is_some() => ("Wine candidate".into(),true,"Wine found at a standard install location; legacy app compatibility untested".into()),
        "windows-pe" => ("Windows/Wine needed".into(),false,"No Windows native loader or verified standard-location Wine candidate; register a runtime separately outside Spark".into()),
        "mac-app" if cfg!(target_os="macos") => ("macOS native candidate".into(),true,"Only recognized 64-bit app bundles are eligible; Intel translation and application dependencies are unverified".into()),
        "mac-app" => ("macOS needed".into(),false,"A macOS .app is not executable on Windows or Linux via Wine".into()),
        _ => ("Unknown".into(),false,"Unsupported executable family".into()),
    }
}
fn forbidden_root(path: &Path, app_root: &Path) -> bool {
    match (fs::canonicalize(path), fs::canonicalize(app_root)) {
        (Ok(path),Ok(root)) => path.starts_with(root),
        _ => true,
    }
}
fn pe_kind(file: &Path) -> Reply<()> {
    let mut f=fs::File::open(file).map_err(err)?;
    let size=f.metadata().map_err(err)?.len();
    if size<96 || size>1024*1024*1024 {return Err("Windows executable has an invalid file size".into());}
    let mut head=[0u8;64]; f.read_exact(&mut head).map_err(err)?;
    if &head[0..2]!=b"MZ" {return Err("File is not a Windows executable (MZ missing)".into());}
    let off=u32::from_le_bytes(head[60..64].try_into().map_err(err)?) as u64;
    if off<64 || off.checked_add(24).map(|end|end>size).unwrap_or(true) || off>1024*1024 {
        return Err("Invalid Windows PE header pointer".into());
    }
    f.seek(SeekFrom::Start(off)).map_err(err)?;
    let mut signature=[0u8;24];f.read_exact(&mut signature).map_err(err)?;
    if &signature[0..4]!=b"PE\0\0" {return Err("DOS-only or malformed executable. A Windows PE binary is required".into());}
    let machine=u16::from_le_bytes([signature[4],signature[5]]);
    if !matches!(machine,0x14c|0x8664|0xaa64) {
        return Err("Windows executable architecture is unsupported by this companion workflow".into());
    }
    if cfg!(target_os="windows") {
        let match_host=match std::env::consts::ARCH {
            "x86_64" => matches!(machine,0x14c|0x8664),
            "x86" => machine==0x14c,
            "aarch64" => machine==0xaa64, // Do not assume x86 emulation is installed.
            _ => false,
        };
        if !match_host {return Err("This executable's PE architecture does not match the verified native host capability".into());}
    }
    Ok(())
}
// Inspect Mach-O CPU types without executing any code. Universal/fat slices
// must include at least one 64-bit Intel or Apple Silicon architecture.
// This does not establish Rosetta availability or required frameworks.
fn verify_macho_64(binary:&Path) -> Reply<()> {
    let mut f=fs::File::open(binary).map_err(err)?;
    let size=f.metadata().map_err(err)?.len();
    if size<32 || size>1024*1024*1024 {return Err("macOS executable is empty or unreasonably large".into());}
    let mut magic=[0u8;4]; f.read_exact(&mut magic).map_err(err)?;
    let mut word=[0u8;4]; f.read_exact(&mut word).map_err(err)?;
    let supported=|cpu:u32|cpu==0x01000007 || cpu==0x0100000c;
    let acceptable=match magic {
        [0xcf,0xfa,0xed,0xfe] => supported(u32::from_le_bytes(word)),
        [0xfe,0xed,0xfa,0xcf] => supported(u32::from_be_bytes(word)),
        [0xca,0xfe,0xba,0xbe] | [0xbe,0xba,0xfe,0xca] |
        [0xca,0xfe,0xba,0xbf] | [0xbf,0xba,0xfe,0xca] => {
            let big=matches!(magic,[0xca,0xfe,0xba,0xbe]|[0xca,0xfe,0xba,0xbf]);
            let fat64=matches!(magic,[0xca,0xfe,0xba,0xbf]|[0xbf,0xba,0xfe,0xca]);
            let count=if big {u32::from_be_bytes(word)} else {u32::from_le_bytes(word)};
            if count==0 || count>32 {return Err("Invalid universal Mach-O slice count".into());}
            let width=if fat64 {32u64} else {20u64};
            if 8+width*(count as u64)>size {return Err("Truncated universal Mach-O architecture table".into());}
            let mut found=false;
            for _ in 0..count {
                let mut arch=[0u8;4];f.read_exact(&mut arch).map_err(err)?;
                let cpu=if big {u32::from_be_bytes(arch)}else{u32::from_le_bytes(arch)};
                if supported(cpu){found=true;}
                f.seek(SeekFrom::Current(width as i64-4)).map_err(err)?;
            }
            found
        },
        _ => false,
    };
    if !acceptable {return Err("Only recognized Intel/ARM 64-bit Mach-O applications are eligible; 32-bit/PPC or unknown apps are refused".into());}
    Ok(())
}

fn mac_executable(bundle: &Path) -> Reply<PathBuf> {
    if bundle.extension().and_then(|s|s.to_str()).map(|s|!s.eq_ignore_ascii_case("app")).unwrap_or(true) || !bundle.is_dir() {
        return Err("Choose an installed .app bundle directory".into());
    }
    let binaries=bundle.join("Contents/MacOS");
    reject_links(&binaries).map_err(err)?;
    let mut candidates=vec![];
    for (i,entry) in fs::read_dir(&binaries).map_err(err)?.enumerate() {
        if i>=32 {return Err("Too many macOS bundle contents to identify one safe launch executable".into());}
        let file=entry.map_err(err)?.path();
        reject_links(&file).map_err(err)?;
        if file.is_file() {candidates.push(file);}
    }
    // Never guess which binary to launch in a multi-executable app.
    if candidates.len()!=1 {return Err("Cannot safely identify one main executable in this .app bundle".into());}
    let binary=&candidates[0];
    verify_macho_64(binary)?;
    Ok(binary.to_path_buf())
}
fn executable_for(path: &Path, format: &str, app_root: &Path) -> Reply<(PathBuf,PathBuf)> {
    reject_links(path).map_err(err)?;
    if forbidden_root(path,app_root) {return Err("A companion cannot execute from Spark's managed library, archive or Inbox".into());}
    let canonical=fs::canonicalize(path).map_err(err)?;
    let binary=match format {
        "windows-pe" => {
            if canonical.extension().and_then(|s|s.to_str()).map(|e|!e.eq_ignore_ascii_case("exe")).unwrap_or(true) {
                return Err("Select a Windows .exe application, not a script or document".into());
            }
            pe_kind(&canonical)?;canonical.clone()
        },
        "mac-app" => mac_executable(&canonical)?,
        _ => return Err("Unsupported companion format".into()),
    };
    reject_links(&binary).map_err(err)?;
    Ok((canonical,binary))
}
fn fingerprint(path:&Path,format:&str,app_root:&Path)->Reply<(PathBuf,String)> {
    let (canonical,binary)=executable_for(path,format,app_root)?;
    let sha=maps::hash_file(&binary).map_err(err)?;
    Ok((canonical,sha))
}
pub fn register(tool_id:&str,format:&str,path:PathBuf,app_root:&Path,registrations:&mut Vec<Registration>)->Reply<()> {
    if tool_name(tool_id).is_none() {return Err("Choose a recognized legacy companion category".into());}
    if registrations.len()>=20 {return Err("Maximum of 20 explicitly registered companion tools".into());}
    let (canonical,sha)=fingerprint(&path,format,app_root)?;
    if registrations.iter().any(|r|r.path==canonical) {return Err("This companion is already registered".into());}
    registrations.push(Registration {id:uuid::Uuid::new_v4().to_string(),tool_id:tool_id.to_owned(),format:format.to_owned(),path:canonical,executable_sha256:sha});
    Ok(())
}
pub fn status(reg:&Registration,app_root:&Path)->RegistrationStatus {
    let (runtime,available,runtime_detail)=runtime_for(&reg.format);
    let file_name=reg.path.file_name().map(|s|s.to_string_lossy().to_string()).unwrap_or_else(||"Unknown executable".into());
    let mut state="available-to-try".to_owned();
    let mut detail="Binary matches the registered SHA-256. Launch remains optional and compatibility unverified.".to_owned();
    if tool_name(&reg.tool_id).is_none() || !matches!(reg.format.as_str(),"mac-app"|"windows-pe") || reg.executable_sha256.len()!=64 {
        state="invalid-registration".into();detail="Unrecognized or corrupted registration".into();
    } else if !available {
        state="runtime-unavailable".into();detail=runtime_detail;
    } else {
        match fingerprint(&reg.path,&reg.format,app_root) {
            Ok((canonical,sha)) if canonical==reg.path && sha==reg.executable_sha256 => {},
            Ok(_) => {state="changed".into();detail="Installed executable changed since registration; re-register after review".into();},
            Err(e) => {state="unavailable".into();detail=format!("Executable cannot be verified: {e}");},
        }
    }
    RegistrationStatus {id:reg.id.clone(),tool_id:reg.tool_id.clone(),name:tool_name(&reg.tool_id).unwrap_or("Unknown").into(),file_name,format:reg.format.clone(),status:state,detail,runtime}
}
pub fn dashboard(regs:&[Registration],app_root:&Path)->Dashboard {
    let windows=runtime_for("windows-pe");
    let mac=runtime_for("mac-app");
    let runtimes=vec![
        RuntimeCandidate{id:"windows-pe".into(),available:windows.1,detail:windows.2},
        RuntimeCandidate{id:"mac-app".into(),available:mac.1,detail:mac.2},
    ];
    Dashboard {host_os:std::env::consts::OS,host_arch:std::env::consts::ARCH,runtimes,
        catalog:CATALOG.iter().map(|e|{
            let runtime=runtime_for(e.3);
            ToolOffer{id:e.0,name:e.1,historical_role:e.2,preferred_format:e.3,
                runtime_hint:runtime.2,runtime_detected:runtime.1,
                registered:regs.iter().any(|r|r.tool_id==e.0),
                // No user-wide scanning; only prior explicit registrations count as known installed.
                installed:regs.iter().filter(|r|r.tool_id==e.0).any(|r|status(r,app_root).status=="available-to-try") }
        }).collect(),
        registrations:regs.iter().map(|r|status(r,app_root)).collect(),
        discovery_scope:"Reports host runtime candidates and user-registered executables only. Does not scan private disks, install or download tools, or certify application compatibility."}
}
pub fn launch(reg:&Registration,app_root:&Path,explicit_consent:bool)->Reply<String> {
    if !explicit_consent {return Err("External launch requires an explicit user confirmation".into());}
    let state=status(reg,app_root);
    if state.status!="available-to-try" {return Err(format!("Launch refused: {}",state.detail));}
    let (path,_)=executable_for(&reg.path,&reg.format,app_root)?;
    let cwd=if path.is_file(){path.parent().ok_or("No application folder")?}else{path.parent().ok_or("No bundle folder")?};
    let mut command=match reg.format.as_str() {
        "windows-pe" if cfg!(target_os="windows") => Command::new(&path),
        "windows-pe" => {
            let wine=wine_candidate().ok_or("Wine runtime is no longer detected")?;
            let mut c=Command::new(wine);c.arg(&path);c
        },
        "mac-app" if cfg!(target_os="macos") => {
            let mut c=Command::new("/usr/bin/open");c.arg("-a").arg(&path);c
        },
        _ => return Err("This host cannot launch this companion format".into()),
    };
    // No shell, no user-supplied argv, no automatic game-file arguments or hidden downloads.
    let child=command.current_dir(cwd).spawn().map_err(err)?;
    Ok(format!("External launch request submitted (loader process {}). Actual app startup is unverified. Spark did not pass a Halo map to it; old apps may access files themselves, so use isolated copies.",child.id()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_malformed_binary_is_rejected() {
        let dir=tempfile::tempdir().unwrap();
        let app=dir.path().join("bad.exe");
        fs::write(&app,b"MZ").unwrap();
        assert!(pe_kind(&app).is_err());
        assert!(register("hmt","windows-pe",app,dir.path().parent().unwrap(),&mut vec![]).is_err());
    }
    #[test]
    fn arbitrary_tool_ids_and_formats_are_not_registered() {
        let dir=tempfile::tempdir().unwrap();
        let mut regs=vec![];
        assert!(register("command-prompt","windows-pe",dir.path().join("abc.exe"),dir.path(),&mut regs).is_err());
        assert!(register("hmt","shell-script",dir.path().join("abc.exe"),dir.path(),&mut regs).is_err());
        assert!(regs.is_empty());
    }
    #[test]
    fn unconfirmed_launch_is_never_attempted() {
        let reg=Registration{id:"test".into(),tool_id:"hmt".into(),format:"windows-pe".into(),path:PathBuf::from("/no/such/thing.exe"),executable_sha256:"0".repeat(64)};
        assert!(launch(&reg,Path::new("/tmp"),false).is_err());
    }
}

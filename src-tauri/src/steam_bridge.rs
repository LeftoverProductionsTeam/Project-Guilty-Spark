//! Optional out-of-process Steam module. Never loads a game DLL into Spark.
use serde::{Deserialize, Serialize};
use spark_core::{maps, reject_links};
use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    time::Duration,
};
type Reply<T> = Result<T, String>;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u32,
    sdk_version: String,
    app_id: u32,
    test_mode: bool,
    files: Vec<Member>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Member {
    name: String,
    sha256: String,
    bytes: u64,
}
pub fn validate(directory: &Path, pinned: Option<&str>) -> Reply<(PathBuf, String)> {
    reject_links(directory).map_err(|e| e.to_string())?;
    let directory = fs::canonicalize(directory).map_err(|e| e.to_string())?;
    let file = directory.join("spark-steam-module.json");
    reject_links(&file).map_err(|e| e.to_string())?;
    if fs::metadata(&file).map_err(|e| e.to_string())?.len() > 8192 {
        return Err("Steam module manifest is too large".into());
    }
    let hash = maps::hash_file(&file).map_err(|e| e.to_string())?;
    if pinned.is_some_and(|expected| expected != hash) {
        return Err("Steam module changed; choose and review its folder again".into());
    }
    let manifest: Manifest = serde_json::from_slice(&fs::read(&file).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if manifest.schema_version != 1
        || manifest.app_id != 480
        || !manifest.test_mode
        || manifest.sdk_version != "1.64"
        || manifest.files.len() != 2
    {
        return Err("Unsupported Steam test module".into());
    }
    for name in ["SparkSteamBridge.exe", "steam_api64.dll"] {
        let member = manifest
            .files
            .iter()
            .find(|entry| entry.name == name)
            .ok_or("Steam module is missing a required member")?;
        let file = directory.join(name);
        reject_links(&file).map_err(|e| e.to_string())?;
        if member.bytes == 0
            || member.bytes > 64 * 1024 * 1024
            || fs::metadata(&file).map_err(|e| e.to_string())?.len() != member.bytes
            || maps::hash_file(&file).map_err(|e| e.to_string())? != member.sha256
        {
            return Err("Steam module member failed its recorded content check".into());
        }
    }
    Ok((directory, hash))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ready {
    pub app_id: u32,
    pub steam_id: String,
    pub test_mode: bool,
    pub local_endpoint: Option<String>,
    pub steam_endpoint: String,
    pub relay_status: String,
}
pub struct Bridge {
    child: Mutex<Child>,
    pub ready: Ready,
}
impl Bridge {
    pub fn start(directory: &Path, pinned: &str, args: &[String]) -> Reply<Self> {
        let (directory, _) = validate(directory, Some(pinned))?;
        let mut command = Command::new(directory.join("SparkSteamBridge.exe"));
        command
            .args(args)
            .current_dir(&directory)
            .env("SteamAppId", "480")
            .env("SteamGameId", "480")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start the optional Steam module: {e}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Steam module output is unavailable")?;
        let (send, wait) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut seen = 0;
            for line in BufReader::new(stdout).lines().take(64) {
                let Ok(line) = line else { break };
                seen += line.len();
                if seen > 65536 {
                    break;
                }
                if let Some(json) = line.strip_prefix("SPARK_STEAM_READY ") {
                    let _ =
                        send.send(serde_json::from_str::<Ready>(json).map_err(|e| e.to_string()));
                    return;
                }
            }
        });
        let ready = match wait.recv_timeout(Duration::from_secs(20)) {
            Ok(Ok(ready)) if ready.app_id == 480 && ready.test_mode => ready,
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Steam test connection did not initialize. Sign into Steam and check the selected Spacewar module.".into());
            }
        };
        Ok(Self {
            child: Mutex::new(child),
            ready,
        })
    }
}
impl Drop for Bridge {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.stdin.take();
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.kill();
            }
            let _ = child.wait();
        }
    }
}

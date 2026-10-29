//! Short, temporary DOS alias for native compiler, extraction and rename filename buffers. Only the
//! exact mapping created here is removed. The owned job remains the data root.
#[cfg(windows)]
mod windows {
    use crate::{invalid, Result};
    use std::{
        path::{Path, PathBuf},
        sync::{Mutex, MutexGuard},
    };
    static LOCK: Mutex<()> = Mutex::new(());
    #[link(name = "kernel32")]
    extern "system" {
        fn DefineDosDeviceW(flags: u32, device: *const u16, target: *const u16) -> i32;
        fn QueryDosDeviceW(device: *const u16, target: *mut u16, length: u32) -> u32;
        fn GetLogicalDrives() -> u32;
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    fn query(device: &[u16]) -> Option<String> {
        let mut out = vec![0u16; 32768];
        let n = unsafe { QueryDosDeviceW(device.as_ptr(), out.as_mut_ptr(), out.len() as u32) };
        if n == 0 {
            return None;
        }
        let end = out.iter().position(|v| *v == 0).unwrap_or(n as usize);
        Some(String::from_utf16_lossy(&out[..end]))
    }
    /// Rebase only existing absolute arguments inside this owned job. External
    /// resource folders and non-path tool flags retain their original identity.
    pub(crate) fn extraction_arguments(args: &[String], workspace: &Path, alias: &Path) -> Result<Vec<String>> {
        let root = workspace.canonicalize()?;
        args.iter().map(|arg| {
            let path = Path::new(arg);
            if !path.is_absolute() { return Ok(arg.clone()); }
            let resolved = path.canonicalize()?;
            Ok(match resolved.strip_prefix(&root) {
                Ok(relative) => alias.join(relative).to_string_lossy().into_owned(),
                Err(_) => arg.clone(),
            })
        }).collect()
    }
    pub(crate) struct Alias {
        path: PathBuf,
        device: Vec<u16>,
        target: Vec<u16>,
        _lock: MutexGuard<'static, ()>,
    }
    impl Alias {
        pub(crate) fn new(workspace: &Path) -> Result<Self> {
            crate::reject_links(workspace)?;
            let canonical = workspace.canonicalize()?;
            let name = canonical.to_string_lossy();
            let target_name = format!("\\??\\{}", name.strip_prefix("\\\\?\\").unwrap_or(&name));
            let target = wide(&target_name);
            let lock = LOCK.lock().map_err(|_| {
                crate::SparkError::Invalid("Native workspace alias lock failed".into())
            })?;
            let drives = unsafe { GetLogicalDrives() };
            for letter in (b'P'..=b'Z').rev() {
                if drives & (1 << (letter - b'A')) != 0 {
                    continue;
                }
                let device = wide(&format!("{}:", letter as char));
                if query(&device).is_some() {
                    continue;
                }
                if unsafe { DefineDosDeviceW(0x1 | 0x8, device.as_ptr(), target.as_ptr()) } == 0 {
                    continue;
                }
                let alias = Self {
                    path: PathBuf::from(format!("{}:\\", letter as char)),
                    device,
                    target: target.clone(),
                    _lock: lock,
                };
                if query(&alias.device).as_deref() != Some(&target_name) {
                    return invalid("Native workspace alias readback differed");
                }
                return Ok(alias);
            }
            invalid("Native Halo tools need a free temporary drive letter P-Z to avoid filename limits; close an unused mapping and retry")
        }
        pub(crate) fn path(&self) -> &Path {
            &self.path
        }
    }
    impl Drop for Alias {
        fn drop(&mut self) {
            unsafe {
                DefineDosDeviceW(
                    0x1 | 0x2 | 0x4 | 0x8,
                    self.device.as_ptr(),
                    self.target.as_ptr(),
                );
            }
        }
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn alias_reads_owned_files_and_removes_only_its_mapping() {
            let dir = tempfile::tempdir().unwrap();
            std::fs::write(dir.path().join("owned.txt"), b"owned").unwrap();
            let alias = Alias::new(dir.path()).unwrap();
            assert_eq!(
                std::fs::read(alias.path().join("owned.txt")).unwrap(),
                b"owned"
            );
            let device = alias.device.clone();
            drop(alias);
            assert!(query(&device).is_none());
        }
        #[test]
        fn extraction_rebases_long_owned_paths_and_preserves_external_resources() {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().join("an owned workspace with spaces".repeat(4));
            std::fs::create_dir_all(root.join("tags")).unwrap();
            let input = root.join("original input.map");
            std::fs::write(&input,b"source").unwrap();
            let external = temp.path().join("classic resources");
            std::fs::create_dir(&external).unwrap();
            let alias=Alias::new(&root).unwrap();
            let args=vec!["-t".into(),root.join("tags").display().to_string(),"-m".into(),external.display().to_string(),"-O".into(),"-G".into(),input.display().to_string()];
            let actual=extraction_arguments(&args,&root,alias.path()).unwrap();
            assert_eq!(actual[1],alias.path().join("tags").display().to_string());
            assert_eq!(actual[3],args[3]);
            assert_eq!(&actual[4..6],&args[4..6]);
            assert_eq!(std::fs::read(&actual[6]).unwrap(),b"source");
            let long_tag="ui/shell/main_menu/settings_select/player_setup/player_profile_edit/controls_setup/advanced/horizontal_sensitivity_spinner.ui_widget_definition";
            let target=alias.path().join("tags").join(long_tag);
            assert!(root.join("tags").join(long_tag).as_os_str().len()>260);
            std::fs::create_dir_all(target.parent().unwrap()).unwrap();
            std::fs::write(&target,b"new owned tag").unwrap();
            assert_eq!(std::fs::read(root.canonicalize().unwrap().join("tags").join(long_tag)).unwrap(),b"new owned tag");
        }
    }
}
#[cfg(windows)]
pub(crate) use windows::{Alias,extraction_arguments};

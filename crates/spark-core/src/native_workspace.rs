//! Short, temporary DOS alias for native compiler and rename filename buffers. Only the
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
    }
}
#[cfg(windows)]
pub(crate) use windows::Alias;

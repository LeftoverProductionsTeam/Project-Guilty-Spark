pub mod archive;
pub mod assets;
pub mod audio;
pub mod binary;
pub mod bitmap_preview;
pub mod build;
pub mod creative;
pub mod forge_build;
pub mod firefight;
pub mod quickforge;
pub mod legacy;
pub mod library;
pub mod maps;
pub mod mcc;
pub mod multiplayer;
pub mod project;
pub mod render;
pub mod resource_map;
pub mod tag_exchange;
pub mod protocol;
pub mod runtime;
pub mod steam;

use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SparkError {
    #[error("{0}")]
    Invalid(String),
    #[error("Filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Library database error: {0}")]
    Database(#[from] rusqlite::Error),
}
pub type Result<T> = std::result::Result<T, SparkError>;
pub fn invalid<T>(message: impl Into<String>) -> Result<T> {
    Err(SparkError::Invalid(message.into()))
}

/// Existing paths must be free of symlinks/junctions. Check each component, not just the leaf.
pub fn reject_links(path: &Path) -> Result<()> {
    let absolute = std::path::absolute(path)?;
    let mut cursor = std::path::PathBuf::new();
    for part in absolute.components() {
        cursor.push(part);
        if let Ok(meta) = std::fs::symlink_metadata(&cursor) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return invalid(format!(
                        "Reparse points/junctions are not allowed for writes: {}",
                        cursor.display()
                    ));
                }
            }
            if meta.file_type().is_symlink() {
                return invalid(format!(
                    "Symbolic links are not allowed for writes: {}",
                    cursor.display()
                ));
            }
        }
    }
    Ok(())
}

pub fn safe_relative(value: &str) -> Result<std::path::PathBuf> {
    let normalized = value.replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.contains(':')
        || normalized.len() > 240
        || normalized.contains('\0')
    {
        return invalid("Expected a nonempty relative path without a drive or stream");
    }
    for part in normalized.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(['.', ' '])
            || part.contains(['<', '>', '"', '|', '?', '*'])
            || part.chars().any(char::is_control)
            || [
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ]
            .contains(&stem.as_str())
        {
            return invalid("Unsafe relative path component");
        }
    }
    Ok(std::path::PathBuf::from(normalized))
}

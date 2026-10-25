//! Capability model for future runtime bridges. No process-memory API or unconnected live controls.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
pub const PROTOCOL_VERSION: u32 = 1;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCapabilities {
    pub adapter: String,
    pub protocol_version: u32,
    pub session_id: String,
    pub map_sha256: String,
    pub operations: Vec<String>,
    pub multiplayer_ai: bool,
    pub openxr: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "camelCase")]
pub enum LiveCommand {
    SetObjectTransform {
        object_id: u32,
        position: [f32; 3],
        rotation: [f32; 3],
    },
    ResetEncounter {
        encounter: u16,
    },
}
pub fn validate(caps: &RuntimeCapabilities, map_sha256: &str, command: &LiveCommand) -> Result<()> {
    if caps.protocol_version != PROTOCOL_VERSION {
        return invalid("Runtime bridge protocol version mismatch");
    }
    if caps.session_id.is_empty() || caps.map_sha256 != map_sha256 {
        return invalid("Live command rejected: runtime map/session does not match the editor");
    }
    let operation = match command {
        LiveCommand::SetObjectTransform {
            position, rotation, ..
        } => {
            if position
                .iter()
                .chain(rotation.iter())
                .any(|v| !v.is_finite() || v.abs() > 1e6)
            {
                return invalid("Invalid live transform");
            }
            "setObjectTransform"
        }
        LiveCommand::ResetEncounter { .. } => "resetEncounter",
    };
    if !caps.operations.iter().any(|v| v == operation) {
        return invalid(format!("The runtime has not negotiated {operation}"));
    }
    Ok(())
}

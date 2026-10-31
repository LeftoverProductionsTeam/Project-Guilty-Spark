//! Bounded classic Custom Edition host configuration and native status decoding.
//! Editor synchronization and other games' multiplayer protocols are unrelated.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const MAX_STATUS_BYTES: usize = 32 * 1024;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GameType {
    Slayer,
    Ctf,
    Oddball,
    King,
    Race,
}
impl GameType {
    pub fn command(self) -> &'static str {
        match self {
            Self::Slayer => "slayer",
            Self::Ctf => "ctf",
            Self::Oddball => "oddball",
            Self::King => "king",
            Self::Race => "race",
        }
    }
    fn reported(self) -> &'static str {
        match self {
            Self::Ctf => "CTF",
            Self::King => "King",
            Self::Slayer => "Slayer",
            Self::Oddball => "Oddball",
            Self::Race => "Race",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBuild {
    pub project_id: String,
    pub build_id: String,
}
impl ProjectBuild {
    pub fn validate(&self) -> Result<()> {
        if uuid::Uuid::parse_str(&self.project_id).is_err()
            || uuid::Uuid::parse_str(&self.build_id).is_err()
        {
            return invalid("Select an owned project and its validated build");
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub map: String,
    pub map_sha256: String,
    pub executable_sha256: String,
    pub game_type: GameType,
    pub maximum_players: u8,
    /// Zero selects an available private port pair.
    pub port: u16,
    pub name: String,
    /// A native lookup key only. No remote/local output path is supplied by the UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_build: Option<ProjectBuild>,
}
pub fn map_selector(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 31
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        && crate::safe_relative(&format!("{value}.map")).is_ok()
}
fn hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
impl Request {
    pub fn validate(&self) -> Result<()> {
        if let Some(source) = &self.source_build {
            source.validate()?;
        }
        if !map_selector(&self.map) {
            return invalid(
                "Select an actual short native CE map name (letters, digits, underscore)",
            );
        }
        if !hash(&self.map_sha256) || !hash(&self.executable_sha256) {
            return invalid("Refresh the map and dedicated executable identities before starting");
        }
        if !(1..=16).contains(&self.maximum_players) {
            return invalid(
                "Classic Custom Edition supports a configured limit of 1 to 16 players",
            );
        }
        if self.port != 0 && !(1024..=65534).contains(&self.port) {
            return invalid("Choose a port from 1024 to 65534, or zero for automatic");
        }
        if self.name.is_empty()
            || self.name.len() > 31
            || self.name.trim() != self.name
            || !self
                .name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b" _-.".contains(&b))
        {
            return invalid(
                "Use a short server name with letters, digits, spaces, dots, dashes or underscores",
            );
        }
        Ok(())
    }
    pub fn configuration(&self) -> Result<String> {
        self.validate()?;
        // No arbitrary console input, public listing, RCON or remote tool command.
        Ok(format!(
            "sv_name \"{}\"\r\nsv_public false\r\nsv_maxplayers {}\r\nsv_log_enabled false\r\nsv_map {} {}\r\n",
            self.name, self.maximum_players, self.map, self.game_type.command()
        ))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub name: String,
    pub version: String,
    pub map: String,
    pub game_type: String,
    pub state: String,
    pub players: u8,
    pub maximum_players: u8,
    pub dedicated: bool,
}
impl Status {
    pub fn matches(&self, request: &Request) -> bool {
        self.dedicated
            && self.name == request.name
            && self.map == request.map
            && self
                .game_type
                .eq_ignore_ascii_case(request.game_type.reported())
            && self.maximum_players == request.maximum_players
            && self.state == "openplaying"
    }
}
pub fn parse_status(bytes: &[u8]) -> Result<Status> {
    if bytes.is_empty()
        || bytes.len() > MAX_STATUS_BYTES
        || bytes.iter().any(|b| *b < 32 || *b > 126)
    {
        return invalid(
            "Native CE status is empty, oversized or contains unsupported control characters",
        );
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| crate::SparkError::Invalid("Invalid status encoding".into()))?;
    let text = text
        .strip_prefix('\\')
        .ok_or_else(|| crate::SparkError::Invalid("Invalid CE status framing".into()))?;
    let mut fields = HashMap::new();
    let mut parts = text.split('\\');
    while let Some(key) = parts.next() {
        if key.is_empty() && parts.clone().next().is_none() {
            break;
        }
        let value = parts
            .next()
            .ok_or_else(|| crate::SparkError::Invalid("Truncated CE status field".into()))?;
        if key.is_empty() || fields.len() >= 1024 || fields.insert(key, value).is_some() {
            return invalid("CE status has duplicate or excessive fields");
        }
    }
    let get = |key: &str| -> Result<&str> {
        fields
            .get(key)
            .copied()
            .ok_or_else(|| crate::SparkError::Invalid(format!("CE status omitted {key}")))
    };
    let count = |key: &str| -> Result<u8> {
        get(key)?
            .parse::<u8>()
            .map_err(|_| crate::SparkError::Invalid("Invalid CE player count".into()))
    };
    let status = Status {
        name: get("hostname")?.into(),
        version: get("gamever")?.into(),
        map: get("mapname")?.into(),
        game_type: get("gametype")?.into(),
        state: get("gamemode")?.into(),
        players: count("numplayers")?,
        maximum_players: count("maxplayers")?,
        dedicated: get("dedicated")? == "1",
    };
    if !map_selector(&status.map)
        || !(1..=16).contains(&status.maximum_players)
        || status.players > status.maximum_players
        || status.name.len() > 63
        || status.version.len() > 31
        || status.game_type.len() > 39
        || status.state.len() > 31
        || !matches!(get("dedicated")?, "0" | "1")
    {
        return invalid("CE status exceeds the classic engine's supported limits");
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Request {
        Request {
            map: "bloodgulch".into(),
            map_sha256: "a".repeat(64),
            executable_sha256: "b".repeat(64),
            game_type: GameType::Slayer,
            maximum_players: 2,
            port: 0,
            name: "Spark private".into(),
            source_build: None,
        }
    }
    const STATUS: &[u8] = br"\hostname\Spark private\gamever\01.00.10.0621\mapname\bloodgulch\dedicated\1\gamemode\openplaying\numplayers\0\maxplayers\2\gametype\Slayer\final\\queryid\1.1";
    #[test]
    fn project_build_selection_accepts_ids_only_and_rejects_paths() {
        let mut value = request();
        value.source_build = Some(ProjectBuild {
            project_id: uuid::Uuid::new_v4().to_string(),
            build_id: uuid::Uuid::new_v4().to_string(),
        });
        assert!(value.validate().is_ok());
        let mut encoded = serde_json::to_value(&value).unwrap();
        encoded["sourceBuild"]["output"] = "C:/unowned/map.map".into();
        assert!(serde_json::from_value::<Request>(encoded).is_err());
        value.source_build.as_mut().unwrap().build_id = "../other".into();
        assert!(value.validate().is_err());
    }
    #[test]
    fn real_native_status_shape_requires_a_matching_running_game() {
        let mut status = parse_status(STATUS).unwrap();
        assert!(status.matches(&request()));
        assert_eq!(status.players, 0); // A loaded map does not prove a client joined.
        status.map = "sidewinder".into();
        assert!(!status.matches(&request()));
        status.map = "bloodgulch".into();
        status.state = "loading".into();
        assert!(!status.matches(&request()));
    }
    #[test]
    fn malformed_duplicate_oversized_and_impossible_statuses_refuse() {
        for bytes in [
            b"not status".to_vec(),
            b"\\hostname".to_vec(),
            [STATUS, br"\numplayers\1"].concat(),
            [STATUS, b"\n"].concat(),
            vec![b'x'; MAX_STATUS_BYTES + 1],
            String::from_utf8_lossy(STATUS)
                .replace("\\numplayers\\0", "\\numplayers\\3")
                .into_bytes(),
        ] {
            assert!(parse_status(&bytes).is_err());
        }
    }
    #[test]
    fn only_bounded_private_configuration_is_generated() {
        let text = request().configuration().unwrap();
        assert!(text.contains("sv_public false\r\n"));
        assert!(text.ends_with("sv_map bloodgulch slayer\r\n"));
        for name in ["bad\nquit", "name\";quit", "\\\\host", "", " trailing "] {
            let mut r = request();
            r.name = name.into();
            assert!(r.configuration().is_err());
        }
        for map in ["../bloodgulch", "maps/bloodgulch", "bloodgulch;quit", "con"] {
            let mut r = request();
            r.map = map.into();
            assert!(r.configuration().is_err());
        }
        for players in [0, 17, 128] {
            let mut r = request();
            r.maximum_players = players;
            assert!(r.validate().is_err());
        }
        let mut r = request();
        r.port = 65535;
        assert!(r.validate().is_err());
        r.port = 1023;
        assert!(r.validate().is_err());
        r.port = 2302;
        r.map_sha256.clear();
        assert!(r.validate().is_err());
    }
}

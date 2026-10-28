use crate::{
    forge_session::{private_endpoint, GameBinding, PROTOCOL_VERSION},
    invalid, Result,
};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Transport {
    Lan,
    SteamSpacewar,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Invite {
    pub schema_version: u32,
    pub session_id: String,
    pub transport: Transport,
    pub endpoint: String,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game: Option<GameBinding>,
}
pub fn steam_endpoint(value: &str) -> Result<(u64, u32)> {
    let Some(rest) = value.strip_prefix("steam:") else {
        return invalid("Expected a Spark Steam endpoint");
    };
    let Some((id, channel)) = rest.split_once(':') else {
        return invalid("Steam endpoint needs an identity and channel");
    };
    let id: u64 = id
        .parse()
        .map_err(|_| crate::SparkError::Invalid("Invalid Steam identity".into()))?;
    let channel: u32 = channel
        .parse()
        .map_err(|_| crate::SparkError::Invalid("Invalid Steam channel".into()))?;
    if id >> 56 != 1
        || (id >> 52) & 15 != 1
        || (id >> 32) & 0xfffff != 1
        || id as u32 == 0
        || !(1..=65535).contains(&channel)
    {
        return invalid("Use a public individual Steam identity and a Spark session channel");
    }
    Ok((id, channel))
}
impl Invite {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != PROTOCOL_VERSION
            || uuid::Uuid::parse_str(&self.session_id).is_err()
            || self.key.len() != 32
            || !self.key.bytes().all(|b| b.is_ascii_hexdigit())
            || self.endpoint.len() > 128
        {
            return invalid("Invalid or incompatible Spark session invite");
        }
        match self.transport {
            Transport::Lan => {
                private_endpoint(&self.endpoint)?;
            }
            Transport::SteamSpacewar => {
                steam_endpoint(&self.endpoint)?;
            }
        }
        if let Some(game) = &self.game {
            game.validate()?;
        }
        Ok(())
    }
    pub fn encode(&self) -> Result<String> {
        self.validate()?;
        let bytes = serde_json::to_vec(self)?;
        Ok(format!(
            "spark-session:{}",
            bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
        ))
    }
    pub fn decode(text: &str) -> Result<Self> {
        let text = text.trim();
        if text.len() > 8192 {
            return invalid("Spark invite is too large");
        }
        let Some(hex) = text.strip_prefix("spark-session:") else {
            return invalid("Paste a private Spark session invite");
        };
        if hex.is_empty() || hex.len() % 2 != 0 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return invalid("Invalid Spark invite encoding");
        }
        let bytes = hex
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
            .collect::<Vec<_>>();
        let invite: Self = serde_json::from_slice(&bytes)?;
        invite.validate()?;
        Ok(invite)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_invites_round_trip_without_accepting_wildcard_or_public_tcp_addresses() {
        let mut invite = Invite {
            schema_version: 2,
            session_id: uuid::Uuid::new_v4().to_string(),
            transport: Transport::Lan,
            endpoint: "192.168.1.2:12345".into(),
            key: "a".repeat(32),
            game: None,
        };
        assert_eq!(
            Invite::decode(&invite.encode().unwrap()).unwrap().endpoint,
            invite.endpoint
        );
        for endpoint in ["0.0.0.0:1234", "8.8.8.8:1234", "127.0.0.1:0"] {
            invite.endpoint = endpoint.into();
            assert!(invite.validate().is_err());
        }
        invite.transport = Transport::SteamSpacewar;
        invite.endpoint = "steam:76561197960265729:12345".into();
        assert!(invite.validate().is_ok());
        assert!(Invite::decode(&"x".repeat(9000)).is_err());
    }
}

//! Invitation syntax/routing only. URI conversion is never game-protocol translation.
use crate::{invalid, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const WEB_CLIENT: &str = "https://halocombatevolved.com/";

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InvitationClient {
    MccSteam,
    ChupathingyCe,
    OpenCe,
    WebOpenCe,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InvitationKind {
    CommunityGame,
    PasswordCommunityGame,
    MccSteamLobby,
    WebRoom,
}

#[derive(Clone)]
pub struct Invitation {
    pub id: String,
    pub kind: InvitationKind,
    secret: String,
}
impl std::fmt::Debug for Invitation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Invitation")
            .field("id", &self.id)
            .field("kind", &self.kind)
            .field("secret", &"[redacted]")
            .finish()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvitationRoute {
    pub invitation_id: String,
    pub kind: InvitationKind,
    pub client: InvitationClient,
    pub can_handoff: bool,
    pub translation_status: String,
    pub detail: String,
    pub requirements: Vec<String>,
    pub gameplay_verified: bool,
}

fn hex(value: &str, count: usize) -> bool {
    value.len() == count && value.bytes().all(|c| c.is_ascii_hexdigit())
}
fn unescape(value: &str) -> Result<String> {
    let mut result = Vec::new();
    let bytes = value.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return invalid("Incomplete invitation encoding");
            }
            let part = std::str::from_utf8(&bytes[i + 1..i + 3])
                .map_err(|_| crate::SparkError::Invalid("Invalid invitation encoding".into()))?;
            result.push(
                u8::from_str_radix(part, 16).map_err(|_| {
                    crate::SparkError::Invalid("Invalid invitation encoding".into())
                })?,
            );
            i += 3;
        } else {
            result.push(bytes[i]);
            i += 1;
        }
    }
    if result.iter().any(|c| !c.is_ascii() || c.is_ascii_control()) {
        return invalid("Invitation contains invalid characters");
    }
    String::from_utf8(result)
        .map_err(|_| crate::SparkError::Invalid("Invalid invitation encoding".into()))
}

pub fn parse(value: &str) -> Result<Invitation> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 2048
        || !value.is_ascii()
        || value.bytes().any(|c| c.is_ascii_control())
    {
        return invalid("Paste one supported invitation (at most 2048 ASCII characters)");
    }
    let value = value.to_ascii_lowercase();
    let (kind, secret) = if let Some(code) = value.strip_prefix("halo://join/") {
        // Chupathingy fa0f2df4 p2p_internal.h / p2p_crypto.c: p + 36 hex-encoded
        // bytes (host hash, door and check). Keep them opaque; the game owns the password.
        let kind = if code.strip_prefix('p').is_some_and(|body| hex(body, 72)) {
            InvitationKind::PasswordCommunityGame
        } else if hex(code, 64) {
            InvitationKind::CommunityGame
        } else {
            return invalid("A community invitation requires 64 hexadecimal digits, or a protected Chupathingy link with p followed by exactly 72 hexadecimal digits");
        };
        (kind, code.to_owned())
    } else if let Some(ids) = value.strip_prefix("steam://joinlobby/976730/") {
        let ids: Vec<_> = ids.split('/').collect();
        if !(1..=2).contains(&ids.len())
            || ids.iter().any(|id| {
                id.is_empty()
                    || !id.bytes().all(|c| c.is_ascii_digit())
                    || id.parse::<u64>().ok().is_none_or(|v| v == 0)
            })
        {
            return invalid(
                "Use a valid MCC Steam lobby invitation with nonzero 64-bit lobby/player IDs",
            );
        }
        (InvitationKind::MccSteamLobby, ids.join("/"))
    } else if let Some(query) = value.strip_prefix("https://halocombatevolved.com/?") {
        let mut game = None;
        let mut room = None;
        for parameter in query.split('&') {
            if parameter == "play" {
                continue;
            }
            let (name, encoded) = parameter.split_once('=').ok_or_else(|| {
                crate::SparkError::Invalid("Unsupported web invitation parameter".into())
            })?;
            let decoded = unescape(encoded)?;
            match name {
                "join" if game.is_none()=> {let code=decoded.strip_prefix("halo://join/").unwrap_or(&decoded);if !hex(code,64){return invalid("Invalid web game invitation");}game=Some(code.to_owned());},
                "room" if room.is_none()=>{if !hex(&decoded,32){return invalid("A browser room invitation requires 32 hexadecimal digits");}room=Some(decoded);},
                _=>return invalid("Unsupported or duplicate web invitation parameters; custom brokers/settings are not accepted"),
            }
        }
        match (game, room) {
            (Some(code), None) => (InvitationKind::CommunityGame, code),
            (None, Some(code)) => (InvitationKind::WebRoom, code),
            _ => {
                return invalid("Paste one game invitation or browser room, not a combined target")
            }
        }
    } else {
        return invalid("Supported invitations: halo://join/, MCC steam://joinlobby/976730/, or the official OpenCE web client's ?join= / ?room= links. Other web forks need their own adapter.");
    };
    let id = format!("invite-{}", crate::hex_bytes(Sha256::digest(format!("{kind:?}:{secret}").as_bytes())));
    Ok(Invitation { id, kind, secret })
}

pub fn route(invitation: &Invitation, client: InvitationClient) -> InvitationRoute {
    use InvitationClient::*;
    use InvitationKind::*;
    let (can_handoff,status,detail)=match (invitation.kind,client){
        (CommunityGame|PasswordCommunityGame,MccSteam)=>(false,"mccProtocolBridgeMissing","This invitation uses the community game protocol. An MCC-to-community wire/session/actor translation adapter is not implemented. A launcher or URL rewrite cannot connect MCC to it."),
        (PasswordCommunityGame,ChupathingyCe)=>(true,"runtimePasswordPromptRequired","Hand the protected invitation to the inspected Chupathingy runtime. The game asks for its password and validates the host, protocol and content. Spark never asks for or decrypts the password; a handoff is not a confirmed connection."),
        (PasswordCommunityGame,OpenCe|WebOpenCe)=>(false,"protectedInvitationUnsupported","This protected link uses Chupathingy's invitation format. The inspected OpenCE native/web implementation does not parse it. Choose a matching Chupathingy runtime; rewriting the link cannot add password support."),
        (MccSteamLobby,MccSteam)=>(true,"steamHandoffUnverified","Hand the actual MCC invitation to Steam. Steam and MCC must validate membership, the selected Halo title, game version and mod content; Spark has no lobby-connection acknowledgement API."),
        (MccSteamLobby,_) =>(false,"differentSessionProtocol","An MCC Steam lobby is not an OpenCE/Chupathingy/WebRTC session. No cross-protocol translator is implemented."),
        (WebRoom,WebOpenCe)=>(true,"browserRoomHandoffUnverified","Open the official browser room. A browser room is a separate system-link transport, documented for up to 16 browsers; it is not a 128-player internet game."),
        (WebRoom,_) =>(false,"webRoomTransportRequired","This is a browser room, not a native game invitation. Its room secret cannot be rewritten into an MCC or native lobby ID."),
        (CommunityGame,WebOpenCe)=>(true,"uriConversionOnly","Open the official web client with the game invitation. This converts the invitation URI format only; the browser game must validate its build, protocol and local content. It does not translate MCC gameplay."),
        (CommunityGame,ChupathingyCe|OpenCe)=>(true,"nativeGameNegotiationRequired","Hand the documented invitation to the inspected matching community runtime. The game must negotiate protocol/content and reject incompatibility. This is not a confirmed connection."),
    };
    let mut requirements=vec!["Use the matching owned game content; local native or browser storage readiness is separate from recognizing an invitation.".into(),"Private invitations remain in memory and are not included in reports, logs or saved project files.".into()];
    if invitation.kind==PasswordCommunityGame {requirements.push("Use a Chupathingy build supporting protected invitations and enter the host's password only in that game's prompt. Older builds may reject the link.".into());}
    InvitationRoute{invitation_id:invitation.id.clone(),kind:invitation.kind,client,can_handoff,translation_status:status.into(),detail:detail.into(),requirements,gameplay_verified:false}
}

impl Invitation {
    /// Native caller repeats route/identity/consent checks before using one argv.
    pub fn argument(&self, client: InvitationClient) -> Result<String> {
        if !route(self, client).can_handoff {
            return invalid("This invitation requires an unimplemented protocol/transport bridge");
        }
        Ok(match (self.kind, client) {
            (InvitationKind::MccSteamLobby, _) => {
                format!("steam://joinlobby/976730/{}", self.secret)
            }
            (InvitationKind::WebRoom, _) => format!("{WEB_CLIENT}?room={}", self.secret),
            (_, InvitationClient::WebOpenCe) => format!("{WEB_CLIENT}?join={}", self.secret),
            _ => format!("halo://join/{}", self.secret),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protected_invites_preserve_the_exact_opaque_game_argument_and_client_boundary() {
        let value=format!("halo://join/p{}{}{}","12".repeat(16),"ab".repeat(16),"cdef0123");
        let invitation=parse(&value).unwrap();
        assert_eq!(value.len(),85);
        assert_eq!(invitation.kind,InvitationKind::PasswordCommunityGame);
        assert_eq!(invitation.argument(InvitationClient::ChupathingyCe).unwrap(),value);
        assert_eq!(parse(&value.to_ascii_uppercase()).unwrap().id,invitation.id);
        let matching=route(&invitation,InvitationClient::ChupathingyCe);
        assert!(matching.can_handoff);
        assert!(!matching.gameplay_verified);
        assert_eq!(matching.translation_status,"runtimePasswordPromptRequired");
        assert!(matching.requirements.iter().any(|text|text.contains("only in that game's prompt")));
        for client in [InvitationClient::OpenCe,InvitationClient::WebOpenCe,InvitationClient::MccSteam] {
            assert!(!route(&invitation,client).can_handoff);
            assert!(invitation.argument(client).is_err());
        }
        let secret=value.strip_prefix("halo://join/").unwrap();
        assert!(!format!("{invitation:?}").contains(secret));
        assert!(!serde_json::to_string(&matching).unwrap().contains(secret));
        let plain=parse(&format!("halo://join/{}","ab".repeat(32))).unwrap();
        assert_eq!(plain.kind,InvitationKind::CommunityGame);
        assert!(plain.argument(InvitationClient::OpenCe).is_ok());
        assert_ne!(invitation.id,plain.id);
    }
    #[test]
    fn protected_invite_boundaries_reject_truncation_extension_and_injection() {
        for length in [0,1,63,64,65,71,73,74,2048] {
            let value=format!("halo://join/p{}","a".repeat(length));
            assert!(parse(&value).is_err());
        }
        let valid=format!("halo://join/p{}","ab".repeat(36));
        for suffix in ["/","?password=secret","#fragment",";quit","&play","\\child"] {
            assert!(parse(&(valid.clone()+suffix)).is_err());
        }
        for character in ['g','-','%','/','\0','\n',' ','é'] {
            let malformed=format!("halo://join/p{}{}{}","a".repeat(31),character,"b".repeat(40));
            assert!(parse(&malformed).is_err());
        }
        assert!(parse(&format!("{WEB_CLIENT}?join=p{}","ab".repeat(36))).is_err());
        assert!(parse(&format!("{WEB_CLIENT}?join=halo%3A%2F%2Fjoin%2Fp{}","ab".repeat(36))).is_err());
        assert!(parse(&format!("play {valid} tonight")).is_err());
        assert!(parse(&format!("p{}","ab".repeat(36))).is_err());
    }
    #[test]
    fn private_invitation_routing_does_not_fabricate_mcc_translation() {
        let invitation = parse(&format!("halo://join/{}", "a".repeat(64))).unwrap();
        let mcc = route(&invitation, InvitationClient::MccSteam);
        assert!(!mcc.can_handoff);
        assert_eq!(mcc.translation_status, "mccProtocolBridgeMissing");
        assert!(invitation.argument(InvitationClient::MccSteam).is_err());
        for client in [
            InvitationClient::OpenCe,
            InvitationClient::ChupathingyCe,
            InvitationClient::WebOpenCe,
        ] {
            assert!(route(&invitation, client).can_handoff);
            assert!(!route(&invitation, client).gameplay_verified);
        }
        assert!(!serde_json::to_string(&mcc)
            .unwrap()
            .contains(&"a".repeat(64)));
        assert!(!format!("{invitation:?}").contains(&"a".repeat(64)));
    }
    #[test]
    fn browser_uri_conversion_is_distinct_from_browser_rooms() {
        let invitation = parse(&format!(
            "{WEB_CLIENT}?join=halo%3A%2F%2Fjoin%2F{}&play",
            "b".repeat(64)
        ))
        .unwrap();
        assert_eq!(
            invitation.argument(InvitationClient::OpenCe).unwrap(),
            format!("halo://join/{}", "b".repeat(64))
        );
        let room = parse(&format!("{WEB_CLIENT}?room={}", "c".repeat(32))).unwrap();
        assert!(room.argument(InvitationClient::OpenCe).is_err());
        assert!(room.argument(InvitationClient::WebOpenCe).is_ok());
    }
    #[test]
    fn mismatched_steam_apps_and_injected_links_are_rejected() {
        for value in [
            "steam://joinlobby/480/123/456",
            "steam://joinlobby/976730/0/123",
            "https://evil.invalid/?join=abcd",
            "halo://join/a;quit",
            "https://halocombatevolved.com/?room=aa&set=HALO_DATA_ROOT=evil",
            "https://halocombatevolved.com/?join=%00",
        ] {
            assert!(parse(value).is_err(), "{value}");
        }
        let mcc = parse("steam://joinlobby/976730/109775242123451241/76561190000000001").unwrap();
        assert!(mcc.argument(InvitationClient::OpenCe).is_err());
        assert!(mcc
            .argument(InvitationClient::MccSteam)
            .unwrap()
            .starts_with("steam://joinlobby/976730/"));
    }
}

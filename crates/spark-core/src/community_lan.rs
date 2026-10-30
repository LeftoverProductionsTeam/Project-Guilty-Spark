//! Bounded discovery of an owner-controlled, loopback community Halo 1 host.
//! This implements the existing native search/advertisement wire only. It never
//! requests admission, represents a player, changes a protocol number or controls
//! an MCC engine. All advertised fields are unauthenticated discovery hints.
//!
//! Format references: Chupathingy 880a933ec33b2ae2dbbeb4018a9090c528a075bc,
//! source/networking/network_messages.c, network_server_message_handler.c,
//! source/bungie_net/common/message_header.h and port/linux/src/xnet.c.
//! Original field codec; no upstream engine/crypto implementation is included.
use crate::{invalid, Result, SparkError};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket},
    time::{Duration, Instant},
};

pub const SERVER_PORT: u16 = 5150;
pub const DISCOVERY_PROTOCOL: u16 = 2;
const ADVERTISEMENT_BYTES: usize = 280;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Advertisement {
    pub packet_version: u8,
    pub discovery_protocol: u16,
    pub legacy_network_version: u16,
    pub distributed_netcode: bool,
    pub in_progress: bool,
    pub advertised_kind: u8,
    /// Reserved native Delta bytes, intentionally not interpreted as a signature
    /// or a verified compatibility table. Legacy number and Delta wire differ.
    pub extension_bytes_sha256: String,
    pub game_name: String,
    pub map_name: String,
    /// Native 32-bit content-version hint. This is NOT a complete SHA-256.
    pub map_version_hint: u32,
    pub game_engine: u16,
    pub machines: u16,
    pub players: u16,
    pub maximum_players: u16,
    pub score_limit: u16,
    pub open: bool,
    pub teams: bool,
    pub game_port: u16,
}

/// A native search datagram. It advertises no MCC identity, account, player or
/// game capability. The query protocol is separate from the host's game version.
pub fn search_datagram(reply_port: u16, nonce: [u8; 8]) -> Result<[u8; 16]> {
    if reply_port == 0 {
        return invalid("Discovery requires a real local reply port");
    }
    let mut bytes = [0u8; 16];
    bytes[..2].copy_from_slice(&((16u16 << 4) | 12).to_be_bytes());
    // data_packet_definition.version is 1; its flags field is the preceding 0.
    bytes[2] = 1;
    bytes[3..5].copy_from_slice(&reply_port.to_be_bytes());
    bytes[5..7].copy_from_slice(&DISCOVERY_PROTOCOL.to_be_bytes());
    bytes[7..15].copy_from_slice(&nonce);
    // Native data-packet type is a trailing byte; 0 is game search.
    Ok(bytes)
}

pub fn decode_advertisement(bytes: &[u8], nonce: [u8; 8]) -> Result<Advertisement> {
    if bytes.len() != ADVERTISEMENT_BYTES {
        return invalid("Unsupported native advertisement length");
    }
    let header = u16::from_be_bytes([bytes[0], bytes[1]]);
    if header >> 4 != bytes.len() as u16 || header & 15 != 12 || bytes[2] != 1 || bytes[279] != 2 {
        return invalid("Invalid native advertisement framing/type");
    }
    let body = &bytes[3..279];
    if body[..8] != nonce {
        return invalid("Advertisement does not answer this discovery nonce");
    }
    let word = |at: usize| u16::from_le_bytes([body[at], body[at + 1]]);
    if word(52) != SERVER_PORT || word(54) != DISCOVERY_PROTOCOL || word(56) != 0 {
        return invalid("Unsupported native discovery protocol, platform or game port");
    }
    let units: Vec<u16> = body[58..90]
        .chunks_exact(2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .collect();
    let end = units
        .iter()
        .position(|value| *value == 0)
        .ok_or_else(|| SparkError::Invalid("Unterminated native game name".into()))?;
    let game_name = String::from_utf16(&units[..end])
        .map_err(|_| SparkError::Invalid("Invalid native UTF-16 game name".into()))?;
    if game_name.chars().any(char::is_control) {
        return invalid("Control character in native game name");
    }
    let end = body[120..248]
        .iter()
        .position(|value| *value == 0)
        .ok_or_else(|| SparkError::Invalid("Unterminated native map identity".into()))?;
    let map = &body[120..120 + end];
    if map.is_empty() || !map.iter().all(|value| (32..=126).contains(value)) {
        return invalid("Invalid native map identity");
    }
    let (machines, players, maximum_players) = (word(250), word(252), word(254));
    if machines > 128 || maximum_players == 0 || maximum_players > 128 || players > maximum_players
    {
        return invalid("Invalid advertised native population bounds");
    }
    let flags = word(258);
    Ok(Advertisement {
        packet_version: bytes[2],
        discovery_protocol: word(54),
        legacy_network_version: word(90),
        distributed_netcode: body[92] & 1 != 0,
        in_progress: body[92] & 2 != 0,
        advertised_kind: body[93],
        extension_bytes_sha256: format!("{:x}", Sha256::digest(&body[94..116])),
        game_name,
        map_name: String::from_utf8(map.to_vec())
            .map_err(|_| SparkError::Invalid("Invalid map encoding".into()))?,
        map_version_hint: u32::from_le_bytes(
            body[116..120]
                .try_into()
                .map_err(|_| SparkError::Invalid("Invalid native map hint".into()))?,
        ),
        game_engine: word(248),
        machines,
        players,
        maximum_players,
        score_limit: word(256),
        open: flags & 2 != 0,
        teams: flags & 4 != 0,
        game_port: word(52),
    })
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    pub advertisement: Advertisement,
    pub queries_sent: u32,
    pub ignored_datagrams: u32,
    pub elapsed_ms: u128,
    pub response_bytes: usize,
    pub response_sha256: String,
    pub authenticated: bool,
    pub session_admission_attempted: bool,
}

/// Sends at most one small search per 500 ms to one explicitly selected private
/// loopback host. No broadcast, public scan, key registration, join or forwarding.
pub fn probe_private(host: SocketAddrV4, timeout: Duration) -> Result<Observation> {
    if !host.ip().is_loopback() || *host.ip() == Ipv4Addr::LOCALHOST || host.port() != SERVER_PORT {
        return invalid("This experiment accepts only an explicit private loopback host on native port 5150; no public/LAN probing");
    }
    if timeout.is_zero() || timeout > Duration::from_secs(10) {
        return invalid("Private discovery timeout must be within ten seconds");
    }
    let socket = UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 212), 0))?;
    socket.set_read_timeout(Some(Duration::from_millis(100)))?;
    let mut nonce = [0u8; 8];
    nonce.copy_from_slice(&uuid::Uuid::new_v4().as_bytes()[..8]);
    let request = search_datagram(socket.local_addr()?.port(), nonce)?;
    let start = Instant::now();
    let mut next = Duration::ZERO;
    let (mut queries, mut ignored) = (0, 0);
    let mut buffer = [0u8; 4096];
    while start.elapsed() < timeout {
        if start.elapsed() >= next {
            socket.send_to(&request, host)?;
            queries += 1;
            next = start.elapsed() + Duration::from_millis(500);
        }
        match socket.recv_from(&mut buffer) {
            Ok((length, peer)) => {
                if peer != SocketAddr::V4(host) {
                    ignored += 1;
                    if ignored > 256 {
                        return invalid("Private discovery datagram budget exceeded");
                    }
                    continue;
                }
                match decode_advertisement(&buffer[..length], nonce) {
                    Ok(advertisement) => {
                        return Ok(Observation {
                            advertisement,
                            queries_sent: queries,
                            ignored_datagrams: ignored,
                            elapsed_ms: start.elapsed().as_millis(),
                            response_bytes: length,
                            response_sha256: format!("{:x}", Sha256::digest(&buffer[..length])),
                            authenticated: false,
                            session_admission_attempted: false,
                        })
                    }
                    Err(_) => {
                        ignored += 1;
                    }
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::TimedOut
                        | std::io::ErrorKind::WouldBlock
                        | std::io::ErrorKind::ConnectionReset
                ) => {}
            Err(error) => return Err(error.into()),
        }
        if ignored > 256 {
            return invalid("Private discovery datagram budget exceeded");
        }
    }
    invalid("The selected private host supplied no valid nonce-bound native advertisement; no connection or admission is established")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(nonce: [u8; 8]) -> Vec<u8> {
        let mut bytes = vec![0; 280];
        bytes[..2].copy_from_slice(&((280u16 << 4) | 12).to_be_bytes());
        bytes[2] = 1;
        bytes[279] = 2;
        let b = &mut bytes[3..279];
        b[..8].copy_from_slice(&nonce);
        for (at, value) in [
            (52, 5150u16),
            (54, 2),
            (90, 32),
            (248, 2),
            (250, 1),
            (252, 1),
            (254, 16),
            (256, 15),
            (258, 2),
        ] {
            b[at..at + 2].copy_from_slice(&value.to_le_bytes());
        }
        b[92] = 1;
        b[58..60].copy_from_slice(&(b'T' as u16).to_le_bytes());
        b[120..130].copy_from_slice(b"bloodgulch");
        bytes
    }
    #[test]
    fn query_has_native_big_endian_fields_and_no_identity_or_join() {
        assert_eq!(
            search_datagram(5153, [0, 1, 2, 3, 4, 5, 6, 7]).unwrap(),
            [1, 12, 1, 20, 33, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 0]
        );
        assert!(search_datagram(0, [0; 8]).is_err());
    }
    #[test]
    fn native_advertisement_keeps_protocol_version_separate_and_omits_key_material() {
        let mut b = fixture([9; 8]);
        b[19..43].fill(0xAA);
        b[263..279].fill(0xCC);
        let a = decode_advertisement(&b, [9; 8]).unwrap();
        assert_eq!(a.legacy_network_version, 32);
        assert_eq!(a.discovery_protocol, 2);
        assert_eq!(a.map_name, "bloodgulch");
        assert!(a.open);
        let json = serde_json::to_string(&a).unwrap();
        assert!(!json.contains("nonce"));
        assert!(!json.contains("token"));
        assert!(!json.contains("keyId"));
    }
    #[test]
    fn stale_and_malformed_datagrams_never_become_discovery() {
        let b = fixture([9; 8]);
        assert!(decode_advertisement(&b, [8; 8]).is_err());
        for length in [0, 1, 14, 279, 281] {
            let mut bad = b.clone();
            bad.resize(length, 0);
            assert!(decode_advertisement(&bad, [9; 8]).is_err());
        }
        for (at, value) in [
            (0, 0),
            (2, 2),
            (279, 12),
            (3 + 54, 1),
            (3 + 255, 255),
            (3 + 59, 216),
        ] {
            let mut bad = b.clone();
            bad[at] = value;
            assert!(decode_advertisement(&bad, [9; 8]).is_err());
        }
        let mut bad = b.clone();
        bad[123..251].fill(65);
        assert!(decode_advertisement(&bad, [9; 8]).is_err());
    }
    #[test]
    fn private_probe_refuses_nonlocal_targets_and_unbounded_time_before_network_io() {
        assert!(probe_private(
            SocketAddrV4::new(Ipv4Addr::new(192, 0, 2, 1), 5150),
            Duration::from_secs(1)
        )
        .is_err());
        assert!(probe_private(
            SocketAddrV4::new(Ipv4Addr::LOCALHOST, 5150),
            Duration::from_secs(1)
        )
        .is_err());
        assert!(probe_private(
            SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 210), 5151),
            Duration::from_secs(1)
        )
        .is_err());
        assert!(probe_private(
            SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 210), 5150),
            Duration::from_secs(11)
        )
        .is_err());
    }

    #[test]
    fn real_socket_ignores_foreign_and_stale_replies_before_accepting_the_selected_host() {
        let host = SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 213), SERVER_PORT);
        let server = UdpSocket::bind(host).unwrap();
        server
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let responder = std::thread::spawn(move || {
            let mut request = [0; 32];
            let (length, client) = server.recv_from(&mut request).unwrap();
            assert_eq!(length, 16);
            let mut nonce = [0; 8];
            nonce.copy_from_slice(&request[7..15]);
            let foreign = UdpSocket::bind((Ipv4Addr::new(127, 0, 0, 214), 0)).unwrap();
            foreign.send_to(&fixture(nonce), client).unwrap();
            let mut stale_nonce = nonce;
            stale_nonce[0] ^= 1;
            server.send_to(&fixture(stale_nonce), client).unwrap();
            server.send_to(&fixture(nonce), client).unwrap();
        });
        let observed = probe_private(host, Duration::from_secs(2)).unwrap();
        responder.join().unwrap();
        assert!(observed.ignored_datagrams >= 1);
        assert_eq!(observed.response_bytes, ADVERTISEMENT_BYTES);
        assert_eq!(observed.advertisement.map_name, "bloodgulch");
        assert!(!observed.authenticated);
        assert!(!observed.session_admission_attempted);
    }
}

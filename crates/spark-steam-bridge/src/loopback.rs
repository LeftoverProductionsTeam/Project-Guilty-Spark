//! Explicit local SDK transport acceptance; does not certify remote Steam relay.
use super::Error;
use sha2::{Digest, Sha256};
use spark_core::session_frames::{fragment, Kind, Reassembler};
use std::{
    ptr,
    time::{Duration, Instant},
};
use steamworks::{networking_types::SendFlags, sys, Client};
struct Pair {
    api: *mut sys::ISteamNetworkingSockets,
    connections: [u32; 2],
}
impl Drop for Pair {
    fn drop(&mut self) {
        unsafe {
            for id in self.connections {
                if id != 0 {
                    sys::SteamAPI_ISteamNetworkingSockets_CloseConnection(
                        self.api,
                        id,
                        1000,
                        ptr::null(),
                        false,
                    );
                }
            }
        }
    }
}
pub(super) fn run(client: &Client) -> Result<(), Error> {
    let api = unsafe { sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012() };
    if api.is_null() {
        return Err("Steam SDK networking sockets are unavailable".into());
    }
    let mut pair = Pair {
        api,
        connections: [0; 2],
    };
    if !unsafe {
        sys::SteamAPI_ISteamNetworkingSockets_CreateSocketPair(
            api,
            &mut pair.connections[0],
            &mut pair.connections[1],
            false,
            ptr::null(),
            ptr::null(),
        )
    } {
        return Err("Steam SDK refused the local socket pair".into());
    }
    let payload = (0..4 * 1024 * 1024)
        .map(|n| (n % 251) as u8)
        .collect::<Vec<_>>();
    let packets = fragment(1, Kind::Request, &payload)?;
    let count = packets.len();
    let start = Instant::now();
    let mut reassembler = Reassembler::default();
    let mut completed = None;
    for packet in packets {
        let sent = unsafe {
            sys::SteamAPI_ISteamNetworkingSockets_SendMessageToConnection(
                api,
                pair.connections[0],
                packet.as_ptr().cast(),
                packet.len() as u32,
                SendFlags::RELIABLE_NO_NAGLE.bits(),
                ptr::null_mut(),
            )
        };
        if sent != sys::EResult::k_EResultOK {
            return Err(format!("Steam SDK loopback send failed: {sent:?}").into());
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            client.run_callbacks();
            let mut message = ptr::null_mut();
            let received = unsafe {
                sys::SteamAPI_ISteamNetworkingSockets_ReceiveMessagesOnConnection(
                    api,
                    pair.connections[1],
                    &mut message,
                    1,
                )
            };
            if received < 0 {
                return Err("Steam SDK loopback receive failed".into());
            }
            if received == 1 && !message.is_null() {
                let bytes = unsafe {
                    let valid = (*message).m_cbSize > 0
                        && (*message).m_cbSize <= 65536
                        && !(*message).m_pData.is_null();
                    let data = if valid {
                        Some(
                            std::slice::from_raw_parts(
                                (*message).m_pData.cast::<u8>(),
                                (*message).m_cbSize as usize,
                            )
                            .to_vec(),
                        )
                    } else {
                        None
                    };
                    sys::SteamAPI_SteamNetworkingMessage_t_Release(message);
                    data
                }
                .ok_or("Steam SDK returned an invalid loopback packet")?;
                if let Some(frame) = reassembler.push(&bytes)? {
                    completed = Some(frame.data);
                }
                break;
            }
            if Instant::now() >= deadline {
                return Err("Steam SDK loopback timed out".into());
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    if completed.as_deref() != Some(payload.as_slice()) {
        return Err("Steam SDK loopback payload differs".into());
    }
    println!(
        "SPARK_STEAM_SELF_TEST {}",
        serde_json::json!({"status":"PASS","appId":480,"scope":"local SDK socket pair; remote two-account relay remains untested","bytes":payload.len(),"packets":count,"sha256":format!("{:x}",Sha256::digest(&payload)),"elapsedMs":start.elapsed().as_secs_f64()*1000.})
    );
    Ok(())
}

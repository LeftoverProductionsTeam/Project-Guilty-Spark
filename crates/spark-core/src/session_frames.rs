//! Bounded, ordered fragments for the Steam transport. Application session
//! authentication remains inside the reassembled private-session frame.
use crate::{invalid, Result};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
pub const MAX_BYTES: usize = 4 * 1024 * 1024;
const CHUNK: usize = 60 * 1024;
const HEADER: usize = 55;
const MAGIC: &[u8; 6] = b"GSPK2\0";
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Request = 0,
    Response = 1,
}
pub struct Frame {
    pub id: u64,
    pub kind: Kind,
    pub data: Vec<u8>,
}
pub fn fragment(id: u64, kind: Kind, data: &[u8]) -> Result<Vec<Vec<u8>>> {
    if id == 0 || data.is_empty() || data.len() > MAX_BYTES {
        return invalid("Invalid Steam editor frame size or identity");
    }
    let hash = Sha256::digest(data);
    Ok(data
        .chunks(CHUNK)
        .enumerate()
        .map(|(n, chunk)| {
            let mut packet = Vec::with_capacity(HEADER + chunk.len());
            packet.extend(MAGIC);
            packet.push(kind as u8);
            packet.extend(id.to_be_bytes());
            packet.extend((data.len() as u32).to_be_bytes());
            packet.extend(((n * CHUNK) as u32).to_be_bytes());
            packet.extend(hash);
            packet.extend(chunk);
            packet
        })
        .collect())
}
struct Pending {
    id: u64,
    kind: Kind,
    total: usize,
    hash: [u8; 32],
    data: Vec<u8>,
    started: Instant,
}
#[derive(Default)]
pub struct Reassembler {
    pending: Option<Pending>,
}
impl Reassembler {
    pub fn expired(&self) -> bool {
        self.pending
            .as_ref()
            .is_some_and(|p| p.started.elapsed() > Duration::from_secs(10))
    }
    pub fn push(&mut self, packet: &[u8]) -> Result<Option<Frame>> {
        if self.expired() {
            self.pending = None;
        }
        if packet.len() <= HEADER || packet.len() > HEADER + CHUNK || &packet[..6] != MAGIC {
            return invalid("Invalid Steam editor fragment");
        }
        let kind = match packet[6] {
            0 => Kind::Request,
            1 => Kind::Response,
            _ => return invalid("Unknown Steam editor frame kind"),
        };
        let id = u64::from_be_bytes(packet[7..15].try_into().unwrap());
        let total = u32::from_be_bytes(packet[15..19].try_into().unwrap()) as usize;
        let offset = u32::from_be_bytes(packet[19..23].try_into().unwrap()) as usize;
        let hash: [u8; 32] = packet[23..55].try_into().unwrap();
        let body = &packet[HEADER..];
        if id == 0
            || total == 0
            || total > MAX_BYTES
            || offset.checked_add(body.len()).is_none_or(|end| end > total)
        {
            return invalid("Steam editor fragment exceeds its frame budget");
        }
        if self.pending.is_none() {
            if offset != 0 {
                return invalid("Steam editor fragment arrived before its first chunk");
            }
            self.pending = Some(Pending {
                id,
                kind,
                total,
                hash,
                data: Vec::with_capacity(total),
                started: Instant::now(),
            });
        }
        let pending = self.pending.as_mut().unwrap();
        if pending.id != id
            || pending.kind != kind
            || pending.total != total
            || pending.hash != hash
            || pending.data.len() != offset
        {
            self.pending = None;
            return invalid("Interleaved or out-of-order Steam editor fragments");
        }
        pending.data.extend(body);
        if pending.data.len() != pending.total {
            return Ok(None);
        }
        let pending = self.pending.take().unwrap();
        if Sha256::digest(&pending.data).as_slice() != pending.hash {
            return invalid("Steam editor frame checksum differs");
        }
        Ok(Some(Frame {
            id,
            kind,
            data: pending.data,
        }))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn large_documents_round_trip_and_corruption_never_produces_a_frame() {
        let data = vec![0x5a; MAX_BYTES];
        let packets = fragment(42, Kind::Request, &data).unwrap();
        let mut reader = Reassembler::default();
        let mut frame = None;
        for packet in &packets {
            frame = reader.push(packet).unwrap();
        }
        assert_eq!(frame.unwrap().data, data);
        let mut bad = packets.clone();
        *bad.last_mut().unwrap().last_mut().unwrap() ^= 1;
        let mut reader = Reassembler::default();
        for packet in &bad[..bad.len() - 1] {
            reader.push(packet).unwrap();
        }
        assert!(reader.push(bad.last().unwrap()).is_err());
    }
    #[test]
    fn reordered_and_oversized_fragments_are_rejected_before_allocation() {
        let packets = fragment(1, Kind::Response, &vec![0; CHUNK + 1]).unwrap();
        assert!(Reassembler::default().push(&packets[1]).is_err());
        let mut oversized = packets[0].clone();
        oversized[15..19].copy_from_slice(&(MAX_BYTES as u32 + 1).to_be_bytes());
        assert!(Reassembler::default().push(&oversized).is_err());
        assert!(fragment(1, Kind::Request, &vec![0; MAX_BYTES + 1]).is_err());
    }
}

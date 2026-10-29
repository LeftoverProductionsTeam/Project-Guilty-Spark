//! Offline schema check of an explicitly captured public Delta List response.
//! Reads at most 1 MiB + 1 byte and prints aggregate counts only, never tokens,
//! names, rosters or server endpoints. Performs no network or game operations.
use spark_core::community_servers::{parse_delta_listing, MAX_LISTING_BYTES};
use std::io::Read;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args_os()
        .nth(1)
        .ok_or("usage: community_listing_check <captured-response.json>")?;
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take((MAX_LISTING_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let listing = parse_delta_listing(&bytes, now)?;
    println!(
        "bytes={} accepted={} rejected={} advertised_capacity_max={}",
        bytes.len(),
        listing.servers.len(),
        listing.rejected_rows,
        listing
            .servers
            .iter()
            .map(|server| server.advertised_capacity)
            .max()
            .unwrap_or(0)
    );
    Ok(())
}

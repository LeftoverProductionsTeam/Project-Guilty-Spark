//! Opt-in existing-wire discovery experiment. Never admits a player or attaches
//! to MCC. A real private host must already be running at the supplied address.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 1 {
        return Err("one_halo_discovery <explicit-private-loopback-ip:5150>".into());
    }
    let host = args[0].parse::<std::net::SocketAddrV4>()?;
    let report = spark_core::community_lan::probe_private(host, std::time::Duration::from_secs(5))?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

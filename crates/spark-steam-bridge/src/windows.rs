use spark_core::{
    forge_session::{private_endpoint, read_frame, write_frame},
    session_frames::{fragment, Frame, Kind, Reassembler},
    session_invite::steam_endpoint,
};
use std::{
    collections::{HashMap, HashSet},
    io::{self, BufRead, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use steamworks::{
    networking_types::{NetworkingIdentity, SendFlags},
    AppId, Client, FriendFlags, SteamId,
};
type Error = Box<dyn std::error::Error + Send + Sync>;
#[path = "loopback.rs"]
mod loopback_test;
enum Work {
    Request {
        id: u64,
        data: Vec<u8>,
        reply: mpsc::SyncSender<Result<Vec<u8>, String>>,
    },
    Reply {
        remote: u64,
        id: u64,
        data: Vec<u8>,
    },
}
#[derive(Clone, Copy)]
enum Mode {
    Probe,
    SelfTest,
    Host(SocketAddr, u32),
    Guest(u64, u32),
}
fn identity(id: u64) -> NetworkingIdentity {
    NetworkingIdentity::new_steam_id(SteamId::from_raw(id))
}
fn send(
    client: &Client,
    remote: u64,
    channel: u32,
    id: u64,
    kind: Kind,
    data: &[u8],
) -> Result<(), Error> {
    for packet in fragment(id, kind, data)? {
        client.networking_messages().send_message_to_user(
            identity(remote),
            SendFlags::RELIABLE_NO_NAGLE,
            &packet,
            channel,
        )?;
    }
    Ok(())
}
fn loopback(endpoint: &str) -> Result<SocketAddr, Error> {
    let address = private_endpoint(endpoint)?;
    if !address.ip().is_loopback() {
        return Err("Bridge TCP endpoints must be loopback".into());
    }
    Ok(address)
}
fn rpc(address: SocketAddr, data: Vec<u8>) -> Result<Vec<u8>, Error> {
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))?;
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(3)))?;
    write_frame(&mut stream, &data)?;
    Ok(read_frame(&mut stream)?)
}
fn guest_listener(listener: TcpListener, tx: mpsc::SyncSender<Work>, stop: Arc<AtomicBool>) {
    let sequence = Arc::new(AtomicU64::new(1));
    let active = Arc::new(AtomicUsize::new(0));
    std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((mut stream, address)) => {
                    if !address.ip().is_loopback() || active.load(Ordering::Relaxed) >= 4 {
                        continue;
                    }
                    if stream.set_nonblocking(false).is_err() {
                        continue;
                    }
                    let tx = tx.clone();
                    let sequence = sequence.clone();
                    let active = active.clone();
                    active.fetch_add(1, Ordering::Relaxed);
                    std::thread::spawn(move || {
                        let _guard = CountGuard(active);
                        let result = (|| -> Result<(), Error> {
                            stream.set_read_timeout(Some(Duration::from_secs(3)))?;
                            stream.set_write_timeout(Some(Duration::from_secs(3)))?;
                            let data = read_frame(&mut stream)?;
                            let (reply, wait) = mpsc::sync_channel(1);
                            tx.try_send(Work::Request {
                                id: sequence.fetch_add(1, Ordering::Relaxed),
                                data,
                                reply,
                            })?;
                            let data = wait
                                .recv_timeout(Duration::from_secs(16))?
                                .map_err(|error| -> Error { error.into() })?;
                            write_frame(&mut stream, &data)?;
                            Ok(())
                        })();
                        if result.is_err() {
                            let _ = stream.shutdown(std::net::Shutdown::Both);
                        }
                    });
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(5))
                }
                Err(_) => break,
            }
        }
    });
}
struct CountGuard(Arc<AtomicUsize>);
impl Drop for CountGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}
pub fn run() -> Result<(), Error> {
    let args = std::env::args().collect::<Vec<_>>();
    let mode =
        match args.get(1).map(String::as_str) {
            Some("--probe") => Mode::Probe,
            Some("--self-test") => Mode::SelfTest,
            Some("--host") if args.len() == 4 => {
                let channel: u32 = args[3].parse()?;
                if !(1..=65535).contains(&channel) {
                    return Err("Invalid session channel".into());
                }
                Mode::Host(loopback(&args[2])?, channel)
            }
            Some("--guest") if args.len() == 3 => {
                let (id, channel) = steam_endpoint(&args[2])?;
                Mode::Guest(id, channel)
            }
            _ => return Err(
                "Use --probe, --host <loopback:port> <channel>, or --guest <Spark Steam endpoint>"
                    .into(),
            ),
        };
    let client = Client::init_app(AppId(480))?;
    if client.utils().app_id() != AppId(480) || !client.user().logged_on() {
        return Err("Sign into Steam before using Spacewar test mode".into());
    }
    if matches!(mode, Mode::SelfTest) {
        return loopback_test::run(&client);
    }
    let own = client.user().steam_id().raw();
    if matches!(mode,Mode::Guest(id,_)if id==own) {
        return Err("Use a second Steam account to join a Steam host; same-machine tests can use LAN loopback".into());
    }
    let utils = client.networking_utils();
    utils.init_relay_network_access();
    let prime = Instant::now();
    while prime.elapsed() < Duration::from_millis(800) {
        client.run_callbacks();
        std::thread::sleep(Duration::from_millis(10));
    }
    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::sync_channel(8);
    let local = if matches!(mode, Mode::Guest(..)) {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        listener.set_nonblocking(true)?;
        let local = listener.local_addr()?;
        guest_listener(listener, tx.clone(), stop.clone());
        Some(local.to_string())
    } else {
        None
    };
    let channel = match mode {
        Mode::Host(_, channel) | Mode::Guest(_, channel) => channel,
        Mode::Probe | Mode::SelfTest => 0,
    };
    println!(
        "SPARK_STEAM_READY {}",
        serde_json::json!({"appId":480,"steamId":own.to_string(),"testMode":true,"localEndpoint":local,"steamEndpoint":format!("steam:{own}:{channel}"),"relayStatus":format!("{:?}",utils.relay_network_status())})
    );
    io::stdout().flush()?;
    if matches!(mode, Mode::Probe) {
        return Ok(());
    }
    let close = stop.clone();
    std::thread::spawn(move || {
        let mut line = String::new();
        let _ = io::stdin().lock().read_line(&mut line);
        close.store(true, Ordering::Relaxed);
    });
    let friends = Arc::new(Mutex::new(HashSet::<u64>::new()));
    let permitted = friends.clone();
    let expected = match mode {
        Mode::Guest(id, _) => Some(id),
        _ => None,
    };
    client
        .networking_messages()
        .session_request_callback(move |request| {
            let allowed = request.remote().steam_id().is_some_and(|id| {
                expected.map_or_else(
                    || {
                        permitted
                            .lock()
                            .map(|list| list.contains(&id.raw()))
                            .unwrap_or(false)
                    },
                    |host| host == id.raw(),
                )
            });
            if allowed {
                request.accept();
            } else {
                request.reject();
            }
        });
    let mut last_friends = Instant::now() - Duration::from_secs(10);
    let mut pending = HashMap::<u64, (mpsc::SyncSender<Result<Vec<u8>, String>>, Instant)>::new();
    let mut assemblies = HashMap::<u64, Reassembler>::new();
    let host_jobs = Arc::new(AtomicUsize::new(0));
    while !stop.load(Ordering::Relaxed) {
        if last_friends.elapsed() > Duration::from_secs(5) {
            let values = client
                .friends()
                .get_friends(FriendFlags::IMMEDIATE)
                .into_iter()
                .map(|friend| friend.id().raw())
                .collect();
            if let Ok(mut list) = friends.lock() {
                *list = values;
            }
            last_friends = Instant::now();
        }
        client.run_callbacks();
        for work in rx.try_iter().take(8) {
            match work {
                Work::Request { id, data, reply } => {
                    if let Mode::Guest(remote, channel) = mode {
                        if pending.len() >= 4 {
                            let _ = reply.try_send(Err("Steam request queue is full".into()));
                            continue;
                        }
                        match send(&client, remote, channel, id, Kind::Request, &data) {
                            Ok(()) => {
                                pending.insert(id, (reply, Instant::now()));
                            }
                            Err(_) => {
                                let _=reply.try_send(Err("Steam could not send this request; reconnect the editing session".into()));
                            }
                        }
                    }
                }
                Work::Reply { remote, id, data } => {
                    let _ = send(&client, remote, channel, id, Kind::Response, &data);
                }
            }
        }
        for message in client
            .networking_messages()
            .receive_messages_on_channel(channel, 32)
        {
            let Some(remote) = message.identity_peer().steam_id().map(|id| id.raw()) else {
                continue;
            };
            let allowed = match mode {
                Mode::Guest(host, _) => host == remote,
                Mode::Host(..) => friends
                    .lock()
                    .map(|list| list.contains(&remote))
                    .unwrap_or(false),
                Mode::Probe | Mode::SelfTest => false,
            };
            if !allowed || (!assemblies.contains_key(&remote) && assemblies.len() >= 4) {
                continue;
            }
            let result = assemblies.entry(remote).or_default().push(message.data());
            let frame = match result {
                Ok(Some(frame)) => frame,
                Ok(None) => continue,
                Err(_) => {
                    assemblies.remove(&remote);
                    continue;
                }
            };
            assemblies.remove(&remote);
            match (frame, &mode) {
                (
                    Frame {
                        id,
                        kind: Kind::Request,
                        data,
                    },
                    Mode::Host(address, _),
                ) if host_jobs.load(Ordering::Relaxed) < 4 => {
                    let address = *address;
                    let tx = tx.clone();
                    let count = host_jobs.clone();
                    count.fetch_add(1, Ordering::Relaxed);
                    std::thread::spawn(move || {
                        let _guard = CountGuard(count);
                        if let Ok(data) = rpc(address, data) {
                            let _ = tx.try_send(Work::Reply { remote, id, data });
                        }
                    });
                }
                (
                    Frame {
                        id,
                        kind: Kind::Response,
                        data,
                    },
                    Mode::Guest(..),
                ) => {
                    if let Some((reply, _)) = pending.remove(&id) {
                        let _ = reply.try_send(Ok(data));
                    }
                }
                _ => {}
            }
        }
        pending.retain(|_, (reply, started)| {
            if started.elapsed() > Duration::from_secs(14) {
                let _ = reply.try_send(Err(
                    "Steam peer timed out; keep both Spark sessions online and check their invites"
                        .into(),
                ));
                false
            } else {
                true
            }
        });
        assemblies.retain(|_, reader| !reader.expired());
        std::thread::sleep(Duration::from_millis(5));
    }
    Ok(())
}

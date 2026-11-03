//! SparkLink's bounded authoritative source transport. Native files, external
//! applications and game-memory APIs are never part of the network protocol.
use crate::{
    forge_session::GameBinding,
    invalid,
    quickforge::{self, QuickForgeDocument},
    studio_journal::{credential_hash, Journal, Member, Role, Storage},
    studio_network::NetworkScope,
    studio_tls, Result, SparkError,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, VecDeque},
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream},
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
pub const PROTOCOL_VERSION: u32 = 5;
pub const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_PARTICIPANTS: usize = 8;
fn fail(s: impl Into<String>) -> SparkError {
    SparkError::Invalid(s.into())
}
fn locked<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    m.lock()
        .map_err(|_| fail("SparkLink session lock was interrupted"))
}
fn secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
fn equal(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |v, (a, b)| v | (a ^ b)) == 0
}
fn name(value: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 64 || value.chars().any(char::is_control) {
        return invalid("Use a participant name of 1 to 64 bytes without control characters");
    }
    Ok(value.into())
}
pub fn private_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
}
pub fn private_endpoint(endpoint: &str) -> Result<SocketAddr> {
    let address: SocketAddr = endpoint
        .trim()
        .parse()
        .map_err(|_| fail("Enter a private IPv4 address and port"))?;
    if !matches!(address,SocketAddr::V4(v)if private_ipv4(*v.ip())) || address.port() == 0 {
        return invalid("Use a private LAN, loopback or VPN IPv4 endpoint; wildcard/public addresses are refused");
    }
    Ok(address)
}
pub fn write_frame(stream: &mut impl Write, data: &[u8]) -> Result<()> {
    if data.is_empty() || data.len() > MAX_FRAME_BYTES {
        return invalid("SparkLink frame exceeds its supported size");
    }
    stream.write_all(&(data.len() as u32).to_be_bytes())?;
    stream.write_all(data)?;
    stream.flush()?;
    Ok(())
}
pub fn read_frame(stream: &mut impl Read) -> Result<Vec<u8>> {
    let mut prefix = [0; 4];
    stream.read_exact(&mut prefix)?;
    let size = u32::from_be_bytes(prefix) as usize;
    if size == 0 || size > MAX_FRAME_BYTES {
        return invalid("Invalid or oversized SparkLink frame");
    }
    let mut bytes = vec![0; size];
    stream.read_exact(&mut bytes)?;
    Ok(bytes)
}
fn send(stream: &mut impl Write, value: &impl Serialize) -> Result<()> {
    write_frame(stream, &serde_json::to_vec(value)?)
}
fn receive<T: serde::de::DeserializeOwned>(stream: &mut impl Read) -> Result<T> {
    Ok(serde_json::from_slice(&read_frame(stream)?)?)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub id: String,
    pub name: String,
    pub role: String,
    pub online: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub author: String,
    pub kind: String,
    pub revision: u64,
    pub accepted_at: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseView {
    pub target: String,
    pub author: String,
    pub remaining_ms: u128,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkshopPreview {
    pub author: String,
    pub brush: crate::studio_workshop::BrushTransform,
    pub remaining_ms: u128,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub session_id: String,
    pub revision: u64,
    pub document: QuickForgeDocument,
    pub peers: usize,
    pub last_author: String,
    pub detail: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game: Option<GameBinding>,
    pub author_id: String,
    pub role: String,
    pub encrypted: bool,
    pub participants: Vec<Presence>,
    pub history: Vec<Activity>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub acknowledged_operation_id: Option<String>,
    pub durable: bool,
    pub leases: Vec<LeaseView>,
    pub workshop_previews: Vec<WorkshopPreview>,
    pub acknowledged_operations: usize,
    pub operation_limit: usize,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Heartbeat {
    session_id: String,
    revision: u64,
    peers: usize,
    last_author: String,
    role: String,
    participants: Vec<Presence>,
    history: Vec<Activity>,
    can_undo: bool,
    can_redo: bool,
    leases: Vec<LeaseView>,
    workshop_previews: Vec<WorkshopPreview>,
    acknowledged_operations: usize,
    operation_limit: usize,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Command {
    Join {
        name: String,
    },
    Poll {
        revision: Option<u64>,
    },
    Propose {
        operation_id: String,
        revision: u64,
        document: QuickForgeDocument,
    },
    Reverse {
        operation_id: String,
        redo: bool,
    },
    Preview {
        revision: u64,
        brush: Option<crate::studio_workshop::BrushTransform>,
    },
    Leave,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: u32,
    key: String,
    client: String,
    credential: String,
    command: Command,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    view: Option<View>,
    unchanged: Option<Heartbeat>,
    error: Option<String>,
}
struct Room {
    sealed: bool,
    journal: Journal,
    storage: Option<Storage>,
    online: BTreeMap<String, Instant>,
    rates: BTreeMap<String, VecDeque<Instant>>,
    editor_key: String,
    viewer_key: String,
    host_name: String,
    game: Option<GameBinding>,
    encrypted: bool,
    leases: BTreeMap<String, (String, Instant)>,
    previews: BTreeMap<String, (crate::studio_workshop::BrushTransform, Instant)>,
}
impl Room {
    fn publish(&mut self, next: Journal) -> Result<()> {
        if self.sealed { return invalid("This session rolled over. Retain any pending draft and join the host's new private invitation."); }
        if let Some(storage) = &mut self.storage {
            storage.store(&next)?;
        }
        self.journal = next;
        Ok(())
    }
    fn commit(&mut self, author: &str, next: Journal) -> Result<()> {
        let targets =
            crate::forge_session::structural_targets(&self.journal.document, &next.document);
        self.leases.retain(|_, (_, until)| *until > Instant::now());
        for target in &targets {
            if self
                .leases
                .get(target)
                .is_some_and(|(owner, _)| owner != author)
            {
                return invalid(format!("Structure ownership conflict: {target} is being edited by another creator. Your draft is retained; independent brushes remain editable."));
            }
        }
        self.publish(next)?;
        self.previews.clear();
        for target in targets {
            self.leases.insert(
                target,
                (author.into(), Instant::now() + Duration::from_secs(3)),
            );
        }
        Ok(())
    }
    fn preview(
        &mut self,
        author: &str,
        revision: u64,
        brush: Option<crate::studio_workshop::BrushTransform>,
    ) -> Result<()> {
        if self.sealed {return invalid("This session rolled over. Retain your draft and join the new private invitation.");}
        if author != "host"
            && self
                .journal
                .members
                .get(author)
                .is_none_or(|m| m.revoked || m.role != Role::Editor)
        {
            return invalid("Viewing permission cannot publish Workshop drag previews");
        }
        self.previews
            .retain(|_, (_, until)| *until > Instant::now());
        if let Some(brush) = brush {
            // A stale drag never overlays a replacement source revision.
            if revision != self.journal.revision {
                self.previews.remove(author);
                return Ok(());
            }
            brush.validate(&self.journal.document)?;
            if !self.previews.contains_key(author) && self.previews.len() >= MAX_PARTICIPANTS {
                return invalid("Too many active Workshop previews");
            }
            self.previews.insert(
                author.into(),
                (brush, Instant::now() + Duration::from_millis(1800)),
            );
        } else {
            self.previews.remove(author);
        }
        Ok(())
    }
    fn online(&self, id: &str) -> bool {
        self.online
            .get(id)
            .is_some_and(|t| t.elapsed() < Duration::from_secs(10))
    }
    fn view(&self, author: &str, ack: Option<String>) -> View {
        let mut participants = vec![Presence {
            id: "host".into(),
            name: self.host_name.clone(),
            role: "owner".into(),
            online: true,
        }];
        participants.extend(
            self.journal
                .members
                .values()
                .filter(|m| !m.revoked)
                .map(|m| Presence {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    role: if m.role == Role::Editor {
                        "editor"
                    } else {
                        "viewer"
                    }
                    .into(),
                    online: self.online(&m.id),
                }),
        );
        let role = if author == "host" {
            "owner"
        } else if self
            .journal
            .members
            .get(author)
            .is_some_and(|m| m.role == Role::Editor)
        {
            "editor"
        } else {
            "viewer"
        };
        let workshop_previews = self
            .previews
            .iter()
            .filter(|(id, _)| {
                **id == "host"
                    || self
                        .journal
                        .members
                        .get(*id)
                        .is_some_and(|m| !m.revoked && m.role == Role::Editor)
                        && self.online(id)
            })
            .filter(|(_, (_, until))| *until > Instant::now())
            .map(|(author, (brush, until))| WorkshopPreview {
                author: author.clone(),
                brush: brush.clone(),
                remaining_ms: until.saturating_duration_since(Instant::now()).as_millis(),
            })
            .collect();
        View{session_id:self.journal.session_id.clone(),revision:self.journal.revision,document:self.journal.document.clone(),peers:participants.iter().filter(|p|p.online).count(),last_author:self.journal.transactions.back().map_or("host",|t|t.author.as_str()).into(),detail:"Shared source, including bounded Workshop brush edits. Native/game-side replication has separate acceptance gates.".into(),game:self.game.clone(),author_id:author.into(),role:role.into(),encrypted:self.encrypted,durable:self.storage.is_some(),leases:self.leases.iter().filter(|(_,(_,until))|*until>Instant::now()).map(|(target,(author,until))|LeaseView{target:target.clone(),author:author.clone(),remaining_ms:until.saturating_duration_since(Instant::now()).as_millis()}).collect(),workshop_previews,acknowledged_operations:self.journal.acknowledged_operations(),operation_limit:self.journal.operation_limit(),participants,history:self.journal.transactions.iter().rev().take(12).map(|t|Activity{id:t.id.clone(),author:t.author.clone(),kind:format!("{:?}",t.kind).to_ascii_lowercase(),revision:t.revision,accepted_at:t.accepted_at.clone()}).collect(),can_undo:role!="viewer"&&self.journal.can_undo(author),can_redo:role!="viewer"&&self.journal.can_redo(author),acknowledged_operation_id:ack}
    }
    fn heartbeat(view: View) -> Heartbeat {
        Heartbeat {
            session_id: view.session_id,
            revision: view.revision,
            peers: view.peers,
            last_author: view.last_author,
            role: view.role,
            participants: view.participants,
            history: view.history,
            can_undo: view.can_undo,
            can_redo: view.can_redo,
            leases: view.leases,
            workshop_previews: view.workshop_previews,
            acknowledged_operations: view.acknowledged_operations,
            operation_limit: view.operation_limit,
        }
    }
    fn rate(&mut self, id: &str) -> Result<()> {
        let times = self.rates.entry(id.into()).or_default();
        while times
            .front()
            .is_some_and(|t| t.elapsed() > Duration::from_secs(1))
        {
            times.pop_front();
        }
        if times.len() >= 12 {
            return invalid("SparkLink request rate exceeded; wait before retrying");
        }
        times.push_back(Instant::now());
        Ok(())
    }
    fn authenticate(&self, request: &Request) -> Result<()> {
        let hash = credential_hash(&request.credential)?;
        let member = self
            .journal
            .members
            .get(&request.client)
            .ok_or_else(|| fail("Join this session before sending edits"))?;
        if member.revoked || !equal(&member.credential_sha256, &hash) {
            return invalid("Participant authentication failed or was revoked");
        }
        Ok(())
    }
    fn handle(&mut self, r: Request) -> Result<Response> {
        if self.sealed && !matches!(r.command,Command::Leave) {
            return invalid("This session rolled over. Retain any pending draft and join the host's new private invitation.");
        }
        if r.schema_version != PROTOCOL_VERSION {
            return invalid("SparkLink protocol differs; use matching Spark versions");
        }
        uuid::Uuid::parse_str(&r.client).map_err(|_| fail("Invalid participant identity"))?;
        credential_hash(&r.credential)?;
        match r.command {
            Command::Join {
                name: ref display_name,
            } => {
                let role = if equal(&r.key, &self.editor_key) {
                    Role::Editor
                } else if equal(&r.key, &self.viewer_key) {
                    Role::Viewer
                } else {
                    return invalid("Invitation is invalid or revoked");
                };
                if !self.online(&r.client)
                    && self
                        .online
                        .values()
                        .filter(|t| t.elapsed() < Duration::from_secs(10))
                        .count()
                        >= MAX_PARTICIPANTS - 1
                {
                    return invalid("This SparkLink session has eight online participants");
                }
                let mut next = self.journal.clone();
                let display_name = name(display_name)?;
                if next.members.contains_key(&r.client) {
                    self.authenticate(&r)?;
                } else {
                    if next.members.len() >= 64 {
                        return invalid("This session's participant history is full; host a new session without discarding current work");
                    }
                    next.members.insert(
                        r.client.clone(),
                        Member {
                            id: r.client.clone(),
                            name: display_name,
                            role,
                            credential_sha256: credential_hash(&r.credential)?,
                            revoked: false,
                        },
                    );
                    self.publish(next)?;
                }
                self.online.insert(r.client.clone(), Instant::now());
            }
            _ => {
                self.authenticate(&r)?;
                if !matches!(r.command, Command::Leave) && !self.online(&r.client) {
                    return invalid("Your participant lease expired. Rejoin to reconcile the retained local draft.");
                }
                self.rate(&r.client)?;
                if !matches!(r.command, Command::Leave) {
                    self.online.insert(r.client.clone(), Instant::now());
                }
            }
        }
        let mut ack = None;
        let mut unchanged = false;
        match r.command {
            Command::Join { .. } => {}
            Command::Leave => {
                self.online.remove(&r.client);
                self.rates.remove(&r.client);
                self.previews.remove(&r.client);
            }
            Command::Poll { revision } => unchanged = revision == Some(self.journal.revision),
            Command::Preview { revision, brush } => {
                self.preview(&r.client, revision, brush)?;
                unchanged = revision == self.journal.revision;
            }
            Command::Propose {
                operation_id,
                revision,
                document,
            } => {
                if self.journal.members[&r.client].role != Role::Editor {
                    return invalid("Viewers cannot change the shared project");
                }
                let next = self
                    .journal
                    .propose(&operation_id, &r.client, revision, document)?;
                self.commit(&r.client, next)?;
                ack = Some(operation_id);
            }
            Command::Reverse { operation_id, redo } => {
                if self.journal.members[&r.client].role != Role::Editor {
                    return invalid("Viewers cannot undo another creator's project");
                }
                let next = self.journal.reverse(&operation_id, &r.client, redo)?;
                self.commit(&r.client, next)?;
                ack = Some(operation_id);
            }
        }
        let view = self.view(&r.client, ack);
        Ok(if unchanged {
            Response {
                view: None,
                unchanged: Some(Self::heartbeat(view)),
                error: None,
            }
        } else {
            Response {
                view: Some(view),
                unchanged: None,
                error: None,
            }
        })
    }
}
pub struct Host {
    room: Mutex<Room>,
    pub endpoint: SocketAddr,
    pub network_scope: NetworkScope,
    stop: AtomicBool,
    started: Instant,
    tls: Option<Arc<rustls::ServerConfig>>,
    pub certificate: Option<String>,
    in_flight: AtomicUsize,
}
impl Host {
    pub fn start(document: QuickForgeDocument, lan: bool) -> Result<Arc<Self>> {
        Self::start_with_game(document, lan, None)
    }
    pub fn start_with_game(
        document: QuickForgeDocument,
        lan: bool,
        game: Option<GameBinding>,
    ) -> Result<Arc<Self>> {
        Self::start_room(
            Journal::new(document)?,
            if lan {
                Ipv4Addr::UNSPECIFIED
            } else {
                Ipv4Addr::LOCALHOST
            },
            game,
            None,
            None,
            "Host",
            NetworkScope::Private,
        )
    }
    pub fn persistent(
        document: QuickForgeDocument,
        bind: Ipv4Addr,
        game: Option<GameBinding>,
        root: &Path,
        host_name: &str,
        secure: bool,
    ) -> Result<Arc<Self>> {
        Self::persistent_scoped(
            document,
            bind,
            game,
            root,
            host_name,
            secure,
            NetworkScope::Private,
        )
    }
    pub fn persistent_scoped(
        document: QuickForgeDocument,
        bind: Ipv4Addr,
        game: Option<GameBinding>,
        root: &Path,
        host_name: &str,
        secure: bool,
        network_scope: NetworkScope,
    ) -> Result<Arc<Self>> {
        if !network_scope.allows(bind) || (network_scope == NetworkScope::RadminVpn && !secure) {
            return invalid("Use the selected LAN/VPN address; Radmin sessions require pinned TLS");
        }
        let journal = Journal::new(document)?;
        let storage = Storage::create(root, &journal)?;
        Self::start_room(
            journal,
            bind,
            game,
            Some(storage),
            if secure {
                Some(studio_tls::identity()?)
            } else {
                None
            },
            host_name,
            network_scope,
        )
    }
    pub fn recover(
        root: &Path,
        bind: Ipv4Addr,
        game: Option<GameBinding>,
        host_name: &str,
    ) -> Result<Arc<Self>> {
        Self::recover_scoped(root, bind, game, host_name, NetworkScope::Private)
    }
    pub fn recover_scoped(
        root: &Path,
        bind: Ipv4Addr,
        game: Option<GameBinding>,
        host_name: &str,
        network_scope: NetworkScope,
    ) -> Result<Arc<Self>> {
        if !network_scope.allows(bind) {
            return invalid("Use the selected LAN/VPN recovery address");
        }
        let (storage, journal) = Storage::open(root)?;
        Self::start_room(
            journal,
            bind,
            game,
            Some(storage),
            Some(studio_tls::identity()?),
            host_name,
            network_scope,
        )
    }
    fn start_room(
        journal: Journal,
        bind: Ipv4Addr,
        game: Option<GameBinding>,
        storage: Option<Storage>,
        tls: Option<studio_tls::Identity>,
        host_name: &str,
        network_scope: NetworkScope,
    ) -> Result<Arc<Self>> {
        journal.validate()?;
        if serde_json::to_vec(&journal.document)?.len() > MAX_FRAME_BYTES / 2 {
            return invalid("Source document exceeds the SparkLink session bound");
        }
        if let Some(g) = &game {
            g.validate()?;
        }
        let host_name = name(host_name)?;
        let listener = TcpListener::bind(SocketAddrV4::new(bind, 0))?;
        listener.set_nonblocking(true)?;
        let host = Arc::new(Self {
            endpoint: listener.local_addr()?,
            network_scope,
            stop: AtomicBool::new(false),
            started: Instant::now(),
            tls: tls.as_ref().map(|t| t.config.clone()),
            certificate: tls.map(|t| t.certificate),
            in_flight: AtomicUsize::new(0),
            room: Mutex::new(Room {
                sealed: false,
                journal,
                storage,
                online: BTreeMap::new(),
                rates: BTreeMap::new(),
                editor_key: uuid::Uuid::new_v4().simple().to_string(),
                viewer_key: uuid::Uuid::new_v4().simple().to_string(),
                host_name,
                game,
                encrypted: false,
                leases: BTreeMap::new(),
                previews: BTreeMap::new(),
            }),
        });
        locked(&host.room)?.encrypted = host.tls.is_some();
        let weak = Arc::downgrade(&host);
        std::thread::spawn(move || loop {
            let Some(host) = weak.upgrade() else { break };
            if host.stop.load(Ordering::Relaxed) {
                break;
            }
            match listener.accept() {
                Ok((socket, address)) => {
                    if !matches!(address,SocketAddr::V4(v)if host.network_scope.allows(*v.ip()))
                        || host.in_flight.load(Ordering::Relaxed) >= 8
                    {
                        continue;
                    }
                    if socket.set_nonblocking(false).is_err() {
                        continue;
                    }
                    let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
                    let _ = socket.set_write_timeout(Some(Duration::from_secs(3)));
                    host.in_flight.fetch_add(1, Ordering::Relaxed);
                    std::thread::spawn(move || {
                        struct Guard(Arc<Host>);
                        impl Drop for Guard {
                            fn drop(&mut self) {
                                self.0.in_flight.fetch_sub(1, Ordering::Relaxed);
                            }
                        }
                        let guard = Guard(host);
                        if let Some(config) = &guard.0.tls {
                            if let Ok(mut stream) = studio_tls::accept(socket, config.clone()) {
                                let response = guard.0.handle(receive(&mut stream));
                                let _ = send(&mut stream, &response);
                            }
                        } else {
                            let mut stream = socket;
                            let response = guard.0.handle(receive(&mut stream));
                            let _ = send(&mut stream, &response);
                        }
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    drop(host);
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => break,
            }
        });
        Ok(host)
    }
    fn open(&self) -> Result<()> {
        if self.stop.load(Ordering::Relaxed)
            || self.started.elapsed() > Duration::from_secs(24 * 60 * 60)
        {
            return invalid(
                "This editing session closed or expired; accepted source remains recoverable",
            );
        }
        Ok(())
    }
    fn handle(&self, request: Result<Request>) -> Response {
        let result = (|| {
            self.open()?;
            locked(&self.room)?.handle(request?)
        })();
        match result {
            Ok(response) => response,
            Err(e) => Response {
                view: None,
                unchanged: None,
                error: Some(e.to_string().chars().take(2000).collect()),
            },
        }
    }
    pub fn key(&self) -> String {
        self.key_for(false)
    }
    pub fn key_for(&self, viewer: bool) -> String {
        locked(&self.room)
            .map(|r| {
                if viewer {
                    r.viewer_key.clone()
                } else {
                    r.editor_key.clone()
                }
            })
            .unwrap_or_default()
    }
    pub fn close(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
    /// Fence the old authority only after the new durable listener and its local
    /// recovery record exist. The room lock excludes late accepted proposals.
    /// Old journals and identities are preserved; fresh keys require reinvites.
    pub fn rollover(
        &self, expected_revision:u64, root:&Path, host_name:&str,
        record:impl FnOnce(&str)->Result<()>,
    )->Result<Arc<Self>> {
        self.open()?;
        let mut room=locked(&self.room)?;
        if room.sealed || room.journal.revision!=expected_revision {
            return invalid("The shared revision changed before rollover. Refresh and review the latest acknowledged source first.");
        }
        if room.storage.is_none() || !room.encrypted {
            return invalid("Rollover requires a durable encrypted SparkLink session");
        }
        let SocketAddr::V4(address)=self.endpoint else{return invalid("Rollover requires a private IPv4 listener")};
        let next=Self::persistent_scoped(room.journal.document.clone(),*address.ip(),room.game.clone(),root,host_name,true,self.network_scope)?;
        let session_id=locked(&next.room)?.journal.session_id.clone();
        if let Err(reason)=record(&session_id){next.close();return Err(reason);}
        room.sealed=true;
        room.previews.clear();
        self.close();
        Ok(next)
    }
    pub fn role(&self, id: &str, role: Role, revoke: bool) -> Result<View> {
        self.open()?;
        let mut room = locked(&self.room)?;
        let mut next = room.journal.clone();
        let member = next
            .members
            .get_mut(id)
            .ok_or_else(|| fail("Participant no longer belongs to this session"))?;
        member.role = role;
        member.revoked = revoke;
        room.publish(next)?;
        if revoke {
            room.leases.retain(|_, (author, _)| author != id);
            room.online.remove(id);
            room.editor_key = uuid::Uuid::new_v4().simple().to_string();
            room.viewer_key = uuid::Uuid::new_v4().simple().to_string();
        }
        Ok(room.view("host", None))
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}
#[derive(Clone)]
pub struct Guest {
    address: SocketAddr,
    network_scope: NetworkScope,
    key: String,
    client: String,
    credential: String,
    session_id: String,
    timeout: Duration,
    closed: Arc<AtomicBool>,
    tls: Option<Arc<rustls::ClientConfig>>,
    name: String,
    cached: Arc<Mutex<Option<View>>>,
}
impl Guest {
    pub fn join(endpoint: &str, key: &str) -> Result<(Self, View)> {
        Self::join_with_timeout(endpoint, key, Duration::from_secs(3))
    }
    pub fn join_with_timeout(endpoint: &str, key: &str, timeout: Duration) -> Result<(Self, View)> {
        Self::join_studio(endpoint, key, None, "Editor", None, timeout)
    }
    pub fn join_studio(
        endpoint: &str,
        key: &str,
        certificate: Option<&str>,
        display_name: &str,
        identity: Option<(String, String)>,
        timeout: Duration,
    ) -> Result<(Self, View)> {
        Self::join_studio_scoped(
            endpoint,
            key,
            certificate,
            display_name,
            identity,
            timeout,
            NetworkScope::Private,
        )
    }
    pub fn join_studio_scoped(
        endpoint: &str,
        key: &str,
        certificate: Option<&str>,
        display_name: &str,
        identity: Option<(String, String)>,
        timeout: Duration,
        network_scope: NetworkScope,
    ) -> Result<(Self, View)> {
        if network_scope == NetworkScope::RadminVpn && certificate.is_none() {
            return invalid("Radmin VPN sessions require a certificate-pinned invitation");
        }
        let address = network_scope.endpoint(endpoint)?;
        let key = key.trim().to_ascii_lowercase();
        if key.len() != 32 || !key.bytes().all(|b| b.is_ascii_hexdigit()) {
            return invalid("A session key must contain 32 hexadecimal characters");
        }
        let (client, credential) =
            identity.unwrap_or_else(|| (uuid::Uuid::new_v4().to_string(), secret()));
        uuid::Uuid::parse_str(&client).map_err(|_| fail("Invalid participant identity"))?;
        credential_hash(&credential)?;
        let mut guest = Self {
            address,
            network_scope,
            key,
            client,
            credential,
            session_id: String::new(),
            timeout: timeout.min(Duration::from_secs(20)),
            closed: Arc::new(AtomicBool::new(false)),
            tls: certificate.map(studio_tls::client).transpose()?,
            name: name(display_name)?,
            cached: Arc::new(Mutex::new(None)),
        };
        let view = guest.request(Command::Join {
            name: guest.name.clone(),
        })?;
        guest.session_id = view.session_id.clone();
        Ok((guest, view))
    }
    pub fn identity(&self) -> (String, String) {
        (self.client.clone(), self.credential.clone())
    }
    fn request(&self, command: Command) -> Result<View> {
        self.request_once(command, true)
    }
    fn request_once(&self, command: Command, rejoin: bool) -> Result<View> {
        if self.closed.load(Ordering::Relaxed) && !matches!(command, Command::Leave) {
            return invalid("This editing session is closed");
        }
        let mut socket = TcpStream::connect_timeout(&self.address, Duration::from_secs(2))?;
        socket.set_read_timeout(Some(self.timeout))?;
        socket.set_write_timeout(Some(self.timeout))?;
        let request = Request {
            schema_version: PROTOCOL_VERSION,
            key: self.key.clone(),
            client: self.client.clone(),
            credential: self.credential.clone(),
            command,
        };
        let response: Response = if let Some(config) = &self.tls {
            let mut stream = studio_tls::connect(socket, config.clone())?;
            send(&mut stream, &request)?;
            receive(&mut stream)?
        } else {
            send(&mut socket, &request)?;
            receive(&mut socket)?
        };
        if let Some(error) = response.error {
            if rejoin && self.tls.is_some() && error=="Your participant lease expired. Rejoin to reconcile the retained local draft."
                && !matches!(&request.command,Command::Join{..}|Command::Leave) {
                // Reauthenticate the SAME durable identity, then replay exactly
                // the retained command/operation ID once. Revocation still fails.
                self.request_once(Command::Join{name:self.name.clone()},false)?;
                return self.request_once(request.command,false);
            }
            return invalid(error);
        }
        let mut cache = locked(&self.cached)?;
        let view = if let Some(view) = response.view {
            quickforge::validate_portable_document(&view.document)?;
            if view.participants.len() > 65 || view.history.len() > 12 {
                return invalid("Host returned oversized participant/activity metadata");
            }
            view
        } else {
            let update = response
                .unchanged
                .ok_or_else(|| fail("Host returned no session state"))?;
            let mut view = cache
                .clone()
                .ok_or_else(|| fail("Missing source baseline for heartbeat"))?;
            if view.revision != update.revision || view.session_id != update.session_id {
                return invalid("Host heartbeat does not match the source baseline");
            }
            view.peers = update.peers;
            view.last_author = update.last_author;
            view.role = update.role;
            view.participants = update.participants;
            view.history = update.history;
            view.can_undo = update.can_undo;
            view.can_redo = update.can_redo;
            view.leases = update.leases;
            view.workshop_previews = update.workshop_previews;
            view.acknowledged_operations = update.acknowledged_operations;
            view.operation_limit = update.operation_limit;
            view.acknowledged_operation_id = None;
            view
        };
        if view.workshop_previews.len() > MAX_PARTICIPANTS
            || view.operation_limit != 4096
            || view.acknowledged_operations > view.operation_limit
        {
            return invalid("Host returned invalid bounded Workshop/session metadata");
        }
        for preview in &view.workshop_previews {
            if preview.remaining_ms > 1800
                || !view
                    .participants
                    .iter()
                    .any(|p| p.id == preview.author && p.role != "viewer" && p.online)
            {
                return invalid("Host returned an invalid Workshop preview author/lifetime");
            }
            preview.brush.validate(&view.document)?;
        }
        if !self.session_id.is_empty() && view.session_id != self.session_id {
            return invalid("Host session changed; join its new invitation");
        }
        if cache
            .as_ref()
            .is_some_and(|old| old.revision > view.revision)
        {
            // A newer poll can arrive before an older proposal response. Keep
            // the newer source, but preserve that response's genuine ack so a
            // successfully persisted operation is not reported as unacknowledged.
            let mut latest = cache.as_ref().unwrap().clone();
            latest.acknowledged_operation_id = view.acknowledged_operation_id;
            return Ok(latest);
        }
        *cache = Some(view.clone());
        Ok(view)
    }
}
#[derive(Clone)]
pub enum Peer {
    Host(Arc<Host>),
    Guest(Guest),
}
impl Peer {
    pub fn preview(
        &self,
        revision: u64,
        brush: Option<crate::studio_workshop::BrushTransform>,
    ) -> Result<View> {
        match self {
            Self::Host(h) => {
                h.open()?;
                let mut room = locked(&h.room)?;
                room.preview("host", revision, brush)?;
                Ok(room.view("host", None))
            }
            Self::Guest(g) => g.request(Command::Preview { revision, brush }),
        }
    }
    pub fn network_scope(&self) -> NetworkScope {
        match self {
            Self::Host(h) => h.network_scope,
            Self::Guest(g) => g.network_scope,
        }
    }
    pub fn poll(&self) -> Result<View> {
        match self {
            Self::Host(h) => {
                h.open()?;
                Ok(locked(&h.room)?.view("host", None))
            }
            Self::Guest(g) => {
                let revision = locked(&g.cached)?.as_ref().map(|v| v.revision);
                g.request(Command::Poll { revision })
            }
        }
    }
    pub fn resume(&self) -> Result<View> {
        match self {
            Self::Host(_) => self.poll(),
            Self::Guest(g) => g.request(Command::Join {
                name: g.name.clone(),
            }),
        }
    }
    pub fn propose(&self, revision: u64, document: QuickForgeDocument) -> Result<View> {
        self.propose_with_id(&uuid::Uuid::new_v4().to_string(), revision, document)
    }
    pub fn propose_with_id(
        &self,
        id: &str,
        revision: u64,
        document: QuickForgeDocument,
    ) -> Result<View> {
        match self {
            Self::Host(h) => {
                h.open()?;
                let mut room = locked(&h.room)?;
                let next = room.journal.propose(id, "host", revision, document)?;
                room.commit("host", next)?;
                Ok(room.view("host", Some(id.into())))
            }
            Self::Guest(g) => g.request(Command::Propose {
                operation_id: id.into(),
                revision,
                document,
            }),
        }
    }
    pub fn reverse(&self, id: &str, redo: bool) -> Result<View> {
        match self {
            Self::Host(h) => {
                h.open()?;
                let mut room = locked(&h.room)?;
                let next = room.journal.reverse(id, "host", redo)?;
                room.commit("host", next)?;
                Ok(room.view("host", Some(id.into())))
            }
            Self::Guest(g) => g.request(Command::Reverse {
                operation_id: id.into(),
                redo,
            }),
        }
    }
    pub fn leave(&self) {
        match self {
            Self::Host(h) => h.close(),
            Self::Guest(g) => {
                if !g.closed.swap(true, Ordering::Relaxed) {
                    let _ = g.request(Command::Leave);
                }
            }
        }
    }
    pub fn role(&self) -> &'static str {
        match self {
            Self::Host(_) => "host",
            Self::Guest(_) => "guest",
        }
    }
    pub fn key(&self) -> String {
        match self {
            Self::Host(h) => h.key(),
            Self::Guest(g) => g.key.clone(),
        }
    }
    pub fn certificate(&self) -> Option<String> {
        match self {
            Self::Host(h) => h.certificate.clone(),
            Self::Guest(_) => None,
        }
    }
    pub fn endpoint(&self) -> SocketAddr {
        match self {
            Self::Host(h) => h.endpoint,
            Self::Guest(g) => g.address,
        }
    }
}
#[cfg(test)]
mod studio_tests {
    #[test]
    fn rollover_fences_the_old_authority_and_preserves_both_durable_journals() {
        let temp=tempfile::tempdir().unwrap();
        let doc=crate::bsp_workshop::example().unwrap();
        let old_dir=temp.path().join("old");
        let host=Host::persistent(doc.clone(),Ipv4Addr::LOCALHOST,None,&old_dir,"Owner",true).unwrap();
        let (guest,joined)=Guest::join_studio(&host.endpoint.to_string(),&host.key(),host.certificate.as_deref(),"Artist",None,Duration::from_secs(2)).unwrap();
        let artist=Peer::Guest(guest);
        let mut edited=doc.clone();edited.workshop.as_mut().unwrap().brushes[0].position[0]=0.25;
        let committed=artist.propose(joined.revision,edited.clone()).unwrap();
        let old_head=std::fs::read(old_dir.join("head.json")).unwrap();
        // A failed metadata write leaves the previous host usable and unchanged.
        assert!(host.rollover(committed.revision,&temp.path().join("failed"),"Owner",|_|invalid("disk fixture failure")).is_err());
        assert_eq!(artist.poll().unwrap().revision,committed.revision);
        assert!(host.rollover(0,&temp.path().join("stale"),"Owner",|_|Ok(())).is_err());
        let new_dir=temp.path().join("new");
        let next=host.rollover(committed.revision,&new_dir,"Owner",|id|{assert_ne!(id,committed.session_id);Ok(())}).unwrap();
        assert_ne!(next.key(),host.key());
        assert_ne!(next.certificate,host.certificate);
        assert!(Peer::Host(host.clone()).propose(committed.revision,doc.clone()).is_err());
        // A request that already passed Host::open still cannot publish after
        // the room lock was released by rollover.
        { let mut room=host.room.lock().unwrap();let candidate=room.journal.propose(&uuid::Uuid::new_v4().to_string(),"host",committed.revision,doc.clone()).unwrap();assert!(room.commit("host",candidate).is_err()); }
        assert_eq!(std::fs::read(old_dir.join("head.json")).unwrap(),old_head);
        let (joined_new,view)=Guest::join_studio(&next.endpoint.to_string(),&next.key(),next.certificate.as_deref(),"Artist",None,Duration::from_secs(2)).unwrap();
        assert_eq!(view.document,edited);assert_eq!(view.revision,0);assert_eq!(view.acknowledged_operations,0);
        assert!(!view.can_undo);assert!(new_dir.join("head.json").exists());
        Peer::Guest(joined_new).leave();next.close();host.close();
    }
    #[test]
    fn workshop_drag_previews_are_ephemeral_bounded_and_viewers_cannot_publish_them() {
        let temp = tempfile::tempdir().unwrap();
        let doc = crate::bsp_workshop::example().unwrap();
        let directory = temp.path().join("session");
        let host = Host::persistent(
            doc.clone(),
            Ipv4Addr::LOCALHOST,
            None,
            &directory,
            "Owner",
            true,
        )
        .unwrap();
        let (guest, view) = Guest::join_studio(
            &host.endpoint.to_string(),
            &host.key(),
            host.certificate.as_deref(),
            "Artist",
            None,
            Duration::from_secs(3),
        )
        .unwrap();
        let artist = Peer::Guest(guest);
        let owner = Peer::Host(host.clone());
        let head = std::fs::read(directory.join("head.json")).unwrap();
        let b = &doc.workshop.as_ref().unwrap().brushes[0];
        let preview = crate::studio_workshop::BrushTransform {
            brush_id: b.id.clone(),
            position: [0.125, 0., 0.],
            rotation: b.rotation,
            scale: b.scale,
        };
        artist
            .preview(view.revision, Some(preview.clone()))
            .unwrap();
        let current = owner.poll().unwrap();
        assert_eq!(current.revision, 0);
        assert_eq!(current.acknowledged_operations, 0);
        assert_eq!(current.workshop_previews.len(), 1);
        assert_eq!(std::fs::read(directory.join("head.json")).unwrap(), head);
        let mut invalid = preview.clone();
        invalid.scale[0] = 2000.;
        assert!(artist.preview(0, Some(invalid)).is_err());
        let (viewer, _) = Guest::join_studio(
            &host.endpoint.to_string(),
            &host.key_for(true),
            host.certificate.as_deref(),
            "Viewer",
            None,
            Duration::from_secs(3),
        )
        .unwrap();
        assert!(Peer::Guest(viewer).preview(0, Some(preview)).is_err());
        for (_, (_, until)) in &mut host.room.lock().unwrap().previews {
            *until = Instant::now() - Duration::from_millis(1);
        }
        assert!(owner.poll().unwrap().workshop_previews.is_empty());
        let mut next = doc;
        next.workshop.as_mut().unwrap().brushes[0].position[0] = 0.25;
        assert_eq!(artist.propose(0, next).unwrap().revision, 1);
        owner.leave();
    }
    #[test]
    fn expired_presence_reauthenticates_same_author_and_replays_the_retained_id_once() {
        let doc = crate::bsp_workshop::example().unwrap();
        let temp=tempfile::tempdir().unwrap();
        let host = Host::persistent(doc.clone(),std::net::Ipv4Addr::LOCALHOST,None,&temp.path().join("session"),"Owner",true).unwrap();
        let (guest, first) = Guest::join_studio(&host.endpoint.to_string(), &host.key(),host.certificate.as_deref(),"Artist",None,Duration::from_secs(3)).unwrap();
        let peer = Peer::Guest(guest);
        host.room.lock().unwrap().online.insert(
            first.author_id.clone(),
            Instant::now() - Duration::from_secs(11),
        );
        let mut next = doc;
        next.workshop.as_mut().unwrap().brushes[0].position[0] = 0.5;
        let operation = uuid::Uuid::new_v4().to_string();
        let result = peer.propose_with_id(&operation, 0, next.clone()).unwrap();
        assert_eq!(result.author_id, first.author_id);
        assert_eq!(result.revision, 1);
        assert_eq!(
            peer.propose_with_id(&operation, 0, next).unwrap().revision,
            1
        );
        assert_eq!(host.room.lock().unwrap().journal.members.len(), 1);
        host.role(&first.author_id, Role::Editor, true).unwrap();
        assert!(peer.poll().is_err());
        host.close();
    }
    use super::*;
    #[test]
    fn structure_ownership_is_scoped_and_expires_without_a_project_lock() {
        let doc = quickforge::create_arena("leases", "emptyArena").unwrap();
        let host = Host::start(doc.clone(), false).unwrap();
        let owner = Peer::Host(host.clone());
        let (a, _) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        let artist = Peer::Guest(a);
        let mut next = doc.clone();
        next.geometry[0].steps += 1;
        let current = owner.propose(0, next).unwrap();
        let mut independent = current.document.clone();
        independent.geometry[0].position[0] += 1.;
        let current = artist.propose(current.revision, independent).unwrap();
        let mut topology = current.document.clone();
        topology.geometry[0].steps += 1;
        assert!(artist
            .propose(current.revision, topology.clone())
            .unwrap_err()
            .to_string()
            .contains("ownership"));
        for (_, (_, until)) in &mut host.room.lock().unwrap().leases {
            *until = Instant::now() - Duration::from_secs(1);
        }
        assert!(artist.propose(current.revision, topology).is_ok());
        artist.leave();
        owner.leave();
    }
    #[test]
    fn independent_environment_fields_preserve_both_authors() {
        let mut doc = quickforge::create_arena("environment", "emptyArena").unwrap();
        doc.environment = Some(Default::default());
        let host = Host::start(doc.clone(), false).unwrap();
        let (a, _) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        let owner = Peer::Host(host.clone());
        let artist = Peer::Guest(a);
        let mut sun = doc.clone();
        sun.environment.as_mut().unwrap().sun_intensity = 3.;
        let mut fog = doc.clone();
        fog.environment.as_mut().unwrap().fog_far = 150.;
        owner.propose(0, sun).unwrap();
        let merged = artist.propose(0, fog).unwrap();
        assert_eq!(
            merged.document.environment.as_ref().unwrap().sun_intensity,
            3.
        );
        assert_eq!(merged.document.environment.as_ref().unwrap().fog_far, 150.);
        artist.leave();
        owner.leave();
    }
    #[test]
    fn three_real_tls_peers_merge_conflict_undo_and_viewer_permissions() {
        let tmp = tempfile::tempdir().unwrap();
        let doc = quickforge::create_arena("three creators", "emptyArena").unwrap();
        let host = Host::persistent(
            doc.clone(),
            Ipv4Addr::LOCALHOST,
            None,
            &tmp.path().join("session"),
            "Owner",
            true,
        )
        .unwrap();
        let owner = Peer::Host(host.clone());
        let (a, _) = Guest::join_studio(
            &host.endpoint.to_string(),
            &host.key(),
            host.certificate.as_deref(),
            "Artist",
            None,
            Duration::from_secs(3),
        )
        .unwrap();
        let (b, joined) = Guest::join_studio(
            &host.endpoint.to_string(),
            &host.key(),
            host.certificate.as_deref(),
            "Builder",
            None,
            Duration::from_secs(3),
        )
        .unwrap();
        assert_eq!(joined.peers, 3);
        assert!(joined.encrypted);
        let mut x = doc.clone();
        x.geometry[0].position[0] += 1.;
        let mut y = doc.clone();
        y.geometry[0].position[1] += 2.;
        let id = uuid::Uuid::new_v4().to_string();
        let pa = Peer::Guest(a);
        let pb = Peer::Guest(b);
        pa.propose_with_id(&id, 0, x.clone()).unwrap();
        let merged = pb.propose(0, y).unwrap();
        assert_eq!(merged.revision, 2);
        assert_eq!(
            merged.document.geometry[0].position[0],
            doc.geometry[0].position[0] + 1.
        );
        assert_eq!(pa.propose_with_id(&id, 0, x).unwrap().revision, 2);
        let undone = pa
            .reverse(&uuid::Uuid::new_v4().to_string(), false)
            .unwrap();
        assert_eq!(
            undone.document.geometry[0].position[0],
            doc.geometry[0].position[0]
        );
        assert_eq!(
            undone.document.geometry[0].position[1],
            doc.geometry[0].position[1] + 2.
        );
        let redo = pa.reverse(&uuid::Uuid::new_v4().to_string(), true).unwrap();
        assert_eq!(redo.document, merged.document);
        let mut clash = doc.clone();
        clash.geometry[0].position[0] += 9.;
        assert!(pb.propose(0, clash).is_err());
        let (viewer, view) = Guest::join_studio(
            &host.endpoint.to_string(),
            &host.key_for(true),
            host.certificate.as_deref(),
            "Viewer",
            None,
            Duration::from_secs(3),
        )
        .unwrap();
        assert_eq!(view.role, "viewer");
        let viewer = Peer::Guest(viewer);
        assert!(viewer.propose(view.revision, doc.clone()).is_err());
        assert!(viewer
            .reverse(&uuid::Uuid::new_v4().to_string(), false)
            .is_err());
        assert_eq!(owner.poll().unwrap().revision, 4);
        assert_eq!(pb.poll().unwrap().document, redo.document);
        pa.leave();
        pb.leave();
        viewer.leave();
        owner.leave();
    }
    #[test]
    fn protocol_credential_and_frame_boundaries_refuse_untrusted_requests() {
        let host = Host::start(
            quickforge::create_arena("bounds", "emptyArena").unwrap(),
            false,
        )
        .unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let secret = secret();
        let request = Request {
            schema_version: 2,
            key: host.key(),
            client: id.clone(),
            credential: secret.clone(),
            command: Command::Join {
                name: "guest".into(),
            },
        };
        assert!(host.handle(Ok(request)).error.unwrap().contains("protocol"));
        let request = Request {
            schema_version: PROTOCOL_VERSION,
            key: "0".repeat(32),
            client: id,
            credential: secret,
            command: Command::Join {
                name: "guest".into(),
            },
        };
        assert!(host.handle(Ok(request)).error.is_some());
        assert!(read_frame(&mut std::io::Cursor::new(
            (MAX_FRAME_BYTES as u32 + 1).to_be_bytes()
        ))
        .is_err());
        assert!(private_endpoint("8.8.8.8:12345").is_err());
        host.close();
    }
}

#[cfg(test)]
mod legacy_regressions {
    use super::*;
    use crate::forge_session::{merge, portable};
    #[test]
    fn a_departed_or_expired_guest_cannot_reclaim_a_new_guests_slot() {
        let host = Host::start(
            quickforge::create_arena("leases", "emptyArena").unwrap(),
            false,
        )
        .unwrap();
        let (old, _) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        host.room
            .lock()
            .unwrap()
            .online
            .insert(old.client.clone(), Instant::now() - Duration::from_secs(11));
        assert!(Peer::Guest(old.clone())
            .poll()
            .unwrap_err()
            .to_string()
            .contains("lease expired"));
        let (new, _) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        Peer::Guest(old.clone()).leave();
        assert_eq!(Peer::Guest(new.clone()).poll().unwrap().peers, 2);
        assert!(Peer::Guest(old).poll().is_err());
        Peer::Guest(new).leave();
        host.close();
    }
    #[test]
    fn closed_host_clones_refuse_reads_and_writes() {
        let doc = quickforge::create_arena("closed", "emptyArena").unwrap();
        let host = Host::start(doc.clone(), false).unwrap();
        let peer = Peer::Host(host.clone());
        peer.leave();
        assert!(peer.poll().is_err());
        assert!(peer.propose(0, doc).is_err());
    }
    #[test]
    fn game_bindings_retain_map_identity_without_process_addresses() {
        let binding = GameBinding {
            runtime_id: "mccSteam".into(),
            scenario: "levels/test/bloodgulch/bloodgulch".into(),
            checksum: 42,
            tag_count: 100,
        };
        let host = Host::start_with_game(
            quickforge::create_arena("bound", "emptyArena").unwrap(),
            false,
            Some(binding.clone()),
        )
        .unwrap();
        let (guest, view) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        assert_eq!(view.game, Some(binding));
        let mut json = serde_json::to_value(view.game).unwrap();
        json["objectTable"] = 123.into();
        assert!(serde_json::from_value::<GameBinding>(json).is_err());
        Peer::Guest(guest).leave();
        host.close();
    }
    #[test]
    fn real_socket_two_editors_merge_independent_changes_and_reject_conflict() {
        let doc = quickforge::create_arena("shared", "emptyArena").unwrap();
        let host = Host::start(doc.clone(), false).unwrap();
        let (g, first) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        assert_eq!(first.peers, 2);
        let mut a = doc.clone();
        a.geometry[0].position[0] += 2.;
        let mut b = doc.clone();
        b.geometry[0].position[1] += 3.;
        let hp = Peer::Host(host.clone());
        hp.propose(0, a.clone()).unwrap();
        let latest = Peer::Guest(g.clone()).propose(0, b).unwrap();
        assert_eq!(
            latest.document.geometry[0].position,
            [
                a.geometry[0].position[0],
                doc.geometry[0].position[1] + 3.,
                a.geometry[0].position[2]
            ]
        );
        assert_eq!(latest.revision, 2);
        let (third, joined) = Guest::join(&host.endpoint.to_string(), &host.key()).unwrap();
        assert_eq!(joined.peers, 3);
        Peer::Guest(third).leave();
        let mut clash = doc;
        clash.geometry[0].position[0] += 9.;
        assert!(Peer::Guest(g.clone()).propose(0, clash).is_err());
        assert_eq!(hp.poll().unwrap().revision, 2);
        Peer::Guest(g).leave();
        hp.leave();
    }
    #[test]
    fn invalid_key_and_public_endpoint_cannot_join() {
        let h = Host::start(
            quickforge::create_arena("shared", "emptyArena").unwrap(),
            false,
        )
        .unwrap();
        assert!(Guest::join(&h.endpoint.to_string(), "00000000000000000000000000000000").is_err());
        assert!(Guest::join("8.8.8.8:1234", &h.key()).is_err());
        h.close();
    }
    #[test]
    fn peer_documents_never_include_local_source_project_ids() {
        let mut d = quickforge::create_arena("shared", "emptyArena").unwrap();
        let value = serde_json::to_value(portable(d.clone())).unwrap();
        assert!(value.get("sourcePath").is_none());
        d.environment = Some(Default::default());
        let mut next = d.clone();
        next.name = "guest edit".into();
        let mut current = d.clone();
        current.build_quality = "final".into();
        let r = merge(&d, &next, &current).unwrap();
        assert_eq!(r.name, "guest edit");
        assert_eq!(r.build_quality, "final");
    }
}

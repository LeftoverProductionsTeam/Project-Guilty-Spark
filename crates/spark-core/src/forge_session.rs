//! Two-editor private-LAN QuickForge sessions. Only typed source documents cross
//! this transport; no game files, local paths, executables or memory addresses.
use crate::{invalid,quickforge::{self,QuickForgeDocument},Result,SparkError};
use serde::{Deserialize,Serialize};
use std::{collections::{BTreeSet,VecDeque},io::{Read,Write},net::{Ipv4Addr,SocketAddr,SocketAddrV4,TcpListener,TcpStream},sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}},time::{Duration,Instant}};
const MAX_FRAME:usize=4*1024*1024;const MAX_HISTORY_BYTES:usize=32*1024*1024;
fn fail(message:impl Into<String>)->SparkError{SparkError::Invalid(message.into())}
pub fn portable(mut doc:QuickForgeDocument)->QuickForgeDocument {for placement in &mut doc.placements{placement.source_project_id=None;}doc}
/// Rebase independent property edits; a competing edit to the same property,
/// or a deletion of a changed entity, is refused before any shared mutation.
pub fn merge(base:&QuickForgeDocument,next:&QuickForgeDocument,current:&QuickForgeDocument)->Result<QuickForgeDocument>{
    let b=serde_json::to_value(base)?;let n=serde_json::to_value(next)?;let mut c=serde_json::to_value(current)?;
    for(key,value)in n.as_object().unwrap(){if b.get(key)==Some(value){continue;}
        if ["geometry","materials","placements","spawns","objectives"].contains(&key.as_str()){
            let old=b[key].as_array().unwrap();let new=value.as_array().unwrap();let result=c[key].as_array_mut().unwrap();
            let keys:BTreeSet<String>=old.iter().chain(new).map(|v|v["id"].as_str().unwrap().to_owned()).collect();
            for id in keys{let before=old.iter().find(|v|v["id"]==id);let after=new.iter().find(|v|v["id"]==id);if before==after{continue;}let index=result.iter().position(|v|v["id"]==id);
                match(before,after,index){
                    (None,Some(a),None)=>result.push(a.clone()),
                    (None,Some(a),Some(i))if result[i]==*a=>{},
                    (Some(b),None,Some(i))if result[i]==*b=>{result.remove(i);},
                    (Some(_),None,None)=>{},
                    (Some(b),Some(a),Some(i))=>{for(k,v)in a.as_object().unwrap(){if b.get(k)==Some(v){continue;}
                        if let (Some(before),Some(after),Some(current))=(b.get(k).and_then(|v|v.as_array()),v.as_array(),result[i].get(k).and_then(|v|v.as_array())){
                            if before.len()==3&&after.len()==3&&current.len()==3&&before.iter().chain(after).chain(current).all(|v|v.is_number()){
                                let mut merged=current.clone();for axis in 0..3{if before[axis]==after[axis]{continue;}if current[axis]!=before[axis]&&current[axis]!=after[axis]{return invalid(format!("Concurrent edit conflict: {key}/{id}/{k}/{axis}. Your local draft was retained."));}merged[axis]=after[axis].clone();}result[i][k]=serde_json::Value::Array(merged);continue;
                            }
                        }
                        if result[i].get(k)!=b.get(k)&&result[i].get(k)!=Some(v){return invalid(format!("Concurrent edit conflict: {key}/{id}/{k}. Your local draft was retained."));}result[i][k]=v.clone();}},
                    _=>return invalid(format!("Concurrent edit/delete conflict: {key}/{id}. Your local draft was retained.")),
                }
            }
        }else{if c.get(key)!=b.get(key)&&c.get(key)!=Some(value){return invalid(format!("Concurrent edit conflict: {key}. Your local draft was retained."));}c[key]=value.clone();}
    }
    let doc:QuickForgeDocument=serde_json::from_value(c)?;quickforge::validate_document(&doc)?;Ok(doc)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct GameBinding { pub runtime_id: String, pub scenario: String, pub checksum: u32, pub tag_count: u32 }
impl GameBinding {
    pub fn validate(&self) -> Result<()> {
        if self.runtime_id != "mccSteam" || self.scenario.len() > 256 || self.tag_count == 0 || self.tag_count > 65536 { return invalid("Unsupported loaded-game binding"); }
        crate::safe_relative(&self.scenario)?; Ok(())
    }
}
pub const PROTOCOL_VERSION: u32 = 2;
pub const MAX_FRAME_BYTES: usize = MAX_FRAME;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct View {
    pub session_id:String, pub revision:u64, pub document:QuickForgeDocument,
    pub peers:usize, pub last_author:String, pub detail:String,
    #[serde(default, skip_serializing_if="Option::is_none")] pub game:Option<GameBinding>,
}
struct Room { id:String, revision:u64, document:QuickForgeDocument, history:VecDeque<(u64,QuickForgeDocument,usize)>, history_bytes:usize, guest:Option<(String,Instant)>, last_author:String, game:Option<GameBinding> }
impl Room {
    fn view(&self)->View {
        View { session_id:self.id.clone(), revision:self.revision, document:self.document.clone(),
            peers:1+usize::from(self.guest.as_ref().is_some_and(|(_,last)|last.elapsed()<Duration::from_secs(10))),
            last_author:self.last_author.clone(), game:self.game.clone(),
            detail:"Editor source synchronized. Game application and player-lobby membership are verified separately.".into() }
    }
    fn propose(&mut self,author:&str,revision:u64,document:QuickForgeDocument)->Result<View> {
        quickforge::validate_document(&document)?;
        let document=portable(document);
        if serde_json::to_vec(&document)?.len()>MAX_FRAME/2 { return invalid("Map is too large for collaborative editing"); }
        if revision>self.revision { return invalid("The proposed revision is ahead of this session; refresh its shared version"); }
        let base=if revision==self.revision { &self.document } else {
            &self.history.iter().find(|(r,_,_)|*r==revision).ok_or_else(||fail("Your base revision expired. Export your local draft before using the shared version."))?.1
        };
        let next=merge(base,&document,&self.document)?;
        if serde_json::to_vec(&next)?.len()>MAX_FRAME/2 { return invalid("Merged map is too large for collaborative editing"); }
        if next!=self.document {
            let size=serde_json::to_vec(&self.document)?.len();
            self.history.push_back((self.revision,self.document.clone(),size));self.history_bytes+=size;
            while self.history.len()>100||self.history_bytes>MAX_HISTORY_BYTES { if let Some((_,_,bytes))=self.history.pop_front(){self.history_bytes-=bytes;} }
            self.document=next;self.revision+=1;self.last_author=author.into();
        }
        Ok(self.view())
    }
}
#[derive(Serialize,Deserialize)]
#[serde(tag="kind",rename_all="camelCase",deny_unknown_fields)]
enum Command { Join, Poll, Propose { revision:u64,document:QuickForgeDocument }, Leave }
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Request { schema_version:u32,key:String,client:String,command:Command }
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Response { view:Option<View>,error:Option<String> }
pub fn write_frame(stream:&mut TcpStream,data:&[u8])->Result<()> {
    if data.is_empty()||data.len()>MAX_FRAME { return invalid("Shared map exceeds the session frame limit"); }
    stream.write_all(&(data.len()as u32).to_be_bytes())?;stream.write_all(data)?;Ok(())
}
pub fn read_frame(stream:&mut TcpStream)->Result<Vec<u8>> {
    let mut prefix=[0u8;4];stream.read_exact(&mut prefix)?;let size=u32::from_be_bytes(prefix)as usize;
    if size==0||size>MAX_FRAME {return invalid("Invalid or oversized session frame");}
    let mut bytes=vec![0;size];stream.read_exact(&mut bytes)?;Ok(bytes)
}
fn send(stream:&mut TcpStream,value:&impl Serialize)->Result<()>{write_frame(stream,&serde_json::to_vec(value)?)}
fn receive<T:serde::de::DeserializeOwned>(stream:&mut TcpStream)->Result<T>{Ok(serde_json::from_slice(&read_frame(stream)?)?)}
pub fn private_ipv4(ip:Ipv4Addr)->bool {ip.is_private()||ip.is_loopback()||(ip.octets()[0]==100&&(64..=127).contains(&ip.octets()[1]))}
pub fn private_endpoint(endpoint:&str)->Result<SocketAddr> {
    let address:SocketAddr=endpoint.trim().parse().map_err(|_|fail("Enter a private IPv4 address and port, for example 192.168.1.10:32145"))?;
    if !matches!(address,SocketAddr::V4(v)if private_ipv4(*v.ip()))||address.port()==0 {return invalid("Use a private LAN, loopback or private VPN IPv4 address; wildcard and public addresses cannot be joined directly");}Ok(address)
}
pub struct Host {room:Mutex<Room>,key:String,pub endpoint:SocketAddr,stop:AtomicBool}
impl Drop for Host {fn drop(&mut self){self.stop.store(true,Ordering::Relaxed);}}
impl Host {
    pub fn start(document:QuickForgeDocument,lan:bool)->Result<Arc<Self>> { Self::start_with_game(document,lan,None) }
    pub fn start_with_game(document:QuickForgeDocument,lan:bool,game:Option<GameBinding>)->Result<Arc<Self>> {
        quickforge::validate_document(&document)?;
        if serde_json::to_vec(&document)?.len()>MAX_FRAME/2 { return invalid("Map is too large for collaborative editing"); }
        if let Some(binding)=&game {binding.validate()?;}
        let listener=TcpListener::bind(SocketAddrV4::new(if lan{Ipv4Addr::UNSPECIFIED}else{Ipv4Addr::LOCALHOST},0))?;
        listener.set_nonblocking(true)?;
        let host=Arc::new(Self {room:Mutex::new(Room{id:uuid::Uuid::new_v4().to_string(),revision:0,document:portable(document),history:VecDeque::new(),history_bytes:0,guest:None,last_author:"host".into(),game}),key:uuid::Uuid::new_v4().simple().to_string(),endpoint:listener.local_addr()?,stop:AtomicBool::new(false)});
        let weak=Arc::downgrade(&host);
        std::thread::spawn(move||loop {
            let Some(host)=weak.upgrade()else{break};if host.stop.load(Ordering::Relaxed){break;}
            match listener.accept() {
                Ok((mut stream,address))=>{
                    if !matches!(address,SocketAddr::V4(v)if private_ipv4(*v.ip())) {continue;}
                    // Winsock can inherit the listener's non-blocking mode.
                    // Frame reads need a blocking stream with bounded timeouts.
                    if stream.set_nonblocking(false).is_err(){continue;}
                    let _=stream.set_read_timeout(Some(Duration::from_millis(800)));let _=stream.set_write_timeout(Some(Duration::from_secs(2)));
                    let response=host.handle(receive::<Request>(&mut stream));let _=send(&mut stream,&response);
                }
                Err(e)if e.kind()==std::io::ErrorKind::WouldBlock=>{drop(host);std::thread::sleep(Duration::from_millis(10));}
                Err(_)=>break,
            }
        });Ok(host)
    }
    pub fn key(&self)->&str {&self.key}
    pub fn close(&self){self.stop.store(true,Ordering::Relaxed);}
    fn open(&self)->Result<()> {if self.stop.load(Ordering::Relaxed){invalid("This editing session is closed")}else{Ok(())}}
    fn handle(&self,request:Result<Request>)->Response {
        let result=(||->Result<View>{
            self.open()?;let r=request?;
            if r.schema_version!=PROTOCOL_VERSION {return invalid("Shared editing protocol differs; use matching Spark versions");}
            if r.key.len()!=self.key.len()||r.key.bytes().zip(self.key.bytes()).fold(0u8,|acc,(a,b)|acc|(a^b))!=0 {return invalid("Wrong session key");}
            uuid::Uuid::parse_str(&r.client).map_err(|_|fail("Invalid editor identity"))?;
            let mut room=self.room.lock().map_err(|_|fail("Session lock interrupted"))?;self.open()?;
            match r.command {
                Command::Join=>{
                    if room.guest.as_ref().is_some_and(|(id,time)|id!=&r.client&&time.elapsed()<Duration::from_secs(10)) {return invalid("This two-editor session already has a guest");}
                    room.guest=Some((r.client,Instant::now()));Ok(room.view())
                }
                Command::Leave=>{if room.guest.as_ref().is_some_and(|(id,_)|id==&r.client){room.guest=None;}Ok(room.view())}
                command=>{
                    if !room.guest.as_ref().is_some_and(|(id,time)|id==&r.client&&time.elapsed()<Duration::from_secs(10)) {return invalid("Your editor lease expired; rejoin before resuming. Your local draft is retained.");}
                    room.guest=Some((r.client,Instant::now()));
                    match command {Command::Poll=>Ok(room.view()),Command::Propose{revision,document}=>room.propose("guest",revision,document),_=>unreachable!()}
                }
            }
        })();match result {Ok(view)=>Response{view:Some(view),error:None},Err(error)=>Response{view:None,error:Some(error.to_string())}}
    }
}
#[derive(Clone)]
pub struct Guest {address:SocketAddr,key:String,client:String,session_id:String,timeout:Duration,closed:Arc<AtomicBool>}
impl Guest {
    pub fn join(endpoint:&str,key:&str)->Result<(Self,View)> {Self::join_with_timeout(endpoint,key,Duration::from_secs(3))}
    pub fn join_with_timeout(endpoint:&str,key:&str,timeout:Duration)->Result<(Self,View)> {
        let address=private_endpoint(endpoint)?;let key=key.trim().to_ascii_lowercase();
        if key.len()!=32||!key.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("A session key must contain 32 hexadecimal characters");}
        let mut guest=Self{address,key,client:uuid::Uuid::new_v4().to_string(),session_id:String::new(),timeout:timeout.min(Duration::from_secs(20)),closed:Arc::new(AtomicBool::new(false))};
        let view=guest.request(Command::Join)?;guest.session_id=view.session_id.clone();Ok((guest,view))
    }
    fn request(&self,command:Command)->Result<View> {
        if self.closed.load(Ordering::Relaxed)&&!matches!(command,Command::Leave){return invalid("This editing session is closed");}
        let mut stream=TcpStream::connect_timeout(&self.address,Duration::from_secs(2))?;
        stream.set_read_timeout(Some(self.timeout))?;stream.set_write_timeout(Some(self.timeout))?;
        send(&mut stream,&Request{schema_version:PROTOCOL_VERSION,key:self.key.clone(),client:self.client.clone(),command})?;
        let response:Response=receive(&mut stream)?;let view=response.view.ok_or_else(||fail(response.error.unwrap_or_else(||"Host returned no session state".into())))?;
        if !self.session_id.is_empty()&&view.session_id!=self.session_id{return invalid("Host session changed; join its new invite");}Ok(view)
    }
}
#[derive(Clone)] pub enum Peer {Host(Arc<Host>),Guest(Guest)}
impl Peer {
    pub fn poll(&self)->Result<View>{match self {Self::Host(h)=>{h.open()?;Ok(h.room.lock().map_err(|_|fail("Session lock interrupted"))?.view())},Self::Guest(g)=>g.request(Command::Poll)}}
    pub fn resume(&self)->Result<View>{match self {Self::Host(_)=>self.poll(),Self::Guest(g)=>g.request(Command::Join)}}
    pub fn propose(&self,revision:u64,document:QuickForgeDocument)->Result<View>{match self {Self::Host(h)=>{h.open()?;let mut room=h.room.lock().map_err(|_|fail("Session lock interrupted"))?;h.open()?;room.propose("host",revision,document)},Self::Guest(g)=>g.request(Command::Propose{revision,document})}}
    pub fn leave(&self){match self {Self::Host(h)=>h.close(),Self::Guest(g)=>{if !g.closed.swap(true,Ordering::Relaxed){let _=g.request(Command::Leave);}}}}
    pub fn role(&self)->&'static str {match self {Self::Host(_)=>"host",Self::Guest(_)=>"guest"}}
    pub fn key(&self)->&str {match self {Self::Host(h)=>h.key(),Self::Guest(g)=>&g.key}}
    pub fn endpoint(&self)->SocketAddr {match self {Self::Host(h)=>h.endpoint,Self::Guest(g)=>g.address}}
}
#[cfg(test)]mod tests {
    use super::*;
    #[test]
    fn a_departed_or_expired_guest_cannot_reclaim_a_new_guests_slot() {
        let host = Host::start(quickforge::create_arena("leases", "emptyArena").unwrap(), false).unwrap();
        let (old, _) = Guest::join(&host.endpoint.to_string(), host.key()).unwrap();
        host.room.lock().unwrap().guest.as_mut().unwrap().1 = Instant::now() - Duration::from_secs(11);
        assert!(Peer::Guest(old.clone()).poll().unwrap_err().to_string().contains("lease expired"));
        let (new, _) = Guest::join(&host.endpoint.to_string(), host.key()).unwrap();
        Peer::Guest(old.clone()).leave();
        assert_eq!(Peer::Guest(new.clone()).poll().unwrap().peers, 2);
        assert!(Peer::Guest(old).poll().is_err());
        Peer::Guest(new).leave(); host.close();
    }
    #[test]
    fn closed_host_clones_refuse_reads_and_writes() {
        let doc = quickforge::create_arena("closed", "emptyArena").unwrap();
        let host = Host::start(doc.clone(), false).unwrap(); let peer = Peer::Host(host.clone());
        peer.leave(); assert!(peer.poll().is_err()); assert!(peer.propose(0, doc).is_err());
    }
    #[test]
    fn game_bindings_retain_map_identity_without_process_addresses() {
        let binding = GameBinding { runtime_id:"mccSteam".into(), scenario:"levels/test/bloodgulch/bloodgulch".into(), checksum:42, tag_count:100 };
        let host = Host::start_with_game(quickforge::create_arena("bound", "emptyArena").unwrap(), false, Some(binding.clone())).unwrap();
        let (guest, view) = Guest::join(&host.endpoint.to_string(), host.key()).unwrap();
        assert_eq!(view.game, Some(binding));
        let mut json = serde_json::to_value(view.game).unwrap(); json["objectTable"] = 123.into();
        assert!(serde_json::from_value::<GameBinding>(json).is_err());
        Peer::Guest(guest).leave(); host.close();
    }
    #[test]fn real_socket_two_editors_merge_independent_changes_and_reject_conflict(){let doc=quickforge::create_arena("shared","emptyArena").unwrap();let host=Host::start(doc.clone(),false).unwrap();let(g,first)=Guest::join(&host.endpoint.to_string(),host.key()).unwrap();assert_eq!(first.peers,2);let mut a=doc.clone();a.geometry[0].position[0]+=2.;let mut b=doc.clone();b.geometry[0].position[1]+=3.;let hp=Peer::Host(host.clone());hp.propose(0,a.clone()).unwrap();let latest=Peer::Guest(g.clone()).propose(0,b).unwrap();assert_eq!(latest.document.geometry[0].position,[a.geometry[0].position[0],doc.geometry[0].position[1]+3.,a.geometry[0].position[2]]);assert_eq!(latest.revision,2);assert!(Guest::join(&host.endpoint.to_string(),host.key()).is_err());let mut clash=doc;clash.geometry[0].position[0]+=9.;assert!(Peer::Guest(g.clone()).propose(0,clash).is_err());assert_eq!(hp.poll().unwrap().revision,2);Peer::Guest(g).leave();hp.leave();}
    #[test]fn invalid_key_and_public_endpoint_cannot_join(){let h=Host::start(quickforge::create_arena("shared","emptyArena").unwrap(),false).unwrap();assert!(Guest::join(&h.endpoint.to_string(),"00000000000000000000000000000000").is_err());assert!(Guest::join("8.8.8.8:1234",h.key()).is_err());h.close();}
    #[test]fn peer_documents_never_include_local_source_project_ids(){let mut d=quickforge::create_arena("shared","emptyArena").unwrap();let value=serde_json::to_value(portable(d.clone())).unwrap();assert!(value.get("sourcePath").is_none());d.environment=Some(Default::default());let mut next=d.clone();next.name="guest edit".into();let mut current=d.clone();current.build_quality="final".into();let r=merge(&d,&next,&current).unwrap();assert_eq!(r.name,"guest edit");assert_eq!(r.build_quality,"final");}
}

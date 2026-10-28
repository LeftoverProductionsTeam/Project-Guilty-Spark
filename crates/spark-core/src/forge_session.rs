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
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct View {pub session_id:String,pub revision:u64,pub document:QuickForgeDocument,pub peers:usize,pub last_author:String,pub detail:String}
struct Room {id:String,revision:u64,document:QuickForgeDocument,history:VecDeque<(u64,QuickForgeDocument,usize)>,history_bytes:usize,guest:Option<(String,Instant)>,last_author:String}
impl Room {
    fn view(&self)->View{View{session_id:self.id.clone(),revision:self.revision,document:self.document.clone(),peers:1+usize::from(self.guest.as_ref().is_some_and(|(_,last)|last.elapsed()<Duration::from_secs(10))),last_author:self.last_author.clone(),detail:"Editor source synchronized. Each machine must connect and bind its own game adapter; game application is separate from source synchronization.".into()}}
    fn propose(&mut self,author:&str,revision:u64,document:QuickForgeDocument)->Result<View>{
        quickforge::validate_document(&document)?;let document=portable(document);
        let base=if revision==self.revision{&self.document}else{&self.history.iter().find(|(r,_,_)|*r==revision).ok_or_else(||fail("Your base revision expired. Save your local draft, then use the shared version to rejoin."))?.1};
        let next=merge(base,&document,&self.document)?;
        if next!=self.document {let size=serde_json::to_vec(&self.document)?.len();self.history.push_back((self.revision,self.document.clone(),size));self.history_bytes+=size;while self.history.len()>100||self.history_bytes>MAX_HISTORY_BYTES{if let Some((_,_,bytes))=self.history.pop_front(){self.history_bytes-=bytes;}}
            self.document=next;self.revision+=1;self.last_author=author.into();}
        Ok(self.view())
    }
}
#[derive(Serialize,Deserialize)]
#[serde(tag="kind",rename_all="camelCase",deny_unknown_fields)]
enum Command {Poll,Propose{revision:u64,document:QuickForgeDocument},Leave}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Request {schema_version:u32,key:String,client:String,command:Command}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Response {view:Option<View>,error:Option<String>}
fn send(stream:&mut TcpStream,value:&impl Serialize)->Result<()>{let data=serde_json::to_vec(value)?;if data.len()>MAX_FRAME{return invalid("Shared map exceeds the 4 MiB session frame limit");}stream.write_all(&(data.len() as u32).to_be_bytes())?;stream.write_all(&data)?;Ok(())}
fn receive<T:serde::de::DeserializeOwned>(stream:&mut TcpStream)->Result<T>{let mut prefix=[0u8;4];stream.read_exact(&mut prefix)?;let size=u32::from_be_bytes(prefix)as usize;if size==0||size>MAX_FRAME{return invalid("Invalid or oversized session frame");}let mut bytes=vec![0;size];stream.read_exact(&mut bytes)?;Ok(serde_json::from_slice(&bytes)?)}
fn local(ip:Ipv4Addr)->bool{ip.is_private()||ip.is_loopback()||(ip.octets()[0]==100&&(64..=127).contains(&ip.octets()[1]))}
pub struct Host {room:Mutex<Room>,key:String,pub endpoint:SocketAddr,stop:AtomicBool}
impl Drop for Host{fn drop(&mut self){self.stop.store(true,Ordering::Relaxed);}}
impl Host {
    pub fn start(document:QuickForgeDocument,lan:bool)->Result<Arc<Self>>{
        quickforge::validate_document(&document)?;if serde_json::to_vec(&document)?.len()>MAX_FRAME/2{return invalid("Map is too large for collaborative editing");}
        let listener=TcpListener::bind(SocketAddrV4::new(if lan{Ipv4Addr::UNSPECIFIED}else{Ipv4Addr::LOCALHOST},0))?;listener.set_nonblocking(true)?;
        let host=Arc::new(Self{room:Mutex::new(Room{id:uuid::Uuid::new_v4().to_string(),revision:0,document:portable(document),history:VecDeque::new(),history_bytes:0,guest:None,last_author:"host".into()}),key:uuid::Uuid::new_v4().simple().to_string(),endpoint:listener.local_addr()?,stop:AtomicBool::new(false)});
        let weak=Arc::downgrade(&host);
        std::thread::spawn(move||{loop{let Some(host)=weak.upgrade()else{break};if host.stop.load(Ordering::Relaxed){break;}
            match listener.accept(){Ok((mut stream,address))=>{let allow=matches!(address,SocketAddr::V4(v)if local(*v.ip()));if !allow{continue;}let _=stream.set_read_timeout(Some(Duration::from_millis(800)));let _=stream.set_write_timeout(Some(Duration::from_secs(2)));let response=host.handle(receive::<Request>(&mut stream));let _=send(&mut stream,&response);},Err(e)if e.kind()==std::io::ErrorKind::WouldBlock=>{drop(host);std::thread::sleep(Duration::from_millis(10));},Err(_)=>break}
        }});Ok(host)
    }
    pub fn key(&self)->&str{&self.key}
    pub fn close(&self){self.stop.store(true,Ordering::Relaxed);}
    fn handle(&self,request:Result<Request>)->Response{
        let result=(||->Result<View>{let r=request?;if r.schema_version!=1||r.key.len()!=self.key.len()||r.key.bytes().zip(self.key.bytes()).fold(0u8,|acc,(a,b)|acc|(a^b))!=0{return invalid("Wrong session key or unsupported protocol");}uuid::Uuid::parse_str(&r.client).map_err(|_|fail("Invalid editor identity"))?;
            let mut room=self.room.lock().map_err(|_|fail("Session lock interrupted"))?;
            if room.guest.as_ref().is_some_and(|(id,time)|id!=&r.client&&time.elapsed()<Duration::from_secs(10)){return invalid("This two-editor session already has a guest");}
            room.guest=Some((r.client.clone(),Instant::now()));match r.command{Command::Poll=>Ok(room.view()),Command::Propose{revision,document}=>room.propose("guest",revision,document),Command::Leave=>{room.guest=None;Ok(room.view())}}
        })();match result{Ok(view)=>Response{view:Some(view),error:None},Err(error)=>Response{view:None,error:Some(error.to_string())}}
    }
}
#[derive(Clone)]pub struct Guest{address:SocketAddr,key:String,client:String}
impl Guest {
    pub fn join(endpoint:&str,key:&str)->Result<(Self,View)>{let address:SocketAddr=endpoint.parse().map_err(|_|fail("Use a private IPv4 address and port, for example 192.168.1.10:32145"))?;if !matches!(address,SocketAddr::V4(v)if local(*v.ip()))||address.port()==0{return invalid("Sessions accept private LAN, loopback or private VPN IPv4 addresses only");}if key.len()!=32||!key.bytes().all(|c|c.is_ascii_hexdigit()){return invalid("A session key must contain 32 hexadecimal characters");}let guest=Self{address,key:key.into(),client:uuid::Uuid::new_v4().to_string()};let view=guest.request(Command::Poll)?;Ok((guest,view))}
    fn request(&self,command:Command)->Result<View>{let mut stream=TcpStream::connect_timeout(&self.address,Duration::from_secs(2))?;stream.set_read_timeout(Some(Duration::from_secs(3)))?;stream.set_write_timeout(Some(Duration::from_secs(2)))?;send(&mut stream,&Request{schema_version:1,key:self.key.clone(),client:self.client.clone(),command})?;let response:Response=receive(&mut stream)?;response.view.ok_or_else(||fail(response.error.unwrap_or_else(||"Host returned no session state".into())))}
}
#[derive(Clone)]pub enum Peer{Host(Arc<Host>),Guest(Guest)}
impl Peer {
    pub fn poll(&self)->Result<View>{match self{Self::Host(h)=>Ok(h.room.lock().map_err(|_|fail("Session lock interrupted"))?.view()),Self::Guest(g)=>g.request(Command::Poll)}}
    pub fn propose(&self,revision:u64,document:QuickForgeDocument)->Result<View>{match self{Self::Host(h)=>h.room.lock().map_err(|_|fail("Session lock interrupted"))?.propose("host",revision,document),Self::Guest(g)=>g.request(Command::Propose{revision,document})}}
    pub fn leave(&self){match self{Self::Host(h)=>h.close(),Self::Guest(g)=>{let _=g.request(Command::Leave);}}}
}

#[cfg(test)]mod tests {
    use super::*;
    #[test]fn real_socket_two_editors_merge_independent_changes_and_reject_conflict(){let doc=quickforge::create_arena("shared","emptyArena").unwrap();let host=Host::start(doc.clone(),false).unwrap();let(g,first)=Guest::join(&host.endpoint.to_string(),host.key()).unwrap();assert_eq!(first.peers,2);let mut a=doc.clone();a.geometry[0].position[0]+=2.;let mut b=doc.clone();b.geometry[0].position[1]+=3.;let hp=Peer::Host(host.clone());hp.propose(0,a.clone()).unwrap();let latest=Peer::Guest(g.clone()).propose(0,b).unwrap();assert_eq!(latest.document.geometry[0].position,[a.geometry[0].position[0],doc.geometry[0].position[1]+3.,a.geometry[0].position[2]]);assert_eq!(latest.revision,2);assert!(Guest::join(&host.endpoint.to_string(),host.key()).is_err());let mut clash=doc;clash.geometry[0].position[0]+=9.;assert!(Peer::Guest(g.clone()).propose(0,clash).is_err());assert_eq!(hp.poll().unwrap().revision,2);Peer::Guest(g).leave();hp.leave();}
    #[test]fn invalid_key_and_public_endpoint_cannot_join(){let h=Host::start(quickforge::create_arena("shared","emptyArena").unwrap(),false).unwrap();assert!(Guest::join(&h.endpoint.to_string(),"00000000000000000000000000000000").is_err());assert!(Guest::join("8.8.8.8:1234",h.key()).is_err());h.close();}
    #[test]fn peer_documents_never_include_local_source_project_ids(){let mut d=quickforge::create_arena("shared","emptyArena").unwrap();let value=serde_json::to_value(portable(d.clone())).unwrap();assert!(value.get("sourcePath").is_none());d.environment=Some(Default::default());let mut next=d.clone();next.name="guest edit".into();let mut current=d.clone();current.build_quality="final".into();let r=merge(&d,&next,&current).unwrap();assert_eq!(r.name,"guest edit");assert_eq!(r.build_quality,"final");}
}

//! One source-verified greeting per application process, never per WebView.
//! Only identities/metadata are persisted. Halo bytes stay in owned sources.
use super::*;
use std::collections::{BTreeSet,BTreeMap};
use sha2::{Digest,Sha256};
#[derive(Default)]
pub(super) struct LaunchState { claimed:bool, selected:Option<Choice>, played:bool, error:Option<String>, bag:Option<Bag>, chunks:Vec<audio::AudioPreview>, wave:Option<Vec<u8>>, stopped:bool }
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Choice { id:String, source:PathBuf, source_sha256:String, tag_id:u32, tag_path:String, pitch_range:usize, permutation:usize }
#[derive(Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Bag { used:BTreeSet<String>, last:Option<String> }
#[derive(Serialize,Deserialize,PartialEq,Eq)]
struct Stamp { path:PathBuf, bytes:u64, modified:u128 }
#[derive(Serialize,Deserialize)]
struct Catalog { schema:u32, character:String, sources:Vec<Stamp>, choices:Vec<Choice>, warnings:Vec<String> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct Greeting { character:String, line_id:String, report:audio::SoundInspection, pitch_range:usize, permutation:usize, available_lines:usize, warnings:Vec<String> }
fn character_valid(character:&str)->bool{["monitor","johnson","chief","cortana"].contains(&character)}
fn belongs(path:&str,character:&str)->bool{
    let path=path.replace('\\',"/").to_ascii_lowercase();
    if !path.starts_with("sound/dialog/"){return false;}
    let name=path.rsplit('/').next().unwrap_or("");
    // Chief's generic dialogue folder is death/grunt audio, not spoken lines.
    match character{
        "monitor"=>path.starts_with("sound/dialog/monitor/")||name.ends_with("_monitor"),
        "johnson"=>(path.starts_with("sound/dialog/sargeant/")&&!path.contains("/involuntary/"))||["_johnson","_sgt","_sarge","_sargeant","_sergeant"].iter().any(|suffix|name.ends_with(suffix)),
        "chief"=>name.ends_with("_chief"),
        "cortana"=>path.starts_with("sound/dialog/cortana/")||name.ends_with("_cortana"),
        _=>false,
    }
}
fn chain<'a>(report:&'a audio::SoundInspection,pitch:usize,permutation:usize)->Reply<Vec<&'a audio::SoundPermutation>>{
    let mut result=vec![];let mut seen=BTreeSet::new();let mut next=Some(permutation);let mut duration=0.;let mut decoded=0.;
    while let Some(index)=next{
        if !seen.insert(index)||result.len()>=64{return Err("Dialogue has cyclic or excessive native segments".into());}
        let item=report.permutations.iter().find(|p|p.pitch_range==pitch&&p.permutation==index).ok_or("Dialogue segment is missing")?;
        let seconds=item.duration_seconds.ok_or("Dialogue duration is unavailable")?;
        if !item.available||item.sha256.is_none()||!seconds.is_finite()||seconds<=0.{return Err("Dialogue contains an unavailable or invalid source segment".into());}
        if let Some(first)=result.first(){let first:&&audio::SoundPermutation=first;if first.channels!=item.channels||first.sample_rate!=item.sample_rate{return Err("Dialogue segment formats differ".into());}}
        duration+=seconds;decoded+=seconds*item.sample_rate as f64*item.channels as f64*4.;
        if duration>180.||decoded>32.*1024.*1024.{return Err("Dialogue exceeds the playback budget".into());}
        result.push(item);next=item.next_permutation;
    }Ok(result)
}
fn choose<'a>(choices:&'a [Choice],bag:&mut Bag,seed:&str)->Option<&'a Choice>{
    let ids:BTreeSet<_>=choices.iter().map(|choice|choice.id.clone()).collect();bag.used.retain(|id|ids.contains(id));
    if !choices.iter().any(|choice|!bag.used.contains(&choice.id)){bag.used.clear();}
    choices.iter().filter(|choice|!bag.used.contains(&choice.id))
        .min_by_key(|choice|(choices.len()>1&&bag.used.is_empty()&&bag.last.as_ref()==Some(&choice.id),core::hex_bytes(Sha256::digest(format!("{seed}/{}",choice.id).as_bytes()))))
}
fn catalog(state:&AppState,character:&str)->Reply<Catalog>{
    let paths=asset_sources_native::home_voice_sources(state)?;
    let stamps:Vec<_>=paths.iter().map(|path|{core::reject_links(path).map_err(error)?;let meta=fs::metadata(path).map_err(error)?;Ok(Stamp{path:path.clone(),bytes:meta.len(),modified:meta.modified().map_err(error)?.duration_since(std::time::UNIX_EPOCH).map_err(error)?.as_nanos()})}).collect::<Reply<_>>()?;
    let file=state.root.join("cache/home-voice-v1").join(format!("{character}.json"));
    // Discovery stamps only reuse candidate metadata; the selected map and
    // every audio segment are always re-hashed below before playback.
    if let Ok(bytes)=bounded_read(&file,16*1024*1024){if let Ok(catalog)=serde_json::from_slice::<Catalog>(&bytes){if catalog.schema==1&&catalog.character==character&&catalog.sources==stamps&&catalog.choices.len()<=16384&&catalog.choices.iter().all(|choice|catalog.sources.iter().any(|s|s.path==choice.source)&&belongs(&choice.tag_path,character)&&choice.source_sha256.len()==64&&choice.source_sha256.bytes().all(|b|b.is_ascii_hexdigit())&&choice.id.len()==64&&choice.pitch_range<8&&choice.permutation<256){return Ok(catalog);}}}
    let mut choices=BTreeMap::new();let mut warnings=vec![];
    for path in &paths{
        let inspected=(||->Reply<Vec<Choice>>{
            let map=maps::inspect_map(path,path.parent()).map_err(error)?;
            let ids:Vec<_>=map.tags.iter().filter(|tag|tag.class=="snd!"&&belongs(&tag.path,character)).map(|tag|tag.id).collect();
            if ids.is_empty(){return Ok(vec![]);}
            let resource=path.parent().map(|p|p.join("sounds.map")).filter(|p|p.is_file());
            let pin=resource.as_ref().map(|p|maps::hash_file(p).map_err(error)).transpose()?;
            let mut found=vec![];
            for batch in ids.chunks(512){for report in audio::inspect_sound_batch(path,&map.sha256,batch,resource.as_ref().zip(pin.as_ref()).map(|(p,h)|(p.as_path(),h.as_str()))).map_err(error)?{
                for root in report.permutations.iter().filter(|p|p.chain_start){
                    let Ok(chunks)=chain(&report,root.pitch_range,root.permutation)else{continue};
                    // Native Windows greeting playback currently accepts the
                    // verified PCM/Xbox decoder, never undecoded CELT/Ogg.
                    if chunks.iter().any(|p|!["PCM","Xbox ADPCM"].contains(&p.format.as_str())){continue;}
                    let identity=format!("{character}/{}/{}/{}/{}",report.tag_path.replace('\\',"/").to_ascii_lowercase(),root.pitch_range,root.permutation,chunks.iter().filter_map(|p|p.sha256.as_deref()).collect::<Vec<_>>().join("/"));
                    found.push(Choice{id:core::hex_bytes(Sha256::digest(identity.as_bytes())),source:path.clone(),source_sha256:map.sha256.clone(),tag_id:report.tag_id,tag_path:report.tag_path.clone(),pitch_range:root.pitch_range,permutation:root.permutation});
                }
            }}Ok(found)
        })();
        match inspected{Ok(found)=>for choice in found{choices.entry(choice.id.clone()).or_insert(choice);},Err(reason)=>warnings.push(format!("{}: {reason}",path.file_name().unwrap_or_default().to_string_lossy()))}
        if choices.len()>16384{return Err("Available dialogue exceeds the bounded catalog".into());}
    }
    let catalog=Catalog{schema:1,character:character.into(),sources:stamps,choices:choices.into_values().collect(),warnings};
    if let Some(parent)=file.parent(){core::reject_links(parent).map_err(error)?;fs::create_dir_all(parent).map_err(error)?;project::atomic_write(&file,&serde_json::to_vec(&catalog).map_err(error)?,false).map_err(error)?;}
    Ok(catalog)
}
fn prepare(state:&AppState,character:&str)->Reply<Greeting>{
    let catalog=catalog(state,character)?;
    let mut bag:Bag=lock(&state.library)?.setting(&format!("homeVoiceBag:{character}:v1")).map_err(error)?;
    let selected=choose(&catalog.choices,&mut bag,&uuid::Uuid::new_v4().to_string()).ok_or("No recoverable dialogue for this character. Link its original campaign maps in Asset library; unsupported dialogue codecs are never substituted.")?.clone();
    core::reject_links(&selected.source).map_err(error)?;
    let resource=selected.source.parent().map(|p|p.join("sounds.map")).filter(|p|p.is_file());
    let pin=resource.as_ref().map(|p|maps::hash_file(p).map_err(error)).transpose()?;
    let bindings=resource.as_ref().zip(pin.as_ref()).map(|(p,h)|(p.as_path(),h.as_str()));
    let report=audio::inspect_sound_with_resources(&selected.source,&selected.source_sha256,selected.tag_id,bindings).map_err(error)?;
    if report.tag_path!=selected.tag_path||!belongs(&report.tag_path,character){return Err("Selected dialogue no longer matches its character".into());}
    let segments=chain(&report,selected.pitch_range,selected.permutation)?;
    let identity=format!("{character}/{}/{}/{}/{}",report.tag_path.replace('\\',"/").to_ascii_lowercase(),selected.pitch_range,selected.permutation,segments.iter().filter_map(|p|p.sha256.as_deref()).collect::<Vec<_>>().join("/"));
    if core::hex_bytes(Sha256::digest(identity.as_bytes()))!=selected.id{return Err("Dialogue catalog sample identity changed; no greeting was played".into());}
    let requests=segments.iter().map(|p|(p.pitch_range,p.permutation)).collect::<Vec<_>>();
    let chunks=if bindings.is_none(){audio::preview_sound_batch(&selected.source,&selected.source_sha256,selected.tag_id,&requests).map_err(error)?}else{requests.iter().map(|(pitch,permutation)|audio::preview_sound_with_resources(&selected.source,&selected.source_sha256,selected.tag_id,*pitch,*permutation,bindings).map_err(error)).collect::<Reply<_>>()?};
    {let mut launch=lock(&state.home_voice)?;launch.selected=Some(selected.clone());launch.bag=Some(bag);launch.chunks=chunks;}
    Ok(Greeting{character:character.into(),line_id:selected.id,report,pitch_range:selected.pitch_range,permutation:selected.permutation,available_lines:catalog.choices.len(),warnings:catalog.warnings})
}
#[tauri::command]
pub(super) async fn prepare_launch_voice(app:tauri::AppHandle,window:tauri::WebviewWindow,character:String)->Reply<Option<Greeting>>{
    if window.label()!="main"{return Ok(None);}
    if !character_valid(&character){return Err("Choose Monitor, Johnson, Chief or Cortana".into());}
    {let state=app.state::<AppState>();let mut launch=lock(&state.home_voice)?;if launch.claimed{return Ok(None);}launch.claimed=true;}
    tauri::async_runtime::spawn_blocking(move||{let state=app.state::<AppState>();let result=prepare(&state,&character);if let Err(reason)=&result{lock(&state.home_voice)?.error=Some(reason.clone());}result.map(Some)}).await.map_err(error)?
}
#[tauri::command]
pub(super) fn play_launch_voice(app:tauri::AppHandle,state:State<AppState>,window:tauri::WebviewWindow,character:String,line_id:String,volume:f32)->Reply<bool>{
    if window.label()!="main"||!character_valid(&character){return Err("Only the main app can acknowledge its launch greeting".into());}
    let mut launch=lock(&state.home_voice)?;
    let selected=launch.selected.as_ref().ok_or("No launch greeting was prepared")?;
    if selected.id!=line_id||!belongs(&selected.tag_path,&character){return Err("Launch greeting identity differs".into());}
    if launch.played{return Ok(false);}
    if launch.stopped{return Ok(false);}
    let wave=wave(&launch.chunks,volume)?;
    let library=lock(&state.library)?;let key=format!("homeVoiceBag:{character}:v1");let mut bag=launch.bag.take().ok_or("Launch shuffle state is missing")?;
    bag.used.insert(line_id.clone());bag.last=Some(line_id.clone());
    // Keep the bytes alive for the asynchronous OS player. Audio never comes
    // from an arbitrary IPC byte buffer, URL or temporary executable.
    launch.wave=Some(wave);
    #[cfg(windows)]{
        use windows_sys::Win32::Media::Audio::{PlaySoundW,SND_ASYNC,SND_MEMORY,SND_NODEFAULT};
        // SAFETY: SND_MEMORY reads our validated RIFF allocation. LaunchState
        // retains it until PlaySound has stopped or the process exits.
        if unsafe{PlaySoundW(launch.wave.as_ref().unwrap().as_ptr().cast(),std::ptr::null_mut(),SND_MEMORY|SND_ASYNC|SND_NODEFAULT)}==0{launch.wave=None;return Err("Windows could not start the character greeting".into());}
    }
    #[cfg(not(windows))]{launch.wave=None;return Err("Automatic native character greetings are currently available on Windows".into());}
    #[cfg(windows)]{
        // If persistence fails, stop playback and refuse success.
        if let Err(reason)=library.set_setting(&key,&bag){unsafe{windows_sys::Win32::Media::Audio::PlaySoundW(std::ptr::null(),std::ptr::null_mut(),0)};launch.wave=None;return Err(error(reason));}
        launch.played=true;launch.chunks.clear();
        let wave=launch.wave.as_ref().unwrap();let rate=u32::from_le_bytes(wave[28..32].try_into().unwrap()) as f64;
        let duration=(wave.len()-44) as f64/rate;
        std::thread::spawn(move||{std::thread::sleep(Duration::from_secs_f64(duration+0.5));let state=app.state::<AppState>();if let Ok(mut launch)=state.home_voice.lock(){if launch.selected.as_ref().is_some_and(|choice|choice.id==line_id){unsafe{windows_sys::Win32::Media::Audio::PlaySoundW(std::ptr::null(),std::ptr::null_mut(),0)};launch.wave=None;}};});Ok(true)
    }
}
fn wave(chunks:&[audio::AudioPreview],volume:f32)->Reply<Vec<u8>>{
    if !volume.is_finite()||volume<=0.||volume>1.||chunks.is_empty()||chunks.len()>64{return Err("Invalid greeting volume or segment count".into());}
    let mut data=vec![];let mut format=None;
    for chunk in chunks{
        let b=&chunk.bytes;
        if chunk.mime!="audio/wav"||b.len()<44||b.len()>32*1024*1024||&b[..4]!=b"RIFF"||&b[8..16]!=b"WAVEfmt "||&b[36..40]!=b"data"||u32::from_le_bytes(b[16..20].try_into().unwrap())!=16||u16::from_le_bytes(b[20..22].try_into().unwrap())!=1||u16::from_le_bytes(b[34..36].try_into().unwrap())!=16||u32::from_le_bytes(b[4..8].try_into().unwrap()) as usize+8!=b.len()||u32::from_le_bytes(b[40..44].try_into().unwrap()) as usize+44!=b.len(){return Err("Greeting requires complete decoded PCM segments".into());}
        if core::hex_bytes(Sha256::digest(b))!=chunk.sha256{return Err("Greeting PCM checksum changed".into());}
        if format.as_ref().is_some_and(|f:&Vec<u8>|f.as_slice()!=&b[20..36]){return Err("Greeting PCM formats differ".into());}
        let channels=u16::from_le_bytes(b[22..24].try_into().unwrap());let rate=u32::from_le_bytes(b[24..28].try_into().unwrap());
        if ![1,2].contains(&channels)||![22050,44100].contains(&rate)||(b.len()-44)%(channels as usize*2)!=0||u32::from_le_bytes(b[28..32].try_into().unwrap())!=rate*channels as u32*2||u16::from_le_bytes(b[32..34].try_into().unwrap())!=channels*2{return Err("Greeting PCM dimensions are invalid".into());}
        format=Some(b[20..36].to_vec());data.extend_from_slice(&b[44..]);
        if data.len()>32*1024*1024{return Err("Greeting PCM exceeds the memory budget".into());}
    }
    let mut result=chunks[0].bytes[..44].to_vec();result[4..8].copy_from_slice(&(36u32+data.len() as u32).to_le_bytes());result[40..44].copy_from_slice(&(data.len() as u32).to_le_bytes());
    for sample in data.chunks_exact(2){let value=(i16::from_le_bytes(sample.try_into().unwrap()) as f32*volume).round() as i16;result.extend_from_slice(&value.to_le_bytes());}Ok(result)
}
#[tauri::command]
pub(super) fn stop_launch_voice(state:State<AppState>,window:tauri::WebviewWindow)->Reply<()>{
    if window.label()!="main"{return Ok(());}
    let mut launch=lock(&state.home_voice)?;launch.stopped=true;
    #[cfg(windows)]if launch.wave.is_some(){unsafe{windows_sys::Win32::Media::Audio::PlaySoundW(std::ptr::null(),std::ptr::null_mut(),0)};}
    launch.wave=None;launch.chunks.clear();Ok(())
}
#[tauri::command]
pub(super) fn launch_voice_status(state:State<AppState>)->Reply<serde_json::Value>{let launch=lock(&state.home_voice)?;Ok(serde_json::json!({"claimed":launch.claimed,"played":launch.played,"stopped":launch.stopped,"lineId":launch.selected.as_ref().map(|c|&c.id),"tagPath":launch.selected.as_ref().map(|c|&c.tag_path),"sourceSha256":launch.selected.as_ref().map(|c|&c.source_sha256),"error":launch.error}))}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn only_exact_character_dialogue_is_eligible(){
        assert!(belongs("sound\\dialog\\c40\\c40_insert_010_monitor","monitor"));
        assert!(belongs("sound/dialog/sargeant/conditional/welcome","johnson"));
        assert!(belongs("sound/dialog/a10/a10_020_cortana","cortana"));
        assert!(belongs("sound/dialog/a10/a10_100_chief","chief"));
        for path in ["sound/sfx/vehicles/monitor_amb","sound/dialog/chief/deathquiet","sound/dialog/cortana/a10_chiefish","sound/sinomatixx/bash_monitor"]{assert!(!belongs(path,"chief"));}
        assert!(!belongs("sound/dialog/a10/a10_100_chief","monitor"));
    }
    fn choice(id:&str)->Choice{Choice{id:id.into(),source:"owned.map".into(),source_sha256:"a".repeat(64),tag_id:1,tag_path:"sound/dialog/monitor/line".into(),pitch_range:0,permutation:0}}
    #[test]fn shuffle_survives_restart_exhausts_all_lines_and_reconciles_changed_catalog(){
        let choices=vec![choice("one"),choice("two"),choice("three")];let mut bag=Bag::default();
        for cycle in 0..3{
            let last=bag.last.clone();let mut heard=BTreeSet::new();
            for launch in 0..3{
                let id=choose(&choices,&mut bag,&format!("{cycle}/{launch}")).unwrap().id.clone();
                if launch==0{assert_ne!(Some(&id),last.as_ref());}assert!(heard.insert(id.clone()));
                bag.used.insert(id.clone());bag.last=Some(id);
                bag=serde_json::from_slice(&serde_json::to_vec(&bag).unwrap()).unwrap();
            }assert_eq!(heard.len(),3);
        }
        let next=vec![choice("four"),choice("one")];assert_eq!(choose(&next,&mut bag,"new").unwrap().id,"four");
        assert!(!bag.used.contains("two"));assert!(choose(&[],&mut bag,"empty").is_none());
    }
    fn preview(samples:&[i16])->audio::AudioPreview{
        let mut bytes=Vec::new();bytes.extend_from_slice(b"RIFF");bytes.extend_from_slice(&(36u32+samples.len()as u32*2).to_le_bytes());bytes.extend_from_slice(b"WAVEfmt ");bytes.extend_from_slice(&16u32.to_le_bytes());bytes.extend_from_slice(&1u16.to_le_bytes());bytes.extend_from_slice(&1u16.to_le_bytes());bytes.extend_from_slice(&22050u32.to_le_bytes());bytes.extend_from_slice(&44100u32.to_le_bytes());bytes.extend_from_slice(&2u16.to_le_bytes());bytes.extend_from_slice(&16u16.to_le_bytes());bytes.extend_from_slice(b"data");bytes.extend_from_slice(&(samples.len()as u32*2).to_le_bytes());for sample in samples{bytes.extend_from_slice(&sample.to_le_bytes());}
        audio::AudioPreview{name:"owned segment".into(),mime:"audio/wav".into(),sha256:core::hex_bytes(Sha256::digest(&bytes)),source_sha256:"a".repeat(64),source_sample_sha256:"b".repeat(64),bytes}
    }
    #[test]fn one_greeting_joins_native_segments_preserves_clock_and_rejects_corruption(){
        let clips=vec![preview(&[1000,-1000]),preview(&[2000,-2000])];let original=clips[0].bytes.clone();let joined=wave(&clips,0.5).unwrap();
        assert_eq!(&joined[44..],[500i16,-500,1000,-1000].iter().flat_map(|v|v.to_le_bytes()).collect::<Vec<_>>());assert_eq!(clips[0].bytes,original);assert_eq!(joined.len(),52);
        let mut corrupt=clips.clone();corrupt[0].bytes[45]^=1;assert!(wave(&corrupt,1.).is_err());
        let mut truncated=clips.clone();truncated[0].bytes.truncate(40);assert!(wave(&truncated,1.).is_err());
        for volume in [0.,-1.,f32::NAN,1.01]{assert!(wave(&clips,volume).is_err());}
    }
}

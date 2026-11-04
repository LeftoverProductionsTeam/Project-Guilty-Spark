use super::*;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub(super) struct ReturnTarget {
    pub origin: String,
    pub project: Option<String>,
    pub workspace: String,
    pub panel: Option<String>,
}
#[derive(Default)]
pub(super) struct WindowState {
    returns: HashMap<String, ReturnTarget>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct Placement { x:i32, y:i32, width:u32, height:u32 }

pub(super) fn checked_panel(workspace:&str,panel:&str,project:bool)->Reply<()> {
    let allowed=match panel {
        "help"|"source-changes"=>true,
        "project-setup"=>project,
        "compare-info"=>workspace=="compare",
        "tag-relationships"=>project&&workspace=="tags",
        "engine-recording"|"director-keys"|"director-lens"=>project&&workspace=="machinima",
        "navigation"|"construction"|"objects"|"object-tags"|"asset-library"|"map-sounds"|
        "inspector"|"forge-palette"|"workshop-object"|"forge-inspector"=>
            project&&matches!(workspace,"world"|"quickforge"|"live"),
        _=>false,
    };
    if allowed {Ok(())}else{Err("This panel cannot be detached from this workspace".into())}
}

fn placement_key(target:&ReturnTarget)->String {
    format!("workspace-window-{}-{}-{}",target.project.as_deref().unwrap_or("global"),target.workspace,target.panel.as_deref().unwrap_or("workspace"))
}
/// Keep the complete title strip reachable, including after a display is removed.
/// Coordinates are physical and may be negative on monitors left of the primary.
fn fit_placement(p:&Placement,monitors:&[Placement])->Option<Placement> {
    let monitor=monitors.iter().max_by_key(|m|{
        let width=(i64::from(p.x)+i64::from(p.width)).min(i64::from(m.x)+i64::from(m.width))-i64::from(p.x.max(m.x));
        let height=(i64::from(p.y)+i64::from(p.height)).min(i64::from(m.y)+i64::from(m.height))-i64::from(p.y.max(m.y));
        width.max(0)*height.max(0)
    })?;
    let width=p.width.clamp(320,8192).min(monitor.width);
    let height=p.height.clamp(240,8192).min(monitor.height);
    let x=i64::from(p.x).clamp(i64::from(monitor.x),i64::from(monitor.x)+i64::from(monitor.width-width));
    let y=i64::from(p.y).clamp(i64::from(monitor.y),i64::from(monitor.y)+i64::from(monitor.height-height));
    Some(Placement{x:x as i32,y:y as i32,width,height})
}
pub(super) fn target(state:&AppState,label:&str)->Reply<Option<ReturnTarget>> {
    Ok(lock(&state.workspace_windows)?.returns.get(label).cloned())
}
pub(super) fn forget(state:&AppState,label:&str)->Reply<()> {
    lock(&state.workspace_windows)?.returns.remove(label);Ok(())
}
pub(super) fn register(app:&tauri::AppHandle,window:&tauri::WebviewWindow,target:ReturnTarget)->Reply<()> {
    let state=app.state::<AppState>();
    let saved:Option<Placement>=lock(&state.library)?.setting(&placement_key(&target)).map_err(error)?;
    lock(&state.workspace_windows)?.returns.insert(window.label().into(),target);
    if let Some(saved)=saved {apply_placement(window,&saved)?;}else{let _=window.center();}
    Ok(())
}
fn apply_placement(window:&tauri::WebviewWindow,p:&Placement)->Reply<()> {
    let monitors=window.available_monitors().map_err(error)?.into_iter().map(|m|Placement{x:m.position().x,y:m.position().y,width:m.size().width,height:m.size().height}).collect::<Vec<_>>();
    if let Some(p)=fit_placement(p,&monitors){
        window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(p.width,p.height))).map_err(error)?;
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(p.x,p.y))).map_err(error)?;
    }
    Ok(())
}
pub(super) fn remember(app:&tauri::AppHandle,window:&tauri::WebviewWindow)->Reply<()> {
    let state=app.state::<AppState>();
    let Some(target)=target(&state,window.label())? else{return Ok(())};
    if window.is_fullscreen().map_err(error)?||window.is_maximized().map_err(error)?||window.is_minimized().map_err(error)?{return Ok(());}
    let p=window.outer_position().map_err(error)?;let size=window.inner_size().map_err(error)?;
    let result=lock(&state.library)?.set_setting(&placement_key(&target),&Placement{x:p.x,y:p.y,width:size.width,height:size.height}).map_err(error);
    result
}
#[tauri::command]
pub(super) fn recover_workspace_window(app:tauri::AppHandle,window:tauri::WebviewWindow)->Reply<()> {
    if target(&app.state::<AppState>(),window.label())?.is_none(){return Ok(())}
    if window.is_fullscreen().map_err(error)?||window.is_maximized().map_err(error)?{return Ok(())}
    let p=window.outer_position().map_err(error)?;let size=window.inner_size().map_err(error)?;
    apply_placement(&window,&Placement{x:p.x,y:p.y,width:size.width,height:size.height})
}
#[tauri::command]
pub(super) fn return_workspace_panel(app:tauri::AppHandle,window:tauri::WebviewWindow,allow_missing_origin:Option<bool>)->Reply<()> {
    let state=app.state::<AppState>();
    let target=target(&state,window.label())?.ok_or("This window has no original panel layout")?;
    if target.project.is_some(){return Err("Save and return the map's editing history first".into())}
    let origin=match app.get_webview_window(&target.origin){Some(origin)=>origin,None if allow_missing_origin==Some(true)=>return Ok(()),None=>return Err("The original window is closed; this workspace can still be used independently".into())};
    remember(&app,&window)?;
    origin.emit("spark:reattach-panel",serde_json::json!({"workspace":target.workspace,"panel":target.panel})).map_err(error)?;
    forget(&state,window.label())?;
    let _=origin.show();let _=origin.set_focus();Ok(())
}

/// Unexpected window destruction must release the lease and notify the original
/// view. Its durable history, including unsaved acknowledged edits, is retained.
pub(super) fn release_window(app:&tauri::AppHandle,label:&str) {
    let Some(state)=app.try_state::<AppState>() else{return};
    let target=state.workspace_windows.lock().ok().and_then(|mut s|s.returns.remove(label));
    let Some(target)=target else{return};
    let Some(id)=target.project else{return};
    let Some(origin)=app.get_webview_window(&target.origin) else{return};
    let Ok(_guard)=state.window_history.lock() else{return};
    if state.document_owners.lock().ok().and_then(|s|s.get(&id).cloned()).as_deref()!=Some(label){return;}
    if shared_editing::claim_owner(&state,&id,&target.origin).is_err(){return;}
    if let Ok(mut owners)=state.document_owners.lock(){owners.insert(id.clone(),target.origin.clone());}
    let _=origin.emit("spark:reattach-project",serde_json::json!({"id":id,"workspace":target.workspace,"panel":target.panel,"activate":false}));
}
pub(super) fn checked_workspace(value:&str)->Reply<&str>{
    if matches!(value,"library"|"map-finder"|"get-started"|"features"|"learning"|"how-to"|"community"|"world"|"tags"|"assets"|"scenario"|"build"|"preservation"|"settings"|"compare"|"runtimes"|"live"|"quickforge"|"firefight"|"interface"|"creator"|"machinima"|"academy"){Ok(value)}else{Err("Unknown Spark workspace".into())}
}
fn workspace_query(workspace:&str,context:Option<&str>,section:Option<&str>)->Reply<String>{
    let workspace=checked_workspace(workspace)?;
    let mut query=format!("index.html?workspace={workspace}");
    if let Some(section)=section{if !matches!((workspace,section),("learning","guides"|"glossary"|"academy")|("settings","tools"|"dependencies"|"interface"|"storage")){return Err("Invalid workspace section".into());}query.push_str(&format!("&section={section}"));}
    if let Some(context)=context{if !(workspace=="academy"||workspace=="learning"&&section==Some("academy"))||context.is_empty()||context.len()>64||!context.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){return Err("Invalid tutorial context".into());}query.push_str(&format!("&lesson={context}"));}
    Ok(query)
}
#[tauri::command]
pub(super) async fn open_workspace_window(app:tauri::AppHandle,window:tauri::WebviewWindow,workspace:String,context:Option<String>,section:Option<String>,panel:Option<String>)->Reply<String>{
    let mut query=workspace_query(&workspace,context.as_deref(),section.as_deref())?;
    if let Some(panel)=&panel {checked_panel(&workspace,panel,false)?;query.push_str(&format!("&panel={panel}"));}
    if app.webview_windows().len()>=16{return Err("Close a Spark window before opening another workspace".into());}
    let label=format!("workspace-{}",uuid::Uuid::new_v4());
    let child=tauri::WebviewWindowBuilder::new(&app,&label,tauri::WebviewUrl::App(query.into())).title("Project Guilty Spark").inner_size(if panel.is_some(){620.}else{1120.},800.).min_inner_size(if panel.is_some(){400.}else{720.},400.).resizable(true).decorations(false).transparent(true).shadow(false).theme(Some(tauri::Theme::Dark)).build().map_err(error)?;
    if let Err(reason)=register(&app,&child,ReturnTarget{origin:window.label().into(),project:None,workspace,panel}){let _=child.destroy();return Err(reason);}
    Ok(label)
}
#[cfg(test)]mod tests{use super::*;#[test]fn workspace_urls_accept_only_local_known_routes(){assert!(checked_workspace("academy").is_ok());assert!(checked_workspace("tags").is_ok());for value in ["https://example.com","../index.html","world&project=other","javascript:alert(1)","World",""]{assert!(checked_workspace(value).is_err());}}}

#[cfg(test)]mod section_tests{use super::*;
#[test]fn detached_panels_have_scoped_routes_and_never_select_a_controller_or_arbitrary_page(){
    for panel in ["objects","inspector","asset-library","map-sounds","navigation","construction"]{assert!(checked_panel("world",panel,true).is_ok());}
    for panel in ["director-keys","director-lens","engine-recording"]{assert!(checked_panel("machinima",panel,true).is_ok());assert!(checked_panel("world",panel,true).is_err());}
    for panel in ["sparklink","connection","../inspector","inspector&project=foreign"]{assert!(checked_panel("world",panel,true).is_err());}
    assert!(checked_panel("world","inspector",false).is_err());
    assert!(checked_panel("compare","compare-info",false).is_ok());
}
#[test]fn restored_windows_fit_negative_monitors_and_recover_when_a_display_disappears(){
    let left=Placement{x:-1920,y:-200,width:1920,height:1080};
    let primary=Placement{x:0,y:0,width:1920,height:1080};
    let original=Placement{x:-1600,y:-150,width:900,height:800};
    assert_eq!(fit_placement(&original,&[primary.clone(),left.clone()]),Some(original.clone()));
    let recovered=fit_placement(&original,&[primary.clone()]).unwrap();
    assert_eq!(recovered,Placement{x:0,y:0,width:900,height:800});
    let overflow=Placement{x:i32::MAX,y:i32::MIN,width:u32::MAX,height:u32::MAX};
    assert_eq!(fit_placement(&overflow,&[primary.clone()]),Some(primary));
    assert!(fit_placement(&original,&[]).is_none());
}
#[test]fn popouts_preserve_only_known_sections_and_safe_lesson_contexts(){
    assert_eq!(workspace_query("learning",None,Some("glossary")).unwrap(),"index.html?workspace=learning&section=glossary");
    assert_eq!(workspace_query("learning",Some("preservation"),Some("academy")).unwrap(),"index.html?workspace=learning&section=academy&lesson=preservation");
    assert!(workspace_query("academy",Some("preservation"),None).is_ok());
    assert!(workspace_query("settings",None,Some("dependencies")).is_ok());
    assert_eq!(workspace_query("settings",None,Some("interface")).unwrap(),"index.html?workspace=settings&section=interface");
    for (workspace,context,section) in [("settings",None,Some("tools&project=other")),("learning",Some("../elsewhere"),Some("academy")),("learning",Some("preservation"),Some("glossary")),("world",None,Some("glossary")),("learning",None,Some("https://example.com"))]{assert!(workspace_query(workspace,context,section).is_err());}
}
#[test]fn every_public_workspace_has_a_local_popout_route(){for workspace in ["library","map-finder","get-started","features","learning","how-to","community","world","tags","assets","scenario","build","preservation","settings","compare","runtimes","live","quickforge","firefight","interface","creator","machinima","academy"]{assert!(workspace_query(workspace,None,None).is_ok(),"{workspace}");}}
}

#[tauri::command]
pub(super) async fn close_application(app: tauri::AppHandle,window:tauri::WebviewWindow) -> Reply<()> {
    if app.webview_windows().keys().filter(|label|!label.starts_with("director-")).count()==1 {
        let closing=app.clone();tauri::async_runtime::spawn_blocking(move||{let state=closing.state::<AppState>();let mut live=lock(&state.live_mcc)?;if let Some(session)=live.as_ref(){crate::live_mcc::disconnect(session).map_err(error)?;}*live=None;Ok::<(),String>(())}).await.map_err(error)??;
    }
    workspace_windows::remember(&app,&window)?;
    workspace_windows::release_window(&app,window.label());
    lock(&app.state::<AppState>().document_owners)?.retain(|_,owner|owner!=window.label());
    window.destroy().map_err(error)
}

#[tauri::command]
pub(super) fn claim_project_document(state:State<AppState>,window:tauri::WebviewWindow,id:String)->Reply<()> {
    let _history_guard=lock(&state.window_history)?;
    let _=lock(&state.library)?.get(&id).map_err(error)?;
    let owners=lock(&state.document_owners)?;
    if owners.get(&id).is_some_and(|owner|owner!=window.label()){return Err("This map is already open for editing in another Spark window.".into());}
    drop(owners);shared_editing::claim_owner(&state,&id,window.label())?;lock(&state.document_owners)?.insert(id,window.label().into());Ok(())
}

#[tauri::command]
pub(super) fn release_project_document(state:State<AppState>,window:tauri::WebviewWindow,id:String)->Reply<()> {
    let _history_guard=lock(&state.window_history)?;
    let mut owners=lock(&state.document_owners)?;if owners.get(&id).is_some_and(|owner|owner==window.label()){owners.remove(&id);}Ok(())
}

#[tauri::command]
pub(super) async fn open_project_window(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,workspace:Option<String>,observe:Option<bool>,panel:Option<String>,focus_tag:Option<u32>,origin_workspace:Option<String>)->Reply<String> {
    let state=app.state::<AppState>();let _history_guard=lock(&state.window_history)?;let project=lock(&state.library)?.get(&id).map_err(error)?;
    check_document_owner(&state,&id,window.label())?;
    if app.webview_windows().len()>=16{return Err("Close a Spark window before opening another map editor".into());}
    let label=format!("editor-{}",uuid::Uuid::new_v4());
    let route=workspace.as_deref().map(workspace_windows::checked_workspace).transpose()?;
    let origin=origin_workspace.as_deref().map(workspace_windows::checked_workspace).transpose()?;
    let suffix=if let Some(panel)=panel.as_deref(){
        if observe==Some(true){return Err("An observing window cannot detach an editing drawer".into());}
        let legacy_tags=panel=="object-tags"&&route==Some("tags");
        if !legacy_tags {workspace_windows::checked_panel(route.ok_or("Choose a workspace before detaching a panel")?,panel,true)?;}
        if runtime_workbench::has_running(&state,&id)?{return Err("Close this map's active native tool before moving its editing drawer".into());}
        let focus=if legacy_tags {
            let selected=focus_tag.ok_or("Select a tag before detaching its drawer")?;
            if !inspect(&state,&project)?.tags.iter().any(|tag|tag.id==selected){return Err("The detached tag is not in this preserved map".into());}
            format!("&tag={selected}")
        }else{if focus_tag.is_some(){return Err("Tag focus requires the Object tags handoff".into());}String::new()};
        format!("&panel={panel}{focus}&returnWorkspace={}",origin.or(route).unwrap_or("world"))
    }else{if focus_tag.is_some()||origin.is_some(){return Err("Tag focus/origin requires a supported drawer handoff".into());}String::new()};
    let url=tauri::WebviewUrl::App(format!("index.html?project={}{}{}{}",project.id,route.map(|w|format!("&workspace={w}")).unwrap_or_default(),if observe==Some(true){"&observe=1"}else{""},suffix).into());
    // Only a registered UUID project may select the local app page. No arbitrary URL or script.
    if uuid::Uuid::parse_str(&project.id).is_err(){return Err("Invalid project identity".into());}
    let panel_only=panel.as_deref().is_some_and(|p|!(p=="object-tags"&&route==Some("tags")));
    // Reserve one writer while source/history are locked, then release the
    // lock BEFORE dispatching native window construction. A parent WebView can
    // synchronously ask for history on the UI thread during that dispatch.
    let prior_owner=lock(&state.document_owners)?.get(&id).cloned();
    if observe!=Some(true){shared_editing::claim_owner(&state,&id,&label)?;lock(&state.document_owners)?.insert(id.clone(),label.clone());}
    drop(_history_guard);
    let restore=||->Reply<()> {
        if observe==Some(true){return Ok(())}
        let _guard=lock(&state.window_history)?;
        if lock(&state.document_owners)?.get(&id).map(String::as_str)!=Some(&label){return Ok(())}
        shared_editing::claim_owner(&state,&id,prior_owner.as_deref().unwrap_or(window.label()))?;
        let mut owners=lock(&state.document_owners)?;
        if let Some(previous)=&prior_owner{owners.insert(id.clone(),previous.clone());}else{owners.remove(&id);}
        drop(owners);let _=app.emit("spark:window-history",serde_json::json!({"projectId":id,"owner":prior_owner}));Ok(())
    };
    let child=match tauri::WebviewWindowBuilder::new(&app,&label,url).title(format!("{} · Project Guilty Spark",project.title)).inner_size(if panel_only{620.}else{1440.},900.).min_inner_size(if panel_only{400.}else{800.},400.).decorations(false).transparent(true).shadow(false).theme(Some(tauri::Theme::Dark)).build(){Ok(child)=>child,Err(reason)=>{restore()?;return Err(error(reason));}};
    if let Err(reason)=workspace_windows::register(&app,&child,workspace_windows::ReturnTarget{origin:window.label().into(),project:Some(id.clone()),workspace:origin.or(route).unwrap_or("world").into(),panel:panel.clone()}){restore()?;workspace_windows::forget(&state,&label)?;let _=child.destroy();return Err(reason);}
    if observe!=Some(true){let _=app.emit("spark:window-history",serde_json::json!({"projectId":id,"owner":child.label()}));}Ok(label)
}

#[tauri::command]
pub(super) fn return_project_to_main(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,workspace:Option<String>,panel:Option<String>,allow_missing_main:Option<bool>,activate:Option<bool>)->Reply<()> {
    let state=app.state::<AppState>();let _guard=lock(&state.window_history)?;
    if !window.label().starts_with("editor-"){return Err("Only a detached map editor can return its document".into());}
    if lock(&state.document_owners)?.get(&id).map(String::as_str)!=Some(window.label()){return Err("Only the current editing window can return this map".into());}
    let _=lock(&state.library)?.get(&id).map_err(error)?;
    if runtime_workbench::has_running(&state,&id)?{return Err("Close this map's native tool before moving its editing window".into());}
    let route=workspace.as_deref().map(workspace_windows::checked_workspace).transpose()?;
    let target=workspace_windows::target(&state,window.label())?;
    if target.as_ref().is_some_and(|target|target.project.as_deref()!=Some(&id)||target.panel!=panel){return Err("The returning panel no longer matches its native window".into());}
    let original=target.as_ref().map_or("main",|target|target.origin.as_str());
    let main=match app.get_webview_window(original){Some(main)=>main,None if allow_missing_main==Some(true)=>return Ok(()),None=>return Err("The original Spark window is closed; keep editing in this window".into())};
    workspace_windows::remember(&app,&window)?;
    shared_editing::claim_owner(&state,&id,original)?;
    lock(&state.document_owners)?.insert(id.clone(),original.into());
    if let Err(reason)=main.emit("spark:reattach-project",serde_json::json!({"id":id,"workspace":route,"panel":panel,"activate":activate.unwrap_or(true)})){
        shared_editing::claim_owner(&state,&id,window.label())?;
        lock(&state.document_owners)?.insert(id,window.label().into());
        return Err(error(reason));
    }
    workspace_windows::forget(&state,window.label())?;
    if activate!=Some(false){let _=main.show();let _=main.set_focus();}Ok(())
}

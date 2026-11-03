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
    if let Some(section)=section{if !matches!((workspace,section),("learning","guides"|"glossary"|"academy")|("settings","tools"|"dependencies"|"interface")){return Err("Invalid workspace section".into());}query.push_str(&format!("&section={section}"));}
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

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
    views: HashMap<String, WorkspaceView>,
}
/// Navigation context only. Source data, permissions and Undo remain in their
/// existing document/history owners; a window report cannot grant a write lease.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub(super) struct WorkspaceView {
    pub workspace: String,
    pub project: Option<String>,
    pub section: Option<String>,
    pub dirty: bool,
    #[serde(default)]
    pub documents: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub(super) struct WorkspaceWindow {
    label: String,
    workspace: Option<String>,
    project: Option<String>,
    section: Option<String>,
    title: String,
    dirty: bool,
    writable: bool,
    panel: Option<String>,
    current: bool,
}
fn check_view(view:&WorkspaceView)->Reply<()> {
    workspace_query(&view.workspace,None,view.section.as_deref())?;
    if view.project.as_ref().is_some_and(|id|uuid::Uuid::parse_str(id).is_err()) {
        return Err("Invalid workspace project identity".into());
    }
    if view.documents.len()>64||view.documents.iter().any(|id|uuid::Uuid::parse_str(id).is_err())||view.documents.iter().collect::<std::collections::HashSet<_>>().len()!=view.documents.len(){return Err("Invalid open-map window context".into());}
    Ok(())
}
fn focus_window(app:&tauri::AppHandle,label:&str)->Reply<()> {
    // The app's own handles are the entire inventory. No process launch or OS
    // window lookup is accepted from a WebView.
    if label.starts_with("director-") {return Err("Use Recording Director to select its window".into());}
    let window=app.get_webview_window(label).ok_or("This Spark window has closed")?;
    window.unminimize().map_err(error)?;window.show().map_err(error)?;window.set_focus().map_err(error)
}
#[tauri::command]
pub(super) fn update_workspace_view(app:tauri::AppHandle,window:tauri::WebviewWindow,view:WorkspaceView)->Reply<()> {
    check_view(&view)?;
    let state=app.state::<AppState>();
    if let Some(id)=&view.project{let _=lock(&state.library)?.get(id).map_err(error)?;}
    for id in &view.documents{let _=lock(&state.library)?.get(id).map_err(error)?;}
    let mut windows=lock(&state.workspace_windows)?;
    if windows.views.get(window.label())==Some(&view){return Ok(());}
    windows.views.insert(window.label().into(),view);
    drop(windows);
    app.emit("spark:workspace-windows",()).map_err(error)
}
#[tauri::command]
pub(super) fn workspace_window_inventory(app:tauri::AppHandle,window:tauri::WebviewWindow)->Reply<Vec<WorkspaceWindow>> {
    let state=app.state::<AppState>();
    let (views,returns)={let windows=lock(&state.workspace_windows)?;(windows.views.clone(),windows.returns.clone())};
    let owners=lock(&state.document_owners)?.clone();
    let library=lock(&state.library)?;
    let mut rows=Vec::new();
    for (label,_) in app.webview_windows().into_iter().filter(|(label,_)|!label.starts_with("director-")&&label!="spark-orb") {
        let view=views.get(&label);
        let project=view.and_then(|v|v.project.as_deref());
        let title=if let Some(id)=project{library.get(id).map(|p|p.title).unwrap_or_else(|_|"Unavailable map".into())}else{"Project Guilty Spark".into()};
        rows.push(WorkspaceWindow{current:label==window.label(),workspace:view.map(|v|v.workspace.clone()),
            project:project.map(str::to_owned),section:view.and_then(|v|v.section.clone()),title,
            dirty:view.is_some_and(|v|v.dirty),writable:project.is_some_and(|id|owners.get(id)==Some(&label)),
            panel:returns.get(&label).and_then(|r|r.panel.clone()),label});
    }
    rows.sort_by(|a,b|b.current.cmp(&a.current).then(a.label.cmp(&b.label)));Ok(rows)
}
#[tauri::command]
pub(super) fn focus_workspace_window(app:tauri::AppHandle,label:String)->Reply<()> {focus_window(&app,&label)}
fn existing_workspace(app:&tauri::AppHandle,current:&str,view:&WorkspaceView,panel:Option<&str>)->Reply<Option<String>> {
    let state=app.state::<AppState>();let windows=lock(&state.workspace_windows)?;
    Ok(windows.views.iter().find(|(label,v)|label.as_str()!=current&&v.workspace==view.workspace&&(view.project.is_none()||v.project==view.project)&&v.section==view.section&&
        windows.returns.get(*label).and_then(|r|r.panel.as_deref())==panel&&app.get_webview_window(label).is_some()).map(|(label,_)|label.clone()))
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct Placement { x:i32, y:i32, width:u32, height:u32 }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub(super) struct SavedWorkspaceWindow {
    main:bool,view:WorkspaceView,placement:Placement,writable:bool,
    panel:Option<String>,focus_tag:Option<u32>,source_sha256:Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub(super) struct SavedWorkspaceLayout {schema_version:u32,windows:Vec<SavedWorkspaceWindow>}
fn checked_layout(layout:&SavedWorkspaceLayout)->Reply<()> {
    if layout.schema_version!=1||layout.windows.is_empty()||layout.windows.len()>16||layout.windows.iter().filter(|w|w.main).count()!=1{return Err("The saved workspace layout is invalid; current windows remain open".into());}
    for window in &layout.windows {
        check_view(&window.view)?;
        if let Some(panel)=&window.panel {
            if !(panel=="object-tags"&&window.view.workspace=="tags"&&window.focus_tag.is_some()) {checked_panel(&window.view.workspace,panel,window.view.project.is_some())?;}
        }
        if window.source_sha256.as_ref().is_some_and(|s|s.len()!=64||!s.bytes().all(|b|b.is_ascii_hexdigit())){return Err("Invalid saved map source identity".into());}
    }
    Ok(())
}
type LayoutProfiles=std::collections::BTreeMap<String,SavedWorkspaceLayout>;
fn layout_name(value:Option<&str>)->Reply<String>{let name=value.unwrap_or("Studio").trim();if name.is_empty()||name.len()>80||name.chars().any(char::is_control){Err("Use a layout name of 1–80 characters".into())}else{Ok(name.into())}}
fn read_layout(state:&AppState,name:Option<&str>)->Reply<SavedWorkspaceLayout>{
    let name=layout_name(name)?;
    let mut profiles:LayoutProfiles=lock(&state.library)?.setting("workspace-layout-profiles-v1").map_err(error)?;
    let layout=match profiles.remove(&name){Some(layout)=>layout,None if name=="Studio"=>lock(&state.library)?.setting::<Option<SavedWorkspaceLayout>>("workspace-layout-v1").map_err(error)?.ok_or("Save a workspace layout first")?,None=>return Err("This saved layout is unavailable; current windows remain open".into())};
    checked_layout(&layout)?;Ok(layout)
}
#[tauri::command]
pub(super) fn save_workspace_layout(app:tauri::AppHandle,name:Option<String>)->Reply<SavedWorkspaceLayout>{
    let name=layout_name(name.as_deref())?;
    let state=app.state::<AppState>();
    let (views,returns)={let s=lock(&state.workspace_windows)?;(s.views.clone(),s.returns.clone())};
    let owners=lock(&state.document_owners)?.clone();let mut windows=Vec::new();
    for (label,window) in app.webview_windows(){
        if label.starts_with("director-"){continue;}
        let Some(view)=views.get(&label) else{continue;};
        let project=view.project.as_ref().map(|id|lock(&state.library)?.get(id).map_err(error)).transpose()?;
        let position=window.outer_position().map_err(error)?;let size=window.inner_size().map_err(error)?;
        let panel=returns.get(&label).and_then(|r|r.panel.clone()).filter(|panel|checked_panel(&view.workspace,panel,view.project.is_some()).is_ok()||panel=="object-tags"&&view.workspace=="tags");
        let focus_tag=if panel.as_deref()==Some("object-tags")&&view.workspace=="tags"{window.url().map_err(error)?.query_pairs().find(|(k,_)|k=="tag").and_then(|(_,v)|v.parse().ok())}else{None};
        windows.push(SavedWorkspaceWindow{main:label=="main",view:view.clone(),placement:Placement{x:position.x,y:position.y,width:size.width,height:size.height},writable:view.project.as_ref().is_some_and(|id|owners.get(id)==Some(&label)),panel,focus_tag,source_sha256:project.and_then(|p|p.source.map(|s|s.sha256))});
    }
    if !windows.iter().any(|w|w.main){if let Some(window)=windows.first_mut(){window.main=true;}}
    windows.sort_by_key(|w|!w.main);let layout=SavedWorkspaceLayout{schema_version:1,windows};checked_layout(&layout)?;
    let library=lock(&state.library)?;
    let mut profiles:LayoutProfiles=library.setting("workspace-layout-profiles-v1").map_err(error)?;
    if profiles.len()>=12&&!profiles.contains_key(&name){return Err("Twelve layouts are saved. Choose an existing name to update it".into());}
    // Keep the original Studio record readable while adding named arrangements.
    if name=="Studio"{library.set_setting("workspace-layout-v1",&layout).map_err(error)?;}
    profiles.insert(name.clone(),layout);library.set_setting("workspace-layout-profiles-v1",&profiles).map_err(error)?;
    drop(library);
    // Read the selected profile back, independent of profile-name ordering.
    read_layout(&state,Some(&name))
}
#[tauri::command]
pub(super) fn read_workspace_layout(state:State<AppState>,name:Option<String>)->Reply<SavedWorkspaceLayout>{read_layout(&state,name.as_deref())}
#[tauri::command]
pub(super) fn workspace_layout_names(state:State<AppState>)->Reply<Vec<String>>{
    let library=lock(&state.library)?;
    let profiles:LayoutProfiles=library.setting("workspace-layout-profiles-v1").map_err(error)?;
    let mut names:Vec<_>=profiles.keys().cloned().collect();
    if !profiles.contains_key("Studio")&&library.setting::<Option<SavedWorkspaceLayout>>("workspace-layout-v1").map_err(error)?.is_some(){names.push("Studio".into());names.sort();}
    Ok(names)
}
#[tauri::command]
pub(super) fn restore_workspace_placement(app:tauri::AppHandle,label:String,index:usize,name:Option<String>)->Reply<()> {
    let state=app.state::<AppState>();let layout=read_layout(&state,name.as_deref())?;let saved=layout.windows.get(index).ok_or("Saved window no longer exists")?;
    let view=lock(&state.workspace_windows)?.views.get(&label).cloned().ok_or("Workspace window is not ready")?;
    if view.workspace!=saved.view.workspace||view.project!=saved.view.project||view.section!=saved.view.section{return Err("Saved placement belongs to another workspace".into());}
    if let Some(id)=&view.project{let project=lock(&state.library)?.get(id).map_err(error)?;if project.source.as_ref().map(|s|&s.sha256)!=saved.source_sha256.as_ref(){return Err("Saved placement belongs to another source revision".into());}}
    let window=app.get_webview_window(&label).ok_or("Workspace window has closed")?;apply_placement(&window,&saved.placement)
}

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
    fit_placement_minimum(p,monitors,320,240)
}
fn fit_placement_minimum(p:&Placement,monitors:&[Placement],minimum_width:u32,minimum_height:u32)->Option<Placement> {
    let monitor=monitors.iter().max_by_key(|m|{
        let width=(i64::from(p.x)+i64::from(p.width)).min(i64::from(m.x)+i64::from(m.width))-i64::from(p.x.max(m.x));
        let height=(i64::from(p.y)+i64::from(p.height)).min(i64::from(m.y)+i64::from(m.height))-i64::from(p.y.max(m.y));
        width.max(0)*height.max(0)
    })?;
    let width=p.width.clamp(minimum_width,8192).min(monitor.width);
    let height=p.height.clamp(minimum_height,8192).min(monitor.height);
    let x=i64::from(p.x).clamp(i64::from(monitor.x),i64::from(monitor.x)+i64::from(monitor.width-width));
    let y=i64::from(p.y).clamp(i64::from(monitor.y),i64::from(monitor.y)+i64::from(monitor.height-height));
    Some(Placement{x:x as i32,y:y as i32,width,height})
}
pub(super) fn target(state:&AppState,label:&str)->Reply<Option<ReturnTarget>> {
    Ok(lock(&state.workspace_windows)?.returns.get(label).cloned())
}
pub(super) fn forget(state:&AppState,label:&str)->Reply<()> {
    let mut windows=lock(&state.workspace_windows)?;windows.returns.remove(label);windows.views.remove(label);Ok(())
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
    let fitted=if window.label()=="spark-orb"{fit_placement_minimum(p,&monitors,76,76)}else{fit_placement(p,&monitors)};
    if let Some(p)=fitted{
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
    if window.label()!="spark-orb"&&target(&app.state::<AppState>(),window.label())?.is_none(){return Ok(())}
    if window.is_fullscreen().map_err(error)?||window.is_maximized().map_err(error)?{return Ok(())}
    let p=window.outer_position().map_err(error)?;let size=window.inner_size().map_err(error)?;
    apply_placement(&window,&Placement{x:p.x,y:p.y,width:size.width,height:size.height})
}
/// Optional companion: the same app/session, a cached picture and a command-hub
/// shortcut only. No document clone, renderer, build worker or native game link.
#[tauri::command]
pub(super) async fn show_spark_companion(app:tauri::AppHandle,visible:bool)->Reply<()> {
    if let Some(window)=app.get_webview_window("spark-orb"){
        if visible{return focus_window(&app,"spark-orb");}
        remember_spark_companion(app.clone())?;return window.destroy().map_err(error);
    }
    if !visible{return Ok(())}
    let window=tauri::WebviewWindowBuilder::new(&app,"spark-orb",tauri::WebviewUrl::App("index.html?companion=1".into()))
        .title("Spark companion").inner_size(96.,96.).resizable(false).decorations(false).transparent(true).shadow(false).skip_taskbar(true).always_on_top(true).build().map_err(error)?;
    let state=app.state::<AppState>();
    let saved:Option<Placement>=lock(&state.library)?.setting("desktop-spark-placement-v1").map_err(error)?;
    if let Some(saved)=saved{apply_placement(&window,&saved)?;}else{let _=window.center();}
    Ok(())
}
#[tauri::command]
pub(super) fn remember_spark_companion(app:tauri::AppHandle)->Reply<()> {
    let window=app.get_webview_window("spark-orb").ok_or("Spark companion is closed")?;
    let p=window.outer_position().map_err(error)?;let size=window.inner_size().map_err(error)?;
    let state=app.state::<AppState>();
    let result=lock(&state.library)?.set_setting("desktop-spark-placement-v1",&Placement{x:p.x,y:p.y,width:size.width,height:size.height}).map_err(error);result
}
#[tauri::command]
pub(super) fn open_spark_command_hub(app:tauri::AppHandle)->Reply<()> {
    let window=app.get_webview_window("main").or_else(||app.webview_windows().into_iter().find(|(label,_)|label!="spark-orb"&&!label.starts_with("director-")).map(|(_,w)|w)).ok_or("Open a Spark workspace first")?;
    focus_window(&app,window.label())?;window.emit("spark:command-hub",()).map_err(error)
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
    let target=state.workspace_windows.lock().ok().and_then(|mut s|{s.views.remove(label);s.returns.remove(label)});
    let _=app.emit("spark:workspace-windows",());
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
pub(super) async fn open_workspace_window(app:tauri::AppHandle,window:tauri::WebviewWindow,workspace:String,context:Option<String>,section:Option<String>,panel:Option<String>,another:Option<bool>)->Reply<String>{
    let mut query=workspace_query(&workspace,context.as_deref(),section.as_deref())?;
    if let Some(panel)=&panel {checked_panel(&workspace,panel,false)?;query.push_str(&format!("&panel={panel}"));}
    let view=WorkspaceView{workspace:workspace.clone(),project:None,section:section.clone(),dirty:false,documents:Vec::new()};
    // An explicit lesson requests its own context; don't focus a different one.
    if another!=Some(true)&&context.is_none(){if let Some(label)=existing_workspace(&app,window.label(),&view,panel.as_deref())?{focus_window(&app,&label)?;return Ok(label);}}
    if app.webview_windows().len()>=16{return Err("Close a Spark window before opening another workspace".into());}
    let label=format!("workspace-{}",uuid::Uuid::new_v4());
    let child=tauri::WebviewWindowBuilder::new(&app,&label,tauri::WebviewUrl::App(query.into())).title("Project Guilty Spark").inner_size(if panel.is_some(){620.}else{1120.},800.).min_inner_size(if panel.is_some(){400.}else{720.},400.).resizable(true).decorations(false).transparent(true).shadow(false).theme(Some(tauri::Theme::Dark)).build().map_err(error)?;
    if let Err(reason)=register(&app,&child,ReturnTarget{origin:window.label().into(),project:None,workspace,panel}){let _=child.destroy();return Err(reason);}
    lock(&app.state::<AppState>().workspace_windows)?.views.insert(label.clone(),view);
    let _=app.emit("spark:workspace-windows",());
    Ok(label)
}
#[cfg(test)]mod tests{use super::*;#[test]fn workspace_urls_accept_only_local_known_routes(){assert!(checked_workspace("academy").is_ok());assert!(checked_workspace("tags").is_ok());for value in ["https://example.com","../index.html","world&project=other","javascript:alert(1)","World",""]{assert!(checked_workspace(value).is_err());}}}

#[cfg(test)]mod section_tests{use super::*;
#[test]fn layout_names_remain_bounded_local_labels(){
    assert_eq!(layout_name(None).unwrap(),"Studio");
    assert_eq!(layout_name(Some("  Map Builder  ")).unwrap(),"Map Builder");
    for name in ["","  ","bad\nname",&"x".repeat(81)]{assert!(layout_name(Some(name)).is_err());}
}
#[test]fn saved_layouts_are_bounded_known_views_and_never_serialize_tool_execution(){
    let window=SavedWorkspaceWindow{main:true,view:WorkspaceView{workspace:"learning".into(),project:None,section:Some("glossary".into()),dirty:false,documents:Vec::new()},placement:Placement{x:-30000,y:40000,width:900,height:700},writable:false,panel:None,focus_tag:None,source_sha256:None};
    assert!(checked_layout(&SavedWorkspaceLayout{schema_version:1,windows:vec![window.clone()]}).is_ok());
    assert!(checked_layout(&SavedWorkspaceLayout{schema_version:1,windows:vec![window.clone();17]}).is_err());
    let mut bad=window.clone();bad.main=false;assert!(checked_layout(&SavedWorkspaceLayout{schema_version:1,windows:vec![bad]}).is_err());
    let mut value=serde_json::to_value(SavedWorkspaceLayout{schema_version:1,windows:vec![window]}).unwrap();value["toolCommand"]=serde_json::json!("native-build");assert!(serde_json::from_value::<SavedWorkspaceLayout>(value).is_err());
}
#[test]fn window_context_is_navigation_only_and_checks_routes_sections_and_source_identity(){
    let good=WorkspaceView{workspace:"tags".into(),project:Some(uuid::Uuid::new_v4().to_string()),section:None,dirty:true,documents:Vec::new()};
    assert!(check_view(&good).is_ok());
    assert!(check_view(&WorkspaceView{workspace:"https://example.com".into(),..good.clone()}).is_err());
    assert!(check_view(&WorkspaceView{section:Some("tools".into()),..good.clone()}).is_err());
    assert!(check_view(&WorkspaceView{project:Some("../../foreign".into()),..good.clone()}).is_err());
    let mut value=serde_json::to_value(&good).unwrap();value["command"]=serde_json::json!("execute");assert!(serde_json::from_value::<WorkspaceView>(value).is_err());
}
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
    let orb=Placement{x:-30000,y:30000,width:96,height:96};
    let recovered=fit_placement_minimum(&orb,&[Placement{x:0,y:0,width:1920,height:1080}],76,76).unwrap();
    assert_eq!(recovered,Placement{x:0,y:984,width:96,height:96});
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
    if app.webview_windows().keys().filter(|label|!label.starts_with("director-")&&label.as_str()!="spark-orb").count()==1 {
        let closing=app.clone();tauri::async_runtime::spawn_blocking(move||{let state=closing.state::<AppState>();let mut live=lock(&state.live_mcc)?;if let Some(session)=live.as_ref(){crate::live_mcc::disconnect(session).map_err(error)?;}*live=None;Ok::<(),String>(())}).await.map_err(error)??;
        if let Some(orb)=app.get_webview_window("spark-orb"){let _=remember_spark_companion(app.clone());orb.destroy().map_err(error)?;}
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
pub(super) async fn open_project_window(app:tauri::AppHandle,window:tauri::WebviewWindow,id:String,workspace:Option<String>,observe:Option<bool>,panel:Option<String>,focus_tag:Option<u32>,origin_workspace:Option<String>,another:Option<bool>,section:Option<String>)->Reply<String> {
    let state=app.state::<AppState>();let _history_guard=lock(&state.window_history)?;let project=lock(&state.library)?.get(&id).map_err(error)?;
    let label=format!("editor-{}",uuid::Uuid::new_v4());
    let route=workspace.as_deref().map(workspace_windows::checked_workspace).transpose()?;
    let origin=origin_workspace.as_deref().map(workspace_windows::checked_workspace).transpose()?;
    workspace_query(route.unwrap_or("world"),None,section.as_deref())?;
    let view=WorkspaceView{workspace:route.unwrap_or("world").into(),project:Some(id.clone()),section:section.clone(),dirty:false,documents:vec![id.clone()]};
    if another!=Some(true) {
        if let Some(existing)=existing_workspace(&app,window.label(),&view,panel.as_deref())?{
            if observe==Some(true)||lock(&state.document_owners)?.get(&id)==Some(&existing){drop(_history_guard);focus_window(&app,&existing)?;return Ok(existing);}
        }
    }
    if observe!=Some(true){check_document_owner(&state,&id,window.label())?;}
    if app.webview_windows().len()>=16{return Err("Close a Spark window before opening another map editor".into());}
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
    let url=tauri::WebviewUrl::App(format!("index.html?project={}{}{}{}{}",project.id,route.map(|w|format!("&workspace={w}")).unwrap_or_default(),if observe==Some(true){"&observe=1"}else{""},section.map(|s|format!("&section={s}")).unwrap_or_default(),suffix).into());
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
    lock(&state.workspace_windows)?.views.insert(label.clone(),view);
    let _=app.emit("spark:workspace-windows",());
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

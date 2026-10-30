use super::*;
pub(super) fn checked_workspace(value:&str)->Reply<&str>{
    if matches!(value,"library"|"map-finder"|"get-started"|"features"|"how-to"|"community"|"world"|"tags"|"assets"|"scenario"|"build"|"preservation"|"settings"|"compare"|"runtimes"|"live"|"quickforge"|"firefight"|"interface"|"creator"|"machinima"|"academy"){Ok(value)}else{Err("Unknown Spark workspace".into())}
}
#[tauri::command]
pub(super) async fn open_workspace_window(app:tauri::AppHandle,workspace:String,context:Option<String>)->Reply<String>{
    let workspace=checked_workspace(&workspace)?;
    let mut query=format!("index.html?workspace={workspace}");
    if let Some(context)=context{if workspace!="academy"||context.is_empty()||context.len()>64||!context.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){return Err("Invalid tutorial context".into());}query.push_str(&format!("&lesson={context}"));}
    if app.webview_windows().len()>=16{return Err("Close a Spark window before opening another workspace".into());}
    let label=format!("workspace-{}",uuid::Uuid::new_v4());
    tauri::WebviewWindowBuilder::new(&app,&label,tauri::WebviewUrl::App(query.into())).title("Project Guilty Spark").inner_size(1120.,800.).min_inner_size(720.,500.).resizable(true).decorations(false).transparent(true).shadow(true).theme(Some(tauri::Theme::Dark)).build().map_err(error)?;
    Ok(label)
}
#[cfg(test)]mod tests{use super::*;#[test]fn workspace_urls_accept_only_local_known_routes(){assert!(checked_workspace("academy").is_ok());assert!(checked_workspace("tags").is_ok());for value in ["https://example.com","../index.html","world&project=other","javascript:alert(1)","World",""]{assert!(checked_workspace(value).is_err());}}}

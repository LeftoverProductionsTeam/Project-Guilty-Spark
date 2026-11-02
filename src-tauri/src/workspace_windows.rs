use super::*;
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
pub(super) async fn open_workspace_window(app:tauri::AppHandle,workspace:String,context:Option<String>,section:Option<String>)->Reply<String>{
    let query=workspace_query(&workspace,context.as_deref(),section.as_deref())?;
    if app.webview_windows().len()>=16{return Err("Close a Spark window before opening another workspace".into());}
    let label=format!("workspace-{}",uuid::Uuid::new_v4());
    tauri::WebviewWindowBuilder::new(&app,&label,tauri::WebviewUrl::App(query.into())).title("Project Guilty Spark").inner_size(1120.,800.).min_inner_size(720.,500.).resizable(true).decorations(false).transparent(true).shadow(false).theme(Some(tauri::Theme::Dark)).build().map_err(error)?;
    Ok(label)
}
#[cfg(test)]mod tests{use super::*;#[test]fn workspace_urls_accept_only_local_known_routes(){assert!(checked_workspace("academy").is_ok());assert!(checked_workspace("tags").is_ok());for value in ["https://example.com","../index.html","world&project=other","javascript:alert(1)","World",""]{assert!(checked_workspace(value).is_err());}}}

#[cfg(test)]mod section_tests{use super::*;
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

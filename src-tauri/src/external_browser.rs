use super::*;
pub(super) fn validate(url:&str)->Reply<String> {
    if url.len()>4096||url.chars().any(char::is_control){return Err("Invalid external browser address".into());}
    let parsed=reqwest::Url::parse(url).map_err(error)?;
    if parsed.scheme()!="https"||parsed.host_str().is_none()||!parsed.username().is_empty()||parsed.password().is_some(){return Err("External browser links require a complete HTTPS address without credentials".into());}
    Ok(parsed.into())
}
#[tauri::command]
pub(super) async fn open_external_url(url:String)->Reply<()> {
    let url=validate(&url)?;
    tauri::async_runtime::spawn_blocking(move||{
        let (exe,_,_)=dependency_install::browser_executable()?;
        let mut command=std::process::Command::new(exe);command.arg(url);
        #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
        command.spawn().map_err(error)?;Ok(())
    }).await.map_err(error)?
}
#[cfg(test)]mod tests {use super::*;#[test]fn external_browser_never_accepts_files_commands_credentials_or_controls(){for value in ["file:///C:/x.exe","javascript:alert(1)","steam://run/730","https://user:pass@example.com","https://example.com\n.exe"]{assert!(validate(value).is_err());}assert!(validate("https://halomaps.org/").is_ok());}}

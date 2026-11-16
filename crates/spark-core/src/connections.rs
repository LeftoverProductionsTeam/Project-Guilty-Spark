//! Read-only authoring-kit checks. File identity is not proof of execution.
use crate::{maps, reject_links, Result};
use serde::{Serialize,Deserialize};
use std::{path::{Path,PathBuf},io::Read};
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ToolFile {
    pub name:String,pub purpose:String,pub path:Option<PathBuf>,pub state:String,
    pub sha256:Option<String>,pub bytes:u64,pub executed:bool,
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct KitReport {
    pub root:PathBuf,pub generation:String,pub tools:Vec<ToolFile>,pub editable_tags:String,
    pub source_data:String,pub notes:Vec<String>,
    #[serde(default,skip_serializing_if="Option::is_none")] pub sdk_archive:Option<ToolFile>,
}
/// Picker probe only: signature recognition is not full archive/content verification.
pub fn validate_sdk_archive(file:&Path)->Result<()> {
 crate::library::validate_local_input_path(file)?;reject_links(file)?;
 if !file.extension().and_then(|v|v.to_str()).is_some_and(|v|v.eq_ignore_ascii_case("7z")){return crate::invalid("Choose the installed Halo SDK .7z archive, or use an existing editable tags folder");}
 let mut input=std::fs::File::open(file)?;if !input.metadata()?.is_file()||input.metadata()?.len()<32{return crate::invalid("SDK archive is missing or truncated; choose a complete installed SDK archive");}
 let mut signature=[0;6];input.read_exact(&mut signature)?;if signature!=[0x37,0x7a,0xbc,0xaf,0x27,0x1c]{return crate::invalid("This file is not a recognized 7z SDK archive. No settings or source were changed");}Ok(())
}
pub fn inspect_kit(root:&Path,generation:&str,tags:Option<&Path>)->Result<KitReport> {
    reject_links(root)?;
    let mut tools=vec![];
    for (name,purpose) in [("tool.exe","Map Builder — imports assets and compiles maps"),
        ("guerilla.exe","Tag editor — edits Halo game data"),("sapien.exe","Scenario editor — places objects and AI"),
        ("halo_tag_test.exe","Standalone — tests editable H1A tags in the game engine")] {
        let mut item=ToolFile{name:name.into(),purpose:purpose.into(),path:None,state:"Missing".into(),sha256:None,bytes:0,executed:false};
        let file=root.join(name);
        if file.is_file() {
            item.path=Some(file.clone());
            item.state="Invalid executable header".into();
            if reject_links(&file).is_ok() {
                let mut f=std::fs::File::open(&file)?;let size=f.metadata()?.len();
                if (64..=256*1024*1024).contains(&size) {
                    let mut header=[0u8;64];f.read_exact(&mut header)?;
                    let offset=u32::from_le_bytes(header[60..64].try_into().unwrap()) as u64;
                    if &header[..2]==b"MZ" && offset>=64 && offset.checked_add(24).is_some_and(|end|end<=size) {
                        use std::io::{Seek,SeekFrom};f.seek(SeekFrom::Start(offset))?;
                        let mut signature=[0u8;6];f.read_exact(&mut signature)?;
                        if &signature[..4]==b"PE\0\0" && matches!(u16::from_le_bytes(signature[4..6].try_into().unwrap()),0x14c|0x8664) {
                            item.state="PE header checked; not run".into();item.sha256=Some(maps::hash_file(&file)?);item.bytes=size;
                        }
                    }
                }
            }
        }
        tools.push(item);
    }
    let tag_root=tags.map(Path::to_path_buf).unwrap_or_else(||root.join("tags"));
    let globals=tag_root.join("globals/globals.globals");
    let editable_tags=if globals.is_file() && reject_links(&globals).is_ok() {
        let mut f=std::fs::File::open(globals)?;let mut h=[0u8;64];
        if f.read_exact(&mut h).is_ok() && &h[60..64]==b"blam" && &h[36..40]==b"matg" {
            "Editable globals tag header checked; project dependencies still need a build preflight"
        } else {"The globals tag is not a supported editable Halo tag"}
    } else {"Editable Halo Tags missing — select a legal base tagset or extract the kit's bundled tags"}.into();
    let archive=root.join("HCEEK.7z");let sdk_archive=if archive.is_file(){Some(ToolFile{name:"HCEEK.7z".into(),purpose:"Installed source archive; prepare separately without replacing original tags".into(),path:Some(archive.clone()),state:match validate_sdk_archive(&archive){Ok(())=>"7z signature checked; contents not prepared".into(),Err(issue)=>issue.to_string()},sha256:None,bytes:std::fs::metadata(&archive)?.len(),executed:false})}else{None};
    Ok(KitReport{sdk_archive,root:root.into(),generation:generation.into(),tools,editable_tags,
        source_data:if root.join("data").is_dir(){"Source data folder found; required images/models are checked per project"}else{"Source data folder missing; imports use TIFF/JMS/source files in data"}.into(),
        notes:vec!["MCC H1A Tool produces MCC maps. Legacy CE requires its own compatible base tags and builder.".into(),
        "Official kits may include an extraction batch/archive. Read its supplied instructions and extract into a fresh working copy before selecting tags. Spark can prepare the installed SDK archive into a separately owned tagset; it does not run supplied batch scripts or overwrite stock tags.".into(),
        "Generation comes from the selected profile or Steam app 1532190. PE signatures and SHA-256 identify files, not publisher authenticity or successful execution.".into()]})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sdk_picker_checks_signature_without_claiming_content_or_modifying_sources() {
        let temp=tempfile::tempdir().unwrap();
        let archive=temp.path().join("HCEEK.7z");
        let mut bytes=vec![0u8;32];bytes[..6].copy_from_slice(&[0x37,0x7a,0xbc,0xaf,0x27,0x1c]);
        std::fs::write(&archive,&bytes).unwrap();
        validate_sdk_archive(&archive).unwrap();
        let report=inspect_kit(temp.path(),"h1aEk",None).unwrap();
        let found=report.sdk_archive.unwrap();
        assert!(found.state.contains("contents not prepared"));assert!(!found.executed);assert!(found.sha256.is_none());
        assert_eq!(std::fs::read(&archive).unwrap(),bytes);
        std::fs::write(&archive,b"truncated").unwrap();assert!(validate_sdk_archive(&archive).is_err());
        std::fs::write(&archive,vec![0;32]).unwrap();assert!(validate_sdk_archive(&archive).is_err());
        let other=temp.path().join("setup.exe");std::fs::write(&other,&bytes).unwrap();assert!(validate_sdk_archive(&other).is_err());
        assert!(validate_sdk_archive(Path::new("HCEEK.7z")).is_err());
    }
}

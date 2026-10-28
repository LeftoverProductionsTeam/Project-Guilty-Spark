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
    Ok(KitReport{root:root.into(),generation:generation.into(),tools,editable_tags,
        source_data:if root.join("data").is_dir(){"Source data folder found; required images/models are checked per project"}else{"Source data folder missing; imports use TIFF/JMS/source files in data"}.into(),
        notes:vec!["MCC H1A Tool produces MCC maps. Legacy CE requires its own compatible base tags and builder.".into(),
        "Official kits may include an extraction batch/archive. Read its supplied instructions and extract into a fresh working copy before selecting tags. Spark does not run those scripts or overwrite stock tags.".into(),
        "Generation comes from the selected profile or Steam app 1532190. PE signatures and SHA-256 identify files, not publisher authenticity or successful execution.".into()]})
}

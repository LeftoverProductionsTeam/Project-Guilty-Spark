//! Verify every source ZIP member against its manifest; optionally extract into
//! a fresh directory. No source code or external process is executed.
use std::{collections::{BTreeMap,BTreeSet},fs,io::Read,path::PathBuf};
use sha2::{Digest,Sha256};
fn main()->Result<(),Box<dyn std::error::Error>> {
    let file=PathBuf::from(std::env::args_os().nth(1).ok_or("Supply a source ZIP")?);
    spark_core::archive::inventory(&file)?; // independent bounded classic-ZIP preflight
    let mut zip=zip::ZipArchive::new(fs::File::open(&file)?)?;
    let mut indexes=BTreeMap::new();
    for(i,name)in zip.file_names().enumerate(){indexes.insert(name?.replace('\\',"/"),i);}
    let index=|name:&str|indexes.get(name).copied().ok_or_else(||format!("Missing source archive member: {name}"));
    let mut manifest=String::new();zip.by_index(index("SOURCE_SHA256SUMS.txt")?)?.take(1024*1024+1).read_to_string(&mut manifest)?;
    if manifest.len()>1024*1024{return Err("Manifest exceeds 1 MiB".into());}
    let mut duplicate=String::new();zip.by_index(index("SOURCE_MANIFEST_SHA256.txt")?)?.take(1024*1024+1).read_to_string(&mut duplicate)?;
    if duplicate!=manifest{return Err("Source manifests disagree".into());}
    let destination=std::env::args_os().nth(2).map(PathBuf::from);
    if let Some(root)=&destination{spark_core::reject_links(root)?;fs::create_dir(root)?;}
    let mut names=BTreeSet::new();let mut total=0usize;
    for line in manifest.lines().filter(|line|!line.is_empty()&&!line.starts_with('#')) {
        let(expected,name)=line.split_once("  ").ok_or("Malformed manifest record")?;
        let relative=spark_core::safe_relative(name)?;
        if !names.insert(name.to_ascii_lowercase())||expected.len()!=64||!expected.bytes().all(|c|c.is_ascii_hexdigit()){return Err("Invalid or duplicate checksum record".into());}
        let entry=zip.by_index(index(name)?)?;if entry.size()>32*1024*1024{return Err("Source member exceeds 32 MiB".into());}
        let mut bytes=vec![];entry.take(32*1024*1024+1).read_to_end(&mut bytes)?;total+=bytes.len();
        if bytes.len()>32*1024*1024||total>128*1024*1024{return Err("Source archive exceeds bounds".into());}
        if format!("{:x}",Sha256::digest(&bytes))!=expected{return Err(format!("Source checksum mismatch: {name}").into());}
        if let Some(root)=&destination{spark_core::project::atomic_write(&root.join(relative),&bytes,false)?;}
    }
    if zip.len()!=names.len()+2{return Err("Manifest does not cover all source members".into());}
    if let Some(root)=&destination{for name in ["SOURCE_SHA256SUMS.txt","SOURCE_MANIFEST_SHA256.txt"]{spark_core::project::atomic_write(&root.join(name),manifest.as_bytes(),false)?;}}
    println!("{}",serde_json::json!({"status":"PASS","files":zip.len(),"manifestEntries":names.len(),"uncompressedBytes":total,"sha256":spark_core::maps::hash_file(&file)?,"extracted":destination.is_some()}));Ok(())
}

//! Read retained native tool events and exercise the production error classifier.
use std::{fs,path::Path};
fn main()->Result<(),Box<dyn std::error::Error>> {
    let args:Vec<_>=std::env::args().collect();if args.len()!=2{return Err("qa_compile_diagnostic <owned-qa-events.jsonl>".into());}
    let file=Path::new(&args[1]);if fs::metadata(file)?.len()>16*1024*1024{return Err("Diagnostic event log exceeds 16 MiB".into());}
    let mut log=String::new();for line in fs::read_to_string(file)?.lines(){let event:serde_json::Value=serde_json::from_str(line)?;if event["phase"]=="compile"{if let Some(message)=event["message"].as_str(){log.push_str(message);log.push('\n');}}}
    println!("{}",serde_json::to_string_pretty(&serde_json::json!({"nativeSuccessConfirmed":spark_core::conversion::native_compile_succeeded(&log),"diagnostic":spark_core::conversion::native_compile_failure(&log),"scope":"Read-only classification of retained real tool output; no compilation or game launch"}))?);Ok(())
}

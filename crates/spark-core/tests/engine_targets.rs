use spark_core::{project::{Project,EngineBuildTarget},quickforge,forge_build::{self,ForgeToolchain},runtime::RuntimeId};
fn target(runtime_id:RuntimeId)->EngineBuildTarget {EngineBuildTarget{id:uuid::Uuid::new_v4().to_string(),name:runtime_id.name().into(),runtime_id,
    builder:if runtime_id==RuntimeId::MccSteam {"h1a-tool"}else{"invader-ce"}.into(),hek_directory:None,
    hek_flavor:Some(if runtime_id==RuntimeId::MccSteam {"h1aEk"}else{"legacyHek"}.into()),tags_directory:None,invader_directory:None,
    ce_compatible_tagset:false,open_sauce:false}}
#[test] fn targets_persist_independently_and_inactive_edits_keep_active_identity(){
    let mut p=Project::new("Two engines");p.quick_forge=Some(quickforge::create_arena("Arena","sealedArena").unwrap());
    p.quick_forge.as_mut().unwrap().runtime_id=RuntimeId::MccSteam;
    let mcc=target(RuntimeId::MccSteam);p.active_build_target=Some(mcc.id.clone());p.build_targets=vec![mcc,target(RuntimeId::HaloCustomEdition)];p.validate().unwrap();
    let hash=p.fingerprint().unwrap();p.build_targets[1].name="Independent CE".into();assert_eq!(hash,p.fingerprint().unwrap());
    let round:Project=serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();assert_eq!(round.build_targets.len(),2);
    p.build_targets[0].tags_directory=Some("other-tags".into());assert_ne!(hash,p.fingerprint().unwrap());
}
#[test] fn mcc_cannot_use_ce_builder_and_ce_requires_explicit_base_review(){
    let mut p=Project::new("Targets");let mut t=target(RuntimeId::MccSteam);t.builder="invader-ce".into();p.active_build_target=Some(t.id.clone());p.build_targets.push(t);
    assert!(forge_build::tools_for_target(&p,ForgeToolchain::default()).is_err());
    let t=target(RuntimeId::HaloCustomEdition);p.active_build_target=Some(t.id.clone());p.build_targets=vec![t];
    assert!(forge_build::tools_for_target(&p,ForgeToolchain::default()).is_err());p.build_targets[0].ce_compatible_tagset=true;
    p.build_targets[0].hek_flavor=Some("h1aEk".into());assert!(forge_build::tools_for_target(&p,ForgeToolchain::default()).is_ok());
}
#[test] fn opensauce_cannot_be_configured_as_an_mcc_extension(){let mut p=Project::new("No cross-engine plugins");let mut t=target(RuntimeId::MccSteam);t.open_sauce=true;p.build_targets.push(t);assert!(p.validate().is_err());}

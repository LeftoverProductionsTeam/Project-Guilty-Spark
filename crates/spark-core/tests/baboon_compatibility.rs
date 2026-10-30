use spark_core::{
    runtime::RuntimeId,
    runtime_adapters::{baboon_kit_for_source, target_for},
};

#[test]
fn compiled_cache_and_legacy_runtime_never_authorize_an_mcc_tag_handoff() {
    let mcc = target_for(RuntimeId::MccSteam, "windows");
    assert!(baboon_kit_for_source(&mcc, false).is_none());
    assert_eq!(
        baboon_kit_for_source(&mcc, true).unwrap().game,
        "haloce_mcc"
    );
    for runtime in [
        RuntimeId::HaloCustomEdition,
        RuntimeId::HaloPc,
        RuntimeId::MacDemo,
        RuntimeId::HaloXbox,
    ] {
        assert!(baboon_kit_for_source(&target_for(runtime, "windows"), true).is_none());
    }
}

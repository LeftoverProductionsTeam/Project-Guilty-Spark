//! Read-only runtime adapters. Discovery never executes a game or writes game data.
use crate::{invalid, maps, steam, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub const ADAPTER_SCHEMA_VERSION: u32 = 1;
pub const ADAPTER_VERSION: u32 = 1;
const MAX_INVENTORY_ENTRIES: usize = 4096;
const MAX_EXECUTABLE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeId {
    MccSteam,
    ChupathingyCe,
    OpenCe,
    ArenaEvolved,
    HaloPc,
    HaloCustomEdition,
    MacRetail,
    MacDemo,
    HaloPcTrial,
    HaloMd,
    HaloXbox,
}
impl RuntimeId {
    pub(crate) const ALL: [Self; 11] = [
        Self::MccSteam,
        Self::ChupathingyCe,
        Self::OpenCe,
        Self::ArenaEvolved,
        Self::HaloPc,
        Self::HaloCustomEdition,
        Self::MacRetail,
        Self::MacDemo,
        Self::HaloPcTrial,
        Self::HaloMd,
        Self::HaloXbox,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::MccSteam => "Steam MCC / Halo 1",
            Self::ChupathingyCe => "ChupathingyCE",
            Self::OpenCe => "OpenCE",
            Self::ArenaEvolved => "Arena Evolved",
            Self::HaloPc => "Halo PC Retail",
            Self::HaloCustomEdition => "Halo Custom Edition",
            Self::MacRetail => "Halo Mac Retail (preservation)",
            Self::MacDemo => "Halo Mac Demo (preservation)",
            Self::HaloPcTrial => "Halo PC Trial (preservation)",
            Self::HaloMd => "HaloMD (preservation)",
            Self::HaloXbox => "Halo Xbox (preservation)",
        }
    }
    pub fn allows_registration(self) -> bool {
        matches!(
            self,
            Self::ChupathingyCe | Self::OpenCe | Self::ArenaEvolved | Self::HaloPc | Self::HaloCustomEdition
        )
    }
    pub fn is_native(self) -> bool {
        matches!(self, Self::ChupathingyCe | Self::OpenCe)
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SupportStatus {
    Supported,
    Unsupported,
    Unknown,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TestStatus {
    Pass,
    Fail,
    Blocked,
    Untested,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EvidenceKind {
    Application,
    OfficialDocumentation,
    UpstreamSource,
    UserDeclaration,
    LocalInspection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReference {
    pub title: String,
    pub url: String,
    pub revision: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HostingAction {
    TestSolo,
    HostLan,
    HostPrivateOnline,
    JoinFriend,
    DedicatedServer,
}

/// Read-only instructions, never a launch/deploy/network command.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostingPlan {
    pub runtime_id: RuntimeId,
    pub action: HostingAction,
    pub status: SupportStatus,
    pub evidence: EvidenceKind,
    pub test_status: TestStatus,
    pub automatic: bool,
    pub title: String,
    pub steps: Vec<String>,
    pub limitations: Vec<String>,
    pub sources: Vec<SourceReference>,
}

pub fn hosting_plan(runtime_id: RuntimeId, action: HostingAction) -> HostingPlan {
    hosting_plan_for(runtime_id,action,None)
}
pub fn hosting_plan_for(runtime_id: RuntimeId, action: HostingAction, scenario_type: Option<u16>) -> HostingPlan {
    use HostingAction::*;
    let mut plan = HostingPlan {
        runtime_id, action, status: SupportStatus::Unknown, evidence: EvidenceKind::Application,
        test_status: TestStatus::Untested, automatic: false, title: format!("{} — manual hosting guidance", runtime_id.name()),
        steps: vec![], sources: vec![], limitations: vec![
            "No runtime session or two-computer gameplay was tested. Manifest agreement proves matching declarations only.".into(),
            "Firefight rules export solo native HaloScript for a matching singleplayer scenario. The authored encounters and scripts still need native compilation; multiplayer round authority and shared victory are not accepted.".into(),
            "A successful export, generic runtime launch or source-level capability does not prove a compiled map is playable.".into(),
        ],
    };
    if runtime_id == RuntimeId::ArenaEvolved {
        plan.evidence=EvidenceKind::UpstreamSource;plan.sources=source(runtime_id);
        plan.title="Arena Evolved 0.7.7-beta — runtime menu handoff".into();
        plan.status=SupportStatus::Supported;
        plan.steps.push("Connect your separately installed Arena Evolved release in Games & tools. Its own menus discover owned MCC/Workshop content; Custom Edition maps still need compatible resource banks.".into());
        plan.steps.push(match action {
            DedicatedServer=>"The pinned release documents halo --server / HOST A SERVER. Spark does not start a server, expose its admin interface or change its configuration automatically.",
            JoinFriend=>"Use Arena Evolved's server browser, LAN list or its documented address/invitation interface. Spark's Chupathingy Delta List is not Arena Evolved's master list.",
            HostLan|HostPrivateOnline=>"Use MULTIPLAYER > CREATE GAME in Arena Evolved. Choose LAN or HOST ONLINE and review privacy, map sharing, bot settings and compatible gametype in the runtime.",
            TestSolo=>"Choose a compatible owned map and solo/bot lobby in Arena Evolved. Spark's source preview and successful native build do not prove game loading.",
        }.into());
        plan.limitations.push("Release 0.7.7-beta declares network 41. Shared stock behavior and compatible content are required; Arena-specific gametypes/packs need matching clients. This is not unmodified MCC crossplay.".into());
        plan.limitations.push("The release reports intermittent joining-in-progress failures when downloading a map. No Arena game, bots, stats, Live Link or multiplayer acceptance is attached.".into());
    } else if runtime_id.is_native() {
        let (repo, revision) = if runtime_id == RuntimeId::ChupathingyCe {
            (
                "ChupathingyCE/chupathingyce",
                "d7fafc81f824886d7fccd58fcf954691df6c6901",
            )
        } else {
            (
                "OpenCommunityEdition/OpenCE",
                "7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d",
            )
        };
        plan.evidence = EvidenceKind::UpstreamSource;
        plan.sources.push(SourceReference {
            title: "Pinned runtime menus and network settings".into(),
            url: format!("https://github.com/{repo}/blob/{revision}/port/linux/README.md"),
            revision: Some(revision.into()),
        });
        plan.status = SupportStatus::Supported;
        plan.steps.push("Open your separately installed runtime. Verify its build, network version, map family and required resource hashes with your peer.".into());
        match action {
            TestSolo => plan.steps.push("Choose the campaign in the runtime menu, or use a multiplayer lobby's documented Start With One Player setting. Select an already compiled, compatible map.".into()),
            HostLan => plan.steps.push("Use the runtime's Multiplayer / System Link menus on the same local network. Choose the compatible map and have the other computer join the visible lobby.".into()),
            HostPrivateOnline => {
                plan.steps.push("Use Multiplayer > Create Game > Internet. Choose the map; set LISTING to PRIVATE in Server Setup before starting.".into());
                plan.steps.push("Share the runtime-generated invite privately. Guilty Spark does not read, generate, copy or distribute invite tokens.".into());
            },
            JoinFriend => plan.steps.push("Use the runtime's documented invite-link interface, then its join/system-link lobby. Check the installed version's clipboard setting before relying on clipboard joins.".into()),
            DedicatedServer => {
                plan.steps.clear();
                if runtime_id == RuntimeId::ChupathingyCe {
                    plan.sources.push(SourceReference {title:"Pinned Linux dedicated-server setup".into(),url:format!("https://github.com/{repo}/blob/{revision}/server/README.md"),revision:Some(revision.into())});
                    plan.steps.push("Follow the dedicated-server README for its separate Linux server binary, external legally obtained map/resource data and playlist.".into());
                    plan.steps.push("The documented entry point is HALO_DEDICATED pointing at a playlist, with HALO_DATA_ROOT selecting data. Check HALO_DEDICATED_PUBLIC before hosting; public listing is the upstream default.".into());
                    plan.limitations.push("The Windows desktop adapter does not install, configure or launch the Linux dedicated server. No Firefight playlist/compiler integration has been verified.".into());
                } else {
                    plan.status=SupportStatus::Unknown;
                    plan.steps.push("No pinned OpenCE dedicated-server launch interface was verified in this audit. Consult the exact installed release's documentation.".into());
                }
            }
        }
        plan.limitations.push("Upstream menu/network support is separate from local installation validation. Native runtime interoperability depends on exact builds and content families.".into());
        plan.limitations.push("Invites are private access tokens. Review the runtime's listing and map-sharing settings yourself before hosting copyrighted or private content.".into());
    } else if runtime_id == RuntimeId::MccSteam {
        plan.evidence = EvidenceKind::OfficialDocumentation;
        plan.sources = source(runtime_id);
        plan.sources.push(SourceReference {title:"Official MCC co-op mode limits".into(),url:"https://support.halowaypoint.com/hc/en-us/articles/4403583912084-What-Is-the-Difference-between-Co-op-Firefight-and-Spartan-Ops-in-Halo-The-Master-Chief-Collection-MCC".into(),revision:None});
        plan.sources.push(SourceReference {title:"Official MCC lobby and friend invitations".into(),url:"https://support.halowaypoint.com/hc/en-us/articles/4401928876692-Quick-Start-Guide-for-Halo-The-Master-Chief-Collection-MCC".into(),revision:None});
        plan.sources.push(SourceReference {title:"Official MCC modded Custom Games and EAC-disabled launch".into(),url:"https://support.halowaypoint.com/hc/en-us/articles/360037475251-How-to-Launch-Halo-The-Master-Chief-Collection-with-Easy-Anti-Cheat-EAC-Disabled".into(),revision:None});
        match action {
            TestSolo|HostPrivateOnline|JoinFriend => {
                plan.status=SupportStatus::Supported;
                plan.steps.push("Use matching MCC builds and the same validated mod/map package on every computer. For modded content, launch MCC from Steam using Anti-Cheat Disabled (Mods and Limited Services).".into());
                if action != TestSolo { plan.steps.push("Use MCC's roster/friend invitation controls to join the same private lobby.".into()); }
                match scenario_type {
                    Some(1)=>plan.steps.push("Choose Halo: Combat Evolved in Custom Games, select the installed multiplayer map and compatible game variant, then start the private match.".into()),
                    Some(0)=>plan.steps.push("Select the installed Halo: Combat Evolved campaign mod and mission in MCC's campaign menus.".into()),
                    Some(2)=>{plan.status=SupportStatus::Unsupported;plan.steps.push("The current source is a user-interface cache, not a playable campaign or multiplayer level. Choose a gameplay map.".into());},
                    _=>plan.steps.push("Choose Custom Games for a multiplayer map, or Campaign for a campaign mission. Confirm the intended content type before starting.".into()),
                }
            },
            HostLan=>plan.steps.push("Configure local networking with the installed MCC version's documented lobby/network controls. Spark has no verified automated LAN-lobby setup; test the exact map and both clients independently.".into()),
            DedicatedServer=>plan.steps.push("Spark has no verified self-hosted MCC dedicated-server launcher. Use the private Custom Games lobby workflow for multiplayer maps; service-managed MCC servers are a separate interface.".into()),
        }
        plan.limitations.push("Official Halo: Combat Evolved MCC campaign co-op is limited to two players. This does not establish arbitrary multiplayer-map AI synchronization.".into());
        plan.limitations.push("The recovered zombie source currently has unresolved conversion errors; no playable MCC zombie package or Firefight integration has been demonstrated.".into());
    } else if runtime_id == RuntimeId::HaloCustomEdition && action == DedicatedServer {
        plan.status = SupportStatus::Supported;
        plan.automatic = true;
        plan.title = "Custom Edition — owned private dedicated host".into();
        plan.steps = vec![
            "Open Online → Host game and select Halo Custom Edition. Connect the installed game in Settings if needed.".into(),
            "Choose a native CE multiplayer map, game type and 1–16 player limit. Start private server; Spark verifies and copies the selected game inputs into a separate session directory.".into(),
            "Wait for the native map-loaded status, then use Custom Edition → Multiplayer → Direct IP with the displayed 127.0.0.1 address on this computer.".into(),
            "Stop the private server in its owning window. Workspace switching retains it; closing that window stops it.".into(),
        ];
        plan.limitations = vec![
            "Windows and loopback-only private CE dedicated hosting. No public listing, LAN/VPN exposure, MCC cross-play, expanded population or arbitrary console commands are enabled by this control.".into(),
            "Server map/status/lifecycle checks do not establish client joining, movement or gameplay for the selected map. Confirm those independently through the matching private client trial.".into(),
        ];
    } else {
        if !runtime_id.allows_registration() {
            plan.status = SupportStatus::Unsupported;
        }
        plan.steps.push("This profile has no verified hosting adapter. Preservation and map inspection do not imply executable, multiplayer or Firefight support.".into());
    }
    plan
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityEvidence {
    pub key: String,
    pub status: SupportStatus,
    pub evidence: EvidenceKind,
    pub test_status: TestStatus,
    pub detail: String,
    pub sources: Vec<SourceReference>,
}
#[cfg(test)] mod hosting_context_tests {
    use super::*;
    #[test]
    fn forerunner_profiles_keep_exact_binary_and_dependency_architecture(){assert_eq!(forerunner_windows_machine(FORERUNNER_WINDOWS_X64_CURRENT_SHA256),Some(0x8664));assert_eq!(shared_content_interface(RuntimeId::OpenCe,FORERUNNER_WINDOWS_X64_CURRENT_SHA256),Some("forerunner"));assert_eq!(forerunner_windows_machine(FORERUNNER_WINDOWS_X86_SHA256),Some(0x014c));assert_eq!(forerunner_windows_machine(FORERUNNER_WINDOWS_X64_SHA256),Some(0x8664));assert_eq!(forerunner_windows_machine(FORERUNNER_WINDOWS_X64_PREVIOUS_SHA256),Some(0x8664));assert_eq!(forerunner_windows_machine(&"0".repeat(64)),None);assert_eq!(shared_content_interface(RuntimeId::OpenCe,FORERUNNER_WINDOWS_X64_SHA256),Some("forerunner"));assert_eq!(shared_content_interface(RuntimeId::ChupathingyCe,FORERUNNER_WINDOWS_X64_SHA256),None);}
    #[test]fn forerunner_startup_requests_are_exact_pinned_basenames_and_never_live_acknowledgements(){
        assert_eq!(forerunner_solo_startup_selector(FORERUNNER_WINDOWS_X64_CURRENT_SHA256,"be_native").unwrap().as_deref(),Some("be_native@ce"));
        assert_eq!(forerunner_solo_startup_selector(FORERUNNER_WINDOWS_X64_STARTUP_SHA256,"be_native").unwrap().as_deref(),Some("be_native@ce"));
        assert_eq!(forerunner_windows_machine(FORERUNNER_WINDOWS_X64_SQUAD_MESSAGES_SHA256),Some(0x8664));
        assert_eq!(forerunner_solo_startup_selector(FORERUNNER_WINDOWS_X64_SQUAD_MESSAGES_SHA256,"be_native").unwrap().as_deref(),Some("be_native@ce"));
        assert_eq!(forerunner_windows_machine(FORERUNNER_WINDOWS_X64_SQUAD_SECONDARY_SHA256),Some(0x8664));
        assert_eq!(forerunner_solo_startup_selector(FORERUNNER_WINDOWS_X64_SQUAD_SECONDARY_SHA256,"be_native").unwrap().as_deref(),Some("be_native@ce"));
        for old in [FORERUNNER_WINDOWS_X86_SHA256,FORERUNNER_WINDOWS_X64_SHA256,FORERUNNER_WINDOWS_X64_PREVIOUS_SHA256]{assert_eq!(forerunner_solo_startup_selector(old,"be_native").unwrap(),None);}
        for bad in ["","../be_native","C:\\maps\\be_native","be_native@ce","be_native.map","map/name","with space"]{assert!(forerunner_solo_startup_selector(FORERUNNER_WINDOWS_X64_CURRENT_SHA256,bad).is_err());}
        assert!(forerunner_solo_startup_selector(&"0".repeat(64),"be_native").is_err());
    }
    fn reviewed_capabilities()->CompanionCapabilities {serde_json::from_value(serde_json::json!({"schema":"spark-forerunner.runtime-capabilities","contract_version":1,"engine":"Forerunner","build":{"upstream_version":"local-dev","commit":"review-fixture","platform":"Windows","architecture":"x64"},"simulation_hz":30,"network":{"advertised_version":45,"native_layout_version":44},"operations":["runtime.discover"],"process_entrypoints":["--help"],"startup_map":{"setting":"game.start_map","environment":"HALO_START_MAP","selector":"basename@ce","cache_version":609,"scenario_type":"solo","profile":"native-menu-create-or-existing","fresh_start":true,"network_host":false},"upstream_projects":["OpenCE"]})).unwrap()}
    #[test]fn reviewed_profiles_retain_exact_identity_without_expanding_builtin_pins(){
        let mut registration:RuntimeRegistration=serde_json::from_value(serde_json::json!({"id":"local","runtimeId":"openCe","root":"owned","executable":"owned/halo.exe","dataRoot":null,"version":null,"networkVersion":null})).unwrap();
        assert!(serde_json::to_value(&registration).unwrap().get("reviewedCompanion").is_none());let sha="a".repeat(64);assert_eq!(forerunner_windows_machine(&sha),None);
        let review=CompanionReview{executable_sha256:sha.clone(),dependency_sha256:"b".repeat(64),capabilities:reviewed_capabilities()};registration.reviewed_companion=Some(review);
        let restored:RuntimeRegistration=serde_json::from_slice(&serde_json::to_vec(&registration).unwrap()).unwrap();assert_eq!(restored.reviewed_companion,registration.reviewed_companion);
        assert_eq!(forerunner_registration_machine(&restored,&sha).unwrap(),Some(0x8664));assert_eq!(registration_content_interface(&restored,&sha).unwrap(),Some("forerunner"));assert_eq!(forerunner_registration_startup_selector(&restored,&sha,"be_native").unwrap().as_deref(),Some("be_native@ce"));assert_eq!(forerunner_windows_machine(&sha),None);
        assert!(forerunner_registration_machine(&restored,&"c".repeat(64)).is_err());assert!(forerunner_registration_startup_selector(&restored,&sha,"../map").is_err());registration.runtime_id=RuntimeId::ChupathingyCe;assert!(forerunner_registration_machine(&registration,&sha).is_err());
    }
    #[test]fn reviewed_profile_contract_refuses_unknown_startup_network_or_architecture(){
        let good=reviewed_capabilities();good.profile_machine().unwrap();
        for fault in 0..10{let mut bad=good.clone();match fault{0=>bad.contract_version=2,1=>bad.build.platform="Linux".into(),2=>bad.build.architecture="arm64".into(),3=>bad.simulation_hz=60,4=>bad.network.native_layout_version=45,5=>bad.startup_map.as_mut().unwrap().network_host=true,6=>bad.startup_map.as_mut().unwrap().fresh_start=false,7=>bad.startup_map.as_mut().unwrap().environment="ARBITRARY_ARGUMENT".into(),8=>bad.startup_map.as_mut().unwrap().cache_version=13,_=>bad.startup_map.as_mut().unwrap().selector="path".into()}assert!(bad.profile_machine().is_err(),"contract fault{fault}");}
        let mut older=good;older.startup_map=None;older.profile_machine().unwrap();let mut invalid=CompanionReview{executable_sha256:"a".repeat(64),dependency_sha256:"b".repeat(64),capabilities:older};assert!(invalid.validate(&"a".repeat(64)).is_ok());invalid.dependency_sha256="not-a-hash".into();assert!(invalid.validate(&"a".repeat(64)).is_err());
    }
    #[test]
    fn native_map_targets_extend_discovery_without_changing_reviewed_startup() {
        let previous = reviewed_capabilities();
        let mut current = previous.clone();
        let classic = CompanionMapTarget {
            cache_version: 609, tag_space_bytes: 23 << 20, invader_engine: "gbx-custom".into(),
            required_feature: None, is_default: true, max_netgame_flags: None, max_player_starts: None, max_netgame_equipment: None,
        };
        let expanded = CompanionMapTarget {
            cache_version: 13, tag_space_bytes: 64 << 20, invader_engine: "mcc-cea".into(),
            required_feature: Some("maps.mcc13_tag_space_64m.v1".into()), is_default: false, max_netgame_flags: None, max_player_starts: None, max_netgame_equipment: None,
        };
        current.map_targets = vec![classic, expanded];
        current.profile_machine().unwrap();
        assert!(current.matches_reviewed(&previous));
        assert_eq!(serde_json::to_value(&current).unwrap()["map_targets"][1]["tag_space_bytes"], 64 << 20);
        let without_flag_limit = current.clone();
        current.map_targets[1].max_netgame_flags = Some(4096);
        assert!(current.matches_reviewed(&without_flag_limit));
        assert_eq!(serde_json::to_value(&current).unwrap()["map_targets"][1]["max_netgame_flags"], 4096);
        let flags_only = current.clone();
        current.map_targets[1].max_player_starts = Some(1024);
        current.map_targets[1].max_netgame_equipment = Some(512);
        current.validate().unwrap();
        assert!(current.matches_reviewed(&flags_only));
        let reviewed = current.clone();
        assert_eq!(serde_json::to_value(&reviewed).unwrap()["map_targets"][1]["max_player_starts"], 1024);
        assert_eq!(serde_json::to_value(&reviewed).unwrap()["map_targets"][1]["max_netgame_equipment"], 512);
        current.map_targets[1].max_netgame_equipment = None;
        assert!(!current.matches_reviewed(&reviewed));
        current.map_targets[1].max_netgame_equipment = Some(0);
        assert!(current.validate().is_err());
        current.map_targets[1].max_netgame_equipment = Some(512);
        current.map_targets[1].max_netgame_flags = Some(200);
        assert!(!current.matches_reviewed(&reviewed));
        current.map_targets[1].max_netgame_flags = Some(0);
        assert!(current.validate().is_err());
        current.map_targets[1].max_netgame_flags = Some(4096);
        current.map_targets[1].tag_space_bytes -= 1;
        assert!(!current.matches_reviewed(&reviewed));
        current.startup_map.as_mut().unwrap().cache_version = 13;
        assert!(current.profile_machine().is_err());
        assert!(!current.matches_reviewed(&previous));
        current.map_targets.push(current.map_targets[0].clone());
        assert!(current.validate().is_err());
    }

    #[test]fn reviewed_profile_checks_real_pe_roles_architecture_and_dependency_hash(){
        let dir=tempfile::tempdir().unwrap();let exe=dir.path().join("halo.exe");let dll=dir.path().join("SDL3.dll");
        let image=|machine:u16,is_dll:bool|{let mut bytes=vec![0u8;128];bytes[..2].copy_from_slice(b"MZ");bytes[60..64].copy_from_slice(&64u32.to_le_bytes());bytes[64..68].copy_from_slice(b"PE\0\0");bytes[68..70].copy_from_slice(&machine.to_le_bytes());bytes[86..88].copy_from_slice(&(if is_dll{0x2000u16}else{0u16}).to_le_bytes());bytes};
        fs::write(&exe,image(0x8664,false)).unwrap();fs::write(&dll,image(0x8664,true)).unwrap();let capabilities=reviewed_capabilities();let sha=companion_dependency_sha256(&exe,&capabilities).unwrap();assert_eq!(sha,maps::hash_file(&dll).unwrap());
        let registration=RuntimeRegistration{reviewed_companion:Some(CompanionReview{executable_sha256:maps::hash_file(&exe).unwrap(),dependency_sha256:sha,capabilities:capabilities.clone()}),id:"local".into(),runtime_id:RuntimeId::OpenCe,root:dir.path().into(),executable:exe.clone(),data_root:None,version:None,network_version:None};inspect_registration(&registration).unwrap();
        let mut changed=image(0x8664,true);changed[127]=1;fs::write(&dll,&changed).unwrap();assert!(inspect_registration(&registration).unwrap_err().to_string().contains("SDL3.dll changed"));fs::write(&dll,image(0x014c,true)).unwrap();assert!(companion_dependency_sha256(&exe,&capabilities).is_err());fs::write(&dll,image(0x8664,false)).unwrap();assert!(companion_dependency_sha256(&exe,&capabilities).is_err());
    }
    #[test]#[ignore="Requires the explicitly reviewed installed Forerunner and original Xbox UI library; read-only plan only"]
    fn installed_forerunner_profile_plan_preserves_originals(){
        let executable=PathBuf::from(std::env::var_os("SPARK_NATIVE_FORERUNNER_EXE").expect("explicit engine"));let data=PathBuf::from(std::env::var_os("SPARK_NATIVE_FORERUNNER_DATA").expect("explicit data"));
        let original=maps::hash_file(&executable).unwrap();assert_eq!(original,FORERUNNER_WINDOWS_X64_CURRENT_SHA256);let ui=maps::hash_file(&data.join("maps/ui.map")).unwrap();
        let registration=RuntimeRegistration{reviewed_companion:None,id:"native-read-only-forerunner".into(),runtime_id:RuntimeId::OpenCe,root:executable.parent().unwrap().into(),executable:executable.clone(),data_root:Some(data.clone()),version:None,network_version:None};
        let plan=prepare_launch(&registration).unwrap();assert_eq!(plan.profile_interface.as_deref(),Some("forerunner"));assert!(!plan.direct_map_launch);assert!(plan.args.is_empty());assert_eq!(plan.environment.get("HALO_DATA_ROOT"),Some(&process_path(&data).unwrap()));assert!(!plan.environment.contains_key("HALO_START_MAP"));
        assert_eq!(original,maps::hash_file(&executable).unwrap());assert_eq!(ui,maps::hash_file(&data.join("maps/ui.map")).unwrap());
    }
    #[test] fn multiplayer_and_campaign_guides_use_their_actual_menu_context(){
        let multiplayer=hosting_plan_for(RuntimeId::MccSteam,HostingAction::HostPrivateOnline,Some(1));
        assert!(multiplayer.steps.iter().any(|step|step.contains("Custom Games")));
        assert!(!multiplayer.steps.iter().any(|step|step.contains("campaign mod and mission")));
        let campaign=hosting_plan_for(RuntimeId::MccSteam,HostingAction::TestSolo,Some(0));
        assert!(campaign.steps.iter().any(|step|step.contains("campaign mod and mission")));
        let ui=hosting_plan_for(RuntimeId::MccSteam,HostingAction::TestSolo,Some(2));
        assert_eq!(ui.status,SupportStatus::Unsupported);
        assert!(!multiplayer.automatic);
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapFamilyCapability {
    pub family: String,
    pub cache_versions: Vec<u32>,
    pub status: SupportStatus,
    pub evidence: EvidenceKind,
    pub test_status: TestStatus,
    pub detail: String,
    pub sources: Vec<SourceReference>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompanionCapabilities {
    pub schema: String,
    pub contract_version: u32,
    pub engine: String,
    pub build: CompanionBuild,
    pub simulation_hz: u16,
    pub network: CompanionNetwork,
    pub operations: Vec<String>,
    #[serde(default,skip_serializing_if="Vec::is_empty")]
    pub native_features: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub map_targets: Vec<CompanionMapTarget>,
    pub process_entrypoints: Vec<String>,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub startup_map: Option<CompanionStartupMap>,
    pub upstream_projects: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompanionMapTarget {
    pub cache_version: u32,
    pub tag_space_bytes: u32,
    pub invader_engine: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required_feature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_netgame_flags: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_player_starts: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_netgame_equipment: Option<u16>,
    #[serde(rename = "default")]
    pub is_default: bool,
}
// Advertised metadata is retained for inspection, never used as launch permission.
// Old admitted binaries omit it; unknown additive JSON fields stay ignorable.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompanionStartupMap {
    pub setting: String,
    pub environment: String,
    pub selector: String,
    pub cache_version: u32,
    pub scenario_type: String,
    pub profile: String,
    pub fresh_start: bool,
    pub network_host: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompanionBuild { pub upstream_version: String, pub commit: String, pub platform: String, pub architecture: String }
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompanionNetwork { pub advertised_version: u32, pub native_layout_version: u32 }
impl CompanionCapabilities {
    pub fn validate(&self)->Result<()>{
        if self.schema!="spark-forerunner.runtime-capabilities" || self.contract_version!=1 || self.engine!="Forerunner" {
            return invalid("Unsupported companion schema or version; no downgrade or live operation was attempted");
        }
        let text=|value:&str|!value.is_empty()&&value.len()<=256&&!value.chars().any(char::is_control);
        let identifier = |value: &str| !value.is_empty() && value.len() <= 96 &&
            value.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c));
        let mut targets = std::collections::BTreeSet::new();
        let invalid_targets = self.map_targets.len() > 16 ||
            self.map_targets.iter().filter(|row| row.is_default).count() > 1 ||
            self.map_targets.iter().any(|row| {
                row.cache_version == 0 || row.tag_space_bytes == 0 || !identifier(&row.invader_engine) ||
                row.required_feature.as_deref().is_some_and(|name| !identifier(name)) ||
                [row.max_netgame_flags, row.max_player_starts, row.max_netgame_equipment].into_iter()
                    .flatten().any(|limit| !(1..=32767).contains(&limit)) ||
                !targets.insert((row.cache_version, row.invader_engine.as_str()))
            });
        if invalid_targets || !(1..=1000).contains(&self.simulation_hz) ||
            [&self.build.upstream_version,&self.build.commit,&self.build.platform,&self.build.architecture].iter().any(|value|!text(value)) ||
            self.operations.is_empty()||self.operations.len()>64||!self.operations.iter().any(|value|value=="runtime.discover")||
            self.operations.iter().any(|value|value.is_empty()||value.len()>96||!value.bytes().all(|c|c.is_ascii_alphanumeric()||b"._-".contains(&c)))||
            self.native_features.len()>64||self.native_features.iter().any(|value|value.is_empty()||value.len()>96||!value.bytes().all(|c|c.is_ascii_alphanumeric()||b"._-".contains(&c)))||
            self.native_features.iter().collect::<std::collections::BTreeSet<_>>().len()!=self.native_features.len()||
            self.startup_map.as_ref().is_some_and(|startup|
                startup.cache_version==0 ||
                [&startup.setting,&startup.environment,&startup.selector,&startup.scenario_type,&startup.profile]
                    .iter().any(|value|!text(value))) ||
            self.process_entrypoints.len()>16||self.process_entrypoints.iter().any(|value|!text(value))||
            self.upstream_projects.len()>16||self.upstream_projects.iter().any(|value|!text(value)) {
            return invalid("Companion discovery fields exceed the version-1 contract bounds");
        }
        Ok(())
    }
    /// Older reviews omitted map discovery metadata. Executable and DLL
    /// identity are still pinned by the caller, and startup checks stay exact.
    pub fn matches_reviewed(&self, reviewed: &Self) -> bool {
        if self == reviewed { return true; }
        let mut map_targets = self.map_targets.clone();
        if reviewed.map_targets.is_empty() {
            map_targets.clear();
        } else {
            for (current, saved) in map_targets.iter_mut().zip(&reviewed.map_targets) {
                if saved.max_netgame_flags.is_none() {
                    current.max_netgame_flags = None;
                }
                if saved.max_player_starts.is_none() {
                    current.max_player_starts = None;
                }
                if saved.max_netgame_equipment.is_none() {
                    current.max_netgame_equipment = None;
                }
            }
        }
        Self { map_targets, ..self.clone() } == *reviewed
    }

    pub fn require_native_features(&self,required:&[String])->Result<()>{
        for feature in required{if !self.native_features.contains(feature){return invalid(format!("This map requires native feature {feature}, which the selected Forerunner build does not advertise. Select a verified compatible build; no playtest was started"));}}
        Ok(())
    }
}
/// An explicit creator review of one local build, not a publisher signature or
/// permission for advertised live/network operations. Stored in the same profile.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct CompanionReview {
 pub executable_sha256:String,
 pub dependency_sha256:String,
 pub capabilities:CompanionCapabilities,
}
impl CompanionCapabilities {
 pub fn profile_machine(&self)->Result<u16>{
  self.validate()?;
  if self.build.platform!="Windows"||self.simulation_hz!=30||self.network.advertised_version!=45||self.network.native_layout_version!=44{return invalid("This Forerunner contract has no reviewed Windows solo profile; its declared operations remain inspection-only");}
  if self.startup_map.as_ref().is_some_and(|s|s.setting!="game.start_map"||s.environment!="HALO_START_MAP"||s.selector!="basename@ce"||s.cache_version!=609||s.scenario_type!="solo"||s.profile!="native-menu-create-or-existing"||!s.fresh_start||s.network_host){return invalid("Unsupported Forerunner startup contract; no startup or hosting permission was granted");}
  match self.build.architecture.as_str(){"x64"=>Ok(0x8664),"x86"=>Ok(0x014c),_=>invalid("Forerunner profile architecture is not supported")}
 }
 pub fn identity_sha256(&self)->Result<String>{use sha2::Digest;Ok(crate::hex_bytes(sha2::Sha256::digest(serde_json::to_vec(self)?)))}
}
impl CompanionReview {
 pub fn validate(&self,sha256:&str)->Result<u16>{
  let hash=|value:&str|value.len()==64&&value.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b));
  if !hash(&self.executable_sha256)||!hash(&self.dependency_sha256)||self.executable_sha256!=sha256{return invalid("Reviewed Forerunner executable changed; inspect and explicitly review the new build before using it");}
  self.capabilities.profile_machine()
 }
}
fn windows_image_machine(path:&Path,dll:bool)->Result<u16>{
 use std::io::{Seek,SeekFrom};crate::reject_links(path)?;
 let size=fs::metadata(path)?.len();if !(64..=64*1024*1024).contains(&size){return invalid("Forerunner native member exceeds its inspected PE size bound");}
 let mut file=fs::File::open(path)?;let mut dos=[0;64];file.read_exact(&mut dos)?;
 if &dos[..2]!=b"MZ"{return invalid("Forerunner native member is not a PE image");}
 let offset=u32::from_le_bytes(dos[60..64].try_into().unwrap()) as u64;
 if offset<64||offset.checked_add(24).is_none_or(|end|end>size){return invalid("Forerunner PE header is outside its native member");}
 file.seek(SeekFrom::Start(offset))?;let mut header=[0;24];file.read_exact(&mut header)?;
 if &header[..4]!=b"PE\0\0"||(u16::from_le_bytes([header[22],header[23]])&0x2000!=0)!=dll{return invalid("Forerunner PE executable/library role is invalid");}
 Ok(u16::from_le_bytes([header[4],header[5]]))
}
/// Read-only adjacent dependency review; never borrow another runtime's DLL.
pub fn companion_dependency_sha256(executable:&Path,capabilities:&CompanionCapabilities)->Result<String>{
 let machine=capabilities.profile_machine()?;let library=executable.parent().ok_or_else(||crate::SparkError::Invalid("Forerunner package folder is missing".into()))?.join("SDL3.dll");
 if windows_image_machine(executable,false)?!=machine||windows_image_machine(&library,true)?!=machine{return invalid("Forerunner executable, contract and SDL3.dll architectures differ");}
 maps::hash_file(&library)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeRegistration {
    pub id: String,
    pub runtime_id: RuntimeId,
    pub root: PathBuf,
    pub executable: PathBuf,
    pub data_root: Option<PathBuf>,
    pub version: Option<String>,
    pub network_version: Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]
    pub reviewed_companion:Option<CompanionReview>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallation {
    pub registration_id: String,
    pub root: PathBuf,
    pub executable: Option<PathBuf>,
    pub data_root: PathBuf,
    pub executable_sha256: Option<String>,
    pub version: Option<String>,
    pub network_version: Option<String>,
    pub identity: String,
    pub validation: TestStatus,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeReport {
    pub schema_version: u32,
    pub adapter_version: u32,
    pub id: RuntimeId,
    pub name: String,
    pub host_platform: String,
    pub installation: Option<RuntimeInstallation>,
    pub capabilities: Vec<CapabilityEvidence>,
    pub map_families: Vec<MapFamilyCapability>,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMapEntry {
    pub relative_path: String,
    pub family: String,
    pub cache_version: Option<u32>,
    pub sha256: Option<String>,
    pub scenario_type: Option<u16>,
    pub file_size: u64,
    pub valid: bool,
    pub detail: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResourceEntry {
    pub relative_path: String,
    pub name: String,
    pub sha256: Option<String>,
    pub size: Option<u64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInventory {
    pub runtime_id: RuntimeId,
    pub registration_id: String,
    pub maps: Vec<RuntimeMapEntry>,
    pub resources: Vec<RuntimeResourceEntry>,
    pub diagnostics: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPlan {
    pub runtime_id: RuntimeId,
    pub executable: PathBuf,
    pub executable_sha256: String,
    pub profile_interface: Option<String>,
    pub cwd: PathBuf,
    pub args: Vec<String>,
    pub direct_map_launch: bool,
    pub environment: std::collections::BTreeMap<String, PathBuf>,
    pub warnings: Vec<String>,
}

/// A versioned adapter describes evidence and prepares actions; it never executes them.
pub trait HaloRuntimeAdapter {
    fn id(&self) -> RuntimeId;
    fn adapter_version(&self) -> u32 {
        ADAPTER_VERSION
    }
    fn descriptor(&self) -> RuntimeReport;
    fn inspect_registration(
        &self,
        registration: &RuntimeRegistration,
    ) -> Result<RuntimeInstallation> {
        if self.id() != registration.runtime_id {
            return invalid("Registration belongs to another runtime adapter");
        }
        inspect_registration(registration)
    }
    fn inventory_maps(&self, registration: &RuntimeRegistration) -> Result<RuntimeInventory> {
        if self.id() != registration.runtime_id {
            return invalid("Registration belongs to another runtime adapter");
        }
        inventory_maps(registration)
    }
    fn prepare_launch(&self, registration: &RuntimeRegistration) -> Result<LaunchPlan> {
        if self.id() != registration.runtime_id {
            return invalid("Registration belongs to another runtime adapter");
        }
        prepare_launch(registration)
    }
}
pub struct ProfileAdapter(pub RuntimeId);
impl HaloRuntimeAdapter for ProfileAdapter {
    fn id(&self) -> RuntimeId {
        self.0
    }
    fn descriptor(&self) -> RuntimeReport {
        descriptor(self.0)
    }
}

pub fn platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}
pub fn version_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._+-".contains(&c))
}

fn source(id: RuntimeId) -> Vec<SourceReference> {
    let (title, url, revision) = match id {
        RuntimeId::ChupathingyCe => ("ChupathingyCE audited README", "https://github.com/ChupathingyCE/chupathingyce/blob/d7fafc81f824886d7fccd58fcf954691df6c6901/README.md", Some("d7fafc81f824886d7fccd58fcf954691df6c6901")),
        RuntimeId::ArenaEvolved => ("Arena Evolved 0.7.7-beta release contract", "https://github.com/PeterRichardsonGolf/Halo-CE-Arena-Evolved/releases/tag/v0.7.7-beta", Some("f7a4a306e4a3ccc651ba447e81ea5c7f2ec00a5e")),
        RuntimeId::OpenCe => ("OpenCE audited README", "https://github.com/OpenCommunityEdition/OpenCE/blob/7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d/README.md", Some("7fb941b0b205edb1f7ecbb0aa6c2d7f5b884732d")),
        RuntimeId::MccSteam => ("Official MCC anti-cheat-disabled launch", "https://support.halowaypoint.com/hc/en-us/articles/360037475251-How-to-Launch-Halo-The-Master-Chief-Collection-with-Easy-Anti-Cheat-EAC-Disabled", None),
        _ => ("H1 cache format reference", "https://c20.reclaimers.net/h1/maps/", None),
    };
    vec![SourceReference {
        title: title.into(),
        url: url.into(),
        revision: revision.map(str::to_string),
    }]
}
fn capability(
    key: &str,
    status: SupportStatus,
    evidence: EvidenceKind,
    detail: &str,
    sources: Vec<SourceReference>,
) -> CapabilityEvidence {
    CapabilityEvidence {
        key: key.into(),
        status,
        evidence,
        test_status: TestStatus::Untested,
        detail: detail.into(),
        sources,
    }
}
fn descriptor(id: RuntimeId) -> RuntimeReport {
    use EvidenceKind::*;
    use SupportStatus::*;
    let preservation = !id.allows_registration() && id != RuntimeId::MccSteam;
    let upstream = if id == RuntimeId::MccSteam {
        OfficialDocumentation
    } else {
        UpstreamSource
    };
    let mut capabilities = vec![
        capability("inspectMaps", Supported, Application, "Guilty Spark inspects supported cache families; this is not a runtime playback result.", vec![]),
        capability("importMaps", Supported, Application, "Application import preserves and indexes supported cache families and bounded ZIP candidates. Unsupported or malformed formats remain blocked; importing does not establish playback.", vec![]),
        capability("editMaps", Supported, Application, "Only audited fields are editable. Rebuild/playback support is evaluated separately.", vec![]),
        capability("convertMaps", Unknown, Application, "Conversion requires the original resources, complete extraction and a target-specific rebuild. No universal conversion or playable output is claimed.", vec![]),
        capability("rebuildMaps", Unknown, Application, "Requires a complete extraction, original resources and the target-specific toolchain; no blanket conversion support.", vec![]),
        capability("launchRuntime", if preservation { Unsupported } else { Supported }, Application,
            if preservation { "Preservation profile only; no executable integration." } else { "Explicit launch requires a validated installation. No runtime was launched by adapter discovery." }, vec![]),
        capability("launchMap", if preservation { Unsupported } else { Unknown }, Application, "Direct map launch is not implemented or verified. Native adapters supply no guessed command-line flags.", vec![]),
        capability("hostMultiplayer", if preservation { Unknown } else { Supported }, upstream, "Documented engine capability; exact installed build, map and real multiplayer session remain untested.", source(id)),
        capability("networkedAi", if id.is_native() { Supported } else if matches!(id, RuntimeId::HaloPc | RuntimeId::HaloCustomEdition) { Unsupported } else { Unknown }, upstream,
            if id.is_native() { "Upstream actor replication exists separately from co-op scripts. This map and two-computer gameplay are untested." }
            else if id == RuntimeId::MccSteam { "Campaign co-op and arbitrary multiplayer AI are separate. No supported MCC multiplayer AI bridge is implemented." }
            else { "No arbitrary multiplayer AI synchronization is integrated for this profile." }, source(id)),
        capability("liveEditing", if id==RuntimeId::MccSteam{Unknown}else{Unsupported}, Application, if id==RuntimeId::MccSteam{"Experimental exact-build MCC Halo 1 object-position transport is implemented. Runtime rendering, collision relinking, broader editing and multiplayer acceptance require separate tests."}else{"No enabled live adapter profile for this runtime."}, vec![]),
        capability("vr", Unknown, Application, "No OpenXR runtime integration or gameplay test is implemented.", vec![]),
        capability("installMod", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "Only MCC owned local-package creation is implemented. It requires validated output and an exact Excession template; game enumeration remains untested.", vec![]),
        capability("registerMod", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "Only explicit MCC owned-root manifest registration is implemented; discovery never changes it.", vec![]),
        capability("unregisterMod", Unsupported, Application, "Manifest-root unregistration is not implemented. MCC owned-package removal is a separate operation.", vec![]),
        capability("removeMod", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "Only explicit verified removal of a Guilty Spark owned MCC package is implemented; stock content is excluded.", vec![]),
        capability("readLogs", Unsupported, Application, "Game-runtime log collection is not integrated. Application build logs are separate.", vec![]),
        capability("discoverRunning", if id == RuntimeId::MccSteam { Supported } else { Unsupported }, Application, "MCC process-name discovery is implemented; generic native running-instance discovery and attachment are not.", vec![]),
    ];
    if id == RuntimeId::MccSteam || id.is_native() {
        capabilities.push(capability("campaignCoop", Supported, upstream, "Documented upstream campaign capability. A valid authored campaign and separate real two-computer tests are required.", source(id)));
    }
    let host_supported = match id {
        RuntimeId::MccSteam | RuntimeId::HaloPc | RuntimeId::HaloCustomEdition => {
            platform() == "windows"
        }
        RuntimeId::ChupathingyCe => ["windows", "linux", "macos"].contains(&platform()),
        RuntimeId::OpenCe => ["windows", "linux"].contains(&platform()),
        RuntimeId::ArenaEvolved => ["windows", "linux", "macos"].contains(&platform()),
        _ => false,
    };
    if !host_supported {
        if let Some(launch) = capabilities.iter_mut().find(|c| c.key == "launchRuntime") {
            launch.status = Unsupported;
            launch.detail =
                "This profile has no established launch integration on the current host platform."
                    .into();
        }
    }
    if id==RuntimeId::ArenaEvolved {
        if let Some(launch)=capabilities.iter_mut().find(|c|c.key=="launchRuntime") {launch.status=Unknown;launch.detail="Arena Evolved 0.7.7-beta interfaces are reviewed; this adapter has no independently verified installed executable. Connect folders for read-only source discovery; launch and automatic hosting remain blocked.".into();}
        if let Some(ai)=capabilities.iter_mut().find(|c|c.key=="networkedAi") {ai.status=Unknown;ai.detail="Published bot gameplay does not establish Spark-authored encounter, Firefight, Zombie or multiplayer AI lifecycle acceptance.".into();}
    }
    let families = [
        ("xbox", vec![5]),
        ("demoTrial", vec![6]),
        ("pcMacHaloMd", vec![7]),
        ("customEdition", vec![609]),
        ("mccHalo1", vec![13]),
        ("openSauce", vec![]),
    ];
    let map_families = families.into_iter().map(|(family, versions)| {
        let version = versions.first().copied().unwrap_or(0);
        let supported = supports_map_version(id, version);
        MapFamilyCapability {
            family: family.into(), cache_versions: versions,
            status: if preservation { Unknown } else if supported { Supported } else { Unknown },
            evidence: if preservation { Application } else { upstream }, test_status: TestStatus::Untested,
            detail: if preservation { "Cache preservation/inspection profile only; no runtime execution claim." }
                else if version == 7 { "Version 7 does not distinguish retail, Mac or HaloMD provenance. Matching resources and target layout are required." }
                else if supported { "Family documented for this engine; each map still needs structural, resource and gameplay validation." }
                else { "Direct loading/conversion for this family is not established. Do not rewrite its version to claim compatibility." }.into(),
            sources: source(id),
        }
    }).collect();
    RuntimeReport {
        schema_version: ADAPTER_SCHEMA_VERSION,
        adapter_version: ADAPTER_VERSION,
        id,
        name: id.name().into(),
        host_platform: platform().into(),
        installation: None,
        capabilities,
        map_families,
        diagnostics: vec![
            "No local gameplay or two-computer multiplayer result is attached to this report."
                .into(),
        ],
    }
}

/// Existing format-family contract. This is not gameplay or conversion proof.
pub fn supports_map_version(id: RuntimeId, version: u32) -> bool {
    match id {
        RuntimeId::MccSteam => version == 13,
        RuntimeId::ChupathingyCe => [5, 7, 609].contains(&version),
        RuntimeId::OpenCe => [5, 609].contains(&version),
        RuntimeId::ArenaEvolved => [5, 609, 13].contains(&version),
        RuntimeId::HaloPc | RuntimeId::MacRetail | RuntimeId::HaloMd => version == 7,
        RuntimeId::HaloCustomEdition => version == 609,
        RuntimeId::MacDemo | RuntimeId::HaloPcTrial => version == 6,
        RuntimeId::HaloXbox => version == 5,
    }
}

pub fn report(
    steam: &steam::Installation,
    registrations: &[RuntimeRegistration],
) -> Result<Vec<RuntimeReport>> {
    if registrations.len() > 32 {
        return invalid("Too many runtime registrations");
    }
    let mut reports = Vec::new();
    for id in RuntimeId::ALL {
        let mut item = descriptor(id);
        if id == RuntimeId::MccSteam {
            if let Some(root) = &steam.mcc_path {
                let version = steam::mcc_build_id(steam).unwrap_or_else(|e| {
                    item.diagnostics.push(e.to_string());
                    None
                });
                let identity = if version.is_some() {
                    "steamManifest"
                } else {
                    "unknown"
                };
                item.installation = Some(RuntimeInstallation {
                    registration_id: "steam-976730".into(),
                    root: root.clone(),
                    executable: steam.steam_executable.clone(),
                    data_root: root.clone(),
                    executable_sha256: None,
                    version,
                    network_version: None,
                    identity: identity.into(),
                    validation: if steam.halo1_installed
                        && steam.steam_executable.as_ref().is_some_and(|p| p.is_file())
                    {
                        TestStatus::Pass
                    } else {
                        TestStatus::Blocked
                    },
                    diagnostics: steam.diagnostics.clone(),
                });
            }
            if platform() != "windows" {
                item.diagnostics.push(
                    "The Windows MCC modding workflow is not verified on this host platform."
                        .into(),
                );
            }
        } else if let Some(registration) = registrations.iter().find(|r| r.runtime_id == id) {
            match inspect_registration(registration) {
                Ok(installation) => item.installation = Some(installation),
                Err(e) => item
                    .diagnostics
                    .push(format!("Registration validation failed: {e}")),
            }
        }
        reports.push(item);
    }
    Ok(reports)
}

/// Paths sent to native engines must permit their documented C-style slash
/// joins. Rust's verbatim Windows roots disable slash translation. Keep the
/// canonical identity for authorization and verify the ordinary spelling still
/// resolves to that exact directory/file before giving it to a process.
pub fn process_path(path: &Path) -> Result<PathBuf> {
    #[cfg(windows)] {
        let canonical = fs::canonicalize(path)?;
        let text = canonical.to_str().ok_or_else(|| crate::SparkError::Invalid("Runtime path is not valid Unicode".into()))?;
        let ordinary = if let Some(tail) = text.strip_prefix(r"\\?\") {
            if tail.get(..4).is_some_and(|prefix| prefix.eq_ignore_ascii_case(r"UNC\")) {
                PathBuf::from(format!(r"\\{}", &tail[4..]))
            } else if tail.as_bytes().get(1) == Some(&b':') && tail.as_bytes().get(2) == Some(&b'\\') && tail.as_bytes()[0].is_ascii_alphabetic() {
                PathBuf::from(tail)
            } else { return invalid("This native engine cannot use a Windows device-namespace path"); }
        } else { canonical.clone() };
        if fs::canonicalize(&ordinary)? != canonical { return invalid("Runtime path spelling changed its source identity"); }
        Ok(ordinary)
    }
    #[cfg(not(windows))] { Ok(path.to_path_buf()) }
}
fn checked_directory(path: &Path) -> Result<PathBuf> {
    crate::reject_links(path)?;
    if !path.is_dir() {
        return invalid("Runtime directory does not exist");
    }
    Ok(fs::canonicalize(path)?)
}
fn registration_roots(registration: &RuntimeRegistration) -> Result<(PathBuf, PathBuf, PathBuf)> {
    if !registration.runtime_id.allows_registration() {
        return invalid(
            "This profile does not accept executable registrations; MCC uses Steam discovery",
        );
    }
    if !version_token(&registration.id) {
        return invalid("Registration ID must be a bounded identifier");
    }
    for value in [&registration.version, &registration.network_version]
        .into_iter()
        .flatten()
    {
        if !version_token(value) {
            return invalid(
                "Declared versions must be bounded version tokens, not paths or free-form text",
            );
        }
    }
    let root = checked_directory(&registration.root)?;
    crate::reject_links(&registration.executable)?;
    let executable = fs::canonicalize(&registration.executable)?;
    if !executable.starts_with(&root) {
        return invalid("Registered executable must be inside its installation root");
    }
    if !executable.is_file() {
        return invalid("Registered executable is not a regular file");
    }
    let data_root = checked_directory(
        registration
            .data_root
            .as_deref()
            .unwrap_or(&registration.root),
    )?;
    Ok((root, executable, data_root))
}
fn executable_format(path: &Path) -> Result<&'static str> {
    let meta = fs::metadata(path)?;
    if !(4..=MAX_EXECUTABLE_BYTES).contains(&meta.len()) {
        return invalid("Executable size is outside inspection limits");
    }
    let mut signature = [0u8; 4];
    fs::File::open(path)?.read_exact(&mut signature)?;
    if signature.starts_with(b"MZ") {
        Ok("windows")
    } else if signature == *b"\x7fELF" {
        Ok("linux")
    } else if [
        [0xfe, 0xed, 0xfa, 0xce],
        [0xce, 0xfa, 0xed, 0xfe],
        [0xfe, 0xed, 0xfa, 0xcf],
        [0xcf, 0xfa, 0xed, 0xfe],
        [0xca, 0xfe, 0xba, 0xbe],
        [0xbe, 0xba, 0xfe, 0xca],
        [0xca, 0xfe, 0xba, 0xbf],
        [0xbf, 0xba, 0xfe, 0xca],
    ]
    .contains(&signature)
    {
        Ok("macos")
    } else {
        invalid("Unrecognized executable signature; scripts and archive payloads are not launch registrations")
    }
}

pub fn inspect_registration(registration: &RuntimeRegistration) -> Result<RuntimeInstallation> {
    let (root, mut executable, data_root) = registration_roots(registration)?;
    let binary_platform = executable_format(&executable)?;
    let mut diagnostics = vec![
        "Runtime kind and supplied version are user declarations, not executable identity attestation.".into(),
        "Read-only file/header/hash inspection performed; no executable or version probe was run.".into(),
    ];
    let mut executable_sha256=maps::hash_file(&executable)?;
    if registration.runtime_id==RuntimeId::ChupathingyCe && executable_sha256=="e5ce1ebb95865492ed06255100d0c677852d30202f06fd506fdc243a0a7b57df" {
        let engine=root.join("chupathingy.exe");crate::reject_links(&engine)?;
        let engine_hash=maps::hash_file(&engine)?;
        if engine_hash!="fa9997520ebb2d8406fbe31db7146e1354b75569da1172c6dbf7717b9ee2b86b" {
            return invalid("Chupathingy's installed launcher changed its game binary; inspect the new build before using it");
        }
        executable=fs::canonicalize(engine)?;executable_sha256=engine_hash;
        diagnostics.push("Reviewed Chupathingy launcher resolved to its exact installed game executable; no launcher configuration was changed.".into());
    }
    if let Some(review)=&registration.reviewed_companion {
        if registration.runtime_id!=RuntimeId::OpenCe{return invalid("A Forerunner review cannot authorize a different runtime family");}
        review.validate(&executable_sha256)?;
        if companion_dependency_sha256(&executable,&review.capabilities)?!=review.dependency_sha256{return invalid("Reviewed Forerunner SDL3.dll changed; inspect and review the exact package again");}
        diagnostics.push("Explicit local Forerunner contract review retained with exact executable and SDL3 hashes. It is not an upstream signature or gameplay acceptance.".into());
    }
    if registration.runtime_id == RuntimeId::OpenCe && forerunner_registration_machine(registration,&executable_sha256)?.is_some() {
        diagnostics.push("Reviewed Forerunner identity: shared content uses separate Spark-managed settings, saves, logs and caches. Play opens menus; authored solo staging needs validated CE609 content and its own reviewed action. Automatic map revision readback and Live Rebuild remain unavailable; gameplay acceptance is separate.".into());
    }
    if binary_platform != platform() {
        diagnostics.push(format!(
            "Executable format targets {binary_platform}; this host is {}. Launch is blocked.",
            platform()
        ));
    }
    if registration.version.is_none() {
        diagnostics.push(
            "Installed build version is unknown; friends compatibility remains blocked.".into(),
        );
    }
    if registration.runtime_id.is_native() && registration.network_version.is_none() {
        diagnostics.push("Native network protocol version is unknown.".into());
    }
    diagnostics.push("Data root is explicit or installation-root default; config.toml overrides are not automatically interpreted.".into());
    let arena=registration.runtime_id==RuntimeId::ArenaEvolved;
    if arena {diagnostics.push("Arena Evolved 0.7.7-beta is a separate AGPL-3.0-or-later engine. Its publisher package is reviewed, but this executable has not been independently verified; launch/shared-root control remains blocked. MCC input support does not imply OpenCE or unmodified MCC network compatibility.".into());}
    Ok(RuntimeInstallation {
        registration_id: registration.id.clone(),
        root,
        executable: Some(executable.clone()),
        data_root,
        executable_sha256: Some(executable_sha256),
        version: registration.version.clone(),
        network_version: registration.network_version.clone(),
        identity: "userDeclared".into(),
        validation: if arena { TestStatus::Blocked } else if binary_platform == platform() {
            TestStatus::Pass
        } else {
            TestStatus::Blocked
        },
        diagnostics,
    })
}

pub fn map_directories(id: RuntimeId) -> &'static [(&'static str, &'static str)] {
    match id {
        RuntimeId::MccSteam => &[("halo1/maps", "mccHalo1")],
        RuntimeId::ChupathingyCe => &[
            ("maps", "xbox"),
            ("maps_ce", "customEdition"),
            ("maps_md", "haloMd"),
            ("maps_pc", "pcRetail"),
            ("maps/ce", "customEdition"),
            ("md_maps", "haloMd"),
            ("custom_maps", "customEdition"),
        ],
        RuntimeId::ArenaEvolved => &[("maps", "xbox"), ("maps_ce", "customEdition"), ("custom_maps", "customEdition"), ("maps/ce", "customEdition")],
        RuntimeId::OpenCe => &[("maps", "xbox"), ("custom_maps", "customEdition"), ("maps_ce", "customEdition")],
        RuntimeId::HaloPc => &[("maps", "pcRetail")],
        RuntimeId::HaloCustomEdition => &[("maps", "customEdition")],
        _ => &[],
    }
}
pub fn inventory_maps(registration: &RuntimeRegistration) -> Result<RuntimeInventory> {
    let (_, _, data_root) = registration_roots(registration)?;
    inventory_at(registration.runtime_id, &registration.id, &data_root)
}
pub fn inventory_mcc(steam: &steam::Installation) -> Result<RuntimeInventory> {
    let root = steam
        .mcc_path
        .as_ref()
        .ok_or_else(|| crate::SparkError::Invalid("MCC installation is unavailable".into()))?;
    let root = checked_directory(root)?;
    inventory_at(RuntimeId::MccSteam, "steam-976730", &root)
}
fn inventory_at(
    id: RuntimeId,
    registration_id: &str,
    data_root: &Path,
) -> Result<RuntimeInventory> {
    let mut result = RuntimeInventory {
        runtime_id: id,
        registration_id: registration_id.into(),
        maps: vec![],
        resources: vec![],
        diagnostics: vec![],
    };
    let mut seen = 0usize;
    for (folder, _declared_family) in map_directories(id) {
        let directory = data_root.join(folder);
        if !directory.is_dir() {
            continue;
        }
        crate::reject_links(&directory)?;
        for entry in fs::read_dir(&directory)? {
            seen += 1;
            if seen > MAX_INVENTORY_ENTRIES {
                return invalid("Runtime map inventory exceeds 4096 entries");
            }
            let entry = entry?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                continue;
            }
            crate::reject_links(&path)?;
            if !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("map"))
            {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            let relative = path
                .strip_prefix(data_root)
                .map_err(|_| {
                    crate::SparkError::Invalid("Inventory path escaped its data root".into())
                })?
                .to_string_lossy()
                .replace('\\', "/");
            if ["bitmaps.map", "sounds.map", "loc.map"].contains(&name.as_str()) {
                let hash = if metadata.len() <= MAX_EXECUTABLE_BYTES {
                    Some(maps::hash_file(&path)?)
                } else {
                    result
                        .diagnostics
                        .push(format!("Resource {relative} exceeds the 2 GiB hash limit"));
                    None
                };
                result.resources.push(RuntimeResourceEntry {
                    relative_path: relative,
                    name,
                    sha256: hash,
                    size: Some(metadata.len()),
                });
                continue;
            }
            let mut item = RuntimeMapEntry {
                relative_path: relative,
                family: "unknown".into(),
                cache_version: None,
                sha256: None,
                scenario_type: None,
                file_size: metadata.len(),
                valid: false,
                detail: String::new(),
            };
            if !(2048..=maps::MAX_CACHE_BYTES).contains(&metadata.len()) {
                item.detail = "Map size is outside supported inspection limits".into();
            } else {
                let mut bytes = [0u8; 2048];
                fs::File::open(&path)?.read_exact(&mut bytes)?;
                item.sha256 = Some(maps::hash_file(&path)?);
                match maps::parse_header(&bytes, metadata.len()) {
                    Ok(header) => {
                        item.cache_version = Some(header.version);
                        item.scenario_type = Some(header.scenario_type);
                        item.family = match header.version {
                            5 => "xbox",
                            6 => "demoTrial",
                            7 => "pcMacHaloMd",
                            609 => "customEdition",
                            13 => "mccHalo1",
                            _ => "unknown",
                        }
                        .into();
                        item.valid = true;
                        item.detail = "Header and hash inspected only; tag/resource completeness and gameplay are not verified.".into();
                    }
                    Err(e) => item.detail = e.to_string(),
                }
            }
            result.maps.push(item);
        }
    }
    result
        .maps
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    result
        .resources
        .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    result.diagnostics.push("Inventory is read-only. Resource names/hashes do not establish resource completeness or authorize deployment.".into());
    Ok(result)
}

/// Keep alternate engines of one family. The first is active; source identities stay unchanged.
pub fn remember_registration(registrations: &mut Vec<RuntimeRegistration>, registration: RuntimeRegistration) -> Result<()> {
    if registrations.len() > 24 { return invalid("Runtime profile limit exceeded"); }
    let installed = inspect_registration(&registration)?;
    if registrations.iter().any(|old|old.id==registration.id&&old.runtime_id!=registration.runtime_id){
        return invalid("A saved profile cannot be changed into another runtime family; create a new profile");
    }
    let same = |old: &RuntimeRegistration| old.id == registration.id ||
        (old.runtime_id == registration.runtime_id && fs::canonicalize(&old.executable).ok().as_ref() == installed.executable.as_ref());
    if registrations.len() == 24 && !registrations.iter().any(same) {
        return invalid("Keep at most 24 runtime profiles; update an existing profile");
    }
    registrations.retain(|old| !same(old));
    let mut registration=registration;
    registration.executable=installed.executable.ok_or_else(||crate::SparkError::Invalid("Missing runtime executable".into()))?;
    registration.root=installed.root;
    if registration.data_root.is_some(){registration.data_root=Some(installed.data_root);}
    registrations.insert(0, registration);
    Ok(())
}
pub fn activate_registration(registrations: &mut Vec<RuntimeRegistration>, id: &str) -> Result<()> {
    if registrations.len() > 24 { return invalid("Runtime profile limit exceeded"); }
    let selected = registrations.iter().find(|item| item.id == id).cloned()
        .ok_or_else(|| crate::SparkError::Invalid("Runtime profile is no longer registered".into()))?;
    remember_registration(registrations, selected)
}

/// Forerunner TEST_EVIDENCE.md, firefight-build-002, source 21a809b0.
/// This pins reviewed path settings, not acceptance of Spark's launch adapter.
pub const FORERUNNER_WINDOWS_X86_SHA256: &str =
    "fb8d204f21e57a4db6ed44f078338a02023c49a3998b6a437e1f4d1d8f8fa4b7";

/// Owner-approved help/discovery,15Nov: buildf9b6d8dc, Windows/x64,
/// contract1, runtime.discover only, network45/native44, CE609 solo startup.
/// This admits the documented path interface, not game/mission acceptance.
pub const FORERUNNER_WINDOWS_X64_SHA256:&str="ebe2064750c43173b3126c18b44e3215e833a3cc304b6259743a5ad5af09ef65";
/// Previously reviewed build25767db9 remains usable as its own exact identity.
pub const FORERUNNER_WINDOWS_X64_PREVIOUS_SHA256:&str="9543508eced47d7237d69310915f4f78344b248b83686c7e2cafe82ba9e6b17b";
/// Owner-approved help/discovery,16Nov: build66092de9, Windows/x64,
/// contract1, runtime.discover only; native CE609 solo startup request declared.
/// This is interface admission, not accepted loaded-map or gameplay behavior.
pub const FORERUNNER_WINDOWS_X64_STARTUP_SHA256:&str="9954b4c0ca2fa657f2ba05a168fbf70ea4229388c14376e7e1018b8cce9994f0";
/// Owner-authorized read-only help/discovery,16Nov: builda6f7b06b, Windows/x64,
/// contract1, runtime.discover and extraction.squad_objectives.v1 declared.
/// Native startup/feature admission is separate from Spark map/game acceptance.
pub const FORERUNNER_WINDOWS_X64_SQUAD_PREVIOUS_SHA256:&str="351cb4dccc6c9d12315068e6e200ee69f1249c970d50fc177bcf204898a4b74d";
/// A second owner-built a6f7b06b binary independently passed the same bounded
/// help/discovery check. Both exact identities remain admitted; no wildcard.
pub const FORERUNNER_WINDOWS_X64_SQUAD_SECONDARY_SHA256:&str="30a989a048022bf08c32e2fb683f65395c9285f92df8d8eef3f369700fbb7169";
/// Owner-authorized17Nov help/discovery: build978169e0, Windows/x64,
/// contract1/runtime.discover, CE609 solo startup and three declared squad
/// features. Exact interface admission only; no mission/gameplay acceptance.
pub const FORERUNNER_WINDOWS_X64_SQUAD_MESSAGES_SHA256:&str="2f94e8631f7a6c5278a0f36eaa219cc9b7b89562c346827a231348e67a5682df";
/// Independently checked later owner build3446ed13; the earlier frozen snapshot
/// remains admitted. Neither identity grants live writes or game acceptance.
pub const FORERUNNER_WINDOWS_X64_CURRENT_SHA256:&str="b68e4710e2a258f42ae69fa183aaa05aeaf0d637d36033b30b0503847bb579d2";
pub fn forerunner_windows_machine(sha256:&str)->Option<u16>{match sha256{FORERUNNER_WINDOWS_X86_SHA256=>Some(0x014c),FORERUNNER_WINDOWS_X64_CURRENT_SHA256|FORERUNNER_WINDOWS_X64_SQUAD_MESSAGES_SHA256|FORERUNNER_WINDOWS_X64_SQUAD_SECONDARY_SHA256|FORERUNNER_WINDOWS_X64_SQUAD_PREVIOUS_SHA256|FORERUNNER_WINDOWS_X64_STARTUP_SHA256|FORERUNNER_WINDOWS_X64_SHA256|FORERUNNER_WINDOWS_X64_PREVIOUS_SHA256=>Some(0x8664),_=>None}}

/// Persisted creator review and built-in release pins use the same guarded profile.
pub fn forerunner_registration_machine(registration:&RuntimeRegistration,sha256:&str)->Result<Option<u16>>{
 if registration.runtime_id!=RuntimeId::OpenCe {if registration.reviewed_companion.is_some(){return invalid("Forerunner review belongs only to its OpenCE-family profile");}return Ok(None);}
 match &registration.reviewed_companion {Some(review)=>Ok(Some(review.validate(sha256)?)),None=>Ok(forerunner_windows_machine(sha256))}
}
pub fn registration_content_interface(registration:&RuntimeRegistration,sha256:&str)->Result<Option<&'static str>>{
 if forerunner_registration_machine(registration,sha256)?.is_some(){return Ok(Some("forerunner"));}Ok(shared_content_interface(registration.runtime_id,sha256))
}
pub fn forerunner_registration_startup_selector(registration:&RuntimeRegistration,sha256:&str,map:&str)->Result<Option<String>>{
 if !crate::ce_host::map_selector(map){return invalid("Forerunner startup needs a native map basename, not a path or family override");}
 if forerunner_registration_machine(registration,sha256)?.is_none(){return invalid("Forerunner startup needs a reviewed executable identity");}
 match &registration.reviewed_companion{Some(review)=>Ok(review.capabilities.startup_map.is_some().then(||format!("{map}@ce"))),None=>forerunner_solo_startup_selector(sha256,map)}
}

/// Only these exact reviewed binaries declare the admitted CE startup interface.
/// The caller must still validate/stage the exact native solo cache and resources.
/// A requested selector is never a loaded-map acknowledgement or live RPC.
pub fn forerunner_solo_startup_selector(sha256:&str,map:&str)->Result<Option<String>>{
    if forerunner_windows_machine(sha256).is_none(){return invalid("Forerunner startup needs a reviewed executable identity");}
    if !crate::ce_host::map_selector(map){return invalid("Forerunner startup needs a native map basename, not a path or family override");}
    Ok(matches!(sha256,FORERUNNER_WINDOWS_X64_CURRENT_SHA256|FORERUNNER_WINDOWS_X64_SQUAD_MESSAGES_SHA256|FORERUNNER_WINDOWS_X64_SQUAD_SECONDARY_SHA256|FORERUNNER_WINDOWS_X64_SQUAD_PREVIOUS_SHA256|FORERUNNER_WINDOWS_X64_STARTUP_SHA256).then(||format!("{map}@ce")))
}

/// Reviewed path interfaces only. A declared version or a similarly named executable is insufficient.
/// Local Faber234/Chupathingy identities are owner-installed, not publisher attestations.
pub fn shared_content_interface(id: RuntimeId, executable_sha256: &str) -> Option<&'static str> {
    match (id, executable_sha256) {
        (RuntimeId::OpenCe, sha) if forerunner_windows_machine(sha).is_some() => Some("forerunner"),
        (RuntimeId::OpenCe, "788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0" |
            "cd249f7ffd94c21b7f8bec1efc3e734753c48cf45d56d16f21a4ef53bcf07dd9" |
            "5c7368529b3ab0856f3987b1a03c62aa34c18e63ab833d35e385c8b61e2597e3" |
            "b9b69d43a6757961152cec070bfa3d59d96209d16f8018befd74c9896209b1ea" | "7aab23553625099ed156faa627d31c7bbc342e4b5d252a348f0d0ddf464ddb46") => Some("openCe"),
        (RuntimeId::ChupathingyCe, "b2f8ea992ed4031461bc638f8af80c08ec8905c5f73c97c483e86f25273b18d4" |
            "fa9997520ebb2d8406fbe31db7146e1354b75569da1172c6dbf7717b9ee2b86b") => Some("chupathingy"),
        _ => None,
    }
}

pub fn prepare_launch(registration: &RuntimeRegistration) -> Result<LaunchPlan> {
    let installed = inspect_registration(registration)?;
    if registration.runtime_id == RuntimeId::ArenaEvolved {
        return invalid("Arena Evolved launch is pending executable identity verification against its reviewed release. A filename or supplied version is not proof. Source inspection and the runtime setup guide remain available; no game was started.");
    }
    if installed.validation != TestStatus::Pass {
        return invalid("Executable format is not supported on this host");
    }
    if matches!(
        registration.runtime_id,
        RuntimeId::HaloPc | RuntimeId::HaloCustomEdition
    ) && platform() != "windows"
    {
        return invalid("Legacy PC executable launch is implemented only on Windows");
    }
    if registration.runtime_id == RuntimeId::OpenCe && platform() == "macos" {
        return invalid("OpenCE macOS launch support is not established for this adapter");
    }
    let executable = installed
        .executable
        .ok_or_else(|| crate::SparkError::Invalid("No executable".into()))?;
    let cwd = executable
        .parent()
        .ok_or_else(|| crate::SparkError::Invalid("No executable parent".into()))?
        .to_path_buf();
    let shared = installed.data_root != installed.root;
    let executable_sha256 = installed.executable_sha256
        .ok_or_else(|| crate::SparkError::Invalid("Missing inspected executable identity".into()))?;
    let interface = registration_content_interface(registration, &executable_sha256)?;
    if shared && interface.is_none() {
        return invalid("This exact engine has no verified shared-folder interface. For modern Chupathingy select chupathingy.exe, not its small launcher. Stock Custom Edition and MCC keep their own native map layouts.");
    }
    let mut environment = std::collections::BTreeMap::new();
    if shared {
        let ui = installed.data_root.join("maps/ui.map");
        crate::reject_links(&ui)?;
        if maps::inspect_header(&ui)?.version != 5 {
            return invalid("A community shared folder needs original Xbox maps/ui.map in maps; keep Custom Edition maps and banks in maps_ce");
        }
        environment.insert("HALO_DATA_ROOT".into(), process_path(&installed.data_root)?);
    }
    if interface.is_some() {
        if registration.data_root.is_some() || interface == Some("forerunner") {
            environment.insert("HALO_DATA_ROOT".into(),process_path(&installed.data_root)?);
        }
        let ce = installed.data_root.join("maps_ce");
        crate::reject_links(&ce)?;
        if matches!(interface, Some("openCe" | "forerunner")) {
            let custom=if ce.is_dir(){process_path(&fs::canonicalize(&ce)?)?}else{process_path(&installed.data_root)?.join("custom_maps")};
            crate::reject_links(&custom)?;
            environment.insert("HALO_CUSTOM_MAPS_ROOT".into(),custom);
        }
    }
    let mut warnings = vec!["This plan starts only the explicitly registered user-installed runtime. It does not deploy or select a map, verify gameplay, or attach a bridge.".into(),
        "Runtime startup/hosting may have its own migration, asset-sharing and telemetry behavior; review its settings.".into(),
        "For supported OpenCE shared layouts, maps_ce supplies CE content; older custom_maps content stays preserved in its original folder. Engine-generated pack caches may still use the data folder.".into()];
    if interface == Some("forerunner") {
        warnings.push("This exact Forerunner profile uses separate Spark-managed settings, saves, logs and caches. Inherited HALO overrides, automatic map downloads, old-map migration and update checks are disabled for this launch. Its menu remains the map-selection route; automatic authored-cache deployment, Live Rebuild and live editing are not enabled. Spark adapter launch acceptance is pending.".into());
    }
    Ok(LaunchPlan { runtime_id: registration.runtime_id, executable, executable_sha256, profile_interface: interface.map(str::to_owned), cwd, args: vec![], direct_map_launch: false, environment, warnings })
}

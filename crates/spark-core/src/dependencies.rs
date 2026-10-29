//! Dependency guidance from native observations. A detected file/header is not
//! execution, complete content, cross-runtime compatibility or gameplay proof.
use crate::runtime::RuntimeId;
use serde::Serialize;

pub const H1A_INSTALL_URI: &str = "steam://install/1532190";
pub const H1A_GUIDE: &str =
    "https://learn.microsoft.com/en-us/halo-master-chief-collection/general/overview-tools";
pub const INVADER_RELEASES: &str = "https://github.com/SnowyMouse/invader/releases";
pub const WEBVIEW2_GUIDE: &str = "https://developer.microsoft.com/en-us/microsoft-edge/webview2/";
pub const CLASSIC_RESOURCES_GUIDE: &str = "https://c20.reclaimers.net/h1/maps/";
pub const ANIMATION_GUIDE: &str = "https://c20.reclaimers.net/h1/tags/model_animations/";
pub const COMMUNITY_CONTENT_GUIDE:&str="https://github.com/ChupathingyCE/chupathingyce/blob/c5a07c69589ab8d40180fc99eac993bc06b06ebb/README.md";

#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencyState {
    Ready,
    SetupRequired,
    #[default]
    Unverified,
    NotApplicable,
    Blocked,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyProbe {
    pub state: DependencyState,
    pub detail: String,
    pub path: Option<String>,
    pub sha256: Option<String>,
    pub architecture: Option<String>,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencyActionKind {
    InstallH1aViaSteam,
    OpenOfficialPage,
    ChooseSetting,
    ChooseResources,
    ChooseAssets,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyAction {
    pub id: String,
    pub kind: DependencyActionKind,
    pub label: String,
    pub target: Option<String>,
    pub requires_review: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyItem {
    pub id: String,
    pub label: String,
    pub state: DependencyState,
    pub detail: String,
    pub path: Option<String>,
    pub sha256: Option<String>,
    pub architecture: Option<String>,
    pub actions: Vec<DependencyAction>,
}
/// Constructed by native filesystem/settings/Steam inspection, not frontend flags.
#[derive(Clone, Debug)]
pub struct DependencyObservation {
    pub runtime_id: RuntimeId,
    pub platform: String,
    pub project_id: Option<String>,
    pub steam: DependencyProbe,
    pub game: DependencyProbe,
    pub h1a: DependencyProbe,
    pub invader: DependencyProbe,
    pub resources: DependencyProbe,
    pub editable_tags: DependencyProbe,
    pub assets: DependencyProbe,
    pub webview2: DependencyProbe,
    pub community_content: DependencyProbe,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyReport {
    pub schema_version: u32,
    pub runtime_id: RuntimeId,
    pub platform: String,
    pub project_id: Option<String>,
    pub items: Vec<DependencyItem>,
    pub diagnostics: Vec<String>,
}

/// Fixed targets only. Native action preparation looks these up by ID; no
/// frontend URL, Steam app ID, command line or arbitrary executable is accepted.
pub fn action(id: &str) -> Option<DependencyAction> {
    let (kind, label, target, review) = match id {
        "h1a.install" => (
            DependencyActionKind::InstallH1aViaSteam,
            "Review H1A install in Steam",
            Some(H1A_INSTALL_URI),
            true,
        ),
        "h1a.guide" => (
            DependencyActionKind::OpenOfficialPage,
            "Official MCC tools guide",
            Some(H1A_GUIDE),
            true,
        ),
        "h1a.choose" => (
            DependencyActionKind::ChooseSetting,
            "Choose installed H1A kit",
            Some("hekDirectory"),
            false,
        ),
        "halo.choose" => (
            DependencyActionKind::ChooseSetting,
            "Choose installed Halo folder",
            Some("mccDirectory"),
            false,
        ),
        "steam.choose" => (
            DependencyActionKind::ChooseSetting,
            "Choose installed Steam folder",
            Some("steamDirectory"),
            false,
        ),
        "invader.releases" => (
            DependencyActionKind::OpenOfficialPage,
            "Official Invader releases",
            Some(INVADER_RELEASES),
            true,
        ),
        "invader.choose" => (
            DependencyActionKind::ChooseSetting,
            "Choose installed Invader folder",
            Some("invaderDirectory"),
            false,
        ),
        "resources.choose" => (
            DependencyActionKind::ChooseResources,
            "Choose this map's exact resources",
            None,
            false,
        ),
        "resources.guide" => (
            DependencyActionKind::OpenOfficialPage,
            "Source resource formats",
            Some(CLASSIC_RESOURCES_GUIDE),
            true,
        ),
        "tags.choose" => (
            DependencyActionKind::ChooseSetting,
            "Choose editable Halo tags",
            Some("hekTagsDirectory"),
            false,
        ),
        "tags.guide" => (
            DependencyActionKind::OpenOfficialPage,
            "Official source/tag setup",
            Some(H1A_GUIDE),
            true,
        ),
        "assets.choose" => (
            DependencyActionKind::ChooseAssets,
            "Open model / animation setup",
            None,
            false,
        ),
        "assets.guide" => (
            DependencyActionKind::OpenOfficialPage,
            "Halo animation requirements",
            Some(ANIMATION_GUIDE),
            true,
        ),
        "webview.guide" => (
            DependencyActionKind::OpenOfficialPage,
            "Official WebView2 setup",
            Some(WEBVIEW2_GUIDE),
            true,
        ),
        "community.guide" => (
            DependencyActionKind::OpenOfficialPage,
            "Matching community base assets",
            Some(COMMUNITY_CONTENT_GUIDE),
            true,
        ),
        _ => return None,
    };
    Some(DependencyAction {
        id: id.into(),
        kind,
        label: label.into(),
        target: target.map(str::to_owned),
        requires_review: review,
    })
}
fn item(id: &str, label: &str, probe: &DependencyProbe, ids: &[&str]) -> DependencyItem {
    DependencyItem {
        id: id.into(),
        label: label.into(),
        state: probe.state,
        detail: probe.detail.clone(),
        path: probe.path.clone(),
        sha256: probe.sha256.clone(),
        architecture: probe.architecture.clone(),
        actions: ids.iter().filter_map(|id| action(id)).collect(),
    }
}
pub fn report(observation: &DependencyObservation) -> DependencyReport {
    let mcc = observation.runtime_id == RuntimeId::MccSteam;
    let mut items = vec![item(
        "game",
        "Selected Halo installation",
        &observation.game,
        if mcc { &["halo.choose"][..] } else { &[][..] },
    )];
    if mcc {
        items.push(item(
            "steam",
            "Steam install route",
            &observation.steam,
            &["steam.choose"],
        ));
        let mut kit_actions = vec!["h1a.choose", "h1a.guide"];
        if observation.platform == "windows"
            && observation.steam.state == DependencyState::Ready
            && observation.h1a.state == DependencyState::SetupRequired
        {
            kit_actions.insert(0, "h1a.install");
        }
        items.push(item(
            "h1a",
            "Halo: CE Mod Tools - MCC",
            &observation.h1a,
            &kit_actions,
        ));
    }
    items.push(item(
        "invader",
        "Invader import / validation tools",
        &observation.invader,
        &["invader.choose", "invader.releases"],
    ));
    if observation.project_id.is_some() {
        items.push(item(
            "resources",
            "This map's source resources",
            &observation.resources,
            &["resources.choose", "resources.guide"],
        ));
        items.push(item(
            "tags",
            "Matching editable tags",
            &observation.editable_tags,
            &["tags.choose", "tags.guide"],
        ));
        if observation.assets.state != DependencyState::NotApplicable {
            items.push(item(
                "assets",
                "Models and compatible animations",
                &observation.assets,
                &["assets.choose", "assets.guide"],
            ));
        }
    }
    if matches!(
        observation.runtime_id,
        RuntimeId::ChupathingyCe | RuntimeId::OpenCe
    ) {
        items.push(item(
            "communityContent",
            "Community runtime base data",
            &observation.community_content,
            &["community.guide"],
        ));
    }
    if observation.platform == "windows" {
        items.push(item(
            "webview2",
            "Native window runtime",
            &observation.webview2,
            &["webview.guide"],
        ));
    }
    DependencyReport{schema_version:1,runtime_id:observation.runtime_id,platform:observation.platform.clone(),project_id:observation.project_id.clone(),items,diagnostics:vec!["Setup is checked on demand and remembered through existing settings. Nothing installs/downloads or reopens onboarding automatically.".into(),"Game, tool generation, tool CPU architecture, resources, source tags and animation compatibility are separate checks. H1A x86 tools do not have to match MCC's x64 game ABI.".into(),"Opening an official page is not downloading/verifying/executing an installer. Native builds and runtime operations still perform their own complete preflight.".into()]}
}

#[cfg(test)]
mod tests {
    use super::*;
    fn observed(runtime: RuntimeId) -> DependencyObservation {
        DependencyObservation {
            runtime_id: runtime,
            platform: "windows".into(),
            project_id: Some("project".into()),
            steam: DependencyProbe {
                state: DependencyState::Ready,
                ..Default::default()
            },
            game: DependencyProbe::default(),
            h1a: DependencyProbe {
                state: DependencyState::SetupRequired,
                ..Default::default()
            },
            invader: DependencyProbe::default(),
            resources: DependencyProbe::default(),
            editable_tags: DependencyProbe::default(),
            assets: DependencyProbe {
                state: DependencyState::NotApplicable,
                ..Default::default()
            },
            webview2: DependencyProbe::default(),
            community_content: DependencyProbe::default(),
        }
    }
    #[test]
    fn only_missing_mcc_kit_with_actual_steam_route_offers_fixed_install() {
        let mut o = observed(RuntimeId::MccSteam);
        let r = report(&o);
        assert!(r
            .items
            .iter()
            .flat_map(|i| &i.actions)
            .any(|a| a.id == "h1a.install" && a.target.as_deref() == Some(H1A_INSTALL_URI)));
        o.steam.state = DependencyState::Unverified;
        assert!(!report(&o)
            .items
            .iter()
            .flat_map(|i| &i.actions)
            .any(|a| a.id == "h1a.install"));
        o = observed(RuntimeId::MccSteam);
        o.h1a.state = DependencyState::Ready;
        assert!(!report(&o)
            .items
            .iter()
            .flat_map(|i| &i.actions)
            .any(|a| a.id == "h1a.install"));
    }
    #[test]
    fn community_and_nonwindows_do_not_inherit_mcc_install_support() {
        let o = observed(RuntimeId::OpenCe);
        let r = report(&o);
        assert!(!r.items.iter().any(|i| i.id == "h1a"));
        assert!(r.items.iter().any(|i| i.id == "communityContent"));
        let mut o = observed(RuntimeId::MccSteam);
        o.platform = "linux".into();
        assert!(!report(&o)
            .items
            .iter()
            .flat_map(|i| &i.actions)
            .any(|a| a.kind == DependencyActionKind::InstallH1aViaSteam));
    }
    #[test]
    fn unknown_actions_cannot_supply_urls_installers_or_command_lines() {
        for id in [
            "steam://install/1",
            "https://evil.invalid/file.exe",
            "invader.execute",
            "powershell",
            "../../tool.exe",
        ] {
            assert!(action(id).is_none());
        }
        let invader = action("invader.releases").unwrap();
        assert_eq!(invader.kind, DependencyActionKind::OpenOfficialPage);
        assert!(invader.requires_review);
        assert_eq!(invader.target.as_deref(), Some(INVADER_RELEASES));
    }
    #[test]
    fn source_resources_tags_and_assets_keep_independent_observed_states() {
        let mut o = observed(RuntimeId::MccSteam);
        o.resources.state = DependencyState::SetupRequired;
        o.editable_tags.state = DependencyState::Unverified;
        o.assets.state = DependencyState::Blocked;
        let r = report(&o);
        assert_eq!(
            r.items.iter().find(|i| i.id == "resources").unwrap().state,
            DependencyState::SetupRequired
        );
        assert_eq!(
            r.items.iter().find(|i| i.id == "tags").unwrap().state,
            DependencyState::Unverified
        );
        assert_eq!(
            r.items.iter().find(|i| i.id == "assets").unwrap().state,
            DependencyState::Blocked
        );
    }
}

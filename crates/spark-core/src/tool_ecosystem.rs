//! Application tool capabilities, never native Halo tag definitions.
//! One catalog is shared by the desktop backend and browser UI. Availability
//! is assessed against actual source independently from executable discovery.
use crate::{invalid, Result, SparkError};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, sync::OnceLock};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LegacyTarget {
    pub runtime: String,
    pub flavor: String,
    pub order: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Tool {
    pub id: String,
    pub label: String,
    pub group: String,
    pub mode: String,
    pub purpose: String,
    pub modifies_files: bool,
    pub caveat: String,
    pub filename: Option<String>,
    pub location: String,
    pub maintainer: String,
    pub source_url: String,
    pub license: String,
    pub platforms: Vec<String>,
    pub families: Vec<String>,
    pub runtimes: Vec<String>,
    pub inputs: Vec<String>,
    pub integration: String,
    pub handler: String,
    pub legacy: Vec<LegacyTarget>,
    pub version: Option<String>,
    pub sha256: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub schema_version: u32,
    pub reviewed_at: String,
    pub tools: Vec<Tool>,
}
pub fn validate(catalog: &Catalog) -> Result<()> {
    if catalog.schema_version != 1 || catalog.tools.len() > 64 {
        return invalid("Unsupported tool catalog version or size");
    }
    let mut ids = BTreeSet::new();
    for tool in &catalog.tools {
        if tool.id.is_empty()
            || !tool.id.bytes().all(|b| b.is_ascii_alphanumeric())
            || !ids.insert(&tool.id)
        {
            return invalid("Duplicate or invalid tool identity");
        }
        if !tool.source_url.starts_with("https://")
            || tool.license.is_empty()
            || tool.maintainer.is_empty()
        {
            return invalid("A tool needs official provenance and licensing context");
        }
        if !["official", "invader", "community"].contains(&tool.group.as_str())
            || !["externalGui", "integratedCli", "sourceHandoff"].contains(&tool.mode.as_str())
            || ![
                "managedHandoff",
                "sourceHandoff",
                "managedWorkflow",
                "upstreamOnly",
            ]
            .contains(&tool.integration.as_str())
        {
            return invalid("Unknown tool capability category");
        }
        if !["hek", "invader", "baboon", "external"].contains(&tool.location.as_str()) {
            return invalid("Unknown tool installation location");
        }
        if let Some(name) = &tool.filename {
            if name.contains(['/', '\\', ':']) || !name.ends_with(".exe") {
                return invalid("A catalog executable must be one exact filename");
            }
        }
        if tool
            .sha256
            .as_ref()
            .is_some_and(|h| h.len() != 64 || !h.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return invalid("Invalid reviewed executable identity");
        }
        if tool.integration == "upstreamOnly"
            && (!tool.legacy.is_empty() || tool.handler != "research" || tool.filename.is_some())
        {
            return invalid("Research profiles cannot grant execution");
        }
        if tool.inputs.iter().any(|v| {
            ![
                "none",
                "classicCache",
                "mccCache",
                "xboxCache",
                "nativeH1",
                "forgeSource",
                "sourceGeometry",
                "other",
            ]
            .contains(&v.as_str())
        }) {
            return invalid("Unknown tool input format");
        }
    }
    Ok(())
}
pub fn catalog() -> Result<&'static Catalog> {
    static VALUE: OnceLock<std::result::Result<Catalog, String>> = OnceLock::new();
    VALUE
        .get_or_init(|| {
            let c: Catalog = serde_json::from_str(include_str!("../data/tool_ecosystem.json"))
                .map_err(|e| e.to_string())?;
            validate(&c).map_err(|e| e.to_string())?;
            Ok(c)
        })
        .as_ref()
        .map_err(|s| SparkError::Invalid(s.clone()))
}
pub fn tool(id: &str) -> Result<&'static Tool> {
    catalog()?
        .tools
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| SparkError::Invalid("Unknown tool identity".into()))
}
pub fn legacy_tools(runtime: &str, flavor: Option<&str>) -> Result<Vec<&'static Tool>> {
    let mut rows: Vec<_> = catalog()?
        .tools
        .iter()
        .filter_map(|t| {
            t.legacy
                .iter()
                .find(|l| l.runtime == runtime && Some(l.flavor.as_str()) == flavor)
                .map(|l| (l.order, t))
        })
        .collect();
    rows.sort_by_key(|(order, _)| *order);
    Ok(rows.into_iter().map(|(_, t)| t).collect())
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub runtime_id: String,
    pub family: String,
    pub host: String,
    pub flavor: Option<String>,
    pub source_kind: String,
    pub owned_native_tags: bool,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub found: bool,
    pub sha256: Option<String>,
    pub version: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Assessment {
    pub state: String,
    pub executable_found: bool,
    pub compatible_source: bool,
    pub executable_verified: bool,
    pub can_use_workflow: bool,
    pub detail: String,
}
pub fn assess(tool: &Tool, context: &Context, installed: &Installation) -> Assessment {
    let verified = installed.found
        && tool
            .sha256
            .as_ref()
            .is_none_or(|h| installed.sha256.as_ref() == Some(h));
    let compatible = tool
        .inputs
        .iter()
        .any(|s| s == &context.source_kind || (s == "nativeH1" && context.owned_native_tags));
    let (state, detail) = if !tool.families.contains(&context.family) {
        (
            "requiresRuntime",
            "This tool targets another Halo family; it is not recommended for this map.",
        )
    } else if tool.integration == "upstreamOnly" {
        ("researchOnly","Upstream capability only. A source-aware Spark handoff has not been verified; no executable or download is offered.")
    } else if !tool.platforms.contains(&context.host)
        || !tool.runtimes.contains(&context.runtime_id)
    {
        (
            "requiresRuntime",
            "Choose a compatible workstation/runtime before using this tool.",
        )
    } else if tool.group == "official"
        && !tool
            .legacy
            .iter()
            .any(|l| l.runtime == context.runtime_id && Some(&l.flavor) == context.flavor.as_ref())
    {
        (
            "requiresRuntime",
            "The configured editing-kit generation does not match the selected Halo.",
        )
    } else if !compatible {
        ("sourceUnsupported","This operation needs compatible source. A compiled map is not a loose tag; extract/build verified working source first.")
    } else if !installed.found {
        (
            "availableForSetup",
            "Select the matching installed tool folder in Dependencies & setup.",
        )
    } else if !verified {
        ("unverifiedVersion","This executable differs from the reviewed build. Managed execution is unavailable until its version is reviewed.")
    } else {
        ("installed","Found for this source/runtime combination. The managed workflow rechecks its inputs before executing; this is not gameplay certification.")
    };
    Assessment {
        state: state.into(),
        executable_found: installed.found,
        compatible_source: compatible,
        executable_verified: verified,
        can_use_workflow: state == "installed",
        detail: detail.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn context() -> Context {
        Context {
            runtime_id: "mccSteam".into(),
            family: "halo1".into(),
            host: "windows".into(),
            flavor: Some("h1aEk".into()),
            source_kind: "mccCache".into(),
            owned_native_tags: false,
        }
    }
    #[test]
    fn installed_baboon_never_makes_a_cache_editable() {
        let t = tool("baboon").unwrap();
        let installed = Installation {
            found: true,
            ..Default::default()
        };
        let mut c = context();
        assert_eq!(assess(t, &c, &installed).state, "sourceUnsupported");
        c.owned_native_tags = true;
        assert!(assess(t, &c, &installed).can_use_workflow);
        c.runtime_id = "macDemo".into();
        assert!(!assess(t, &c, &installed).can_use_workflow);
    }
    #[test]
    fn reviewed_cli_and_upstream_profiles_cannot_be_promoted_by_installation() {
        let t = tool("invaderDependency").unwrap();
        let mut c = context();
        c.owned_native_tags = true;
        let mut i = Installation {
            found: true,
            ..Default::default()
        };
        assert_eq!(assess(t, &c, &i).state, "unverifiedVersion");
        i.sha256 = t.sha256.clone();
        assert!(assess(t, &c, &i).can_use_workflow);
        assert_eq!(
            assess(tool("refinery").unwrap(), &c, &i).state,
            "researchOnly"
        );
        assert_eq!(
            assess(tool("foundry").unwrap(), &c, &i).state,
            "researchOnly"
        );
        c.family = "haloInfinite".into();
        assert_eq!(
            assess(tool("foundry").unwrap(), &c, &i).state,
            "requiresRuntime"
        );
    }
    #[test]
    fn catalog_refuses_duplicate_ids_and_executable_research() {
        let mut c = catalog().unwrap().clone();
        c.tools.push(c.tools[0].clone());
        assert!(validate(&c).is_err());
        let mut c = catalog().unwrap().clone();
        let t = c.tools.iter_mut().find(|t| t.id == "refinery").unwrap();
        t.filename = Some("Refinery.exe".into());
        assert!(validate(&c).is_err());
    }
    #[test]
    fn legacy_api_and_frontend_use_the_same_order_and_edition_boundary() {
        let ids = |r, f| {
            legacy_tools(r, f)
                .unwrap()
                .iter()
                .map(|t| t.id.as_str())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            ids("mccSteam", Some("h1aEk")),
            vec!["sapien", "guerilla", "baboon", "tagTest", "haloTool"]
        );
        assert!(ids("mccSteam", Some("legacyHek")).is_empty());
        assert!(!ids("macDemo", Some("legacyHek")).iter().any(|_| true));
    }
}

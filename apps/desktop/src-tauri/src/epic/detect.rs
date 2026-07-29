use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicInstalledGame {
    pub launcher: &'static str,
    pub external_id: String,
    pub name: String,
    pub installed: bool,
    pub owned: bool,
    pub launchable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicScanResult {
    pub epic_found: bool,
    pub manifest_count: usize,
    pub games: Vec<EpicInstalledGame>,
    pub warnings: Vec<String>,
}

pub fn scan_epic_installed() -> EpicScanResult {
    #[cfg(windows)]
    {
        scan_windows()
    }
    #[cfg(not(windows))]
    {
        EpicScanResult {
            epic_found: false,
            manifest_count: 0,
            games: vec![],
            warnings: vec![
                "Le scan Epic n’est disponible que sous Windows.".into(),
            ],
        }
    }
}

#[cfg(windows)]
fn scan_windows() -> EpicScanResult {
    let mut warnings = Vec::new();
    let program_data = std::env::var_os("PROGRAMDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    let manifests_dir = program_data
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");

    if !manifests_dir.is_dir() {
        return EpicScanResult {
            epic_found: false,
            manifest_count: 0,
            games: vec![],
            warnings: vec![
                "Epic Games Launcher introuvable (pas de dossier Manifests).".into(),
            ],
        };
    }

    let mut by_app: HashMap<String, EpicInstalledGame> = HashMap::new();
    let mut manifest_count = 0usize;

    let entries = match fs::read_dir(&manifests_dir) {
        Ok(e) => e,
        Err(err) => {
            return EpicScanResult {
                epic_found: true,
                manifest_count: 0,
                games: vec![],
                warnings: vec![format!("Lecture Manifests impossible : {err}")],
            };
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        manifest_count += 1;
        match parse_item_manifest(&path) {
            Ok(Some(game)) => {
                by_app
                    .entry(game.external_id.clone())
                    .or_insert(game);
            }
            Ok(None) => {}
            Err(err) => warnings.push(err),
        }
    }

    let mut games: Vec<_> = by_app.into_values().collect();
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    EpicScanResult {
        epic_found: true,
        manifest_count,
        games,
        warnings,
    }
}

#[cfg(windows)]
fn parse_item_manifest(path: &Path) -> Result<Option<EpicInstalledGame>, String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct ItemManifest {
        app_name: Option<String>,
        display_name: Option<String>,
        #[serde(rename = "bIsIncompleteInstall")]
        b_is_incomplete_install: Option<bool>,
        app_categories: Option<Vec<String>>,
        compatible_apps: Option<Vec<String>>,
        technical_type: Option<String>,
    }

    let raw = fs::read_to_string(path).map_err(|_| {
        format!("Manifest illisible : {}", path.display())
    })?;
    if raw.trim().is_empty() {
        return Ok(None);
    }

    let item: ItemManifest = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "Manifest Epic invalide ({}): {e}",
            path.file_name().and_then(|n| n.to_str()).unwrap_or("?")
        )
    })?;

    let app_name = match item.app_name {
        Some(name) if !name.is_empty() => name,
        _ => return Ok(None),
    };

    if app_name.starts_with("UE_") {
        return Ok(None);
    }

    if item.b_is_incomplete_install == Some(true) {
        return Ok(None);
    }

    let cats = item.app_categories.unwrap_or_default();
    let cats_l: Vec<String> = cats.iter().map(|c| c.to_lowercase()).collect();

    // DLC non lançable
    if cats_l.iter().any(|c| c == "addons")
        && !cats_l.iter().any(|c| c == "addons/launchable")
    {
        return Ok(None);
    }

    // Plugins / moteur UE
    if cats_l
        .iter()
        .any(|c| c == "plugins" || c == "plugins/engine")
        || item
            .compatible_apps
            .as_ref()
            .map(|a| a.iter().any(|x| x.starts_with("UE_")))
            .unwrap_or(false)
        || item
            .technical_type
            .as_ref()
            .map(|t| t.to_lowercase().contains("plugins/engine"))
            .unwrap_or(false)
    {
        return Ok(None);
    }

    let name = item
        .display_name
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| app_name.clone());

    Ok(Some(EpicInstalledGame {
        launcher: "epic",
        external_id: app_name,
        name,
        installed: true,
        owned: true,
        launchable: true,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_game_manifest_json() {
        let raw = r#"{
            "FormatVersion": 0,
            "bIsIncompleteInstall": false,
            "AppName": "Fortnite",
            "DisplayName": "Fortnite",
            "AppCategories": ["public", "games", "applications"]
        }"#;
        let item: serde_json::Value = serde_json::from_str(raw).unwrap();
        assert_eq!(item["AppName"], "Fortnite");
    }
}

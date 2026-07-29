use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::parse::{
    parse_app_manifest, parse_library_folders, parse_most_recent_steam_id, SteamGameDraft,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamScanResult {
    pub steam_found: bool,
    /// Number of Steam libraries discovered (paths stay local, never returned).
    pub library_count: u32,
    /// SteamID64 of the most recent local login (for owned-games API enrich).
    pub steam_id: Option<String>,
    pub games: Vec<ScannedSteamGame>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedSteamGame {
    pub launcher: &'static str,
    pub external_id: String,
    pub name: String,
    pub installed: bool,
    pub owned: bool,
    pub launchable: bool,
}

pub fn scan_steam_libraries() -> SteamScanResult {
    let mut warnings = Vec::new();

    let Some(steam_root) = find_steam_root(&mut warnings) else {
        return SteamScanResult {
            steam_found: false,
            library_count: 0,
            steam_id: None,
            games: vec![],
            warnings,
        };
    };

    let steam_id = read_steam_id(&steam_root, &mut warnings);

    let library_paths = match resolve_library_paths(&steam_root, &mut warnings) {
        Ok(paths) => paths,
        Err(err) => {
            warnings.push(err);
            vec![steam_root.clone()]
        }
    };

    let mut games = Vec::new();
    for library in &library_paths {
        let steamapps = if library.ends_with("steamapps") {
            library.clone()
        } else {
            library.join("steamapps")
        };

        match collect_manifests(&steamapps) {
            Ok(found) => {
                for draft in found {
                    games.push(to_scanned(draft));
                }
            }
            Err(_) => warnings.push("Une bibliothèque Steam n’a pas pu être lue.".into()),
        }
    }

    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games.dedup_by(|a, b| a.external_id == b.external_id);

    SteamScanResult {
        steam_found: true,
        library_count: library_paths.len() as u32,
        steam_id,
        games,
        warnings,
    }
}

fn read_steam_id(steam_root: &Path, warnings: &mut Vec<String>) -> Option<String> {
    let path = steam_root.join("config").join("loginusers.vdf");
    match fs::read_to_string(&path) {
        Ok(content) => parse_most_recent_steam_id(&content).or_else(|| {
            warnings.push("Compte Steam local non déterminé (loginusers).".into());
            None
        }),
        Err(_) => {
            warnings.push("Impossible de lire le compte Steam local.".into());
            None
        }
    }
}

fn to_scanned(draft: SteamGameDraft) -> ScannedSteamGame {
    ScannedSteamGame {
        launcher: "steam",
        external_id: draft.app_id,
        name: draft.name,
        installed: draft.installed,
        owned: true,
        launchable: draft.launchable,
    }
}

fn resolve_library_paths(
    steam_root: &Path,
    warnings: &mut Vec<String>,
) -> Result<Vec<PathBuf>, String> {
    let candidates = [
        steam_root.join("steamapps").join("libraryfolders.vdf"),
        steam_root.join("config").join("libraryfolders.vdf"),
    ];

    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let content = fs::read_to_string(&candidate)
            .map_err(|_| "Impossible de lire libraryfolders.vdf".to_string())?;
        match parse_library_folders(&content) {
            Ok(paths) => {
                let mut out = Vec::new();
                let mut missing = 0u32;
                for path in paths {
                    let p = PathBuf::from(path);
                    if p.exists() {
                        out.push(p);
                    } else {
                        missing += 1;
                    }
                }
                if missing > 0 {
                    warnings.push(format!(
                        "{missing} emplacement(s) de bibliothèque introuvable(s)."
                    ));
                }
                if out.is_empty() {
                    out.push(steam_root.to_path_buf());
                }
                return Ok(out);
            }
            Err(err) => warnings.push(err),
        }
    }

    Ok(vec![steam_root.to_path_buf()])
}

fn collect_manifests(steamapps: &Path) -> Result<Vec<SteamGameDraft>, String> {
    if !steamapps.is_dir() {
        return Err("steamapps missing".into());
    }

    let mut games = Vec::new();
    let entries = fs::read_dir(steamapps).map_err(|_| "steamapps unreadable".to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(game) = parse_app_manifest(&content) {
                games.push(game);
            }
        }
    }

    Ok(games)
}

fn find_steam_root(warnings: &mut Vec<String>) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(path) = find_steam_root_windows() {
            return Some(path);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(path) = find_steam_root_linux() {
            return Some(path);
        }
        warnings.push(
            "Steam non trouvé sous Linux (le scan réel se valide sur Windows).".into(),
        );
        return None;
    }

    warnings.push("Installation Steam introuvable.".into());
    None
}

#[cfg(windows)]
fn find_steam_root_windows() -> Option<PathBuf> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(steam_key) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = steam_key.get_value::<String, _>("SteamPath") {
            let path = PathBuf::from(path.replace('/', "\\"));
            if path.is_dir() {
                return Some(path);
            }
        }
    }

    for path in [
        PathBuf::from(r"C:\Program Files (x86)\Steam"),
        PathBuf::from(r"C:\Program Files\Steam"),
    ] {
        if path.is_dir() {
            return Some(path);
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn find_steam_root_linux() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    for path in [
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        home.join(".var/app/com.valvesoftware.Steam/data/Steam"),
    ] {
        if path.is_dir() {
            return Some(path);
        }
    }
    None
}

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiotScanResult {
    pub riot_found: bool,
    pub games: Vec<RiotInstalledGame>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiotInstalledGame {
    pub launcher: &'static str,
    pub external_id: &'static str,
    pub name: &'static str,
    pub installed: bool,
    pub owned: bool,
    pub launchable: bool,
}

struct RiotProduct {
    external_id: &'static str,
    name: &'static str,
    metadata_file: &'static str,
    executable: &'static str,
    fallback_subpath: &'static str,
}

const PRODUCTS: &[RiotProduct] = &[
    RiotProduct {
        external_id: "league_of_legends",
        name: "League of Legends",
        metadata_file: "league_of_legends.live.product_settings.yaml",
        executable: "LeagueClient.exe",
        fallback_subpath: "League of Legends",
    },
    RiotProduct {
        external_id: "valorant",
        name: "VALORANT",
        metadata_file: "valorant.live.product_settings.yaml",
        executable: "VALORANT.exe",
        fallback_subpath: "VALORANT\\live",
    },
];

pub fn scan_riot_installed() -> RiotScanResult {
    #[cfg(windows)]
    {
        scan_windows()
    }
    #[cfg(not(windows))]
    {
        RiotScanResult {
            riot_found: false,
            games: vec![],
            warnings: vec!["Le scan Riot n’est disponible que sous Windows.".into()],
        }
    }
}

#[cfg(windows)]
fn scan_windows() -> RiotScanResult {
    let program_data = std::env::var_os("ProgramData").map(PathBuf::from);
    let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);
    let mut games = Vec::new();
    let mut riot_found = false;

    if let Some(program_data) = &program_data {
        let installs = program_data
            .join("Riot Games")
            .join("RiotClientInstalls.json");
        riot_found |= installs.is_file();
    }

    for product in PRODUCTS {
        let mut candidates = Vec::new();
        if let Some(program_data) = &program_data {
            let metadata = program_data
                .join("Riot Games")
                .join("Metadata")
                .join(format!("{}.live", product.external_id))
                .join(product.metadata_file);
            if let Ok(raw) = fs::read_to_string(metadata) {
                if let Some(path) = yaml_path_value(&raw, "product_install_full_path") {
                    candidates.push(path);
                }
                if let Some(path) = yaml_path_value(&raw, "product_install_root") {
                    candidates.push(path);
                }
            }
        }

        for base in [&program_files, &program_files_x86] {
            if let Some(base) = base {
                candidates.push(base.join("Riot Games"));
            }
        }
        candidates.push(PathBuf::from(r"C:\Riot Games"));

        let installed = candidates.iter().any(|candidate| {
            executable_candidates(candidate, product)
                .iter()
                .any(|path| path.is_file())
        });
        if installed {
            riot_found = true;
            games.push(RiotInstalledGame {
                launcher: "riot",
                external_id: product.external_id,
                name: product.name,
                installed: true,
                owned: true,
                launchable: true,
            });
        }
    }

    RiotScanResult {
        riot_found,
        games,
        warnings: if riot_found {
            vec![]
        } else {
            vec!["Riot Client ou jeu Riot introuvable.".into()]
        },
    }
}

#[cfg(windows)]
fn yaml_path_value(raw: &str, key: &str) -> Option<PathBuf> {
    raw.lines().find_map(|line| {
        let (found_key, value) = line.split_once(':')?;
        if found_key.trim() != key {
            return None;
        }
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if value.is_empty() {
            None
        } else {
            Some(PathBuf::from(value.replace('/', "\\")))
        }
    })
}

#[cfg(windows)]
fn executable_candidates(base: &Path, product: &RiotProduct) -> Vec<PathBuf> {
    let mut paths = vec![
        base.join(product.executable),
        base.join(product.fallback_subpath).join(product.executable),
    ];
    if product.external_id == "valorant" {
        paths.push(
            base.join("Riot Games")
                .join(product.fallback_subpath)
                .join(product.executable),
        );
    }
    paths
}

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XboxInstalledGame {
    pub launcher: &'static str,
    pub external_id: String,
    pub name: String,
    pub installed: bool,
    pub owned: bool,
    pub launchable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XboxScanResult {
    pub packages_found: bool,
    pub package_count: usize,
    pub games: Vec<XboxInstalledGame>,
    pub warnings: Vec<String>,
}

pub fn scan_xbox_installed() -> XboxScanResult {
    #[cfg(windows)]
    {
        scan_windows()
    }
    #[cfg(not(windows))]
    {
        XboxScanResult {
            packages_found: false,
            package_count: 0,
            games: vec![],
            warnings: vec![
                "Le scan Xbox / Microsoft Store n’est disponible que sous Windows."
                    .into(),
            ],
        }
    }
}

#[cfg(windows)]
fn scan_windows() -> XboxScanResult {
    let mut warnings = Vec::new();
    let mut by_pfn: HashMap<String, XboxInstalledGame> = HashMap::new();

    match list_appx_packages() {
        Ok(packages) => {
            for (pfn, name) in packages {
                if should_skip_package(&pfn, &name) {
                    continue;
                }
                let key = pfn.to_lowercase();
                by_pfn.entry(key).or_insert(XboxInstalledGame {
                    launcher: "xbox",
                    external_id: pfn,
                    name,
                    installed: true,
                    owned: true,
                    launchable: true,
                });
            }
        }
        Err(err) => {
            warnings.push(format!("Packages AppX : {err}"));
        }
    }

    let games: Vec<_> = by_pfn.into_values().collect();
    let package_count = games.len();
    XboxScanResult {
        packages_found: package_count > 0,
        package_count,
        games,
        warnings,
    }
}

#[cfg(windows)]
fn should_skip_package(pfn: &str, name: &str) -> bool {
    let pfn_l = pfn.to_lowercase();
    let name_l = name.to_lowercase();
    const SKIP_PREFIXES: &[&str] = &[
        "microsoft.windows",
        "microsoft.vclibs",
        "microsoft.net.",
        "microsoft.ui.",
        "microsoft.services.",
        "microsoft.desktopappinstaller",
        "microsoft.winget",
        "microsoft.xboxidentityprovider",
        "microsoft.xbox.tcui",
        "microsoft.xboxgameoverlay",
        "microsoft.xboxgamingoverlay",
        "microsoft.xboxspeechtotextoverlay",
        "microsoft.gamingapp",
        "microsoft.microsoftedge",
        "microsoft.bing",
        "microsoft.onedrive",
        "microsoft.office",
        "microsoft.skypeapp",
        "microsoft.zune",
        "microsoft.people",
        "microsoft.gethelp",
        "microsoft.getstarted",
        "microsoft.yourphone",
        "microsoft.storepurchaseapp",
        "windows.",
        "nvidia",
        "realtek",
        "intel",
        "amd",
    ];
    SKIP_PREFIXES.iter().any(|p| pfn_l.starts_with(p) || name_l.starts_with(p))
        || pfn_l.contains("framework")
        || name_l.contains("framework")
}

#[cfg(windows)]
fn list_appx_packages() -> Result<Vec<(String, String)>, String> {
    use std::process::Command;

    // PackageFamilyName + Name only — never InstallLocation.
    let script = r#"
$ErrorActionPreference = 'Stop'
Get-AppxPackage |
  Where-Object { -not $_.IsFramework -and $_.SignatureKind -ne 'System' } |
  Select-Object -Property PackageFamilyName, Name |
  ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("powershell spawn failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("powershell failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(vec![]);
    }

    parse_appx_json(&stdout)
}

#[cfg(windows)]
fn parse_appx_json(raw: &str) -> Result<Vec<(String, String)>, String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Row {
        package_family_name: String,
        name: String,
    }

    // PowerShell emits an object when a single row, else an array.
    if raw.trim_start().starts_with('{') {
        let row: Row =
            serde_json::from_str(raw).map_err(|e| format!("appx json: {e}"))?;
        return Ok(vec![(row.package_family_name, row.name)]);
    }

    let rows: Vec<Row> =
        serde_json::from_str(raw).map_err(|e| format!("appx json: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| (r.package_family_name, r.name))
        .collect())
}

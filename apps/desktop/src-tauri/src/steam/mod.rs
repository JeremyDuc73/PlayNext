mod detect;
mod parse;

pub use detect::{scan_steam_libraries, SteamScanResult};
pub use parse::{parse_app_manifest, parse_library_folders, SteamGameDraft};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_library_folders_vdf() {
        let raw = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"contentid"		"123"
		"totalsize"		"0"
		"apps"
		{
			"730"		"50000000000"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"apps"
		{
			"570"		"1000"
		}
	}
}
"#;
        let folders = parse_library_folders(raw).expect("parse folders");
        assert_eq!(folders.len(), 2);
        assert!(folders[0].contains("Steam"));
        assert!(folders[1].contains("SteamLibrary"));
    }

    #[test]
    fn parses_app_manifest_acf() {
        let raw = r#"
"AppState"
{
	"appid"		"730"
	"Universe"		"1"
	"name"		"Counter-Strike 2"
	"StateFlags"		"4"
	"installdir"		"Counter-Strike Global Offensive"
	"LastUpdated"		"1700000000"
}
"#;
        let game = parse_app_manifest(raw).expect("parse manifest");
        assert_eq!(game.app_id, "730");
        assert_eq!(game.name, "Counter-Strike 2");
        assert!(game.installed);
        assert!(game.launchable);
    }

    #[test]
    fn ignores_non_installed_state_flags() {
        let raw = r#"
"AppState"
{
	"appid"		"123"
	"name"		"Not Ready"
	"StateFlags"		"1"
}
"#;
        let game = parse_app_manifest(raw).expect("parse manifest");
        assert!(!game.installed);
    }
}

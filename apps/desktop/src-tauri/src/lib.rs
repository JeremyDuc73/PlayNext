mod steam;
mod xbox;

use serde::Serialize;
use steam::SteamScanResult;
use xbox::XboxScanResult;

/// Explicit allowlist of native commands. Add new commands here only after review.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: String,
    version: String,
    platform: String,
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        name: "PlayNext".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        platform: std::env::consts::OS.into(),
    }
}

#[tauri::command]
fn ping_native() -> &'static str {
    "pong"
}

#[tauri::command]
fn scan_steam() -> SteamScanResult {
    steam::scan_steam_libraries()
}

#[tauri::command]
fn scan_xbox() -> XboxScanResult {
    xbox::scan_xbox_installed()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // Deep links on Windows/Linux spawn a second instance; single-instance
            // forwards them to the running app when the deep-link feature is enabled.
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            ping_native,
            scan_steam,
            scan_xbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running PlayNext");
}

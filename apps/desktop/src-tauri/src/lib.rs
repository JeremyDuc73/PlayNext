mod epic;
mod steam;
mod xbox;

use epic::EpicScanResult;
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

#[tauri::command]
fn scan_epic() -> EpicScanResult {
    epic::scan_epic_installed()
}

const EPIC_LOGIN_URL: &str = "https://www.epicgames.com/id/login?responseType=code";
const EPIC_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher";
const EPIC_CODE_CAPTURE_SCRIPT: &str = r#"
(() => {
  const codePattern =
    /localhost\/launcher\/authorized\?code=([A-Za-z0-9._~-]+)/i;
  let redirected = false;

  const captureCode = () => {
    if (redirected) return;
    const content = document.documentElement?.textContent ?? "";
    const match = content.match(codePattern);
    if (!match?.[1]) return;
    redirected = true;
    window.location.replace(
      `http://localhost/launcher/authorized?code=${encodeURIComponent(match[1])}`,
    );
  };

  new MutationObserver(captureCode).observe(document, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  window.addEventListener("load", captureCode);
  captureCode();
})();
"#;

#[tauri::command]
async fn start_epic_login(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    let label = "epic-auth";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_focus();
        return Ok(());
    }

    let handle = app.clone();
    let url = EPIC_LOGIN_URL
        .parse()
        .map_err(|error| format!("Epic login URL invalide: {error}"))?;
    let blank_url = "about:blank"
        .parse()
        .map_err(|error| format!("URL de fenêtre Epic invalide: {error}"))?;

    let window = tauri::webview::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::External(blank_url),
    )
    .title("Connexion Epic")
    .inner_size(620.0, 760.0)
    .min_inner_size(520.0, 620.0)
    .resizable(true)
    .user_agent(EPIC_USER_AGENT)
    .initialization_script(EPIC_CODE_CAPTURE_SCRIPT)
    .on_navigation(move |url| {
        let code = url
            .query_pairs()
            .find(|(key, _)| key == "code" || key == "authorizationCode")
            .map(|(_, value)| value.into_owned());
        let is_local_code_redirect =
            url.host_str() == Some("localhost") && url.path().contains("/launcher/authorized");
        let is_epic_api_redirect = url
            .host_str()
            .is_some_and(|host| host.ends_with("epicgames.com"))
            && url.path().contains("/id/api/redirect")
            && code.is_some();
        let is_epic_code_redirect = is_local_code_redirect || is_epic_api_redirect;
        if !is_epic_code_redirect {
            return true;
        }

        if let Some(code) = code {
            let _ = handle.emit("epic-auth-code", code);
            if let Some(window) = handle.get_webview_window(label) {
                let _ = window.destroy();
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|error| format!("Fenêtre Epic impossible: {error}"))?;

    let cancel_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = cancel_handle.emit("epic-auth-cancelled", ());
        }
    });

    window
        .clear_all_browsing_data()
        .map_err(|error| format!("Cookies Epic impossibles à réinitialiser: {error}"))?;
    window
        .navigate(url)
        .map_err(|error| format!("Navigation Epic impossible: {error}"))?;
    Ok(())
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
            scan_xbox,
            scan_epic,
            start_epic_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running PlayNext");
}

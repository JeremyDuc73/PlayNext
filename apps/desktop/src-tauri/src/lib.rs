mod epic;
mod steam;
mod xbox;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

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

#[tauri::command]
async fn start_discord_login(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    let label = "discord-auth";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_focus();
        return Ok(());
    }

    let target_url = url
        .parse()
        .map_err(|error| format!("URL Discord invalide: {error}"))?;
    let blank_url = "about:blank"
        .parse()
        .map_err(|error| format!("URL de fenêtre Discord invalide: {error}"))?;
    let handle = app.clone();
    let completed = Arc::new(AtomicBool::new(false));
    let navigation_completed = completed.clone();

    let window = tauri::webview::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::External(blank_url),
    )
    .title("Connexion Discord")
    .inner_size(520.0, 720.0)
    .min_inner_size(460.0, 600.0)
    .resizable(true)
    .on_navigation(move |url| {
        let is_callback = url.scheme() == "playnext"
            && url.host_str() == Some("auth")
            && url.path() == "/callback";
        if !is_callback {
            return true;
        }

        navigation_completed.store(true, Ordering::SeqCst);
        let _ = handle.emit("discord-auth-result", url.to_string());
        if let Some(window) = handle.get_webview_window(label) {
            let _ = window.destroy();
        }
        false
    })
    .build()
    .map_err(|error| format!("Fenêtre Discord impossible: {error}"))?;

    let cancel_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) && !completed.load(Ordering::SeqCst) {
            let _ = cancel_handle.emit("discord-auth-cancelled", ());
        }
    });

    window
        .navigate(target_url)
        .map_err(|error| format!("Navigation Discord impossible: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn start_microsoft_login(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    let label = "microsoft-auth";
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_focus();
        return Ok(());
    }

    let target_url = url
        .parse()
        .map_err(|error| format!("URL Microsoft invalide: {error}"))?;
    let blank_url = "about:blank"
        .parse()
        .map_err(|error| format!("URL de fenêtre Microsoft invalide: {error}"))?;
    let handle = app.clone();
    let completed = Arc::new(AtomicBool::new(false));
    let navigation_completed = completed.clone();

    let window = tauri::webview::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::External(blank_url),
    )
    .title("Connexion Microsoft")
    .inner_size(560.0, 740.0)
    .min_inner_size(460.0, 600.0)
    .resizable(true)
    .on_navigation(move |url| {
        let is_callback = url.scheme() == "playnext"
            && url.host_str() == Some("auth")
            && url.path() == "/microsoft";
        let xbox_result = url
            .query_pairs()
            .find(|(key, _)| key == "xbox")
            .map(|(_, value)| value.into_owned());
        let is_web_result = matches!(xbox_result.as_deref(), Some("ok") | Some("error"));
        if !is_callback && !is_web_result {
            return true;
        }

        navigation_completed.store(true, Ordering::SeqCst);
        let result_url = if is_callback {
            url.to_string()
        } else if xbox_result.as_deref() == Some("ok") {
            "playnext://auth/microsoft?ok=1".to_string()
        } else {
            let reason = url
                .query_pairs()
                .find(|(key, _)| key == "reason")
                .map(|(_, value)| value.into_owned())
                .unwrap_or_else(|| "xbox_link_failed".into());
            format!("playnext://auth/microsoft?error={reason}")
        };
        let _ = handle.emit("microsoft-auth-result", result_url);
        if let Some(window) = handle.get_webview_window(label) {
            let _ = window.destroy();
        }
        false
    })
    .build()
    .map_err(|error| format!("Fenêtre Microsoft impossible: {error}"))?;

    let cancel_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) && !completed.load(Ordering::SeqCst) {
            let _ = cancel_handle.emit("microsoft-auth-cancelled", ());
        }
    });

    window
        .navigate(target_url)
        .map_err(|error| format!("Navigation Microsoft impossible: {error}"))?;
    Ok(())
}

const EPIC_LOGIN_URL: &str =
    "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode";
const EPIC_CODE_CAPTURE_SCRIPT: &str = r#"
(() => {
  const codePatterns = [
    /localhost\/launcher\/authorized\?code=([A-Za-z0-9._~-]+)/i,
    /["']authorizationCode["']\s*:\s*["']([A-Za-z0-9._~-]+)["']/i,
  ];
  let redirected = false;

  const captureCode = () => {
    if (redirected) return;
    const text = document.documentElement?.textContent?.trim() ?? "";
    let code = null;
    try {
      const response = JSON.parse(text);
      if (typeof response.authorizationCode === "string") {
        code = response.authorizationCode;
      } else if (typeof response.redirectUrl === "string") {
        code = new URL(response.redirectUrl).searchParams.get("code");
      }
    } catch {
      // Epic may render the JSON inside a page instead of returning JSON.
    }
    const content = [
      text,
      document.documentElement?.innerHTML ?? "",
    ].join("\n");
    const normalized = content.replaceAll("\\/", "/");
    const match = codePatterns
      .map((pattern) => normalized.match(pattern))
      .find(Boolean);
    code ??= match?.[1] ?? null;
    if (!code) return;
    redirected = true;
    window.location.replace(
      `https://localhost/launcher/authorized?code=${encodeURIComponent(code)}`,
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
    let completed = Arc::new(AtomicBool::new(false));
    let navigation_completed = completed.clone();
    let url = EPIC_LOGIN_URL
        .parse()
        .map_err(|error| format!("Epic login URL invalide: {error}"))?;
    let blank_url = "about:blank"
        .parse()
        .map_err(|error| format!("URL de fenêtre Epic invalide: {error}"))?;
    let epic_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Dossier Epic impossible: {error}"))?
        .join("epic-auth");

    let window = tauri::webview::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::External(blank_url),
    )
    .title("Connexion Epic")
    .inner_size(620.0, 760.0)
    .min_inner_size(520.0, 620.0)
    .resizable(true)
    .data_directory(epic_data_dir)
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
            && (url.path().contains("/id/api/redirect") || url.path() == "/fnauth")
            && code.is_some();
        let is_epic_code_redirect = is_local_code_redirect || is_epic_api_redirect;
        if !is_epic_code_redirect {
            return true;
        }

        if let Some(code) = code {
            navigation_completed.store(true, Ordering::SeqCst);
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
        if matches!(event, tauri::WindowEvent::Destroyed) && !completed.load(Ordering::SeqCst) {
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
            start_discord_login,
            start_microsoft_login,
            start_epic_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running PlayNext");
}

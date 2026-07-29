use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamGameDraft {
    pub app_id: String,
    pub name: String,
    pub installed: bool,
    pub launchable: bool,
    /// Local only — never sync this field to the API.
    #[serde(skip_serializing)]
    pub install_dir: Option<String>,
}

/// Collect Steam library roots from libraryfolders.vdf.
pub fn parse_library_folders(content: &str) -> Result<Vec<String>, String> {
    let mut paths = Vec::new();
    for (key, value) in iter_flat_string_pairs(content) {
        if key.eq_ignore_ascii_case("path") {
            let normalized = value.replace("\\\\", "\\");
            if !normalized.is_empty() {
                paths.push(normalized);
            }
        }
    }
    if paths.is_empty() {
        return Err("No Steam library paths found in libraryfolders.vdf".into());
    }
    Ok(paths)
}

pub fn parse_app_manifest(content: &str) -> Result<SteamGameDraft, String> {
    let mut app_id = None;
    let mut name = None;
    let mut state_flags = None;
    let mut install_dir = None;

    for (key, value) in iter_flat_string_pairs(content) {
        match key.to_ascii_lowercase().as_str() {
            "appid" => app_id = Some(value),
            "name" => name = Some(value),
            "stateflags" => state_flags = value.parse::<u32>().ok(),
            "installdir" => install_dir = Some(value),
            _ => {}
        }
    }

    let app_id = app_id.ok_or_else(|| "Missing appid in appmanifest".to_string())?;
    let name = name.unwrap_or_else(|| format!("Steam App {app_id}"));
    let flags = state_flags.unwrap_or(0);
    // Bit 2 (value 4) = fully installed in Steam StateFlags.
    let installed = (flags & 4) == 4;

    Ok(SteamGameDraft {
        app_id,
        name,
        installed,
        launchable: installed,
        install_dir,
    })
}

/// Walk a VDF document and yield every `"key" "value"` pair at any nesting level.
fn iter_flat_string_pairs(content: &str) -> Vec<(String, String)> {
    let bytes = content.as_bytes();
    let mut i = 0;
    let mut pairs = Vec::new();

    while i < bytes.len() {
        skip_ws_and_comments(bytes, &mut i);
        if i >= bytes.len() {
            break;
        }

        match bytes[i] {
            b'{' | b'}' => {
                i += 1;
                continue;
            }
            b'"' => {
                let Some(first) = read_quoted(bytes, &mut i) else {
                    break;
                };
                skip_ws_and_comments(bytes, &mut i);
                if i < bytes.len() && bytes[i] == b'"' {
                    if let Some(second) = read_quoted(bytes, &mut i) {
                        pairs.push((first, second));
                    }
                }
                // If next token is `{`, loop continues and enters the block naturally.
            }
            _ => i += 1,
        }
    }

    pairs
}

fn skip_ws_and_comments(bytes: &[u8], i: &mut usize) {
    while *i < bytes.len() {
        match bytes[*i] {
            b' ' | b'\t' | b'\r' | b'\n' => *i += 1,
            b'/' if *i + 1 < bytes.len() && bytes[*i + 1] == b'/' => {
                *i += 2;
                while *i < bytes.len() && bytes[*i] != b'\n' {
                    *i += 1;
                }
            }
            _ => break,
        }
    }
}

fn read_quoted(bytes: &[u8], i: &mut usize) -> Option<String> {
    if *i >= bytes.len() || bytes[*i] != b'"' {
        return None;
    }
    *i += 1;
    let mut out = String::new();
    while *i < bytes.len() {
        let c = bytes[*i];
        *i += 1;
        if c == b'"' {
            return Some(out);
        }
        if c == b'\\' && *i < bytes.len() {
            out.push(bytes[*i] as char);
            *i += 1;
            continue;
        }
        out.push(c as char);
    }
    None
}

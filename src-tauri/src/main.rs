#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
mod debrid;
mod player;
mod surface;
mod integrations;
mod profile_sessions;
mod updates;

#[tauri::command]
async fn addon_get(url: String) -> Result<serde_json::Value, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&parsed.scheme()) || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Only HTTP(S) addon URLs without credentials are supported.".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build().map_err(|e| e.to_string())?;
    let mut response = client.get(parsed).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 5 * 1024 * 1024 { return Err("Addon response exceeds 5 MB.".into()); }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_set_theme(window: tauri::WebviewWindow, accent: String) -> Result<(), String> {
    let (r,g,b) = match accent.as_str() { "lime" => (8u32,14u32,24u32), "ice" => (7,18,30), "violet" => (16,11,25), _ => return Err("Unknown theme.".into()) };
    window.set_theme(Some(tauri::Theme::Dark)).map_err(|_| "Could not apply window theme.")?;
    let hwnd=window.hwnd().map_err(|_| "Window unavailable.")?.0;
    let caption=r|(g<<8)|(b<<16);let text=0x00f5f1edu32;
    unsafe { windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(hwnd as _, 35, &caption as *const u32 as _, 4); windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(hwnd as _, 36, &text as *const u32 as _, 4); }
    Ok(())
}

#[tauri::command]
fn app_update_supported() -> bool {
    !cfg!(debug_assertions) && std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.join("uninstall.exe").is_file())).unwrap_or(false)
}
#[tauri::command]
fn app_prepare_update(state: tauri::State<'_, player::PlayerState>) -> Result<(), String> { player::prepare_update(&state) }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(player::PlayerState::default())
        .invoke_handler(tauri::generate_handler![app_update_supported, app_prepare_update, addon_get, profile_sessions::profile_session_get, profile_sessions::profile_session_set, profile_sessions::profile_session_remove, debrid::rd_connect, debrid::rd_request, debrid::rd_disconnect, debrid::rd_open_token_page, player::mpv_available, player::mpv_play, player::mpv_resize, player::mpv_control, player::mpv_stop, player::mpv_fullscreen, integrations::integration_connections, integrations::integration_connect, integrations::integration_check, integrations::integration_disconnect, integrations::integration_browse, integrations::integration_play, integrations::integration_resolve, integrations::integration_tracking, integrations::integration_watched, integrations::oauth::integration_auth_begin, integrations::oauth::integration_auth_poll, integrations::oauth::integration_auth_cancel, integrations::integration_open_url, app_set_theme])
        .on_window_event(|window, event| { if matches!(event, tauri::WindowEvent::Destroyed) { player::shutdown(&window.state::<player::PlayerState>()); } })
        .run(tauri::generate_context!())
        .expect("Could not start Aster Content Hub");
}


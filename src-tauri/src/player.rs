use serde_json::{json, Value};
use std::{io::{BufRead, BufReader}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::{Arc, Mutex}};
use tauri::{Emitter, Manager};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlaybackOptions { volume: f64, speed: f64, hardware_decoding: bool, subtitle_scale: f64, subtitle_delay: f64, audio_delay: f64 }
impl Default for PlaybackOptions { fn default() -> Self { Self { volume: 100.0, speed: 1.0, hardware_decoding: true, subtitle_scale: 1.0, subtitle_delay: 0.0, audio_delay: 0.0 } } }
fn option_args(options: &PlaybackOptions) -> Result<Vec<String>, String> {
    for (value, min, max) in [(options.volume,0.0,100.0),(options.speed,0.5,2.0),(options.subtitle_scale,0.5,2.0),(options.subtitle_delay,-30.0,30.0),(options.audio_delay,-5.0,5.0)] { if !value.is_finite() || value < min || value > max { return Err("Invalid playback settings.".into()); } }
    Ok(vec![format!("--volume={}", options.volume),format!("--speed={}", options.speed),format!("--hwdec={}", if options.hardware_decoding { "auto-safe" } else { "no" }),format!("--sub-scale={}", options.subtitle_scale),format!("--sub-delay={}", options.subtitle_delay),format!("--audio-delay={}", options.audio_delay)])
}

struct ManagedPlayer { session_id: String, child: Child, host: usize, pipe: String, stopping: bool }
#[derive(Default)]
pub struct PlayerState(Arc<Mutex<Option<ManagedPlayer>>>);

fn find_mpv(resources: Option<&Path>) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(root) = resources { candidates.push(root.join("player/mpv.exe")); }
    #[cfg(any(debug_assertions, test))]
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/player/mpv.exe"));
    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(key) {
            let root = PathBuf::from(root);
            candidates.push(root.join("mpv/mpv.exe"));
            candidates.push(root.join("WinGet/Links/mpv.exe"));
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(local).join("Microsoft/WinGet");
        candidates.push(root.join("Links/mpv.exe"));
        if let Ok(entries) = std::fs::read_dir(root.join("Packages")) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("shinchiro.mpv_") || name.starts_with("mpv-player.mpv-") {
                    candidates.push(entry.path().join("mpv.exe"));
                    if let Ok(children) = std::fs::read_dir(entry.path()) {
                        for child in children.flatten().filter(|e| e.path().is_dir()) { candidates.push(child.path().join("mpv.exe")); }
                    }
                }
            }
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn valid_language(value: &str) -> bool {
    value.is_empty() || ["en", "es", "fr", "de", "it", "pt", "hi", "ja", "ko", "zh", "ar", "ru", "uk"].contains(&value)
}

fn launch_args(source: &str, title: &str, position: f64, audio: &str, subtitle: &str, mode: &str, script: &Path) -> Result<Vec<String>, String> {
    if !position.is_finite() || position < 0.0 || !valid_language(audio) || !valid_language(subtitle) || !["auto", "off"].contains(&mode) { return Err("Invalid playback preferences.".into()); }
    let mut args: Vec<String> = ["--no-config", "--load-scripts=no", "--load-select=yes", "--load-context-menu=yes", "--ytdl=no", "--profile=high-quality", "--hwdec=auto-safe", "--force-window=immediate", "--autofit=85%x85%", "--terminal=yes", "--input-terminal=no", "--msg-level=all=no", "--term-status-msg=", "--save-position-on-quit=no", "--autoload-files=no"].iter().map(|s| s.to_string()).collect();
    args.push(format!("--script={}", script.display()));
    args.push(format!("--force-media-title={}", title.chars().take(300).collect::<String>()));
    args.push(format!("--start={position}"));
    args.push(format!("--sid={}", if mode == "off" { "no" } else { "auto" }));
    if !audio.is_empty() { args.push(format!("--alang={audio}")); }
    if !subtitle.is_empty() { args.push(format!("--slang={subtitle}")); }
    args.extend(["--".into(), source.into()]);
    Ok(args)
}

#[tauri::command]
pub fn mpv_available(app: tauri::AppHandle) -> bool { find_mpv(app.path().resource_dir().ok().as_deref()).is_some() }

#[tauri::command]
pub async fn mpv_play(app: tauri::AppHandle, state: tauri::State<'_, PlayerState>, source: String, demo: bool, title: String, position: f64, audio_language: String, subtitle_language: String, subtitle_mode: String, options: Option<PlaybackOptions>, session_id: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if session_id.len() > 80 || session_id.is_empty() || !session_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') { return Err("Invalid playback session.".into()); }
    let exe = find_mpv(app.path().resource_dir().ok().as_deref()).ok_or("The bundled player is missing. Reinstall Aster to restore it, or select the built-in player in Settings.")?;
    let cache = app.path().app_cache_dir().map_err(|_| "Could not locate Aster's player cache.")?;
    std::fs::create_dir_all(&cache).map_err(|_| "Could not create the player cache.")?;
    let script = cache.join("aster-player.lua");
    std::fs::write(&script, include_bytes!("aster-player.lua")).map_err(|_| "Could not prepare player integration.")?;
    let playable = if demo {
        let file = cache.join("sintel-trailer.mp4");
        if !file.exists() { std::fs::write(&file, include_bytes!("../../public/media/sintel-trailer.mp4")).map_err(|_| "Could not prepare the offline preview.")?; }
        file.to_string_lossy().to_string()
    } else {
        let url = reqwest::Url::parse(&source).map_err(|_| "Invalid stream URL.")?;
        if !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() { return Err("Only HTTP(S) video URLs without embedded credentials can be opened.".into()); }
        source
    };
    let mut args = launch_args(&playable, &title, position, &audio_language, &subtitle_language, &subtitle_mode, &script)?;
    let extra_args = option_args(&options.unwrap_or_default())?;
    args.splice(args.len()-2..args.len()-2, extra_args);
    let mut active = state.0.lock().map_err(|_| "Player state is unavailable.")?;
    if let Some(player) = active.as_mut() { if player.child.try_wait().map_err(|_| "Could not inspect the active player.")?.is_none() { return Err("Close the current Aster mpv window before opening another video.".into()); } }
    let host = crate::surface::create(&app, x, y, width, height)?;
    let pipe = format!(r"\\.\pipe\aster-mpv-{}-{}", std::process::id(), session_id);
    args.splice(args.len()-2..args.len()-2, [format!("--wid={host}"), format!("--input-ipc-server={pipe}"), "--osc=no".into(), "--osd-level=0".into(), "--input-default-bindings=no".into(), "--input-vo-keyboard=yes".into()]);
    let mut command = Command::new(exe);
    command.args(args).stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let mut child = command.spawn().map_err(|_| { crate::surface::destroy(&app, host); "mpv could not start. Check the installation." })?;
    let stdout = child.stdout.take().ok_or("Player output could not be connected.")?;
    *active = Some(ManagedPlayer { session_id: session_id.clone(), child, host, pipe, stopping: false });
    let shared = Arc::clone(&state.0);
    crate::surface::monitor_pointer(app.clone(), Arc::new({
        let active = Arc::clone(&shared);
        let id = session_id.clone();
        move || active.lock().ok().is_some_and(|p| p.as_ref().is_some_and(|p| p.session_id == id && !p.stopping))
    }), session_id.clone());
    std::thread::spawn(move || {
        let mut completed = false;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line == "ASTER_COMPLETE" { completed = true; }
            if let Some(raw) = line.strip_prefix("ASTER_INPUT ") {
                if let Ok(data) = serde_json::from_str::<Value>(raw) {
                    if let Some(action) = data["action"].as_str().filter(|a| ["activity", "fullscreen", "escape"].contains(a)) {
                        let _ = app.emit("mpv-playback", json!({"sessionId":session_id,"kind":"input","action":action}));
                    }
                }
            }
            if let Some(raw) = line.strip_prefix("ASTER_STATE ") {
                if let Ok(data) = serde_json::from_str::<Value>(raw) { let _ = app.emit("mpv-playback", json!({"sessionId":session_id,"kind":"state","paused":data["paused"],"volume":data["volume"],"muted":data["muted"],"tracks":data["tracks"]})); }
            }
            if let Some(raw) = line.strip_prefix("ASTER_PROGRESS ") {
                if let Ok(data) = serde_json::from_str::<Value>(raw) {
                    if let (Some(position), Some(duration)) = (data["position"].as_f64(), data["duration"].as_f64()) {
                        if position.is_finite() && duration.is_finite() && position >= 0.0 && duration > 0.0 { let _ = app.emit("mpv-playback", json!({"sessionId":session_id,"kind":"progress","position":position,"duration":duration})); }
                    }
                }
            }
        }
        let mut success = true;
        if let Ok(mut active) = shared.lock() {
            if active.as_ref().map(|p| p.session_id.as_str()) == Some(session_id.as_str()) {
                if let Some(mut player) = active.take() { completed = completed && !player.stopping; success = player.child.wait().map(|s| s.success() || player.stopping).unwrap_or(false); }
            }
        }
        let _ = app.emit("mpv-playback", json!({"sessionId":session_id,"kind":"ended","success":success,"completed":completed && success}));
        crate::surface::destroy(&app, host);
    });
    Ok(())
}

fn session(state: &PlayerState, id: &str) -> Result<(String, usize), String> {
    let active = state.0.lock().map_err(|_| "Player state unavailable.")?;
    let player = active.as_ref().filter(|p| p.session_id == id).ok_or("This playback session is no longer active.")?;
    Ok((player.pipe.clone(), player.host))
}

async fn send_command(pipe: &str, command: Value, reply: bool) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
    let request = async {
        let client = loop {
            match tokio::net::windows::named_pipe::ClientOptions::new().open(pipe) {
                Ok(client) => break client,
                Err(_) => tokio::time::sleep(std::time::Duration::from_millis(50)).await,
            }
        };
        let mut client = tokio::io::BufReader::new(client);
        let message = format!("{}\n", json!({"command":command,"request_id":1}));
        client.get_mut().write_all(message.as_bytes()).await.map_err(|_| "Could not send the player command.")?;
        if reply {
            let mut line = String::new();
            client.read_line(&mut line).await.map_err(|_| "The player did not respond.")?;
            let response: Value = serde_json::from_str(&line).map_err(|_| "Invalid player response.")?;
            if response["error"] != "success" { return Err("This playback control is not available yet.".to_string()); }
        }
        Ok(())
    };
    tokio::time::timeout(std::time::Duration::from_secs(3), request).await.map_err(|_| "The player is still loading. Try again in a moment.".to_string())?
}

fn control_command(action: &str, value: &Value) -> Result<Value, String> {
    match action {
        "pause" => Ok(json!(["cycle", "pause"])),
        "mute" => Ok(json!(["cycle", "mute"])),
        "seek" => value.as_f64().filter(|v| v.is_finite() && *v >= 0.0 && *v <= 100_000_000.0).map(|v| json!(["seek",v,"absolute+exact"])).ok_or("Invalid seek position.".into()),
        "volume" => value.as_f64().filter(|v| v.is_finite() && *v >= 0.0 && *v <= 100.0).map(|v| json!(["set_property","volume",v])).ok_or("Invalid volume.".into()),
        "audio" | "subtitles" => {
            let property = if action == "audio" { "aid" } else { "sid" };
            if action == "subtitles" && value == "no" { return Ok(json!(["set_property",property,"no"])); }
            value.as_i64().filter(|id| *id > 0 && *id < 100000).map(|id| json!(["set_property",property,id])).ok_or("Invalid track selection.".into())
        }
        _ => Err("Unsupported player control.".into()),
    }
}

#[tauri::command]
pub async fn mpv_control(state: tauri::State<'_, PlayerState>, session_id: String, action: String, value: Value) -> Result<(), String> {
    let (pipe, _) = session(&state, &session_id)?;
    send_command(&pipe, control_command(&action, &value)?, true).await
}

#[tauri::command]
pub fn mpv_resize(app: tauri::AppHandle, state: tauri::State<'_, PlayerState>, session_id: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    let (_, host) = session(&state, &session_id)?;
    crate::surface::resize(&app, host, x, y, width, height)
}

#[tauri::command]
pub async fn mpv_stop(app: tauri::AppHandle, state: tauri::State<'_, PlayerState>, session_id: String) -> Result<(), String> {
    let Ok((pipe, host)) = session(&state, &session_id) else { return Ok(()); };
    if let Ok(mut active) = state.0.lock() { if let Some(player) = active.as_mut().filter(|p| p.session_id == session_id) { player.stopping = true; } }
    crate::surface::hide(&app, host);
    if send_command(&pipe, json!(["quit"]), false).await.is_err() {
        if let Ok(mut active) = state.0.lock() { if let Some(player) = active.as_mut().filter(|p| p.session_id == session_id) { let _ = player.child.kill(); } }
    }
    // Return after the old process releases its surface, before a replacement starts.
    for _ in 0..40 {
        let running = if let Ok(mut active) = state.0.lock() {
            active.as_mut().filter(|p| p.session_id == session_id).is_some_and(|p| p.child.try_wait().ok().flatten().is_none())
        } else { false };
        if !running { return Ok(()); }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    if let Ok(mut active) = state.0.lock() { if let Some(player) = active.as_mut().filter(|p| p.session_id == session_id) { let _ = player.child.kill(); let _ = player.child.wait(); } }
    Ok(())
}

#[tauri::command]
pub async fn mpv_fullscreen(window: tauri::WebviewWindow, enabled: Option<bool>) -> Result<bool, String> {
    let fullscreen = window.is_fullscreen().map_err(|_| "Could not read fullscreen state.")?;
    let next = enabled.unwrap_or(!fullscreen);
    window.set_fullscreen(next).map_err(|_| "Could not change fullscreen state.".to_string())?;
    Ok(next)
}

pub fn shutdown(state: &PlayerState) { if let Ok(mut active) = state.0.lock() { if let Some(player) = active.as_mut() { player.stopping = true; let _ = player.child.kill(); } } }

pub fn prepare_update(state: &PlayerState) -> Result<(), String> {
    let mut active = state.0.lock().map_err(|_| "Player state is unavailable.")?;
    if let Some(player) = active.as_mut() {
        if player.child.try_wait().map_err(|_| "Could not inspect playback.")?.is_none() {
            return Err("Finish playback before installing an update.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_and_applies_player_defaults() {
        let options = PlaybackOptions { volume: 65.0, speed: 1.25, hardware_decoding: false, subtitle_scale: 1.2, subtitle_delay: -0.5, audio_delay: 0.2 };
        let args = option_args(&options).unwrap();
        for arg in ["--volume=65", "--speed=1.25", "--hwdec=no", "--sub-scale=1.2", "--sub-delay=-0.5", "--audio-delay=0.2"] { assert!(args.contains(&arg.to_string())); }
        assert!(option_args(&PlaybackOptions { speed: f64::NAN, ..Default::default() }).is_err());
        assert!(option_args(&PlaybackOptions { subtitle_scale: 500.0, ..Default::default() }).is_err());
    }
    #[test]
    fn only_exposes_safe_playback_controls_and_valid_rectangles() {
        assert_eq!(control_command("audio", &json!(2)).unwrap(), json!(["set_property", "aid", 2]));
        assert_eq!(control_command("subtitles", &json!("no")).unwrap(), json!(["set_property", "sid", "no"]));
        assert!(control_command("run", &json!("cmd.exe")).is_err());
        assert!(control_command("seek", &json!(-5)).is_err());
        assert!(control_command("volume", &json!(101)).is_err());
        assert!(control_command("audio", &json!("2;run")).is_err());
        assert!(crate::surface::validate(0.0, 76.0, 1400.0, 600.0).is_ok());
        assert!(crate::surface::validate(-1.0, 0.0, 100.0, 100.0).is_err());
        assert!(crate::surface::validate(0.0, 0.0, f64::NAN, 100.0).is_err());
    }
    #[test]
    fn passes_streams_as_one_positional_argument_and_validates_preferences() {
        let source = "https://example.com/film.mkv?token=a&b=2";
        let args = launch_args(source, "Movie title", 12.5, "es", "en", "auto", Path::new("bridge.lua")).unwrap();
        assert_eq!(&args[args.len()-2..], &["--", source]);
        assert!(args.contains(&"--alang=es".to_string()));
        assert!(args.contains(&"--slang=en".to_string()));
        assert!(launch_args(source, "Movie", f64::NAN, "en", "en", "auto", Path::new("x")).is_err());
        assert!(launch_args(source, "Movie", 0.0, "--bad", "en", "auto", Path::new("x")).is_err());
    }
    #[test]
    #[ignore = "Requires the prepared Windows player bundle"]
    fn installed_mpv_decodes_demo_and_reports_progress() {
        let bundled = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let exe = find_mpv(Some(&bundled)).expect("bundled mpv prepared");
        assert_eq!(exe, bundled.join("player/mpv.exe"), "test must use bundled mpv, not a system installation");
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let source = project.join("public/media/sintel-trailer.mp4");
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/aster-player.lua");
        let mut args = launch_args(&source.to_string_lossy(), "Aster smoke test", 1.0, "en", "en", "auto", &script).unwrap();
        args.splice(args.len()-2..args.len()-2, ["--vo=null".into(), "--ao=null".into(), "--end=3".into(), "--speed=3".into(), "--force-window=no".into()]);
        let output = Command::new(exe).args(args).output().unwrap();
        assert!(output.status.success(), "mpv exited unsuccessfully");
        assert!(String::from_utf8_lossy(&output.stdout).contains("ASTER_PROGRESS"), "progress bridge did not report");
        assert!(String::from_utf8_lossy(&output.stdout).contains("ASTER_COMPLETE"), "natural completion was not reported");
    }
    #[test]
    #[ignore = "Requires the prepared Windows player bundle"]
    fn installed_mpv_accepts_live_track_and_transport_controls() {
        let bundled = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let exe = find_mpv(Some(&bundled)).expect("bundled mpv prepared");
        assert_eq!(exe, bundled.join("player/mpv.exe"), "test must use bundled mpv, not a system installation");
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let source = project.join("public/media/sintel-trailer.mp4");
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/aster-player.lua");
        let pipe = format!(r"\\.\pipe\aster-test-mpv-{}", std::process::id());
        let mut args = launch_args(&source.to_string_lossy(), "Control smoke test", 0.0, "en", "en", "off", &script).unwrap();
        args.splice(args.len()-2..args.len()-2, ["--vo=null".into(), "--ao=null".into(), "--force-window=no".into(), "--pause=yes".into(), format!("--input-ipc-server={pipe}")]);
        let mut child = Command::new(exe).args(args).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap();
        let result = tauri::async_runtime::block_on(async {
            // Hosted runners can take longer to demux the fixture. Wait for an
            // actual playback position rather than assuming it loads in 600 ms.
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
            loop {
                if send_command(&pipe, json!(["get_property", "time-pos"]), true).await.is_ok() { break; }
                if std::time::Instant::now() >= deadline { return Err("The bundled player did not finish loading the test video.".to_string()); }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
            for (action, value) in [("volume", json!(25)), ("audio", json!(1)), ("subtitles", json!("no")), ("seek", json!(2)), ("pause", Value::Null)] { send_command(&pipe, control_command(action, &value)?, true).await?; }
            send_command(&pipe, json!(["keypress", "RIGHT"]), true).await?;
            send_command(&pipe, json!(["keypress", "DOWN"]), true).await?;
            send_command(&pipe, json!(["keypress", "m"]), true).await?;
            send_command(&pipe, json!(["keypress", "f"]), true).await?;
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            send_command(&pipe, json!(["quit"]), false).await
        });
        if result.is_err() { let _ = child.kill(); }
        let output = child.wait_with_output().unwrap();
        assert!(result.is_ok(), "live player controls failed: {result:?}");
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("ASTER_STATE"));
        assert!(String::from_utf8_lossy(&output.stdout).contains("ASTER_INPUT"));
        assert!(String::from_utf8_lossy(&output.stdout).contains("\"volume\":20"), "native volume shortcut did not apply");
        assert!(!String::from_utf8_lossy(&output.stdout).contains("ASTER_COMPLETE"), "manual quit must not trigger autoplay");
    }
}


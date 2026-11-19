use std::sync::mpsc;
use tauri::{Emitter, Manager};
use windows_sys::Win32::UI::WindowsAndMessaging::*;

// A child HWND receives pointer input instead of WebView2. Observe the desktop
// cursor while Aster is active so fullscreen chrome can always be revealed.
pub fn monitor_pointer(app: tauri::AppHandle, active: std::sync::Arc<dyn Fn() -> bool + Send + Sync>, session: String) {
    let Some(window) = app.get_webview_window("main") else { return };
    let Ok(hwnd) = window.hwnd() else { return };
    let parent = hwnd.0 as usize;
    std::thread::spawn(move || {
        let mut previous = None;
        while active() {
            let mut point = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
            let mut bounds = windows_sys::Win32::Foundation::RECT { left: 0, top: 0, right: 0, bottom: 0 };
            let inside = unsafe {
                GetForegroundWindow() as usize == parent && GetCursorPos(&mut point) != 0
                    && GetWindowRect(parent as _, &mut bounds) != 0
                    && point.x >= bounds.left && point.x < bounds.right
                    && point.y >= bounds.top && point.y < bounds.bottom
            };
            let position = (point.x, point.y);
            if inside && previous != Some(position) {
                let _ = app.emit("mpv-playback", serde_json::json!({"sessionId":session,"kind":"input","action":"activity"}));
            }
            previous = if inside { Some(position) } else { None };
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });
}

pub fn create(app: &tauri::AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<usize, String> {
    validate(x, y, width, height)?;
    let window = app.get_webview_window("main").ok_or("Main window is unavailable.")?;
    let scale = window.scale_factor().map_err(|_| "Could not read window scale.")?;
    let parent = window.hwnd().map_err(|_| "Could not find the Windows video host.")?.0 as usize;
    let (sender, receiver) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let host = unsafe { CreateWindowExW(0, class.as_ptr(), std::ptr::null(), WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN, (x * scale) as i32, (y * scale) as i32, (width * scale) as i32, (height * scale) as i32, parent as _, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null()) };
        if !host.is_null() { unsafe { SetWindowPos(host, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW); } }
        let _ = sender.send(host as usize);
    }).map_err(|_| "Could not create the video surface.")?;
    let host = receiver.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_| "Video surface creation timed out.")?;
    if host == 0 { return Err("Windows could not create the embedded video surface.".into()); }
    Ok(host)
}

pub fn validate(x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if [x, y, width, height].iter().any(|v| !v.is_finite()) || x < 0.0 || y < 0.0 || width < 1.0 || height < 1.0 || x + width > 20000.0 || y + height > 20000.0 { return Err("Invalid video surface bounds.".into()); }
    Ok(())
}

pub fn resize(app: &tauri::AppHandle, host: usize, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    validate(x, y, width, height)?;
    let scale = app.get_webview_window("main").ok_or("Window unavailable.")?.scale_factor().map_err(|_| "Scale unavailable.")?;
    app.run_on_main_thread(move || unsafe { SetWindowPos(host as _, HWND_TOP, (x * scale) as i32, (y * scale) as i32, (width * scale) as i32, (height * scale) as i32, SWP_NOACTIVATE | SWP_SHOWWINDOW); }).map_err(|_| "Could not resize video.".into())
}

pub fn hide(app: &tauri::AppHandle, host: usize) { let _ = app.run_on_main_thread(move || unsafe { ShowWindow(host as _, SW_HIDE); }); }
pub fn destroy(app: &tauri::AppHandle, host: usize) { let _ = app.run_on_main_thread(move || unsafe { DestroyWindow(host as _); }); }

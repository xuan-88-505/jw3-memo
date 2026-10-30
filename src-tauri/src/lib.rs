//! 备忘录（JW3 Memo）桌面版。
//!
//! 两个窗口加载同一个前端页面，前端按窗口 label 选择界面：
//! - `panel`：托盘 / 菜单栏弹出的面板，无边框，失去焦点时收起（置顶后不收起）。
//! - `manager`：管理窗口，系统原生标题栏；点关闭只隐藏，软件留在托盘。
//!
//! 数据存成应用数据目录下的一个 `data.json`，由前端整体读写。
//! 一个窗口保存后，通知另一个窗口重新读取。

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, Theme, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};

const PANEL: &str = "panel";
const MANAGER: &str = "manager";
const TRAY_ID: &str = "main";
/// 面板尺寸（逻辑像素），和前端的 360 × 500 一致
const PANEL_W: f64 = 360.0;
const PANEL_H: f64 = 500.0;

#[derive(Default)]
struct Panel {
    pinned: bool,
    /// 托盘图标的位置和大小（物理像素）
    tray: Option<(f64, f64, f64, f64)>,
    /// 用户拖到的位置；None 表示跟着托盘
    custom: Option<(i32, i32)>,
    /// 程序最近一次摆放的位置，用来区分"用户拖动"和"程序摆放"
    placed: Option<(i32, i32)>,
    /// 因为失去焦点而收起的时间。点托盘图标时面板会先失去焦点，
    /// 这时不能马上又打开。
    blurred_at: Option<Instant>,
}

struct AppState(Mutex<Panel>);

#[derive(Serialize, Deserialize)]
struct SavedPos {
    x: i32,
    y: i32,
}

// ---------- 文件 ----------

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 先写临时文件再改名，写到一半断电也不会损坏原文件
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn pos_file(app: &AppHandle) -> Option<PathBuf> {
    data_dir(app).ok().map(|d| d.join("panel-position.json"))
}

fn read_saved_pos(app: &AppHandle) -> Option<(i32, i32)> {
    let raw = fs::read_to_string(pos_file(app)?).ok()?;
    let p: SavedPos = serde_json::from_str(&raw).ok()?;
    Some((p.x, p.y))
}

fn write_saved_pos(app: &AppHandle, pos: Option<(i32, i32)>) {
    let Some(path) = pos_file(app) else { return };
    match pos {
        Some((x, y)) => {
            if let Ok(json) = serde_json::to_string(&SavedPos { x, y }) {
                let _ = write_atomic(&path, &json);
            }
        }
        None => {
            let _ = fs::remove_file(path);
        }
    }
}

// ---------- 面板 ----------

fn panel_state(app: &AppHandle) -> std::sync::MutexGuard<'_, Panel> {
    app.state::<AppState>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// 托盘旁的默认位置：Windows 在任务栏上方，Mac 在菜单栏下方。
fn default_pos(app: &AppHandle, tray: Option<(f64, f64, f64, f64)>) -> (i32, i32) {
    let monitor = tray
        .and_then(|(x, y, _, _)| app.monitor_from_point(x, y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return (100, 100) };
    let scale = m.scale_factor();
    let px = |v: f64| (v * scale).round() as i32;
    let (pw, ph) = (px(PANEL_W), px(PANEL_H));
    let area = m.work_area();
    let (ax, ay) = (area.position.x, area.position.y);
    let (aw, ah) = (area.size.width as i32, area.size.height as i32);
    let gap = px(8.0);
    let min_x = ax + gap;
    let max_x = (ax + aw - pw - gap).max(min_x);
    let x = tray
        .map(|(tx, _, tw, _)| (tx + tw / 2.0).round() as i32 - pw / 2)
        .unwrap_or(ax + aw - pw - px(12.0))
        .clamp(min_x, max_x);
    let y = if cfg!(target_os = "macos") {
        ay + px(6.0)
    } else {
        (ay + ah - ph - px(12.0)).max(ay)
    };
    (x, y)
}

/// 记下的位置还在某个屏幕里才用（换了显示器或分辨率后回到托盘旁）
fn on_screen(app: &AppHandle, (x, y): (i32, i32)) -> bool {
    app.available_monitors()
        .map(|list| {
            list.iter().any(|m| {
                let p = m.position();
                let s = m.size();
                let (cx, cy) = (x + 40, y + 20);
                cx >= p.x
                    && cy >= p.y
                    && cx < p.x + s.width as i32
                    && cy < p.y + s.height as i32
            })
        })
        .unwrap_or(false)
}

fn place_panel(app: &AppHandle, w: &WebviewWindow) {
    let (custom, tray) = {
        let p = panel_state(app);
        (p.custom, p.tray)
    };
    let pos = match custom {
        Some(c) if on_screen(app, c) => c,
        _ => default_pos(app, tray),
    };
    panel_state(app).placed = Some(pos);
    let _ = w.set_position(PhysicalPosition::new(pos.0, pos.1));
}

fn show_panel(app: &AppHandle) {
    let Some(w) = app.get_webview_window(PANEL) else { return };
    place_panel(app, &w);
    let _ = w.show();
    let _ = w.set_focus();
    let _ = w.emit("tongdiao://panel-shown", ());
}

fn hide_panel_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(PANEL) {
        let _ = w.hide();
    }
    let custom = panel_state(app).custom;
    write_saved_pos(app, custom);
}

fn toggle(app: &AppHandle, from_tray: bool) {
    let Some(w) = app.get_webview_window(PANEL) else { return };
    if w.is_visible().unwrap_or(false) {
        hide_panel_window(app);
        return;
    }
    if from_tray {
        let just_blurred = panel_state(app)
            .blurred_at
            .is_some_and(|t| t.elapsed() < Duration::from_millis(300));
        if just_blurred {
            return;
        }
    }
    show_panel(app);
}

fn show_manager(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MANAGER) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------- 前端调用的命令 ----------

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join("data.json");
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_data(app: AppHandle, window: Window, json: String) -> Result<(), String> {
    let path = data_dir(&app)?.join("data.json");
    write_atomic(&path, &json)?;
    // 告诉另一个窗口重新读取；payload 是保存的窗口，它自己会忽略
    let _ = app.emit("tongdiao://data-changed", window.label().to_string());
    Ok(())
}

/// data.json 读不出来时改名留作备份，避免被空数据覆盖。返回备份的文件名。
/// 两个窗口可能同时发现，后到的那个找不到文件，不算出错。
#[tauri::command]
fn backup_data(app: AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let name = format!("data.broken-{stamp}.json");
    match fs::rename(dir.join("data.json"), dir.join(&name)) {
        Ok(()) => Ok(Some(name)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 导出数据：路径由前端的保存对话框选出
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_panel(app: AppHandle) {
    toggle(&app, false);
}

#[tauri::command]
fn hide_panel(app: AppHandle) {
    hide_panel_window(&app);
}

#[tauri::command]
fn set_pinned(app: AppHandle, pinned: bool) {
    panel_state(&app).pinned = pinned;
}

#[tauri::command]
fn reset_panel_position(app: AppHandle) {
    panel_state(&app).custom = None;
    write_saved_pos(&app, None);
    if let Some(w) = app.get_webview_window(PANEL) {
        place_panel(&app, &w);
    }
}

/// 面板上点了"打开管理窗口"之类的入口：显示管理窗口，并把要打开的页面转过去
#[tauri::command]
fn open_manager(app: AppHandle, req: serde_json::Value) {
    show_manager(&app);
    let _ = app.emit_to(
        EventTarget::webview_window(MANAGER),
        "tongdiao://open-manager",
        req,
    );
}

/// 托盘提示：Windows 显示在悬停提示里，Mac 显示在菜单栏图标旁边
#[tauri::command]
fn set_tray_badge(app: AppHandle, count: u32) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    let tip = if count > 0 {
        format!("备忘录 · {count} 条更新")
    } else {
        "备忘录".to_string()
    };
    let _ = tray.set_tooltip(Some(tip));
    #[cfg(target_os = "macos")]
    {
        let title = (count > 0).then(|| count.to_string());
        let _ = tray.set_title(title);
    }
}

// ---------- 启动 ----------

fn create_windows(app: &tauri::App) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, MANAGER, WebviewUrl::App("index.html".into()))
        .title("备忘录")
        .inner_size(1180.0, 760.0)
        .min_inner_size(960.0, 640.0)
        .center()
        .visible(false)
        .theme(Some(Theme::Dark))
        .build()?;

    let panel = WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("index.html".into()))
        .title("备忘录")
        .inner_size(PANEL_W, PANEL_H)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(true)
        .visible(false)
        .focused(false)
        .theme(Some(Theme::Dark));
    // Mac 上窗口透明，圆角由页面画；Windows 11 的无边框窗口由系统画圆角
    #[cfg(target_os = "macos")]
    let panel = panel.transparent(true).visible_on_all_workspaces(true);
    panel.build()?;
    Ok(())
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开备忘录", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &sep, &quit])?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip("备忘录")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_manager(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle();
                let p = rect.position.to_physical::<f64>(1.0);
                let s = rect.size.to_physical::<f64>(1.0);
                panel_state(app).tray = Some((p.x, p.y, s.width, s.height));
                toggle(app, true);
            }
        })
        .build(app)?;
    Ok(())
}

fn on_window_event(window: &Window, event: &WindowEvent) {
    let app = window.app_handle();
    match (window.label(), event) {
        // 管理窗口：点关闭只隐藏
        (MANAGER, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            let _ = window.hide();
        }
        // 面板：失去焦点时收起，置顶后不收起
        (PANEL, WindowEvent::Focused(false)) => {
            let pinned = panel_state(app).pinned;
            if !pinned && window.is_visible().unwrap_or(false) {
                panel_state(app).blurred_at = Some(Instant::now());
                hide_panel_window(app);
            }
        }
        // 面板：用户拖动后记住位置（和程序摆放的位置差 2 像素以内不算拖动）
        (PANEL, WindowEvent::Moved(pos)) => {
            if !window.is_visible().unwrap_or(false) {
                return;
            }
            let mut p = panel_state(app);
            let placed = p
                .placed
                .is_some_and(|(x, y)| (x - pos.x).abs() <= 2 && (y - pos.y).abs() <= 2);
            if !placed {
                p.custom = Some((pos.x, pos.y));
                p.placed = Some((pos.x, pos.y));
            }
        }
        (PANEL, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            hide_panel_window(app);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // 只允许运行一个：再次打开时显示管理窗口
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_manager(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(AppState(Mutex::new(Panel::default())))
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            backup_data,
            write_text_file,
            toggle_panel,
            hide_panel,
            set_pinned,
            reset_panel_position,
            open_manager,
            set_tray_badge,
        ])
        .on_window_event(on_window_event)
        .setup(|app| {
            let handle = app.handle().clone();
            let saved = read_saved_pos(&handle);
            panel_state(&handle).custom = saved;
            create_windows(app)?;
            build_tray(app)?;
            // 开机自启时带 --hidden，只留在托盘
            if !std::env::args().any(|a| a == "--hidden") {
                show_manager(&handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("备忘录启动失败");

    app.run(|app, event| {
        // Mac：点 Dock 图标时重新打开管理窗口
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_manager(app);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}

//! 备忘录（JW3 Memo）桌面版。
//!
//! 两个窗口加载同一个前端页面，前端按窗口 label 选择界面：
//! - `panel`：托盘 / 菜单栏弹出的面板，无边框，失去焦点时收起（置顶后不收起）。
//! - `manager`：管理窗口，系统原生标题栏；点关闭只隐藏，软件留在托盘。
//!
//! 数据存成应用数据目录下的一个 `data.json`，由前端整体读写。
//! 一个窗口保存后，通知另一个窗口重新读取。

mod tray_motion;

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
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, PhysicalPosition,
    Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};
use tray_motion::TrayMotion;

const PANEL: &str = "panel";
const MANAGER: &str = "manager";
const TRAY_ID: &str = "main";
/// 托盘图标：黄鸡大笑静态图，和动图第 1 帧一样；动图第 2 帧见 tray_motion.rs
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");
const TRAY_ICON_ANIM: &[u8] = include_bytes!("../icons/tray-anim.png");
/// 面板默认尺寸（逻辑像素），和前端 client/src/lib/panelSize.ts 一致
const PANEL_W: f64 = 360.0;
const PANEL_H: f64 = 500.0;
/// 面板能缩到的最小尺寸、能拉到的最大尺寸（逻辑像素），和前端一致
const PANEL_MIN_W: f64 = 300.0;
const PANEL_MIN_H: f64 = 380.0;
const PANEL_MAX_W: f64 = 600.0;
const PANEL_MAX_H: f64 = 1000.0;

fn clamp_size((w, h): (f64, f64)) -> (f64, f64) {
    (
        w.clamp(PANEL_MIN_W, PANEL_MAX_W).round(),
        h.clamp(PANEL_MIN_H, PANEL_MAX_H).round(),
    )
}

#[derive(Default)]
struct Panel {
    pinned: bool,
    /// 托盘图标的位置和大小（物理像素）
    tray: Option<(f64, f64, f64, f64)>,
    /// 用户拖到的位置；None 表示跟着托盘
    custom: Option<(i32, i32)>,
    /// 用户调过的大小（逻辑像素）；None 表示默认大小
    size: Option<(f64, f64)>,
    /// 程序最近一次摆放的位置，用来区分"用户拖动"和"程序摆放"
    placed: Option<(i32, i32)>,
    /// 因为失去焦点而收起的时间。点托盘图标时面板会先失去焦点，
    /// 这时不能马上又打开。
    blurred_at: Option<Instant>,
}

struct AppState(Mutex<Panel>);

/// 记在 panel-position.json 里的面板位置和大小。
/// 旧版本只有 x、y；没调过大小时不写 w、h。
#[derive(Serialize, Deserialize, Default)]
struct SavedPanel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    x: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    y: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    w: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    h: Option<f64>,
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

/// 读记下的位置和大小；文件不存在或格式不对时都当作没有
fn read_saved(app: &AppHandle) -> (Option<(i32, i32)>, Option<(f64, f64)>) {
    let saved = pos_file(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str::<SavedPanel>(&raw).ok())
        .unwrap_or_default();
    let pos = saved.x.zip(saved.y);
    let size = saved.w.zip(saved.h).map(clamp_size);
    (pos, size)
}

/// 位置和大小都是默认时删掉文件
fn write_saved(app: &AppHandle, pos: Option<(i32, i32)>, size: Option<(f64, f64)>) {
    let Some(path) = pos_file(app) else { return };
    if pos.is_none() && size.is_none() {
        let _ = fs::remove_file(path);
        return;
    }
    let saved = SavedPanel {
        x: pos.map(|p| p.0),
        y: pos.map(|p| p.1),
        w: size.map(|s| s.0),
        h: size.map(|s| s.1),
    };
    if let Ok(json) = serde_json::to_string(&saved) {
        let _ = write_atomic(&path, &json);
    }
}

/// 把内存里的位置和大小写到文件
fn save_panel_layout(app: &AppHandle) {
    let (custom, size) = {
        let p = panel_state(app);
        (p.custom, p.size)
    };
    write_saved(app, custom, size);
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
/// `size` 是面板的逻辑尺寸，按目标屏幕的缩放换成物理像素。
fn default_pos(
    app: &AppHandle,
    tray: Option<(f64, f64, f64, f64)>,
    size: (f64, f64),
) -> (i32, i32) {
    let monitor = tray
        .and_then(|(x, y, _, _)| app.monitor_from_point(x, y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return (100, 100) };
    let scale = m.scale_factor();
    let px = |v: f64| (v * scale).round() as i32;
    let (pw, ph) = (px(size.0), px(size.1));
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
                cx >= p.x && cy >= p.y && cx < p.x + s.width as i32 && cy < p.y + s.height as i32
            })
        })
        .unwrap_or(false)
}

/// 面板当前的逻辑尺寸；读不到时用记下的或默认的
fn panel_size(app: &AppHandle, w: &WebviewWindow) -> (f64, f64) {
    let actual = w
        .inner_size()
        .ok()
        .zip(w.scale_factor().ok())
        .map(|(s, f)| {
            let l = s.to_logical::<f64>(f);
            (l.width, l.height)
        });
    actual
        .or(panel_state(app).size)
        .unwrap_or((PANEL_W, PANEL_H))
}

/// `size`：刚改了大小、窗口可能还没变过来时，按这个尺寸算默认位置
fn place_panel(app: &AppHandle, w: &WebviewWindow, size: Option<(f64, f64)>) {
    let (custom, tray) = {
        let p = panel_state(app);
        (p.custom, p.tray)
    };
    let pos = match custom {
        Some(c) if on_screen(app, c) => c,
        _ => default_pos(app, tray, size.unwrap_or_else(|| panel_size(app, w))),
    };
    panel_state(app).placed = Some(pos);
    let _ = w.set_position(PhysicalPosition::new(pos.0, pos.1));
}

fn show_panel(app: &AppHandle) {
    let Some(w) = app.get_webview_window(PANEL) else {
        return;
    };
    place_panel(app, &w, None);
    let _ = w.show();
    let _ = w.set_focus();
    let _ = w.emit("tongdiao://panel-shown", ());
}

fn hide_panel_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(PANEL) {
        let _ = w.hide();
    }
    save_panel_layout(app);
}

fn toggle(app: &AppHandle, from_tray: bool) {
    let Some(w) = app.get_webview_window(PANEL) else {
        return;
    };
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

/// 两个窗口的保存命令排队执行：检查文件内容和写入之间不会插进另一次写入
static DATA_LOCK: Mutex<()> = Mutex::new(());

/// expected 是窗口合并时读到的文件内容（没有文件时为空字符串）。
/// 文件已经被另一个窗口改了：返回 "conflict"，窗口重新读、合并后再写。None 时直接写。
/// 调用方要先拿 DATA_LOCK。
fn write_if_unchanged(path: &Path, json: &str, expected: Option<&str>) -> Result<(), String> {
    if let Some(expected) = expected {
        let current = match fs::read_to_string(path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(e) => return Err(e.to_string()),
        };
        if current != expected {
            return Err("conflict".into());
        }
    }
    write_atomic(path, json)
}

#[tauri::command]
fn save_data(
    app: AppHandle,
    window: Window,
    json: String,
    expected: Option<String>,
) -> Result<(), String> {
    let path = data_dir(&app)?.join("data.json");
    {
        let _guard = DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        write_if_unchanged(&path, &json, expected.as_deref())?;
    }
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

/// 加入、登录、退出亲友团之前复制一份 data.json。原文件不动。
/// 文件名 data.backup-<毫秒>.json，只留最新 5 份。返回备份的文件名；没有数据文件时返回 None。
#[tauri::command]
fn copy_data_backup(app: AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    let src = dir.join("data.json");
    if !src.exists() {
        return Ok(None);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let name = format!("data.backup-{stamp}.json");
    fs::copy(&src, dir.join(&name)).map_err(|e| e.to_string())?;
    let mut old: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with("data.backup-") && n.ends_with(".json"))
        .collect();
    // 时间戳位数相同，按名字排序就是按时间排序
    old.sort();
    let extra = old.len().saturating_sub(5);
    for n in old.into_iter().take(extra) {
        let _ = fs::remove_file(dir.join(n));
    }
    Ok(Some(name))
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

/// 回到托盘旁。`size` 为 true 时大小也回到默认（设置里的「恢复默认」）；
/// 双击面板顶部只回位置，不改大小。
#[tauri::command]
fn reset_panel_position(app: AppHandle, size: Option<bool>) {
    let reset_size = size.unwrap_or(false);
    {
        let mut p = panel_state(&app);
        p.custom = None;
        if reset_size {
            p.size = None;
        }
    }
    save_panel_layout(&app);
    if let Some(w) = app.get_webview_window(PANEL) {
        if reset_size {
            let _ = w.set_size(LogicalSize::new(PANEL_W, PANEL_H));
            place_panel(&app, &w, Some((PANEL_W, PANEL_H)));
        } else {
            place_panel(&app, &w, None);
        }
    }
}

/// 面板窗口的位置和大小（逻辑像素）：[x, y, 宽, 高]。Mac 拖边缘调大小时用
#[tauri::command]
fn get_panel_rect(app: AppHandle) -> Option<[f64; 4]> {
    let w = app.get_webview_window(PANEL)?;
    let f = w.scale_factor().ok()?;
    let pos = w.outer_position().ok()?.to_logical::<f64>(f);
    let size = w.inner_size().ok()?.to_logical::<f64>(f);
    Some([pos.x, pos.y, size.width, size.height])
}

/// Mac 拖面板边缘调大小。Mac 的无边框窗口不支持系统的拖边缘缩放，
/// 由页面算出新的位置和大小再交给这里（逻辑像素）。
/// `moved`：拖的是左边或上边，位置也要跟着变。
#[tauri::command]
fn set_panel_rect(app: AppHandle, x: f64, y: f64, w: f64, h: f64, moved: bool) {
    let Some(win) = app.get_webview_window(PANEL) else {
        return;
    };
    let (w, h) = clamp_size((w, h));
    if moved {
        let _ = win.set_position(LogicalPosition::new(x, y));
    }
    let _ = win.set_size(LogicalSize::new(w, h));
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

/// 托盘提示：Windows 显示在悬停提示里，Mac 显示在菜单栏图标旁边。
/// `tip` 由页面按界面语言给出；旧页面没传时用中文。
/// 更新条数变多时，托盘黄鸡动 3 秒（「悬停时」模式）。
#[tauri::command]
fn set_tray_badge(app: AppHandle, count: u32, tip: Option<String>) {
    app.state::<TrayMotion>()
        .update(|m, now| m.on_count(count, now));
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let tip = tip.unwrap_or_else(|| {
        if count > 0 {
            format!("备忘录 · {count} 条更新")
        } else {
            "备忘录".to_string()
        }
    });
    let _ = tray.set_tooltip(Some(tip));
    #[cfg(target_os = "macos")]
    {
        let title = (count > 0).then(|| count.to_string());
        let _ = tray.set_title(title);
    }
}

/// 托盘黄鸡动效：hover（悬停时）/ always（一直动）/ off（不动）
#[tauri::command]
fn set_tray_motion(app: AppHandle, mode: String) -> Result<(), String> {
    let mode = tray_motion::Mode::parse(&mode).ok_or_else(|| format!("未知的动效模式：{mode}"))?;
    app.state::<TrayMotion>().update(|m, _| m.set_mode(mode));
    Ok(())
}

/// 托盘右键菜单。菜单项 id 不变，换语言时只换文字
fn tray_menu<M: Manager<tauri::Wry>>(
    app: &M,
    open: &str,
    quit: &str,
) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &sep, &quit])
}

/// 界面语言变了：托盘菜单和窗口标题跟着换
#[tauri::command]
fn set_ui_texts(app: AppHandle, title: String, open: String, quit: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = tray_menu(&app, &open, &quit).map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    for label in [MANAGER, PANEL] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_title(&title);
        }
    }
    Ok(())
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

    // 用户调过大小时按记下的大小打开
    let (pw, ph) = panel_state(app.handle()).size.unwrap_or((PANEL_W, PANEL_H));
    let panel = WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("index.html".into()))
        .title("备忘录")
        .inner_size(pw, ph)
        // 可以拖边缘调大小。Windows 的无边框窗口由 Tauri 提供拖边缘缩放；
        // Mac 不支持，由页面处理（见 set_panel_rect）
        .resizable(true)
        .min_inner_size(PANEL_MIN_W, PANEL_MIN_H)
        .max_inner_size(PANEL_MAX_W, PANEL_MAX_H)
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
    let menu = tray_menu(app, "打开备忘录", "退出")?;
    let still = Image::from_bytes(TRAY_ICON)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(still.clone())
        .tooltip("备忘录")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_manager(app),
            "quit" => {
                // 面板开着时直接退出，也要记下位置和大小
                save_panel_layout(app);
                app.exit(0)
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            // 鼠标移上去、移开：黄鸡动或停（Windows、macOS 才有这两个事件）
            TrayIconEvent::Enter { .. } => tray
                .app_handle()
                .state::<TrayMotion>()
                .update(|m, _| m.set_hovering(true)),
            TrayIconEvent::Leave { .. } => tray
                .app_handle()
                .state::<TrayMotion>()
                .update(|m, _| m.set_hovering(false)),
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } => {
                let app = tray.app_handle();
                let p = rect.position.to_physical::<f64>(1.0);
                let s = rect.size.to_physical::<f64>(1.0);
                panel_state(app).tray = Some((p.x, p.y, s.width, s.height));
                toggle(app, true);
            }
            _ => {}
        })
        .build(app)?;
    tray_motion::spawn(
        app.handle().clone(),
        TRAY_ID,
        [still, Image::from_bytes(TRAY_ICON_ANIM)?],
    );
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
        // 面板：用户调大小后记住（逻辑像素；换到缩放不同的屏幕时逻辑尺寸不变）
        (PANEL, WindowEvent::Resized(size)) => {
            if !window.is_visible().unwrap_or(false) {
                return;
            }
            if let Ok(f) = window.scale_factor() {
                let l = size.to_logical::<f64>(f);
                if l.width > 0.0 && l.height > 0.0 {
                    panel_state(app).size = Some(clamp_size((l.width, l.height)));
                }
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
        .manage(TrayMotion::default())
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            backup_data,
            copy_data_backup,
            write_text_file,
            toggle_panel,
            hide_panel,
            set_pinned,
            reset_panel_position,
            get_panel_rect,
            set_panel_rect,
            open_manager,
            set_tray_badge,
            set_tray_motion,
            set_ui_texts,
        ])
        .on_window_event(on_window_event)
        .setup(|app| {
            let handle = app.handle().clone();
            let (pos, size) = read_saved(&handle);
            {
                let mut p = panel_state(&handle);
                p.custom = pos;
                p.size = size;
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_if_unchanged_detects_other_window() {
        let dir = std::env::temp_dir().join(format!("tongdiao-cas-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("data.json");
        let _ = fs::remove_file(&path);
        // 没有文件：期望空字符串才写
        write_if_unchanged(&path, "a", Some("")).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "a");
        // 另一个窗口写成了 b，本窗口还以为是 a：冲突，不写
        write_if_unchanged(&path, "b", Some("a")).unwrap();
        assert_eq!(
            write_if_unchanged(&path, "c", Some("a")),
            Err("conflict".to_string())
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "b");
        // 不比较：直接写
        write_if_unchanged(&path, "d", None).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "d");
        let _ = fs::remove_dir_all(&dir);
    }
}

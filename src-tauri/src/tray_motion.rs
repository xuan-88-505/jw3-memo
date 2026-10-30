//! 托盘黄鸡动效：游戏原版「萌鸡 · 大笑」动图（`client/public/huangji/hj-101.gif`），
//! 2 帧，每帧 150 ms。第 1 帧就是静态托盘图标 `icons/tray.png`，第 2 帧是
//! `icons/tray-anim.png`，两张都是原图按最近邻放大 2 倍、四周留 2 像素。
//!
//! 三种模式和设置页「托盘表情动效」一致：
//! - 悬停时（默认）：鼠标在托盘图标上时动；更新条数变多时动 3 秒。
//! - 一直动。
//! - 不动。系统开了「减少动态效果」时，页面也会传「不动」。
//!
//! 悬停靠托盘的 Enter / Leave 事件，Windows 和 macOS 会发，Linux 不发。
//! 不动的时候后台线程一直睡，不占 CPU。
use std::{
    sync::{Condvar, Mutex},
    time::{Duration, Instant},
};

use tauri::{image::Image, AppHandle, Manager};

/// 每帧时长，和原版 GIF 一致
pub const FRAME: Duration = Duration::from_millis(150);
/// 更新条数变多时动多久
pub const ALERT: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Mode {
    #[default]
    Hover,
    Always,
    Off,
}

impl Mode {
    /// 页面传来的值：hover / always / off
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "hover" => Some(Self::Hover),
            "always" => Some(Self::Always),
            "off" => Some(Self::Off),
            _ => None,
        }
    }
}

/// 要不要动：只看状态，不碰托盘，方便测试
#[derive(Debug, Default)]
pub struct Motion {
    mode: Mode,
    hovering: bool,
    alert_until: Option<Instant>,
    /// 上一次的更新条数；None 表示还没收到过
    last_count: Option<u32>,
}

impl Motion {
    pub fn animating(&self, now: Instant) -> bool {
        match self.mode {
            Mode::Always => true,
            Mode::Off => false,
            Mode::Hover => self.hovering || self.alert_until.is_some_and(|t| now < t),
        }
    }

    pub fn set_mode(&mut self, mode: Mode) {
        self.mode = mode;
        if mode == Mode::Off {
            self.alert_until = None;
        }
    }

    pub fn set_hovering(&mut self, on: bool) {
        self.hovering = on;
    }

    /// 更新条数变多时动 3 秒。第一次只记下条数：启动时读到的条数不算"变多"
    pub fn on_count(&mut self, count: u32, now: Instant) {
        let grew = self.last_count.is_some_and(|c| count > c);
        if grew && self.mode != Mode::Off {
            self.alert_until = Some(now + ALERT);
        }
        self.last_count = Some(count);
    }
}

/// 放进 Tauri 的共享状态：状态变了就叫醒后台线程
#[derive(Default)]
pub struct TrayMotion {
    state: Mutex<Motion>,
    wake: Condvar,
}

impl TrayMotion {
    pub fn update(&self, f: impl FnOnce(&mut Motion, Instant)) {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut s, Instant::now());
        self.wake.notify_all();
    }
}

/// 启动后台线程。`frames[0]` 必须和当前托盘图标一样（静态图）
pub fn spawn(app: AppHandle, tray_id: &'static str, frames: [Image<'static>; 2]) {
    let _ = std::thread::Builder::new()
        .name("tray-motion".into())
        .spawn(move || run(app, tray_id, frames));
}

fn run(app: AppHandle, tray_id: &'static str, frames: [Image<'static>; 2]) {
    let motion = app.state::<TrayMotion>();
    let mut frame = 0usize;
    let mut moving = false;
    loop {
        let on = {
            let mut s = motion.state.lock().unwrap_or_else(|e| e.into_inner());
            // 已经停在静态图上：睡到模式、悬停或更新条数有变化
            while !moving && !s.animating(Instant::now()) {
                s = motion.wake.wait(s).unwrap_or_else(|e| e.into_inner());
            }
            s.animating(Instant::now())
        };
        let Some(tray) = app.tray_by_id(tray_id) else {
            std::thread::sleep(FRAME);
            continue;
        };
        if on {
            // 先换到第 2 帧，鼠标一移上去马上就有变化
            frame = (frame + 1) % frames.len();
            let _ = tray.set_icon(Some(frames[frame].clone()));
            moving = true;
            std::thread::sleep(FRAME);
        } else {
            // 停下时回到静态图
            if frame != 0 {
                let _ = tray.set_icon(Some(frames[0].clone()));
            }
            frame = 0;
            moving = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_modes() {
        assert_eq!(Mode::parse("hover"), Some(Mode::Hover));
        assert_eq!(Mode::parse("always"), Some(Mode::Always));
        assert_eq!(Mode::parse("off"), Some(Mode::Off));
        assert_eq!(Mode::parse("spin"), None);
    }

    #[test]
    fn hover_mode_moves_only_while_hovering() {
        let now = Instant::now();
        let mut m = Motion::default();
        assert!(!m.animating(now));
        m.set_hovering(true);
        assert!(m.animating(now));
        m.set_hovering(false);
        assert!(!m.animating(now));
    }

    #[test]
    fn first_count_is_baseline_not_alert() {
        let now = Instant::now();
        let mut m = Motion::default();
        m.on_count(5, now);
        assert!(!m.animating(now));
    }

    #[test]
    fn count_growth_moves_for_three_seconds() {
        let now = Instant::now();
        let mut m = Motion::default();
        m.on_count(1, now);
        m.on_count(2, now);
        assert!(m.animating(now));
        assert!(m.animating(now + ALERT - Duration::from_millis(1)));
        assert!(!m.animating(now + ALERT));
    }

    #[test]
    fn count_drop_or_same_does_not_alert() {
        let now = Instant::now();
        let mut m = Motion::default();
        m.on_count(3, now);
        m.on_count(3, now);
        m.on_count(1, now);
        assert!(!m.animating(now));
    }

    #[test]
    fn off_never_moves_and_clears_alert() {
        let now = Instant::now();
        let mut m = Motion::default();
        m.on_count(1, now);
        m.on_count(2, now);
        m.set_mode(Mode::Off);
        m.set_hovering(true);
        assert!(!m.animating(now));
        m.on_count(9, now);
        assert!(!m.animating(now));
        // 切回悬停时：之前的提醒已清掉，只看鼠标
        m.set_mode(Mode::Hover);
        m.set_hovering(false);
        assert!(!m.animating(now));
    }

    #[test]
    fn always_moves_without_hover() {
        let now = Instant::now();
        let mut m = Motion::default();
        m.set_mode(Mode::Always);
        assert!(m.animating(now));
    }
}

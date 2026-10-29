# 同调

剑网3（旗舰端）宏和奇穴的统一管理工具，支持 Windows 和 Mac。

同调待在系统托盘（Windows 任务栏右下角）或菜单栏（Mac 屏幕顶部）里。点图标或按快捷键打开面板，查看当前角色的宏和奇穴，一键复制宏。同调不读写游戏文件，不模拟按键，不需要登录。

## 下载

到 [Releases](https://github.com/xuan-88-505/tongdiao/releases) 下载最新版本：

| 系统 | 下载这个文件 |
| --- | --- |
| Windows 10 / 11 | `Tongdiao_*_windows_x64-setup.exe` |
| Mac（M 芯片和 Intel 芯片都可以） | `Tongdiao_*_macos_universal.dmg` |

## 第一次打开

同调没有购买签名证书，系统第一次会拦一下。放行一次以后就不会再拦。

**Windows**：出现「Windows 已保护你的电脑」时，点「更多信息」，再点「仍要运行」。

**Mac**：打开 dmg，把「同调」拖进「应用程序」。第一次打开被拦住时，到「系统设置 → 隐私与安全性」，在页面下方点「仍要打开」。

## 使用

| 操作 | Windows | Mac |
| --- | --- | --- |
| 打开或收起面板 | 点托盘图标，或按 `Ctrl+Alt+Q` | 点菜单栏图标，或按 `⌃⌥Q` |
| 打开管理窗口 | 面板右上角的窗口图标，或右键托盘图标 | 面板右上角的窗口图标 |
| 移动面板 | 按住面板顶部拖动，双击顶部回到原位 | 同左 |
| 面板不自动收起 | 点面板上的图钉 | 同左 |

快捷键可以在「设置」里改。如果和游戏里的按键冲突，换一个组合即可。

## 数据

1.0 是单机版，数据只存在当前这台电脑上：

- Windows：`%APPDATA%\com.xuan88.tongdiao\data.json`
- Mac：`~/Library/Application Support/com.xuan88.tongdiao/data.json`

要在另一台电脑上使用，在「设置 → 数据」里导出，再到另一台电脑上导入。导入会替换那台电脑上原有的数据。

1.0 还没有亲友团协作，以后的版本再加。

## 开发

前端是 React + Vite + TypeScript，桌面壳是 Tauri 2（`src-tauri/`）。

- `pnpm dev:static`：只跑网页原型，浏览器打开 `http://localhost:3000`。
- `pnpm tauri dev`：以桌面应用运行。
- `pnpm tauri build`：在本机打包。
- 推送 `v` 开头的标签（如 `v1.0.1`）后，GitHub Actions 会在 Windows 和 Mac 上打包，并发布到 Releases。版本号在 `src-tauri/tauri.conf.json` 里改。

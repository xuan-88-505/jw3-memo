# 发版和一键更新

GitHub Actions 只负责打包。签名和生成 `latest.json` 在本地做，因为私钥不能放进 Actions、仓库或服务器。

## 密钥

- 私钥：`~/.tauri/jw3memo.key`（有密码）。密码：`~/.tauri/jw3memo.password`。两个文件的权限都是 600。
- 备份：Manus 项目共享文件「JW3-Memo-更新签名密钥（勿删勿外传）.txt」。换电脑时，从备份恢复这两个文件。
- 公钥：`src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。客户端只装这把密钥签过的包。
- 如果私钥丢了，已经装好的客户端就收不到新版。只能换一把新密钥，大家再手动装一次新版。

## 每次发版

1. 改版本号：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`，再运行 `cargo check` 更新 `Cargo.lock`。`pnpm test` 会检查这四处是否一致。
2. 先发布网站。客户端第一个更新地址是我们的服务器（`/api/update/...`）。如果服务器还没有这个路由，它会返回 200 的网页。插件读到网页会报错，而且不会再试 GitHub 的备用地址。
3. 提交并推送，打 `vX.Y.Z` 标签，等 Actions 在 Windows 和 Mac 上打完包。
4. 写更新内容文件（Markdown）。`## 标题` 显示成小标题，`- ` 开头的行显示成列表。然后运行：

   ```sh
   node tools/release/publish-update.mjs --tag vX.Y.Z --notes notes.md
   ```

   脚本会下载更新包（Windows 一个，Mac 两种芯片各一个）并签名，签名里写入版本号。然后用公钥验证签名，确认服务器的检查更新接口返回 JSON，最后把 `latest.json` 和各个 `.sig` 上传到这个 Release。先加 `--dry-run` 可以只生成、不上传。

5. 检查：`curl https://tongdiao-k5ujnxu8.manus.space/api/update/windows/x86_64/<旧版本号>` 应该返回 200 和新版本的 JSON。服务器把清单缓存 5 分钟，所以刚上传时可能要等一会儿。

## 其他

- `node tools/release/publish-update.mjs --self-test` 用临时密钥检查签名、验证和服务器探测的规则，不碰真实密钥和 Release。
- `bundle.createUpdaterArtifacts` 保持关闭。打开后，Actions 没有私钥会打包失败。
- Mac：dmg 安装包是 universal（两种芯片都能装）。一键更新从 2.4.0 起用两种芯片各自的 `.app.tar.gz`（Actions 里两个只打 `.app` 的任务，文件名是 `darwin_aarch64` 和 `darwin_x64`），比通用包小一半。脚本找不到单芯片包时，退回用通用包。
- Windows 直接用 `setup.exe`，以 `passive` 模式安装：只显示进度条，不用点下一步。
- 客户端下载更新最多试 3 次：前两次经我们的服务器转发；第三次带 `X-JW3-Download: direct` 请求头重新检查，服务器返回 GitHub 原始地址，改从 GitHub 直接下（`client/src/lib/update/appUpdate.ts`、`server/update.ts`）。

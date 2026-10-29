# 调研要点（含来源）

## 用户已确认
- 剑三旗舰端，不考虑无界；4 个号；亲友一起维护；Windows + Mac（Mac 查看和修改）。
- 外置桌面软件：Windows 托盘图标（任务栏右下角），点击弹出面板，图钉置顶，游戏全屏时用全局快捷键（Alt+Q / Mac ⌥Q）。
- 不买代码签名证书。GitHub 账号：xuan-88-505（连接器已启用，gh 可用）。
- 当前阶段：交互原型（前端 + 示例数据），确认界面后再写正式代码。
- 待决定：登录方式（默认 Manus 账号，亲友需要 Manus 账号）；桌面壳仓库公开/私有。

## 剑三相关事实
- 魔盒云端宏 = 网站存数据 + 茗伊插件同步：https://www.jx3box.com/tool/18152 ，https://www.jx3box.com/tool/14671
- 云端宏导入要求无注释无空行（14671）。
- 2026-08 云端宏同步失败（新宏语法不带 []），需要插件升级：https://origin.jx3box.com/community/6395
- 宏 128 字符上限（官方 2018）：https://jx3.xoyo.com/show-4489-257-1.html ；真实宏 2026-10 全部 ≤128（含换行），说明仍有效。
- 注释无官方语法；常见用 `//` 行写说明：https://www.wz1580.com/886.html
- 游戏有官方"一键切换心法、奇穴、装备"方案：https://www.bilibili.com/video/BV1sM411f7Ak/
- 魔盒数据接口：
  - 奇穴版本列表：https://data.jx3box.com/talent/std/index.json （当前 v20260524 暗影千机）
  - 奇穴数据：https://data.jx3box.com/talent/std/v20260524.json （9 层：1–6 层每层 4 选 1；7–9 层共用 12 个选项池 `_follow: 7`）
  - 宏列表：https://cms.jx3box.com/api/cms/posts?type=macro&per=50&page=1&client=std&subtype=紫霞功 （post_meta.data[].macro / talent.sq）
  - 图标：https://icon.jx3box.com/icon/{id}.png
- 示例数据脚本：/tmp/jx3/extract.py → /tmp/jx3/sample.json → client/src/data/jx3Sample.ts

## 桌面端相关事实
- 置顶窗口在独占全屏下会被盖住，无边框/窗口模式下可显示：https://staged.gg/blog/always-on-top-over-fullscreen-game
- Win11 不支持任务栏工具栏（deskband）：https://learn.microsoft.com/en-us/answers/questions/3877873/win10-toolbars-in-win11
- Tauri 2：alwaysOnTop、global-shortcut 插件、托盘；Linux 交叉编译 Windows NSIS 可行但测试少：https://v2.tauri.app/distribute/windows-installer/
- 网站托管仓库不支持 GitHub Actions（webdev git-canonical 文档），桌面壳要放单独仓库。
- 沙箱无 /dev/kvm，不能跑 Windows 虚拟机。

## 签名证书
- Certum OV 约 1200 元/年，DigiCert OV 约 4400 元/年，常规证书需营业执照：https://www.sohu.com/a/1092731031_120858276
- 微软 Artifact Signing 9.99 美元/月，个人只限美国和加拿大：https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart

## 2026-10-29 补充

- 黄鸡大笑：剑三聊天表情，参考图来自图片搜索（淘宝"剑网3黄鸡大笑挂件"等）。托盘图标是照它重画的矢量版，未使用原图。
- 截图识别奇穴（原型测试，未接入）：用魔盒图标 https://icon.jx3box.com/icon/{id}.png 做模板匹配。用户截的同调奇穴选择器截图里，紫霞功 36 个候选全部定位，相似度最低 0.908、中位数 0.991，无位置冲突。"选中"判断依赖界面样式，游戏内样式未验证；需要用户提供游戏内奇穴界面截图。暴力多尺度搜索耗时 137 秒，正式版需先定尺寸（耗时未验证）。
- 快捷键冲突：用户反馈 Alt+Q 和游戏冲突。默认改为 Ctrl+Alt+Q，可在设置里自定义。被占用示例取自常见软件默认键：QQ 截图 Ctrl+Alt+A、微信截图 Alt+A、QQ 提取消息 Ctrl+Alt+Z、NVIDIA 叠加层 Alt+Z（凭常识整理，未逐一核对官方文档）。
- 截图识别奇穴 第 2 次测试（2026-10-29 15:15 UTC+8）：用户提供铁牢律已选奇穴条截图（/home/ubuntu/upload/pasted_file_pw4BnH_image.png，9 个图标带名字：号令三军、战心、列甲、崩决、疾雨、劲风、定军、力撼河山、振甲）。魔盒当前数据 talent.json（v20260524）铁牢律：第1重 温邑/戈矛/号令三军/力撼河山；第2重 于役/至武/辅国/战心；第3重 反岳/烈雷/昂如岳/坚城；第4重 破阵乐/长征/崩决/镇远；第5重 载戎/守孤城/傲骨/疾雨；第6重 出云/劲风/留侯/千驰；第7–9重共用 12 个：骁勇/龙啸/大漠/定军/击水/仗剑/望西京/崩/掠如火/踏北邙/振甲/岳峙。图标 48×48。结果：9/9 定位，相似度 0.900–0.965；第3个"列甲"被认成"烈雷"(0.901)；力撼河山在当前版本属第1重，截图里在第8位→判为版本不符。耗时：粗估缩放 8.9s + 比对 36 个候选 6.2s（Python + OpenCV，单线程，未优化）。
- 奇穴数据版本（2026-10-29 15:18 UTC+8 查询）：魔盒 https://data.jx3box.com/talent/std/index.json 最新为 v20261029「苍生铸世」，上一版 v20260524「暗影千机」。原型的示例数据来自暗影千机，已经过期。新数据 https://data.jx3box.com/talent/std/v20261029.json 中铁牢律：第1重 温邑/戈矛/号令三军/击水；第3重 反岳/列甲/昂如岳/坚城；第4重 破阵乐/大漠/崩决/镇远；第7–9重 骁勇/龙啸/长征/定军/力撼河山/仗剑/望西京/崩/掠如火/踏北邙/振甲/岳峙。
- 关键发现：图标会跨版本复用。新版"列甲"（破坚阵相关）和旧版"烈雷"（撼如雷相关）用同一个图标 635，效果完全不同。所以识别必须用和截图同版本的奇穴数据；只看图标无法发现版本不一致。同一版本内也有共用图标：暗影千机铁牢律"守孤城"(第5重)和"岳峙"(第7–9重)同为 4549，要靠所在层区分。
- 提速版比对（截图缩到图标原尺寸再比对）：总耗时 3.2s（Python + OpenCV，单线程），相似度 0.945–0.99。
- 用苍生铸世数据重测铁牢律截图：9/9 全对，名字与截图标注一致，相似度 0.945–0.99，耗时 3.07s。
- 苍生铸世相对暗影千机，原型 4 个心法的奇穴都有变化：紫霞功（第2、4、6、7–9重）、冰心诀（第2、5、7–9重）、山海心诀（第3、5、6、7–9重）、花间游（第5重 风裳→丹青）。原型示例方案需要换成新数据（未做）。
- 黄鸡原版表情（2026-10-29 15:21 UTC+8）：魔盒表情库 npm 包 @jx3box/jx3box-emotion 1.3.2，目录 https://data.jx3box.com/emotion/output/catalog.json，图片 https://img.jx3box.com/emotion/output/<filename>。玩家说的"黄鸡"是「萌鸡」组（group_id 1，18 个，emotion_id 95–112，#b害羞…#b再见，#b大笑=101），不是「默认」组（20×20 圆脸）。均为 30×30、2 帧 GIF，帧时长 100–600ms。版权归西山居，仅自用和亲友使用。

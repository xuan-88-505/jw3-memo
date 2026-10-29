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
- 托盘黄鸡动效（2026-10-29 15:52 UTC+8）：Tauri 2 `TrayIconEvent` 有 `Enter` / `Move` / `Leave` 事件（鼠标进入、移动、离开托盘图标），Windows 和 macOS 支持，Linux 不发这些事件。来源：https://docs.rs/tauri/latest/tauri/tray/enum.TrayIconEvent.html 。正式版做法：Enter 时开始用定时器调用 `TrayIcon::set_icon` 轮换两帧，Leave 时停下。萌鸡 GIF 为 2 帧、每帧 200ms、无限循环（本地 PIL 读取 client/public/huangji/hj-101.gif 确认）。
- 全部心法（2026-10-29 16:00 UTC+8）：魔盒奇穴数据 v20260524 共 32 个心法（另有"其它"一项不算），由 /tmp/jx3/talent.json 生成 client/src/data/talents.ts（约 455 KB），原有 4 个心法与旧数据逐项比对一致。门派按魔盒数据顺序排列。
- 幽罗引属于新流派"无相楼"（全门派可学，2025 年资料片"山海源流"）。来源：https://www.taptap.cn/moment/714447833356305769 、https://jx3tc.xoyobox.com/show-98-665-1.html 。

## 引用任务「配装和木桩」（niiBc8vZVpgL2ZFXDcjPo1，2026-10-29 读取）

- 用户原需求：魔盒有配装器和木桩 DPS 计算器，想做成自己能用的桌面软件，上手简单，能直观看到数据。
- 该任务结论：Tauri 外壳 + 打包开源「在线配装计算器」（唐宋、考拉等人，支持 20 个心法，可用魔盒方案 ID 导入配装）做计算引擎；新设计 3 页：首次引导、看板、配装与试穿；魔盒配装器网页在单独窗口原样打开，方案和装备数据由软件后台获取。
- 已验证：开源计算器本地构建运行成功，紫霞功默认方案秒伤 2,302,267；公开代码缺 1 个文件（无方心法的一个循环），放临时文件才能构建，无方该循环结果不可信；魔盒装备接口拦截桌面软件发出的网页请求，需后台获取。
- 未验证：Mac 运行；公开代码落后线上多少；魔盒是否允许第三方调用接口；候选装备提升值和秒伤历史曲线是示例数据。
- 合规：只自用风险低；分享前要问计算器作者（禁止牟利、独立部署需同意）并邮件 admin@jx3box.com 问魔盒（协议禁止修改网页、禁止商业使用）。
- 看板设计：第一行"现在多少 → 加速到哪一段 → 下一步换什么"；属性收益从高到低排序；加速按段位用进度条显示。试穿页：点部位，候选装备按秒伤提升排序，顶部一直显示试穿前后对比，试穿可撤销。
- 产出文件：配装台_桌面软件方案.md/.pdf、dashboard.png、gear.png、onboarding.png、architecture.png、dashboard.html（下载到 /tmp/ref/）。

## 推栏 / 截图导入调研（2026-10-29 16:36 UTC+8）

- 推栏：西山居官方 App（App Store id1352849256，开发者西山居世游，v3.2.0 2025-08-25），介绍里有"配装器""战绩查询""查看装备"；App Store 页面没有说明开放接口。https://apps.apple.com/cn/app/%E6%8E%A8%E6%A0%8F/id1352849256
- 推栏官方介绍：游戏好友互通聊天、战绩查询、配装器、门派/副本/竞技攻略。https://daily.xoyo.com/gonglue/details.html?type=Article&id=5fb5ea93c0346a001565ecb4
- 魔盒配装器分享有 4 种：横版图、竖版图、数据版 JSON（"适用于各类 DPS 计算器导入，含配装器 ID"）、嵌入版 iframe。另有《导入配装功能说明》https://www.jx3box.com/tool/109923 。来源 https://www.jx3box.com/tool/31630
- JX3API（第三方，www.jx3api.com）：83 个接口，按档位令牌收费（LV.1–LV.2）；JX3API-TS 配置项里有"推栏Ticket"。https://github.com/JX3API/JX3API-TS
- 刀豆机器人"属性查询"：查询角色的装备属性面板（主属性、副属性、装分）。https://www.fineiii.xyz/guide/role
- jx3databot（GitHub serfend）：功能列表含"获取角色装备属性""装备属性查询"。https://github.com/serfend/jx3databot
- JX3API-TS README 称"覆盖全部 HTTP 接口"，接口列表里有角色信息、角色名片，没有角色装备/属性接口（2026-10-29 克隆 main 分支确认，源码只有 equip_score 字段）。https://github.com/JX3API/JX3API-TS
- 开源机器人 Inkar-Suki（HornCopper）拉推栏装备：POST https://m.pvp.xoyo.com/mine/equip/get-role-equip，参数 zone、server、game_role_id、ts；请求要带推栏 Token（代码注释"需要通过一些方法获得"）和 x-sk 签名（HMAC-SHA256，密钥不公开，源码注释"我不知道哦，别问我"）。返回含 Kungfu.KungfuID 和装备，可转成 JCL 行。src/utils/database/attributes.py:1263、src/utils/tuilan.py、src/utils/network.py:116。https://github.com/HornCopper/Inkar-Suki
- 同一机器人支持"茗伊插件 → 角色统计 → 装备统计 → 右上角导出装备码"，粘贴装备码即可提交属性；装备码格式：base64url → zlib 解压 → Lua 表文本（{{…}}，key=value）。src/plugins/jx3/calculator/__init__.py:166、src/utils/database/attributes.py:63 parse_plugin_data。
- 魔盒《导入配装功能说明》（2026-09-20 发布，09-29 v2）：第三方计算器可导出 JSON（Mount、EquipList[JBBB 槽位 HAT…TERTIARY_WEAPON，id 形如 7_110635，strength 0–8，embedding 等级数组，enhance/enchant/stone 资源 ID，GrowthLevel]、TalentCode、client std/origin）给魔盒"导入配装码"。FAQ："不能只导出攻击、会心等面板属性……无法从最终面板唯一还原配装"。https://www.jx3box.com/tool/109923
- 茗伊插件源码（cattenblue/MY，MY_RoleStatistics/src/MY_RoleStatistics_EquipStat.lua，2026-10-29 读取 HEAD）：
  - 装备统计存在全局 SQLite `userdata/role_statistics/equip_stat.v4.db`（第 25 行，PATH_TYPE.GLOBAL），表 OwnerInfo（ownername、servername、ownerforce、ownersuitindex…）+ EquipItems（tabtype、tabindex、strength、diamond_enchant、fea_enchant、permanent_enchant、temporary_enchant…）。同一台电脑上登录过的角色都会记下。
  - 导出按钮 Text_EquipInfoExport → `X.UI.OpenTextEditor(X.CompressLUAData(this.aExport))`（第 953–954 行）。每个部位导出 dwTabType、dwTabIndex、dwTabSubIndex、nStackNum、nStrengthLevel、nDurability、aDiamondEnchant、dwPermanentEnchantID、dwTemporaryEnchantID、dwItemFEAEnchantID（第 771–781 行）。没有心法和奇穴。
  - 这些字段和魔盒导入 JSON 的 id/strength/embedding/enhance/enchant/stone 一一对应（对应关系未逐项验证）。

## 装备图标（2026-10-29 17:13 UTC+8）

- 魔盒物品接口（无需登录，响应 5–8 秒，偶尔超时）：
  - 单件：`https://node.jx3box.com/item/{类型_ID}?client=std`，例如 `7_110635` → 漫天飞羽·浏风冠（藏剑帽子，130级会心(PVP)，Level 724，IconID 27300，竞技场）。
  - 批量：`https://node.jx3box.com/item/search?client=std&per=N&ids=7_110635,7_110636,...`（逗号分隔，实测 100 个一批可用）。
  - 搜索：`https://node.jx3box.com/item/search?client=std&per=N&keyword=戒指`；支持字段过滤，例如 `&BelongSchool=纯阳`。`MinLevel`、`sort`、`school` 参数无效或报错。
  - 返回字段含 `IconID`、`TypeLabel`（帽子/上衣/腰带/护腕/下装/鞋子/项链/腰坠/戒指…）、`BelongSchool`、`MagicKind`（内功/外功/根骨…）、`MagicType`（如"130级破防全能(PVX)"）、`Level`、`Quality`、`GetType`（副本/竞技场/威望/PVX/商店…）。
  - 图标地址和奇穴、宏一样：`https://icon.jx3box.com/icon/{IconID}.png`。
- 类型前缀：6 武器、7 防具、8 饰品（茗伊装备码和魔盒导入 JSON 里的 dwTabType / id 前缀一致）。
- 扫描 7_109800–7_113400：130 级装备 576 件，最高 Level 724（PVP 漫天飞羽）、717（PVX 陶然意）。这一段没有当前赛季副本 PVE 装备。
- 例：陶然意·淡尘帽 7_110891（纯阳，130级会心全能(PVX)，IconID 25253）；陶然意护手 IconID 25252、裤 25254、履 25255。

## 增益：小药、团队增益、家园、阵眼（2026-10-29 17:37 UTC+8）

来源：开源在线计算器 https://github.com/jx3dps-online/jx3dps-online-public （HEAD 34eb710，2026-07-06 release 2.5.8）。本地克隆 /tmp/dps，用 esbuild 把数据编译成 JSON：/tmp/buffs.json（小药、团队增益、阵眼）、/tmp/presets.json（快捷设置）、/tmp/enchant.json（附魔数值）。

- 增益面板（src/功能模块/基础设置/增益面板）：顶部「快捷设置」下拉（每个心法 4 个预设：清空增益、副本不吃药、副本常用、开荒拉满）、「计算最佳增益」、「对比」（对阵眼、小药做 DPS 对比）、「启用增益」开关；下面 3 块：阵眼选择、小药小吃选择、团队增益选择。
- 数据格式 `增益数据 = { 阵眼: string, 小吃: string[], 团队增益: {增益名称, 启用, 层数, 覆盖率}[] }`，按名字匹配；预设里有当前功法数据中不存在的名字（紫霞功预设含外功的劲风、虚弱、破甲、配伍），计算时被跳过。
- 默认方案 `增益启用: false`、增益数据为空（src/工具函数/init/缓存函数.ts）。所以引用任务实测的紫霞功 2,302,267 是不带增益的木桩秒伤。
- 小药小吃 9 类，每类选 1 个（小吃类型枚举）：药品辅助、药品增强、食品辅助、食品增强、武器磨石、家园菜品、家园酒品、家园香水、团队宴席。内功 52 个、带品级（蓝/紫）、图标 URL（icon.jx3box.com）、增益集合。例：风语·上品展凤散（内攻）攻击 +2236；女儿红·旬又三（加速）；风语·炖豆腐（无双）+3991；煦风·宁为秋霜（破防）；创意料理（-气血+无双）。
- 团队增益：内功 47 个，其中 12 个是无界端（增益心法端=无界，旗舰不用）。类型 7 种：常用增益、目标减益、治疗Buff增益、坦克Buff增益、节日增益、食物增益、稀缺增益。字段：层数、层数选项数组（1–100）、覆盖率（可手动录入）、冲突增益（例：几种粽子互斥、蒸鱼菜盘↔肘子菜盘、朝圣↔圣浴明心）、来源门派、描述。
- 团队增益折算：属性值 × 层数 × 覆盖率 ÷ 100（src/计算模块/统一工具函数/增益计算函数.ts 第 281 行）。
- 阵眼：内功 22 个（无相阵、天罗阵、气纯阵、花间阵……），部分属性带「触发型增益」。
- 属性键：点数类 atStrainBase(无双)、atAllTypeCriticalStrike(会心)、atAllOvercome(破防)、atSurplusValueBase(破招)、atHasteBase(加速)、atMagicAttackPowerBase/allAttackPowerBase(攻击)、atSpiritBase(根骨)、atSpunkBase(元气)、atBasePotentialAdd(全属性)；「郭氏」千分比以 1024 为分母（51≈5%，102≈10%）：atMagicAttackPowerPercent、atMagicOvercomePercent、*CriticalDamagePowerBaseKiloNumRate、atStrainRate；比率类 atMagicCriticalStrikeBaseRate 0.03=3%；atSkillDamageCommonAdd 等是直接小数。
- 一个紫色附魔（收益图表的单位，"额外获得一个紫色附魔对应属性后的秒伤变化"）：会心/破防/无双/破招/加速/会效 3279，内功攻击 994，外功攻击 891，主属性 420，武伤 1344。
- 开源计算器不支持冰心诀（心法目录 20 个，无七秀）；山海心诀是外功身法，阵眼预设凌雪阵。
- 原型增益估算（client/src/lib/buffs.ts，2026-10-29 17:44 UTC+8）：每点属性秒伤比例 = 属性收益 pct ÷ 一个附魔的点数；百分比类按固定系数折算（攻击% ×0.75、会心率 ×0.55、会效% ×0.3、破防% ×0.4、无双% ×0.45、伤害加成 ×1、无视防御 ×0.35、目标防御降低 ×0.35），加速跨段每段 +2%；各项相加。系数是估算，不是公式结果。
- 云间鹤（紫霞功，木桩裸装 2,302,267）测算：副本不吃药 +67.3%，副本常用 +78.5%，开荒拉满 +87.9%（阵眼天罗阵 12.7%，团队增益约 51–56%，主要是治疗/坦克的无双叠层）。未和计算器实际结果对比（未验证）。
- 生成脚本 /tmp/gen_buffs.py → client/src/data/buffData.ts（约 117 KB）。兜底心法：冰心诀→冰心阵、莫问→莫问阵、傲血战意→天策阵、惊羽诀→鲸鱼阵（外功阵眼里唐门的阵叫鲸鱼阵）、太虚剑意→剑纯阵、问水诀→藏剑阵、隐龙诀→凌雪阵；主属性小药按同类别、同品级替换。

## 角色查询与改名追踪（2026-10-29 17:56 UTC+8，用于「记录」功能）

- 名字 → ID：JX3API `/role/detail`（参数 token、server、name），返回 zoneName、serverName、roleName、roleId、globalId、forceName、bodyName、tongName、campName。需要 JX3API 令牌（按档位收费）。来源：JX3API-TS `src/types.ts` 的 `RoleDetailData`（https://github.com/JX3API/JX3API-TS）；Inkar-Suki `src/utils/database/player.py` 的 `get_role_id`（https://github.com/HornCopper/Inkar-Suki）。
- ID → 当前名字：推栏 `POST https://m.pvp.xoyo.com/role/indicator`（参数 role_id、zone、server，需要推栏凭证签名），返回 role_info：name、force、body_type、camp、role_id、server。名字可能被打码成含 `*`，机器人此时退回用旧名字。来源：Inkar-Suki `get_uid_data`。
- 改名追踪：Inkar-Suki 用 globalRoleId 做主键；按 roleId+server 查到旧记录后，删除旧记录、写入新名字，提示「原始数据 → 更新数据」。说明改名后 roleId/globalId 不变（间接证据，未找到官方说明，标"未经官方确认"）。转服后 roleId 是否变化：未验证。
- 机器人提示文案「提交角色 服务器 UID」：玩家用"服务器 + UID"提交角色。
- 玩家口语里"ID"通常指角色名（例：17173《ID从此不怕被占坑? 剑网3官方推出@隐士后缀》https://jx3.17173.com/content/08142017/182349801.shtml）。所以「输入 ID 匹配」按"输入角色名 + 服务器 → 匹配到 UID"实现，同时支持直接输入 UID。
- 改名是官方增值服务（百度经验《剑网3如何修改角色名？》提到 6000 通宝，https://jingyan.baidu.com/article/84b4f565dc8fcf21f7da3268.html）。
- 副本名（示例数据用）：《苍生铸世》10月29日公测，等级上限回到 50 级，新增 25 人本《洛阳之战》（关底史朝义）。来源：什么值得买 AI 汇总文章 https://post.smzdm.com/p/aggqrgwd/（引用官方微博，AI 生成，未逐条核实）。旧赛季 25 人本「一之窟」见 B 站《25人普通一之窟超详细教学》https://www.bilibili.com/video/BV1o2SkYLE5C/ 。副本难度分 10人普通 / 10人英雄 / 25人普通 / 25人英雄 / 25人挑战（剑网3官方攻略站 https://jx3.xoyo.com/show-3776-63-1.html ）。

## 配装对比用的面板属性（2026-10-29 18:27 UTC+8）

- 来源：引用任务「配装和木桩」（niiBc8vZVpgL2ZFXDcjPo1）的看板原型 /tmp/ref/dashboard.html「面板属性」卡片，标注「原型 · 示例数据」，纯阳 · 内功（紫霞功）。
- 数值：根骨 7,872（主属性）；攻击 68,320；会心 28.28%；会心效果 185.32%；破防 22.24%；无双 66.13%；加速 0.99%（一段，原型里加速值 2,089）；破招 12,239。
- 同一原型的提示：结果是木桩理想环境下的期望值，只适合比较同一心法的不同配装，不同心法之间不要互相比较。
- 用户反馈（18:26）：新建配装不要默认让选角色，大多数人是按职业（心法）建多套配装看属性；需要 2 套配装对比属性。

## 属性面板、大小附魔、五彩石（2026-10-29 18:50 UTC+8，用户要求：试穿顶部改成当前属性；配装显示大附魔、小附魔、武器五彩石，新建和编辑时可选）

来源：开源在线计算器 jx3dps-online-public（https://github.com/jx3dps-online/jx3dps-online-public ，本地 /tmp/dps，HEAD 34eb710，2026-07-06），与魔盒配装器同源。

- 配装器布局（src/功能模块/基础设置/属性录入/配装器/index.tsx）：左边 12 个部位，每个部位一个「装备选择」（含精炼等级选择、镶嵌孔选择、附魔选择）；中间一列 5 个大附魔下拉（帽、衣、腰、腕、鞋）；右边五彩石选择 + 面板展示 + 装备增益展示 + 秒伤结果对比。
- 面板展示（功能组件/面板展示/index.tsx）：11 项，顺序为 装分、气血、主属性、攻击、会心、会效、破防、无双、破招、全能、加速。顶部可切「无增益面板 / 增益后面板」。换装后与原面板比较，变高、变低分别着色，tooltip 写"较原面板[变高]"。
- 显示格式（src/功能模块/基础设置/面板信息/index.tsx 获取面板显示数据）：会心 = 会心等级 ÷ 系数，显示百分比（上限 100%）；会效 = 175% + 会心效果等级 ÷ 系数（上限 300%）；破防、无双显示百分比；破招显示破招值；全能显示等级；加速显示百分比（上限 25%），后面加「一段加速」等段位（零段到五段）。tooltip 显示具体数值：会心等级、会心效果等级、破防等级、无双等级、加速等级；攻击 tooltip 显示「基础攻击」和「面板攻击」；气血 tooltip 显示「体质」和「最终气血上限」。
- 换算系数（src/数据/常量/index.ts，130 级，来源注释 https://www.jx3box.com/bps/85798）：自身属性系数 = 属性系数 × (1155 × 130 − 130350) = 属性系数 × 19800。属性系数：会心 9.985、会效 3.679、破防 11.412、无双 6.734、急速 10.61（210078）、破招 8.534。即 100% 会心 = 197,703 等级；100% 会效 = 72,844；100% 破防 = 225,958；100% 无双 = 133,333；100% 加速 = 210,078。基础系数：根骨/身法转会心 0.9，元气转攻击 0.181，力道转攻击 0.163，元气/力道转破防 0.3，体质转气血 10。
- 大附魔（功能组件/大附魔选择/index.tsx）：5 个部位类型 帽、衣、腰、腕、鞋（字段 大附魔_伤帽 … 大附魔_伤鞋），每个可选「英雄·{部位}」(值 2，图标 23948) 或「普通·{部位}」(值 1，图标 23950)，可清空（"未选择 帽"）。打开下拉时显示每个选项的秒伤变化。
- 小附魔数值（/tmp/enchant.json，紫色附魔）：会心/破防/无双/破招/加速/会效 +3279；内功攻击 +994，外功攻击 +891；主属性 +420；武伤 +1344；体质 +1215；气血 +16397。
- 小附魔（src/数据/附魔/*，名称格式「属性+数值」，当前赛季紫色 / 上赛季紫色 / 蓝色）：
  - 通用数值 3279 / 2801 / 1640：无双、会心 → 护腕、下装；破防 → 护腕、下装、暗器；破招 → 帽子、鞋子、戒指；加速 → 帽子、鞋子、暗器；会效 → 无部位。
  - 攻击 内功 994 / 外功 891 → 帽子、鞋子、戒指、武器。主属性 420 → 护腕、下装、戒指、暗器。武伤 1344 → 武器。
  - 体质 1215 → 衣服、腰带、项链、腰坠；气血 16397 → 衣服、腰带；节日无双 978（蓝）→ 衣服、腰带。
  - 挑战附魔（橙）：腰坠 会心；暗器 破防、加速。阆风仙玉（绿，4099 / 主属性 526 / 体质 1518 / 攻击 1242 内 · 1114 外）：暗器、戒指、项链、腰坠。
- 大附魔效果（src/数据/装备/装备增益数据/index.ts）：伤帽 = 破防等级 +3501（普通）/ +4099（英雄），BuffID 15436；伤衣 = 基础攻击 +951 / +1114（部分心法再 +110 / +129），SkillID 22151；伤腰 = 通用增伤约 0.95%（(0.038 × 8) ÷ 32）；伤腕、伤鞋 = 触发额外伤害，算在技能循环里，不进面板。
- 五彩石（src/数据/五彩石，只装在武器上）：内功六级 75 颗、外功六级 130 颗，名称形如「彩·灵根·激流·灭气(陆)」，3 条属性；位置越靠后数值越大（例：根骨 188、内攻 884、破防 5850；破防在第 2 位是 2925）。内功用字：灵根=根骨、真元=元气、激流=内功攻击、灭气=破防、月华=会效、急速=加速，另有无双、破招。导出到 /tmp/stones.json（{内功:[{n,a:[[属性,值]...]}], 外功:[...]}）。
- 紫霞功默认方案（src/心法模块/心法/紫霞功/默认数据/配装.ts，即引用任务实测 2,302,267 秒伤所用方案）：精炼 6；小附魔 帽子 攻击、衣服 无双（节日）、腰带 无双（节日）、护腕 无双、下装 无双、鞋子 攻击、项链 体质、腰坠 体质、戒指 ×2 攻击、暗器 加速、武器 攻击；五彩石「彩·灭气·激流·月华(陆)」；大附魔 5 个都选英雄（值 2）。注意：方案里的附魔数值是旧赛季的（攻击+633、无双+2089、体质+774），不是当前赛季的 994 / 3279 / 1215。
- 紫霞功默认方案的「装备基础属性」（配装.ts 第 2–21 行）：基础攻击 52,111；破防等级 46,139；无双等级 88,172；会心等级 44,019；会心效果等级 7,518；全能 0；破招 12,239；根骨 7,872；体质 136,220；基础气血上限 160,878；加速 2,089；装分 512,287。
- 用源码公式推出的面板（无增益）：会心等级 = 44,019 + 根骨 × 0.9 + 根骨 × 625/1024（紫霞功 主属性额外加成）= 55,908 → 28.28%（与原型一致）；会效 7,518 → 185.32%；无双 88,172 → 66.13%；加速 2,089 → 0.99% 一段。最终气血 = (160,878 + 136,220 × 10) × (1 + 307/1024) = 1,979,703（紫霞功 基础气血加成 307，src/心法模块/心法/紫霞功/index.ts；计算模块/郭氏计算/其余郭氏工具函数.ts 计算气血上限函数；郭氏取整 floor(值 × 郭氏值 / 1024)）。面板攻击 68,320 取引用任务实测（紫霞功 主属性额外加成 面板攻击 1946/1024 每点根骨）。
- 原型取舍：全能在 PVE 配装里都是 0，只在不为 0 时显示；伤腕、伤鞋的秒伤（触发伤害）没有现成数值，原型按估算给（未验证）；挑战附魔、阆风仙玉暂不列入选项。

## 无相楼（流派）与角色多心法（2026-10-29 19:30 UTC+8，用户要求：心法筛选改成先选职业再选心法，心法不必选；考虑一个角色双心法再加无相楼时怎么展示）
- 无相楼是「流派」，不是门派。2025-10-30 随资料片「山海源流」上线；所有满级角色不论门派都能学它的心法，体验流派剧情。来源：17173 http://news.17173.com/content/10302025/133314847.shtml
- 心法「幽罗引」，根骨、阴性内功、远程输出；全门派都能学，也能遗忘。来源：叶子猪 http://jx3.yzz.cn/focus/202509-1752033.shtml ；TapTap https://www.taptap.cn/moment/714447833356305769
- 切到流派心法后，身上的装备、附魔、五彩石的输出属性会按"最高属性原则"无损转换成流派需要的属性。正式服解锁全部技能约 2 砖金币，遗忘后重学不再花钱。来源：UU 资讯 https://www.uubooster.com/news/jx3-new-school-launch-bug.html
- 对原型的含义：角色 = 门派（必选）+ 门派心法（1–2 个，可只玩其中一个）+ 可选的流派心法（幽罗引）。同步状态要按「角色 × 心法 × 模式」记；配装按心法建，所以幽罗引配装可以关联任何门派的角色。

## 苍生铸世赛季团队副本（2026-10-29 20:12 UTC+8，用户要求：打本记录的副本选项显示今天新赛季的本，10人 / 25普通 / 25英雄 / 25挑战）

来源：官方启动器更新公告 https://jx3.xoyo.com/launcher/update/latest.html （更新时间 2026.10.29，版本 1.6.0.10009，“苍生铸世”资料片）。

- 全新团队秘境【洛阳之战】：入口陕州；首领 突利和顺、田承嗣、伊曼·寂夜、伊曼·逐焰、阿史那承庆、史朝义（五关）。
- 秘境模式：10人普通 / 25人普通 / 25人英雄（公告原文没有挑战模式）。
- 开放时间：10人普通 10月29日维护后；25人普通 11月2日 20:00；25人英雄 11月13日 20:00。
- 挑战团队秘境【浮屠寂庐】：公告原文“全新挑战团队秘境·浮屠寂庐将于后续推出，敬请期待”。没有写开放时间和人数。用户说的“25挑战”按 25人挑战 显示（人数未验证），在开放前不可选。
- 其他：本赛季移除破招属性（五彩石中的破招转为无双）；新服务器【九天】。JX3BOX 副本攻略页 https://www.jx3box.com/fb 的 2026-10-21～24 攻略也都按“洛阳之战 10人普通、25人普通、25人英雄”标注模式。

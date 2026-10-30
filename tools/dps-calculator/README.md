# 内置配装计算器

配装页的「打开配装器」打开的是原版开源计算器，打包在软件里，断网也能用。

- 上游：https://github.com/jx3dps-online/jx3dps-online-public
- 固定提交：`230eac473429502908b2307e8571df547a9c034b`（2026-10-29）
- 许可证：BSD 3-Clause，Copyright (c) 2024, Lyn。构建时复制为产物里的 `LICENSE.txt`，随安装包分发。
- 不支持的心法（上游没有）：太虚剑意、问水诀/山居剑意、惊羽诀、隐龙诀、莫问。这 5 个心法仍用备忘录自己的配装器。

## 构建

```bash
bash tools/dps-calculator/build.sh          # 已是最新就跳过
bash tools/dps-calculator/build.sh --force  # 强制重新构建
DPS_CALC_SRC=/path/to/src bash tools/dps-calculator/build.sh  # 复用已有的上游源码目录
```

- 产物输出到 `client/public/dps-calculator/`，约 74 MB，压缩后约 11 MB。产物和上游源码缓存 `tools/dps-calculator/.cache/` 都不进 git。
- 发版工作流 `.github/workflows/release.yml` 会在 Tauri 打包前运行这个脚本。
- 去掉的文件：`jcl-wasm/`（只给网页版 JCL 导入用，local 模式没有这个入口）、`_headers`、`robots.txt`。

## 文件

| 文件 | 作用 |
| --- | --- |
| `build.sh` | 取固定提交 → 安装依赖 → 打补丁 → `REACT_APP_BUILD_TYPE=local` 构建 → 复制产物，写 `LICENSE.txt` 和 `VERSION.json` |
| `apply-patches.mjs` | 精确字符串替换。每处补丁必须正好命中 1 次，否则报错退出，防止上游改了代码后补丁悄悄失效 |
| `bridge.ts` | 复制到上游 `src/备忘录桥接.ts`，由入口文件第一行加载。负责关联角色、写入配装页带过去的装备、把结果带回配装页 |

## 补丁（7 处）

1. `src/index.tsx`：第一行加载桥接。
2. `public/index.html`：去掉百度统计。
3. `src/api/index.ts`：交易行价格接口线上靠 nginx 转发，打包后没有 nginx，改成直连。
4. `src/工具函数/tools/log.ts`：「清除缓存」不删备忘录的键。
5. `src/功能模块/系统工具/网页设置/数据管理/index.tsx`：「数据管理」不列出备忘录的键。
6. `src/功能模块/系统工具/页面右下角工具/数据迁移/index.tsx`：「数据迁移」导出时不带备忘录的键。
7. 同上文件：「数据迁移」导入时不覆盖备忘录的键。

## 和配装页的数据交换（都在 localStorage）

| 键 | 谁写 | 内容 |
| --- | --- | --- |
| `jw3memo:calc-link:v1` | 桥接 | `{配装 id: 计算器角色 id}`，同一个配装每次打开用同一个计算器角色 |
| `jw3memo:calc-seed:v1:<配装 id>` | 配装页 | 打开前写入的 12 件装备、精炼、宝石、附魔、五彩石。桥接读完就删 |
| `jw3memo:calc-result:v1:<配装 id>` | 桥接 | 算完的装分、秒伤、面板百分比、12 件装备。同时 `postMessage` 给配装页 |

- 配装页的装备在计算器装备库里找不到时（计算器只收当前版本的装备），不写入、不覆盖，等用户在计算器里改了再带回。
- 原版的「声明」和「新版本公告」弹窗保留，不绕过。

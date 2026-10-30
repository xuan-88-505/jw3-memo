// 给上游计算器源码打补丁。用法：node apply-patches.mjs <上游源码目录>
// 每处补丁必须正好命中 1 次；上游改了代码导致对不上时直接报错退出，不会悄悄漏打。
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) {
  console.error("用法：node apply-patches.mjs <上游源码目录>");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));

/** 我们的软件和计算器同源，共用 localStorage；这两个前缀的键计算器不能列出、导出、删除 */
const OURS = `(k) => String(k).startsWith('tongdiao.') || String(k).startsWith('jw3memo:')`;

const patches = [
  {
    file: "src/index.tsx",
    why: "第一行加载桥接，必须早于计算器页挂载",
    find: "import React, { Suspense, useEffect } from 'react'\n",
    replace: "import './备忘录桥接'\nimport React, { Suspense, useEffect } from 'react'\n",
  },
  {
    file: "src/index.tsx",
    why: "计算引擎模式（?engine=1）不渲染界面，只给备忘录算",
    find: "if (isLocalBuild) {\n",
    replace:
      "if (new URLSearchParams(window.location.search).has('engine')) {\n" +
      "  // 备忘录计算引擎：只加载数据和计算，不渲染界面（见 src/备忘录引擎.ts）\n" +
      "} else if (isLocalBuild) {\n",
  },
  {
    file: "public/index.html",
    why: "去掉百度统计",
    find: `    <!-- 百度埋点 -->
    <script>
      var _hmt = _hmt || []
      ;(function () {
        var hm = document.createElement('script')
        hm.src = 'https://hm.baidu.com/hm.js?111c49fa826442c87dd5c1ed89d7fe5d'
        var s = document.getElementsByTagName('script')[0]
        s.parentNode.insertBefore(hm, s)
      })()
    </script>
`,
    replace: "",
  },
  {
    file: "src/api/index.ts",
    why: "交易行价格接口线上靠 nginx 转发，打包后没有 nginx，改成直连",
    find: "  baseURL: '/nextApi/',\n",
    replace: "  baseURL: 'https://next2.jx3box.com/',\n",
  },
  {
    file: "src/工具函数/tools/log.ts",
    why: "「清除缓存」不删我们的键",
    find: "    if (!实际保留?.includes(key) && !key?.includes('计算记录')) {\n",
    replace: `    if (!实际保留?.includes(key) && !key?.includes('计算记录') && !(${OURS})(key)) {\n`,
  },
  {
    file: "src/功能模块/系统工具/网页设置/数据管理/index.tsx",
    why: "「数据管理」不列出我们的键，也就删不到",
    find: "      const 键 = localStorage.key(i)\n      if (!键) continue\n",
    replace: `      const 键 = localStorage.key(i)\n      if (!键 || (${OURS})(键)) continue\n`,
  },
  {
    file: "src/功能模块/系统工具/页面右下角工具/数据迁移/index.tsx",
    why: "「数据迁移」导出时不带我们的键",
    find: "      const key: string = localStorage.key(i) as string\n      if (key) {\n",
    replace: `      const key: string = localStorage.key(i) as string\n      if (key && !(${OURS})(key)) {\n`,
  },
  {
    file: "src/功能模块/系统工具/页面右下角工具/数据迁移/index.tsx",
    why: "「数据迁移」导入时不覆盖我们的键",
    find: "        for (const key in localStorageData) {\n          localStorage.setItem(key, localStorageData[key])\n",
    replace: `        for (const key in localStorageData) {\n          if ((${OURS})(key)) continue\n          localStorage.setItem(key, localStorageData[key])\n`,
  },
];

let failed = 0;
for (const p of patches) {
  const path = join(root, p.file);
  const text = readFileSync(path, "utf8");
  const count = text.split(p.find).length - 1;
  if (count !== 1) {
    console.error(`补丁没对上（命中 ${count} 次，应为 1）：${p.file} —— ${p.why}`);
    failed++;
    continue;
  }
  writeFileSync(path, text.replace(p.find, () => p.replace));
  console.log(`已打补丁：${p.file} —— ${p.why}`);
}

copyFileSync(join(here, "bridge.ts"), join(root, "src/备忘录桥接.ts"));
console.log("已复制桥接：src/备忘录桥接.ts");
copyFileSync(join(here, "engine.ts"), join(root, "src/备忘录引擎.ts"));
console.log("已复制引擎：src/备忘录引擎.ts");

if (failed) {
  console.error(`${failed} 处补丁没对上，上游代码可能改了，请对照 tools/dps-calculator/README.md 更新补丁。`);
  process.exit(1);
}

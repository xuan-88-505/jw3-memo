import { IS_DESKTOP } from "@/lib/desktop";
// 只取 version 一个字段，Vite 打包时不会带上 package.json 的其他内容
import { version as PACKAGE_VERSION } from "../../../package.json";

/**
 * 软件版本，来自 package.json。发版时 package.json、src-tauri/tauri.conf.json、
 * src-tauri/Cargo.toml 要一起改（client/src/lib/version.test.ts 会检查三处一致）。
 * 一键更新靠这个版本号判断「更新完成了没有」，所以不能另写一份。
 * 网页原型显示原型自己的版本号。
 */
export const DESKTOP_VERSION: string = PACKAGE_VERSION;
export const APP_VERSION = IS_DESKTOP ? DESKTOP_VERSION : "v0.1.0";

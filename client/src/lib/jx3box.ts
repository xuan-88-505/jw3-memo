/**
 * 魔盒（JX3Box）相关的小工具。
 */

/** 魔盒宏库里这个心法的页面：大家分享的宏和奇穴。心法名和魔盒一致，直接作为筛选条件 */
export function jx3boxMacroUrl(xinfa: string) {
  return `https://www.jx3box.com/macro/?subtype=${encodeURIComponent(xinfa)}`;
}

/** 魔盒的奇穴说明里用 <br/> 换行；转成换行符，显示时配合 whitespace-pre-line */
export function talentText(desc: string) {
  return desc
    .split(/<br\s*\/?>/i)
    .map(line => line.trim())
    .join("\n");
}

// 心法图标：游戏里的心法图标，取自魔盒（JX3BOX）。
// 编号是心法 ID（@jx3box/jx3box-data 3.9.9 的 data/xf/xf.json），
// 图片 https://img.jx3box.com/image/xf/<编号>.png（48×48，透明底），存放在 client/public/xinfa/。
export const XINFA_ICON_ID: Record<string, number> = {
  傲血战意: 10026,
  铁牢律: 10062,
  太虚剑意: 10015,
  紫霞功: 10014,
  离经易道: 10028,
  花间游: 10021,
  易筋经: 10003,
  洗髓经: 10002,
  问水诀: 10144,
  焚影圣诀: 10242,
  明尊琉璃体: 10243,
  毒经: 10175,
  补天诀: 10176,
  冰心诀: 10081,
  云裳心经: 10080,
  天罗诡道: 10225,
  惊羽诀: 10224,
  笑尘诀: 10268,
  铁骨衣: 10389,
  分山劲: 10390,
  莫问: 10447,
  相知: 10448,
  北傲诀: 10464,
  凌海诀: 10533,
  隐龙诀: 10585,
  太玄经: 10615,
  灵素: 10626,
  无方: 10627,
  孤锋诀: 10698,
  山海心诀: 10756,
  周天功: 10786,
  幽罗引: 10821,
};

export function xinfaIconUrl(xinfa: string): string | null {
  const id = XINFA_ICON_ID[xinfa];
  return id ? `/xinfa/${id}.png` : null;
}

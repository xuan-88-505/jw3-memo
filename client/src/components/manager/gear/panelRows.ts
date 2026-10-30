import {
  hasteOf,
  panelPct,
  primaryAttr,
  type CalcPct,
  type PanelStats,
} from "@/data/gear";
import { tx } from "@/lib/i18n";

export type PanelUnit = "pct" | "int";

export interface PanelRow {
  key: string;
  label: string;
  /** 用来显示和算差值的数；百分比属性是保留两位的百分数 */
  value: number;
  unit: PanelUnit;
  /** 数值下面的小字：等级、基础攻击、段位 */
  sub?: string;
  /** 悬停说明 */
  title?: string;
  /** 直接影响秒伤的属性；装分、气血是 false */
  core: boolean;
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 面板属性行，顺序同魔盒配装器：装分、气血、主属性、攻击、会心、会效、破防、无双、破招、全能、加速。
 * 全能只在不为 0 时显示（PVE 配装一般是 0）。
 * calc 是原版计算器算好的百分比：有就直接用，加速也不显示段数（段数阈值是上赛季的）。
 */
export function panelRows(
  xinfa: string,
  p: PanelStats,
  hasteValue: number,
  calc?: CalcPct
): PanelRow[] {
  const tier = hasteOf(hasteValue).tier;
  const hastePct = (calc?.haste ?? panelPct.haste(hasteValue)).toFixed(2);
  const pctRow = (
    key: string,
    label: string,
    full: string,
    pct: number,
    lv: number
  ): PanelRow => ({
    key,
    label,
    value: r2(pct),
    unit: "pct",
    core: true,
    sub: n(lv),
    title: `${full}等级 ${n(lv)}`,
  });
  return [
    { key: "score", label: "装分", value: p.score, unit: "int", core: false },
    {
      key: "hp",
      label: "气血",
      value: p.hp,
      unit: "int",
      core: false,
      title: `体质 ${n(p.vitality)}`,
    },
    {
      key: "primary",
      label: primaryAttr(xinfa),
      value: p.primary,
      unit: "int",
      core: true,
    },
    {
      key: "attack",
      label: "攻击",
      value: p.attack,
      unit: "int",
      core: true,
      sub: tx("基础 {0}", n(p.baseAttack)),
      title: tx("基础攻击 {0}，面板攻击 {1}", n(p.baseAttack), n(p.attack)),
    },
    pctRow("crit", "会心", "会心", calc?.crit ?? panelPct.crit(p), p.critLv),
    pctRow(
      "critDmg",
      "会效",
      "会心效果",
      calc?.critDmg ?? panelPct.critDmg(p),
      p.critDmgLv
    ),
    pctRow(
      "overcome",
      "破防",
      "破防",
      calc?.overcome ?? panelPct.overcome(p),
      p.overcomeLv
    ),
    pctRow(
      "strain",
      "无双",
      "无双",
      calc?.strain ?? panelPct.strain(p),
      p.strainLv
    ),
    // 原版计算器的角色面板没有破招：用原版结果时不显示这一行
    ...(!calc || p.surplus
      ? [
          {
            key: "surplus",
            label: "破招",
            value: p.surplus,
            unit: "int" as const,
            core: true,
          },
        ]
      : []),
    ...(p.versatility
      ? [
          {
            key: "versatility",
            label: "全能",
            value: p.versatility,
            unit: "int" as const,
            core: true,
          },
        ]
      : []),
    {
      key: "haste",
      label: "加速",
      value: hasteValue,
      unit: "int",
      core: true,
      sub: calc ? `${hastePct}%` : tier,
      title: calc
        ? `加速等级 ${n(hasteValue)}，${hastePct}%`
        : `加速等级 ${n(hasteValue)}，${hastePct}%，${tier}`,
    },
  ];
}

export function showPanelValue(v: number, unit: PanelUnit) {
  return unit === "pct" ? `${v.toFixed(2)}%` : n(v);
}

/** 两个值算不算一样：百分比按两位小数比 */
export function panelSame(d: number, unit: PanelUnit) {
  return unit === "pct" ? Math.abs(d) < 0.005 : Math.round(d) === 0;
}

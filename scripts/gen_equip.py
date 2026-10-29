"""
从开源计算器 jx3dps-online-public（2.5.8，130 级赛季）导出配装器用的装备库。

输入：/tmp/equip_all.json（由 /tmp/dump_equip.ts 用 esbuild 导出，含内功、外功全部装备和紫霞功默认方案）
      /tmp/dps/src/数据/常量/装备来源映射.json
输出：client/src/data/equip/nei.json、wai.json（打开配装器时按需加载）
      client/src/data/seedEquip.ts（示例配装用的装备快照）

运行：python3 scripts/gen_equip.py
"""

import collections
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = json.load(open("/tmp/equip_all.json"))
SOURCE = json.load(open("/tmp/dps/src/数据/常量/装备来源映射.json"))

PARTS = {
    "帽子": "hat",
    "衣服": "coat",
    "腰带": "belt",
    "护腕": "wrist",
    "下装": "pants",
    "鞋子": "shoes",
    "项链": "neck",
    "腰坠": "pendant",
    "戒指": "ring",
    "暗器": "hidden",
    "武器": "weapon",
}

# 装备属性 → 原型 StatDelta 字段；主属性保留中文名，按心法主属性生效
STAT = {
    "atSpiritBase": "根骨",
    "atSpunkBase": "元气",
    "atAgilityBase": "身法",
    "atStrengthBase": "力道",
    "atVitalityBase": "vitality",
    "atMagicAttackPowerBase": "baseAttack",
    "atPhysicsAttackPowerBase": "baseAttack",
    "allAttackPowerBase": "baseAttack",
    "atAllTypeCriticalStrike": "critLv",
    "atMagicCriticalStrike": "critLv",
    "atPhysicsCriticalStrike": "critLv",
    "atAllTypeCriticalDamagePowerBase": "critDmgLv",
    "atMagicCriticalDamagePowerBase": "critDmgLv",
    "atPhysicsCriticalDamagePowerBase": "critDmgLv",
    "atAllOvercome": "overcomeLv",
    "atMagicOvercome": "overcomeLv",
    "atPhysicsOvercomeBase": "overcomeLv",
    "atStrainBase": "strainLv",
    "atHasteBase": "haste",
    "atSurplusValueBase": "surplus",
    "atPVXAllRound": "versatility",
}

# 镶嵌孔 → 属性名（和 Attr 一致，另加全能、体质）
HOLE = {
    "atSpiritBase": "根骨",
    "atSpunkBase": "元气",
    "atAgilityBase": "身法",
    "atStrengthBase": "力道",
    "atVitalityBase": "体质",
    "atMagicAttackPowerBase": "攻击",
    "atPhysicsAttackPowerBase": "攻击",
    "atAllTypeCriticalStrike": "会心",
    "atMagicCriticalStrike": "会心",
    "atPhysicsCriticalStrike": "会心",
    "atAllTypeCriticalDamagePowerBase": "会心效果",
    "atMagicCriticalDamagePowerBase": "会心效果",
    "atPhysicsCriticalDamagePowerBase": "会心效果",
    "atAllOvercome": "破防",
    "atMagicOvercome": "破防",
    "atPhysicsOvercomeBase": "破防",
    "atStrainBase": "无双",
    "atHasteBase": "加速",
    "atSurplusValueBase": "破招",
    "atPVXAllRound": "全能",
}

unknown = collections.Counter()
src_types = collections.Counter()


def source_text(item_id, ilvl):
    rows = SOURCE.get(f"{item_id}_{ilvl}")
    if not rows:
        return None
    parts = []
    for r in rows:
        kind = r.get("来源类型", "")
        src_types[kind] += 1
        desc = r.get("来源描述") or []
        if isinstance(desc, str):
            # 商店、声望、侠行点、套装兑换：来源描述是一句话，例如"珠联璧合"
            parts.append(f"{kind} · {desc}" if kind else desc)
        elif kind == "副本" and desc:
            for d in desc[:2]:
                parts.append(f"{d.get('掉落地图', '')} · {d.get('掉落描述', '')}".strip(" ·"))
        elif desc:
            first = desc[0]
            text = " · ".join(str(v) for v in first.values() if v) if isinstance(first, dict) else str(first)
            parts.append(f"{kind} · {text}" if kind else text)
        elif kind:
            parts.append(kind)
    return "；".join(p for p in parts if p) or None


def convert(row):
    (iid, name, ilvl, icon, typ, effect, main, school, stats, holes, wdmg, _src) = row
    out_stats = []
    for code, val in stats:
        k = STAT.get(code)
        if not k:
            unknown[code] += 1
            continue
        out_stats.append([k, val])
    out_holes = []
    for code in holes:
        h = HOLE.get(code)
        if not h:
            unknown["hole:" + code] += 1
            continue
        out_holes.append(h)
    return [
        iid,
        name,
        ilvl,
        icon,
        typ,
        effect,
        main,
        school,
        out_stats,
        out_holes,
        wdmg,
        source_text(iid, ilvl),
    ]


def keep(row):
    ilvl, typ = row[2], row[4]
    if typ == "PVX":
        return False
    return ilvl >= 30000 or typ == "橙武"


db = {}
for kind, fname in (("内功", "nei"), ("外功", "wai")):
    out = {}
    for part, key in PARTS.items():
        rows = [convert(r) for r in SRC[kind][part] if keep(r)]
        rows.sort(key=lambda r: (-r[2], r[1]))
        out[key] = rows
    db[fname] = out
    path = os.path.join(ROOT, "client/src/data/equip", f"{fname}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"v": 1, "items": out}, f, ensure_ascii=False, separators=(",", ":"))
    print(fname, os.path.getsize(path), "bytes", {k: len(v) for k, v in out.items()})

print("unknown codes:", unknown.most_common(20))
print("source types:", src_types.most_common(20))

# ---------- 示例配装：紫霞功（根骨，纯阳） ----------
# 每点属性的秒伤权重，取自紫霞功属性收益（附魔点数：二级属性 3279、攻击 994、根骨 420）
W = {
    "strainLv": 1.40 / 3279,
    "critLv": 1.35 / 3279,
    "baseAttack": 1.21 / 994,
    "根骨": 1.13 / 420,
    "overcomeLv": 1.08 / 3279,
    "critDmgLv": 1.03 / 3279,
    "surplus": 0.92 / 3279,
}


def score(row):
    return sum(W.get(k, 0) * v for k, v in row[8])


def pool(key, main="根骨", school="纯阳"):
    rows = db["nei"][key]
    return [
        r
        for r in rows
        if r[6] in (main, "通用", "")
        and r[7] in ("通用", school, "")
    ]


def pick(key, lo, hi, types=("普通",), nth=0, prefer=None, exclude=()):
    cands = [r for r in pool(key) if lo <= r[2] < hi and r[4] in types]
    cands = [r for r in cands if r[0] not in exclude]
    if prefer:
        # 按这项属性的数值挑，同值再看总收益
        val = lambda r: sum(v for k, v in r[8] if k == prefer)
        cands.sort(key=lambda r: (val(r), score(r)), reverse=True)
    else:
        cands.sort(key=score, reverse=True)
    if not cands:
        sys.exit(f"no candidate for {key} in {lo}-{hi} {types}")
    return cands[min(nth, len(cands) - 1)]


SLOTS = ["hat", "coat", "belt", "wrist", "pants", "shoes", "neck", "pendant", "ring1", "ring2", "weapon", "hidden"]
base = {}
for s in SLOTS:
    part = "ring" if s.startswith("ring") else s
    base[s] = pick(part, 35000, 36000, nth=1 if s == "ring2" else 0)

# 第二套「无双流」：几件换成无双更多的同品级装备
alt = dict(base)
for s in ("hat", "pants", "pendant", "ring1"):
    part = "ring" if s.startswith("ring") else s
    alt[s] = pick(
        part,
        35000,
        36000,
        prefer="strainLv",
        exclude=(base[s][0], base["ring2"][0] if s == "ring1" else 0),
    )

for s in SLOTS:
    print(s, base[s][1], base[s][2], base[s][4], "|", alt[s][1] if alt[s] is not base[s] else "")

rows = {r[0]: r for r in list(base.values()) + list(alt.values())}
ts = [
    "/* 由 scripts/gen_equip.py 生成，不要手改。示例配装用的装备快照（开源计算器 2.5.8 装备库）。 */",
    'import type { EquipRow } from "./equip";',
    "",
    f"export const SEED_EQUIP_ROWS: EquipRow[] = {json.dumps(list(rows.values()), ensure_ascii=False)};",
    "",
    "/** 云间鹤 · 紫霞功：每个部位一件，品级 35xxx，按紫霞功属性收益挑的 */",
    f"export const SEED_ZIXIA: Record<string, number> = {json.dumps({s: base[s][0] for s in SLOTS})};",
    "",
    "/** 无双流：帽子、下装、腰坠、戒指 1 换成无双更多的同品级装备 */",
    f"export const SEED_ZIXIA_ALT: Record<string, number> = {json.dumps({s: alt[s][0] for s in SLOTS})};",
    "",
]
with open(os.path.join(ROOT, "client/src/data/seedEquip.ts"), "w") as f:
    f.write("\n".join(ts))
print("seedEquip.ts written")

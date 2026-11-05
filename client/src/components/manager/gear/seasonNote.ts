import type { Loadout } from "@/data/gear";
import { tx, txn } from "@/lib/i18n";

/**
 * 自动换成当季时（lib/calcEngine.ts seasonSync），导入的装备当季装备库里没有、
 * 换成了原版默认装备的说明。没换过、或用户已经在配装器里保存过时返回 null。
 * 按截图建的配装：截图里没认出来的部位用了原版默认装备。
 */
export function seasonNote(lo: Loadout): string | null {
  const n = lo.calc?.replaced?.length ?? 0;
  if (lo.source === "image") {
    if (n > 0) return txn("{0} 个部位截图里没认出来，用了原版默认装备", n);
    if (lo.calc?.stoneReplaced)
      return tx("截图里的五彩石当季没有，用了原版默认五彩石");
    return null;
  }
  if (n > 0)
    return txn("{0} 件导入的装备当季装备库里没有，换成了原版默认装备", n);
  if (lo.calc?.stoneReplaced)
    return tx("导入的五彩石当季没有，换成了原版默认五彩石");
  return null;
}

/**
 * 删掉一套配装后，右边该显示哪一套。
 * 列表是配装页左栏的顺序（同心法排在一起）。
 * 规则：先看同心法里的下一套，没有就看上一套；这个心法没有别的了，
 * 就去列表里挨着的那一套（先后面，再前面）；一套都不剩返回 null。
 */
export function pickAfterRemove(
  list: ReadonlyArray<{ id: string; xinfa: string }>,
  removedId: string
): string | null {
  const i = list.findIndex(l => l.id === removedId);
  if (i < 0) return list[0]?.id ?? null;
  const here = list[i].xinfa;
  const next = list[i + 1];
  if (next && next.xinfa === here) return next.id;
  const prev = list[i - 1];
  if (prev && prev.xinfa === here) return prev.id;
  return (next ?? prev)?.id ?? null;
}

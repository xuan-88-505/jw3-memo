import { useMemo, useState } from "react";
import { Check, ChevronDown, History, Plus } from "lucide-react";
import { XinfaMark } from "@/components/brand/Marks";
import { FilterChip } from "@/components/common/FilterChip";
import { InlineModal } from "@/components/common/overlay";
import { Avatar, Btn } from "@/components/common/ui";
import { XINFA_GROUPS, layersOf } from "@/data/seed";
import type { Scheme, SchemeVersion } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { absoluteTime, relativeTime } from "@/lib/format";
import { followedXinfa, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { DiffDetails, EmptyState, SectionHeader, diffSummary } from "./shared";

interface Entry {
  key: string;
  scheme: Scheme;
  version: SchemeVersion;
  prev?: SchemeVersion;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function ChangelogView() {
  const { state, actions } = useProto();
  const filter = state.changelogFilter;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const followed = followedXinfa(state);

  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const s of state.schemes) {
      // "全部"只看关注的心法
      if (filter === "全部" ? !followed.includes(s.xinfa) : s.xinfa !== filter)
        continue;
      s.versions.forEach((v, i) =>
        list.push({
          key: `${s.id}-${v.version}`,
          scheme: s,
          version: v,
          prev: s.versions[i - 1],
        })
      );
    }
    return list.sort(
      (a, b) =>
        new Date(b.version.at).getTime() - new Date(a.version.at).getTime()
    );
  }, [state.schemes, filter, followed]);

  const groups = useMemo(() => {
    const g: { label: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const label = dayLabel(e.version.at);
      const last = g[g.length - 1];
      if (last && last.label === label) last.items.push(e);
      else g.push({ label, items: [e] });
    }
    return g;
  }, [entries]);

  // 从配装页、方案库跳过来时，可能选中一个没关注的心法：临时显示一个标签，× 只清掉筛选
  const chips =
    filter !== "全部" && !followed.includes(filter)
      ? [...followed, filter]
      : followed;
  const countOf = (xinfa: string) =>
    state.schemes
      .filter(s => s.xinfa === xinfa)
      .reduce((n, s) => n + s.versions.length, 0);
  const total = state.schemes.reduce((n, s) => n + s.versions.length, 0);
  // 没有记录的心法筛了也是空的，不放进筛选；当前选中的除外
  const shownChips = chips.filter(x => x === filter || countOf(x) > 0);
  // 没内容时不显示筛选：一条记录都没有，或者关注的心法都没有记录
  const showFilter = total > 0 && (filter !== "全部" || entries.length > 0);

  return (
    <div>
      <SectionHeader
        title="修改记录"
        back={{ label: "方案库", onClick: actions.closeChangelog }}
      />

      {showFilter && (
        <div
          className="mb-5 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="按心法筛选"
        >
          <FilterChip
            label="全部"
            selected={filter === "全部"}
            onSelect={() => actions.setChangelogFilter("全部")}
          />
          {shownChips.map(x => (
            <FilterChip
              key={x}
              label={x}
              xinfa={x}
              selected={filter === x}
              onSelect={() => actions.setChangelogFilter(x)}
              removeLabel={`不再关注${x}`}
              onRemove={() =>
                followed.includes(x)
                  ? actions.unfollowXinfa(x)
                  : actions.setChangelogFilter("全部")
              }
            />
          ))}
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label="添加关注的心法"
            title="添加关注的心法"
            className="inline-grid h-7 w-7 place-items-center rounded-full border border-dashed border-paper/20 text-paper-3 transition-colors hover:border-paper/35 hover:text-paper"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="还没有修改记录"
        />
      ) : filter === "全部" && entries.length === 0 ? (
        // 别的心法有记录，但没关注
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title={
            followed.length === 0
              ? "还没有关注的心法"
              : "关注的心法还没有修改记录"
          }
          action={
            <Btn
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setPicking(true)}
            >
              添加心法
            </Btn>
          }
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="还没有修改记录"
        />
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <section key={g.label}>
              <h2 className="mb-2 text-[13px] text-paper-3">{g.label}</h2>
              <ol className="relative space-y-1 border-l border-paper/10 pl-5">
                {g.items.map(e => {
                  const author = state.members.find(
                    m => m.id === e.version.authorId
                  );
                  const diff = diffVersions(
                    e.prev,
                    e.version,
                    layersOf(e.scheme.xinfa)
                  );
                  const isLatest =
                    e.scheme.versions[e.scheme.versions.length - 1].version ===
                    e.version.version;
                  const open = openKey === e.key;
                  return (
                    <li key={e.key} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[25px] top-4 h-2 w-2 rounded-[2px] ring-4 ring-ink-2",
                          isLatest ? "bg-cinnabar" : "bg-paper-3/60"
                        )}
                        aria-hidden="true"
                      />
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2.5 transition-colors",
                          open ? "bg-paper/[0.04]" : "hover:bg-paper/[0.025]"
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <Avatar
                            member={author ?? { name: "?", color: "#968F82" }}
                            size={26}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-paper-2">
                              <span className="font-medium text-paper">
                                {author?.name ?? "已离开的成员"}
                              </span>
                              {e.prev ? "把" : "创建了"}
                              <XinfaMark xinfa={e.scheme.xinfa} size={18} />
                              <span className="font-medium text-paper">
                                {e.scheme.xinfa} · {e.scheme.mode}
                              </span>
                              {e.prev
                                ? `更新到 v${e.version.version}`
                                : "（v1）"}
                              {isLatest && (
                                <span className="rounded-[4px] bg-cinnabar/14 px-1.5 text-[11px] font-medium text-cinnabar-text ring-1 ring-inset ring-cinnabar/30">
                                  当前版本
                                </span>
                              )}
                            </p>
                            <p
                              className="mt-0.5 text-[12px] text-paper-3"
                              title={absoluteTime(e.version.at)}
                            >
                              {relativeTime(e.version.at)} ·{" "}
                              {e.prev
                                ? diffSummary(diff)
                                : e.version.macros.length
                                  ? `${e.version.macros.length} 个宏 · 9 层奇穴`
                                  : "9 层奇穴"}
                            </p>
                            {e.version.note && (
                              <p className="mt-1.5 text-[13px] leading-relaxed text-paper">
                                “{e.version.note}”
                              </p>
                            )}
                          </div>
                          {e.prev && diff.total > 0 && (
                            <button
                              type="button"
                              onClick={() => setOpenKey(open ? null : e.key)}
                              aria-expanded={open}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-paper-2 hover:bg-paper/[0.06] hover:text-paper"
                            >
                              旧 → 新
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 transition-transform",
                                  open && "rotate-180"
                                )}
                              />
                            </button>
                          )}
                        </div>
                        {open && (
                          <div className="ml-[36px] mt-3 animate-fade">
                            <DiffDetails diff={diff} compact />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      <FollowPicker
        open={picking}
        onClose={() => setPicking(false)}
        followed={followed}
        countOf={countOf}
        onToggle={x =>
          followed.includes(x)
            ? actions.unfollowXinfa(x)
            : actions.followXinfa(x)
        }
      />
    </div>
  );
}

/** 选择关注的心法：按门派分组，点一下关注，再点一下取消，立即生效 */
function FollowPicker({
  open,
  onClose,
  followed,
  countOf,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  followed: string[];
  countOf: (xinfa: string) => number;
  onToggle: (xinfa: string) => void;
}) {
  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title="关注的心法"
      width={600}
      bodyMaxHeight={440}
      footer={
        <Btn variant="primary" size="md" onClick={onClose}>
          完成
        </Btn>
      }
    >
      <ul className="divide-y divide-paper/[0.07]">
        {XINFA_GROUPS.map(g => (
          <li key={g.school} className="flex items-start gap-3 py-2">
            <span className="w-[72px] shrink-0 pt-1 text-[12px] text-paper-3">
              {g.school}
            </span>
            <span className="flex flex-1 flex-wrap gap-1.5">
              {g.xinfa.map(x => {
                const on = followed.includes(x);
                const n = countOf(x);
                return (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(x)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-[12.5px] ring-1 ring-inset transition-colors",
                      on
                        ? "bg-cinnabar/12 text-paper ring-cinnabar/45"
                        : "text-paper-2 ring-paper/10 hover:text-paper hover:ring-paper/25"
                    )}
                  >
                    {on ? (
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-cinnabar-fill text-[#FFF7F0]">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="inline-flex">
                        <XinfaMark xinfa={x} size={16} />
                      </span>
                    )}
                    {x}
                    {n > 0 && (
                      <span
                        aria-hidden="true"
                        className="text-[11px] tabular-nums text-paper-3"
                        title={`${n} 条修改记录`}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </InlineModal>
  );
}

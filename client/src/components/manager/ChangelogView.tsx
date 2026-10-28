import { useMemo, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { XinfaMark } from "@/components/brand/Marks";
import { Avatar } from "@/components/common/ui";
import { XINFA_LIST, layersOf } from "@/data/seed";
import type { Scheme, SchemeVersion } from "@/data/types";
import { diffVersions } from "@/lib/diff";
import { absoluteTime, relativeTime } from "@/lib/format";
import { useProto } from "@/state/store";
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

  const entries = useMemo(() => {
    const list: Entry[] = [];
    for (const s of state.schemes) {
      if (filter !== "全部" && s.xinfa !== filter) continue;
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
  }, [state.schemes, filter]);

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

  const filters = ["全部", ...XINFA_LIST];

  return (
    <div>
      <SectionHeader
        title="技改记录"
        description="所有方案的修改历史，按时间倒序。每次保存都会留下一条。"
      />

      <div
        className="mb-5 flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="按心法筛选"
      >
        {filters.map(f => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => actions.setChangelogFilter(f)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] ring-1 ring-inset transition-colors",
              filter === f
                ? "bg-paper/[0.09] text-paper ring-paper/20"
                : "text-paper-3 ring-paper/10 hover:text-paper hover:ring-paper/20"
            )}
          >
            {f !== "全部" && <XinfaMark xinfa={f} size={16} />}
            {f}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="还没有修改记录"
          description="有人保存方案后，这里会按时间列出每一次修改。"
        />
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <section key={g.label}>
              <h2 className="mb-2 font-serif text-[13px] text-paper-3">
                {g.label}
              </h2>
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
                          open ? "bg-ink-3" : "hover:bg-paper/[0.03]"
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
                                : `${e.version.macros.length} 个宏 · 9 层奇穴`}
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
    </div>
  );
}

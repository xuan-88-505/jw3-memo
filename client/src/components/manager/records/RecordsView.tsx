import { Plus } from "lucide-react";
import { useState } from "react";
import { Btn } from "@/components/common/ui";
import { cn } from "@/lib/utils";
import { canEdit, isOnline, useProto } from "@/state/store";
import { SectionHeader } from "../shared";
import { BlacklistTab, type BlackEditing } from "./BlacklistTab";
import { LinksTab } from "./LinksTab";
import { RaidLogTab } from "./RaidLogTab";
import { ME_ID } from "@/data/seed";
import { visibleLinks } from "@/data/links";

type Tab = "raid" | "black" | "links";

export function RecordsView() {
  const { state } = useProto();
  const [tab, setTab] = useState<Tab>("raid");
  const [raidEditing, setRaidEditing] = useState<string | "new" | null>(null);
  const [blackEditing, setBlackEditing] = useState<BlackEditing>(null);
  const writable = canEdit(state) && isOnline(state);
  const lockReason = !canEdit(state)
    ? "只读成员不能修改"
    : !isOnline(state)
      ? "离线时不能修改"
      : undefined;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "raid", label: "打本", count: state.raidLogs.length },
    { key: "black", label: "避雷", count: state.blacklist.length },
    {
      key: "links",
      label: "链接",
      count: visibleLinks(state.links, ME_ID).length,
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <SectionHeader
        title="记录"
        right={
          tab !== "links" && (
            <Btn
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={!writable}
              title={lockReason}
              onClick={() =>
                tab === "raid"
                  ? setRaidEditing("new")
                  : setBlackEditing({ id: "new" })
              }
            >
              {tab === "raid" ? "记一笔" : "加入避雷"}
            </Btn>
          )
        }
      />
      <div
        role="tablist"
        aria-label="记录类型"
        className="mb-4 flex gap-5 border-b border-paper/[0.07]"
      >
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative h-9 text-[13.5px] transition-colors",
              tab === t.key
                ? "font-medium text-paper"
                : "text-paper-3 hover:text-paper-2"
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[12px] font-normal tabular-nums text-paper-3">
              {t.count}
            </span>
            {tab === t.key && (
              <span
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-cinnabar"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
      {tab === "raid" ? (
        <RaidLogTab editingId={raidEditing} onEdit={setRaidEditing} />
      ) : tab === "black" ? (
        <BlacklistTab editing={blackEditing} onEdit={setBlackEditing} />
      ) : (
        <LinksTab />
      )}
    </div>
  );
}

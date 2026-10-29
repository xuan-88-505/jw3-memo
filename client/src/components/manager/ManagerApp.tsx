import {
  BookOpen,
  History,
  Loader2,
  NotebookPen,
  Pencil,
  Settings,
  Shirt,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Marks";
import { OfflineBar, ToastStack } from "@/components/common/overlay";
import { Avatar, Btn, SealBadge } from "@/components/common/ui";
import type { ManagerSection } from "@/data/types";
import { ROLE_LABEL } from "@/lib/format";
import { me, myCharacters, pendingCount, useProto } from "@/state/store";
import { cn } from "@/lib/utils";
import { ChangelogView } from "./ChangelogView";
import { GearView } from "./gear/GearView";
import { ProfileDialog } from "./ProfileDialog";
import { RecordsView } from "./records/RecordsView";
import { CharactersView } from "./CharactersView";
import { SchemesView } from "./SchemesView";
import { SettingsView } from "./SettingsView";
import { TeamView } from "./TeamView";

const NAV: { key: ManagerSection; label: string; icon: typeof BookOpen }[] = [
  { key: "schemes", label: "方案库", icon: BookOpen },
  { key: "characters", label: "我的角色", icon: UserRound },
  { key: "gear", label: "配装", icon: Shirt },
  { key: "changelog", label: "技改记录", icon: History },
  { key: "records", label: "记录", icon: NotebookPen },
  { key: "team", label: "亲友团", icon: Users },
];

export function ManagerApp({ onOpenPanel }: { onOpenPanel?: () => void }) {
  const { state, actions } = useProto();
  const loading = state.dataState === "loading";
  const self = me(state);
  const [profileOpen, setProfileOpen] = useState(false);

  const counts: Record<ManagerSection, number | null> = {
    schemes: state.schemes.length,
    characters: myCharacters(state).length,
    gear: null,
    changelog: null,
    records: null,
    team: state.members.length,
    settings: null,
  };

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-ink-2 text-paper">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-paper/[0.07] bg-ink">
        <div className="px-4 pb-5 pt-5">
          <Wordmark size="md" />
        </div>
        <nav aria-label="管理窗口导航" className="flex-1 px-2">
          <ul className="space-y-0.5">
            {NAV.map(n => {
              const active = state.managerSection === n.key;
              const Icon = n.icon;
              const disabled = !state.team || loading;
              return (
                <li key={n.key}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => actions.setSection(n.key)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
                      active
                        ? "bg-paper/[0.08] font-medium text-paper"
                        : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
                    )}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-2 h-5 w-[2px] rounded-full bg-cinnabar"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">{n.label}</span>
                    {n.key === "characters" && state.team && (
                      <SealBadge count={pendingCount(state)} />
                    )}
                    {n.key !== "characters" &&
                      counts[n.key] !== null &&
                      state.team && (
                        <span className="text-[11.5px] text-paper-3">
                          {counts[n.key]}
                        </span>
                      )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="px-2 pb-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => actions.setSection("settings")}
            aria-current={
              state.managerSection === "settings" ? "page" : undefined
            }
            className={cn(
              "relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
              state.managerSection === "settings"
                ? "bg-paper/[0.08] font-medium text-paper"
                : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
            )}
          >
            {state.managerSection === "settings" && (
              <span
                className="absolute left-0 top-2 h-5 w-[2px] rounded-full bg-cinnabar"
                aria-hidden="true"
              />
            )}
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">设置</span>
          </button>
        </div>
        <div className="border-t border-paper/[0.07] p-2">
          <button
            type="button"
            disabled={!self || loading}
            onClick={() => setProfileOpen(true)}
            title={self ? "修改头像和昵称" : undefined}
            aria-label={self ? `修改头像和昵称（${self.name}）` : undefined}
            className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors enabled:hover:bg-paper/[0.05]"
          >
            {self ? (
              <Avatar member={self} size={28} />
            ) : (
              <Avatar member={{ name: "八八", color: "#D2462F" }} size={28} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">
                {self?.name ?? "八八"}
              </p>
              <p className="flex items-center gap-1.5 text-[11.5px] text-paper-3">
                {self ? ROLE_LABEL[self.role] : "未加入"}
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    state.dataState === "offline"
                      ? "text-gold"
                      : state.dataState === "loading"
                        ? ""
                        : "text-jade"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      state.dataState === "offline"
                        ? "bg-gold"
                        : state.dataState === "loading"
                          ? "bg-paper-3"
                          : "bg-jade"
                    )}
                    aria-hidden="true"
                  />
                  {state.dataState === "offline"
                    ? "离线"
                    : state.dataState === "loading"
                      ? "同步中"
                      : "在线"}
                </span>
              </p>
            </div>
            {self && (
              <Pencil
                className="h-3.5 w-3.5 shrink-0 text-paper-3/60 transition-colors group-hover:text-paper-2"
                aria-hidden="true"
              />
            )}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <OfflineBar />
        <div className="min-h-0 flex-1">
          {loading ? (
            <ManagerSkeleton />
          ) : state.managerSection === "settings" ? (
            <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-7">
              <SettingsView />
            </div>
          ) : !state.team ? (
            <NoTeam onOpenPanel={onOpenPanel} />
          ) : state.managerSection === "schemes" ? (
            <SchemesView />
          ) : state.managerSection === "gear" ? (
            <GearView />
          ) : (
            <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-7">
              {state.managerSection === "characters" && <CharactersView />}
              {state.managerSection === "changelog" && <ChangelogView />}
              {state.managerSection === "records" && <RecordsView />}
              {state.managerSection === "team" && <TeamView />}
            </div>
          )}
        </div>
      </main>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ToastStack surface="manager" className="bottom-5" />
    </div>
  );
}

function NoTeam({ onOpenPanel }: { onOpenPanel?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink-4 text-paper-2 ring-1 ring-inset ring-paper/10">
        <Users className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-4 font-serif text-[17px] font-semibold">
        还没加入亲友团
      </p>
      {onOpenPanel && (
        <Btn variant="primary" size="md" className="mt-5" onClick={onOpenPanel}>
          打开面板
        </Btn>
      )}
    </div>
  );
}

function ManagerSkeleton() {
  return (
    <div className="flex h-full" aria-busy="true" aria-label="正在加载">
      <div className="w-[236px] space-y-3 border-r border-paper/[0.07] px-4 py-5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <span className="skeleton block h-4 w-24" />
            <span className="skeleton block h-3 w-40" />
            <span className="skeleton block h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="flex-1 px-7 py-6">
        <div className="flex items-center gap-3">
          <span className="skeleton h-10 w-10" />
          <span className="space-y-2">
            <span className="skeleton block h-5 w-36" />
            <span className="skeleton block h-3 w-64" />
          </span>
        </div>
        <span className="skeleton mt-8 block h-28 w-full rounded-xl" />
        <span className="skeleton mt-3 block h-28 w-full rounded-xl" />
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-paper-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          正在从云端同步方案…
        </p>
      </div>
    </div>
  );
}

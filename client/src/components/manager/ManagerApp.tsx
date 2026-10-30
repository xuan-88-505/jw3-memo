import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  NotebookPen,
  Pencil,
  Settings,
  Shirt,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { OfflineBar, ToastStack } from "@/components/common/overlay";
import { Avatar } from "@/components/common/ui";
import { IS_DESKTOP } from "@/lib/desktop";
import { ROLE_LABEL } from "@/lib/format";
import { me, navOrder, useProto, type NavSection } from "@/state/store";
import { cn } from "@/lib/utils";
import { ChangelogView } from "./ChangelogView";
import { GearView } from "./gear/GearView";
import { ProfileDialog } from "./ProfileDialog";
import { RecordsView } from "./records/RecordsView";
import { CharactersView } from "./CharactersView";
import { SchemesView } from "./SchemesView";
import { SettingsView } from "./SettingsView";
import { SortableNav, type NavItem } from "./SortableNav";
import { TeamView } from "./TeamView";

/** 侧栏各项；显示顺序由用户排，见 navOrder */
const NAV_BY_KEY: Record<NavSection, NavItem> = {
  schemes: { key: "schemes", label: "方案库", icon: BookOpen },
  characters: { key: "characters", label: "我的角色", icon: UserRound },
  gear: { key: "gear", label: "配装", icon: Shirt },
  records: { key: "records", label: "记录", icon: NotebookPen },
  team: { key: "team", label: "亲友团", icon: Users, tag: "Beta" },
};

/** 侧栏折叠状态只存在本机 */
const SIDEBAR_KEY = "tongdiao.sidebar.v1";

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** 1.0 单机版没有亲友团 */
const visibleNav = (list: NavSection[]) =>
  IS_DESKTOP ? list.filter(k => k !== "team") : list;

export function ManagerApp() {
  const { state, actions } = useProto();
  const loading = state.dataState === "loading";
  const self = me(state);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      /* 存不了就只在这次有效 */
    }
  }, [collapsed]);

  const status =
    state.dataState === "offline"
      ? { label: "离线", text: "text-gold", dot: "bg-gold" }
      : state.dataState === "loading"
        ? { label: "同步中", text: "text-paper-3", dot: "bg-paper-3" }
        : { label: "在线", text: "text-jade", dot: "bg-jade" };

  return (
    <div
      data-layer-root
      className="relative flex h-full w-full overflow-hidden bg-ink text-paper"
      // 文件拖到窗口里不接收的地方时，不让浏览器直接打开这个文件
      onDragOver={e => {
        if (Array.from(e.dataTransfer.types).includes("Files"))
          e.preventDefault();
      }}
      onDrop={e => {
        if (Array.from(e.dataTransfer.types).includes("Files"))
          e.preventDefault();
      }}
    >
      {/* 折叠后宽 52px：图标左边距不变（8 + 10），正好居中，展开收起时图标不动 */}
      <aside
        className={cn(
          "group/side relative z-10 flex shrink-0 flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "w-[52px]" : "w-[200px]"
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <nav
            id="manager-nav"
            aria-label="管理窗口导航"
            className="flex-1 px-2 pt-3"
          >
            <SortableNav
              items={visibleNav(navOrder(state)).map(k => NAV_BY_KEY[k])}
              activeKey={state.managerSection}
              disabled={loading}
              onSelect={actions.setSection}
              onReorder={actions.setNavOrder}
              collapsed={collapsed}
            />
          </nav>
          <div className="px-2 pb-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => actions.setSection("settings")}
              aria-current={
                state.managerSection === "settings" ? "page" : undefined
              }
              title={collapsed ? "设置" : undefined}
              className={cn(
                "relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
                state.managerSection === "settings"
                  ? "bg-paper/[0.08] font-medium text-paper"
                  : "text-paper-2 hover:bg-paper/[0.04] hover:text-paper"
              )}
            >
              {state.managerSection === "settings" && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-cinnabar"
                  aria-hidden="true"
                />
              )}
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span
                className={cn(
                  "flex-1 whitespace-nowrap text-left",
                  collapsed && "sr-only"
                )}
              >
                设置
              </span>
            </button>
          </div>
          <div className="border-t border-paper/[0.07] p-2">
            {/* 整行可点：按钮的 after 层铺满整行；右侧状态不拦截点击，读屏单独读出 */}
            <div
              className={cn(
                "group relative flex items-center gap-2 rounded-md py-2 transition-colors has-[button:enabled]:hover:bg-paper/[0.05]",
                collapsed ? "px-0.5" : "px-2"
              )}
            >
              <button
                type="button"
                disabled={!self || loading}
                onClick={() => setProfileOpen(true)}
                title={
                  self
                    ? collapsed
                      ? `${self.name} · 修改头像和昵称`
                      : "修改头像和昵称"
                    : undefined
                }
                aria-label={self ? `修改头像和昵称（${self.name}）` : undefined}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-cinnabar-text/50"
              >
                {self ? (
                  <Avatar member={self} size={32} />
                ) : (
                  <Avatar
                    member={{ name: "八八", color: "#D2462F" }}
                    size={32}
                  />
                )}
                <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
                  <p className="flex items-center gap-1 whitespace-nowrap text-[13px] font-medium">
                    <span className="truncate">{self?.name ?? "八八"}</span>
                    {self && !loading && (
                      <Pencil
                        className="h-3 w-3 shrink-0 text-paper-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    )}
                  </p>
                  {!IS_DESKTOP && (
                    <p className="truncate text-[11.5px] text-paper-3">
                      {self && state.team
                        ? ROLE_LABEL[self.role]
                        : "未加入亲友团"}
                    </p>
                  )}
                </div>
              </button>
              {/* 单机版不联网，没有在线状态。折叠时只留头像右下角的小点 */}
              {!IS_DESKTOP && (
                <span
                  className={cn(
                    "pointer-events-none inline-flex shrink-0 items-center gap-1 text-[11.5px]",
                    status.text,
                    collapsed ? "absolute left-[26px] top-[32px]" : "relative"
                  )}
                >
                  <span
                    className={cn(
                      "rounded-full",
                      status.dot,
                      collapsed ? "h-2 w-2 ring-2 ring-ink" : "h-1.5 w-1.5"
                    )}
                    aria-hidden="true"
                  />
                  <span className={cn(collapsed && "sr-only")}>
                    {status.label}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
        {/* 交界线上的展开 / 收起按钮：鼠标移进侧栏或键盘聚焦时出现；触屏一直显示 */}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-controls="manager-nav"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className="absolute -right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-ink-3 text-paper-3 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-paper/15 transition-[opacity,color] duration-150 hover:text-paper focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-cinnabar-text/60 group-hover/side:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-lg border-l border-t border-paper/[0.07] bg-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.025)]">
        <OfflineBar />
        <div className="min-h-0 flex-1">
          {loading ? (
            <ManagerSkeleton />
          ) : state.managerSection === "settings" ? (
            <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-7">
              <div className="max-w-[1040px]">
                <SettingsView />
              </div>
            </div>
          ) : state.managerSection === "schemes" ? (
            state.schemesPage === "changelog" ? (
              <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-6">
                <div className="flex min-h-full max-w-[1040px] flex-col">
                  <ChangelogView />
                </div>
              </div>
            ) : (
              <SchemesView />
            )
          ) : state.managerSection === "gear" ? (
            <GearView />
          ) : (
            <div className="scroll-thin h-full overflow-y-auto px-8 pb-10 pt-7">
              <div className="flex min-h-full max-w-[1040px] flex-col">
                {state.managerSection === "characters" && <CharactersView />}
                {state.managerSection === "records" && <RecordsView />}
                {state.managerSection === "team" && <TeamView />}
              </div>
            </div>
          )}
        </div>
      </main>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ToastStack surface="manager" className="bottom-5" />
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

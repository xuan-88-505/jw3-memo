import { Link } from "wouter";
import { AppWindow, PanelTop } from "lucide-react";
import { Wordmark } from "@/components/brand/Marks";
import { Segmented } from "@/components/common/ui";
import { DesktopScreen } from "@/components/desktop/DesktopScreen";
import { Stage } from "@/components/desktop/Stage";
import type { DataState, Platform, Role, Scene } from "@/data/types";
import { hotkeyText } from "@/lib/hotkey";
import { me, useProto } from "@/state/store";
import { cn } from "@/lib/utils";

export default function Home() {
  const { state, actions } = useProto();
  const role = me(state)?.role ?? "admin";
  const mac = state.platform === "mac";
  const hk = hotkeyText(state.hotkeys[state.platform], state.platform);

  return (
    <div className="min-h-screen bg-[#0e0d0c] text-paper">
      <header className="mx-auto flex max-w-[1488px] flex-wrap items-center gap-x-4 gap-y-2 px-6 pb-3 pt-5">
        <Wordmark size="md" />
        <span className="rounded-[4px] bg-paper/[0.07] px-2 py-0.5 text-[12px] text-paper-2 ring-1 ring-inset ring-paper/10">
          交互原型 · 示例数据
        </span>
        <p className="text-[12.5px] text-paper-3">
          不连后台，刷新后复原 · 宏和奇穴来自魔盒
        </p>
        <nav className="ml-auto flex items-center gap-1 text-[12.5px]">
          <Link
            href="/panel"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-paper-2 hover:bg-paper/[0.06] hover:text-paper"
          >
            <PanelTop className="h-3.5 w-3.5" aria-hidden="true" />
            单独看面板
          </Link>
          <Link
            href="/manager"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-paper-2 hover:bg-paper/[0.06] hover:text-paper"
          >
            <AppWindow className="h-3.5 w-3.5" aria-hidden="true" />
            单独看管理窗口
          </Link>
        </nav>
      </header>

      <div className="mx-auto max-w-[1488px] px-6">
        <div
          className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-ink-2 px-4 py-3 ring-1 ring-inset ring-paper/8"
          aria-label="演示控制"
        >
          <Control label="平台">
            <Segmented<Platform>
              label="平台"
              value={state.platform}
              onChange={actions.setPlatform}
              options={[
                { value: "win", label: "Windows" },
                { value: "mac", label: "Mac" },
              ]}
            />
          </Control>
          <Control label="场景">
            <Segmented<Scene>
              label="场景"
              value={state.scene}
              onChange={actions.setScene}
              options={[
                { value: "desktop", label: "桌面" },
                {
                  value: "game-window",
                  label: "游戏 · 窗口",
                  disabled: mac,
                  title: mac ? "Mac 上不玩游戏" : undefined,
                },
                {
                  value: "game-full",
                  label: "游戏 · 全屏",
                  disabled: mac,
                  title: mac ? "Mac 上不玩游戏" : undefined,
                },
              ]}
            />
          </Control>
          <Control label="数据">
            <Segmented<DataState>
              label="数据状态"
              value={state.dataState}
              onChange={actions.setDataState}
              options={[
                { value: "normal", label: "正常" },
                { value: "onboarding", label: "首次使用" },
                { value: "offline", label: "离线" },
                { value: "loading", label: "加载中" },
              ]}
            />
          </Control>
          <Control label="我的身份">
            <Segmented<Role>
              label="我的身份"
              value={role}
              onChange={actions.setMyRole}
              options={[
                { value: "admin", label: "管理员", disabled: !state.team },
                { value: "editor", label: "编辑", disabled: !state.team },
                { value: "viewer", label: "只读", disabled: !state.team },
              ]}
            />
          </Control>
          <Control label="保存时">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-paper-2">
              <button
                type="button"
                role="switch"
                aria-checked={state.simulateConflict}
                onClick={() =>
                  actions.setSimulateConflict(!state.simulateConflict)
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  state.simulateConflict ? "bg-cinnabar-fill" : "bg-ink-5"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-transform",
                    state.simulateConflict
                      ? "translate-x-[18px]"
                      : "translate-x-0.5"
                  )}
                />
              </button>
              模拟亲友同时编辑
            </label>
          </Control>
        </div>

        <Stage>
          <DesktopScreen />
        </Stage>

        <section className="grid gap-x-8 gap-y-3 py-6 text-[13px] leading-relaxed text-paper-2 md:grid-cols-2 xl:grid-cols-4">
          <Tip n="1" title="打开面板">
            点{mac ? "菜单栏" : "任务栏"}的同调图标，或按 {hk}
            （可在设置里改）。数字键 1–4 切角色。
          </Tip>
          <Tip n="2" title="通知">
            点铃铛，看哪些角色有更新、改了什么。游戏里改好后点「我改好了」。
          </Tip>
          <Tip n="3" title="置顶">
            点图钉后不会自动收起，按住顶部可以拖动。
          </Tip>
          <Tip n="4" title="改方案">
            在管理窗口改宏、备注或奇穴。打开「模拟亲友同时编辑」再保存，可以看冲突提示。
          </Tip>
        </section>
      </div>
    </div>
  );
}

function Control({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-paper-3">{label}</span>
      {children}
    </div>
  );
}

function Tip({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[4px] bg-cinnabar/15 font-serif text-[12px] text-cinnabar-text">
        {n}
      </span>
      <p>
        <span className="font-medium text-paper">{title}</span>
        <span className="mx-1.5 text-paper-3">·</span>
        {children}
      </p>
    </div>
  );
}

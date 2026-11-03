import { useEffect } from "react";
import { ManagerApp } from "@/components/manager/ManagerApp";
import type { ManagerSection } from "@/data/types";
import { onOpenManager, openManager, syncAutostart } from "@/lib/desktop";
import { TeamSyncProvider } from "@/lib/team/TeamSync";
import { startUpdateWatcher } from "@/lib/update/appUpdate";
import { DESKTOP_VERSION } from "@/lib/version";
import { useProto, type ManagerIntent } from "@/state/store";
import { tx, useLang } from "@/lib/i18n";

/**
 * 桌面版的管理窗口。标题栏用系统原生的，页面铺满窗口。
 * 亲友团同步只在这个窗口里跑（关掉窗口只是隐藏，同步不停）。
 */
export default function DesktopManager() {
  const { state, actions } = useProto();

  // 面板上点了入口：打开对应的页面
  useEffect(() => {
    const off = onOpenManager(req => {
      actions.openManager(
        req.section as ManagerSection | undefined,
        req.schemeId,
        (req.intent ?? undefined) as ManagerIntent | undefined
      );
    });
    return () => void off.then(f => f());
  }, [actions]);

  // 开机自启：和设置保持一致
  useEffect(() => {
    syncAutostart(state.launchAtLogin).catch(err => {
      console.error("开机自启设置失败", err);
      actions.toast("manager", "error", tx("开机自启没有设置成功"));
    });
  }, [state.launchAtLogin, actions]);

  // 一键更新：启动 8 秒后检查一次，之后每 6 小时一次；上次点了更新就告诉用户结果
  useEffect(
    () =>
      startUpdateWatcher(r => {
        if (r.result === "done") {
          // 开机自启时窗口是隐藏的：打开管理窗口，停在设置页
          actions.openManager("settings");
          void openManager({ section: "settings" });
          actions.toast("manager", "success", tx("已更新到 {0}", r.to));
        } else {
          actions.toast(
            "manager",
            "error",
            tx("没有更新到 {0}，现在还是 {1}", r.to, DESKTOP_VERSION)
          );
        }
      }),
    [actions]
  );

  const lang = useLang();
  return (
    <TeamSyncProvider>
      <div className="h-screen bg-ink">
        {/* 换语言时只重新挂载界面，外层的事件监听和同步不动 */}
        <ManagerApp key={lang} />
      </div>
    </TeamSyncProvider>
  );
}

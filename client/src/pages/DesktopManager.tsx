import { useEffect } from "react";
import { ManagerApp } from "@/components/manager/ManagerApp";
import type { ManagerSection } from "@/data/types";
import { onOpenManager, syncAutostart } from "@/lib/desktop";
import { useProto, type ManagerIntent } from "@/state/store";
import { tx, useLang } from "@/lib/i18n";

/** 桌面版的管理窗口。标题栏用系统原生的，页面铺满窗口。 */
export default function DesktopManager() {
  const { state, actions } = useProto();

  // 面板上点了入口：打开对应的页面（单机版没有亲友团页）
  useEffect(() => {
    const off = onOpenManager(req => {
      const section =
        req.section === "team" ? undefined : (req.section as ManagerSection);
      actions.openManager(
        section,
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

  const lang = useLang();
  return (
    <div className="h-screen bg-ink">
      {/* 换语言时只重新挂载界面，外层的事件监听不动 */}
      <ManagerApp key={lang} />
    </div>
  );
}

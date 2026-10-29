import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Segmented } from "@/components/common/ui";
import { GameImage } from "@/components/desktop/DesktopScreen";
import { TrayPanel } from "@/components/panel/TrayPanel";
import type { Platform } from "@/data/types";
import { useProto } from "@/state/store";

export default function PanelPage() {
  const { state, actions } = useProto();
  const [, navigate] = useLocation();

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink">
      <GameImage className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-45 blur-[2px]" />
      <div className="relative mx-auto flex min-h-screen max-w-[720px] flex-col items-center px-4 py-6">
        <div className="mb-5 flex w-full flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-ink/80 px-2.5 text-[12.5px] text-paper-2 ring-1 ring-inset ring-paper/10 hover:text-paper"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            回到演示台
          </Link>
          <span className="text-[12.5px] text-paper-2">
            托盘面板 · 实际尺寸 360 × 500
          </span>
          <span className="ml-auto">
            <Segmented<Platform>
              label="快捷键显示"
              value={state.platform}
              onChange={actions.setPlatform}
              options={[
                { value: "win", label: "Windows" },
                { value: "mac", label: "Mac" },
              ]}
            />
          </span>
        </div>
        <TrayPanel
          showPin={false}
          onOpenManager={(section, schemeId, intent) => {
            actions.openManager(section, schemeId, intent);
            navigate("/manager");
          }}
        />
      </div>
    </div>
  );
}

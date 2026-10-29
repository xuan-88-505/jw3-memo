import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Apple,
  BatteryFull,
  ChevronUp,
  Compass,
  FolderOpen,
  Globe,
  MessageCircle,
  Search,
  Settings,
  StickyNote,
  Volume2,
  Wifi,
} from "lucide-react";
import { HuangjiLaugh } from "@/components/brand/Marks";
import { ManagerApp } from "@/components/manager/ManagerApp";
import { TrayPanel } from "@/components/panel/TrayPanel";
import { pendingCount, myCharacters, useProto } from "@/state/store";
import { hotkeyKeys } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DemoNote,
  SCREEN_H,
  SCREEN_W,
  WindowFrame,
  useStageScale,
} from "./Stage";

export const GAME_SCENE =
  "/manus-storage/async-images/Pp06SKzGl2FLaqKfhCWqEW/image-1.webp";

/** 游戏画面。图片加载失败时显示一层暮色渐变，不出现破图 */
export function GameImage({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={className}
        style={{
          background:
            "radial-gradient(900px 420px at 70% 30%, rgb(214 160 96 / 0.35), transparent 70%), linear-gradient(180deg, #2b2a3a 0%, #3b3340 40%, #23262c 70%, #15171a 100%)",
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={GAME_SCENE}
      alt=""
      className={className}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

const WIN_WALL =
  "radial-gradient(1200px 700px at 30% 110%, #1f4fa8 0%, transparent 60%), radial-gradient(900px 600px at 75% 20%, #3b2a7a 0%, transparent 60%), linear-gradient(160deg, #0b1630 0%, #101a3a 45%, #0a0f22 100%)";
const MAC_WALL =
  "radial-gradient(1000px 650px at 20% 20%, #6d4a8c 0%, transparent 60%), radial-gradient(900px 700px at 85% 85%, #b0603a 0%, transparent 60%), linear-gradient(135deg, #2a2140 0%, #3a2a3a 50%, #4a2e26 100%)";

export function DesktopScreen() {
  const { state, actions } = useProto();
  const scale = useStageScale();
  const panelRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLButtonElement>(null);
  const mac = state.platform === "mac";
  const full = !mac && state.scene === "game-full";
  const gameWindow = !mac && state.scene === "game-window";
  const pending = state.team ? pendingCount(state) : 0;
  const [macAnchor, setMacAnchor] = useState(260);
  const [coachLeft, setCoachLeft] = useState(SCREEN_W - 240);

  // 快捷键：Alt+Q / ⌥Q 开关；Esc 收起；1–9 切换角色
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "KeyQ") {
        e.preventDefault();
        actions.togglePanel();
        return;
      }
      if (!state.panelOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape" && !state.pinned) {
        actions.setPanelOpen(false);
        return;
      }
      if (
        !typing &&
        /^[1-9]$/.test(e.key) &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const c = myCharacters(state)[Number(e.key) - 1];
        if (c) actions.selectCharacter(c.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, actions]);

  // 点击面板外部收起（钉住时不收起）
  const onScreenPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!state.panelOpen || state.pinned) return;
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || trayRef.current?.contains(t)) return;
      actions.setPanelOpen(false);
    },
    [state.panelOpen, state.pinned, actions]
  );

  // 钉住后拖动
  const onHeaderPointerDown = (e: ReactPointerEvent) => {
    if (!state.pinned || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    const base = { ...state.panelOffset };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      actions.setPanelOffset({
        x: Math.max(-(SCREEN_W - 400), Math.min(0, base.x + dx)),
        y: mac
          ? Math.max(0, Math.min(SCREEN_H - 640, base.y + dy))
          : Math.max(-(SCREEN_H - 680), Math.min(0, base.y + dy)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Mac：面板对齐到菜单栏图标下方；"点这里"提示对齐到托盘图标
  useLayoutEffect(() => {
    const el = trayRef.current;
    if (!el) return;
    const left = offsetLeftIn(el);
    const right = SCREEN_W - (left + el.offsetWidth);
    if (mac) setMacAnchor(Math.max(8, right - 8));
    setCoachLeft(
      Math.min(SCREEN_W - 232, Math.max(8, left + el.offsetWidth / 2 - 190))
    );
  }, [mac, state.platform, state.scene]);

  const panelStyle: React.CSSProperties = mac
    ? { top: 34 + state.panelOffset.y, right: macAnchor - state.panelOffset.x }
    : {
        right: 12 - state.panelOffset.x,
        bottom: (full ? 12 : 60) - state.panelOffset.y,
      };

  return (
    <div
      data-screen="true"
      className="absolute inset-0 overflow-hidden font-sans"
      onPointerDownCapture={onScreenPointerDown}
      style={{ background: full ? "#000" : mac ? MAC_WALL : WIN_WALL }}
    >
      {/* 游戏画面 */}
      {full && (
        <GameImage className="absolute inset-0 h-full w-full object-cover" />
      )}
      {gameWindow && <GameWindow />}

      {/* 管理窗口 */}
      {state.managerOpen && (
        <WindowFrame
          platform={state.platform}
          title="同调 · 管理"
          onClose={actions.closeManager}
          className="z-20"
          style={{
            left: (SCREEN_W - 1120) / 2,
            top: mac ? 64 : 40,
            width: 1120,
            height: 720,
          }}
        >
          <ManagerApp onOpenPanel={() => actions.setPanelOpen(true)} />
        </WindowFrame>
      )}

      {/* 系统栏 */}
      {mac ? (
        <MacMenuBar
          trayRef={trayRef}
          pending={pending}
          onTray={actions.togglePanel}
          active={state.panelOpen}
        />
      ) : (
        !full && (
          <WinTaskbar
            trayRef={trayRef}
            pending={pending}
            onTray={actions.togglePanel}
            active={state.panelOpen}
          />
        )
      )}
      {mac && <MacDock />}

      {/* 面板 */}
      {state.panelOpen && (
        <div
          ref={panelRef}
          className={cn(
            "absolute z-40",
            mac ? "animate-panel-down" : "animate-panel-up"
          )}
          style={panelStyle}
        >
          <TrayPanel onHeaderPointerDown={onHeaderPointerDown} />
        </div>
      )}

      {/* 演示说明 */}
      {!state.panelOpen && !state.coachSeen && !full && (
        <DemoNote
          className={cn(
            "absolute z-30 w-[220px]",
            mac ? "top-[40px]" : "bottom-[62px]"
          )}
          style={{ left: coachLeft }}
        >
          点这里打开面板，或按 {hotkeyKeys(state.platform).join(" + ")}
        </DemoNote>
      )}
      {full && !state.panelOpen && (
        <DemoNote className="absolute left-1/2 top-6 z-30 w-[520px] -translate-x-1/2 text-center">
          游戏全屏中，按 Alt + Q 呼出面板
          <br />
          <span className="text-gold/75">
            需设为无边框窗口，独占全屏会被盖住（实机待验证）
          </span>
        </DemoNote>
      )}
    </div>
  );
}

/** 元素相对模拟屏幕左边的距离（不受缩放影响） */
function offsetLeftIn(el: HTMLElement) {
  let left = 0;
  let node: HTMLElement | null = el;
  while (node && !node.dataset.screen) {
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return left;
}

function GameWindow() {
  return (
    <div className="absolute left-[60px] top-[28px] z-10 flex h-[760px] w-[1320px] flex-col overflow-hidden rounded-[8px] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/10">
      <div className="flex h-8 shrink-0 items-center bg-[#202020] pl-3 text-[12px] text-white/80">
        <span className="mr-2 grid h-4 w-4 place-items-center rounded-[3px] bg-[#3a2c1a] font-serif text-[10px] text-[#e9c77b]">
          剑
        </span>
        剑网3 · 旗舰（窗口模式）
        <span className="ml-auto flex h-full text-white/70">
          <span className="grid w-11 place-items-center">—</span>
          <span className="grid w-11 place-items-center">▢</span>
          <span className="grid w-11 place-items-center">✕</span>
        </span>
      </div>
      <GameImage className="min-h-0 w-full flex-1 object-cover" />
    </div>
  );
}

function WinTaskbar({
  trayRef,
  pending,
  onTray,
  active,
}: {
  trayRef: React.RefObject<HTMLButtonElement | null>;
  pending: number;
  onTray: () => void;
  active: boolean;
}) {
  const apps = [
    { key: "start", node: <WinLogo /> },
    {
      key: "search",
      node: <Search className="h-[18px] w-[18px] text-white/85" />,
    },
    { key: "files", node: <FolderOpen className="h-5 w-5 text-[#f4c542]" /> },
    { key: "edge", node: <Globe className="h-5 w-5 text-[#3bb8e8]" /> },
    {
      key: "jx3",
      node: (
        <span className="grid h-6 w-6 place-items-center rounded-[5px] bg-[#3a2c1a] font-serif text-[13px] text-[#e9c77b] ring-1 ring-[#e9c77b]/30">
          剑
        </span>
      ),
      running: true,
    },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center border-t border-white/[0.06] bg-[#1c1c1c]/[0.86] px-3 backdrop-blur-xl">
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
        {apps.map(a => (
          <span
            key={a.key}
            className="relative grid h-10 w-10 place-items-center rounded-md hover:bg-white/[0.06]"
          >
            {a.node}
            {a.running && (
              <span className="absolute bottom-0.5 h-[3px] w-1.5 rounded-full bg-white/60" />
            )}
          </span>
        ))}
      </div>
      <div className="ml-auto flex h-full items-center gap-0.5 text-white/85">
        <span className="grid h-9 w-7 place-items-center rounded hover:bg-white/[0.06]">
          <ChevronUp className="h-4 w-4" />
        </span>
        <button
          ref={trayRef}
          type="button"
          onClick={onTray}
          aria-label={`同调${pending ? `，${pending} 个角色待同步` : ""}`}
          aria-expanded={active}
          className={cn(
            "relative grid h-9 w-9 place-items-center rounded transition-colors hover:bg-white/[0.08]",
            active && "bg-white/[0.1]"
          )}
        >
          <HuangjiLaugh size={22} />
          {pending > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-[14px] min-w-[14px] animate-pop place-items-center rounded-[3px] bg-cinnabar px-[3px] text-[9.5px] font-semibold leading-none text-white ring-2 ring-[#1c1c1c]">
              {pending}
            </span>
          )}
        </button>
        <span className="flex h-9 items-center gap-2.5 rounded px-2 hover:bg-white/[0.06]">
          <Wifi className="h-4 w-4" />
          <Volume2 className="h-4 w-4" />
        </span>
        <span className="flex h-9 flex-col items-end justify-center rounded px-2 text-right text-[11.5px] leading-tight hover:bg-white/[0.06]">
          <Clock />
          <span>2026/10/28</span>
        </span>
      </div>
    </div>
  );
}

function Clock({ mac }: { mac?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!mac) return <span>{hm}</span>;
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  return (
    <span>
      {now.getMonth() + 1}月{now.getDate()}日 周{week} {hm}
    </span>
  );
}

function WinLogo() {
  return (
    <span className="grid grid-cols-2 gap-[2px]">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className="h-[8px] w-[8px] rounded-[1px] bg-[#4cc2ff]" />
      ))}
    </span>
  );
}

function MacMenuBar({
  trayRef,
  pending,
  onTray,
  active,
}: {
  trayRef: React.RefObject<HTMLButtonElement | null>;
  pending: number;
  onTray: () => void;
  active: boolean;
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex h-7 items-center bg-[#1e1a22]/55 px-3 text-[13px] text-white/90 backdrop-blur-xl">
      <Apple className="h-[15px] w-[15px] fill-white/90" strokeWidth={0} />
      <span className="ml-4 font-semibold">访达</span>
      {["文件", "编辑", "显示", "前往", "窗口", "帮助"].map(m => (
        <span key={m} className="ml-4 text-white/85">
          {m}
        </span>
      ))}
      <div className="ml-auto flex h-full items-center gap-1">
        <button
          ref={trayRef}
          type="button"
          onClick={onTray}
          aria-label={`同调${pending ? `，${pending} 个角色待同步` : ""}`}
          aria-expanded={active}
          className={cn(
            "flex h-[22px] items-center gap-1 rounded-[5px] px-1.5 transition-colors hover:bg-white/[0.12]",
            active && "bg-white/[0.18]"
          )}
        >
          <HuangjiLaugh size={17} />
          {pending > 0 && (
            <span className="text-[12px] font-medium tabular-nums text-[#ff9b85]">
              {pending}
            </span>
          )}
        </button>
        <span className="grid h-[22px] w-7 place-items-center">
          <BatteryFull className="h-4 w-4" />
        </span>
        <span className="grid h-[22px] w-7 place-items-center">
          <Wifi className="h-4 w-4" />
        </span>
        <span className="grid h-[22px] w-7 place-items-center">
          <Search className="h-[14px] w-[14px]" />
        </span>
        <span className="ml-1 text-[13px]">
          <Clock mac />
        </span>
      </div>
    </div>
  );
}

function MacDock() {
  const apps = [
    {
      bg: "linear-gradient(180deg,#4fb3ff,#1f6fe0)",
      icon: <FolderOpen className="h-6 w-6 text-white" />,
    },
    {
      bg: "linear-gradient(180deg,#e8f4ff,#bcd9f5)",
      icon: <Compass className="h-7 w-7 text-[#1e88e5]" />,
    },
    {
      bg: "linear-gradient(180deg,#6be675,#20b33a)",
      icon: <MessageCircle className="h-6 w-6 fill-white text-white" />,
    },
    {
      bg: "linear-gradient(180deg,#fff3a8,#f7d24a)",
      icon: <StickyNote className="h-6 w-6 text-[#8a6d00]" />,
    },
    {
      bg: "linear-gradient(180deg,#b9b9be,#7d7d84)",
      icon: <Settings className="h-6 w-6 text-white" />,
    },
  ];
  return (
    <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-end gap-2 rounded-[18px] bg-white/[0.16] px-2 py-1.5 ring-1 ring-white/20 backdrop-blur-xl">
      {apps.map((a, i) => (
        <span
          key={i}
          className="grid h-12 w-12 place-items-center rounded-[12px] shadow"
          style={{ background: a.bg }}
        >
          {a.icon}
        </span>
      ))}
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Btn, Segmented } from "@/components/common/ui";
import {
  IS_DESKTOP,
  RELEASES_URL,
  exportFile,
  openExternal,
  resetPanelPosition,
} from "@/lib/desktop";
import {
  DEFAULT_HOTKEYS,
  checkHotkey,
  hotkeyFromEvent,
  hotkeyParts,
  hotkeyText,
  isModifierCode,
  modifierParts,
  sameHotkey,
  type Hotkey,
} from "@/lib/hotkey";
import {
  isDefaultNav,
  parseData,
  serializeData,
  useProto,
  type ProtoState,
  type TrayMotion,
} from "@/state/store";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./shared";

const APP_VERSION = IS_DESKTOP ? "1.0.1" : "v0.1.0";

const MOTION_DESC: Record<TrayMotion, string> = {
  hover: "鼠标移上去时动；有新的更新时动 3 秒",
  always: "一直动，和游戏里一样",
  off: "一直静止",
};

export function SettingsView() {
  const { state, actions } = useProto();
  const mac = state.platform === "mac";
  const offline = state.dataState === "offline";
  const [checking, setChecking] = useState(false);

  const checkUpdate = () => {
    // 桌面版：打开发布页，看有没有新的安装包
    if (IS_DESKTOP) {
      void openExternal(RELEASES_URL);
      return;
    }
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      actions.toast("manager", "success", `已是最新版本 ${APP_VERSION}`);
    }, 900);
  };

  return (
    <div>
      <SectionHeader title="设置" />
      <div className="divide-y divide-paper/[0.07]">
        <SettingGroup title="快捷键">
          <HotkeyRow />
        </SettingGroup>

        <SettingGroup title="通用">
          {/* 系统托盘图标是静态图，桌面版没有动效可选 */}
          {!IS_DESKTOP && (
            <SettingRow
              titleId="set-motion"
              title="托盘表情动效"
              desc={MOTION_DESC[state.trayMotion]}
            >
              <Segmented<TrayMotion>
                label="托盘表情动效"
                value={state.trayMotion}
                onChange={actions.setTrayMotion}
                options={[
                  { value: "hover", label: "悬停时" },
                  { value: "always", label: "一直动" },
                  { value: "off", label: "不动" },
                ]}
              />
            </SettingRow>
          )}
          <SettingRow
            titleId="set-launch"
            title="开机自动启动"
            desc={mac ? "登录后在菜单栏待命" : "开机后在任务栏托盘待命"}
          >
            <Toggle
              checked={state.launchAtLogin}
              onChange={actions.setLaunchAtLogin}
              labelledBy="set-launch"
            />
          </SettingRow>
          <SettingRow
            title="面板位置"
            desc="按住面板顶部拖动，双击顶部回到原位"
          >
            <Btn
              size="sm"
              onClick={() => {
                // 桌面版的位置由系统记录，这里不知道是否已在默认位置，按钮一直可用
                if (IS_DESKTOP) void resetPanelPosition();
                else actions.resetPanelOffset();
                actions.toast("manager", "success", "面板已回到默认位置");
              }}
              disabled={
                !IS_DESKTOP && !state.panelOffset.x && !state.panelOffset.y
              }
              title={
                !IS_DESKTOP && !state.panelOffset.x && !state.panelOffset.y
                  ? "现在就在默认位置"
                  : undefined
              }
            >
              恢复默认
            </Btn>
          </SettingRow>
          <SettingRow title="侧栏顺序" desc="按住侧栏里的项目拖动排序">
            <Btn
              size="sm"
              onClick={() => {
                actions.resetNavOrder();
                actions.toast("manager", "success", "侧栏已恢复默认顺序");
              }}
              disabled={isDefaultNav(state)}
              title={isDefaultNav(state) ? "现在就是默认顺序" : undefined}
            >
              恢复默认
            </Btn>
          </SettingRow>
          <SettingRow
            title="版本"
            desc={IS_DESKTOP ? APP_VERSION : `${APP_VERSION} · 交互原型`}
          >
            <Btn
              size="sm"
              onClick={checkUpdate}
              disabled={checking || (!IS_DESKTOP && offline)}
              title={
                IS_DESKTOP
                  ? "打开发布页"
                  : offline
                    ? "离线时不能检查更新"
                    : undefined
              }
              icon={
                checking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : undefined
              }
            >
              {checking ? "正在检查" : "检查更新"}
            </Btn>
          </SettingRow>
        </SettingGroup>

        {IS_DESKTOP && (
          <SettingGroup title="数据">
            <DataRows />
          </SettingGroup>
        )}
      </div>
    </div>
  );
}

/* ---------------- 数据：导出、导入 ---------------- */

/** 文件名里的日期，如 20261030 */
function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function DataRows() {
  const { state, actions } = useProto();
  const fileRef = useRef<HTMLInputElement>(null);
  /** 选好了要导入的文件，等用户确认覆盖 */
  const [pending, setPending] = useState<Partial<ProtoState> | null>(null);

  const doExport = async () => {
    try {
      const ok = await exportFile(
        `备忘录数据-${today()}.json`,
        serializeData(state)
      );
      if (ok) actions.toast("manager", "success", "已导出");
    } catch {
      actions.toast("manager", "error", "导出失败，换个位置再试");
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const data = parseData(await file.text());
    if (!data) {
      actions.toast("manager", "error", "这个文件不是备忘录导出的数据");
      return;
    }
    setPending(data);
  };

  const summary = pending
    ? `${pending.characters?.length ?? 0} 个角色、${pending.schemes?.length ?? 0} 个方案、${Object.keys(pending.loadouts ?? {}).length} 套配装`
    : "";

  return (
    <>
      <SettingRow title="导出数据" desc="存成一个文件，在另一台电脑上导入">
        <Btn size="sm" onClick={() => void doExport()}>
          导出
        </Btn>
      </SettingRow>
      <SettingRow
        title="导入数据"
        desc={
          pending ? (
            <span className="text-gold">
              文件里有 {summary}。导入后本机现有的数据会被替换。
            </span>
          ) : (
            "用导出的文件替换本机数据"
          )
        }
      >
        {pending ? (
          <>
            <Btn size="sm" variant="ghost" onClick={() => setPending(null)}>
              取消
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => {
                actions.importData(pending);
                setPending(null);
                actions.toast("manager", "success", "已导入");
              }}
            >
              替换并导入
            </Btn>
          </>
        ) : (
          <Btn size="sm" onClick={() => fileRef.current?.click()}>
            选择文件
          </Btn>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={e => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </SettingRow>
    </>
  );
}

/* ---------------- 快捷键 ---------------- */

type Held = Pick<Hotkey, "ctrl" | "alt" | "shift" | "meta">;
const NONE: Held = { ctrl: false, alt: false, shift: false, meta: false };

function HotkeyRow() {
  const { state, actions } = useProto();
  const platform = state.platform;
  const hk = state.hotkeys[platform];
  const def = DEFAULT_HOTKEYS[platform];
  const isDefault = sameHotkey(hk, def);
  const current = checkHotkey(hk, platform);

  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<Held>(NONE);
  const [error, setError] = useState("");
  const recRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);

  const stop = () => {
    setRecording(false);
    setHeld(NONE);
    setError("");
    actions.setRecordingHotkey(false);
  };
  /** 用键盘结束录制时，焦点回到"修改"按钮 */
  const stopAndRefocus = () => {
    stop();
    requestAnimationFrame(() => editRef.current?.focus());
  };
  const start = () => {
    setError("");
    setHeld(NONE);
    setRecording(true);
    actions.setRecordingHotkey(true);
  };

  // 离开页面时恢复全局快捷键
  useEffect(() => () => actions.setRecordingHotkey(false), [actions]);
  useEffect(() => {
    if (recording) recRef.current?.focus();
  }, [recording]);

  useEffect(() => {
    if (!recording) return;
    const read = (e: KeyboardEvent): Held => ({
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    });
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      if (e.code === "Escape" && plain) {
        stopAndRefocus();
        return;
      }
      if (isModifierCode(e.code)) {
        setHeld(read(e));
        return;
      }
      const next = hotkeyFromEvent(e);
      const r = checkHotkey(next, platform);
      if (!r.ok) {
        // 留在录制状态，可以直接再按一次
        setError(r.error);
        setHeld(NONE);
        return;
      }
      stopAndRefocus();
      if (!sameHotkey(next, hk)) {
        actions.setHotkey(platform, next);
        actions.toast(
          "manager",
          "success",
          `快捷键改成 ${hotkeyText(next, platform)}`
        );
      }
    };
    const onUp = (e: KeyboardEvent) => setHeld(read(e));
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
    // stop 只改本组件状态，不需要放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, platform, hk, actions]);

  const heldParts = modifierParts(held, platform);
  const message =
    recording && error ? (
      <Message tone="error">{error}</Message>
    ) : !recording && current.ok && current.warn ? (
      <Message tone="warn">{current.warn}</Message>
    ) : null;

  return (
    <div>
      <SettingRow
        titleId="hk-label"
        title="呼出面板"
        desc="全局快捷键，游戏里也能用 · 只对这台电脑生效"
      >
        {recording ? (
          <>
            <div
              ref={recRef}
              tabIndex={-1}
              role="status"
              aria-labelledby="hk-label"
              aria-describedby="hk-msg"
              onBlur={stop}
              className="flex h-8 min-w-[168px] items-center gap-2 rounded-lg bg-cinnabar/[0.07] pl-2.5 pr-3 outline-none ring-2 ring-inset ring-cinnabar-text/60"
            >
              <span
                className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cinnabar"
                aria-hidden="true"
              />
              {heldParts.length ? (
                <KeyChips keys={[...heldParts, "…"]} />
              ) : (
                <span className="text-[13px] text-paper-2">按下新的组合键</span>
              )}
            </div>
            <Btn
              variant="ghost"
              size="sm"
              title="Esc"
              onMouseDown={e => e.preventDefault()}
              onClick={stopAndRefocus}
            >
              取消
            </Btn>
          </>
        ) : (
          <>
            <KeyChips keys={hotkeyParts(hk, platform)} />
            <span className="ml-1 flex items-center gap-1">
              {!isDefault && (
                <Btn
                  variant="ghost"
                  size="sm"
                  title={`恢复默认 ${hotkeyText(def, platform)}`}
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => {
                    actions.resetHotkey(platform);
                    actions.toast(
                      "manager",
                      "success",
                      `已恢复默认 ${hotkeyText(def, platform)}`
                    );
                  }}
                >
                  恢复默认
                </Btn>
              )}
              <Btn
                ref={editRef}
                size="sm"
                aria-describedby="hk-msg"
                onClick={start}
              >
                修改
              </Btn>
            </span>
          </>
        )}
      </SettingRow>
      <div id="hk-msg" aria-live="polite">
        {message && <div className="-mt-1 pb-3.5">{message}</div>}
      </div>
    </div>
  );
}

/* ---------------- 通用小组件 ---------------- */

function SettingGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="py-6 first:pt-0">
      <h2 className="text-[12px] font-medium text-paper-3">{title}</h2>
      <div className="divide-y divide-paper/[0.07]">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  desc,
  titleId,
  children,
}: {
  title: string;
  desc?: ReactNode;
  titleId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[60px] items-center gap-6 py-3">
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="text-[14px] font-medium text-paper">
          {title}
        </h3>
        {desc && <p className="mt-0.5 text-[12.5px] text-paper-3">{desc}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  labelledBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelledBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar-text/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-2",
        checked
          ? "bg-cinnabar-fill"
          : "bg-paper/[0.12] ring-1 ring-inset ring-paper/12"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-4 w-4 rounded-full bg-paper shadow-sm transition-transform duration-150",
          checked ? "translate-x-[19px]" : "translate-x-[3px]"
        )}
      />
    </button>
  );
}

function KeyChips({ keys }: { keys: string[] }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="inline-grid h-6 min-w-6 place-items-center rounded-[5px] bg-paper/[0.08] px-1.5 font-sans text-[12px] font-medium text-paper ring-1 ring-inset ring-paper/12"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

function Message({
  tone,
  children,
}: {
  tone: "error" | "warn";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[12.5px]",
        tone === "error" ? "text-cinnabar-text" : "text-gold"
      )}
    >
      <AlertTriangle
        className="mt-px h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      {children}
    </p>
  );
}

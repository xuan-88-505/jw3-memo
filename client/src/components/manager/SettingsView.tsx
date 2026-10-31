import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Crown } from "@/components/brand/Crown";
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
import { InlineModal } from "@/components/common/overlay";
import { ROLE_LABEL, relativeTime } from "@/lib/format";
import { teamErrorText, useTeam } from "@/lib/team/TeamSync";
import { LoginCodeDialog } from "./LoginCodeDialog";
import { SectionHeader, SelectBox, inputCls } from "./shared";
import { FeedbackDialog } from "./FeedbackDialog";
import { ME_ID } from "@/data/seed";
import { LANGS, setLang, tx, useLang, type Lang } from "@/lib/i18n";

const APP_VERSION = IS_DESKTOP ? "1.0.3" : "v0.1.0";

const MOTION_DESC: Record<TrayMotion, string> = {
  hover: "鼠标移上去时动；有新的更新时动 3 秒",
  always: "一直动，和游戏里一样",
  off: "一直静止",
};

export function SettingsView() {
  const { state, actions } = useProto();
  const atDefault =
    !state.panelOffset.x && !state.panelOffset.y && !state.panelSize;
  const mac = state.platform === "mac";
  const lang = useLang();
  const offline = state.dataState === "offline";
  const [checking, setChecking] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const checkUpdate = () => {
    // 桌面版：打开发布页，看有没有新的安装包
    if (IS_DESKTOP) {
      void openExternal(RELEASES_URL);
      return;
    }
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      actions.toast("manager", "success", tx("已是最新版本 {0}", APP_VERSION));
    }, 900);
  };

  return (
    <div>
      <SectionHeader title={tx("设置")} />
      <div className="divide-y divide-paper/[0.07]">
        <AccountGroup />

        <SettingGroup title={tx("快捷键")}>
          <HotkeyRow />
        </SettingGroup>

        <SettingGroup title={tx("通用")}>
          <SettingRow titleId="set-lang" title={tx("语言")}>
            <SelectBox
              aria-labelledby="set-lang"
              value={lang}
              onChange={e => setLang(e.target.value as Lang)}
              wrapClassName="w-[140px]"
              className="h-8 rounded-md bg-paper/[0.04] pl-3 text-[13px] text-paper ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60"
            >
              {LANGS.map(l => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </SelectBox>
          </SettingRow>
          {/* 桌面版由 src-tauri/src/tray_motion.rs 轮换托盘图标的两帧 */}
          <SettingRow
            titleId="set-motion"
            title={tx("托盘表情动效")}
            desc={tx(MOTION_DESC[state.trayMotion])}
          >
            <Segmented<TrayMotion>
              label={tx("托盘表情动效")}
              value={state.trayMotion}
              onChange={actions.setTrayMotion}
              options={[
                { value: "hover", label: tx("悬停时") },
                { value: "always", label: tx("一直动") },
                { value: "off", label: tx("不动") },
              ]}
            />
          </SettingRow>
          <SettingRow
            titleId="set-launch"
            title={tx("开机自动启动")}
            desc={mac ? tx("登录后在菜单栏待命") : tx("开机后在任务栏托盘待命")}
          >
            <Toggle
              checked={state.launchAtLogin}
              onChange={actions.setLaunchAtLogin}
              labelledBy="set-launch"
            />
          </SettingRow>
          <SettingRow
            title={tx("面板位置和大小")}
            desc={tx("按住顶部拖动，拖边缘调整大小，双击顶部回到原位")}
          >
            <Btn
              size="sm"
              onClick={() => {
                // 桌面版的位置和大小由系统记录，这里不知道是否已是默认，按钮一直可用
                if (IS_DESKTOP) void resetPanelPosition({ size: true });
                else actions.resetPanelLayout();
                actions.toast(
                  "manager",
                  "success",
                  tx("面板已恢复默认位置和大小")
                );
              }}
              disabled={!IS_DESKTOP && atDefault}
              title={
                !IS_DESKTOP && atDefault
                  ? tx("现在就是默认位置和大小")
                  : undefined
              }
            >
              {tx("恢复默认")}
            </Btn>
          </SettingRow>
          <SettingRow
            title={tx("侧栏顺序")}
            desc={tx("按住侧栏里的项目拖动排序")}
          >
            <Btn
              size="sm"
              onClick={() => {
                actions.resetNavOrder();
                actions.toast("manager", "success", tx("侧栏已恢复默认顺序"));
              }}
              disabled={isDefaultNav(state)}
              title={isDefaultNav(state) ? tx("现在就是默认顺序") : undefined}
            >
              {tx("恢复默认")}
            </Btn>
          </SettingRow>
          <SettingRow
            title={tx("版本")}
            desc={
              <span>
                {IS_DESKTOP ? APP_VERSION : tx("{0} · 交互原型", APP_VERSION)}
              </span>
            }
          >
            <Btn
              size="sm"
              onClick={checkUpdate}
              disabled={checking || (!IS_DESKTOP && offline)}
              title={
                IS_DESKTOP
                  ? tx("打开发布页")
                  : offline
                    ? tx("离线时不能检查更新")
                    : undefined
              }
              icon={
                checking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : undefined
              }
            >
              {checking ? tx("正在检查") : tx("检查更新")}
            </Btn>
          </SettingRow>
          <SettingRow
            title={tx("意见反馈")}
            desc={tx("问题和建议直接发给作者")}
          >
            <Btn size="sm" onClick={() => setFeedbackOpen(true)}>
              {tx("写反馈")}
            </Btn>
          </SettingRow>
        </SettingGroup>

        {IS_DESKTOP && (
          <SettingGroup title={tx("数据")}>
            <DataRows />
          </SettingGroup>
        )}
        <AuthorRow />
      </div>
      <FeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        appVersion={APP_VERSION}
      />
    </div>
  );
}

/**
 * 作者标识：放在设置页最下面，比其他设置行弱一级（字小、灰色、行矮）。
 * 名字前戴像素皇冠，放在右边。名字五种语言都不翻译。
 */
function AuthorRow() {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-6 py-2.5">
      <h3 className="text-[13px] text-paper-3">{tx("作者")}</h3>
      <p className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-paper-3">
        <span aria-hidden="true" className="inline-flex opacity-80">
          <Crown />
        </span>
        88 by manus
      </p>
    </div>
  );
}

/* ---------------- 数据：导出、导入 ---------------- */

/* ---------------- 账号：亲友团登录 ---------------- */

/** 桌面版才有。没加入时引导去亲友团页；加入后显示所在亲友团、生成登录码、退出登录 */
function AccountGroup() {
  const { state, actions } = useProto();
  const session = useTeam();
  const [codeOpen, setCodeOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  const acc = session.account;
  const self = state.members.find(m => m.id === ME_ID);
  const offline = state.dataState === "offline";

  if (!acc || !state.team)
    return (
      <SettingGroup title={tx("账号")}>
        <SettingRow
          title={tx("亲友团")}
          desc={tx("还没加入。加入后和亲友共用方案和记录，换电脑也能登录")}
        >
          <Btn size="sm" onClick={() => actions.setSection("team")}>
            {tx("去加入")}
          </Btn>
        </SettingRow>
      </SettingGroup>
    );

  const syncing = session.status === "syncing";
  const parts = [
    state.team.name,
    self ? ROLE_LABEL[self.role] : "",
    offline
      ? tx("离线")
      : acc.lastSyncAt
        ? tx("上次同步：{0}", relativeTime(acc.lastSyncAt))
        : "",
  ].filter(Boolean);

  const logout = async () => {
    setBusy(true);
    try {
      await session.logout();
      setLeaving(false);
      actions.toast("manager", "success", tx("已退出登录，数据已备份"));
    } catch (err) {
      actions.toast("manager", "error", teamErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingGroup title={tx("账号")}>
      <SettingRow
        title={self?.name ?? tx("亲友团")}
        desc={parts.join(" · ")}
      >
        <Btn
          size="sm"
          onClick={() => void session.syncNow()}
          disabled={syncing}
          icon={
            syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined
          }
        >
          {syncing ? tx("正在同步") : tx("立即同步")}
        </Btn>
      </SettingRow>
      <SettingRow
        title={tx("在另一台电脑登录")}
        desc={tx("生成登录码，10 分钟内有效")}
      >
        <Btn
          size="sm"
          onClick={() => setCodeOpen(true)}
          disabled={offline}
          title={offline ? tx("离线时不能生成") : undefined}
        >
          {tx("生成登录码")}
        </Btn>
      </SettingRow>
      <SettingRow
        title={tx("退出登录")}
        desc={tx("退出前自动备份。你的角色、方案、配装和便签留在本机")}
      >
        <Btn size="sm" variant="danger" onClick={() => setLeaving(true)}>
          {tx("退出登录")}
        </Btn>
      </SettingRow>
      <LoginCodeDialog open={codeOpen} onClose={() => setCodeOpen(false)} />
      <InlineModal
        open={leaving}
        onClose={() => !busy && setLeaving(false)}
        title={tx("退出亲友团登录？")}
        description={tx(
          "本机会先备份一份数据。别人的角色和共用的记录会从本机移除，用登录码或邀请码可以再登录。"
        )}
        footer={
          <>
            <Btn
              variant="ghost"
              size="md"
              onClick={() => setLeaving(false)}
              disabled={busy}
            >
              {tx("取消")}
            </Btn>
            <Btn
              variant="primary"
              size="md"
              onClick={() => void logout()}
              disabled={busy}
              icon={
                busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined
              }
            >
              {tx("退出登录")}
            </Btn>
          </>
        }
      />
    </SettingGroup>
  );
}

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
  // 在亲友团里不能导入：整份替换会把本机的旧数据当成改动同步给亲友
  const inTeam = !!state.team;

  const doExport = async () => {
    try {
      const ok = await exportFile(
        tx("备忘录数据-{0}.json", today()),
        serializeData(state)
      );
      if (ok) actions.toast("manager", "success", tx("已导出"));
    } catch {
      actions.toast("manager", "error", tx("导出失败，换个位置再试"));
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const data = parseData(await file.text());
    if (!data) {
      actions.toast("manager", "error", tx("这个文件不是备忘录导出的数据"));
      return;
    }
    setPending(data);
  };

  const summary = pending
    ? tx(
        "{0} 个角色、{1} 个方案、{2} 套配装",
        pending.characters?.length ?? 0,
        pending.schemes?.length ?? 0,
        Object.keys(pending.loadouts ?? {}).length
      )
    : "";

  return (
    <>
      <SettingRow
        title={tx("导出数据")}
        desc={tx("存成一个文件，在另一台电脑上导入")}
      >
        <Btn size="sm" onClick={() => void doExport()}>
          {tx("导出")}
        </Btn>
      </SettingRow>
      <SettingRow
        title={tx("导入数据")}
        desc={
          inTeam ? (
            tx("在亲友团里不能导入，先退出登录")
          ) : pending ? (
            <span className="text-gold">
              {tx("文件里有 {0}。导入后本机现有的数据会被替换。", summary)}
            </span>
          ) : (
            tx("用导出的文件替换本机数据")
          )
        }
      >
        {pending ? (
          <>
            <Btn size="sm" variant="ghost" onClick={() => setPending(null)}>
              {tx("取消")}
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => {
                actions.importData(pending);
                setPending(null);
                actions.toast("manager", "success", tx("已导入"));
              }}
            >
              {tx("替换并导入")}
            </Btn>
          </>
        ) : (
          <Btn
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={inTeam}
          >
            {tx("选择文件")}
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
          tx("快捷键改成 {0}", hotkeyText(next, platform))
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
        title={tx("呼出面板")}
        desc={tx("全局快捷键，游戏里也能用 · 只对这台电脑生效")}
      >
        {recording ? (
          <>
            {/* 录制中：和输入框聚焦一样的中性样式 + 闪烁光标；按住的键实时显示成键帽；只有出错时边框变红 */}
            <div
              ref={recRef}
              tabIndex={-1}
              role="status"
              aria-labelledby="hk-label"
              aria-describedby="hk-msg"
              onBlur={stop}
              className={cn(
                "flex h-8 min-w-[168px] items-center gap-1.5 rounded-lg bg-paper/[0.06] px-2.5 outline-none ring-1 ring-inset",
                error ? "ring-cinnabar-text/60" : "ring-paper/30"
              )}
            >
              {heldParts.length > 0 && <KeyChips keys={heldParts} />}
              <span
                className="caret-blink h-4 w-px shrink-0 bg-paper-2"
                aria-hidden="true"
              />
              {heldParts.length === 0 && (
                <span className="text-[13px] text-paper-3">
                  {tx("按下组合键")}
                </span>
              )}
            </div>
            <Btn
              variant="ghost"
              size="sm"
              title="Esc"
              onMouseDown={e => e.preventDefault()}
              onClick={stopAndRefocus}
            >
              {tx("取消")}
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
                  title={tx("恢复默认 {0}", hotkeyText(def, platform))}
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => {
                    actions.resetHotkey(platform);
                    actions.toast(
                      "manager",
                      "success",
                      tx("已恢复默认 {0}", hotkeyText(def, platform))
                    );
                  }}
                >
                  {tx("恢复默认")}
                </Btn>
              )}
              <Btn
                ref={editRef}
                size="sm"
                aria-describedby="hk-msg"
                onClick={start}
              >
                {tx("修改")}
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
    // 分组名不显示，只给读屏用；各组连成一个列表，用同样的分隔线隔开
    <section aria-label={title} className="divide-y divide-paper/[0.07]">
      {children}
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
  /** 右侧操作；纯信息行不传 */
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60px] items-center gap-6 py-3">
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="text-[14px] font-medium text-paper">
          {title}
        </h3>
        {desc && <p className="mt-0.5 text-[12.5px] text-paper-3">{desc}</p>}
      </div>
      {children != null && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
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
        // 滑块用 padding + margin 定位，和底座一起排版：
        // 用 transform 时，Windows 125%/150% 缩放下滑块会单独对齐像素，和底座差半个到一个像素，看着歪
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar-text/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-2",
        checked
          ? "bg-cinnabar-fill"
          : "bg-paper/[0.12] ring-1 ring-inset ring-paper/12"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          // 阴影四周一样，不往下偏，否则下边显得更厚
          "h-4 w-4 shrink-0 rounded-full bg-paper shadow-[0_0_2px_rgb(0_0_0/0.3)] transition-[margin-left] duration-150",
          checked ? "ml-4" : "ml-0"
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

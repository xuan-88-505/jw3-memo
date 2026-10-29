import { AlertTriangle, Loader2, Search, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import {
  blackEntriesFor,
  lookupRole,
  roleByUid,
  schoolMeta,
  type BlackEntry,
  type GameRole,
} from "@/data/records";
import { cn } from "@/lib/utils";
import { inputCls } from "../shared";

export function SchoolMark({
  school,
  size = 20,
  className,
}: {
  school: string;
  size?: number;
  className?: string;
}) {
  const m = schoolMeta(school);
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[5px] font-serif font-semibold",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.55),
        color: m.color,
        background: `${m.color}1F`,
        boxShadow: `inset 0 0 0 1px ${m.color}40`,
      }}
      title={school}
      aria-hidden="true"
    >
      {m.short}
    </span>
  );
}

export function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 表格里的角色名：门派标记 + 当前名字；改过名时显示曾用名 */
export function RoleName({
  uid,
  fallbackName,
  server,
  blackHit,
  stacked = false,
}: {
  uid: string | null;
  fallbackName?: string;
  server?: string;
  /** 在避雷名单里时，名字后面显示警示图标 */
  blackHit?: BlackEntry[];
  /** 曾用名另起一行显示 */
  stacked?: boolean;
}) {
  const role = roleByUid(uid);
  if (!role) {
    if (!fallbackName) return <span className="text-paper-3">—</span>;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] bg-ink-4 text-[11px] text-paper-3 ring-1 ring-inset ring-paper/10">
          ?
        </span>
        <span
          className="truncate"
          title={server ? `${fallbackName} · ${server}` : fallbackName}
        >
          {fallbackName}
        </span>
      </span>
    );
  }
  const former = role.formerNames.map(f => f.name);
  const tip = [
    `${role.name} · ${role.server} · ${role.school}`,
    former.length ? `曾用名：${former.join("、")}` : "",
    blackHit?.length
      ? `避雷：${Array.from(new Set(blackHit.flatMap(b => b.tags))).join("、")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="flex min-w-0 items-center gap-2" title={tip}>
      <SchoolMark school={role.school} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{role.name}</span>
          {blackHit && blackHit.length > 0 && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 text-cinnabar-text"
              aria-label="在避雷名单里"
            />
          )}
        </span>
        {stacked && former.length > 0 && (
          <span className="block truncate text-[11.5px] text-paper-3">
            曾用名 {former.join("、")}
          </span>
        )}
      </span>
    </span>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

/**
 * 角色查找：选服务器，输入角色名或 UID，回车或点放大镜查找。
 * 匹配到后显示角色卡片，按 UID 保存。
 */
export function RoleLookup({
  id,
  value,
  onChange,
  blacklist,
  defaultServer = "梦江南",
  online,
  disabled,
  showBlackWarning = true,
  onNotFound,
  invalid,
}: {
  id: string;
  value: GameRole | null;
  onChange: (role: GameRole | null) => void;
  blacklist: BlackEntry[];
  defaultServer?: string;
  online: boolean;
  disabled?: boolean;
  /** 匹配到的角色在避雷名单里时，卡片下方显示警示 */
  showBlackWarning?: boolean;
  /** 没找到时通知外层（例如提供"按名字记下"） */
  onNotFound?: (name: string, server: string) => void;
  /** 外层校验失败时，输入框标红 */
  invalid?: boolean;
}) {
  const [server, setServer] = useState(value?.server ?? defaultServer);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  /** 用曾用名查到时，记下输入的旧名字 */
  const [viaFormer, setViaFormer] = useState<string | null>(null);

  const run = async () => {
    if (!online || disabled) return;
    setStatus({ kind: "loading" });
    const res = await lookupRole(text, server);
    if (res.kind === "found") {
      setStatus({ kind: "idle" });
      setViaFormer(res.via === "former" ? text.trim() : null);
      onChange(res.role);
      return;
    }
    setStatus({ kind: "error", message: res.message });
    if (res.kind === "not-found") onNotFound?.(text.trim(), server);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      run();
    }
  };

  if (value) {
    const hits = showBlackWarning ? blackEntriesFor(blacklist, value) : [];
    const lastFormer = value.formerNames[value.formerNames.length - 1];
    return (
      <div>
        <div className="flex items-start gap-3 rounded-lg bg-ink px-3 py-2.5 ring-1 ring-inset ring-paper/12">
          <SchoolMark school={value.school} size={32} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-paper">
              {value.name}
              <span className="ml-1.5 font-normal text-paper-3">
                · {value.server}
              </span>
            </p>
            <p className="mt-0.5 truncate text-[12px] text-paper-3">
              {value.school} · {value.body} · {value.camp}
              {value.tong ? ` · ${value.tong}` : ""} · UID {value.uid}
            </p>
            {viaFormer ? (
              <p className="mt-1 text-[12px] text-gold">
                「{viaFormer}」已改名为「{value.name}」
              </p>
            ) : (
              lastFormer && (
                <p className="mt-1 text-[12px] text-paper-3">
                  曾用名 {value.formerNames.map(f => f.name).join("、")}（
                  {fmtDay(lastFormer.until)}改名）
                </p>
              )
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setViaFormer(null);
                setText("");
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-paper-3 transition-colors hover:bg-paper/[0.06] hover:text-paper"
              aria-label="换一个角色"
              title="换一个角色"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {hits.length > 0 && (
          <p
            role="alert"
            className="mt-2 flex items-start gap-1.5 rounded-md bg-cinnabar/[0.10] px-2.5 py-2 text-[12px] text-cinnabar-text ring-1 ring-inset ring-cinnabar/25"
          >
            <AlertTriangle
              className="mt-px h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              在避雷名单里：
              {Array.from(new Set(hits.flatMap(h => h.tags))).join("、")}
              {hits[0].reason ? `。${hits[0].reason}` : ""}
            </span>
          </p>
        )}
      </div>
    );
  }

  const loading = status.kind === "loading";
  const blocked = !online || disabled;
  return (
    <div>
      <div className="flex gap-2">
        <input
          aria-label="服务器"
          value={server}
          disabled={blocked || loading}
          maxLength={8}
          onChange={e => {
            setServer(e.target.value.replace(/\s/g, ""));
            if (status.kind === "error") setStatus({ kind: "idle" });
          }}
          onKeyDown={onKey}
          placeholder="服务器"
          className={cn(inputCls(), "w-[96px] shrink-0")}
        />
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            value={text}
            disabled={blocked || loading}
            onChange={e => {
              setText(e.target.value);
              if (status.kind === "error") setStatus({ kind: "idle" });
            }}
            onKeyDown={onKey}
            placeholder={online ? "角色名或 UID，回车查找" : "离线时不能查找"}
            aria-invalid={status.kind === "error" || invalid || undefined}
            className={cn(inputCls(status.kind === "error" || invalid), "pr-9")}
          />
          <button
            type="button"
            onClick={run}
            disabled={blocked || loading || !text.trim()}
            className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-paper-3 transition-colors enabled:hover:bg-paper/[0.06] enabled:hover:text-paper disabled:opacity-50"
            aria-label="查找角色"
            title="查找"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {status.kind === "error" && (
        <p role="alert" className="mt-1.5 text-[12px] text-cinnabar-text">
          {status.message}
        </p>
      )}
    </div>
  );
}

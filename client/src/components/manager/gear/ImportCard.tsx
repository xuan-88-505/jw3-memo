import { CheckCircle2, Download, Loader2, WifiOff } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  IMPORT_KIND_LABEL,
  IMPORT_SOURCE,
  SAMPLE_MYCODE,
  decodeMyCode,
  parseImport,
  type LoadoutSource,
  type MyCodeSummary,
} from "@/data/gear";
import { Btn } from "@/components/common/ui";
import { cn } from "@/lib/utils";

/** 装备码解码状态 */
type Decode =
  | { state: "idle" }
  | { state: "busy" }
  | { state: "ok"; summary: MyCodeSummary }
  | { state: "fail" };

/** 导入框的状态：识别、装备码解码、能不能提交 */
export function useImportInput() {
  const [text, setTextRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const [decode, setDecode] = useState<Decode>({ state: "idle" });
  const parsed = parseImport(text);
  const code = parsed.ok && parsed.kind === "mycode" ? parsed.code! : null;

  // 装备码要解开才知道内容对不对；链接和 ID 不用
  useEffect(() => {
    if (!code) {
      setDecode({ state: "idle" });
      return;
    }
    let alive = true;
    setDecode({ state: "busy" });
    decodeMyCode(code)
      .then(summary => alive && setDecode({ state: "ok", summary }))
      .catch(() => alive && setDecode({ state: "fail" }));
    return () => {
      alive = false;
    };
  }, [code]);

  const codeBad = !!code && decode.state === "fail";
  const ready = parsed.ok && (!code || decode.state === "ok");

  return {
    text,
    setText: (v: string) => {
      setTextRaw(v);
      setTouched(false);
    },
    parsed,
    decode,
    code,
    codeBad,
    showError: (touched && !parsed.ok) || codeBad,
    /** 按钮能不能点：空的、装备码坏了、还在解码时不能点 */
    canSubmit: !!text.trim() && !codeBad && (!code || ready),
    /** 点导入：标记已提交；内容可用时返回来源 */
    submit(): { source: LoadoutSource; sourceId: string | null } | null {
      setTouched(true);
      if (!parsed.ok || !ready) return null;
      return { source: IMPORT_SOURCE[parsed.kind], sourceId: parsed.sourceId };
    },
  };
}

export type ImportInput = ReturnType<typeof useImportInput>;

/** 粘贴框 + 识别结果 */
export function ImportField({
  input,
  label,
  labelClassName,
  charName,
  xinfa,
  talentSource,
  onSubmitKey,
}: {
  input: ImportInput;
  label: ReactNode;
  labelClassName?: string;
  /** 关联的角色名；没关联角色时为空 */
  charName?: string;
  xinfa: string;
  /** "紫霞功 PVE v4"；没有方案时为 null */
  talentSource: string | null;
  onSubmitKey: () => void;
}) {
  const id = useId();
  const { parsed, decode, code, codeBad, showError } = input;

  let detail: string | null = null;
  if (parsed.ok && decode.state === "ok") {
    const s = decode.summary;
    detail = [
      `${s.items} 件装备`,
      s.strength &&
        (s.strength[0] === s.strength[1]
          ? `精炼 ${s.strength[0]}`
          : `精炼 ${s.strength[0]}–${s.strength[1]}`),
      s.stone && `五行石 ${s.stone} 级`,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (parsed.ok && !code) {
    detail = `${xinfa} · 12 件装备`;
  }

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <textarea
        id={id}
        value={input.text}
        rows={3}
        spellCheck={false}
        onChange={e => input.setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmitKey();
        }}
        aria-invalid={showError || undefined}
        aria-describedby={`${id}-msg`}
        placeholder={"粘贴茗伊插件导出的装备码\n也可以贴魔盒配装链接"}
        className={cn(
          "mt-2 block w-full resize-none break-all rounded-lg bg-ink px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-paper placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2",
          showError
            ? "ring-cinnabar/70 focus:ring-cinnabar"
            : "ring-paper/12 focus:ring-cinnabar-text/60"
        )}
      />

      <div id={`${id}-msg`} className="mt-2.5 min-h-[40px]">
        {codeBad ? (
          <p role="alert" className="text-[12.5px] text-cinnabar-text">
            装备码不完整，回游戏里重新点一次「导出」，全部复制
          </p>
        ) : parsed.ok && decode.state === "busy" ? (
          <p className="flex items-center gap-2 text-[12.5px] text-paper-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            正在读装备码…
          </p>
        ) : parsed.ok ? (
          <div className="flex items-start gap-2 text-[12.5px]">
            <CheckCircle2
              className="mt-px h-4 w-4 shrink-0 text-jade"
              aria-hidden="true"
            />
            <div>
              <p className="text-paper">
                认出来了：{IMPORT_KIND_LABEL[parsed.kind]}
                {parsed.sourceId && (
                  <span className="tabular-nums">
                    {" "}
                    · 方案 #{parsed.sourceId}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-paper-3">
                {detail}
                {" · "}奇穴用
                {talentSource ? ` ${talentSource}` : "配装里自带的"}
              </p>
              {code && (
                <p className="mt-0.5 text-paper-3">
                  {charName
                    ? `装备码里没有角色名，确认是「${charName}」身上这套`
                    : `装备码里没有心法，确认是${xinfa}的配装`}
                </p>
              )}
            </div>
          </div>
        ) : showError ? (
          <p role="alert" className="text-[12.5px] text-cinnabar-text">
            {parsed.reason}
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-paper-3">
            游戏里打开 茗伊插件 → 角色统计 → 装备统计，点右上角「导出」。
            <button
              type="button"
              onClick={() => input.setText(SAMPLE_MYCODE)}
              className="ml-1 text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
            >
              填入示例
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/** 页面里的导入卡片：重新导入、计算中 */
export function ImportCard({
  title,
  charName,
  xinfa,
  talentSource,
  offline,
  computing,
  notice,
  onCancel,
  onImport,
}: {
  title: string;
  charName?: string;
  xinfa: string;
  talentSource: string | null;
  offline: boolean;
  computing: boolean;
  /** 卡片顶部的提示，例如心法对不上 */
  notice?: string;
  onCancel?: () => void;
  onImport: (source: LoadoutSource, sourceId: string | null) => void;
}) {
  const input = useImportInput();

  if (computing) {
    return (
      <div
        className="rounded-xl bg-ink-3 px-6 py-10 ring-1 ring-inset ring-paper/8"
        role="status"
      >
        <div className="flex items-center gap-2.5 text-[13.5px] text-paper">
          <Loader2
            className="h-4 w-4 animate-spin text-jade"
            aria-hidden="true"
          />
          正在算木桩秒伤…
        </div>
        <p className="mt-1.5 pl-[26px] text-[12px] text-paper-3">
          {xinfa} · 134 级木桩 · 304 秒
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-lg bg-paper/[0.04]"
            />
          ))}
        </div>
      </div>
    );
  }

  const submit = () => {
    const r = input.submit();
    if (r && !offline) onImport(r.source, r.sourceId);
  };

  return (
    <div className="rounded-xl bg-ink-3 p-5 ring-1 ring-inset ring-paper/8">
      {notice && (
        <p className="mb-4 rounded-lg bg-gold/[0.08] px-3 py-2 text-[12.5px] text-gold ring-1 ring-inset ring-gold/20">
          {notice}
        </p>
      )}
      <ImportField
        input={input}
        label={title}
        labelClassName="font-serif text-[15px] font-semibold text-paper"
        charName={charName}
        xinfa={xinfa}
        talentSource={talentSource}
        onSubmitKey={submit}
      />
      <div className="mt-3 flex items-center gap-2">
        <Btn
          variant="primary"
          size="md"
          icon={<Download className="h-4 w-4" />}
          disabled={offline || !input.canSubmit}
          onClick={submit}
        >
          导入并计算
        </Btn>
        {onCancel && (
          <Btn variant="ghost" size="md" onClick={onCancel}>
            取消
          </Btn>
        )}
        {offline && <OfflineHint />}
      </div>
    </div>
  );
}

export function OfflineHint() {
  return (
    <span className="ml-1 inline-flex items-center gap-1.5 text-[12px] text-gold">
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      离线时不能导入，联网后再试
    </span>
  );
}

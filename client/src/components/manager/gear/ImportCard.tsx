import { CheckCircle2, Download, Loader2, WifiOff } from "lucide-react";
import { useId, useState } from "react";
import { IMPORT_KIND_LABEL, parseImport } from "@/data/gear";
import { Btn } from "@/components/common/ui";
import { cn } from "@/lib/utils";

const EXAMPLE = "https://www.jx3box.com/pz/view/87412";

export function ImportCard({
  charName,
  xinfa,
  talentSource,
  offline,
  computing,
  notice,
  onCancel,
  onImport,
}: {
  charName: string;
  xinfa: string;
  /** "紫霞功 PVE v4"；没有方案时为 null */
  talentSource: string | null;
  offline: boolean;
  computing: boolean;
  /** 卡片顶部的提示，例如心法对不上 */
  notice?: string;
  onCancel?: () => void;
  onImport: (sourceId: string | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const parsed = parseImport(text);
  const showError = touched && !parsed.ok;

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
    setTouched(true);
    if (parsed.ok && !offline) onImport(parsed.sourceId);
  };

  return (
    <div className="rounded-xl bg-ink-3 p-5 ring-1 ring-inset ring-paper/8">
      {notice && (
        <p className="mb-4 rounded-lg bg-gold/[0.08] px-3 py-2 text-[12.5px] text-gold ring-1 ring-inset ring-gold/20">
          {notice}
        </p>
      )}
      <label
        htmlFor={id}
        className="font-serif text-[15px] font-semibold text-paper"
      >
        给「{charName}」导入配装
      </label>
      <textarea
        id={id}
        value={text}
        rows={3}
        spellCheck={false}
        onChange={e => {
          setText(e.target.value);
          setTouched(false);
        }}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        aria-invalid={showError || undefined}
        aria-describedby={`${id}-msg`}
        placeholder={`粘贴魔盒配装链接、方案 ID 或数据版 JSON\n例如 ${EXAMPLE}`}
        className={cn(
          "mt-3 block w-full resize-none rounded-lg bg-ink px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-paper placeholder:text-paper-3/70 ring-1 ring-inset focus:outline-none focus:ring-2",
          showError
            ? "ring-cinnabar/70 focus:ring-cinnabar"
            : "ring-paper/12 focus:ring-cinnabar-text/60"
        )}
      />

      <div id={`${id}-msg`} className="mt-2.5 min-h-[40px]">
        {parsed.ok ? (
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
                {xinfa} · 12 件装备 · 奇穴用
                {talentSource ? ` ${talentSource}` : "配装里自带的"}
              </p>
            </div>
          </div>
        ) : showError ? (
          <p role="alert" className="text-[12.5px] text-cinnabar-text">
            {parsed.reason}
          </p>
        ) : (
          <p className="text-[12px] text-paper-3">
            魔盒配装页的地址栏链接就行。
            <button
              type="button"
              onClick={() => {
                setText(EXAMPLE);
                setTouched(false);
              }}
              className="ml-1 text-paper-2 underline decoration-paper/30 underline-offset-2 hover:text-paper"
            >
              填入示例
            </button>
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Btn
          variant="primary"
          size="md"
          icon={<Download className="h-4 w-4" />}
          disabled={offline || !text.trim()}
          onClick={submit}
        >
          导入并计算
        </Btn>
        {onCancel && (
          <Btn variant="ghost" size="md" onClick={onCancel}>
            取消
          </Btn>
        )}
        {offline && (
          <span className="ml-1 inline-flex items-center gap-1.5 text-[12px] text-gold">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            离线时不能导入，联网后再试
          </span>
        )}
      </div>
    </div>
  );
}

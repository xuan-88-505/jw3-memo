import { X } from "lucide-react";
import { XinfaMark } from "@/components/brand/Marks";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

/**
 * 筛选胶囊：点名字筛选；可带数量、心法标识和「×」移除。
 * 修改记录（按心法）和团队增益（按分类）共用，保持同一种样式。
 */
export function FilterChip({
  label,
  xinfa,
  count,
  selected,
  onSelect,
  onRemove,
  removeLabel,
}: {
  label: string;
  xinfa?: string;
  /** 大于 0 时显示在名字后面 */
  count?: number;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full ring-1 ring-inset transition-colors",
        selected
          ? "bg-paper/[0.09] text-paper ring-paper/20"
          : "text-paper-2 ring-paper/10 hover:text-paper hover:ring-paper/20"
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "inline-flex h-full items-center gap-1.5 rounded-full text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/60",
          onRemove ? "pl-3.5 pr-1" : "px-3.5"
        )}
      >
        {xinfa && (
          <span aria-hidden="true" className="inline-flex">
            <XinfaMark xinfa={xinfa} size={16} />
          </span>
        )}
        {label}
        {count ? (
          <span
            className={cn(
              "tabular-nums",
              selected ? "text-paper-2" : "text-paper-3"
            )}
          >
            {count}
          </span>
        ) : null}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? tx("移除{0}", label)}
          title={removeLabel ?? tx("移除")}
          className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full text-paper-3 transition-colors hover:bg-paper/10 hover:text-paper"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

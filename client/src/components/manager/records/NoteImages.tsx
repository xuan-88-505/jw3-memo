import { ImagePlus, Loader2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { useImageViewer } from "@/components/common/ImageViewer";
import {
  fileToNoteImage,
  NOTE_IMAGE_LIMIT,
  NOTE_IMAGE_TYPES,
  type NoteImage,
} from "@/lib/image";
import { cn } from "@/lib/utils";
import { tx } from "@/lib/i18n";

export const hasFiles = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** 剪贴板里的图片文件（截图工具复制的是 image/png） */
export function clipboardImages(e: {
  clipboardData: DataTransfer | null;
}): File[] {
  const files = Array.from(e.clipboardData?.files ?? []);
  if (files.length) return files.filter(f => f.type.startsWith("image/"));
  return Array.from(e.clipboardData?.items ?? [])
    .filter(it => it.kind === "file" && it.type.startsWith("image/"))
    .map(it => it.getAsFile())
    .filter((f): f is File => !!f);
}

/**
 * 备注图片的状态。bind 挂到整个表单上：
 * 弹窗里任何地方粘贴截图、把图片拖进弹窗，都加到备注里。
 */
export function useNoteImages(initial: NoteImage[] = []) {
  const [images, setImages] = useState<NoteImage[]>(initial);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const pendingRef = useRef(0);
  const depth = useRef(0);

  const add = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setError("");
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) {
      setError(tx("只能添加图片"));
      return;
    }
    const room =
      NOTE_IMAGE_LIMIT - imagesRef.current.length - pendingRef.current;
    if (room <= 0) {
      setError(tx("最多 {0} 张图片", NOTE_IMAGE_LIMIT));
      return;
    }
    const take = imgs.slice(0, room);
    const skipped = imgs.length - take.length;
    pendingRef.current += take.length;
    setPending(pendingRef.current);
    const results = await Promise.allSettled(take.map(fileToNoteImage));
    pendingRef.current -= take.length;
    setPending(pendingRef.current);
    const ok = results.flatMap(r =>
      r.status === "fulfilled" ? [r.value] : []
    );
    const failed = results.flatMap(r =>
      r.status === "rejected" ? [(r.reason as Error).message] : []
    );
    if (ok.length) setImages(cur => [...cur, ...ok].slice(0, NOTE_IMAGE_LIMIT));
    const msgs: string[] = [];
    if (failed.length)
      msgs.push(
        take.length === 1
          ? failed[0]
          : tx("{0} 张没加上：{1}", failed.length, failed[0])
      );
    if (skipped)
      msgs.push(tx("最多 {0} 张，另外 {1} 张没加", NOTE_IMAGE_LIMIT, skipped));
    setError(msgs.join("；"));
  }, []);

  const remove = useCallback((id: string) => {
    setImages(cur => cur.filter(i => i.id !== id));
    setError("");
  }, []);

  const bind = {
    onPaste: (e: ClipboardEvent) => {
      const files = clipboardImages(e);
      if (!files.length) return;
      // 从网页、表格复制的内容同时带文字和图片，这时按普通文字粘贴
      if (e.clipboardData.getData("text/plain").trim()) return;
      e.preventDefault();
      void add(files);
    },
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void add(Array.from(e.dataTransfer.files));
    },
  };

  return { images, pending, error, dragging, add, remove, bind };
}
export type NoteImagesState = ReturnType<typeof useNoteImages>;

/**
 * 备注输入框：文字 + 图片。右侧图标选图片，也可以直接粘贴或拖进来。
 * 加了图片后，缩略图显示在输入框里面的下方。
 */
export function NoteComposer({
  id,
  value,
  onChange,
  notes,
  maxLength,
  multiline,
  rows = 3,
  placeholder = tx("可直接粘贴截图"),
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  notes: NoteImagesState;
  maxLength: number;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewer = useImageViewer();
  const { images, pending, error, dragging } = notes;
  const full = images.length + pending >= NOTE_IMAGE_LIMIT;
  // 弹窗内容区有高度上限：加了图片后滚到缩略图，确认加上了
  const shown = images.length + pending;
  const prevShown = useRef(shown);
  useEffect(() => {
    if (shown > prevShown.current || error)
      // 连同下面的提示一起露出来
      wrapRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    prevShown.current = shown;
  }, [shown, error]);
  const fieldCls =
    "block w-full bg-transparent pl-3 pr-10 text-[13px] text-paper placeholder:text-paper-3/70 focus:outline-none";

  return (
    <div ref={wrapRef} className="scroll-mb-2">
      <div
        className={cn(
          "relative rounded-md bg-paper/[0.04] ring-1 ring-inset transition-shadow",
          dragging
            ? "ring-2 ring-cinnabar-text/70"
            : "ring-paper/10 hover:ring-paper/[0.18] focus-within:ring-2 focus-within:ring-cinnabar-text/60"
        )}
      >
        {multiline ? (
          <textarea
            id={id}
            value={value}
            maxLength={maxLength}
            rows={rows}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className={cn(fieldCls, "resize-none py-2 leading-relaxed")}
          />
        ) : (
          <input
            id={id}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className={cn(fieldCls, "h-8")}
          />
        )}
        <button
          type="button"
          disabled={full}
          onClick={() => fileRef.current?.click()}
          aria-label={tx("添加图片")}
          title={
            full ? tx("最多 {0} 张图片", NOTE_IMAGE_LIMIT) : tx("添加图片")
          }
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded text-paper-3 transition-colors hover:bg-paper/[0.08] hover:text-paper disabled:pointer-events-none disabled:opacity-35"
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
        </button>

        {(images.length > 0 || pending > 0) && (
          <ul
            aria-label={tx("图片")}
            className="flex flex-wrap gap-2 px-3 pb-2.5 pt-1"
          >
            {images.map((img, i) => (
              <li key={img.id} className="group/thumb relative">
                <button
                  type="button"
                  onClick={e => viewer.open(images, i, e.currentTarget)}
                  aria-label={tx("查看第 {0} 张图片", i + 1)}
                  className="block h-14 w-14 overflow-hidden rounded-md bg-ink ring-1 ring-inset ring-paper/12 transition-shadow hover:ring-paper/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar-text/70"
                >
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => notes.remove(img.id)}
                  aria-label={tx("删除第 {0} 张图片", i + 1)}
                  title={tx("删除")}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink-3 text-paper-2 opacity-0 shadow ring-1 ring-paper/20 transition-opacity hover:text-paper focus-visible:opacity-100 group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
            {Array.from({ length: pending }, (_, i) => (
              <li
                key={`p${i}`}
                className="grid h-14 w-14 place-items-center rounded-md bg-paper/[0.04] text-paper-3 ring-1 ring-inset ring-paper/10"
                aria-label={tx("正在处理图片")}
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              </li>
            ))}
          </ul>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-md bg-ink-3/90 text-[12.5px] text-paper">
            {full
              ? tx("最多 {0} 张图片", NOTE_IMAGE_LIMIT)
              : tx("松开添加图片")}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={NOTE_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          void notes.add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {(error || multiline) && (
        <div className="mt-1 flex items-start gap-3 text-[11.5px]">
          <p role="alert" className="min-w-0 flex-1 text-cinnabar-text">
            {error}
          </p>
          {multiline && (
            <p className="shrink-0 tabular-nums text-paper-3">
              {value.length}/{maxLength}
            </p>
          )}
        </div>
      )}
      {viewer.node}
    </div>
  );
}

/**
 * 缩略图，点开看大图。表格里只放 1 张，把位置留给文字，
 * 还有几张在角上写 +N；查人结果里全部列出。
 */
export function NoteThumbs({
  images,
  caption,
  max = 1,
}: {
  images: NoteImage[];
  caption?: string;
  max?: number;
}) {
  const viewer = useImageViewer();
  if (!images.length) return null;
  const shown = images.slice(0, max);
  const more = images.length - shown.length;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {shown.map((img, i) => (
        <button
          key={img.id}
          type="button"
          onClick={e => {
            e.stopPropagation();
            viewer.open(images, i, e.currentTarget, caption);
          }}
          aria-label={
            images.length > 1
              ? tx("查看图片，第 {0} 张，共 {1} 张", i + 1, images.length)
              : tx("查看图片")
          }
          className="relative h-8 w-8 overflow-hidden rounded-[5px] bg-ink ring-1 ring-inset ring-paper/12 transition-shadow hover:ring-paper/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar-text/70"
        >
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
          {i === shown.length - 1 && more > 0 && (
            <span className="absolute bottom-0.5 right-0.5 rounded-[3px] bg-black/75 px-[3px] text-[10px] font-medium leading-[14px] tabular-nums text-paper">
              +{more}
            </span>
          )}
        </button>
      ))}
      {viewer.node}
    </span>
  );
}

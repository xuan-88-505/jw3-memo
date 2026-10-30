import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import {
  ExternalLink,
  ImagePlus,
  Link2,
  Loader2,
  Lock,
  Maximize2,
  Pencil,
} from "lucide-react";
import { useImageViewer } from "@/components/common/ImageViewer";
import { InlineModal } from "@/components/common/overlay";
import { DIVIDE } from "@/components/common/surface";
import { Avatar, Btn, IconBtn, Segmented } from "@/components/common/ui";
import { ME_ID } from "@/data/seed";
import {
  extractUrls,
  faviconOf,
  hostOf,
  imageTitle,
  linkSubtitle,
  normalizeUrl,
  siteName,
  visibleLinks,
  type LinkVisibility,
  type SharedLink,
} from "@/data/links";
import { absoluteTime, relativeTime } from "@/lib/format";
import { fileToNoteImage, NOTE_IMAGE_TYPES } from "@/lib/image";
import { cn } from "@/lib/utils";
import {
  canEdit,
  isOnline,
  isSolo,
  me,
  memberName,
  useProto,
} from "@/state/store";
import { EmptyState, Field, inputCls } from "../shared";
import { clipboardImages, hasFiles } from "./NoteImages";
import { tx } from "@/lib/i18n";

const VIS_OPTIONS: { value: LinkVisibility; label: string }[] = [
  { value: "team", label: "亲友团" },
  { value: "private", label: "仅自己" },
];

export function LinksTab() {
  const { state, actions } = useProto();
  const inTeam = !!state.team;
  const solo = isSolo(state);
  const writable = canEdit(state) && isOnline(state);
  const isAdmin = me(state)?.role === "admin";
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SharedLink | null>(null);
  const [pending, setPending] = useState(0);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewer = useImageViewer();

  const links = visibleLinks(state.links, ME_ID).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  // 添加时不选范围：在亲友团里默认大家都能看，不在就只有自己；改成仅自己在编辑里
  const visibility: LinkVisibility = inTeam ? "team" : "private";

  const add = (raw: string) => {
    const urls = extractUrls(raw);
    if (!urls.length) {
      setError(tx("没找到网址"));
      return;
    }
    actions.addLinks(urls, visibility);
    setText("");
    setError(null);
  };

  /** 上传、粘贴、拖进来的图片：每张一条 */
  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) {
      setError(tx("只能添加图片"));
      return;
    }
    setError(null);
    setPending(n => n + imgs.length);
    const now = new Date();
    const results = await Promise.allSettled(imgs.map(fileToNoteImage));
    setPending(n => n - imgs.length);
    const ok = results.flatMap((r, i) =>
      r.status === "fulfilled"
        ? [{ image: r.value, title: imageTitle(imgs[i], now) }]
        : []
    );
    const failed = results.flatMap(r =>
      r.status === "rejected" ? [(r.reason as Error).message] : []
    );
    actions.addLinkImages(ok, visibility);
    if (failed.length)
      setError(
        imgs.length === 1
          ? failed[0]
          : tx("{0} 张没加上：{1}", failed.length, failed[0])
      );
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const files = clipboardImages(e);
    // 截图工具复制的只有图片；从网页复制的带文字，按文字处理
    if (files.length && !e.clipboardData.getData("text/plain").trim()) {
      e.preventDefault();
      void addFiles(files);
      return;
    }
    // 一次粘贴多条网址：直接全部加上
    const pasted = e.clipboardData.getData("text");
    if (extractUrls(pasted).length > 1) {
      e.preventDefault();
      add(pasted);
    }
  };

  const drag = {
    onDragEnter: (e: DragEvent) => {
      if (!writable || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!writable || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!writable || !hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!writable || !hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      void addFiles(Array.from(e.dataTransfer.files));
    },
  };

  return (
    <div className="relative flex flex-1 flex-col" {...drag}>
      <form
        className="flex items-center gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (text.trim()) add(text);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Link2
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-3"
            aria-hidden="true"
          />
          <input
            value={text}
            disabled={!writable}
            onChange={e => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onPaste={onPaste}
            placeholder={
              writable
                ? tx("粘贴链接或截图，回车添加")
                : canEdit(state)
                  ? tx("离线时不能添加")
                  : tx("只读成员不能添加")
            }
            aria-label={tx("粘贴链接或截图")}
            aria-invalid={!!error}
            aria-describedby={error ? "link-error" : undefined}
            className={cn(inputCls(!!error), "pl-9 pr-10")}
          />
          <button
            type="button"
            disabled={!writable || pending > 0}
            onClick={() => fileRef.current?.click()}
            aria-label={pending > 0 ? tx("正在处理图片") : tx("上传图片")}
            title={pending > 0 ? tx("正在处理图片") : tx("上传图片")}
            className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-paper-3 transition-colors hover:bg-paper/[0.08] hover:text-paper disabled:pointer-events-none disabled:opacity-40"
          >
            {pending > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <Btn
          type="submit"
          variant="secondary"
          size="md"
          disabled={!writable || !text.trim()}
        >
          {tx("添加")}
        </Btn>
      </form>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={NOTE_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {error && (
        <p
          id="link-error"
          role="alert"
          className="mt-1.5 text-[12px] text-cinnabar-text"
        >
          {error}
        </p>
      )}

      {links.length === 0 ? (
        <EmptyState icon="pigeon" title={tx("还没有链接或图片")} />
      ) : (
        <ul className={cn("-mx-3 mt-4", DIVIDE)} aria-label={tx("链接和图片")}>
          {links.map(l => {
            const mine = l.by === ME_ID;
            const canChange = writable && (mine || isAdmin);
            const img = l.image;
            // 整行可点：链接用浏览器打开，图片看大图
            const hit =
              "min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-cinnabar-text/50";
            const label = (
              <>
                <span className="block truncate text-[13.5px] text-paper">
                  {l.title}
                </span>
                <span className="block truncate text-[12px] text-paper-3">
                  {img
                    ? tx("图片 · {0}×{1}", img.w, img.h)
                    : linkSubtitle(l.url)}
                </span>
              </>
            );
            return (
              <li
                key={l.id}
                className="group/row relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-paper/[0.025]"
              >
                {img ? (
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    className="h-8 w-8 shrink-0 rounded-md bg-ink object-cover ring-1 ring-inset ring-paper/12"
                  />
                ) : (
                  <Favicon key={l.url} url={l.url} />
                )}
                {img ? (
                  <button
                    type="button"
                    onClick={e =>
                      viewer.open([img], 0, e.currentTarget, l.title)
                    }
                    aria-label={tx("查看图片「{0}」", l.title)}
                    className={hit}
                  >
                    {label}
                  </button>
                ) : (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={l.url}
                    className={hit}
                  >
                    {label}
                  </a>
                )}
                {l.visibility === "private" && inTeam && (
                  <Lock
                    className="h-3.5 w-3.5 shrink-0 text-paper-3"
                    aria-label={tx("仅自己可见")}
                  />
                )}
                {!solo && (
                  <span className="flex w-[88px] shrink-0 items-center gap-1.5 text-[12px] text-paper-3">
                    {(() => {
                      const m = state.members.find(x => x.id === l.by);
                      return m ? <Avatar member={m} size={18} /> : null;
                    })()}
                    <span className="truncate">{memberName(state, l.by)}</span>
                  </span>
                )}
                <span
                  className="w-[64px] shrink-0 text-right text-[12px] tabular-nums text-paper-3"
                  title={absoluteTime(l.at)}
                >
                  {relativeTime(l.at)}
                </span>
                <span className="relative z-10 flex w-7 shrink-0 justify-end">
                  {canChange ? (
                    <IconBtn
                      label={tx("编辑「{0}」", l.title)}
                      onClick={() => setEditing(l)}
                      className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                  ) : img ? (
                    <Maximize2
                      className="h-3.5 w-3.5 text-paper-3 opacity-0 transition-opacity group-hover/row:opacity-100"
                      aria-hidden="true"
                    />
                  ) : (
                    <ExternalLink
                      className="h-3.5 w-3.5 text-paper-3 opacity-0 transition-opacity group-hover/row:opacity-100"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {dragging && (
        <div className="pointer-events-none absolute -inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-cinnabar-text/60 bg-ink-2/90 text-[13px] text-paper">
          {tx("松开添加图片")}
        </div>
      )}

      <EditLinkDialog
        link={editing}
        inTeam={inTeam}
        onClose={() => setEditing(null)}
      />
      {viewer.node}
    </div>
  );
}

/** 站点图标：先显示站点名首字，图标加载成功后再替换（图标站慢或打不开时不留空方块） */
function Favicon({ url }: { url: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading");
  const src = faviconOf(url);
  const letter = (siteName(url) ?? hostOf(url)).slice(0, 1).toUpperCase();
  return (
    <span
      className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md bg-paper/[0.05] text-[12px] font-medium text-paper-2"
      aria-hidden="true"
    >
      {status !== "ok" && letter}
      {src && status !== "failed" && (
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          referrerPolicy="no-referrer"
          className={cn("h-4 w-4", status !== "ok" && "absolute opacity-0")}
          onLoad={e =>
            setStatus(e.currentTarget.naturalWidth > 1 ? "ok" : "failed")
          }
          onError={() => setStatus("failed")}
        />
      )}
    </span>
  );
}

function EditLinkDialog({
  link,
  inTeam,
  onClose,
}: {
  link: SharedLink | null;
  inTeam: boolean;
  onClose: () => void;
}) {
  const { actions } = useProto();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [vis, setVis] = useState<LinkVisibility>("team");
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!link) return;
    setTitle(link.title);
    setUrl(link.url);
    setVis(link.visibility);
    setTried(false);
  }, [link]);
  const img = link?.image;
  const normalized = normalizeUrl(url);
  const urlError =
    tried && !img && !normalized ? tx("不是有效的网址") : undefined;
  const save = () => {
    setTried(true);
    if (!link) return;
    if (!img && !normalized) return;
    actions.saveLink(link.id, {
      title: title.trim() || link.title,
      url: img ? link.url : normalized!,
      visibility: inTeam ? vis : "private",
    });
    onClose();
  };
  return (
    <InlineModal
      open={!!link}
      onClose={onClose}
      title={img ? tx("编辑图片") : tx("编辑链接")}
      footer={
        <div className="flex w-full items-center">
          <Btn
            variant="danger"
            size="sm"
            onClick={() => {
              if (link) actions.deleteLink(link.id);
              onClose();
            }}
          >
            {tx("删除")}
          </Btn>
          <div className="ml-auto flex gap-2">
            <Btn variant="ghost" size="sm" onClick={onClose}>
              {tx("取消")}
            </Btn>
            <Btn variant="primary" size="sm" onClick={save}>
              {tx("保存")}
            </Btn>
          </div>
        </div>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        {img && (
          <img
            src={img.src}
            alt={link?.title ?? ""}
            className="max-h-40 rounded-md bg-ink object-contain ring-1 ring-inset ring-paper/12"
          />
        )}
        <Field label={tx("名称")} htmlFor="link-title">
          <input
            id="link-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={40}
            className={inputCls()}
          />
        </Field>
        {!img && (
          <Field label={tx("网址")} htmlFor="link-url" error={urlError}>
            <input
              id="link-url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className={inputCls(!!urlError)}
            />
          </Field>
        )}
        {inTeam && (
          <div>
            <p className="mb-1.5 text-[12.5px] text-paper-2">
              {tx("谁能看到")}
            </p>
            <Segmented
              label={tx("谁能看到")}
              value={vis}
              onChange={setVis}
              options={VIS_OPTIONS.map(o => ({ ...o, label: tx(o.label) }))}
            />
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </InlineModal>
  );
}

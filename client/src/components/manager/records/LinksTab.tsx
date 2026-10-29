import { useEffect, useState } from "react";
import { ExternalLink, Link2, Lock, Pencil } from "lucide-react";
import { InlineModal } from "@/components/common/overlay";
import { DIVIDE } from "@/components/common/surface";
import { Avatar, Btn, IconBtn, Segmented } from "@/components/common/ui";
import { ME_ID } from "@/data/seed";
import {
  extractUrls,
  faviconOf,
  hostOf,
  linkSubtitle,
  normalizeUrl,
  siteName,
  visibleLinks,
  type LinkVisibility,
  type SharedLink,
} from "@/data/links";
import { absoluteTime, relativeTime } from "@/lib/format";
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
  const [vis, setVis] = useState<LinkVisibility>("team");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SharedLink | null>(null);

  const links = visibleLinks(state.links, ME_ID).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  const add = (raw: string) => {
    const urls = extractUrls(raw);
    if (!urls.length) {
      setError("没找到网址");
      return;
    }
    actions.addLinks(urls, inTeam ? vis : "private");
    setText("");
    setError(null);
  };

  return (
    <div>
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
            // 一次粘贴多条：直接全部加上
            onPaste={e => {
              const pasted = e.clipboardData.getData("text");
              if (extractUrls(pasted).length > 1) {
                e.preventDefault();
                add(pasted);
              }
            }}
            placeholder={
              writable
                ? "粘贴链接，回车添加"
                : canEdit(state)
                  ? "离线时不能添加"
                  : "只读成员不能添加"
            }
            aria-label="粘贴链接"
            aria-invalid={!!error}
            aria-describedby={error ? "link-error" : undefined}
            className={cn(inputCls(!!error), "pl-9")}
          />
        </div>
        {inTeam && (
          <Segmented
            label="谁能看到"
            size="md"
            value={vis}
            onChange={setVis}
            options={VIS_OPTIONS}
          />
        )}
        <Btn
          type="submit"
          variant="secondary"
          size="md"
          disabled={!writable || !text.trim()}
        >
          添加
        </Btn>
      </form>
      {error && (
        <p id="link-error" className="mt-1.5 text-[12px] text-cinnabar-text">
          {error}
        </p>
      )}

      {links.length === 0 ? (
        <EmptyState icon={<Link2 className="h-4 w-4" />} title="还没有链接" />
      ) : (
        <ul className={cn("-mx-3 mt-4", DIVIDE)} aria-label="链接">
          {links.map(l => {
            const mine = l.by === ME_ID;
            const canChange = writable && (mine || isAdmin);
            return (
              <li
                key={l.id}
                className="group/row relative flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-paper/[0.025]"
              >
                <Favicon key={l.url} url={l.url} />
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={l.url}
                  className="min-w-0 flex-1 outline-none after:absolute after:inset-0 focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-cinnabar-text/50"
                >
                  <span className="block truncate text-[13.5px] text-paper">
                    {l.title}
                  </span>
                  <span className="block truncate text-[12px] text-paper-3">
                    {linkSubtitle(l.url)}
                  </span>
                </a>
                {l.visibility === "private" && inTeam && (
                  <Lock
                    className="h-3.5 w-3.5 shrink-0 text-paper-3"
                    aria-label="仅自己可见"
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
                      label={`编辑「${l.title}」`}
                      onClick={() => setEditing(l)}
                      className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
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

      <EditLinkDialog
        link={editing}
        inTeam={inTeam}
        onClose={() => setEditing(null)}
      />
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
  const normalized = normalizeUrl(url);
  const urlError = tried && !normalized ? "不是有效的网址" : undefined;
  const save = () => {
    setTried(true);
    if (!link || !normalized) return;
    actions.saveLink(link.id, {
      title: title.trim() || link.title,
      url: normalized,
      visibility: inTeam ? vis : "private",
    });
    onClose();
  };
  return (
    <InlineModal
      open={!!link}
      onClose={onClose}
      title="编辑链接"
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
            删除
          </Btn>
          <div className="ml-auto flex gap-2">
            <Btn variant="ghost" size="sm" onClick={onClose}>
              取消
            </Btn>
            <Btn variant="primary" size="sm" onClick={save}>
              保存
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
        <Field label="名称" htmlFor="link-title">
          <input
            id="link-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={40}
            className={inputCls()}
          />
        </Field>
        <Field label="网址" htmlFor="link-url" error={urlError}>
          <input
            id="link-url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className={inputCls(!!urlError)}
          />
        </Field>
        {inTeam && (
          <div>
            <p className="mb-1.5 text-[12.5px] text-paper-2">谁能看到</p>
            <Segmented
              label="谁能看到"
              value={vis}
              onChange={setVis}
              options={VIS_OPTIONS}
            />
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </InlineModal>
  );
}

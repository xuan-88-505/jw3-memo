import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  ScrollText,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CharAvatar } from "@/components/brand/CharAvatar";
import { InlineModal } from "@/components/common/overlay";
import { Btn, Segmented } from "@/components/common/ui";
import {
  blackEntriesFor,
  DIFFICULTIES,
  roleByUid,
  SEASON_NAME,
  SEASON_RAIDS,
  seasonRaidLabel,
  WAGE_MAX,
  type GameRole,
  type RaidLog,
} from "@/data/records";
import { ME_ID, schoolLabel } from "@/data/seed";
import { cn } from "@/lib/utils";
import { canEdit, isOnline, memberName, useProto, isSolo } from "@/state/store";
import { EmptyState, Field, inputCls, SelectBox } from "../shared";
import { RoleLookup, RoleName } from "./RoleLookup";

// 一周没几条记录，只按月或全部看
type Period = "month" | "all";
type SortKey = "at" | "wage";
interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return {
    day: `${d.getMonth() + 1}月${d.getDate()}日`,
    time: `周${WEEK[d.getDay()]} ${hh}:${mm}`,
  };
}

function periodStart(p: Period, now = new Date()) {
  if (p === "all") return 0;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

/** datetime-local 输入框用的本地时间字符串 */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const nf = new Intl.NumberFormat("zh-CN");

export function RaidLogTab({
  editingId,
  onEdit,
}: {
  editingId: string | "new" | null;
  onEdit: (id: string | "new" | null) => void;
}) {
  const { state } = useProto();
  const [period, setPeriod] = useState<Period>("month");
  const [charFilter, setCharFilter] = useState("all");
  // 默认最新的在上面；切到工资时先看最高的
  const [sort, setSort] = useState<Sort>({ key: "at", dir: "desc" });
  const onSort = (key: SortKey) =>
    setSort(s =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  const writable = canEdit(state) && isOnline(state);
  const lockReason = !canEdit(state)
    ? "只读成员不能修改"
    : !isOnline(state)
      ? "离线时不能修改"
      : undefined;

  const mine = state.characters.filter(c => c.ownerId === ME_ID);
  const others = state.characters.filter(c => c.ownerId !== ME_ID);

  const rows = useMemo(() => {
    const since = periodStart(period);
    return state.raidLogs
      .filter(r => new Date(r.at).getTime() >= since)
      .filter(r => {
        if (charFilter === "all") return true;
        if (charFilter === "mine") return mine.some(c => c.id === r.charId);
        return r.charId === charFilter;
      })
      .sort((a, b) => {
        const sign = sort.dir === "asc" ? 1 : -1;
        if (sort.key === "wage" && a.wage !== b.wage)
          return sign * (a.wage - b.wage);
        // 工资相同时按时间从新到旧
        return sort.key === "at"
          ? sign * a.at.localeCompare(b.at)
          : b.at.localeCompare(a.at);
      });
  }, [state.raidLogs, period, charFilter, mine, sort]);

  const total = rows.reduce((sum, r) => sum + r.wage, 0);
  const editing =
    editingId && editingId !== "new"
      ? state.raidLogs.find(r => r.id === editingId)
      : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Segmented<Period>
          label="时间范围"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "本月" },
            { value: "all", label: "全部" },
          ]}
        />
        <SelectBox
          aria-label="角色"
          value={charFilter}
          onChange={e => setCharFilter(e.target.value)}
          className={cn(inputCls(), "h-8 w-auto text-[12.5px]")}
        >
          <option value="all">全部角色</option>
          <option value="mine">我的角色</option>
          <optgroup label="我的">
            {mine.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
          {others.length > 0 && (
            <optgroup label="亲友">
              {others.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </SelectBox>
        <p className="ml-auto text-[12.5px] text-paper-3">
          {rows.length} 次 · 合计{" "}
          <span className="font-medium tabular-nums text-paper">
            {nf.format(total)}
          </span>{" "}
          金
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" />}
          title={state.raidLogs.length ? "这段时间没有记录" : "还没有打本记录"}
          action={
            <Btn
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              disabled={!writable}
              title={lockReason}
              onClick={() => onEdit("new")}
            >
              记一笔
            </Btn>
          }
        />
      ) : (
        <div className="-mx-3">
          <table className="w-full table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[112px]" />
              <col className="w-[128px]" />
              <col className="w-[100px]" />
              <col className="w-[156px]" />
              <col className="w-[108px]" />
              <col className="w-[88px]" />
              <col />
            </colgroup>
            <thead className="border-b border-paper/[0.07] text-[12px] text-paper-3">
              <tr>
                <SortTh
                  label="时间"
                  sortKey="at"
                  sort={sort}
                  onSort={onSort}
                  className="px-3"
                />
                <th className="px-3 py-2.5 font-normal">副本</th>
                <th className="px-3 py-2.5 font-normal">团牌</th>
                <th className="px-3 py-2.5 font-normal">团长</th>
                <th className="px-3 py-2.5 font-normal">角色</th>
                <SortTh
                  label="工资"
                  sortKey="wage"
                  sort={sort}
                  onSort={onSort}
                  className="px-3"
                  alignRight
                />
                <th className="px-3 py-2.5 font-normal">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper/[0.07]">
              {rows.map(r => {
                const w = fmtWhen(r.at);
                const char = state.characters.find(c => c.id === r.charId);
                const leader = roleByUid(r.leaderUid);
                const hits = leader
                  ? blackEntriesFor(state.blacklist, leader)
                  : [];
                return (
                  <tr
                    key={r.id}
                    onClick={writable ? () => onEdit(r.id) : undefined}
                    className={cn(
                      "group",
                      writable && "cursor-pointer hover:bg-paper/[0.025]"
                    )}
                    title={
                      isSolo(state)
                        ? writable
                          ? "点击修改"
                          : undefined
                        : writable
                          ? `${memberName(state, r.by)} 记录，点击修改`
                          : `${memberName(state, r.by)} 记录`
                    }
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        disabled={!writable}
                        onClick={e => {
                          e.stopPropagation();
                          onEdit(r.id);
                        }}
                        className="text-left disabled:cursor-default"
                        aria-label={`修改 ${w.day} ${r.dungeon} 的记录`}
                      >
                        <span className="block text-paper">{w.day}</span>
                        <span className="block text-[12px] tabular-nums text-paper-3">
                          {w.time}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block truncate text-paper">
                        {r.dungeon}
                      </span>
                      <span className="block truncate text-[12px] text-paper-3">
                        {r.difficulty}
                      </span>
                    </td>
                    <td className="truncate px-3 py-2.5 text-paper-2">
                      {r.tuanpai || <span className="text-paper-3">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <RoleName uid={r.leaderUid} blackHit={hits} />
                    </td>
                    <td className="px-3 py-2.5">
                      {char ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <CharAvatar character={char} size={20} />
                          <span className="truncate">{char.name}</span>
                        </span>
                      ) : (
                        <span className="text-paper-3">已删除的角色</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        r.wage === 0 ? "text-cinnabar-text" : "text-paper"
                      )}
                    >
                      {nf.format(r.wage)}
                    </td>
                    <td
                      className="truncate px-3 py-2.5 text-paper-2"
                      title={r.note || undefined}
                    >
                      {r.note || <span className="text-paper-3">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RaidLogDialog
        key={editingId ?? "closed"}
        open={editingId !== null}
        log={editing}
        onClose={() => onEdit(null)}
      />
    </div>
  );
}

function RaidLogDialog({
  open,
  log,
  onClose,
}: {
  open: boolean;
  log?: RaidLog;
  onClose: () => void;
}) {
  const { state, actions } = useProto();
  const mine = state.characters.filter(c => c.ownerId === ME_ID);
  const others = state.characters.filter(c => c.ownerId !== ME_ID);
  const last = state.raidLogs[0];

  const [at, setAt] = useState(() =>
    toLocalInput(log?.at ?? roundNow().toISOString())
  );
  const [charId, setCharId] = useState(log?.charId ?? mine[0]?.id ?? "");
  const seasonKey = (d?: string, diff?: string) => {
    const i = SEASON_RAIDS.findIndex(
      r => r.dungeon === d && r.difficulty === diff
    );
    return i >= 0 ? String(i) : null;
  };
  // 新记录：沿用上一条的本赛季副本，否则本赛季第一个；旧赛季的记录打开时是"其他副本"
  const [raid, setRaid] = useState(() =>
    log
      ? (seasonKey(log.dungeon, log.difficulty) ?? "other")
      : (seasonKey(last?.dungeon, last?.difficulty) ?? "0")
  );
  const isOther = raid === "other";
  const [difficulty, setDifficulty] = useState(
    log && isOther ? log.difficulty : DIFFICULTIES[0]
  );
  const [dungeon, setDungeon] = useState(log && isOther ? log.dungeon : "");
  const [tuanpai, setTuanpai] = useState(log?.tuanpai ?? "");
  const [leader, setLeader] = useState<GameRole | null>(
    roleByUid(log?.leaderUid) ?? null
  );
  const [wage, setWage] = useState(log ? String(log.wage) : "");
  const [note, setNote] = useState(log?.note ?? "");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // "其他副本"的名字提示：以前记过的、不在本赛季里的副本
  const dungeons = Array.from(
    new Set(
      state.raidLogs
        .map(r => r.dungeon)
        .filter(d => !SEASON_RAIDS.some(s => s.dungeon === d))
    )
  );
  const wageNum = Number(wage);
  const errors = {
    at: !at || Number.isNaN(new Date(at).getTime()) ? "选一下时间" : "",
    charId: !charId ? "选一下角色" : "",
    dungeon: isOther && !dungeon.trim() ? "填一下副本名称" : "",
    wage:
      wage.trim() === "" || !Number.isInteger(wageNum) || wageNum < 0
        ? "工资填 0 或正整数"
        : wageNum > WAGE_MAX
          ? "工资不能超过 1000 万金"
          : "",
  };
  const hasError = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (tried ? errors[k] : "");

  const save = () => {
    setTried(true);
    if (hasError) return;
    actions.saveRaidLog(
      {
        at: new Date(at).toISOString(),
        charId,
        difficulty: isOther ? difficulty : SEASON_RAIDS[+raid].difficulty,
        dungeon: isOther ? dungeon.trim() : SEASON_RAIDS[+raid].dungeon,
        tuanpai: tuanpai.trim(),
        leaderUid: leader?.uid ?? null,
        wage: wageNum,
        note: note.trim(),
      },
      log?.id
    );
    onClose();
  };

  return (
    <InlineModal
      open={open}
      onClose={onClose}
      title={log ? "修改记录" : "记一笔"}
      width={540}
      bodyMaxHeight={520}
      footer={
        <div className="flex w-full items-center gap-2">
          {log &&
            (confirmDelete ? (
              <Btn
                variant="danger"
                size="md"
                onClick={() => {
                  actions.deleteRaidLog(log.id);
                  onClose();
                }}
              >
                确定删除
              </Btn>
            ) : (
              <Btn
                variant="quiet"
                size="md"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Btn>
            ))}
          <span className="flex-1" />
          <Btn variant="ghost" size="md" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" size="md" onClick={save}>
            保存
          </Btn>
        </div>
      }
    >
      <form
        className="grid grid-cols-2 gap-x-3 gap-y-3.5"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="时间" htmlFor="rl-at" error={show("at")}>
          <input
            id="rl-at"
            type="datetime-local"
            value={at}
            onChange={e => setAt(e.target.value)}
            className={cn(inputCls(!!show("at")), "[color-scheme:dark]")}
          />
        </Field>
        <Field label="角色" htmlFor="rl-char" error={show("charId")}>
          <SelectBox
            id="rl-char"
            value={charId}
            onChange={e => setCharId(e.target.value)}
            wrapClassName="w-full"
            className={inputCls(!!show("charId"))}
          >
            {mine.length === 0 && others.length === 0 && (
              <option value="">先去「我的角色」添加角色</option>
            )}
            {mine.length > 0 && (
              <optgroup label="我的">
                {mine.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {schoolLabel(c)}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="亲友">
                {others.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {memberName(state, c.ownerId)}
                  </option>
                ))}
              </optgroup>
            )}
          </SelectBox>
        </Field>
        <div className="col-span-2">
          <Field label="副本" htmlFor="rl-raid">
            <SelectBox
              id="rl-raid"
              value={raid}
              onChange={e => setRaid(e.target.value)}
              wrapClassName="w-full"
              className={inputCls()}
            >
              <optgroup label={`本赛季 · ${SEASON_NAME}`}>
                {SEASON_RAIDS.map((r, i) => (
                  <option key={i} value={String(i)} disabled={r.upcoming}>
                    {seasonRaidLabel(r)}
                  </option>
                ))}
              </optgroup>
              <option value="other">其他副本…</option>
            </SelectBox>
          </Field>
        </div>
        {isOther && (
          <>
            <Field
              label="副本名称"
              htmlFor="rl-dungeon"
              error={show("dungeon")}
            >
              <input
                id="rl-dungeon"
                list="rl-dungeons"
                value={dungeon}
                maxLength={20}
                onChange={e => setDungeon(e.target.value)}
                aria-invalid={!!show("dungeon")}
                className={inputCls(!!show("dungeon"))}
              />
              <datalist id="rl-dungeons">
                {dungeons.map(d => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <Field label="难度" htmlFor="rl-diff">
              <SelectBox
                id="rl-diff"
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                wrapClassName="w-full"
                className={inputCls()}
              >
                {DIFFICULTIES.map(d => (
                  <option key={d}>{d}</option>
                ))}
              </SelectBox>
            </Field>
          </>
        )}
        <Field label="团牌" htmlFor="rl-tuanpai">
          <input
            id="rl-tuanpai"
            value={tuanpai}
            maxLength={20}
            onChange={e => setTuanpai(e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="工资" htmlFor="rl-wage" error={show("wage")}>
          <div className="relative">
            <input
              id="rl-wage"
              inputMode="numeric"
              value={wage}
              onChange={e => setWage(e.target.value.replace(/[^\d]/g, ""))}
              className={cn(inputCls(!!show("wage")), "pr-9 tabular-nums")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-paper-3">
              金
            </span>
          </div>
        </Field>
        <div className="col-span-2">
          <Field label="团长" htmlFor="rl-leader">
            <RoleLookup
              id="rl-leader"
              defaultServer={
                state.characters.find(c => c.id === charId)?.server
              }
              value={leader}
              onChange={setLeader}
              blacklist={state.blacklist}
              online={isOnline(state)}
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="备注" htmlFor="rl-note">
            <input
              id="rl-note"
              value={note}
              maxLength={60}
              onChange={e => setNote(e.target.value)}
              className={inputCls()}
            />
          </Field>
        </div>
        <button
          type="submit"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </form>
    </InlineModal>
  );
}

/** 可排序的表头：点一下按这一列排，再点一下反过来 */
function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
  alignRight,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  className?: string;
  alignRight?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "py-1.5 font-normal",
        alignRight && "text-right",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`按${label}排序`}
        className={cn(
          "group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 py-1 transition-colors hover:text-paper",
          alignRight && "flex-row-reverse",
          active && "text-paper-2"
        )}
      >
        {label}
        <Icon
          className={cn(
            "h-3 w-3 transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-60"
          )}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

/** 当前时间取整到半点 */
function roundNow() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30);
  return d;
}

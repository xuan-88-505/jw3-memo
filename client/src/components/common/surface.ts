/**
 * 界面层级：全应用只用这几种底色和一种分隔线（规则见 plan.md「界面层级统一」）。
 *
 * - 内容底 ink-2：页面内容直接放在上面，不套卡片
 * - 浮层 RAISED：弹窗、下拉菜单、弹出面板、气泡提示
 * - 输入槽 WELL：输入框、下拉框、搜索框、文本域、分段控件底槽、代码块
 * - 分隔线 LINE：表头下、行之间、分区之间
 */

/** 输入槽：半透明，在内容底和浮层上观感一致 */
export const WELL = "bg-paper/[0.04] ring-1 ring-inset ring-paper/10";
/** 可输入的输入槽：加悬停和聚焦 */
export const FIELD =
  "bg-paper/[0.04] ring-1 ring-inset ring-paper/10 hover:ring-paper/[0.18] focus:outline-none focus:ring-2 focus:ring-cinnabar-text/60 disabled:opacity-50 disabled:hover:ring-paper/10";

/** 浮层：比内容底高一级 */
export const RAISED =
  "bg-ink-3 ring-1 ring-paper/12 shadow-[0_18px_48px_-12px_rgb(0_0_0/0.7)]";

/** 分隔线颜色（border / divide 用） */
export const LINE = "border-paper/[0.07]";
export const DIVIDE = "divide-y divide-paper/[0.07]";

/** 选中或展开的行 */
export const ROW_ACTIVE = "bg-paper/[0.04]";
/** 行悬停 */
export const ROW_HOVER = "hover:bg-paper/[0.025]";

/** 表格：不套卡片，左右外扩 12px 让文字和页标题对齐 */
export const TABLE_WRAP = "-mx-3 overflow-x-auto";
export const TABLE = "w-full border-collapse text-[13px]";
export const THEAD_ROW =
  "border-b border-paper/[0.07] text-left text-[12px] text-paper-3";
export const TH = "h-9 px-3 font-normal";
export const TBODY = "divide-y divide-paper/[0.07]";
export const TR = "transition-colors hover:bg-paper/[0.025]";
export const TD = "px-3 py-2.5";

/** 分区标题 */
export const SECTION_TITLE = "text-[14px] font-medium text-paper";

/** 空状态里的图标圆 */
export const EMPTY_ICON =
  "grid h-10 w-10 place-items-center rounded-full bg-paper/[0.05] text-paper-3";

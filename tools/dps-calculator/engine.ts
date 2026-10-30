/**
 * 备忘录（JW3 Memo）计算引擎。
 *
 * 构建时由 tools/dps-calculator/apply-patches.mjs 复制成上游的 src/备忘录引擎.ts。
 * 地址带 ?engine=1 时由 备忘录桥接 加载，这时页面不渲染计算器界面（见 index.tsx 补丁）。
 *
 * 备忘录在隐藏的同源 iframe 里打开这个页面，直接调用 window.jw3Engine：
 * - load(简写)：加载心法数据，返回配装界面要用的目录（装备库、附魔、五彩石、循环、增益……）。
 * - compute(简写, 输入)：按配装和战斗配置算装分、面板和秒伤。同步执行，调用前先 load。
 *
 * 两个接口都收发 JSON 字符串：iframe 里的对象属于另一个页面，直接交给父窗口用容易出问题。
 * 算法和数据全是上游的；这里只做格式转换，默认值写死，不读计算器自己的缓存设置。
 */
import 获取当前数据, { 确保心法数据已加载, 在指定心法数据下执行 } from '@/数据/数据工具/获取当前数据'
import { 简写转心法名 } from '@/心法模块/模块工具/获取心法数据'
import 根据表单选项获取装备信息 from '@/功能模块/基础设置/属性录入/配装器/工具函数/根据表单选项获取装备信息'
import { 获取角色需要展示的面板数据 } from '@/功能模块/基础设置/面板信息/工具'
import { 有效配装装备 } from '@/角色/计划'
import { 创建默认角色状态, 获取循环配套数据 } from '@/角色/状态'
import { 秒伤计算 } from '@/计算模块/计算函数'
import useCycle from '@/hooks/use-cycle'
import 目标集合 from '@/数据/目标'
import * as 常量模块 from '@/数据/常量'
import { 属性简写枚举 } from '@/@types/枚举'

const 版本 = 1

const 部位表: Record<string, string> = {
  _1: '帽子',
  _2: '衣服',
  _3: '腰带',
  _4: '护腕',
  _5: '下装',
  _6: '鞋子',
  _7: '项链',
  _8: '腰坠',
  _9: '戒指',
  _10: '戒指',
  _11: '暗器',
  _12: '武器',
}
const 大附魔表 = {
  hat: '大附魔_伤帽',
  coat: '大附魔_伤衣',
  belt: '大附魔_伤腰',
  wrist: '大附魔_伤腕',
  shoes: '大附魔_伤鞋',
} as const
type 大附魔部位 = keyof typeof 大附魔表

/** 备忘录传进来的一件装备 */
interface 部位输入 {
  id: number
  refine?: number
  gems?: number[]
  /** 计算器的小附魔 id */
  enchant?: number | null
}

interface 团队增益输入 {
  name: string
  on: boolean
  cover?: number
  stacks?: number
}

interface 计算输入 {
  /** 键是 _1 … _12 */
  slots: Record<string, 部位输入 | null | undefined>
  stone?: string | null
  big?: Partial<Record<大附魔部位, number>>
  battle?: {
    loop?: string
    target?: string
    buffOn?: boolean
    formation?: string
    foods?: string[]
    team?: 团队增益输入[]
    latency?: number
  }
}

const 心法数据表 = new Map<string, any>()

const 取心法 = (简写: string) => {
  const 心法名 = 简写转心法名(简写)
  if (!心法名) throw new Error(`不支持的心法：${简写}`)
  return 心法名
}

/** 精炼、宝石等级：计算器只认 0–8 的整数 */
const 等级 = (值: unknown) => Math.max(0, Math.min(8, Math.round(Number(值)) || 0))
const 两位 = (值: number) => Math.round((Number.isFinite(值) ? 值 : 0) * 100) / 100
/** 数据里一般没有 最大精炼等级：橙武 8，其他 6（和上游 太玄经/武器切换.ts 一样） */
const 最大精炼 = (定义: any) => 定义?.最大精炼等级 ?? (定义?.装备类型 === '橙武' ? 8 : 6)

/** 默认配装：上游给新角色用的那一套，换成备忘录的输入格式 */
const 默认输入 = () => {
  const 状态 = 创建默认角色状态() as any
  const 装备信息 = 状态.装备信息 || {}
  const slots: 计算输入['slots'] = {}
  for (const 项 of 装备信息.装备列表 || []) {
    if (!项?.装备部位索引) continue
    slots[项.装备部位索引] = {
      id: 项.id,
      refine: 项.当前精炼等级 || 0,
      gems: (项.镶嵌孔数组 || []).map((孔: any) => 孔?.镶嵌宝石等级 || 0),
      enchant: 项.附魔 || null,
    }
  }
  const big: Partial<Record<大附魔部位, number>> = {}
  for (const [键, 表单键] of Object.entries(大附魔表)) {
    big[键 as 大附魔部位] = Number(装备信息.装备增益?.[表单键]) || 0
  }
  return {
    input: {
      slots,
      stone: 装备信息.五彩石 || null,
      big,
      battle: {
        loop: 状态.当前计算循环名称 || '',
        target: 目标集合[0]?.名称 || '',
        buffOn: false,
        formation: 状态.角色增益?.阵眼 || '',
        foods: 状态.角色增益?.小吃 || [],
        team: [],
        latency: 默认延迟(),
      },
    } as 计算输入,
    talents: 状态.当前奇穴信息 || [],
  }
}

const 默认延迟 = () => {
  const { 默认数据 = {} } = 获取当前数据() as any
  return Number(默认数据?.网络延迟) || 1
}

/** 循环列表；战斗时间随加速变，在 compute 的结果里给 */
const 循环列表 = () => {
  const { 全部循环 = [] } = useCycle({ 使用内存数据: false, 覆盖数据: {} })
  return 全部循环.map((项: any) => ({
    name: 项.名称,
    title: 项.标题 || 项.名称,
    note: 项.备注 || '',
    tag: 项.标记 || '',
    provider: 项.提供者 || '',
  }))
}

const 目录 = (简写: string, 数据: any) => {
  const 默认 = 默认输入()
  const 用到的部位 = Array.from(new Set(Object.values(部位表)))
  return {
    v: 版本,
    xf: 简写,
    name: 数据.名称,
    gongfa: 数据.功法,
    main: 数据.主属性,
    slotPart: 部位表,
    equips: Object.fromEntries(
      用到的部位.map((部位) => [
        部位,
        (数据.装备数据?.[部位] || []).map((项: any) => ({ ...项, 最大精炼等级: 最大精炼(项) })),
      ]),
    ),
    attrNames: 属性简写枚举,
    enchants: 数据.附魔 || [],
    stones: 数据.五彩石 || [],
    holes: 数据.镶嵌孔 || [],
    team: (数据.团队增益 || []).filter((项: any) => 项?.增益心法端 !== '无界'),
    formations: 数据.阵眼 || [],
    foods: 数据.小药小吃 || [],
    loops: 循环列表(),
    targets: 目标集合.map((项: any) => ({ name: 项.名称, level: 项.等级 })),
    defaults: 默认.input,
    defaultTalents: 默认.talents,
  }
}

/** 备忘录的输入换成上游配装器的表单值；返回找不到的部位 */
const 生成表单值 = (数据: any, 输入: 计算输入) => {
  const 表单值: Record<string, any> = { 五彩石: 输入.stone || undefined }
  for (const [键, 表单键] of Object.entries(大附魔表)) {
    表单值[表单键] = 等级(输入.big?.[键 as 大附魔部位] || 0)
  }
  const 缺: string[] = []
  for (const [索引, 部位] of Object.entries(部位表)) {
    const 格 = 输入.slots?.[索引]
    if (!格) continue
    const 定义 = (数据.装备数据?.[部位] || []).find((项: any) => 项.id === 格.id)
    if (!定义) {
      缺.push(索引)
      continue
    }
    const 附魔 = 格.enchant
      ? (数据.附魔 || []).find((f: any) => f.id === 格.enchant && (f.附魔支持部位 || []).includes(部位))
      : undefined
    表单值[索引] = {
      id: 定义.id,
      装备部位: 部位,
      当前精炼等级: Math.min(等级(格.refine), 最大精炼(定义)),
      镶嵌孔数组: (定义.镶嵌孔数组 || []).slice(0, 3).map((孔: any, 序号: number) => ({
        镶嵌类型: 孔.镶嵌类型,
        镶嵌宝石等级: 等级(格.gems?.[序号]),
      })),
      附魔: 附魔?.id,
    }
  }
  return { 表单值, 缺 }
}

const 计算 = (简写: string, 数据: any, 输入: 计算输入) => {
  const { 表单值, 缺 } = 生成表单值(数据, 输入)
  if (!Object.keys(表单值).some((键) => 键.startsWith('_'))) {
    return { ok: false, error: 'empty', missing: 缺 }
  }
  const 装备信息 = 根据表单选项获取装备信息(表单值) as any
  if (!有效配装装备(装备信息)) {
    return { ok: false, error: 'invalid', missing: 缺 }
  }

  const 战斗 = 输入.battle || {}
  const 增益启用 = !!战斗.buffOn
  // 覆盖率是百分数（100 = 全程）；没给就用增益自己的默认覆盖率和层数
  const 团队增益表 = new Map<string, any>((数据.团队增益 || []).map((项: any) => [项.增益名称, 项]))
  const 增益数据 = {
    阵眼: 战斗.formation || '',
    小吃: Array.isArray(战斗.foods) ? 战斗.foods : [],
    团队增益: (战斗.team || [])
      .filter((项) => 团队增益表.has(项.name))
      .map((项) => {
        const 定义 = 团队增益表.get(项.name)
        return {
          增益名称: 项.name,
          启用: !!项.on,
          覆盖率: Number.isFinite(项.cover) ? Number(项.cover) : Number(定义?.覆盖率) || 100,
          层数: Number.isFinite(项.stacks) ? Number(项.stacks) : Number(定义?.层数) || 1,
        }
      }),
  }
  const 网络延迟 = Number.isFinite(战斗.latency) ? Number(战斗.latency) : 默认延迟()
  const 目标 = 目标集合.some((项: any) => 项.名称 === 战斗.target) ? 战斗.target : 目标集合[0]?.名称
  const 循环 = 获取循环配套数据(战斗.loop || '', {
    装备信息,
    增益数据,
    增益启用,
    网络延迟,
    自定义循环列表: [],
  } as any)

  const 假状态 = {
    data: {
      装备信息,
      当前奇穴信息: 循环.当前奇穴信息,
      当前秘籍信息: 循环.当前秘籍信息,
      当前计算循环名称: 循环.当前计算循环名称,
      当前输出计算目标名称: 目标,
      增益启用,
      增益数据,
      网络延迟,
      自定义循环列表: [],
      团队增益轴: [],
      特殊配置: {},
    },
  }
  const 结果 = (秒伤计算({ 计算技能详情: false }) as any)(() => undefined, () => 假状态)

  const 面板 = 获取角色需要展示的面板数据({
    装备信息,
    当前奇穴信息: 循环.当前奇穴信息,
    增益数据,
    增益启用,
    显示增益后面板: false,
  } as any) as any
  // 百分比和计算器面板上显示的一样：系数随赛季变，备忘录这边不自己换算
  const 系数: any = (常量模块 as any).自身属性系数 || {}
  const 比 = (值: number, 键: string) => (系数[键] ? (值 / 系数[键]) * 100 : 0)
  const 循环信息 = 循环列表().find((项: any) => 项.name === 循环.当前计算循环名称)

  return {
    ok: true,
    dps: Math.round(Number(结果?.秒伤) || 0),
    total: Math.round(Number(结果?.总伤) || 0),
    time: Number(结果?.秒伤计算时间) || 0,
    score: Math.round(面板?.装分 || 0),
    panel: {
      hp: Math.round(面板?.最终气血上限 || 0),
      vitality: Math.round(面板?.体质 || 0),
      primary: Math.round(面板?.[数据.主属性] || 0),
      baseAttack: Math.round(面板?.基础攻击 || 0),
      attack: Math.round(面板?.面板攻击 || 0),
      critLv: Math.round(面板?.会心等级 || 0),
      critDmgLv: Math.round(面板?.会心效果等级 || 0),
      overcomeLv: Math.round(面板?.破防等级 || 0),
      strainLv: Math.round(面板?.无双等级 || 0),
      versatility: Math.round(面板?.全能等级 || 0),
      haste: Math.round(面板?.加速等级 || 0),
    },
    pct: {
      crit: 两位(Math.min(比(面板?.会心等级 || 0, '会心'), 100)),
      critDmg: 两位(Math.min(比(面板?.会心效果等级 || 0, '会效') + 175, 300)),
      overcome: 两位(比(面板?.破防等级 || 0, '破防')),
      strain: 两位(比(面板?.无双等级 || 0, '无双')),
      haste: 两位(Math.min(比(面板?.加速等级 || 0, '急速'), 25)),
    },
    loop: {
      name: 循环.当前计算循环名称,
      title: 循环信息?.title || 循环.当前计算循环名称,
      tag: 循环信息?.tag || '',
    },
    talents: 循环.当前奇穴信息 || [],
    target: 目标,
    stone: 装备信息?.五彩石 || null,
    missing: 缺,
  }
}

const 引擎 = {
  version: 版本,
  async load(简写: string): Promise<string> {
    const 心法名 = 取心法(简写)
    const 数据 = await 确保心法数据已加载(心法名)
    心法数据表.set(简写, 数据)
    return JSON.stringify(在指定心法数据下执行(数据, () => 目录(简写, 数据)))
  },
  compute(简写: string, 输入文本: string): string {
    const 数据 = 心法数据表.get(简写)
    if (!数据) return JSON.stringify({ ok: false, error: 'not-loaded' })
    try {
      const 输入 = JSON.parse(输入文本) as 计算输入
      return JSON.stringify(在指定心法数据下执行(数据, () => 计算(简写, 数据, 输入)))
    } catch (错误) {
      console.warn('[备忘录引擎] 计算出错：', 错误)
      return JSON.stringify({ ok: false, error: 'exception', message: String((错误 as Error)?.message || 错误) })
    }
  },
}

;(window as any).jw3Engine = 引擎
window.dispatchEvent(new Event('jw3engine-ready'))

export {}

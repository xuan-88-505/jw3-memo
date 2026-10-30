/**
 * 备忘录（JW3 Memo）桥接。
 *
 * 构建时由 tools/dps-calculator/apply-patches.mjs 复制成上游的 src/备忘录桥接.ts，
 * 并在 src/index.tsx 第一行 import。只在地址带 ?memo=<配装id> 时生效，
 * 直接打开计算器时什么都不做。
 *
 * 1. 关联角色：每个备忘录配装对应计算器里的一个角色（jw3memo:calc-link:v1）。
 *    第一次打开时新建，之后打开同一个角色。必须在页面渲染前完成，
 *    因为计算器页挂载时会按「当前角色id」加载角色。
 * 2. 写入种子：备忘录打开前把配装页的 12 件装备写进 jw3memo:calc-seed:v1:<配装id>。
 *    关联的角色从没保存过时，用种子生成装备信息并保存，然后触发一次秒伤计算。
 * 3. 回写结果：角色保存过以后，秒伤、装分、面板、12 件装备每次变化都写进
 *    jw3memo:calc-result:v1:<配装id>，并 postMessage 给父窗口（同源）。
 */
import { 简写转心法名 } from '@/心法模块/模块工具/获取心法数据'
import { 读取角色注册表, 新建角色, 设为当前角色 } from '@/角色/注册表'

const 关联键 = 'jw3memo:calc-link:v1'
const 种子键 = (配装id: string) => `jw3memo:calc-seed:v1:${配装id}`
const 结果键 = (配装id: string) => `jw3memo:calc-result:v1:${配装id}`

/** 备忘录写的种子。小附魔传种类（攻击、破招、主属性、无双·节日……），由这里换成计算器的附魔 id */
interface 种子类型 {
  v: 1
  /** 备忘录这边改过装备：即使角色保存过也用种子覆盖 */
  force?: boolean
  /** id 对不上时按名字找（两边装备库版本不同，同名装备 id 可能不一样） */
  slots: Array<{ index: string; id: number; name?: string; refine: number; gems: number[]; enchant: string | null }>
  stone: string | null
  big: Partial<Record<'hat' | 'coat' | 'belt' | 'wrist' | 'shoes', number>>
}

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

const 参数 = new URLSearchParams(window.location.search)
const 配装id = 参数.get('memo') || ''
const 心法 = 简写转心法名(参数.get('xf') || '') || ''
let 角色id = ''

const 读JSON = <T,>(键: string): T | undefined => {
  try {
    const 文本 = window.localStorage.getItem(键)
    return 文本 ? (JSON.parse(文本) as T) : undefined
  } catch {
    return undefined
  }
}

const 通知父窗口 = (消息: Record<string, unknown>) => {
  if (window.parent === window) return
  try {
    window.parent.postMessage({ source: 'jw3memo-calc', loadoutId: 配装id, ...消息 }, window.location.origin)
  } catch {
    // 父窗口不同源时不通知
  }
}

/** 计算器要求 1–20 个字、同心法不重名 */
const 可用名称 = (原名: string) => {
  const 截断 = (文本: string, 长度: number) => Array.from(文本.trim()).slice(0, 长度).join('')
  const 基础 = 截断(原名, 20) || '备忘录配装'
  const 已用 = new Set(
    读取角色注册表()
      .列表.filter((角色) => 角色.心法 === 心法)
      .map((角色) => 角色.名称),
  )
  if (!已用.has(基础)) return 基础
  for (let 序号 = 2; 序号 < 100; 序号++) {
    const 名称 = `${截断(基础, 20 - String(序号).length - 1)} ${序号}`
    if (!已用.has(名称)) return 名称
  }
  return `${截断(基础, 13)} ${Date.now() % 1000000}`
}

const 关联角色 = () => {
  const 关联 = 读JSON<Record<string, string>>(关联键) || {}
  const 已有 = 读取角色注册表().列表.find((角色) => 角色.id === 关联[配装id] && 角色.心法 === 心法)
  if (已有) {
    设为当前角色(已有.id)
    return 已有.id
  }
  const 角色 = 新建角色(心法, 可用名称(参数.get('name') || ''))
  关联[配装id] = 角色.id
  window.localStorage.setItem(关联键, JSON.stringify(关联))
  return 角色.id
}

if (配装id && 心法) {
  try {
    角色id = 关联角色()
  } catch (错误) {
    通知父窗口({ type: 'error', stage: 'link', message: String((错误 as Error)?.message || 错误) })
  }
}

/**
 * 焦点在计算器里时按 Esc：计算器没有打开的弹窗、抽屉、下拉菜单时，交给备忘录关掉计算器；
 * 有的话让计算器先关它自己的。事件冒泡到 window 时弹层还没从页面上消失，所以这里能判断出来。
 * 悬停出来的说明气泡（ant-popover）不算：鼠标停在下拉框上就会出现，不该拦住 Esc。
 */
const 有弹层 = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      '.ant-modal-wrap, .ant-drawer-content-wrapper, .ant-select-dropdown, .ant-dropdown, .ant-picker-dropdown, .ant-cascader-dropdown, .ant-image-preview-wrap, .ant-tour',
    ),
  ).some(
    (元素) =>
      元素.getClientRects().length > 0 &&
      getComputedStyle(元素).visibility !== 'hidden' &&
      !/-hidden\b/.test(元素.className),
  )
if (配装id && window.parent !== window) {
  window.addEventListener('keydown', (事件) => {
    if (事件.key !== 'Escape' || 事件.defaultPrevented || 事件.isComposing) return
    if (有弹层()) return
    通知父窗口({ type: 'escape' })
  })
}

/* ---------------- 页面加载后：种子和回写 ---------------- */

const 等待 = (条件: () => boolean, 超时 = 60000) =>
  new Promise<boolean>((resolve) => {
    const 开始 = Date.now()
    const 检查 = () => {
      if (条件()) return resolve(true)
      if (Date.now() - 开始 > 超时) return resolve(false)
      window.setTimeout(检查, 200)
    }
    检查()
  })

const 开始同步 = async () => {
  const [
    { default: store },
    数据模块,
    状态模块,
    计算模块,
    当前数据模块,
    { default: 根据表单选项获取装备信息 },
    面板工具,
    { 有效配装装备 },
    常量模块,
  ] = await Promise.all([
    import('@/store'),
    import('@/store/data'),
    import('@/角色/状态'),
    import('@/计算模块/计算函数'),
    import('@/数据/数据工具/获取当前数据'),
    import('@/功能模块/基础设置/属性录入/配装器/工具函数/根据表单选项获取装备信息'),
    import('@/功能模块/基础设置/面板信息/工具'),
    import('@/角色/计划'),
    import('@/数据/常量'),
  ])
  const 当前数据 = () => (当前数据模块.default as () => any)()
  const 状态 = () => store.getState().data as any
  const 已就绪 = () => 当前数据模块.获取当前心法名?.() === 心法 && 状态().当前角色?.id === 角色id

  if (!(await 等待(已就绪))) {
    通知父窗口({ type: 'error', stage: 'load', message: 'timeout' })
    return
  }
  通知父窗口({ type: 'ready' })

  /** 种子里在计算器装备库找不到的部位；回写时这些部位如果还空着，备忘录保留原来的装备 */
  let 未找到: string[] = []
  /**
   * 种子一件都没带进去时，计算器里还是它自己的默认装备。这时第一次算出的结果只记作基线，
   * 不回写；用户在计算器里改了、结果和基线不同以后才回写，免得把配装页覆盖成默认装备。
   */
  let 等用户改动 = false
  const 种子 = 读JSON<种子类型>(种子键(配装id))
  if (种子 && (种子.force || !状态模块.读取原始角色状态(角色id))) {
    const 数据 = 当前数据()
    const 附魔库: any[] = 数据.附魔 || []
    const 主属性: string = 数据.主属性 || ''
    const 表单值: Record<string, any> = { 五彩石: 种子.stone || undefined }
    for (const [键, 表单键] of Object.entries(大附魔表)) {
      表单值[表单键] = 种子.big?.[键 as keyof typeof 大附魔表] || 0
    }
    for (const 格 of 种子.slots || []) {
      const 部位 = 部位表[格.index]
      const 候选: any[] = 数据.装备数据?.[部位] || []
      const 装备 =
        候选.find((项) => 项.id === 格.id) ||
        (格.name ? 候选.filter((项) => 项.装备名称 === 格.name).sort((a, b) => (b.装备品级 || 0) - (a.装备品级 || 0))[0] : undefined)
      if (!部位 || !装备) {
        if (部位) 未找到.push(格.index)
        continue
      }
      表单值[格.index] = {
        id: 装备.id,
        装备部位: 部位,
        当前精炼等级: 等级(Math.min(Number(格.refine) || 0, 装备.最大精炼等级 ?? 8)),
        镶嵌孔数组: (装备.镶嵌孔数组 || []).slice(0, 3).map((孔: any, 序号: number) => ({
          镶嵌类型: 孔.镶嵌类型,
          镶嵌宝石等级: 等级(Number(格.gems?.[序号]) || 0),
        })),
        附魔: 找附魔(附魔库, 部位, 格.enchant, 主属性),
      }
    }
    const 总数 = (种子.slots || []).length
    if (!Object.keys(表单值).some((键) => 键.startsWith('_'))) {
      // 一件都不在计算器的装备库里（计算器只收当前版本的装备）：不动计算器里的配装，让用户在里面选
      window.localStorage.removeItem(种子键(配装id))
      等用户改动 = true
      通知父窗口({ type: 'seeded', missing: 未找到, dropped: [], total: 总数 })
    } else {
      try {
        const 生成 = (值: Record<string, any>) => 根据表单选项获取装备信息(值)
        const 去掉附魔 = (值: Record<string, any>) =>
          Object.fromEntries(
            Object.entries(值).map(([键, 项]) => [键, 键.startsWith('_') && 项 ? { ...项, 附魔: undefined } : 项]),
          )
        const 尝试: Array<{ 去掉: string[]; 值: Record<string, any> }> = [
          { 去掉: [], 值: 表单值 },
          { 去掉: ['stone'], 值: { ...表单值, 五彩石: undefined } },
          { 去掉: ['stone', 'enchant'], 值: 去掉附魔({ ...表单值, 五彩石: undefined }) },
        ]
        let 装备信息: any
        let 去掉了: string[] = []
        const 问题: string[] = []
        for (const 次 of 尝试) {
          const 候选 = 生成(次.值)
          if (有效配装装备(候选)) {
            装备信息 = 候选
            去掉了 = 次.去掉
            break
          }
          问题.push(诊断装备信息(候选).join('；'))
        }
        if (!装备信息) throw new Error('装备信息校验没通过：' + 问题[0])
        if (去掉了.length) console.warn('[备忘录桥接] 去掉了', 去掉了, '：', 问题[0])
        const 角色 = 状态().当前角色
        const 原状态 = 数据模块.获取角色状态(状态())
        if (!原状态) throw new Error('计算器还没加载好角色')
        const 结果 = 状态模块.保存角色配装(角色, { ...原状态, 装备信息 })
        store.dispatch(数据模块.应用角色状态(结果.状态))
        store.dispatch(计算模块.触发秒伤计算({ 是否更新显示计算结果: true }) as any)
        window.localStorage.removeItem(种子键(配装id))
        通知父窗口({ type: 'seeded', missing: 未找到, dropped: 去掉了, total: 总数 })
      } catch (错误) {
        未找到 = []
        const 说明 = String((错误 as Error)?.message || 错误)
        console.warn('[备忘录桥接] 种子没写进去：', 说明)
        通知父窗口({ type: 'error', stage: 'seed', message: 说明 })
      }
    }
  }

  let 上次签名 = ''
  let 基线签名 = ''
  let 定时器 = 0
  const 回写 = () => {
    const 数据 = 状态()
    if (数据.当前角色?.id !== 角色id) return
    if (!状态模块.读取原始角色状态(角色id)) return
    const 秒伤 = Number(数据.当前计算结果?.秒伤) || 0
    if (!(秒伤 > 0)) return
    const 装备信息 = 数据.装备信息
    const 面板 = 面板工具.获取角色需要展示的面板数据({
      装备信息,
      当前奇穴信息: 数据.当前奇穴信息,
      增益数据: 数据.增益数据,
      增益启用: 数据.增益启用,
      显示增益后面板: false,
    }) as any
    const 库 = 当前数据()
    // 百分比和计算器面板上显示的一样：系数随赛季变，备忘录这边不自己换算
    const 系数: any = 常量模块.自身属性系数 || {}
    const 两位 = (值: number) => Math.round((Number.isFinite(值) ? 值 : 0) * 100) / 100
    const 比 = (等级: number, 键: string) => (系数[键] ? (等级 / 系数[键]) * 100 : 0)
    const 百分比 = {
      crit: 两位(Math.min(比(面板?.会心等级 || 0, '会心'), 100)),
      critDmg: 两位(Math.min(比(面板?.会心效果等级 || 0, '会效') + 175, 300)),
      overcome: 两位(比(面板?.破防等级 || 0, '破防')),
      strain: 两位(比(面板?.无双等级 || 0, '无双')),
      haste: 两位(Math.min(比(面板?.加速等级 || 0, '急速'), 25)),
    }
    const 附魔库: any[] = 库.附魔 || []
    const 装备列表: any[] = 装备信息?.装备列表 || []
    const 已穿 = new Set(装备列表.map((项) => 项.装备部位索引))
    const 结果 = {
      v: 1,
      loadoutId: 配装id,
      roleId: 角色id,
      xinfa: 心法,
      dps: Math.round(秒伤),
      score: Math.round(面板?.装分 || 0),
      panel: {
        hp: Math.round(面板?.最终气血上限 || 0),
        vitality: Math.round(面板?.体质 || 0),
        primary: Math.round(面板?.[库.主属性] || 0),
        baseAttack: Math.round(面板?.基础攻击 || 0),
        attack: Math.round(面板?.面板攻击 || 0),
        critLv: Math.round(面板?.会心等级 || 0),
        critDmgLv: Math.round(面板?.会心效果等级 || 0),
        overcomeLv: Math.round(面板?.破防等级 || 0),
        strainLv: Math.round(面板?.无双等级 || 0),
        versatility: Math.round(面板?.全能等级 || 0),
        haste: Math.round(面板?.加速等级 || 0),
      },
      pct: 百分比,
      stone: 装备信息?.五彩石 || null,
      big: Object.fromEntries(
        Object.entries(大附魔表).map(([键, 表单键]) => [键, Number(装备信息?.装备增益?.[表单键]) || 0]),
      ),
      slots: 装备列表.map((项) => {
        const 定义 = (库.装备数据?.[项.装备部位] || []).find((装备: any) => 装备.id === 项.id) || {}
        const 附魔 = 附魔库.find((f) => f.id === 项.附魔)
        return {
          index: 项.装备部位索引,
          id: 项.id,
          name: 定义.装备名称 || '',
          iconId: 定义.图标ID || 0,
          ilvl: 定义.装备品级 || 0,
          refine: 项.当前精炼等级 || 0,
          maxRefine: 定义.最大精炼等级 ?? 6,
          gems: (项.镶嵌孔数组 || []).map((孔: any) => 孔.镶嵌宝石等级 || 0),
          enchant: 附魔 ? 附魔种类(附魔, 库.主属性 || '') : null,
          enchantLabel: 附魔 ? 附魔.附魔效果简写 : null,
        }
      }),
      missing: 未找到.filter((索引) => !已穿.has(索引)),
    }
    const 签名 = JSON.stringify(结果)
    if (等用户改动) {
      if (!基线签名) {
        基线签名 = 签名
        return
      }
      if (签名 === 基线签名) return
      等用户改动 = false
    }
    if (签名 === 上次签名) return
    上次签名 = 签名
    const 带时间 = { ...结果, at: new Date().toISOString() }
    try {
      window.localStorage.setItem(结果键(配装id), JSON.stringify(带时间))
    } catch {
      // 存储满了也照样通知父窗口
    }
    通知父窗口({ type: 'result', result: 带时间 })
  }
  store.subscribe(() => {
    window.clearTimeout(定时器)
    定时器 = window.setTimeout(回写, 400)
  })
  回写()
}

/** 精炼、宝石等级：计算器只认 0–8 的整数 */
function 等级(值: number) {
  return Math.max(0, Math.min(8, Math.round(值) || 0))
}

/** 装备信息哪里不合计算器的格式（照着 角色/计划.ts 的 有效配装装备 逐项查），用于报错 */
function 诊断装备信息(值: any): string[] {
  const 问题: string[] = []
  const 非数字 = (对象: any) =>
    Object.entries(对象 || {})
      .filter(([, 项]) => 项 !== undefined && !(typeof 项 === 'number' && Number.isFinite(项)))
      .map(([键, 项]) => `${键}=${String(项)}`)
  if (!值 || typeof 值 !== 'object') return ['不是对象']
  const 列表: any[] = Array.isArray(值.装备列表) ? 值.装备列表 : []
  if (!列表.length || 列表.length > 12) 问题.push(`装备列表 ${列表.length} 件`)
  const 基础 = 非数字(值.装备基础属性)
  if (基础.length) 问题.push('装备基础属性 ' + 基础.slice(0, 4).join(','))
  const 镶嵌 = 非数字(值.装备镶嵌附魔属性)
  if (镶嵌.length) 问题.push('装备镶嵌附魔属性 ' + 镶嵌.slice(0, 4).join(','))
  const 增益 = Object.entries(值.装备增益 || {}).filter(([, 项]) => {
    if (项 === undefined || (typeof 项 === 'number' && Number.isFinite(项))) return false
    return !(项 && typeof 项 === 'object' && Object.values(项).every((x) => typeof x === 'number' && Number.isFinite(x)))
  })
  if (增益.length) 问题.push('装备增益 ' + 增益.slice(0, 4).map(([键, 项]) => `${键}=${JSON.stringify(项)}`).join(','))
  if (值.五彩石 !== undefined && typeof 值.五彩石 !== 'string') 问题.push('五彩石 ' + typeof 值.五彩石)
  for (const 项 of 列表) {
    if (!Number.isInteger(项?.id) || 项.id < 0) 问题.push(`${项?.装备部位} id=${项?.id}`)
    if (项?.当前精炼等级 !== undefined && !(Number.isInteger(项.当前精炼等级) && 项.当前精炼等级 >= 0 && 项.当前精炼等级 <= 8))
      问题.push(`${项.装备部位} 精炼=${项.当前精炼等级}`)
    if (项?.附魔 !== undefined && !(Number.isInteger(项.附魔) && 项.附魔 > 0)) 问题.push(`${项.装备部位} 附魔=${项.附魔}`)
    for (const 孔 of 项?.镶嵌孔数组 || []) {
      if (孔?.镶嵌宝石等级 !== undefined && !(Number.isInteger(孔.镶嵌宝石等级) && 孔.镶嵌宝石等级 >= 0 && 孔.镶嵌宝石等级 <= 8))
        问题.push(`${项.装备部位} 宝石=${孔.镶嵌宝石等级}`)
      if (孔?.镶嵌类型 !== undefined && typeof 孔.镶嵌类型 !== 'string') 问题.push(`${项.装备部位} 镶嵌类型=${typeof 孔.镶嵌类型}`)
    }
  }
  return 问题.length ? 问题 : ['装备格式都对，可能是同一部位重复']
}

/** 计算器的附魔换成备忘录的种类名：主属性、无双·节日，其余是属性名（攻击、破防……） */
function 附魔种类(附魔: any, 主属性: string) {
  const 属性 = String(附魔.附魔效果简写 || '').split('+')[0]
  if (附魔.附魔颜色 === '蓝' && 属性 === '无双') return '无双·节日'
  if (主属性 && 属性 === 主属性) return '主属性'
  return 属性
}

/** 小附魔：按部位和种类找计算器里的附魔，取装分最高的；「无双·节日」取蓝色 */
function 找附魔(附魔库: any[], 部位: string, 种类: string | null, 主属性: string) {
  if (!种类) return undefined
  const 节日 = 种类 === '无双·节日'
  const 属性 = 节日 ? '无双' : 种类 === '主属性' ? 主属性 : 种类
  const 候选 = 附魔库
    .filter(
      (f) =>
        (f.附魔支持部位 || []).includes(部位) &&
        String(f.附魔效果简写 || '').startsWith(`${属性}+`) &&
        (节日 ? f.附魔颜色 === '蓝' : f.附魔颜色 !== '蓝'),
    )
    .sort((a, b) => (b.附魔装分 || 0) - (a.附魔装分 || 0))
  return 候选[0]?.id
}

if (配装id && 角色id) {
  if (document.readyState === 'complete') void 开始同步()
  else window.addEventListener('load', () => void 开始同步(), { once: true })
}

export {}

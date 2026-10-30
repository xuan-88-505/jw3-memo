/**
 * 截图识别奇穴：在截图里找这个心法的奇穴图标，按阅读顺序（先上后下、从左到右）对上第 1–9 层。
 *
 * - 全部在本机算，截图不上传。图标从魔盒图标站下载（允许跨域读取像素）。
 * - 只比图标中间一半：游戏里图标被裁成圆形、外面有框，我们界面里是圆角方块，中间一半两边都一样。
 * - 步骤：① 用第 7–9 层共用的图标粗搜几种大小，定出截图里图标多大；② 在这个大小上用全部候选找出像图标的位置；
 *   ③ 在每个位置精确比对（彩色，微调位置和大小）；④ 按阅读顺序分给第 1–9 层，选总相似度最高的一组。
 *   这样下面重复出现的「第一重」选项行、说明里的大图标都不会被当成后面的层。
 */
import { layersOf } from "@/data/seed";

export const talentIconUrl = (id: number) =>
  `https://icon.jx3box.com/icon/${id}.png`;

/** 比对图标中间的这一部分（边长占比） */
const CROP = 0.5;
/** 精确比对的边长：48 像素原图的中间 24 */
const FINE = 24;
/** 粗搜边长 */
const COARSE = 8;
/** 中等精度定位的边长 */
const MED = 12;
/** 粗搜时每个尺寸最多看这么多个位置，超出就隔点取 */
const MAX_POSITIONS = 160_000;
/** 精确比对后低于这个相似度的不算 */
export const ACCEPT = 0.86;
/** 还要比第二像的图标高出这么多：真图标一般高 0.4 以上，背景、文字只高 0.05 左右 */
export const MARGIN = 0.12;

type Plane = { w: number; h: number; d: Float32Array };

export interface ScanCandidate {
  /** 0–5 是第 1–6 层；6 是第 7–9 层共用 */
  group: number;
  pos: number;
  name: string;
  icon: number;
}

export interface ScanHit {
  /** 图标中心在截图里的位置和边长（原图像素） */
  x: number;
  y: number;
  size: number;
  /** 每个图标编号的相似度 */
  scores: Map<number, number>;
}

export interface TalentScanResult {
  /** 9 层各自认出的 pos；没认出是 null */
  picks: (number | null)[];
  /** 9 层各自的相似度 */
  scores: (number | null)[];
  /** 认出了几层 */
  found: number;
  /** 截图里图标的边长（像素） */
  iconSize: number;
  hits: ScanHit[];
  ms: number;
  /** 各步耗时（毫秒），排查用 */
  timing: Record<string, number>;
}

export type ScanErrorCode = "decode" | "icons" | "empty";
export class TalentScanError extends Error {
  constructor(public code: ScanErrorCode) {
    super(code);
  }
}

/* ---------------- 图像小工具 ---------------- */

/** 一维重采样的权重：缩小按面积平均，放大用线性插值 */
function taps(src: number, dst: number) {
  const out: { j: number; w: number }[][] = [];
  const s = src / dst;
  for (let i = 0; i < dst; i++) {
    const row: { j: number; w: number }[] = [];
    if (s >= 1) {
      const a = i * s;
      const b = a + s;
      for (let j = Math.floor(a); j < Math.min(src, Math.ceil(b)); j++) {
        const ov = Math.min(b, j + 1) - Math.max(a, j);
        if (ov > 0) row.push({ j, w: ov / s });
      }
    } else {
      const c = (i + 0.5) * s - 0.5;
      const j0 = Math.floor(c);
      const t = c - j0;
      const a = Math.min(src - 1, Math.max(0, j0));
      const b = Math.min(src - 1, Math.max(0, j0 + 1));
      row.push({ j: a, w: 1 - t }, { j: b, w: t });
    }
    out.push(row);
  }
  return out;
}

function resize(p: Plane, nw: number, nh: number): Plane {
  nw = Math.max(1, Math.round(nw));
  nh = Math.max(1, Math.round(nh));
  const hx = taps(p.w, nw);
  const hy = taps(p.h, nh);
  const tmp = new Float32Array(nw * p.h);
  for (let y = 0; y < p.h; y++) {
    const r = y * p.w;
    for (let x = 0; x < nw; x++) {
      let v = 0;
      for (const t of hx[x]) v += p.d[r + t.j] * t.w;
      tmp[y * nw + x] = v;
    }
  }
  const d = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const row = hy[y];
    for (let x = 0; x < nw; x++) {
      let v = 0;
      for (const t of row) v += tmp[t.j * nw + x] * t.w;
      d[y * nw + x] = v;
    }
  }
  return { w: nw, h: nh, d };
}

/** RGBA → R、G、B、灰度四个平面；透明处按黑底合成 */
function planes(rgba: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const R = rgba[i * 4] * a;
    const G = rgba[i * 4 + 1] * a;
    const B = rgba[i * 4 + 2] * a;
    r[i] = R;
    g[i] = G;
    b[i] = B;
    y[i] = 0.299 * R + 0.587 * G + 0.114 * B;
  }
  const P = (d: Float32Array): Plane => ({ w, h, d });
  return { r: P(r), g: P(g), b: P(b), y: P(y) };
}

/** 减去均值再归一化；方差太小（纯色块）返回 null */
function normalize(
  v: Float32Array,
  channels = 1,
  out = new Float32Array(v.length)
): Float32Array | null {
  const n = v.length / channels;
  let ss = 0;
  for (let c = 0; c < channels; c++) {
    let m = 0;
    for (let i = 0; i < n; i++) m += v[c * n + i];
    m /= n;
    for (let i = 0; i < n; i++) {
      const x = v[c * n + i] - m;
      out[c * n + i] = x;
      ss += x * x;
    }
  }
  if (ss < v.length * 4) return null;
  const k = 1 / Math.sqrt(ss);
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}

function dot(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** 图标中间那块，缩成 size×size；返回各平面 */
function iconCrop(p: Plane, size: number): Plane {
  const c = Math.round(p.w * CROP);
  const o = Math.round((p.w - c) / 2);
  const d = new Float32Array(c * c);
  for (let y = 0; y < c; y++)
    for (let x = 0; x < c; x++) d[y * c + x] = p.d[(o + y) * p.w + o + x];
  return resize({ w: c, h: c, d }, size, size);
}

/** 双线性取一块 n×n：左上角 (x0, y0)，边长 s（平面像素） */
function sample(
  p: Plane,
  x0: number,
  y0: number,
  s: number,
  n: number,
  out: Float32Array,
  off: number
) {
  if (
    s === n &&
    Number.isInteger(x0) &&
    Number.isInteger(y0) &&
    x0 >= 0 &&
    y0 >= 0 &&
    x0 + n <= p.w &&
    y0 + n <= p.h
  ) {
    for (let i = 0; i < n; i++) {
      const r = (y0 + i) * p.w + x0;
      for (let j = 0; j < n; j++) out[off + i * n + j] = p.d[r + j];
    }
    return;
  }
  const step = s / n;
  for (let i = 0; i < n; i++) {
    const fy = Math.min(p.h - 1.001, Math.max(0, y0 + (i + 0.5) * step - 0.5));
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const r0 = iy * p.w;
    const r1 = r0 + p.w;
    for (let j = 0; j < n; j++) {
      const fx = Math.min(
        p.w - 1.001,
        Math.max(0, x0 + (j + 0.5) * step - 0.5)
      );
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const a = p.d[r0 + ix] * (1 - tx) + p.d[r0 + ix + 1] * tx;
      const b = p.d[r1 + ix] * (1 - tx) + p.d[r1 + ix + 1] * tx;
      out[off + i * n + j] = a * (1 - ty) + b * ty;
    }
  }
}

/* ---------------- 粗搜 ---------------- */

interface Coarse {
  /** 每个位置所有模板里的最高相似度 */
  best: Float32Array;
  w: number;
  h: number;
  stride: number;
  /** 每个模板的最高相似度 */
  maxOf: Float32Array;
}

/** 在灰度图上用 COARSE×COARSE 的模板滑动比对 */
function coarseSearch(
  img: Plane,
  tmpls: Float32Array[],
  maxPositions = MAX_POSITIONS
): Coarse {
  const t = COARSE;
  const n = t * t;
  const W = img.w - t + 1;
  const H = img.h - t + 1;
  const maxOf = new Float32Array(tmpls.length).fill(-1);
  if (W <= 0 || H <= 0)
    return { best: new Float32Array(0), w: 0, h: 0, stride: 1, maxOf };
  const stride = Math.max(1, Math.ceil(Math.sqrt((W * H) / maxPositions)));
  const cw = Math.ceil(W / stride);
  const ch = Math.ceil(H / stride);
  const best = new Float32Array(cw * ch).fill(-1);
  // 积分图：窗口的和与平方和
  const iw = img.w + 1;
  const S = new Float64Array(iw * (img.h + 1));
  const Q = new Float64Array(iw * (img.h + 1));
  for (let y = 0; y < img.h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < img.w; x++) {
      const v = img.d[y * img.w + x];
      rs += v;
      rq += v * v;
      S[(y + 1) * iw + x + 1] = S[y * iw + x + 1] + rs;
      Q[(y + 1) * iw + x + 1] = Q[y * iw + x + 1] + rq;
    }
  }
  const win = new Float32Array(n);
  const K = tmpls.length;
  const argX = new Int32Array(K);
  const argY = new Int32Array(K);
  // 方差太小的窗口（纯色背景）跳过：标准差低于 6/255
  const minVar = n * 36;
  /** 取出 (x, y) 处的窗口，返回 1/标准差；纯色返回 0 */
  const load = (x: number, y: number) => {
    const a = y * iw + x;
    const b = (y + t) * iw + x;
    const sum = S[b + t] - S[b] - S[a + t] + S[a];
    const sq = Q[b + t] - Q[b] - Q[a + t] + Q[a];
    const v = sq - (sum * sum) / n;
    if (v < minVar) return 0;
    for (let r = 0; r < t; r++) {
      const o = (y + r) * img.w + x;
      for (let c = 0; c < t; c++) win[r * t + c] = img.d[o + c];
    }
    return 1 / Math.sqrt(v);
  };
  for (let cy = 0; cy < ch; cy++) {
    const y = cy * stride;
    for (let cx = 0; cx < cw; cx++) {
      const x = cx * stride;
      const inv = load(x, y);
      if (!inv) continue;
      let top = -1;
      for (let k = 0; k < K; k++) {
        const T = tmpls[k];
        let s = 0;
        for (let i = 0; i < n; i++) s += win[i] * T[i];
        s *= inv;
        if (s > top) top = s;
        if (s > maxOf[k]) {
          maxOf[k] = s;
          argX[k] = x;
          argY[k] = y;
        }
      }
      best[cy * cw + cx] = top;
    }
  }
  // 隔点取样时，每个模板在最高点附近逐点补搜，免得正好错过
  if (stride > 1)
    for (let k = 0; k < K; k++) {
      if (maxOf[k] < 0) continue;
      const T = tmpls[k];
      for (
        let y = Math.max(0, argY[k] - stride + 1);
        y <= Math.min(H - 1, argY[k] + stride - 1);
        y++
      )
        for (
          let x = Math.max(0, argX[k] - stride + 1);
          x <= Math.min(W - 1, argX[k] + stride - 1);
          x++
        ) {
          const inv = load(x, y);
          if (!inv) continue;
          let s = 0;
          for (let i = 0; i < n; i++) s += win[i] * T[i];
          s *= inv;
          if (s > maxOf[k]) maxOf[k] = s;
        }
    }
  return { best, w: cw, h: ch, stride, maxOf };
}

/** 粗搜结果里的局部最高点（坐标是粗搜图上的像素） */
function peaks(c: Coarse, thr: number, radius: number, limit = 400) {
  const out: { x: number; y: number; s: number }[] = [];
  const r = Math.max(1, Math.round(radius / c.stride));
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const v = c.best[y * c.w + x];
      if (v < thr) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= c.h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= c.w || (dx === 0 && dy === 0)) continue;
          const u = c.best[yy * c.w + xx];
          // 平台区只留左上角的那个
          if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) {
            ok = false;
            break;
          }
        }
      }
      if (ok) out.push({ x: x * c.stride, y: y * c.stride, s: v });
    }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, limit);
}

/* ---------------- 主流程 ---------------- */

export function candidatesOf(xinfa: string): ScanCandidate[] {
  const layers = layersOf(xinfa);
  const out: ScanCandidate[] = [];
  for (let g = 0; g < 7; g++)
    for (const o of layers[g]?.options ?? [])
      out.push({ group: g, pos: o.pos, name: o.name, icon: o.icon });
  return out;
}

/**
 * 中等精度：把截图缩到「图标中间那块正好 12 像素」，在 (x, y) 处和一组模板比。
 * 只取少量窗口，所以直接在窗口里算均值和方差。
 */
function medStage(p: Plane, size: number) {
  const f = MED / (size * CROP);
  const g = resize(p, p.w * f, p.h * f);
  const n = MED * MED;
  const win = new Float32Array(n);
  /** 取出 (x, y) 处的窗口并减去均值；返回 1/标准差，纯色或出界返回 0 */
  const load = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + MED > g.w || y + MED > g.h) return 0;
    let sum = 0;
    for (let r = 0; r < MED; r++) {
      const o = (y + r) * g.w + x;
      for (let c = 0; c < MED; c++) {
        const v = g.d[o + c];
        win[r * MED + c] = v;
        sum += v;
      }
    }
    const m = sum / n;
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const v = win[i] - m;
      win[i] = v;
      ss += v * v;
    }
    return ss < n * 36 ? 0 : 1 / Math.sqrt(ss);
  };
  const best = (x: number, y: number, list: Float32Array[]) => {
    const inv = load(x, y);
    if (!inv) return -1;
    let top = -1;
    for (const T of list) {
      let sc = 0;
      for (let i = 0; i < n; i++) sc += win[i] * T[i];
      if (sc > top) top = sc;
    }
    return top * inv;
  };
  /** 在 (x, y) 周围 ±r 找最高的位置 */
  const around = (x: number, y: number, r: number, list: Float32Array[]) => {
    let s = -1;
    let bx = x;
    let by = y;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const v = best(x + dx, y + dy, list);
        if (v > s) {
          s = v;
          bx = x + dx;
          by = y + dy;
        }
      }
    return { x: bx, y: by, s };
  };
  /** (x, y) 处和每个模板的相似度 */
  const all = (x: number, y: number, list: Float32Array[]) => {
    const inv = load(x, y);
    return list.map(T => {
      if (!inv) return -1;
      let sc = 0;
      for (let i = 0; i < n; i++) sc += win[i] * T[i];
      return sc * inv;
    });
  };
  return { f, around, all };
}

/** 下载图标并转成平面；同一个编号只下载一次 */
const ICON_TIMEOUT_MS = 15_000;
const iconCache = new Map<number, Promise<ReturnType<typeof planes>>>();
function loadIcon(id: number) {
  let p = iconCache.get(id);
  if (!p) {
    p = (async () => {
      // 网络卡住时不能一直转圈：单个图标 15 秒没下完就算失败
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), ICON_TIMEOUT_MS);
      let blob: Blob;
      try {
        const res = await fetch(talentIconUrl(id), {
          mode: "cors",
          cache: "force-cache",
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`icon ${id}: ${res.status}`);
        blob = await res.blob();
      } finally {
        clearTimeout(timer);
      }
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 48;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0, 48, 48);
      bmp.close?.();
      return planes(ctx.getImageData(0, 0, 48, 48).data, 48, 48);
    })();
    p.catch(() => iconCache.delete(id));
    iconCache.set(id, p);
  }
  return p;
}

/** 截图解码；太大的先缩小（长边不超过 2400） */
async function decode(src: Blob | ImageData) {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src);
  } catch {
    throw new TalentScanError("decode");
  }
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { k, w, h, img: planes(ctx.getImageData(0, 0, w, h).data, w, h) };
}

const tick = () => new Promise<void>(r => setTimeout(r, 0));

/** 识别截图。src 可以是图片文件，也可以是桌面版从剪贴板读出的像素 */
export async function scanTalents(
  src: Blob | ImageData,
  xinfa: string
): Promise<TalentScanResult> {
  const t0 = performance.now();
  const timing: Record<string, number> = {};
  let tPrev = t0;
  const lap = (name: string) => {
    const now = performance.now();
    timing[name] = (timing[name] ?? 0) + Math.round(now - tPrev);
    tPrev = now;
  };
  const cands = candidatesOf(xinfa);
  if (!cands.length) throw new TalentScanError("empty");
  const wanted = Array.from(new Set(cands.map(c => c.icon)));
  const [shot, settled] = await Promise.all([
    decode(src),
    Promise.allSettled(wanted.map(loadIcon)),
  ]);
  // 个别图标下载失败只是认不出那几个；七成以上下载成功才继续
  const ids = wanted.filter((_, i) => settled[i].status === "fulfilled");
  const icons = settled.flatMap(r =>
    r.status === "fulfilled" ? [r.value] : []
  );
  if (ids.length < wanted.length * 0.7) throw new TalentScanError("icons");
  const { img, k: shrink } = shot;
  lap("load");

  // 模板：粗搜灰度 8×8，中等精度灰度 12×12，精确比对彩色 24×24
  const coarseT = new Map<number, Float32Array>();
  const medT = new Map<number, Float32Array>();
  const fineT = new Map<number, Float32Array>();
  ids.forEach((id, i) => {
    const ic = icons[i];
    const g = normalize(iconCrop(ic.y, COARSE).d);
    if (g) coarseT.set(id, g);
    const m = normalize(iconCrop(ic.y, MED).d);
    if (m) medT.set(id, m);
    const rgb = new Float32Array(FINE * FINE * 3);
    rgb.set(iconCrop(ic.r, FINE).d, 0);
    rgb.set(iconCrop(ic.g, FINE).d, FINE * FINE);
    rgb.set(iconCrop(ic.b, FINE).d, FINE * FINE * 2);
    const f = normalize(rgb, 3);
    if (f) fineT.set(id, f);
  });
  const allIds = ids.filter(
    id => coarseT.has(id) && medT.has(id) && fineT.has(id)
  );
  if (!allIds.length) throw new TalentScanError("icons");
  const coarseList = allIds.map(id => coarseT.get(id)!);
  const medList = allIds.map(id => medT.get(id)!);
  const fineList = allIds.map(id => fineT.get(id)!);

  // ① 定图标大小：第 7–9 层共用的图标（选中条里一定有 3 个）加第 1 层，粗搜 20–220 像素
  const sweepIds = Array.from(
    new Set(cands.filter(c => c.group === 6 || c.group === 0).map(c => c.icon))
  ).filter(id => coarseT.has(id));
  const sweepUse = sweepIds.length ? sweepIds : allIds;
  const sweepT = sweepUse.map(id => coarseT.get(id)!);
  const sweepM = sweepUse.map(id => medT.get(id)!);
  const minSide = Math.min(img.y.w, img.y.h);
  const curve: { size: number; score: number }[] = [];
  // 步长 1.25 就够：精确比对会再把大小微调 ±16%，差 6% 以上还会按实际大小重跑
  for (let size = 20; size <= Math.min(220, minSide * 1.1); size *= 1.25) {
    // 粗搜只给位置；文字在 8×8 灰度下也很像，所以用 12×12 验证后再打分
    const f = COARSE / (size * CROP);
    const c = coarseSearch(
      resize(img.y, img.y.w * f, img.y.h * f),
      sweepT,
      40_000
    );
    const M = medStage(img.y, size);
    const toMed = M.f / f;
    const top = peaks(c, 0.5, 2, 100)
      .map(
        p =>
          M.around(Math.round(p.x * toMed), Math.round(p.y * toMed), 3, sweepM)
            .s
      )
      .sort((a, b) => b - a)
      .slice(0, 3);
    curve.push({
      size,
      score: top.length ? top.reduce((a, b) => a + b, 0) / top.length : -1,
    });
    await tick();
  }
  if (!curve.length) curve.push({ size: Math.max(16, minSide), score: 0 });
  lap("size");
  // 同一张图里可能有两种大小（我们界面：选中的一排 48，下面选项 40），分数接近的局部最高点都试
  const peaksOfCurve = curve
    .filter(
      (c, i) =>
        (i === 0 || c.score >= curve[i - 1].score) &&
        (i === curve.length - 1 || c.score >= curve[i + 1].score)
    )
    .sort((a, b) => b.score - a.score);
  const trySizes = [peaksOfCurve[0] ?? curve[0]];
  for (const c of peaksOfCurve.slice(1)) {
    if (c.score < trySizes[0].score - 0.06 || trySizes.length >= 2) break;
    if (
      trySizes.every(
        t => Math.max(t.size, c.size) / Math.min(t.size, c.size) >= 1.15
      )
    )
      trySizes.push(c);
  }

  /** 在这个大小上找图标，返回位置（原图坐标）和对每个候选的相似度 */
  const findAt = async (size: number) => {
    // ② 粗搜：找出像图标的位置。文字也会像，所以多留一些，后面再筛
    const fC = COARSE / (size * CROP);
    const coarse = coarseSearch(
      resize(img.y, img.y.w * fC, img.y.h * fC),
      coarseList
    );
    const seeds = peaks(coarse, 0.55, 2, 2000);
    lap("coarse");
    await tick();

    // ③ 中等精度定位：12×12 灰度，在每个候选位置周围 ±2 找最准的位置
    const M = medStage(img.y, size);
    const fM = M.f;
    const toMed = fM / fC;
    const located: { x: number; y: number; cand: number[] }[] = [];
    for (const p of seeds) {
      const m = M.around(
        Math.round(p.x * toMed),
        Math.round(p.y * toMed),
        2,
        medList
      );
      if (m.s < 0.62) continue;
      if (
        located.some(l => Math.abs(l.x - m.x) <= 1 && Math.abs(l.y - m.y) <= 1)
      )
        continue;
      // 中等精度最像的 4 个图标，精确比对只比这几个
      const cand = M.all(m.x, m.y, medList)
        .map((sc, i) => ({ sc, i }))
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 4)
        .map(c => c.i);
      located.push({ x: m.x, y: m.y, cand });
    }
    lap("med");
    await tick();

    // ④ 精确比对：截图缩到「中间那块正好 24 像素」，彩色比对，再微调位置和大小
    const fF = FINE / (size * CROP);
    const fineImg = [img.r, img.g, img.b].map(pl =>
      resize(pl, pl.w * fF, pl.h * fF)
    );
    const raw = new Float32Array(FINE * FINE * 3);
    const vec = new Float32Array(FINE * FINE * 3);
    /** 取一块并归一化；返回共用的缓冲区，用完再取下一块 */
    const crop = (x: number, y: number, side: number) => {
      for (let c = 0; c < 3; c++)
        sample(fineImg[c], x, y, side, FINE, raw, c * FINE * FINE);
      return normalize(raw, 3, vec);
    };
    type Spot = { x: number; y: number; s: number; score: number };
    const spots: Spot[] = [];
    const toFine = fF / fM;
    for (const p of located) {
      const x0 = Math.round(p.x * toFine);
      const y0 = Math.round(p.y * toFine);
      // 初筛：起点周围 3×3 都比一次，每个图标取最高分。细节多的图标偏 1 像素相似度就会掉很多
      const near = new Float32Array(fineList.length).fill(-2);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const v = crop(x0 + dx, y0 + dy, FINE);
          if (!v) continue;
          for (const i of p.cand) {
            const sc = dot(v, fineList[i]);
            if (sc > near[i]) near[i] = sc;
          }
        }
      // 最像的 2 个图标
      let i1 = -1;
      let i2 = -1;
      let s1 = -2;
      let s2 = -2;
      near.forEach((sc, i) => {
        if (sc > s1) {
          i2 = i1;
          s2 = s1;
          i1 = i;
          s1 = sc;
        } else if (sc > s2) {
          i2 = i;
          s2 = sc;
        }
      });
      if (s1 < 0.5) continue;
      // 两个都在 ±2 像素内找最准的位置，胜出的再微调大小（±16%）和半像素
      let best: Spot | null = null;
      let bestI = i1;
      for (const i of [i1, i2]) {
        if (i < 0) continue;
        const T = fineList[i];
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const v = crop(x0 + dx, y0 + dy, FINE);
            const sc = v ? dot(v, T) : -1;
            if (!best || sc > best.score) {
              best = { x: x0 + dx, y: y0 + dy, s: FINE, score: sc };
              bestI = i;
            }
          }
      }
      if (!best || best.score < ACCEPT - 0.2) continue;
      const T = fineList[bestI];
      let cur: Spot = best;
      const tryAt = (x: number, y: number, side: number) => {
        const v = crop(x, y, side);
        const sc = v ? dot(v, T) : -1;
        if (sc > cur.score) cur = { x, y, s: side, score: sc };
      };
      const cx = cur.x + FINE / 2;
      const cy = cur.y + FINE / 2;
      for (const m of [0.84, 0.88, 0.92, 0.96, 1.04, 1.08, 1.12, 1.16]) {
        const side = FINE * m;
        tryAt(cx - side / 2, cy - side / 2, side);
      }
      const sx = cur.x;
      const sy = cur.y;
      for (let dy = -0.5; dy <= 0.5; dy += 0.5)
        for (let dx = -0.5; dx <= 0.5; dx += 0.5)
          if (dx || dy) tryAt(sx + dx, sy + dy, cur.s);
      if (cur.score >= ACCEPT - 0.1) spots.push(cur);
    }

    // 同一个图标只留最像的那个位置
    spots.sort((a, b) => b.score - a.score);
    const kept: Spot[] = [];
    for (const sp of spots) {
      const cx = sp.x + sp.s / 2;
      const cy = sp.y + sp.s / 2;
      if (
        kept.some(
          k => Math.hypot(k.x + k.s / 2 - cx, k.y + k.s / 2 - cy) < FINE * 0.9
        )
      )
        continue;
      kept.push(sp);
    }
    // 认得清楚的位置实际多大（相对 size 的比例）
    const clearRatios = kept
      .filter(sp => sp.score >= ACCEPT)
      .map(sp => sp.s / FINE)
      .sort((a, b) => a - b);
    const ratio = clearRatios.length
      ? clearRatios[Math.floor(clearRatios.length / 2)]
      : null;
    const scale = 1 / (fF * shrink);
    const hits: ScanHit[] = kept.map(sp => {
      const v = crop(sp.x, sp.y, sp.s);
      const scores = new Map<number, number>();
      if (v) allIds.forEach((id, i) => scores.set(id, dot(v, fineList[i])));
      return {
        x: (sp.x + sp.s / 2) * scale,
        y: (sp.y + sp.s / 2) * scale,
        size: (sp.s / CROP) * scale,
        scores,
      };
    });
    lap("fine");
    timing.seeds = (timing.seeds ?? 0) + seeds.length;
    timing.located = (timing.located ?? 0) + located.length;
    await tick();
    return { hits, ratio };
  };

  const all: ScanHit[] = [];
  const sizesUsed: number[] = [];
  for (const t of trySizes) {
    let size = t.size;
    let pass = await findAt(size);
    // 和估计差 6% 以上就按实际大小重跑（最多 2 次）
    for (
      let round = 0;
      round < 2 && pass.ratio && Math.abs(pass.ratio - 1) >= 0.06;
      round++
    ) {
      size *= pass.ratio;
      pass = await findAt(size);
    }
    sizesUsed.push(Math.round(size / shrink));
    all.push(...pass.hits);
  }
  timing.sizes = sizesUsed.length;

  // 两种大小找到的同一个图标只留更像的
  const topOf = (h: ScanHit) => Math.max(-1, ...h.scores.values());
  all.sort((a, b) => topOf(b) - topOf(a));
  const hits: ScanHit[] = [];
  for (const h of all) {
    if (
      hits.some(
        k => Math.hypot(k.x - h.x, k.y - h.y) < Math.min(k.size, h.size) * 0.5
      )
    )
      continue;
    hits.push(h);
  }

  // ⑤ 阅读顺序：按行（中心高度差小于半个图标算同一行），行内从左到右
  hits.sort((a, b) => a.y - b.y);
  const rows: ScanHit[][] = [];
  for (const h of hits) {
    const row = rows.find(
      r => Math.abs(r[0].y - h.y) < Math.min(r[0].size, h.size) * 0.5
    );
    if (row) row.push(h);
    else rows.push([h]);
  }
  const ordered = rows.flatMap(r => r.sort((a, b) => a.x - b.x));

  const { picks, scores } = assign(ordered, cands);
  return {
    picks,
    scores,
    found: picks.filter(p => p !== null).length,
    iconSize: sizesUsed[0] ?? 0,
    hits: ordered,
    ms: Math.round(performance.now() - t0),
    timing,
  };
}

/** 提前下载这个心法的奇穴图标，第一次识别就不用等下载 */
export function preloadTalentIcons(xinfa: string) {
  for (const id of new Set(candidatesOf(xinfa).map(c => c.icon)))
    loadIcon(id).catch(() => {});
}

/**
 * 把识别结果合进当前奇穴：认出的层换掉，没认出的层保持原样。
 * 第 7–9 层不能重复：没认出的那层如果和认出的撞了，换成一个还没被占用的选项。
 */
export function mergePicks(
  current: number[],
  picks: (number | null)[],
  poolPositions: number[]
) {
  const next = [...current];
  picks.forEach((p, i) => {
    if (p !== null) next[i] = p;
  });
  const pool = [6, 7, 8];
  for (const j of pool) {
    if (picks[j] !== null) continue;
    const usedByOthers = (pos: number) =>
      pool.some(k => k !== j && next[k] === pos);
    if (!usedByOthers(next[j])) continue;
    const free = poolPositions.find(pos => !usedByOthers(pos));
    if (free !== undefined) next[j] = free;
  }
  return next;
}

/**
 * 按阅读顺序把位置分给第 1–9 层：层号只能往后走，可以跳过位置或层；
 * 第 7–9 层不能重复。先让认出的层数最多，再让相似度总和最高。
 */
export function assign(hits: ScanHit[], cands: ScanCandidate[]) {
  const groupOf = (layer: number) => Math.min(layer, 6);
  // 一个图标要算「认出」：相似度够高，并且明显比第二像的图标高
  const clear = (h: ScanHit, icon: number) => {
    const s = h.scores.get(icon) ?? -1;
    if (s < ACCEPT) return -1;
    let second = -1;
    h.scores.forEach((v, id) => {
      if (id !== icon && v > second) second = v;
    });
    return s - second >= MARGIN ? s : -1;
  };
  // 每个位置、每层：最像的选项
  const best = hits.map(h =>
    Array.from({ length: 9 }, (_, layer) => {
      let pick: { pos: number; score: number } | null = null;
      for (const c of cands) {
        if (c.group !== groupOf(layer)) continue;
        const s = clear(h, c.icon);
        if (s >= ACCEPT && (!pick || s > pick.score))
          pick = { pos: c.pos, score: s };
      }
      return pick;
    })
  );
  // 第 7–9 层每个位置可能有多个达标的选项（同图标），列出全部
  const poolOpts = hits.map(h =>
    cands
      .filter(c => c.group === 6)
      .map(c => ({ pos: c.pos, score: clear(h, c.icon) }))
      .filter(o => o.score >= ACCEPT)
      .sort((a, b) => b.score - a.score)
  );

  type Val = { n: number; s: number };
  const better = (a: Val, b: Val) =>
    a.n > b.n || (a.n === b.n && a.s > b.s + 1e-9);
  const memo = new Map<
    string,
    {
      v: Val;
      take?: { layer: number; pos: number; score: number };
      next?: string;
    }
  >();
  // 状态：看到第 i 个位置、下一个要填的层 L、第 7–9 层已用的 pos
  const solve = (i: number, L: number, used: string): Val => {
    if (i >= hits.length || L >= 9) return { n: 0, s: 0 };
    const key = `${i}|${L}|${used}`;
    const m = memo.get(key);
    if (m) return m.v;
    // 跳过这个位置
    let bestV = solve(i + 1, L, used);
    let rec: {
      v: Val;
      take?: { layer: number; pos: number; score: number };
      next?: string;
    } = {
      v: bestV,
      next: `${i + 1}|${L}|${used}`,
    };
    // 把这个位置给第 L..8 层中的某一层（中间的层算没认出）
    for (let layer = L; layer < 9; layer++) {
      const opts =
        layer >= 6
          ? poolOpts[i].filter(o => !used.split(",").includes(String(o.pos)))
          : best[i][layer]
            ? [best[i][layer]!]
            : [];
      const o = opts[0];
      if (!o) continue;
      const nu =
        layer >= 6 ? (used ? `${used},${o.pos}` : String(o.pos)) : used;
      const sub = solve(i + 1, layer + 1, nu);
      const v = { n: sub.n + 1, s: sub.s + o.score };
      if (better(v, bestV)) {
        bestV = v;
        rec = {
          v,
          take: { layer, pos: o.pos, score: o.score },
          next: `${i + 1}|${layer + 1}|${nu}`,
        };
      }
    }
    memo.set(key, rec);
    return bestV;
  };
  solve(0, 0, "");
  const picks: (number | null)[] = Array(9).fill(null);
  const scores: (number | null)[] = Array(9).fill(null);
  let key: string | undefined = `0|0|`;
  while (key) {
    const r = memo.get(key);
    if (!r) break;
    if (r.take) {
      picks[r.take.layer] = r.take.pos;
      scores[r.take.layer] = r.take.score;
    }
    key = r.next;
  }
  return { picks, scores };
}

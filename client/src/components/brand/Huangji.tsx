import { useEffect, useState } from "react";

/**
 * 黄鸡表情：剑网3 游戏内「萌鸡」表情（#b大笑 等），原图 30×30、2 帧动图。
 * 来源：魔盒表情库 https://data.jx3box.com/emotion/output/catalog.json
 * 文件放在 client/public/huangji/：hj-<id>.png 为第一帧静态图，hj-<id>.gif 为原动图。
 * 版权归西山居，仅用于自己和亲友使用。
 *
 * 顺序也是新角色默认分配的顺序。
 */
export const HUANGJI_MOODS = [
  { key: "大笑", id: 101 },
  { key: "开心", id: 103 },
  { key: "害羞", id: 95 },
  { key: "色", id: 97 },
  { key: "可怜", id: 96 },
  { key: "亲吻", id: 106 },
  { key: "嗷呜", id: 99 },
  { key: "流汗", id: 105 },
  { key: "鄙视", id: 100 },
  { key: "抠鼻", id: 108 },
  { key: "发怒", id: 102 },
  { key: "哭", id: 104 },
  { key: "嘤嘤", id: 110 },
  { key: "晕", id: 111 },
  { key: "再见", id: 112 },
  { key: "挨打", id: 98 },
  { key: "呕吐", id: 107 },
  { key: "掀桌", id: 109 },
] as const;

export type HuangjiMood = (typeof HUANGJI_MOODS)[number]["key"];

/** 原图边长 */
export const HUANGJI_NATIVE = 30;

export function moodLabel(mood: HuangjiMood) {
  return mood;
}

export function huangjiSrc(mood: HuangjiMood, animated = false) {
  const m = HUANGJI_MOODS.find(x => x.key === mood) ?? HUANGJI_MOODS[0];
  return `/huangji/hj-${m.id}.${animated ? "gif" : "png"}`;
}

/** 系统开启"减少动态效果"时只显示静态图 */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function Huangji({
  mood = "大笑",
  size = HUANGJI_NATIVE,
  animated = false,
  title,
}: {
  mood?: HuangjiMood;
  size?: number;
  /** 播放原动图；默认显示第一帧 */
  animated?: boolean;
  /** 传了就作为图片朗读；不传则对读屏隐藏 */
  title?: string;
}) {
  const reduced = useReducedMotion();
  // 30 的整数倍按像素放大保持清晰；其他尺寸平滑缩放
  const crisp = size % HUANGJI_NATIVE === 0;
  return (
    <img
      src={huangjiSrc(mood, animated && !reduced)}
      width={size}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className="shrink-0 select-none"
      style={{ imageRendering: crisp ? "pixelated" : "auto" }}
    />
  );
}

/** 按字符串稳定地取一个表情：同一个名字每次都一样 */
export function moodFor(seed: string): HuangjiMood {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return HUANGJI_MOODS[h % HUANGJI_MOODS.length].key;
}

/** 随机一个表情：新成员的默认头像 */
export function randomMood(): HuangjiMood {
  return HUANGJI_MOODS[Math.floor(Math.random() * HUANGJI_MOODS.length)].key;
}

/** 头像框里黄鸡的尺寸：放得下就用原尺寸 30 或 2 倍 60，保持像素清晰；更小的框按比例缩小 */
export function chickSize(box: number, round = false) {
  if (box >= 64) return HUANGJI_NATIVE * 2;
  if (box >= 34) return HUANGJI_NATIVE;
  return Math.round(box * (round ? 0.86 : 0.92));
}

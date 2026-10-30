/**
 * 空状态用的像素图标。每个图标是 16×16 的网格，一个字符一种颜色，"." 是透明。
 * 显示尺寸用 16 的整数倍（默认 48px，一格 3px），像素才能对齐。
 */

const PAL: Record<string, string> = {
  Y: "#e2c27e",
  y: "#b8924f",
  z: "#7d5f30",
  S: "#f1d3b3",
  s: "#c9a283",
  I: "#3b3129",
  R: "#d2462f",
  r: "#8f2d1e",
  P: "#ece6da",
  p: "#bab2a4",
  q: "#8a8274",
  W: "#9b6a43",
  w: "#5f3f26",
  V: "#c08a5a",
  G: "#d4b26c",
  g: "#f0d595",
  h: "#9a7a3a",
  E: "#dfe4e8",
  e: "#9aa3ad",
  d: "#5d6670",
  C: "#a3aabb",
  c: "#737a8e",
  x: "#4b5163",
  B: "#f2c94c",
  b: "#c99a1e",
  N: "#5f72a0",
  n: "#3e4b6e",
};

const BASE = {
  // 戴斗笠的侠客：还没有角色
  hero: [
    "................",
    ".......zz.......",
    "......zYYz......",
    ".....zYYYyz.....",
    "....zYYYYyyz....",
    "..zzyyyyyyyyzz..",
    ".zyyyyyyyyyyyyz.",
    "..zzzzzzzzzzzz..",
    "....ssssssss....",
    "....SSISSISS....",
    "....sSSSSSSs....",
    ".....ssSSss.....",
    "...rRRRssRRRr...",
    "..rRRRRrrRRRRr..",
    "..rRRRRRRRRRRr..",
    "..rrrrrrrrrrrr..",
  ],
  // 卷轴：还没有修改记录
  scroll: [
    "................",
    "..hGWWWWWWWWGh..",
    "..hGwwwwwwwwGh..",
    "...pPPPPPPPPp...",
    "...pPqqqqqqPp...",
    "...pPPPPPPPPp...",
    "...pPqqqqPPPp...",
    "...pPPPPPPPPp...",
    "...pPqqqqqqPp...",
    "...pPPPPPPPPp...",
    "...pPqqqPPRRp...",
    "...pPPPPPPRRp...",
    "...pppppppppp...",
    "..hGWWWWWWWWGh..",
    "..hGwwwwwwwwGh..",
    "................",
  ],
  // 剑：还没有配装
  sword: [
    "................",
    ".............ddd",
    "............dEEd",
    "...........dEEed",
    "..........dEEed.",
    ".........dEEed..",
    "........dEEed...",
    ".......dEEed....",
    "..hh..dEEed.....",
    "..hGhdEEed......",
    "...hGEEed.......",
    "....hGed........",
    "...wVhGh........",
    "..wVw.hGh.......",
    ".GVw...hh.......",
    ".GG.............",
  ],
  // 宝箱：还没有打本记录
  chest: [
    "................",
    "................",
    "................",
    "....wwwwwwww....",
    "...wVVVVVVVVw...",
    "..wVWGWWWWGWVw..",
    "..wWWGWWWWGWWw..",
    "..hhhhhhhhhhhh..",
    "..wWWGWggWGWWw..",
    "..wWWGWGGWGWWw..",
    "..wWWGWWWWGWWw..",
    "..wWWGWWWWGWWw..",
    "..wwwwwwwwwwww..",
    "................",
    "................",
    "................",
  ],
  // 雷云：避雷名单是空的
  thunder: [
    "................",
    "................",
    "......cccc......",
    "....ccPPCCc.....",
    "...cCPCCCCCcc...",
    ".ccCPCCCCCCCCc..",
    "cCCCCCCCCCCCCCc.",
    "cCCCCCCCCCCCCCCc",
    ".cxxxxxxxxxxxxc.",
    "......BBb.......",
    ".....BBb........",
    "....BBBBBb......",
    "......BBb.......",
    ".....BBb........",
    ".....Bb.........",
    "................",
  ],
  // 信鸽：还没有链接或图片
  pigeon: [
    "................",
    "................",
    "..........eee...",
    ".........eEEIe..",
    ".........eEEEeGG",
    "...ee....eEEEe..",
    "..eEEe..eEEEEe..",
    ".eEEEEeeEEEEEe..",
    "eEEEEEEEEEEEEe..",
    ".eddEEEEEEEEe...",
    "..eddddEEEEe....",
    "....eeeeRRe.....",
    ".......GRRG.....",
    ".......G..G.....",
    "................",
    "................",
  ],
  // 线装秘籍：面板里没有方案
  book: [
    "................",
    "................",
    "...nnnnnnnnnnn..",
    "...nNNNNNNNNNnP.",
    "...nNPPNNNNNNnP.",
    "...dNPqNNNNNNnP.",
    "...nNPPNNNNNNnP.",
    "...dNPqNNNNNNnP.",
    "...nNPPNNNNNNnP.",
    "...dNNNNNNNNNnP.",
    "...nNNNNNNNNNnP.",
    "...dNNNNNNNNNnP.",
    "...nNNNNNNNNNnP.",
    "...nnnnnnnnnnnP.",
    "....PPPPPPPPPPP.",
    "................",
  ],
  // 铜铃：没有新通知
  bell: [
    "................",
    ".......hh.......",
    "......h..h......",
    "......hGGh......",
    ".....hGggGh.....",
    "....hGgGGGGh....",
    "....hGgGGGGh....",
    "....hGgGGGGh....",
    "...hGgGGGGGGh...",
    "...hGgGGGGGGh...",
    "..hGGGGGGGGGGh..",
    "..hhhhhhhhhhhh..",
    ".......hh.......",
    "................",
    "................",
    "................",
  ],
} satisfies Record<string, readonly string[]>;

/** 双剑交叉：单剑左右镜像后叠上去。用于「只有一套配装，没法对比」 */
function crossed(grid: readonly string[]): string[] {
  return grid.map(row => {
    const mirror = [...row].reverse();
    return [...row].map((c, i) => (mirror[i] !== "." ? mirror[i] : c)).join("");
  });
}

const GRIDS = { ...BASE, swords: crossed(BASE.sword) };

export type PixelIconName = keyof typeof GRIDS;

interface Run {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/** 同一行里相邻的同色格子合成一个矩形，减少节点 */
function toRuns(grid: readonly string[]): Run[] {
  const runs: Run[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let w = 1;
      while (row[x + w] === c) w++;
      if (c !== ".") runs.push({ x, y, w, fill: PAL[c] });
      x += w;
    }
  });
  return runs;
}

const RUNS = Object.fromEntries(
  Object.entries(GRIDS).map(([k, g]) => [k, toRuns(g)])
) as Record<PixelIconName, Run[]>;

export function PixelIcon({
  name,
  size = 48,
  className,
}: {
  name: PixelIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {RUNS[name].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

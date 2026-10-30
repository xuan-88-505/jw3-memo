/**
 * 管理员头像上的像素皇冠（13 × 9 格，已带深色描边）。
 * 字母对应颜色：W 高光、L 浅金、G 金、D 暗金、R 红宝石、B 蓝宝石、O 描边。
 */
const GRID = [
  ".O....O....O.",
  "OWO..OWO..OWO",
  "OLO..OLO..OLO",
  "OGLOOLGLOOLGO",
  "OGGLLGGGLLGGO",
  "ODDDDDDDDDDDO",
  "OLGBGGRGGBGLO",
  "ODDDDDDDDDDDO",
  ".OOOOOOOOOOO.",
];
const COLORS: Record<string, string> = {
  W: "#FFF8E0",
  L: "#FFE28C",
  G: "#ECB240",
  D: "#AA6C18",
  R: "#E04034",
  B: "#5AAAE6",
  O: "#2E1A06",
};
export const CROWN_W = GRID[0].length;
export const CROWN_H = GRID.length;

const RECTS = GRID.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === "." ? [] : [{ x, y, fill: COLORS[c] }]))
);

/** cell 是每格的像素数；1 倍时 13 × 9 */
export function Crown({
  cell = 1,
  className,
  style,
}: {
  cell?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={CROWN_W * cell}
      height={CROWN_H * cell}
      viewBox={`0 0 ${CROWN_W} ${CROWN_H}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {RECTS.map(r => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={1}
          height={1}
          fill={r.fill}
        />
      ))}
    </svg>
  );
}

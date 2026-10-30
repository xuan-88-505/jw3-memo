"""生成没有底板、黄鸡铺满的 Windows 应用图标 icon.ico。

用法：python3 tools/icons/make_ico.py [仓库根目录] [输出路径]（默认当前目录、src-tauri/icons/icon.ico）
- 源图：client/public/huangji/hj-101.png（游戏表情「萌鸡 · 大笑」第 1 帧，30×30，内容 26×26）。
- 每个尺寸单独画：先按整数倍最近邻放大到 26×t，再按 26×26 面积平均缩到 t×t，
  用预乘 alpha 计算，透明边不发黑。
- 留白：每边 round(n / 64) 像素（16–32 不留，48 留 1，256 留 4）。
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "src-tauri/icons/icon.ico"

# Windows 会按系统缩放取尺寸：小图标 16/20/24/32，大图标 32/40/48/64，
# 任务栏 24/30/36/48，资源管理器 48–256。全部给出，系统不用临时缩放。
SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256]

src = Image.open(ROOT / "client/public/huangji/hj-101.png").convert("RGBA")
art = src.crop(src.getchannel("A").getbbox())  # 26×26
assert art.size == (26, 26), art.size
side = art.size[0]


def render(n: int) -> Image.Image:
    margin = round(n / 64)
    t = n - 2 * margin
    if t % side == 0:
        g = art.resize((t, t), Image.NEAREST)
    else:
        big = art.convert("RGBa").resize((side * t, side * t), Image.NEAREST)
        g = big.reduce(side).convert("RGBA")
    canvas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    canvas.alpha_composite(g, (margin, margin))
    return canvas


layers = [render(n) for n in SIZES]
base = layers[-1]
base.save(
    OUT,
    format="ICO",
    sizes=[(n, n) for n in SIZES],
    append_images=layers[:-1],
)

# 读回核对：每一档都在，且和画出来的一样。
ico = Image.open(OUT)
got = sorted(ico.info["sizes"])
assert got == [(n, n) for n in SIZES], got
for n, want in zip(SIZES, layers):
    ico.size = (n, n)
    have = ico.copy().convert("RGBA")
    assert have.tobytes() == want.tobytes(), f"{n}px 和画出来的不一样"
print("ok", OUT, "sizes", SIZES, "bytes", OUT.stat().st_size)

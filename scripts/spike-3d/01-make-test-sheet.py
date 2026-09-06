#!/usr/bin/env python3
"""
造 1024×1536 六宫格测试图（Pillow 版，弃手写 PNG writer——曾在 IHDR
像素宽/字节宽上出 bug 被 Meshy 服务端拒收，标准库工具优先）。

目的：为「六宫格拆单格」spike 提供可验证的输入。
- 六格各铺不同底色 + 中央画 7 段数码管风格大编号（1-6）
- 裁切正确的视觉证据：每格中心只见本格编号；若 x/y 弄反或越界，
  裁出的小图里会出现相邻格的颜色/编号，一眼可判。

用法：python3 scripts/spike-3d/01-make-test-sheet.py
输出：scripts/spike-3d/output/test-sheet.png
"""

from pathlib import Path

from PIL import Image, ImageDraw

W, H = 1024, 1536  # 与 lib/design/specimen-sheet.ts 的 PHOTO_W/PHOTO_H 一致
CELL = 512
COLS, ROWS = 2, 3

# 六格底色（RGB），02 脚本按位置断言归属（两处必须一致）
CELL_COLORS = [
    (46, 62, 80),    # r0c0 格1 深蓝灰
    (155, 89, 182),  # r0c1 格2 紫
    (39, 174, 96),   # r1c0 格3 绿
    (241, 196, 15),  # r1c1 格4 黄
    (231, 76, 60),   # r2c0 格5 红
    (149, 165, 166), # r2c1 格6 灰
]

# 7 段数码管段表（0顶 1右上 2右下 3底 4左下 5左上 6中）
DIGIT_SEGS = {
    "1": [1, 2],
    "2": [0, 1, 6, 4, 3],
    "3": [0, 1, 6, 2, 3],
    "4": [5, 6, 1, 2],
    "5": [0, 5, 6, 2, 3],
    "6": [0, 5, 6, 4, 2, 3],
}


def draw_seg(draw, x0, y0, w, h, t, seg):
    """在 (x0,y0) 宽 w 高 h 的框内画一段，t 为笔画粗细。"""
    cx, cy = x0 + w // 2, y0 + h // 2
    if seg == 0:
        box = (x0, y0, x0 + w, y0 + t)
    elif seg == 3:
        box = (x0, y0 + h - t, x0 + w, y0 + h)
    elif seg == 6:
        box = (x0, cy - t // 2, x0 + w, cy + t // 2)
    elif seg == 1:
        box = (x0 + w - t, y0, x0 + w, cy)
    elif seg == 2:
        box = (x0 + w - t, cy, x0 + w, y0 + h)
    elif seg == 5:
        box = (x0, y0, x0 + t, cy)
    elif seg == 4:
        box = (x0, cy, x0 + t, y0 + h)
    else:
        return
    draw.rectangle(box, fill=(255, 255, 255))


def main():
    img = Image.new("RGB", (W, H), CELL_COLORS[0])
    draw = ImageDraw.Draw(img)
    for idx, color in enumerate(CELL_COLORS):
        col, row = idx % COLS, idx // COLS
        x0, y0 = col * CELL, row * CELL
        draw.rectangle((x0, y0, x0 + CELL, y0 + CELL), fill=color)
        # 中央画编号：宽 40% 高 70%，笔画粗 28px（不依赖字体文件）
        nw, nh = int(CELL * 0.4), int(CELL * 0.7)
        nx0, ny0 = x0 + (CELL - nw) // 2, y0 + (CELL - nh) // 2
        for seg in DIGIT_SEGS[str(idx + 1)]:
            draw_seg(draw, nx0, ny0, nw, nh, 28, seg)

    out = Path(__file__).parent / "output" / "test-sheet.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG")
    print(f"✅ 测试图已生成：{out}（{W}×{H}，六格各色底 + 编号 1-6）")


if __name__ == "__main__":
    main()

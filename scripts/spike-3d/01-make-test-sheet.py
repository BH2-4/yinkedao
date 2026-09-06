#!/usr/bin/env python3
"""
造 1024×1536 六宫格测试图（纯标准库 PNG writer，零依赖）。

目的：为「六宫格拆单格」spike 提供可验证的输入。
- 六格各铺不同底色 + 中央画 7 段数码管风格大编号（1-6）
- 裁切正确的视觉证据：每格中心只见本格编号；若 x/y 弄反或越界，
  裁出的小图里会出现相邻格的颜色/编号，一眼可判。

用法：python3 scripts/spike-3d/01-make-test-sheet.py
输出：scripts/spike-3d/output/test-sheet.png
"""

import struct
import zlib
from pathlib import Path

W, H = 1024, 1536  # 与 lib/design/specimen-sheet.ts 的 PHOTO_W/PHOTO_H 一致
CELL = 512
COLS, ROWS = 2, 3

# 六格底色（RGB），裁切后按位置断言归属
CELL_COLORS = [
    (46, 62, 80),    # r0c0 格1 深蓝灰
    (155, 89, 182),  # r0c1 格2 紫
    (39, 174, 96),   # r1c0 格3 绿
    (241, 196, 15),  # r1c1 格4 黄
    (231, 76, 60),   # r2c0 格5 红
    (149, 165, 166), # r2c1 格6 灰
]

# 7 段数码管段表（段编号：0顶 1右上 2右下 3底 4左下 5左上 6中）
DIGIT_SEGS = {
    "1": [1, 2],
    "2": [0, 1, 6, 4, 3],
    "3": [0, 1, 6, 2, 3],
    "4": [5, 6, 1, 2],
    "5": [0, 5, 6, 2, 3],
    "6": [0, 5, 6, 4, 2, 3],
}


def draw_seg(buf, x0, y0, w, h, t, seg, color):
    """在 (x0,y0) 宽 w 高 h 的框内画一段，t 为笔画粗细。"""
    cx, cy = x0 + w // 2, y0 + h // 2
    if seg == 0:  # 顶（横）
        rx0, ry0, rx1, ry1 = x0, y0, x0 + w, y0 + t
    elif seg == 3:  # 底（横）
        rx0, ry0, rx1, ry1 = x0, y0 + h - t, x0 + w, y0 + h
    elif seg == 6:  # 中（横）
        rx0, ry0, rx1, ry1 = x0, cy - t // 2, x0 + w, cy + t // 2
    elif seg == 1:  # 右上（竖）
        rx0, ry0, rx1, ry1 = x0 + w - t, y0, x0 + w, cy
    elif seg == 2:  # 右下（竖）
        rx0, ry0, rx1, ry1 = x0 + w - t, cy, x0 + w, y0 + h
    elif seg == 5:  # 左上（竖）
        rx0, ry0, rx1, ry1 = x0, y0, x0 + t, cy
    elif seg == 4:  # 左下（竖）
        rx0, ry0, rx1, ry1 = x0, cy, x0 + t, y0 + h
    else:
        return
    for y in range(int(ry0), int(ry1)):
        for x in range(int(rx0), int(rx1)):
            buf[y][x] = color


def write_png(path, buf, w, h):
    """最小 PNG writer（RGBA -> RGB0，filter 0 逐行）。"""
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("3B", *buf[y][x]) for x in range(w))
        for y in range(h)
    )

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


def main():
    # 全幅底色铺第一格色（无格缝——真实照片格缝只是 SVG 视觉覆盖，此处验证纯裁切）
    buf = [[CELL_COLORS[0]] * W for _ in range(H)]
    for idx, color in enumerate(CELL_COLORS):
        col, row = idx % COLS, idx // COLS
        x0, y0 = col * CELL, row * CELL
        for y in range(y0, y0 + CELL):
            for x in range(x0, x0 + CELL):
                buf[y][x] = color
        # 中央画编号（尺寸取格子的 40%，笔画粗 28px）
        digit = str(idx + 1)
        nw, nh = int(CELL * 0.4), int(CELL * 0.7)
        nx0, ny0 = x0 + (CELL - nw) // 2, y0 + (CELL - nh) // 2
        white = (255, 255, 255)
        for seg in DIGIT_SEGS[digit]:
            draw_seg(buf, nx0, ny0, nw, nh, 28, seg, white)

    out = Path(__file__).parent / "output" / "test-sheet.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    write_png(out, buf, W, H)
    print(f"✅ 测试图已生成：{out}（{W}×{H}，六格 {CELL_COLORS[:1][0] if False else '各色'}底+编号1-6）")


if __name__ == "__main__":
    main()

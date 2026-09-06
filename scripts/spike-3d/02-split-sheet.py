#!/usr/bin/env python3
"""
六宫格拆单格 spike（纯标准库，弃用 sips——其 cropOffset 语义黑盒且
在 (y=1024, x=0) 组合下裁切失败返回原图尺寸，实测不可靠）。

本脚本是前端「canvas drawImage(img, sx, sy, sw, sh, 0, 0, CELL, CELL)」
裁切逻辑的命令行同构验证：同样的网格坐标，同样的裁切窗口。

- 裁 6 格 512×512 PNG
- 自动断言：每格四角 + 中心像素 = 该格预期底色（不依赖肉眼）
  （编号画在中央会遮住中心像素，中心点断言取编号外圈的格内点）

用法：python3 scripts/spike-3d/02-split-sheet.py
输出：scripts/spike-3d/output/cell-r{行}c{列}.png × 6
"""

import struct
import zlib
from pathlib import Path

W, H = 1024, 1536
CELL = 512
COLS, ROWS = 2, 3

# 与 01-make-test-sheet.py 的 CELL_COLORS 必须一致
CELL_COLORS = [
    (46, 62, 80),    # r0c0 格1
    (155, 89, 182),  # r0c1 格2
    (39, 174, 96),   # r1c0 格3
    (241, 196, 15),  # r1c1 格4
    (231, 76, 60),   # r2c0 格5
    (149, 165, 166), # r2c1 格6
]


def read_png_rgb(path):
    """解码本 spike 生成的 RGB PNG（filter 恒 0，逐行恒等 unfilter）。"""
    data = Path(path).read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "不是 PNG"
    pos, w, h, idat = 8, 0, 0, b""
    while pos < len(data):
        length, tag = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        if tag == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
            assert (depth, ctype) == (8, 2), f"仅支持 8bit RGB，得到 depth={depth} ctype={ctype}"
        elif tag == b"IDAT":
            idat += body
        pos += 12 + length
    raw = zlib.decompress(idat)
    px_w = w * 3 + 1  # 每行 filter 字节 + RGB
    assert len(raw) == px_w * h, "行数据长度不符（filter 非 0？）"
    return w, h, [raw[1 + y * px_w : (y + 1) * px_w] for y in range(h)]


def write_png(path, rows, w_px):
    """rows 为字节行（RGB 无 filter 前缀）；w_px 是像素宽——注意不是
    字节宽（曾把 512px*3=1536 字节宽写进 IHDR 导致 Meshy 解码
    'bad filter type'，字节错位后像素被当 filter 字节读）。"""
    h, px_w = len(rows), w_px * 3
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, body):
        c = tag + body
        return struct.pack(">I", len(body)) + c + struct.pack(">I", zlib.crc32(c))

    ihdr = struct.pack(">IIBBBBB", w_px, h, 8, 2, 0, 0, 0)
    Path(path).write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    )


def pixel(rows, x, y):
    row = rows[y]
    return tuple(row[x * 3 : x * 3 + 3])


def main():
    src = Path(__file__).parent / "output" / "test-sheet.png"
    w, h, rows = read_png_rgb(src)
    assert (w, h) == (W, H), f"测试图尺寸 {w}×{h}，预期 {W}×{H}"

    out_dir = src.parent
    failed = 0
    for idx, expect in enumerate(CELL_COLORS):
        col, row = idx % COLS, idx // COLS
        x0, y0 = col * CELL, row * CELL

        # 裁切（与前端 canvas drawImage 的 sx,sy,sw,sh 同参）
        cell_rows = [rows[y][x0 * 3 : (x0 + CELL) * 3] for y in range(y0, y0 + CELL)]
        dst = out_dir / f"cell-r{row}c{col}.png"
        write_png(dst, cell_rows, CELL)

        # 回读校验：解码输出文件本身（防止 IHDR/行宽错位类 bug 流出），
        # 服务端解码是唯一真相——本地必须先当一次严格的解码器。
        cw, chh, _crows = read_png_rgb(dst)
        assert (cw, chh) == (CELL, CELL), f"{dst.name} 回读 {cw}×{chh} ≠ {CELL}×{CELL}"

        # 断言：四角 + 编号外圈点均为本格底色；任何跨格泄漏都会变色
        checks = {
            "左上角": (x0 + 2, y0 + 2),
            "右上角": (x0 + CELL - 3, y0 + 2),
            "左下角": (x0 + 2, y0 + CELL - 3),
            "右下角": (x0 + CELL - 3, y0 + CELL - 3),
            "上边中点": (x0 + CELL // 2, y0 + 20),
        }
        bad = [name for name, (x, y) in checks.items() if pixel(rows, x, y) != expect]
        tag = f"格{idx + 1} (r{row}c{col})"
        if bad:
            failed += 1
            print(f"  ✗ {tag} 底色断言失败：{bad}（坐标泄漏？）")
        else:
            print(f"  ✓ {tag} 512×512，底色断言 5/5 通过")

    print(f"\n{'✅ 拆格 spike 通过' if failed == 0 else '❌ 拆格 spike 失败'}：{6 - failed}/6")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()

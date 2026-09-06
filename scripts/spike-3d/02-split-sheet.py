#!/usr/bin/env python3
"""
六宫格拆单格 spike（Pillow 版，纯标准业务零黑盒）。

本脚本是前端「canvas drawImage(img, sx, sy, sw, sh, 0, 0, CELL, CELL)」
裁切逻辑的命令行同构验证：同样的网格坐标，同样的裁切窗口。

- 裁 6 格 512×512 PNG
- 自动断言：每格四角 + 编号外圈点 = 该格预期底色（不依赖肉眼）
- 输出回读：Image.open 逐个验证尺寸（防 IHDR 类 bug 流出——教训来自
  手写 PNG writer 曾被 Meshy 服务端拒收 'bad filter type'）

用法：python3 scripts/spike-3d/02-split-sheet.py
输出：scripts/spike-3d/output/cell-r{行}c{列}.png × 6
"""

from pathlib import Path

from PIL import Image

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


def main():
    src = Path(__file__).parent / "output" / "test-sheet.png"
    assert src.exists(), f"缺少 {src}，先跑 01-make-test-sheet.py"
    sheet = Image.open(src).convert("RGB")
    assert sheet.size == (W, H), f"测试图尺寸 {sheet.size}，预期 {(W, H)}"

    out_dir = src.parent
    failed = 0
    for idx, expect in enumerate(CELL_COLORS):
        col, row = idx % COLS, idx // COLS
        x0, y0 = col * CELL, row * CELL

        # 裁切（与前端 canvas drawImage 的 sx,sy,sw,sh 同参）
        cell = sheet.crop((x0, y0, x0 + CELL, y0 + CELL))
        dst = out_dir / f"cell-r{row}c{col}.png"
        cell.save(dst, "PNG")

        # 回读校验：尺寸必须 512×512（防头信息错位类 bug 流出）
        back = Image.open(dst)
        ok_size = back.size == (CELL, CELL)

        # 底色断言：四角 + 编号外圈点（任何跨格泄漏都会变色）
        checks = {
            "左上角": (x0 + 2, y0 + 2),
            "右上角": (x0 + CELL - 3, y0 + 2),
            "左下角": (x0 + 2, y0 + CELL - 3),
            "右下角": (x0 + CELL - 3, y0 + CELL - 3),
            "上边中点": (x0 + CELL // 2, y0 + 20),
        }
        bad = [name for name, (x, y) in checks.items() if sheet.getpixel((x, y)) != expect]

        tag = f"格{idx + 1} (r{row}c{col})"
        if bad or not ok_size:
            failed += 1
            print(f"  ✗ {tag} 回读尺寸{'异常' if not ok_size else 'OK'}，底色断言失败：{bad}")
        else:
            print(f"  ✓ {tag} 512×512，底色断言 5/5 通过")

    print(f"\n{'✅ 拆格 spike 通过' if failed == 0 else '❌ 拆格 spike 失败'}：{6 - failed}/6")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()

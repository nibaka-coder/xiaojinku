# -*- coding: utf-8 -*-
"""生成小金库 PWA 图标（纯标准库，无需 Pillow）。

输出：app/public/icons/icon-192.png、icon-512.png、icon-maskable-512.png
设计：鼠尾草绿圆角底板 + 白色 ¥ 符号。
maskable 版本按规范把图形缩到安全区（约 62%），由系统自行裁形。

重新生成：python tools/generate_icons.py
"""
import math
import os
import struct
import zlib

BG = (95, 168, 150)  # 鼠尾草绿 #5fa896
FG = (255, 255, 255)  # 白
LINE_W = 0.088  # 笔画宽度（相对画布）
GLYPH_SCALE = 0.62  # maskable 版的安全区缩放

# ¥ 符号笔画（归一化坐标，中心为原点，y 向下为正）
SEGS = [
    (-0.21, -0.26, 0.00, 0.00),
    (0.21, -0.26, 0.00, 0.00),
    (0.00, 0.00, 0.00, 0.28),
    (-0.17, -0.02, 0.17, -0.02),
    (-0.17, 0.15, 0.17, 0.15),
]


def box_sdf(x, y, hw, hh, r):
    qx = abs(x) - hw + r
    qy = abs(y) - hh + r
    dx = qx if qx > 0 else 0.0
    dy = qy if qy > 0 else 0.0
    return math.hypot(dx, dy) + min(max(qx, qy), 0.0) - r


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    l2 = vx * vx + vy * vy
    if l2 == 0:
        return math.hypot(wx, wy)
    t = (wx * vx + wy * vy) / l2
    if t < 0:
        t = 0.0
    elif t > 1:
        t = 1.0
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def render(size, maskable):
    ss = 3  # 超采样倍数
    half = size / 2.0
    radius = 0.22 if not maskable else 0.0
    glyph_scale = GLYPH_SCALE if maskable else 1.0
    limit = LINE_W / 2.0
    rows = []
    for j in range(size):
        row = bytearray()
        for i in range(size):
            ar = ag = ab = aa = 0.0
            for sy in range(ss):
                py = (j + (sy + 0.5) / ss - half) / size
                gy = py / glyph_scale
                for sx in range(ss):
                    px = (i + (sx + 0.5) / ss - half) / size
                    if maskable:
                        inside = True
                    else:
                        inside = box_sdf(px, py, 0.5, 0.5, radius) <= 0
                    gx = px / glyph_scale
                    hit = False
                    if inside:
                        for ax, ay, bx, by in SEGS:
                            if seg_dist(gx, gy, ax, ay, bx, by) < limit:
                                hit = True
                                break
                    r, g, b = (FG if hit else BG) if inside else (0, 0, 0)
                    a = 1.0 if inside else 0.0
                    ar += r * a
                    ag += g * a
                    ab += b * a
                    aa += a
            if aa > 0:
                row += bytes(
                    (
                        int(round(ar / aa)),
                        int(round(ag / aa)),
                        int(round(ab / aa)),
                        int(round(aa / (ss * ss) * 255)),
                    )
                )
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "public", "icons")
    out = os.path.normpath(out)
    os.makedirs(out, exist_ok=True)
    for name, size, maskable in [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]:
        rows = render(size, maskable)
        p = os.path.join(out, name)
        write_png(p, size, rows)
        print("wrote", p, os.path.getsize(p), "bytes")


if __name__ == "__main__":
    main()

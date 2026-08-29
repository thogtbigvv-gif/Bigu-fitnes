#!/usr/bin/env python3
# make-icons.py — PWA-гийн icon-уудыг үүсгэнэ.
#
# Энэ файл АППЫН ХЭСЭГ БИШ: түгээлтэнд ордоггүй, ачаалахад дуудагддаггүй.
# Зөвхөн `icons/*.png`-ийг гараар дахин үүсгэх хэрэгтэй болоход ажиллана:
#
#     python3 tools/make-icons.py
#
# Хамааралгүй (зөвхөн Python-ий дотоод zlib/struct) — учир нь төсөл дээр
# npm ч, ImageMagick ч байхгүй. Зураг нь index.html доторх favicon-той
# ижил дүрс: бараан дэвсгэр дээр цайвар "хийгдсэн" тэмдэг.

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'

BG = (0x0B, 0x0B, 0x0C)      # --bg-1
INK = (0xDE, 0xDE, 0xE3)     # --accent

SS = 3  # супер-сэмпл: ирмэг тэгширнэ (antialiasing)


def clamp01(x):
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def rounded_box_sdf(px, py, half, radius):
    """Дугуй булантай дөрвөлжингийн зайн функц (төв нь 0,0)."""
    qx = abs(px) - (half - radius)
    qy = abs(py) - (half - radius)
    ox, oy = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - radius


def segment_sdf(px, py, ax, ay, bx, by):
    """Цэгээс хэрчим хүртэлх зай (дугуй үзүүртэй шугам)."""
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else clamp01((wx * vx + wy * vy) / denom)
    return math.hypot(wx - vx * t, wy - vy * t)


def render(size, inset, check_scale, transparent_outside):
    """Нэг icon-ыг RGBA мөрүүд болгож буулгана."""
    half = 0.5 - inset          # дөрвөлжингийн хагас тал (нэгж координатаар)
    radius = half * 0.42
    stroke = 0.052 * check_scale

    # "Чек" тэмдгийн гурван цэг — favicon-той ижил хэлбэр.
    pts = [(-0.20, 0.02), (-0.05, 0.17), (0.21, -0.16)]
    pts = [(x * check_scale, y * check_scale) for x, y in pts]

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            bg_cov = 0.0
            ink_cov = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    px = (x + (sx + 0.5) / SS) / size - 0.5
                    py = (y + (sy + 0.5) / SS) / size - 0.5
                    aa = 1.0 / size  # нэг пикселийн зөөлрөлт

                    if transparent_outside:
                        d = rounded_box_sdf(px, py, half, radius)
                        bg_cov += clamp01(0.5 - d / aa)
                    else:
                        bg_cov += 1.0

                    d_check = min(
                        segment_sdf(px, py, *pts[0], *pts[1]),
                        segment_sdf(px, py, *pts[1], *pts[2])
                    ) - stroke
                    ink_cov += clamp01(0.5 - d_check / aa)

            total = SS * SS
            bg_a = bg_cov / total
            ink_a = min(ink_cov / total, bg_a)  # тэмдэг дэвсгэрээсээ хальхгүй

            alpha = bg_a
            if alpha <= 0:
                row += bytes((0, 0, 0, 0))
                continue

            # Цайвар тэмдгийг бараан дэвсгэр дээр нийлүүлнэ.
            mix = ink_a / alpha if alpha else 0.0
            rgb = tuple(round(BG[i] + (INK[i] - BG[i]) * mix) for i in range(3))
            row += bytes((*rgb, round(alpha * 255)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)
    print(f'{path.relative_to(ROOT)} — {size}×{size}, {len(png)} байт')


def main():
    OUT.mkdir(exist_ok=True)
    # Энгийн icon: дугуй булантай, гадна тал нь тунгалаг.
    write_png(OUT / 'icon-192.png', 192, render(192, 0.02, 1.0, True))
    write_png(OUT / 'icon-512.png', 512, render(512, 0.02, 1.0, True))
    # Maskable: Android дүрсийг тайрдаг тул дэвсгэр нь бүтэн, тэмдэг нь жижиг
    # (аюулгүй бүс = дундах 80%).
    write_png(OUT / 'maskable-512.png', 512, render(512, 0.0, 0.72, False))
    # iOS "Home Screen": тунгалаг байдлыг дэмждэггүй тул бүтэн дэвсгэртэй.
    write_png(OUT / 'apple-touch-icon.png', 180, render(180, 0.0, 0.82, False))


if __name__ == '__main__':
    main()

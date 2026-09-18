#!/usr/bin/env python3
"""Chữ trên nền tranh màn chờ có đọc được không, VÀ tranh có còn nhìn thấy không.

Hai câu hỏi kéo ngược nhau, đó là toàn bộ cái khó. 16 tranh trong public/characters không
cùng tông (nội thất tối om lẫn trời xanh sa mạc), nên phải phủ tối để chữ nổi lên — nhưng
phủ tối cả khung thì tranh chỉ còn ~1.2:1 tương phản nội bộ, thành một mảng bùn, và mất
luôn lý do đặt tranh ở đó. Cách giải trong globals.css: grade nhẹ tay toàn khung, cộng một
vũng tối CỤC BỘ chỉ dưới khối chữ. Script chạy lại đúng phép tính ấy rồi đo cả hai đầu.

Chỉnh grade bằng mắt luôn cho cảm giác "ổn rồi" vì người ta nhìn tấm tối trước.

Xấp xỉ đã chấp nhận: gradient tính theo % khung nhìn, ảnh tính theo pixel ảnh, mà
object-fit:cover có cắt bớt — ánh xạ y ảnh → y khung nhìn không khít tuyệt đối. Quét cả
ảnh nên kết quả thiên về phía an toàn.

Sửa số trong khối hằng cho khớp app/globals.css rồi chạy:

    python3 scripts/check-backdrop-contrast.py
"""
import struct, sys, zlib
from pathlib import Path

# ── phải khớp app/globals.css ────────────────────────────────────────────────
GRADE = dict(sepia=0.88, saturate=1.2, brightness=0.75, contrast=1.06)
# .backdrop::after — gradient ĐẦU tiên trong shorthand nằm TRÊN cùng.
RADIAL = dict(ry=0.75, stops=[(0.00, (74, 52, 24), 0.12),
                              (0.48, (26, 17, 9), 0.42),
                              (1.00, (26, 17, 9), 0.52)])
LINEAR = dict(stops=[(0.00, (26, 17, 9), 0.35), (0.30, (26, 17, 9), 0.00)])
# .center::before — vũng tối dưới khối chữ: ellipse 70%×45% đặt tại (50%, 24%).
POOL = dict(cx=0.50, cy=0.24, rx=0.70, ry=0.45,
            stops=[(0.00, (26, 17, 9), 0.91),
                   (0.55, (26, 17, 9), 0.55),
                   (1.00, (26, 17, 9), 0.00)])

TEXT = {"tiêu đề (--text)": "#f5ecdb", "phụ đề (--muted)": "#c2a988"}
TEXT_BAND = (0.10, 0.33)   # khối chữ nằm ở dải nào theo chiều cao khung nhìn
TEXT_COLS = (0.30, 0.70)   # và bề ngang nào, vì chữ căn giữa
ART_BAND = (0.60, 0.92)    # chỗ tranh phải đọc ra được, nằm ngoài vũng tối
AA = 4.5                   # WCAG AA cho chữ thường
ART_MIN = 2.0              # dưới mức này tranh thành một mảng phẳng


# ── PNG → RGB, chỉ lo 8-bit không xen kẽ (đúng bộ tranh này) ────────────────
def read_png(path):
    data = Path(path).read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path} không phải PNG"
    pos, idat = 8, b""
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos:pos + 4])
        typ, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + ln]
        if typ == b"IHDR":
            w, h, depth, color = struct.unpack(">IIBB", body[:10])
            assert depth == 8 and body[12] == 0, "chỉ đọc 8-bit không xen kẽ"
            chans = {0: 1, 2: 3, 4: 2, 6: 4}[color]
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
        pos += 12 + ln
    raw, stride = zlib.decompress(idat), w * chans
    out, prev, p = [], bytearray(stride), 0
    for _ in range(h):
        ft, line = raw[p], bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - chans] if i >= chans else 0
            b = prev[i]
            c = prev[i - chans] if i >= chans else 0
            if ft == 1: line[i] = (line[i] + a) & 255
            elif ft == 2: line[i] = (line[i] + b) & 255
            elif ft == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif ft == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out.append(bytes(line))
        prev = line
    return w, h, chans, out


# ── bộ lọc CSS, làm trong sRGB đúng như spec Filter Effects ──────────────────
def mat_sepia(a):
    s = 1 - a
    return ((0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s),
            (0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s),
            (0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s))


def mat_saturate(s):
    return ((0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s),
            (0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s),
            (0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s))


def mul(px, m):
    r, g, b = px
    return tuple(min(1.0, max(0.0, m[i][0] * r + m[i][1] * g + m[i][2] * b)) for i in range(3))


def graded(px):
    px = mul(px, mat_sepia(GRADE["sepia"]))
    px = mul(px, mat_saturate(GRADE["saturate"]))
    px = tuple(min(1.0, v * GRADE["brightness"]) for v in px)
    c = GRADE["contrast"]
    off = 0.5 - 0.5 * c
    return tuple(min(1.0, max(0.0, v * c + off)) for v in px)


# ── gradient: nội suy alpha nhân sẵn, đúng cách trình duyệt làm ──────────────
def sample(stops, t):
    if t <= stops[0][0]:
        return tuple(v / 255 for v in stops[0][1]), stops[0][2]
    if t >= stops[-1][0]:
        return tuple(v / 255 for v in stops[-1][1]), stops[-1][2]
    for (p0, c0, a0), (p1, c1, a1) in zip(stops, stops[1:]):
        if p0 <= t <= p1:
            f = 0 if p1 == p0 else (t - p0) / (p1 - p0)
            a = a0 + (a1 - a0) * f
            pm = [(c0[i] / 255 * a0) + ((c1[i] / 255 * a1) - (c0[i] / 255 * a0)) * f for i in range(3)]
            return tuple((v / a if a > 1e-6 else 0.0) for v in pm), a
    return (0.0, 0.0, 0.0), 0.0


def over(src, sa, dst):
    return tuple(src[i] * sa + dst[i] * (1 - sa) for i in range(3))


def lum(px):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (f(v) for v in px)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def composite(rgb, x, y, with_pool):
    """Một pixel ảnh ở toạ độ khung nhìn (x, y) sau khi qua hết các lớp."""
    px = graded(rgb)
    lc, la = sample(LINEAR["stops"], y)
    px = over(lc, la, px)
    rc, ra = sample(RADIAL["stops"], min(1.0, y / RADIAL["ry"]))
    px = over(rc, ra, px)
    if with_pool:
        d = (((x - POOL["cx"]) / POOL["rx"]) ** 2 + ((y - POOL["cy"]) / POOL["ry"]) ** 2) ** 0.5
        pc, pa = sample(POOL["stops"], min(1.0, d))
        px = over(pc, pa, px)
    return px


# ── chạy ─────────────────────────────────────────────────────────────────────
art = sorted(Path("public/characters").glob("*.png"))
if not art:
    sys.exit("không thấy tranh nào trong public/characters")

behind_text, art_read = [], []
for f in art:
    w, h, chans, lines = read_png(f)
    brightest, lo, hi = 0.0, 9.9, 0.0
    for yi in range(0, h, 3):
        y = yi / h
        row = lines[yi]
        in_text = TEXT_BAND[0] <= y <= TEXT_BAND[1]
        in_art = ART_BAND[0] <= y <= ART_BAND[1]
        if not (in_text or in_art):
            continue
        for xi in range(0, w, 4):
            x, o = xi / w, xi * chans
            rgb = (row[o] / 255, row[o + 1] / 255, row[o + 2] / 255)
            if in_text and TEXT_COLS[0] <= x <= TEXT_COLS[1]:
                brightest = max(brightest, lum(composite(rgb, x, y, True)))
            if in_art:
                v = lum(composite(rgb, x, y, False))
                lo, hi = min(lo, v), max(hi, v)
    behind_text.append((f.stem, brightest))
    art_read.append((f.stem, (hi + 0.05) / (lo + 0.05)))

behind_text.sort(key=lambda r: -r[1])
art_read.sort(key=lambda r: r[1])
fails = []

print(f"── Chữ đè lên {len(behind_text)} tranh, đo ở chỗ SÁNG NHẤT dưới khối chữ ──\n")
for label, hexv in TEXT.items():
    tl = lum(hexrgb(hexv))
    worst = behind_text[0]
    print(f"  {label} {hexv}")
    for stem, bg in behind_text[:3]:
        ratio = (max(tl, bg) + 0.05) / (min(tl, bg) + 0.05)
        ok = ratio >= AA
        if not ok:
            fails.append(f"{label} trên {stem}: {ratio:.2f}:1 < {AA}")
        print(f"    {'✓' if ok else '✗'} {stem:<18} {ratio:5.2f}:1")
    print()

print(f"── Tranh có còn đọc ra hình không (ngoài vũng tối, cần ≥ {ART_MIN}:1) ──\n")
for stem, ratio in art_read[:3]:
    ok = ratio >= ART_MIN
    if not ok:
        fails.append(f"tranh {stem} phẳng còn {ratio:.2f}:1")
    print(f"    {'✓' if ok else '✗'} {stem:<18} {ratio:5.2f}:1")
print(f"\n  phẳng nhất {art_read[0][0]} · rõ nhất {art_read[-1][0]} ({art_read[-1][1]:.2f}:1)")

if fails:
    print("\n❌ " + "\n❌ ".join(fails))
    print("\nChỉnh GRADE/POOL trong globals.css rồi chạy lại. Đừng chỉnh bằng mắt: làm sáng")
    print("tranh là giết chữ và ngược lại, hai đầu phải đo cùng lúc.")
else:
    print("\n✅ chữ đọc được trên cả tấm sáng nhất, và tranh vẫn ra hình")
sys.exit(1 if fails else 0)

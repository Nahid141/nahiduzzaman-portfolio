"""R colour helpers used by the PRRSLoom figures (colorRampPalette, hcl, named palettes)."""

from __future__ import annotations

import math
import re

BASE_PALETTES = {
    "variant": ["#e76f51", "#2a9d8f", "#264653", "#f4a261", "#8ab17d", "#b56576", "#577590", "#6d597a"],
    "sub_lineage": ["#1f77b4", "#ff7f0e", "#2ca02c", "#9467bd", "#8c564b", "#17becf", "#bcbd22", "#7f7f7f"],
    "extra": ["#7a5195", "#ef5675", "#ffa600", "#003f5c", "#bc5090", "#00a896", "#f25f5c", "#70c1b3"],
}
GRAY = {"gray35": "#595959", "gray70": "#B3B3B3", "gray85": "#D9D9D9", "gray90": "#E5E5E5"}


def r_sort_key(s: str):
    """Approximates R's locale collation (en_US): punctuation ignored first, then case-insensitive."""
    return (re.sub(r"[^0-9A-Za-z]", "", s).casefold(), s.casefold(), s)


def _hex(rgb) -> str:
    return "#" + "".join(f"{int(v):02X}" for v in rgb)


def _parse(col: str):
    col = col.lstrip("#")
    return [int(col[i : i + 2], 16) for i in (0, 2, 4)]


def color_ramp_palette(colors: list[str], n: int) -> list[str]:
    """grDevices::colorRampPalette(colors)(n) — linear RGB interpolation."""
    if n <= 0:
        return []
    # colorRamp(): palette scaled to [0, 1], approxfun() per channel, roundcolor() clip, * 255;
    # rgb(maxColorValue = 255) then truncates to integers.
    anchors = [[v / 255 for v in _parse(c)] for c in colors]
    k = len(anchors)
    xs = [1.0 if i == k - 1 else i * (1 / (k - 1)) for i in range(k)]   # seq(0, 1, length.out)
    out = []
    for i in range(n):
        v = 0.0 if n == 1 else (1.0 if i == n - 1 else i * (1 / (n - 1)))
        lo, hi = 0, k - 1          # stats:::approx1 bisection
        while lo < hi - 1:
            mid = (lo + hi) // 2
            if v < xs[mid]:
                hi = mid
            else:
                lo = mid
        rgb = []
        for c in range(3):
            if v == xs[hi]:
                y = anchors[hi][c]
            elif v == xs[lo]:
                y = anchors[lo][c]
            else:
                y = anchors[lo][c] + (anchors[hi][c] - anchors[lo][c]) * ((v - xs[lo]) / (xs[hi] - xs[lo]))
            rgb.append(min(1.0, max(0.0, y)) * 255)
        out.append(_hex(int(x) for x in rgb))
    return out


def clean_annotation_value(v) -> str:
    if v is None:
        return "Not provided"
    s = str(v)
    return "Not provided" if s.strip() == "" or s == "NA" else s


def make_named_palette(values, palette: str = "variant") -> dict[str, str]:
    vals = sorted({clean_annotation_value(v) for v in values}, key=r_sort_key)
    vals = [v for v in vals if v != ""]
    colors = BASE_PALETTES[palette]
    if len(vals) > len(colors):
        colors = color_ramp_palette(colors, len(vals))
    else:
        colors = colors[: len(vals)]
    return dict(zip(vals, colors))


def hcl(h: float, c: float = 35, l: float = 85) -> str:
    """grDevices::hcl (polar LUV -> sRGB, fixup = TRUE)."""
    WHITE_Y, WHITE_u, WHITE_v = 100.000, 0.1978398, 0.4683363
    if l <= 0:
        return "#000000"
    hr = math.radians(h)
    L, U, V = l, c * math.cos(hr), c * math.sin(hr)
    Y = WHITE_Y * (((L + 16) / 116) ** 3 if L > 7.999592 else L / 903.3)
    u = U / (13 * L) + WHITE_u
    v = V / (13 * L) + WHITE_v
    X = 9.0 * Y * u / (4 * v)
    Z = -X / 3 - 5 * Y + 3 * Y / v

    def g(x):
        return 1.055 * x ** (1 / 2.4) - 0.055 if x > 0.00304 else 12.92 * x

    rgb = [g((3.240479 * X - 1.537150 * Y - 0.498535 * Z) / WHITE_Y),
           g((-0.969256 * X + 1.875992 * Y + 0.041556 * Z) / WHITE_Y),
           g((0.055648 * X - 0.204043 * Y + 1.057311 * Z) / WHITE_Y)]
    return _hex(int(255 * min(1.0, max(0.0, x)) + 0.5) for x in rgb)


def pie_palette(n: int) -> list[str]:
    """make_pie_palette in the haplotype app."""
    if n <= 0:
        return []
    hues = [15 + (375 - 15) * k / n for k in range(n)]
    return [hcl(h, 100, 65) for h in hues]

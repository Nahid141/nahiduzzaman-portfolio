"""Band-wise PNG writing for very tall Matplotlib figures.

``save_png(fig, ax, placed, path, dpi)`` writes the same pixels as
``fig.savefig(path, dpi=dpi, facecolor="white")`` while holding only one horizontal band of
the image in memory. A 3000-tip tree (ggsave sizing: 3600 x 162000 px at 300 dpi) needs a
2.3 GB Agg canvas when saved in one piece; band by band it needs about 60 MB.

Exactness: each band is drawn with the figure's pixel bbox shifted down by a whole number of
pixels, plus ``PAD`` overlapping rows on each side that are discarded (Agg clips geometry at
the canvas edge, which changes anti-aliasing on edge rows), so anti-aliasing and pixel
snapping are those of the full-size render. Artists that cannot reach a band, judged from
their data-space y extent in ``placed`` plus ``margin``, are hidden while it is drawn. The
bands are streamed into one PNG (RGBA, 8-bit, the same pHYs dpi and Software text that
Matplotlib/Pillow write); the decoded pixels are identical, the compressed bytes are not.
"""

from __future__ import annotations

import struct
import zlib

BAND_ROWS = 4096
PAD = 32


def save_png(fig, ax, placed, path: str, dpi: int, margin: float = 2.0, band_rows: int | None = None) -> None:
    """``placed``: [(artist, y_lo, y_hi)] in ``ax`` data coordinates; ``margin`` in data units."""
    band_rows = band_rows or BAND_ROWS
    import matplotlib as mpl
    import numpy as np
    from matplotlib.backends.backend_agg import RendererAgg
    from matplotlib.transforms import Affine2D

    # The band shift goes into the figure's pixel bbox (fig.bbox = bbox_inches transformed by
    # dpi_scale_trans), from which figure/axes/data positions derive. dpi_scale_trans itself
    # must stay a pure scale: point-based offsets (tick labels, legend padding) are
    # ScaledTranslations through it and would otherwise be shifted a second time.
    if not hasattr(fig.bbox, "_transform"):
        fig.savefig(path, dpi=dpi, facecolor="white")  # unknown Matplotlib internals: plain save
        return
    fig.set_dpi(dpi)
    fig.patch.set_facecolor("white")
    width, height = fig.canvas.get_width_height(physical=True)
    ax.apply_aspect()  # fixed-aspect axes are only positioned at draw time
    inv = ax.transData.inverted()  # display -> data, frozen before any shift
    y0 = float(inv.transform((0.0, 0.0))[1])
    y_per_px = (float(inv.transform((0.0, 1000.0))[1]) - y0) / 1000.0
    visible = [a.get_visible() for a, _, _ in placed]

    def chunk(fh, kind: bytes, data: bytes) -> None:
        fh.write(struct.pack(">I", len(data)) + kind + data)
        fh.write(struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    ppm = int(dpi / 0.0254 + 0.5)  # Pillow's dpi -> pixels per metre
    software = f"Matplotlib version{mpl.__version__}, https://matplotlib.org/"
    comp = zlib.compressobj(6)
    try:
        with open(path, "wb") as fh:
            fh.write(b"\x89PNG\r\n\x1a\n")
            chunk(fh, b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            chunk(fh, b"pHYs", struct.pack(">IIB", ppm, ppm, 1))
            chunk(fh, b"tEXt", b"Software\x00" + software.encode("latin-1"))
            for top in range(0, height, band_rows):
                rows = min(band_rows, height - top)
                offset = height - top - rows  # display y of the band's bottom edge
                pad_lo, pad_hi = min(PAD, offset), min(PAD, top)
                lo = y0 + (offset - pad_lo) * y_per_px
                hi = y0 + (offset + rows + pad_hi) * y_per_px
                lo, hi = min(lo, hi) - margin, max(lo, hi) + margin
                for (artist, a_lo, a_hi), vis in zip(placed, visible):
                    artist.set_visible(vis and a_hi >= lo and a_lo <= hi)
                fig.bbox._transform = Affine2D().scale(dpi).translate(0, -(offset - pad_lo))
                fig.bbox.invalidate()
                renderer = RendererAgg(width, rows + pad_lo + pad_hi, dpi)
                fig.draw(renderer)
                flat = np.asarray(renderer.buffer_rgba())[pad_hi:pad_hi + rows].reshape(rows, width * 4)
                raw = np.empty((rows, width * 4 + 1), dtype=np.uint8)
                raw[:, 0] = 1                       # PNG filter 1 (Sub)
                raw[:, 1:] = flat
                raw[:, 5:] -= flat[:, :-4]          # byte minus the same channel one pixel left (mod 256)
                data = comp.compress(raw.tobytes())
                if data:
                    chunk(fh, b"IDAT", data)
                del renderer, flat, raw
            chunk(fh, b"IDAT", comp.flush())
            chunk(fh, b"IEND", b"")
    finally:
        fig.bbox._transform = fig.dpi_scale_trans
        fig.bbox.invalidate()
        for (artist, _, _), vis in zip(placed, visible):
            artist.set_visible(vis)

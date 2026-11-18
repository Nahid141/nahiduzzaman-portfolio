"""Annotated tree figure shared by NJ Tree Builder and Tree Labeling.

Mirrors the ggtree figure built in both R apps: rectangular phylogram,
tip points coloured by ``assign.final``, tip labels (offset 0.02), internal
node labels, a ``sub_lineage`` heatmap column (gheatmap offset 0.08, width
0.04) and an optional extra metadata column (offset 0.092), plus the
PRRS-Loom caption. ``layout()`` returns the same geometry as JSON so the web
page can draw it at any height (the "vertical expansion" slider).
"""

from __future__ import annotations

from .palettes import GRAY, make_named_palette
from .phylo import Node, ladderize

CAPTION = "Generated with PRRS-Loom developed by the V-EPI Lab, University of Minnesota"


def layout(tree: Node, tip_data: dict[str, dict], extra_column: str | None,
           palette_rows: list[dict] | None = None, meta_columns: list[str] | None = None) -> dict:
    """ggtree rectangular layout: x = root distance, tip y = 1..n bottom-up, node y = mean(children).

    ``nodes`` also lists the topology ([parent index, x, y, label] in preorder, parent -1 for
    the root) so the web page can redraw the tree in other layouts (circular, unrooted, ...);
    ``tip.meta`` carries every metadata column for legends and colouring by any class.
    """
    ladderize(tree)
    xs: dict[int, float] = {}
    ys: dict[int, float] = {}
    order: list[Node] = []

    def assign_x(n: Node, x: float):
        xs[id(n)] = x
        for c in n.children:
            assign_x(c, x + (c.length or 0.0))

    assign_x(tree, 0.0)
    tips = tree.tips()
    for k, t in enumerate(tips):
        ys[id(t)] = float(k + 1)

    def assign_y(n: Node) -> float:
        if n.is_tip:
            return ys[id(n)]
        vals = [assign_y(c) for c in n.children]
        ys[id(n)] = sum(vals) / len(vals)
        return ys[id(n)]

    assign_y(tree)
    for n in tree.walk():
        order.append(n)

    segments = []
    for n in order:
        for c in n.children:
            segments.append([xs[id(n)], ys[id(c)], xs[id(c)], ys[id(c)]])
        if n.children:
            cy = [ys[id(c)] for c in n.children]
            segments.append([xs[id(n)], min(cy), xs[id(n)], max(cy)])

    tip_rows = []
    for t in tips:
        meta = tip_data.get(t.name, {})
        tip_rows.append({
            "label": t.name,
            "x": xs[id(t)],
            "y": ys[id(t)],
            "assign_final": meta.get("assign.final"),
            "sub_lineage": meta.get("sub_lineage"),
            "extra": meta.get("extra") if extra_column else None,
            "meta": meta.get("meta") or {},
        })
    internal_labels = [
        {"label": n.name, "x": xs[id(n)], "y": ys[id(n)]}
        for n in order if not n.is_tip and n.name
    ]
    index = {id(n): k for k, n in enumerate(order)}
    nodes = [[index[id(n.parent)] if n.parent is not None else -1, xs[id(n)], ys[id(n)], n.name or None]
             for n in order]
    x_values = list(xs.values())
    x_max = max(x_values)
    x_range = x_max - min(x_values)
    # NJ Tree Builder builds palettes from the tips; Tree Labeling from every metadata row.
    src = palette_rows if palette_rows is not None else [
        {"assign.final": r["assign_final"], "sub_lineage": r["sub_lineage"], "extra": r["extra"]} for r in tip_rows
    ]
    variant_palette = make_named_palette([r.get("assign.final") for r in src], "variant")
    sub_palette = make_named_palette([r.get("sub_lineage") for r in src], "sub_lineage")
    extra_palette = make_named_palette([r.get("extra") for r in src], "extra") if extra_column else {}
    return {
        "segments": segments,
        "nodes": nodes,
        "meta_columns": list(meta_columns or []),
        "tips": tip_rows,
        "internal_labels": internal_labels,
        "x_max": x_max,
        "x_range": x_range,
        "heatmap": {
            "sub_lineage": {"start": x_max + 0.08, "width": 0.04 * x_range},
            "extra": {"start": x_max + 0.092, "width": 0.04 * x_range} if extra_column else None,
        },
        "palettes": {"assign_final": variant_palette, "sub_lineage": sub_palette, "extra": extra_palette},
        "extra_column": extra_column,
        "caption": CAPTION,
        "n_tips": len(tips),
    }



# Figures at least this large are written band by band (pngband): a 3000-tip tree is
# 3600 x 162000 px (ggsave sizing, 0.18 in per tip at 300 dpi), and a single Agg canvas for it
# needs 2.3 GB. Smaller figures use savefig unchanged.
BANDED_PNG_MIN_PIXELS = 64_000_000


def render_png(lay: dict, path: str, dpi: int = 300) -> None:
    """ggsave() sizing from save_tree_plot_auto(): width max(12, 8 + 0.08 * longest label), height max(8, 0.18 * n)."""
    import matplotlib.pyplot as plt

    fig, ax, placed = build_figure(lay, dpi)
    width_px, height_px = fig.canvas.get_width_height(physical=True)
    if width_px * height_px >= BANDED_PNG_MIN_PIXELS:
        from . import pngband

        # margin 2 tip rows: covers marker radius and label height beyond each artist's anchor
        pngband.save_png(fig, ax, placed, path, dpi, margin=2.0)
    else:
        fig.savefig(path, dpi=dpi, facecolor="white")
    plt.close(fig)


def _figure_inches(lay: dict) -> tuple[float, float]:
    tips = lay["tips"]
    longest = max((len(t["label"]) for t in tips), default=1)
    return max(12.0, 8 + longest * 0.08), max(8.0, len(tips) * 0.18)


def build_figure(lay: dict, dpi: int) -> tuple:
    """The annotated tree figure: returns (fig, ax, placed) with placed = [(artist, y_lo, y_hi)]
    in data coordinates (lets pngband skip artists outside a band)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch, Rectangle
    from matplotlib.lines import Line2D

    tips = lay["tips"]
    n = len(tips)
    width_in, height_in = _figure_inches(lay)
    fig = plt.figure(figsize=(width_in, height_in), dpi=dpi)
    ax = fig.add_axes([0.02, 0.06, 0.72, 0.92])
    hm = lay["heatmap"]
    strips = [("sub_lineage", hm["sub_lineage"])] + ([("extra", hm["extra"])] if hm.get("extra") else [])

    # Automatic overlap correction: the R figure puts the sub_lineage bar at a fixed data offset
    # (x_max + 0.08), so long labels on long branches ran into the coloured bars. Here every tip
    # label is measured and the right axis limit is solved so that, for every tip,
    #   branch end + label offset + label width + gap + bars  fits inside the axes.
    from matplotlib.font_manager import FontProperties

    # A 1x1 renderer at the same dpi measures text exactly like the figure's own renderer, without
    # allocating the figure-sized canvas (fig.canvas.get_renderer() would: 0.9 GB for 1,173 tips).
    from matplotlib.backends.backend_agg import RendererAgg

    renderer = RendererAgg(1, 1, dpi)
    font = FontProperties(size=8.5)
    widths = [renderer.get_text_width_height_descent(t["label"], font, ismath=False)[0] for t in tips]
    pt = dpi / 72.0
    off, gap, bar, bar_gap, pad = 3 * pt, 6 * pt, 9 * pt, 2 * pt, 4 * pt
    bars = len(strips) * bar + (len(strips) - 1) * bar_gap
    need = max((off + w + gap + bars + pad for w in widths), default=bars + gap)
    W = 0.72 * width_in * dpi
    if need > 0.6 * W:  # labels would squeeze the tree: widen the figure instead
        width_in = need / 0.6 / 0.72 / dpi
        fig.set_size_inches(width_in, height_in)
        W = 0.72 * width_in * dpi
    x0 = -0.01 * max(lay["x_range"], 0.01)
    span = max(lay["x_max"] - x0, 1e-9)
    for t, w in zip(tips, widths):
        span = max(span, (t["x"] - x0) * W / (W - (off + w + gap + bars + pad)))
    ax.set_xlim(x0, x0 + span)
    ax.set_ylim(0.3, n + 0.7)
    to_data = span / W
    label_end = max((x0 + ((t["x"] - x0) / to_data + off + w) * to_data for t, w in zip(tips, widths)), default=lay["x_max"])
    bar_start = label_end + gap * to_data
    columns = {key: (bar_start + k * (bar + bar_gap) * to_data, bar * to_data) for k, (key, _) in enumerate(strips)}
    # Final limits are set before adding artists: this turns autoscaling off (otherwise every
    # scatter() call re-scanned all artists, O(n^2)).
    placed = []
    for x1, y1, x2, y2 in lay["segments"]:
        (line,) = ax.plot([x1, x2], [y1, y2], color="black", linewidth=0.5, solid_capstyle="butt")
        placed.append((line, min(y1, y2), max(y1, y2)))
    pal = lay["palettes"]
    for t in tips:
        pts = ax.scatter([t["x"]], [t["y"]], s=22, color=pal["assign_final"].get(t["assign_final"], GRAY["gray70"]), zorder=3, linewidths=0)
        txt = ax.text(t["x"] + off * to_data, t["y"], t["label"], fontsize=8.5, va="center", ha="left")
        placed += [(pts, t["y"], t["y"]), (txt, t["y"], t["y"])]
    support = lay.get("internal_support")
    for lab in lay["internal_labels"]:
        if support:  # bootstrap percentages: show clades with at least 50% support, small and grey
            try:
                if float(lab["label"]) < 50:
                    continue
            except ValueError:
                pass
            txt = ax.text(lab["x"], lab["y"], f"{lab['label']} ", fontsize=6.5, color=GRAY["gray35"], va="bottom", ha="right")
        else:
            txt = ax.text(lab["x"], lab["y"], f" {lab['label']}", fontsize=8.5, va="center", ha="left")
        placed.append((txt, lab["y"], lab["y"]))
    for key, _spec in strips:
        start, width = columns[key]
        for t in tips:
            value = t["sub_lineage"] if key == "sub_lineage" else t["extra"]
            color = pal[key].get(value, GRAY["gray90"])
            rect = ax.add_patch(Rectangle((start, t["y"] - 0.5), width, 1.0, facecolor=color, edgecolor="none"))
            placed.append((rect, t["y"] - 0.5, t["y"] + 0.5))
    ax.axis("off")

    handles = [Line2D([], [], marker="o", linestyle="", color=c, label=k) for k, c in pal["assign_final"].items()]
    leg1 = fig.legend(handles=handles, title="assign.final", loc="upper left", bbox_to_anchor=(0.75, 0.98),
                      fontsize=8, title_fontsize=9, frameon=False)
    fig.add_artist(leg1)
    handles = [Patch(color=c, label=k) for k, c in pal["sub_lineage"].items()]
    leg2 = fig.legend(handles=handles, title="sub_lineage", loc="upper left", bbox_to_anchor=(0.87, 0.98),
                      fontsize=8, title_fontsize=9, frameon=False)
    fig.add_artist(leg2)
    if lay.get("extra_column"):
        handles = [Patch(color=c, label=k) for k, c in pal["extra"].items()]
        fig.legend(handles=handles, title=lay["extra_column"], loc="upper left", bbox_to_anchor=(0.87, 0.55),
                   fontsize=8, title_fontsize=9, frameon=False)
    fig.text(0.98, 0.015, lay["caption"], ha="right", va="bottom", fontsize=10, color="#595959", style="italic")
    return fig, ax, placed

"""Annotated tree figure shared by NJ Tree Builder and Tree Labeling.

Mirrors the ggtree figure built in both R apps: rectangular phylogram,
tip points coloured by ``assign.final``, tip labels (offset 0.02), internal
node labels, a ``sub_lineage`` heatmap column (gheatmap offset 0.08, width
0.04) and an optional extra metadata column (offset 0.092), plus the
PRRS-Loom caption. ``layout()`` returns the same geometry as JSON so the web
page can draw it at any height (the "vertical expansion" slider).
"""

from __future__ import annotations

import math

from .palettes import GRAY, make_named_palette
from .phylo import Node, ladderize

CAPTION = "Generated with PRRS-Loom developed by the V-EPI Lab, University of Minnesota"


def layout(tree: Node, tip_data: dict[str, dict], extra_column: str | None,
           palette_rows: list[dict] | None = None) -> dict:
    """ggtree rectangular layout: x = root distance, tip y = 1..n bottom-up, node y = mean(children)."""
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
        })
    internal_labels = [
        {"label": n.name, "x": xs[id(n)], "y": ys[id(n)]}
        for n in order if not n.is_tip and n.name
    ]
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


def render_png(lay: dict, path: str, dpi: int = 300) -> None:
    """ggsave() sizing from save_tree_plot_auto(): width max(12, 8 + 0.08 * longest label), height max(8, 0.18 * n)."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch, Rectangle
    from matplotlib.lines import Line2D

    tips = lay["tips"]
    n = len(tips)
    longest = max((len(t["label"]) for t in tips), default=1)
    width_in = max(12.0, 8 + longest * 0.08)
    height_in = max(8.0, n * 0.18)
    fig = plt.figure(figsize=(width_in, height_in), dpi=dpi)
    ax = fig.add_axes([0.02, 0.06, 0.72, 0.92])
    for x1, y1, x2, y2 in lay["segments"]:
        ax.plot([x1, x2], [y1, y2], color="black", linewidth=0.5, solid_capstyle="butt")
    pal = lay["palettes"]
    for t in tips:
        ax.scatter([t["x"]], [t["y"]], s=22, color=pal["assign_final"].get(t["assign_final"], GRAY["gray70"]), zorder=3, linewidths=0)
        ax.text(t["x"] + 0.02, t["y"], t["label"], fontsize=8.5, va="center", ha="left")
    for lab in lay["internal_labels"]:
        ax.text(lab["x"], lab["y"], f" {lab['label']}", fontsize=8.5, va="center", ha="left")
    hm = lay["heatmap"]
    for key, spec in (("sub_lineage", hm["sub_lineage"]), ("extra", hm.get("extra"))):
        if not spec:
            continue
        for t in tips:
            value = t["sub_lineage"] if key == "sub_lineage" else t["extra"]
            color = pal[key].get(value, GRAY["gray90"])
            ax.add_patch(Rectangle((spec["start"], t["y"] - 0.5), spec["width"], 1.0, facecolor=color, edgecolor="none"))
    right = max(hm["sub_lineage"]["start"] + hm["sub_lineage"]["width"],
                (hm["extra"]["start"] + hm["extra"]["width"]) if hm.get("extra") else 0)
    label_room = longest * 0.012 * max(lay["x_range"], 0.05)
    ax.set_xlim(-0.01 * max(lay["x_range"], 0.01), max(right, lay["x_max"] + 0.02 + label_room) * 1.02)
    ax.set_ylim(0.3, n + 0.7)
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
    fig.savefig(path, dpi=dpi, facecolor="white")
    plt.close(fig)
    _ = math

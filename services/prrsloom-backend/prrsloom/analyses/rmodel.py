"""Read the upstream caret/randomForest classifier (`model.Rdata`) without R.

The R apps load `model.Rdata` and `model.lineage.rf.Rdata` from
github.com/kvanderwaal/prrsv2_classification at start-up. We parse the same
files with the `rdata` package and keep only what prediction needs:

* the randomForest forest arrays (treemap, nodestatus, bestvar, xbestsplit,
  nodepred) and the class labels;
* the dummy-variable names the forest was trained on (caret's formula
  interface expands each position factor into treatment-contrast dummies,
  e.g. ``p.3g``);
* every training column's factor levels and its mode (``calc_mode`` in
  rf10v.predict.fun.R), used to impute missing / unseen alleles.
"""

from __future__ import annotations

import hashlib
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

NODE_TERMINAL = -1


@dataclass
class Forest:
    classes: list[str]
    ntree: int
    left: np.ndarray        # (ntree, nrnodes) 0-based child index, -1 when absent
    right: np.ndarray
    status: np.ndarray      # (ntree, nrnodes)
    bestvar: np.ndarray     # (ntree, nrnodes) 0-based feature index
    split: np.ndarray       # (ntree, nrnodes) float64 threshold
    pred: np.ndarray        # (ntree, nrnodes) 0-based class index
    x_names: list[str]


@dataclass
class ClassifierModel:
    forest: Forest
    columns: list[str]                      # training columns, e.g. "p.3"
    levels: dict[str, list[str]]            # column -> factor levels
    modes: dict[str, str]                   # column -> calc_mode() value
    dummies: list[tuple[str, str]] = field(default_factory=list)  # per x_name: (column, level)
    sha256: str = ""
    source: str = ""


def _run_deep(fn, *args):
    """rdata's parser recurses once per pairlist cell, so run it on a big stack."""
    out: dict = {}

    def target():
        try:
            out["value"] = fn(*args)
        except BaseException as exc:  # re-raised in the caller
            out["error"] = exc

    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, 1_000_000))
    old_stack = threading.stack_size(255 * 1024 * 1024)
    try:
        thread = threading.Thread(target=target, name="rdata-parse")
        thread.start()
        thread.join()
    finally:
        threading.stack_size(old_stack)
        sys.setrecursionlimit(old_limit)
    if "error" in out:
        raise out["error"]
    return out["value"]


def _parse(path: Path):
    import rdata

    return rdata.parser.parse_file(str(path), extension="rdata")


class _R:
    """Tiny navigator over rdata's raw parse tree."""

    def __init__(self):
        from rdata.parser import RObjectType

        self.T = RObjectType

    def deref(self, obj):
        while obj is not None and obj.info.type == self.T.REF:
            obj = obj.referenced_object
        return obj

    def tag_name(self, cell) -> str | None:
        tag = self.deref(cell.tag)
        if tag is None or tag.value is None:
            return None
        value = tag.value
        value = self.deref(value)
        raw = value.value if hasattr(value, "value") else value
        return raw.decode() if isinstance(raw, bytes) else str(raw)

    def attr(self, obj, name: str):
        cell = obj.attributes
        while cell is not None and cell.info.type == self.T.LIST:
            if self.tag_name(cell) == name:
                return cell.value[0]
            cell = cell.value[1] if len(cell.value) > 1 else None
        return None

    def strings(self, obj) -> list[str]:
        result = []
        for item in obj.value:
            item = self.deref(item)
            result.append(None if item.value is None else item.value.decode())
        return result

    def names(self, obj) -> list[str]:
        n = self.attr(obj, "names")
        return self.strings(n) if n is not None else []

    def get(self, obj, name: str):
        names = self.names(obj)
        if name not in names:
            raise KeyError(name)
        return self.deref(obj.value[names.index(name)])

    def array(self, obj) -> np.ndarray:
        data = np.asarray(obj.value)
        dim = self.attr(obj, "dim")
        if dim is not None:
            shape = tuple(int(v) for v in np.asarray(dim.value))
            data = data.reshape(shape, order="F")
        return data


def calc_mode(values: list[str]) -> str:
    """rf10v.predict.fun.R::calc_mode — first value (in order of appearance) with the top count."""
    order: dict[str, int] = {}
    counts: dict[str, int] = {}
    for v in values:
        if v not in order:
            order[v] = len(order)
            counts[v] = 0
        counts[v] += 1
    best = None
    for v in order:  # insertion order == order of appearance; which.max takes the first max
        if best is None or counts[v] > counts[best]:
            best = v
    return best


def _load(path: Path) -> ClassifierModel:
    r = _R()
    parsed = _parse(path)
    root = parsed.object  # pairlist of saved variables; first one is xg_fit
    train = r.deref(root.value[0])
    final = r.get(train, "finalModel")
    forest_obj = r.get(final, "forest")

    classes = r.strings(r.get(final, "classes"))
    ntree = int(np.asarray(r.get(final, "ntree").value)[0])
    x_names = r.strings(r.get(final, "xNames"))
    ncat = np.asarray(r.get(forest_obj, "ncat").value)
    if np.any(ncat != 1):
        raise ValueError("Unexpected categorical split in classifier forest; only 0/1 dummies are supported.")

    treemap = r.array(r.get(forest_obj, "treemap")).astype(np.int64)        # (nrnodes, 2, ntree)
    nodestatus = r.array(r.get(forest_obj, "nodestatus")).astype(np.int64)  # (nrnodes, ntree)
    bestvar = r.array(r.get(forest_obj, "bestvar")).astype(np.int64)
    xbestsplit = r.array(r.get(forest_obj, "xbestsplit")).astype(np.float64)
    nodepred = r.array(r.get(forest_obj, "nodepred")).astype(np.int64)

    forest = Forest(
        classes=classes,
        ntree=ntree,
        left=treemap[:, 0, :].T - 1,
        right=treemap[:, 1, :].T - 1,
        status=nodestatus.T,
        bestvar=bestvar.T - 1,
        split=xbestsplit.T,
        pred=nodepred.T - 1,
        x_names=x_names,
    )

    training = r.get(train, "trainingData")
    col_names = r.names(training)
    columns, levels, modes = [], {}, {}
    for idx, name in enumerate(col_names):
        if name == ".outcome":
            continue
        col = r.deref(training.value[idx])
        lev = r.strings(r.attr(col, "levels"))
        codes = np.asarray(col.value)
        values = [lev[c - 1] for c in codes]
        columns.append(name)
        levels[name] = lev
        modes[name] = calc_mode(values)

    dummies = []
    for xn in x_names:
        # caret/model.matrix names a treatment dummy "<column><level>", e.g. p.3g
        column, level = xn[:-1], xn[-1]
        if column not in levels or level not in levels[column]:
            raise ValueError(f"Cannot map forest feature {xn!r} to a training column level.")
        dummies.append((column, level))

    return ClassifierModel(
        forest=forest,
        columns=columns,
        levels=levels,
        modes=modes,
        dummies=dummies,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        source=str(path),
    )


def load_classifier(path: str | Path) -> ClassifierModel:
    return _run_deep(_load, Path(path))


def forest_votes(forest: Forest, features: np.ndarray) -> np.ndarray:
    """Per-class vote counts for each row, exactly as randomForest's predictClassTree."""
    n = features.shape[0]
    votes = np.zeros((n, len(forest.classes)), dtype=np.int64)
    rows = np.arange(n)
    for t in range(forest.ntree):
        node = np.zeros(n, dtype=np.int64)
        active = forest.status[t, node] != NODE_TERMINAL
        while active.any():
            idx = rows[active]
            k = node[idx]
            var = forest.bestvar[t, k]
            go_left = features[idx, var] <= forest.split[t, k]
            node[idx] = np.where(go_left, forest.left[t, k], forest.right[t, k])
            active = forest.status[t, node] != NODE_TERMINAL
        np.add.at(votes, (rows, forest.pred[t, node]), 1)
    return votes

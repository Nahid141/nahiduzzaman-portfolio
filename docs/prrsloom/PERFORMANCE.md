# PRRSLooM — large-dataset performance work (2026-11-16)

Target: the GCP VM behind `prrsloom-api.fnunahiduzzaman.com` (n4-standard-4: 4 vCPU, 16 GB).
Scientific methods, sample identifiers, ordering and downloadable outputs are unchanged; every
change below was checked against the previous implementation (see *Validation*).

## What was slow, and what changed

| Area | Measured problem | Change | Output |
|---|---|---|---|
| Tree figure (NJ Tree Builder, Tree Labeling) | 3000 tips: 2.6 GB peak, ~150 s. The R-compatible 300 dpi PNG is 3600 x 162000 px (2.3 GB canvas), and each per-tip `scatter()` re-ran autoscaling over all artists (O(n²), 42 s) | Axis limits set before artists are added (autoscaling off); figures over 64 Mpx are rendered and streamed into the PNG in 4096-row bands with a whole-pixel offset (`analyses/pngband.py`) | pixel-identical PNG (dimensions, dpi, Software tag); compressed bytes differ for banded figures only |
| TIMER statistics | ~50k scalar scipy `cdf/ppf/pmf` calls (~0.6 ms each, mostly argument handling); the same `qpois` values recomputed for the heatmap | Same scipy functions evaluated on arrays (`qpois_many`, `poisson_pair_summaries`, `mutation_count_categories`); one shared decision function for the scalar and batch paths | identical values, types and NaNs (tests compare all 28 columns) |
| TIMER alignments | 11,175 pair alignments strictly serial; per-pair Python list scans | numba DP marked `nogil`, pairs aligned on the job's thread share; difference counting on byte arrays | identical rows, order and progress messages for any thread count |
| TIMER heatmap / pairwise-CSV mode | `names.index()` / `not in names` per row (O(rows x names)) | dict lookups; batched categories | identical |
| Classifier re-alignment | non-603-nt sequences aligned to the ORF5 reference one at a time | same alignments on the job's thread share, collected in input order | identical |
| Result download | `result.json` up to ~16 MB (150-sequence TIMER) sent uncompressed | worker writes `result.json.gz` once; the API sends it with `Content-Encoding: gzip` when accepted | same JSON after decoding |
| Repeated runs | ClustalW/MAFFT re-run for identical inputs (minutes for NJ) | content-addressed alignment cache (binary identity + arguments + exact sequences), size-bounded, LRU | same alignment (deterministic programs; cache key covers every input) |
| Job control | no cancellation; aligner temp files of killed/timed-out jobs left in /tmp; aligner timeout (20 min) shorter than job timeout; no thread caps for concurrent jobs; CPU-bound validation on the event loop | `POST /prrsloom/jobs/{id}/cancel` + Cancel button; per-job `tmp/` removed on any exit; aligner timeout = job timeout with a readable error; BLAS/OpenMP/numba capped to the job's share; `MALLOC_ARENA_MAX=2` under `RLIMIT_AS`; validation and job creation in the threadpool; atomic queued->running claim | — |
| Browser | large tables re-filtered on every keystroke | `useDeferredValue` for the filter (display only) | — |

Not changed, by design: the ClustalW and MAFFT programs and parameters (they define the
results), the 300 dpi PNG size (the R apps use `limitsize = FALSE`), and the result JSON format.

## Benchmarks

Measured locally (Windows 11, 4 cores / 16 GB, Python 3.14, Windows ClustalW 2.1) with
`pipelines.run` in a fresh process per run, previous commit vs. this change, identical inputs,
runs interleaved. New code ran with `PRRSLOOM_JOB_THREADS=2` (the per-job share with the
recommended 2 workers on 4 vCPUs). Inputs were derived from the upstream PRRSV-2 ORF5 reference
set (point mutations, truncations, flanks, insertions, N runs). MAFFT is not installed locally,
so the haplotype runs used the same deterministic stand-in aligner on both sides. Timings on this
laptop varied by up to ~2x between sessions, so only same-batch pairs are compared.

| Workload | Before: time / peak RSS | After: time / peak RSS | Measured change |
|---|---|---|---|
| Tree Labeling, 3000 tips (max) | 200 s / **2641 MB** | 173 s / **580 MB** | memory -78%; time -14% |
| TIMER, 150 sequences (max; 11,175 pairs) — alignment + statistics | 188 s | 77 s | -59% |
| TIMER, 150 sequences — whole job | 453 s / 526 MB | 342 s / 530 MB | -25% (heatmap PNG ~262 s, unchanged) |
| TIMER, 60 sequences — alignment + statistics | 30.5 s | 12.7 s | -58% |
| TIMER, 150 sequences — `result.json` transfer | 15.5 MB | 1.55 MB (gzip) | -90% |
| NJ Tree Builder, upstream example (7 + 55 refs) | 86 s | 91 s first run; **5.2 s identical re-run** | ClustalW-bound; cache hit -94% |
| Haplotype, 300 / 1000 sequences | 12.6 s / 33.9 s | 17.5 s / 36.1 s | no measurable change (noise; layouts dominate) |

Pieces measured separately during the work: TIMER pairwise-CSV mode with 1,770 rows 20.2 s -> 0.3 s;
heatmap categorisation 9.5 s -> 0.1 s; tree figure 1000 tips 899 MB -> 269 MB peak.

## Validation

* Every output file of every workload above compared with the previous implementation:
  `result.json`, CSV, Newick and FASTA byte-identical; PNG files pixel-identical (byte-identical
  except the banded 3000-tip tree); ZIP bundles member-identical; `result.json.gz` decompresses to
  `result.json`.
* `tests/test_scaling.py`: batched vs. scalar Poisson statistics on 400 random pairs including
  NaN/zero/negative cases (all columns, types and NaN positions); TIMER and classifier results
  independent of thread count; banded PNG vs. `savefig` pixel equality (tree with 333-row bands;
  figure with tick labels and fixed aspect); alignment-cache keying and eviction.
* `tests/test_api.py`: cancellation of running and queued jobs (process killed, temp files removed,
  idempotent), restart with a pending cancellation, gzip negotiation.
* Backend suite: 44 passed, 2 skipped (the two MAFFT end-to-end tests; MAFFT is not installed on
  the Windows machine — run them on the VM). Frontend: `tsc --noEmit` and ESLint clean.

## Remaining scale limits

* **NJ Tree Builder is bounded by ClustalW**, single-threaded and O(n²) in its pairwise stage.
  The builder adds *every* reference of each detected variant (as the R app does), so the second
  alignment can be several hundred sequences even for 60 uploads; locally (Windows ClustalW 2.1)
  such runs exceeded the previous 20-minute aligner limit. The VM's Debian ClustalW may be faster,
  but the growth is the same. With `PRRSLOOM_JOB_TIMEOUT_S=3600` these jobs can finish; beyond
  that, fewer or less diverse sequences are needed. Identical re-runs are served from the cache.
* **Haplotype network layouts** (Kamada–Kawai, one per variant panel) are serial: ~18 s for
  1000 uploads (199 panels). MAFFT itself was not benchmarked locally (not installed on Windows).
* **Figure rendering** is single-process; text rasterisation dominates. A multi-process banded
  renderer was built and measured: pixel-identical but no faster (each process rebuilds every
  artist), so it was not kept.
* `RLIMIT_AS` limits address space, not RSS; numba/LLVM reserve more than they use, hence the
  4 GB per-job setting although measured RSS peaks are ~0.6 GB.

# PRRSLooM — conversion and integration plan

Source: `PRRS_loom_app_2026-selected.zip` (V-EPI Lab, University of Minnesota),
extracted unchanged to `D:\ClaudeProjects\prrsloom_work\src`.

## Scope

The archive contains four analysis apps plus a dashboard that links to them:

| Shiny app | Folder | Converted |
|---|---|---|
| NJ Tree Builder | `phylogenetic_tree_builder` | yes |
| Tree Labeling | `tree_annotator` | yes |
| TIMER (pairwise Poisson clock) | `pairwise_poisson_molecular_clock` | yes |
| Haplotype Network | `interactive_haplotype_network` | yes |
| Dashboard | `dashboard_home` | replaced by the `/tools/prrsloom` page |

The dashboard also links to Variant Classification, Sub-lineage, Neutralization
and the main PRRSLoom app. Their source is not in the archive, so they are not
converted and are not shown as available.

## Architecture

```
Browser ──► Vercel (Next.js)
             /tools/prrsloom            page (client component)
             /api/prrsloom              POST submit  → Oracle /prrsloom/jobs
             /api/prrsloom/jobs/[id]    GET status   → Oracle /prrsloom/jobs/{id}
             /api/prrsloom/jobs/[id]/files/[fileId]  → Oracle download
Oracle  ──► nginx (api.fnunahiduzzaman.com)
             location /prrsloom/ → 127.0.0.1:8010  (prrsloom.service, separate venv)
             location /          → 127.0.0.1:8000  (qigenex.service, unchanged)
```

* Separate systemd unit, venv, port, data directory (`/srv/prrsloom`) and
  log so PRRSLooM cannot disturb QI-GeneX-N.
* Jobs: SQLite job table, bounded worker pool (`PRRSLOOM_MAX_WORKERS`), each job
  runs in a child process with a wall-clock timeout and address-space limit.
  On restart, jobs left `running` are marked `failed (interrupted)`; `queued`
  jobs are re-queued. Results expire after `PRRSLOOM_RESULT_TTL_HOURS`.
* Uploads are small (FASTA / CSV / tree text). Vercel functions accept ~4.5 MB
  bodies, so the proxy enforces a 4 MB limit; the backend enforces its own
  per-file limits. No direct-upload path is needed.

## Fidelity strategy

| Stage | R implementation | Python implementation | Validation |
|---|---|---|---|
| Variant classifier | `rf10v.predict.fun.R` + `model.Rdata` (caret/randomForest, fetched from GitHub at runtime) | Same upstream `model.Rdata`, parsed with `rdata`; forests evaluated node-by-node in numpy | vote fractions identical to R; class identical except documented random ties |
| Re-alignment to 603-nt reference | `pwalign::pairwiseAlignment(type="global-local")` | numba port of pwalign's float32 DP and traceback | `aligned()` strings identical on randomized indel sets |
| Genind / mode imputation / factor drop | adegenet + R code | literal port | dummy matrix identical |
| MSA (NJ builder) | `msa::msa(method="ClustalW")` (ClustalW 2.1) | `clustalw2` binary with default parameters | cross-check on server; downstream stages tested on R's own alignment |
| K80 + NJ + midpoint | ape `dist.dna`, `nj`, phangorn `midpoint` | ports of ape C code and phangorn R code | distances/branch lengths ≤1e-9, identical splits |
| Haplotypes + network | pegas `haplotype`, `haploNet` | ports of pegas C/R code | identical haplotype membership and links |
| MSA (haplotype app) | `DECIPHER::AlignSeqs` | MAFFT `--auto` (DECIPHER has no Python equivalent) | documented difference; agreement measured on test sets |
| TIMER alignment | `pairwiseAlignment(type="global")`, Phred-22 quality scoring | same DP port, same scores | difference counts identical |
| TIMER statistics | `qpois/dpois/ppois` | `scipy.stats.poisson` | ≤1e-12 |
| Figures | ggtree / ggplot2 / visNetwork | matplotlib + SVG/interactive network in React | visual, not numeric |

## Steps

1. Backend package `services/prrsloom-backend` (analysis modules, validation, jobs, API).
2. Differential tests against R (`validation/`), unit + API tests (`tests/`).
3. Next.js proxy routes + `/tools/prrsloom` page + Tools card.
4. Lint / typecheck / build; local end-to-end run against the backend.
5. Oracle deploy (when reachable): venv, systemd unit, nginx location, backup + rollback.
6. Push branch → Vercel preview → verify → merge to `main` (production).

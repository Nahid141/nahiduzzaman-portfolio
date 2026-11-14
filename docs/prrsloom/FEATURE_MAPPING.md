# PRRSLooM — R Shiny → Python feature mapping

Source: `PRRS_loom_app_2026-selected.zip` (4 analysis apps + dashboard). Python backend:
`services/prrsloom-backend/prrsloom`. Web UI: `app/tools/prrsloom`. Status legend: **=** identical
behaviour verified against R, **≈** equivalent with a documented difference, **+** export added for
convenience (no new science), **–** not converted.

## Shared: PRRSV-2 variant classifier (`rf10v.predict.fun.R`, `model.Rdata`, `model.lineage.rf.Rdata`)

| R | Python | Status |
|---|---|---|
| `source(url(...rf10v.predict.fun.R))`, `load(url(model.Rdata))` at app start | `resources.py` downloads the same files, caches them 24 h, records SHA-256 | = |
| caret `train.formula` randomForest (500 trees, 271 classes; lineage model 36 classes) | `rmodel.py` parses `.Rdata` with `rdata`, evaluates every tree node-by-node | = |
| re-alignment of non-603-nt sequences: `pairwiseAlignment(global-local, 1/-3, 25/15)`, insertion removal by `indel()@deletion`, right-padding | `pwalign.py` (numba port of pwalign's C DP + traceback, float32) + `classifier.realign_to_reference` | = (incl. the multi-insertion coordinate quirk) |
| `if (i == 545) next` | kept; the sequence is dropped and reported in warnings | = |
| `DNAbin2genind` + `genind2df`, NA → training mode, unseen allele → mode, factor relevel, `model.matrix` dummies | `classifier.feature_matrix` | = |
| `predict(type="prob")`, `get.alts`, `assign.final` rules, lineage fallback `<lin>-unclassified` | `classifier.make_predict` | = |
| class ties broken with R's unseeded RNG | seeded RNG (`PRRSLOOM_TIE_SEED`), ties listed in warnings | ≈ |

## NJ Tree Builder (`phylogenetic_tree_builder/phyloon_app.R`)

| R input / output | Python / UI | Status |
|---|---|---|
| FASTA upload or paste (`.fasta .fa .fas .fna`) | same; example loader uses upstream `sequences.example.fasta` | = |
| optional metadata CSV, ID column (guess SequenceName/sequence_id/SequenceID/ID/id) + annotation column | same pickers and defaults | = |
| `msa(method="ClustalW")` (user seqs, then user+refs) | ClustalW 2.1 binary, default parameters, aligned output order | = on test sets; see VALIDATION for tie-order note |
| reference retrieval from `attr.ref.csv` / `reference.sequences.fasta` by `var`, `make.unique` names | `pipelines._select_references` | = |
| `dist.dna(K80)` global deletion → `nj` → `phangorn::midpoint` | `phylo.dist_k80`, `phylo.nj`, `phylo.midpoint` | = |
| ggtree figure: tips by `assign.final`, sub-lineage bar, optional metadata bar, caption, palettes | SVG viewer (vertical-expansion slider 15–150) + 300-dpi PNG with ggsave sizing | ≈ visual (same geometry, colours identical) |
| classification table (DT) | table + CSV | = / + |
| download tree PNG | PNG | = |
| — | Newick of the rooted tree, ZIP bundle | + |

## Tree Labeling (`tree_annotator/loom_annotator_app.R`)

| R | Python / UI | Status |
|---|---|---|
| tree `.nwk .tree .tre` (`read.tree`) / `.nex .nexus` (`read.nexus`), else "Format not supported!" | `phylo.parse_newick`, `parse_nexus` (TRANSLATE supported) | = |
| CSV via `read.csv`, header repair `extra_column_i`, `make.unique(sep="_")`; required SequenceName + assign.final | same | = |
| optional extra labeling bar | same | = |
| palettes from all CSV rows, unmatched tips grey (`gray70` / `gray90`) | same; unmatched tips also listed as a warning | = / + |
| plot height `max(900, n × factor)`, PNG download | same | = |

## TIMER (`pairwise_poisson_molecular_clock/app.R`)

| R | Python / UI | Status |
|---|---|---|
| FASTA + date CSV (ID/date pickers, defaults col 1/col 2); ≥2 sequences, unique names | same | = |
| pairwise CSV mode (seq1, seq2, identity, differences, comparable sites, interval; default sites 603) | same pickers and defaults | = |
| `pairwiseAlignment(type="global")`, Phred-22 scoring, counts on A/C/G/T non-gap sites | `timer.count_pairwise_differences` | = |
| `parse_decimal_year` (numeric years, 6 date formats, leap years) | `timer.parse_decimal_year` | = |
| empty date cell → R crashes ("NAs are not allowed in subscripted assignments") | clear validation error | ≈ (error instead of crash) |
| locked rates 0.0112 / 0.0088 / 0.0127, 95 % interval, statuses, interpretations, categories | `timer.poisson_pair_summary`, `mutation_count_category` | = |
| summary cards, heatmap (one triangle, labels), "check one comparison" plot + table, results table | same; clicking a heatmap cell opens the comparison | = / + |
| heatmap PNG, selected-comparison PNG, audit CSV | same (comparison PNG rendered in the browser) | = |
| ggplot titles on heatmap/comparison | moved to page text and figure caption (site style: no figure titles) | ≈ |

## Haplotype Network (`interactive_haplotype_network/app_haplotype_network_interactive_experimental.R`)

| R | Python / UI | Status |
|---|---|---|
| FASTA + optional metadata CSV, ID column default `ids` | same | = |
| classifier on raw sequences, `normalize_variant_label` | same | = |
| classifier rows paired to `names(seqs)` **by position** | paired **by name** (R mislabels when re-aligned sequences move to the end) | ≈ (correction, warned) |
| references for classified variants; "No reference sequences were found…" stop | same | = |
| `DECIPHER::AlignSeqs` | MAFFT `--auto` (no Python/CLI equivalent of DECIPHER) | ≈ |
| `pegas::haplotype` (non-strict, trailing gaps as N) + `haploNet` | `haplotypes.haplotype`, `haplo_net` (ports of pegas C/R) | = |
| one network per variant, singleton-group and single-haplotype messages | same | = |
| reference metadata (`state`, `year` fallbacks, `NA(ref)`), metadata join, node labels | same | = |
| visNetwork: pies by metadata column (`hcl` palette), exclude-reference toggle, node size, scale ratio, hover, select → table | SVG network with the same pies/palette/toggle, hover titles, click/keyboard selection, zoom | ≈ layout (deterministic Kamada–Kawai, link length ∝ √steps; pegas layout not ported) |
| haplotype table, classification table, summary CSV, network JPG | same | = |
| — | alignment FASTA, ZIP bundle | + |

## Dashboard (`dashboard_home`)

Replaced by `/tools/prrsloom` (module cards + input guides with the original CSV templates).
Links in the dashboard to **Variant Classification, Sub-lineage, PRRSLoom main app and
Neutralization Predictor** point to apps whose code is not in the archive — **–** not converted and
not shown as available. (Classification itself runs inside NJ Tree Builder and Haplotype Network.)

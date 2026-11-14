# PRRSLooM — validation against the R implementation

All comparisons ran the original R code (R 4.6.1; Biostrings/pwalign, adegenet 2.1.11, ape 5.8-1,
phangorn, pegas 1.4, msa, DECIPHER, caret, randomForest) against the Python port on the same
inputs. Scripts are in `services/prrsloom-backend/validation/`; R reference outputs for the example
dataset are in `validation/fixtures/`. Upstream classifier files: `kvanderwaal/prrsv2_classification`
`main` (model.Rdata last changed 2026-08-20).

| Stage | Script | Data | Result | Tolerance |
|---|---|---|---|---|
| pwalign `global-local` (classifier) and `global` Phred-22 (TIMER) | `compare_pwalign.py` | 400 random cases: substitutions, indels, 5′/3′ truncation, flanks, IUPAC codes | **400/400 identical** score, aligned strings, indel coordinates | exact (score ±1e-3) |
| Variant classifier `make.predict` | `compare_classifier.py` | 147 seqs: 7 upstream examples, 80 references, 60 mutated (truncated, inserted, deleted, N-masked, flanked) | **147/147 rows identical** (names, order, assign.final, assign.top, prob.top, assign.2, prob.2, gaps) | exact (probabilities are vote fractions) |
| K80 + NJ + midpoint | `compare_njtree.py` | 12 random alignments, 4–40 taxa, with N/gaps | **12/12 identical rooted clades**; max root-to-tip / cophenetic difference 5.7e-16 | 1e-9 |
| ClustalW binary vs `msa::msa(ClustalW)` | `compare_msa.py` | example, example + 25 refs, 20 refs with indels | **3/3 identical alignments and order** | exact |
| NJ Tree Builder end to end (`run_tree`) | `compare_nj_pipeline.py` | upstream example (7) + 55 references | classification **identical**; reference status identical; tree identical when given R's ClustalW output order (clades identical, 5.6e-16) | see note |
| pegas `haplotype` + `haploNet` | `compare_haplo.py` | 40 random alignments with ambiguity codes, internal/terminal gaps | **40/40 identical** membership and links/steps | exact |
| MAFFT vs DECIPHER (haplotype app alignment) | `compare_mafft_decipher.py` | 10 reference-derived sets with indels/truncations/N runs | membership **10/10**, networks **9/10** (one link 2 vs 3 steps: gap placed at a different position in a repeat) | documented difference |
| TIMER, FASTA + dates | `compare_timer.py` | 14 seqs (Ns, deletions, truncation), 6 date formats + unparseable value | **91/91 rows × 28 columns identical** | 1e-9 relative |
| TIMER, pairwise CSV | `compare_timer.py` | 30 rows incl. missing intervals | **30/30 rows identical** | 1e-9 relative |
| TIMER heatmap categories | `compare_timer.py` | 91 pairs | **91/91 identical** | exact |
| Palettes (`colorRampPalette`, `hcl`) | unit tests | 3 base palettes × n = 9…39 | **93/93 identical** hex values | exact |

### Notes and known differences

* **ClustalW guide-tree ties.** With duplicate sequences, ClustalW's output order depends on how the
  build breaks exact distance ties. The 2010 Windows ClustalW binary ordered the 62-sequence example
  differently from `msa`'s embedded ClustalW; aligned rows were identical, but NJ tie-breaking then
  produced an alternative, equally supported resolution (root-to-tip differences ≤ 6e-6). Feeding R's
  order reproduces R's tree exactly. The Oracle deployment uses Ubuntu's gcc-built ClustalW 2.1; the
  fixture `nj_example_r_clustalw_order.txt` is used to check its order after deployment.
* **Random-forest ties**: R breaks equal vote counts at random (unseeded); Python uses a fixed seed
  and reports the affected sequences. No ties occurred in the 147-sequence validation set.
* **Stochastic elements**: none other than the tie-break above (NJ, haplotypes, TIMER are deterministic).
* **R crash on empty TIMER dates** is reported as an input error instead.
* **Haplotype app pairing bug**: R pairs classifier rows to sequences by position although the
  classifier reorders re-aligned sequences; Python pairs by name and warns.

Backend tests: `pytest services/prrsloom-backend/tests` — 35 tests (algorithms, input validation,
API, auth, signed downloads, unsafe paths, missing jobs, failures, timeout kill, queue limit,
restart recovery, cleanup, NJ and haplotype runs on the upstream example).

import type { ModuleId } from "./types";

// Copy adapted from the PRRSLoom Shiny apps' input guides (guide_cards.R) and Help tabs.
export type ModuleInfo = {
  id: ModuleId;
  name: string;
  tagline: string;
  requirement: string;
  method: string;
  template?: { file: string; label: string; columns: string[]; rows: string[][] };
  note: string;
  steps: [string, string][];
  runLabel: string;
};

export const MODULES: ModuleInfo[] = [
  {
    id: "nj_tree",
    name: "NJ Tree Builder",
    tagline: "Classify PRRSV-2 ORF5 sequences and build an annotated exploratory Neighbor-Joining tree with matching reference sequences.",
    requirement: "FASTA required · Metadata optional",
    method: "ClustalW alignment → PRRSV-2 random-forest variant classification → reference retrieval → K80 distances → Neighbor-Joining → midpoint rooting.",
    template: { file: "metadata.csv", label: "Optional metadata CSV", columns: ["SequenceName", "Site", "City", "State", "CollectionDate"],
      rows: [["seq_1", "Farm_A", "St. Paul", "MN", "2026-03-01"], ["seq_2", "Farm_B", "Raleigh", "NC", "2026-03-03"]] },
    note: "Match CSV sequence IDs exactly to FASTA headers. Select the ID column and one optional metadata column to display beside the tree.",
    steps: [
      ["Upload sequences", "Upload an ORF5 multi-FASTA file or paste sequences. Each sequence needs a unique header beginning with >."],
      ["Choose annotation", "Optionally add a metadata CSV, choose its ID column, and select the extra annotation column."],
      ["Build your tree", "Build and annotate the tree. Review the Neighbor-Joining tree and classification table, adjust its height, and download the tree."],
    ],
    runLabel: "Build and annotate your tree",
  },
  {
    id: "tree_label",
    name: "Tree Labeling",
    tagline: "Add PRRSV-2 variant, sub-lineage and optional metadata labels to a tree you already reconstructed.",
    requirement: "Tree + classification CSV required",
    method: "Matches tip labels to SequenceName, colours tips by assign.final, adds a sub-lineage bar and an optional metadata bar. No tree is re-estimated.",
    template: { file: "tree-labeling.csv", label: "Classification CSV format", columns: ["SequenceName", "assign.final", "Site"],
      rows: [["seq_1", "1H.18", "Farm_A"], ["seq_2", "1H.18", "Farm_B"]] },
    note: "SequenceName and assign.final are required. SequenceName must match tree tip labels exactly. Use your actual PRRSLoom classification output; the values shown illustrate the format.",
    steps: [
      ["Upload your tree", "Upload a rooted phylogenetic tree in .tre, .tree, .nwk, .nex or .nexus format."],
      ["Add classifications", "Upload the classification CSV for the same sequence IDs. Optionally choose an extra metadata labeling bar."],
      ["Label and export", "Label the tree, adjust its vertical expansion, and download the PNG."],
    ],
    runLabel: "Label your tree",
  },
  {
    id: "timer",
    name: "TIMER",
    tagline: "Compare observed genetic differences with the elapsed sampling time using a pairwise Poisson molecular clock.",
    requirement: "FASTA + collection dates, or pairwise CSV",
    method: "Pairwise global alignment, differences at comparable A/C/G/T sites, expected mutations λ = rate × sites × years (rate 0.0112, range 0.0088–0.0127 substitutions/site/year), central 95% Poisson interval.",
    template: { file: "collection-dates.csv", label: "Collection date metadata CSV", columns: ["SequenceName", "CollectionDate"],
      rows: [["seq_1", "2026-03-01"], ["seq_2", "2026-06-01"]] },
    note: "For the standard workflow, collection dates are required. Match sequence IDs to FASTA headers and select the ID and date columns. Use YYYY-MM-DD dates to avoid ambiguity; every row needs a date.",
    steps: [
      ["Choose your workflow", "Upload or paste FASTA sequences and provide collection dates. If sequences are unavailable, use the pairwise comparison CSV option."],
      ["Match your columns", "Select the sequence ID and collection date/year columns. A pairwise CSV instead needs two sequence IDs, identity or differences, and elapsed time in years."],
      ["Run the audit", "Run the pairwise audit. Inspect individual comparisons, the heatmap and the results table, then download plots or the audit CSV."],
    ],
    runLabel: "Run pairwise audit",
  },
  {
    id: "haplotype",
    name: "Haplotype Network",
    tagline: "Classify sequences, add matching references, and explore haplotype networks per variant coloured by your metadata.",
    requirement: "FASTA required · Metadata optional",
    method: "PRRSV-2 variant classification → reference retrieval → multiple alignment (MAFFT) → pegas-equivalent haplotypes and haploNet links, one network per variant.",
    template: { file: "metadata.csv", label: "Optional metadata CSV", columns: ["SequenceName", "Site", "State", "CollectionDate"],
      rows: [["seq_1", "Farm_A", "MN", "2026-03-01"], ["seq_2", "Farm_B", "NC", "2026-03-03"]] },
    note: "Select the CSV column containing sequence IDs; its values must match the FASTA headers exactly. Other columns can be used to colour network nodes.",
    steps: [
      ["Upload sequences", "Upload a PRRSV ORF5 multi-FASTA file or paste FASTA sequences."],
      ["Add metadata", "Optionally upload a CSV and select its sequence ID column. Use unique IDs, one row per sequence."],
      ["Run and explore", "Run the analysis. Choose a variant network, colour nodes by metadata, adjust the display, and export the network or haplotype summary."],
    ],
    runLabel: "Run analysis",
  },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleInfo>;

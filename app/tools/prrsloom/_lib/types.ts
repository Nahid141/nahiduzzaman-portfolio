export type ModuleId = "nj_tree" | "tree_label" | "timer" | "haplotype";

export type JobStatus = {
  id: string;
  module: ModuleId;
  status: "queued" | "running" | "succeeded" | "failed" | "expired" | "cancelled";
  progress: number;
  message: string | null;
  error: string | null;
  queue_position?: number | null;
};

export type ResultFile = { id: string; label: string; kind: string };

export type TreeTip = {
  label: string;
  x: number;
  y: number;
  assign_final: string | null;
  sub_lineage: string | null;
  extra: string | null;
};

export type TreeLayout = {
  segments: [number, number, number, number][];
  tips: TreeTip[];
  internal_labels: { label: string; x: number; y: number }[];
  x_max: number;
  x_range: number;
  heatmap: {
    sub_lineage: { start: number; width: number };
    extra: { start: number; width: number } | null;
  };
  palettes: { assign_final: Record<string, string>; sub_lineage: Record<string, string>; extra: Record<string, string> };
  extra_column: string | null;
  caption: string;
  n_tips: number;
};

export type ClassificationRow = {
  SequenceName: string;
  "assign.final": string;
  "assign.top": string;
  "prob.top": number;
  "assign.2": string | null;
  "prob.2": number;
  "num.gaps.amb": number;
};

export type NjResult = {
  module: "nj_tree";
  reference_status: string;
  n_user_sequences: number;
  n_reference_sequences: number;
  classification: ClassificationRow[];
  tree: TreeLayout;
  warnings: string[];
  files: ResultFile[];
};

export type TreeLabelResult = {
  module: "tree_label";
  n_tips: number;
  n_matched: number;
  tree: TreeLayout;
  warnings: string[];
  files: ResultFile[];
};

export type TimerRow = Record<string, string | number | null> & {
  pair_id: string;
  pair_label: string;
  sequence_1: string;
  sequence_2: string;
  differences_observed: number | null;
  comparable_sites: number | null;
  pct_identity_comparable_sites: number | null;
  time_interval_years: number | null;
  expected_mutations_mean: number | null;
  poisson_lower_expected: number | null;
  poisson_upper_expected: number | null;
  probability_observed: number | null;
  two_sided_tail_score: number | null;
  poisson_compatibility_score: number | null;
  mutation_timing_category: string;
  poisson_status: string;
  final_interpretation: string;
};

export type HeatCell = {
  x: string;
  y: string;
  pair_id: string;
  category: string;
  fill: string;
  label: string[];
  light_text: boolean;
};

export type TimerResult = {
  module: "timer";
  mode: "fasta" | "pairwise";
  summary: { pairs: number; highly_compatible: number; near_limit: number; outside: number; unable: number };
  results: TimerRow[];
  heatmap: { names: string[]; cells: HeatCell[] };
  assumptions: { mean_rate: number; lower_rate: number; upper_rate: number; interval: string; outside_value: number };
  files: ResultFile[];
};

export type HapNetwork = {
  panel: string;
  hap_ids: string[];
  labels: string[];
  freq: number[];
  links: [number, number, number][];
  layout: [number, number][];
};

export type HapRow = Record<string, string | null> & {
  SequenceName: string;
  HaplotypeId: string;
  Haplotype: string;
  HaplotypeIndex: string;
  Network: string;
  network_variant: string | null;
  variant_source: string | null;
  Year: string;
};

export type HaplotypeResult = {
  module: "haplotype";
  split_by_variant: boolean;
  status_message: string;
  networks: HapNetwork[];
  hap_summary: HapRow[];
  summary_columns: string[];
  classification: ClassificationRow[];
  user_metadata_columns: string[];
  default_color_column: string | null;
  metadata_from_classifier_only: boolean;
  warnings: string[];
  files: ResultFile[];
};

export type AnyResult = NjResult | TreeLabelResult | TimerResult | HaplotypeResult;

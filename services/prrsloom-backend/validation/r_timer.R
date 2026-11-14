# Runs the TIMER app's own functions. Usage: Rscript r_timer.R app.R in.fasta dates.csv pairs.csv out_prefix
args <- commandArgs(TRUE)
suppressMessages({library(Biostrings); library(pwalign); library(dplyr); library(readr); library(stringr); library(ggplot2)})
exprs <- parse(args[1])
env <- globalenv()
for (e in exprs) {
  if (is.call(e) && identical(e[[1]], as.name("<-"))) {
    target <- as.character(e[[2]])
    if (!target %in% c("ui", "server", "missing_packages", "required_packages")) eval(e, env)
  }
}
has_pwalign <- TRUE
seqs <- read_fasta_input(upload_path = args[2])
meta <- read_csv_safely(args[3])
res <- build_results_from_sequences(seqs, meta, names(meta)[1], names(meta)[2])
write.csv(res, paste0(args[5], "_seq.csv"), row.names = FALSE)
cat_df <- data.frame(pair_id = res$pair_id, cat = as.character(mutation_count_category(res$differences_observed, res$expected_mutations_mean, res$mutation_timing_category == "Unable to evaluate")))
write.csv(cat_df, paste0(args[5], "_cat.csv"), row.names = FALSE)
tbl <- read_csv_safely(args[4])
res2 <- build_results_from_pairwise_table(tbl, "seq1", "seq2", "identity", "None", "None", 603, "years")
write.csv(res2, paste0(args[5], "_tab.csv"), row.names = FALSE)

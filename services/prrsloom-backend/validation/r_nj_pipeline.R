# Runs the NJ Tree Builder app's own pipeline functions (phyloon_app.R) with local classifier files.
# Usage: Rscript r_nj_pipeline.R phyloon_app.R rf10v.predict.fun.R model.Rdata model.lineage.rf.Rdata ref_attr.csv ref.fasta in.fasta out_prefix
args <- commandArgs(TRUE)
suppressMessages({library(Biostrings); library(pwalign); library(msa); library(readr); library(dplyr); library(ape); library(phangorn); library(ggtree); library(ggplot2); library(ggnewscale); library(seqinr)})
src <- readLines(args[2])
src <- sub('load(url("https://github.com/kvanderwaal/prrsv2_classification/raw/main/model.lineage.rf.Rdata"))', sprintf('load("%s")', args[4]), src, fixed = TRUE)
src <- sub('load(url("https://github.com/kvanderwaal/prrsv2_classification/raw/main/model.Rdata"))', sprintf('load("%s")', args[3]), src, fixed = TRUE)
suppressMessages(eval(parse(text = src), envir = globalenv()))
for (e in parse(args[1])) {
  if (is.call(e) && identical(e[[1]], as.name("<-"))) {
    target <- as.character(e[[2]])
    if (!target %in% c("ui", "server")) eval(e, globalenv())
  }
}
reference_metadata_url <- args[5]; reference_fasta_url <- args[6]
set.seed(1)
res <- run_tree(args[7])
write.csv(res$classification, paste0(args[8], "_class.csv"), row.names = FALSE)
write.tree(res$tree_rooted, paste0(args[8], "_tree.nwk"))
writeLines(res$reference_status, paste0(args[8], "_status.txt"))
d <- node.depth.edgelength(res$tree_rooted)[seq_along(res$tree_rooted$tip.label)]
write.csv(data.frame(label = res$tree_rooted$tip.label, depth = d), paste0(args[8], "_depth.csv"), row.names = FALSE)

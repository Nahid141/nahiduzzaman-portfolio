# Runs the upstream classifier exactly as the Shiny apps do. Usage:
#   Rscript r_classifier.R <rf10v.predict.fun.R> <model.Rdata> <model.lineage.rf.Rdata> <in.fasta> <out.csv> [msa]
args <- commandArgs(TRUE)
suppressMessages({library(Biostrings); library(pwalign)})  # pwalign now hosts pairwiseAlignment()
src <- readLines(args[1])
src <- sub('load(url("https://github.com/kvanderwaal/prrsv2_classification/raw/main/model.lineage.rf.Rdata"))', sprintf('load("%s")', args[3]), src, fixed = TRUE)
src <- sub('load(url("https://github.com/kvanderwaal/prrsv2_classification/raw/main/model.Rdata"))', sprintf('load("%s")', args[2]), src, fixed = TRUE)
env <- new.env(); suppressMessages(eval(parse(text = src), envir = env))
seqs <- readDNAStringSet(args[4])
set.seed(1)
align.ex <- list(nb = length(seqs), nam = names(seqs), seq = as.character(seqs), com = NA)
out <- env$make.predict(al.new = align.ex)
write.csv(out, args[5], row.names = FALSE)

# Reference outputs for prrsloom.analyses.pwalign. Usage: Rscript r_pwalign.R cases.csv out.csv
args <- commandArgs(TRUE)
suppressMessages({library(Biostrings); library(pwalign)})
cases <- read.csv(args[1], stringsAsFactors = FALSE, colClasses = "character")
mat <- nucleotideSubstitutionMatrix(match = 1, mismatch = -3, baseOnly = TRUE)
fmt_ir <- function(ir) if (length(ir) == 0) "" else paste(start(ir), width(ir), sep = ":", collapse = ";")
rows <- lapply(seq_len(nrow(cases)), function(k) {
  p <- DNAString(cases$pattern[k]); s <- DNAString(cases$subject[k])
  a <- if (cases$scheme[k] == "classifier") {
    pwalign::pairwiseAlignment(p, s, substitutionMatrix = mat, gapOpening = 25, gapExtension = 15, type = cases$type[k])
  } else {
    pwalign::pairwiseAlignment(pattern = p, subject = s, type = cases$type[k])
  }
  data.frame(id = cases$id[k], score = sprintf("%.6f", score(a)),
             aligned_pattern = as.character(aligned(a@pattern)), aligned_subject = as.character(aligned(a@subject)),
             deletion = fmt_ir(indel(a)@deletion[[1]]), insertion = fmt_ir(indel(a)@insertion[[1]]),
             stringsAsFactors = FALSE)
})
write.csv(do.call(rbind, rows), args[2], row.names = FALSE)

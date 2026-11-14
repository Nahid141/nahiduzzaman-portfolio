# msa::msa(method = "ClustalW") exactly as the NJ Tree Builder calls it. Usage: Rscript r_msa.R in.fasta out.fasta
args <- commandArgs(TRUE)
suppressMessages({library(Biostrings); library(msa)})
seqs <- readDNAStringSet(args[1])
old <- getwd(); setwd(tempdir())
aln <- msa::msa(seqs, method = "ClustalW")
setwd(old)
s <- msa::msaConvert(aln, type = "seqinr::alignment")
writeLines(paste0(">", s$nam, "\n", toupper(s$seq)), args[2])

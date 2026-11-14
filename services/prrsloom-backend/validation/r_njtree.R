# ape/phangorn reference for the NJ Tree Builder stages after alignment.
# Usage: Rscript r_njtree.R aligned.fasta out_prefix
args <- commandArgs(TRUE)
suppressMessages({library(ape); library(phangorn)})
aln <- read.dna(args[1], format = "fasta")
d <- dist.dna(aln, model = "K80")
tree <- phangorn::midpoint(ape::nj(d))
write.tree(tree, paste0(args[2], "_tree.nwk"))
write.csv(as.matrix(d), paste0(args[2], "_dist.csv"))
write.csv(cophenetic(tree), paste0(args[2], "_coph.csv"))
depth <- node.depth.edgelength(tree)[seq_along(tree$tip.label)]
write.csv(data.frame(label = tree$tip.label, depth = depth), paste0(args[2], "_depth.csv"), row.names = FALSE)

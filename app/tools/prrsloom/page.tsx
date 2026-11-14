import type { Metadata } from "next";
import PrrsloomApp from "./_components/PrrsloomApp";

export const metadata: Metadata = {
  title: "PRRSLooM | Nahiduzzaman",
  description:
    "PRRSV-2 variant-aware NJ trees, tree labeling, TIMER pairwise molecular-clock audits and haplotype networks.",
};

export default function PrrsloomPage() {
  return <PrrsloomApp />;
}

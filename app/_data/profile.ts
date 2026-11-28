/* Single source of truth for the portfolio's academic record.
   Home, Publications and About all read from here, so a new paper or
   NCBI deposit only has to be added once. Citation counts and SJR
   quartiles are from Google Scholar (checked 2026-11-27). */

export type PublicationKind = "Journal article" | "Book chapter" | "Preprint";

export type Publication = {
  kind: PublicationKind;
  year: number;
  title: string;
  authors: string;
  venue: string;
  details?: string;
  url: string;
  hasDoi: boolean;
  citations: number;
  quartile?: "Q1" | "Q2" | "Q3" | "Q4";
  sjr?: number;
  firstAuthor: boolean;
  tags: string[];
};

const scholarSearch = (title: string) =>
  `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`;

export const PUBLICATIONS: Publication[] = [
  {
    kind: "Journal article",
    year: 2026,
    title:
      "Unraveling the potential impact of climate change on the evolution and acceleration of antimicrobial resistance: mechanisms, consequences, and control strategies",
    authors:
      "FNU Nahiduzzaman, Mst. Arjina Jannat Akhi, Tasnim Zarin, Chandra Shaker Chouhan, Md. Ashiqur Rahman, A. K. M. Anisur Rahman, Mst. Minara Khatun, Md. Ariful Islam, Danishuddin, Md Azizul Haque",
    venue: "Environmental Reviews",
    details: "34, 1–25",
    url: "https://doi.org/10.1139/er-2025-0165",
    hasDoi: true,
    citations: 6,
    quartile: "Q1",
    sjr: 2.042,
    firstAuthor: true,
    tags: ["Climate change", "AMR", "Review"],
  },
  {
    kind: "Journal article",
    year: 2026,
    title:
      "Evaluation of immune responses in cattle immunized with an experimentally developed inactivated alum adjuvanted Brucella abortus biovar 3 vaccine",
    authors: "MZ Rahman, FNU Nahiduzzaman, R Parvin, MM Khatun, MA Haque, et al.",
    venue: "Journal of Dairy Science",
    url: scholarSearch(
      "Evaluation of immune responses in cattle immunized with an experimentally developed inactivated alum adjuvanted Brucella abortus biovar 3 vaccine"
    ),
    hasDoi: false,
    citations: 0,
    quartile: "Q1",
    sjr: 1.199,
    firstAuthor: false,
    tags: ["Brucellosis", "Vaccine", "Cattle"],
  },
  {
    kind: "Book chapter",
    year: 2026,
    title: "The Economic and Environmental Impact of Antibiotic Use in Livestock Farming",
    authors: "M Waqar, I Rafiq, Q Ullah, FNU Nahiduzzaman, M Waqas, NS Ibrahim, et al.",
    venue: "Green Alternatives to Antibiotics in Animal Health",
    details: "437–451",
    url: scholarSearch("The Economic and Environmental Impact of Antibiotic Use in Livestock Farming"),
    hasDoi: false,
    citations: 0,
    firstAuthor: false,
    tags: ["Antibiotics", "Livestock", "One Health"],
  },
  {
    kind: "Preprint",
    year: 2026,
    title:
      "Assessment of Hygienic Practices in Street Food Vendors of Mymensingh City of Bangladesh: A Cross-Sectional Study",
    authors: "FNU Nahiduzzaman, T Zarin, NA Jhinuk, H Hasan, MM Khatun, MA Islam",
    venue: "medRxiv",
    details: "2026.03.27.26349369",
    url: "https://doi.org/10.1101/2026.03.27.26349369",
    hasDoi: true,
    citations: 0,
    firstAuthor: true,
    tags: ["Food safety", "Street food", "Bangladesh"],
  },
  {
    kind: "Journal article",
    year: 2025,
    title:
      "Potential biological impacts of microplastics and nanoplastics on farm animals: global perspectives with insights from Bangladesh",
    authors:
      "FNU Nahiduzzaman, MZ Rahman, MAJ Akhi, M Manik, MM Khatun, MA Islam, MN Matin, MA Haque",
    venue: "Animals",
    details: "15(10), 1394",
    url: "https://doi.org/10.3390/ani15101394",
    hasDoi: true,
    citations: 23,
    quartile: "Q1",
    sjr: 0.722,
    firstAuthor: true,
    tags: ["Microplastics", "Livestock", "Review"],
  },
  {
    kind: "Journal article",
    year: 2025,
    title:
      "Draft whole-genome sequence of multidrug-resistant Enterococcus faecium strain MKL_BAU_Fe01 isolated from chicken meat",
    authors: "AA Howlader, FNU Nahiduzzaman, RI Annan, A Saha, MA Islam, MM Khatun",
    venue: "Microbiology Resource Announcements",
    details: "14(6), e00043-25",
    url: "https://doi.org/10.1128/mra.00043-25",
    hasDoi: true,
    citations: 4,
    quartile: "Q3",
    sjr: 0.254,
    firstAuthor: false,
    tags: ["Genomics", "MDR", "Enterococcus"],
  },
  {
    kind: "Journal article",
    year: 2025,
    title: "Health effects of street vended fresh cut fruits: A randomized controlled trial in Bangladesh",
    authors: "FNU Nahiduzzaman, T Zarin, CS Chouhan, MZ Rahman, MM Khatun, et al.",
    venue: "PLOS ONE",
    details: "20(10), e0335979",
    url: "https://doi.org/10.1371/journal.pone.0335979",
    hasDoi: true,
    citations: 1,
    quartile: "Q1",
    sjr: 0.726,
    firstAuthor: true,
    tags: ["Food safety", "RCT", "Bangladesh"],
  },
];

export type NcbiRecord = {
  organism: string;
  source: string;
  year: number;
  bioproject?: string;
  biosample?: string;
  sra?: string;
  genbank?: string[];
};

export type NcbiGroup = { key: string; label: string; records: NcbiRecord[] };

export const NCBI_GROUPS: NcbiGroup[] = [
  {
    key: "genome",
    label: "Whole genomes",
    records: [
      { organism: "Escherichia coli", source: "Cucumber (multidrug-resistant)", year: 2026, bioproject: "PRJNA1531736", biosample: "SAMN63258981", sra: "SRR40752001" },
      { organism: "Salmonella enterica", source: "Poultry slaughterhouse", year: 2026, bioproject: "PRJNA1466207", biosample: "SAMN59990286", sra: "SRR38610240" },
      { organism: "Proteus mirabilis", source: "Cattle manure management chain", year: 2026, bioproject: "PRJNA1466285", biosample: "SAMN60043054", sra: "SRR38613778" },
      { organism: "Staphylococcus haemolyticus", source: "Broiler meat (multidrug-resistant)", year: 2025, bioproject: "PRJNA1381103", biosample: "SAMN54053803", sra: "SRR36443335" },
      { organism: "Enterococcus faecalis", source: "Chicken cloacal swabs", year: 2025, bioproject: "PRJNA1304225", biosample: "SAMN50554242", sra: "SRR34941152" },
      { organism: "Enterococcus faecalis", source: "Table egg", year: 2025, bioproject: "PRJNA1289769", biosample: "SAMN49897812", sra: "SRR34476346" },
      { organism: "Enterococcus faecium", source: "Chicken meat (multidrug-resistant)", year: 2024, bioproject: "PRJNA1201574", biosample: "SAMN45938320", sra: "SRR31822501" },
    ],
  },
  {
    key: "meta",
    label: "Metagenome",
    records: [
      { organism: "Placental fluid metagenome", source: "Aborted cow, suspected brucellosis", year: 2025, bioproject: "PRJNA1375750", biosample: "SAMN53696272", sra: "SRR36329066" },
    ],
  },
  {
    key: "partial",
    label: "Partial sequences",
    records: [
      { organism: "Cryptosporidium spp.", source: "Nuclear rRNA/ITS, molecular epidemiology", year: 2025, genbank: ["PV123885"] },
      { organism: "Pseudomonas sp. S_BAU_01", source: "16S rRNA gene", year: 2026, genbank: ["PZ420633.1"] },
      { organism: "Lumpy skin disease virus", source: "Four Bangladeshi isolates, 2023", year: 2026, genbank: ["PX753735", "PX753736", "PX753737", "PX753738"] },
    ],
  },
];

export const NCBI_RECORD_COUNT = NCBI_GROUPS.reduce((n, g) => n + g.records.length, 0);
export const TOTAL_CITATIONS = PUBLICATIONS.reduce((n, p) => n + p.citations, 0);

/* h-index computed from the citation counts above. */
export const H_INDEX = (() => {
  const sorted = PUBLICATIONS.map((p) => p.citations).sort((a, b) => b - a);
  return sorted.filter((c, i) => c >= i + 1).length;
})();

export const TOOLS = [
  {
    name: "EGStat-N",
    href: "/tools",
    summary: "Epidemiology workbench: risk-factor regression, SEIR transmission, statistics and spatial heatmaps from a spreadsheet.",
    glyph: "forest",
  },
  {
    name: "QI-GeneX-N",
    href: "/tools",
    summary: "Genome workbench: upload FASTA, profile mutations, check vaccine mismatch and export figures.",
    glyph: "ring",
  },
  {
    name: "PRRSLooM",
    href: "/tools/prrsloom",
    summary: "PRRSV-2 variant classification, NJ trees, TIMER molecular-clock audits and haplotype networks. Developed by the V-EPI Lab (UMN); I converted it to Python.",
    glyph: "tree",
  },
] as const;

export const PROFILE_LINKS = [
  { name: "Google Scholar", url: "https://scholar.google.com/citations?user=37f5LKUAAAAJ&hl=en" },
  { name: "ORCID", url: "https://orcid.org/0009-0000-1970-9480" },
  { name: "Scopus", url: "https://www.scopus.com/authid/detail.uri?authorId=59914950700" },
  { name: "ResearchGate", url: "https://www.researchgate.net/profile/Fnu-Nahiduzzaman" },
  { name: "LinkedIn", url: "https://www.linkedin.com/in/fnu-nahiduzzaman-20195419b" },
];

/* Email addresses are stored reversed + base64 so they never appear as plain
   text in the HTML or JS bundle; ProtectedEmail decodes them only after a
   human check. Decode: atob(value.split("").reverse().join("")). */
export const ENCODED_EMAILS = [
  { label: "UMN", value: "==QdkVmLu1WdAdDMwQWaoFmb" },
  { label: "BAU", value: "==AZi5SdkVmL1FmYAVTNwEDMwIjLuFWbhpne1RWaoFmb" },
];

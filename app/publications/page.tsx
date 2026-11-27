"use client";

import { useMemo, useState } from "react";
import {
  NCBI_GROUPS,
  NCBI_RECORD_COUNT,
  PUBLICATIONS,
  TOTAL_CITATIONS,
  type NcbiRecord,
  type Publication,
  type PublicationKind,
} from "../_data/profile";

const KINDS: ("All" | PublicationKind)[] = ["All", "Journal article", "Book chapter", "Preprint"];

const ncbiUrl = {
  bioproject: (id: string) => `https://www.ncbi.nlm.nih.gov/bioproject/${id}`,
  biosample: (id: string) => `https://www.ncbi.nlm.nih.gov/biosample/${id}`,
  sra: (id: string) => `https://www.ncbi.nlm.nih.gov/sra/${id}`,
  genbank: (id: string) => `https://www.ncbi.nlm.nih.gov/nuccore/${id}`,
};

function citationText(p: Publication) {
  const tail = p.details ? `, ${p.details}` : "";
  const link = p.hasDoi ? ` ${p.url}` : "";
  return `${p.authors} (${p.year}). ${p.title}. ${p.venue}${tail}.${link}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-sm bg-aspen/30 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function PublicationRow({
  pub,
  query,
  onCopy,
  onTag,
}: {
  pub: Publication;
  query: string;
  onCopy: (p: Publication) => void;
  onTag: (tag: string) => void;
}) {
  return (
    <li className="grid gap-4 border-b border-white/10 py-8 md:grid-cols-[5rem_1fr_9rem] md:gap-8">
      <p className="font-display text-3xl text-mist">{pub.year}</p>

      <div>
        <p className="text-sm text-lichen">
          {pub.kind}
          {pub.firstAuthor ? ", first author" : ""}
        </p>
        <h3 className="mt-2 font-display text-2xl leading-snug md:text-[1.7rem]">
          <a href={pub.url} target="_blank" rel="noopener noreferrer" className="hover:text-aspen">
            <Highlight text={pub.title} query={query} />
          </a>
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          <Highlight text={pub.authors} query={query} />
        </p>
        <p className="mt-1 text-sm italic text-birch/80">
          <Highlight text={pub.venue} query={query} />
          {pub.details ? `, ${pub.details}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pub.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTag(tag)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-mist transition-colors hover:border-aspen hover:text-aspen"
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
          <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-aspen hover:underline">
            {pub.hasDoi ? "Read the paper" : "Find on Google Scholar"}
          </a>
          <button type="button" onClick={() => onCopy(pub)} className="text-mist hover:text-birch">
            Copy citation
          </button>
        </div>
      </div>

      <dl className="flex gap-6 text-sm md:block md:space-y-3 md:text-right">
        <div>
          <dt className="text-mist">Citations</dt>
          <dd className="font-display text-2xl">{pub.citations}</dd>
        </div>
        {pub.quartile && (
          <div>
            <dt className="text-mist">SJR</dt>
            <dd className="font-display text-2xl">
              <span className={pub.quartile === "Q1" ? "text-aspen" : ""}>{pub.quartile}</span>
              <span className="ml-2 text-base text-mist">{pub.sjr?.toFixed(3)}</span>
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}

function Accession({ label, id, href }: { label: string; id: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-2 rounded-full border border-white/10 px-3 py-1 text-sm transition-colors hover:border-lichen"
    >
      <span className="text-mist">{label}</span>
      <span className="tabular-nums text-lichen">{id}</span>
    </a>
  );
}

function NcbiRow({ record }: { record: NcbiRecord }) {
  return (
    <li className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-[1fr_1.3fr] md:gap-8">
      <div>
        <p className="font-display text-xl italic">{record.organism}</p>
        <p className="mt-1 text-sm text-mist">
          {record.source}, {record.year}
        </p>
      </div>
      <div className="flex flex-wrap content-start gap-2">
        {record.bioproject && <Accession label="BioProject" id={record.bioproject} href={ncbiUrl.bioproject(record.bioproject)} />}
        {record.biosample && <Accession label="BioSample" id={record.biosample} href={ncbiUrl.biosample(record.biosample)} />}
        {record.sra && <Accession label="SRA" id={record.sra} href={ncbiUrl.sra(record.sra)} />}
        {record.genbank?.map((id) => (
          <Accession key={id} label="GenBank" id={id} href={ncbiUrl.genbank(id)} />
        ))}
      </div>
    </li>
  );
}

export default function Publications() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("All");
  const [sort, setSort] = useState<"newest" | "cited">("newest");
  const [ncbiTab, setNcbiTab] = useState("all");
  const [toast, setToast] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PUBLICATIONS.filter((p) => kind === "All" || p.kind === kind)
      .filter(
        (p) =>
          !q ||
          [p.title, p.authors, p.venue, ...p.tags].some((field) => field.toLowerCase().includes(q))
      )
      .sort((a, b) => (sort === "newest" ? b.year - a.year || b.citations - a.citations : b.citations - a.citations));
  }, [query, kind, sort]);

  const copy = (p: Publication) => {
    navigator.clipboard.writeText(citationText(p)).then(() => {
      setToast("Citation copied");
      setTimeout(() => setToast(""), 2200);
    });
  };

  const q1 = PUBLICATIONS.filter((p) => p.quartile === "Q1").length;
  const groups = ncbiTab === "all" ? NCBI_GROUPS : NCBI_GROUPS.filter((g) => g.key === ncbiTab);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <header className="grid gap-8 pb-12 pt-16 md:grid-cols-[1.3fr_1fr] md:items-end md:pt-24">
        <h1 className="font-display text-6xl leading-none md:text-8xl">Publications</h1>
        <p className="text-lg text-mist md:text-right">
          {PUBLICATIONS.length} publications, {q1} in Q1 journals, {TOTAL_CITATIONS} citations on Google Scholar, and{" "}
          {NCBI_RECORD_COUNT} datasets on NCBI.
        </p>
      </header>

      <section aria-labelledby="papers-heading">
        <h2 id="papers-heading" className="sr-only">
          Papers
        </h2>
        <div className="sticky top-16 z-20 -mx-4 flex flex-col gap-3 border-y border-white/10 bg-lake/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  kind === k ? "bg-birch text-lake" : "text-mist hover:text-birch"
                }`}
              >
                {k === "All" ? "All" : `${k}s`}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className="relative flex-1 lg:w-72">
              <span className="sr-only">Search publications</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, author, journal or topic"
                className="w-full rounded-full border border-white/15 bg-transparent px-4 py-2 text-sm placeholder:text-mist/70 focus:border-aspen focus:outline-none"
              />
            </label>
            <label>
              <span className="sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "cited")}
                className="h-full rounded-full border border-white/15 bg-lake px-3 text-sm"
              >
                <option value="newest">Newest</option>
                <option value="cited">Most cited</option>
              </select>
            </label>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="py-16 text-mist">
            Nothing matches &ldquo;{query}&rdquo;.{" "}
            <button
              type="button"
              className="text-aspen hover:underline"
              onClick={() => {
                setQuery("");
                setKind("All");
              }}
            >
              Clear the filters
            </button>
          </div>
        ) : (
          <ol>
            {shown.map((pub) => (
              <PublicationRow key={pub.title} pub={pub} query={query} onCopy={copy} onTag={setQuery} />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="ncbi-heading" className="pt-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="ncbi-heading" className="font-display text-4xl md:text-5xl">
              Data on NCBI
            </h2>
            <p className="mt-3 max-w-xl text-mist">
              Raw reads, genomes and sequences from my studies, each linked to its NCBI record.
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter NCBI records">
            {[{ key: "all", label: "All", count: NCBI_RECORD_COUNT }, ...NCBI_GROUPS.map((g) => ({ key: g.key, label: g.label, count: g.records.length }))].map(
              (tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={ncbiTab === tab.key}
                  onClick={() => setNcbiTab(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    ncbiTab === tab.key ? "bg-lichen text-lake" : "text-mist hover:text-birch"
                  }`}
                >
                  {tab.label} <span className="tabular-nums opacity-70">{tab.count}</span>
                </button>
              )
            )}
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.key} className="mt-10">
            <h3 className="border-b border-white/20 pb-3 text-sm font-semibold text-lichen">{group.label}</h3>
            <ul>
              {group.records.map((r) => (
                <NcbiRow key={`${r.organism}-${r.source}`} record={r} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-birch px-5 py-3 text-sm font-semibold text-lake shadow-xl transition-opacity ${
          toast ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {toast}
      </div>
    </div>
  );
}

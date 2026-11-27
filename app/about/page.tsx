"use client";

import Image from "next/image";
import { useState } from "react";
import { EMAILS, H_INDEX, PROFILE_LINKS, PUBLICATIONS, TOTAL_CITATIONS } from "../_data/profile";

const SKILLS = [
  {
    title: "Microbiology lab",
    points: [
      "Bacterial isolation, culture and identification",
      "Cell culture and virus isolation",
      "Disc diffusion, MIC and AMR profiling",
      "PCR, qPCR, gel electrophoresis and ELISA",
    ],
  },
  {
    title: "Genomics and bioinformatics",
    points: [
      "Whole-genome assembly, annotation and comparison",
      "Viral genomics and phylogenetics",
      "Resistance and virulence gene screening",
      "Linux pipelines for pathogen genomes",
    ],
  },
  {
    title: "Epidemiology and statistics",
    points: [
      "Study design, sampling and risk-factor analysis",
      "Meta-analysis and systematic reviews",
      "Transmission and outbreak modelling",
      "Machine learning and quantum machine learning",
    ],
  },
  {
    title: "Software",
    points: [
      "Python, R, Julia and MATLAB",
      "SPSS and ArcGIS Pro",
      "Web tools: EGStat-N, QI-GeneX-N, PRRSLooM",
      "Scientific figures and automation scripts",
    ],
  },
];

const EDUCATION = [
  { years: "2020–2026", degree: "Doctor of Veterinary Medicine (DVM)", place: "Bangladesh Agricultural University, Mymensingh", result: "CGPA 3.155" },
  { years: "2017–2019", degree: "Higher Secondary Certificate", place: "Shahid Syed Nazrul Islam College, Mymensingh", result: "GPA 5.00" },
  { years: "2015–2017", degree: "Secondary School Certificate", place: "Hazrabari High School, Jamalpur", result: "GPA 5.00" },
];

export default function About() {
  const [openSkill, setOpenSkill] = useState(0);
  const firstAuthor = PUBLICATIONS.filter((p) => p.firstAuthor).length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <section className="grid gap-12 pt-16 md:grid-cols-[0.8fr_1.2fr] md:pt-24 lg:gap-20">
        <div className="relative mx-auto w-full max-w-sm md:mx-0">
          <Image
            src="/Me1.jpg"
            alt="Portrait of Nahiduzzaman"
            width={600}
            height={750}
            priority
            className="aspect-[4/5] w-full rounded-[3px] object-cover"
          />
        </div>

        <div>
          <h1 className="font-display text-6xl leading-none md:text-7xl">About</h1>
          <div className="mt-8 max-w-2xl space-y-5 text-lg leading-relaxed text-birch/85">
            <p>
              I trained as a veterinarian at Bangladesh Agricultural University (DVM, 2026). From 2023 to 2026 I was an
              undergraduate research assistant in the Department of Microbiology and Hygiene with Prof. Dr. Md. Ariful
              Islam, working on more than 12 projects in vaccine development, foodborne pathogens and public health.
            </p>
            <p>
              My interest is in how pathogens evolve and spread, and in using genomics, statistics and machine learning
              to see it earlier. I also study what microplastics do to animals, people and ecosystems.
            </p>
          </div>
          <blockquote className="mt-10 max-w-xl border-l-2 border-aspen pl-5 font-display text-2xl italic leading-snug text-birch">
            Nature’s quiet detail made me curious about the microbial world we cannot see.
          </blockquote>
          <p className="mt-10 text-mist">
            {PUBLICATIONS.length} publications ({firstAuthor} as first author), {TOTAL_CITATIONS} citations, h-index{" "}
            {H_INDEX}.
          </p>
        </div>
      </section>

      <section aria-labelledby="skills-heading" className="pt-24">
        <h2 id="skills-heading" className="font-display text-4xl md:text-5xl">
          Skills
        </h2>
        <div className="mt-8 border-t border-white/10">
          {SKILLS.map((skill, i) => {
            const open = openSkill === i;
            return (
              <div key={skill.title} className="border-b border-white/10">
                <h3>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`skill-${i}`}
                    onClick={() => setOpenSkill(open ? -1 : i)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className={`font-display text-2xl md:text-3xl ${open ? "text-aspen" : ""}`}>{skill.title}</span>
                    <span
                      aria-hidden="true"
                      className={`text-2xl text-mist transition-transform duration-300 ${open ? "rotate-45" : ""}`}
                    >
                      +
                    </span>
                  </button>
                </h3>
                <div
                  id={`skill-${i}`}
                  className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <ul className="grid gap-x-10 gap-y-2 overflow-hidden text-mist sm:grid-cols-2">
                    {skill.points.map((p) => (
                      <li key={p} className="last:pb-6 sm:[&:nth-last-child(-n+2)]:pb-6">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="edu-heading" className="pt-24">
        <h2 id="edu-heading" className="font-display text-4xl md:text-5xl">
          Education
        </h2>
        <ol className="mt-8 border-t border-white/10">
          {EDUCATION.map((e) => (
            <li key={e.degree} className="grid gap-1 border-b border-white/10 py-6 sm:grid-cols-[9rem_1fr_auto] sm:gap-8">
              <span className="tabular-nums text-mist">{e.years}</span>
              <span>
                <span className="block font-display text-2xl">{e.degree}</span>
                <span className="text-mist">{e.place}</span>
              </span>
              <span className="text-mist">{e.result}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="contact-heading" className="grid gap-10 pt-24 md:grid-cols-2">
        <div>
          <h2 id="contact-heading" className="font-display text-4xl md:text-5xl">
            Get in touch
          </h2>
          <p className="mt-4 max-w-md text-mist">Happy to talk about collaborations, data or the tools.</p>
          <ul className="mt-6 space-y-2">
            {EMAILS.map((email) => (
              <li key={email}>
                <a href={`mailto:${email}`} className="break-all text-lg text-aspen hover:underline">
                  {email}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <ul className="self-end border-t border-white/10">
          {PROFILE_LINKS.map((link) => (
            <li key={link.name} className="border-b border-white/10">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between py-4 font-display text-2xl transition-colors hover:text-aspen"
              >
                {link.name}
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M5 11L11 5M6 5h5v5" />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

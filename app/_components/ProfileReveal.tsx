/* Biography and research interest: two panels that expand on hover (desktop)
   and stack as cards on smaller screens. */

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif text-xs font-bold uppercase tracking-[0.34em] text-cyan-300">
      {children}
    </p>
  );
}

export default function ProfileReveal() {
  return (
    <section id="profile-sections" className="px-4 pb-20 sm:px-6 md:pb-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <SectionKicker>Profile</SectionKicker>
          <h2 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-tight text-white md:text-5xl">
            Biography and research interest
          </h2>
        </div>

        <div className="relative hidden h-[360px] overflow-hidden border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-cyan-950/30 lg:block">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(8,47,73,0.55),rgba(2,6,23,1)_45%,rgba(8,47,73,0.55))]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/15" />

          <article className="group absolute left-0 top-0 z-10 h-full w-1/2 overflow-hidden border-r border-cyan-300/15 bg-slate-950 transition-all duration-700 ease-out hover:z-40 hover:w-full hover:border-cyan-300/35 hover:shadow-[0_0_70px_rgba(34,211,238,0.18)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(90deg,rgba(15,23,42,1),rgba(2,6,23,1)_65%)]" />
            <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/16 blur-3xl transition duration-700 group-hover:bg-cyan-300/25" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-1 w-0 bg-cyan-300 transition-all duration-700 group-hover:w-full" />
            <div className="pointer-events-none absolute left-0 top-0 h-full w-20 -translate-x-full bg-gradient-to-r from-transparent via-cyan-200/10 to-transparent transition-transform duration-1000 group-hover:translate-x-[950%]" />

            <div className="relative grid h-full grid-cols-[0.36fr_0.64fr]">
              <div className="flex h-full flex-col justify-between p-8 xl:p-10">
                <div>
                  <SectionKicker>Biography</SectionKicker>
                  <h3 className="mt-4 font-serif text-4xl font-bold leading-tight text-white xl:text-5xl">
                    Academic profile
                  </h3>
                </div>

                <div className="border-t border-cyan-300/20 pt-5">
                  <p className="font-serif text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">
                    Hover to reveal
                  </p>
                </div>
              </div>

              <div className="flex h-full translate-x-10 items-center border-l border-cyan-300/20 bg-slate-950 p-8 opacity-0 transition-all duration-700 ease-out group-hover:translate-x-0 group-hover:opacity-100 xl:p-10">
                <div className="max-w-4xl">
                  <p className="font-serif text-base leading-8 text-slate-300 xl:text-lg xl:leading-9">
                    Nahiduzzaman began his DVM at the Faculty of Veterinary Science, Bangladesh Agricultural University, in 2020 and completed the degree on 31 March 2026. From September 2023 to March 2026, he worked as an Undergraduate Research Assistant in the Department of Microbiology and Hygiene under Prof. Dr. Ariful Islam, where he began his research journey through vaccine development, foodborne pathogen investigation, and public health-related studies. During this period, he contributed to more than 12 research projects, developing expertise in microbiology, epidemiology, public health, bioinformatics, genomics, vaccinology, and related laboratory, molecular, programming, and biological data analysis skills.
                  </p>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="border border-cyan-300/15 bg-cyan-300/5 p-3">
                      <p className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                        Focus
                      </p>
                      <p className="mt-1 font-serif text-sm text-slate-300">Microbiology</p>
                    </div>

                    <div className="border border-cyan-300/15 bg-cyan-300/5 p-3">
                      <p className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                        Method
                      </p>
                      <p className="mt-1 font-serif text-sm text-slate-300">Genomics</p>
                    </div>

                    <div className="border border-cyan-300/15 bg-cyan-300/5 p-3">
                      <p className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                        Output
                      </p>
                      <p className="mt-1 font-serif text-sm text-slate-300">Analysis</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="group absolute right-0 top-0 z-10 h-full w-1/2 overflow-hidden border-l border-cyan-300/15 bg-slate-950 transition-all duration-700 ease-out hover:z-40 hover:w-full hover:border-cyan-300/35 hover:shadow-[0_0_70px_rgba(34,211,238,0.18)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(270deg,rgba(15,23,42,1),rgba(2,6,23,1)_65%)]" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-400/16 blur-3xl transition duration-700 group-hover:bg-cyan-300/25" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-1 w-0 bg-cyan-300 transition-all duration-700 group-hover:w-full" />
            <div className="pointer-events-none absolute right-0 top-0 h-full w-20 translate-x-full bg-gradient-to-l from-transparent via-cyan-200/10 to-transparent transition-transform duration-1000 group-hover:-translate-x-[950%]" />

            <div className="relative grid h-full grid-cols-[0.64fr_0.36fr]">
              <div className="flex h-full -translate-x-10 items-center border-r border-cyan-300/20 bg-slate-950 p-8 opacity-0 transition-all duration-700 ease-out group-hover:translate-x-0 group-hover:opacity-100 xl:p-10">
                <div className="max-w-4xl">
                  <p className="font-serif text-base leading-8 text-slate-300 xl:text-lg xl:leading-9">
                    My research interests focus on microbiology, infectious diseases, public health, epidemiology, molecular epidemiology, bioinformatics, and microbial genomics. I am particularly interested in genomic evolution and transmission dynamics of infectious pathogens. A major focus of my research is the application of machine learning and quantum machine learning models in genomics, molecular epidemiology, and disease dynamics to improve pathogen surveillance, outbreak prediction, evolutionary analysis, and risk assessment. I am also interested in vaccine development, host-pathogen interactions, and the effects of plastic particles on animals, humans, and ecosystems.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {[
                      "Microbial genomics",
                      "Molecular epidemiology",
                      "Transmission dynamics",
                      "ML/QML",
                      "Risk assessment",
                      "Plastic particles",
                    ].map((item) => (
                      <span
                        key={item}
                        className="border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 font-serif text-xs font-bold uppercase tracking-[0.14em] text-cyan-100"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col justify-between p-8 text-right xl:p-10">
                <div>
                  <SectionKicker>Research Interest</SectionKicker>
                  <h3 className="mt-4 font-serif text-4xl font-bold leading-tight text-white xl:text-5xl">
                    Research interest
                  </h3>
                </div>

                <div className="border-t border-cyan-300/20 pt-5">
                  <p className="font-serif text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">
                    Hover to reveal
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div className="grid gap-5 lg:hidden">
          <article className="border border-cyan-300/20 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl sm:p-7">
            <SectionKicker>Biography</SectionKicker>
            <h3 className="mt-3 font-serif text-3xl font-bold text-white">
              Academic profile
            </h3>
            <p className="mt-5 font-serif text-base leading-8 text-slate-300">
              Nahiduzzaman began his DVM at the Faculty of Veterinary Science, Bangladesh Agricultural University, in 2020 and completed the degree on 31 March 2026. From September 2023 to March 2026, he worked as an Undergraduate Research Assistant in the Department of Microbiology and Hygiene under Prof. Dr. Ariful Islam, where he began his research journey through vaccine development, foodborne pathogen investigation, and public health-related studies. During this period, he contributed to more than 12 research projects and developed expertise in microbiology, epidemiology, public health, bioinformatics, genomics, vaccinology, and related analytical skills.
            </p>
          </article>

          <article className="border border-cyan-300/20 bg-slate-950/90 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl sm:p-7">
            <SectionKicker>Research Interest</SectionKicker>
            <h3 className="mt-3 font-serif text-3xl font-bold text-white">
              Research interest
            </h3>
            <p className="mt-5 font-serif text-base leading-8 text-slate-300">
              My research interests focus on microbiology, infectious diseases, public health, epidemiology, molecular epidemiology, bioinformatics, and microbial genomics. I am particularly interested in genomic evolution and transmission dynamics of infectious pathogens. A major focus of my research is the application of machine learning and quantum machine learning models in genomics, molecular epidemiology, and disease dynamics to improve pathogen surveillance, outbreak prediction, evolutionary analysis, and risk assessment. I am also interested in vaccine development, host-pathogen interactions, and the effects of plastic particles on animals, humans, and ecosystems.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

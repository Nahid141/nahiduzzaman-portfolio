import "./globals.css";

export const metadata = {
  title: "Nahiduzzaman | Research Portfolio",
  description:
    "Research, publications, tools, blog, and bioinformatics portfolio of Nahiduzzaman",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navItems = [
    { name: "Home", href: "/" },
    { name: "Research", href: "/research" },
    { name: "Publications", href: "/publications" },
    { name: "Tools", href: "/tools" },
    { name: "Blog", href: "/blog" },
    { name: "About", href: "/about" },
  ];

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white">
        <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
            <a href="/" className="shrink-0">
              <div className="text-lg font-black text-cyan-300 md:text-xl">
                Nahiduzzaman
              </div>
              <div className="text-[11px] font-semibold text-slate-300">
                DVM • Researcher
              </div>
            </a>

            <nav className="hidden gap-8 text-sm font-bold text-white md:flex">
              {navItems.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="transition hover:text-cyan-300"
                >
                  {item.name}
                </a>
              ))}
            </nav>
          </div>

          <nav className="flex gap-3 overflow-x-auto border-t border-white/10 px-4 py-3 text-sm font-bold text-slate-200 md:hidden">
            {navItems.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 transition hover:border-cyan-300 hover:text-cyan-300"
              >
                {item.name}
              </a>
            ))}
          </nav>
        </header>

        <main className="min-h-screen pt-36 md:pt-24">{children}</main>

        <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-400">
          <p>© {new Date().getFullYear()} Nahiduzzaman. All rights reserved.</p>
          <p className="mt-1 font-semibold text-cyan-300">
            Developed by Nahiduzzaman
          </p>
        </footer>
      </body>
    </html>
  );
}
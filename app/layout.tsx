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
      <body className="min-h-screen bg-slate-950 text-white flex flex-col">

        {/* 🔥 TRANSPARENT HEADER */}
        <header className="fixed top-0 left-0 w-full z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">

            <a href="/" className="group">
              <div className="text-xl font-black text-cyan-300 group-hover:text-white transition">
                Nahiduzzaman
              </div>
              <div className="text-xs text-slate-300">
                DVM • Researcher
              </div>
            </a>

            <nav className="hidden md:flex gap-8 text-sm font-bold text-white">
              {navItems.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="hover:text-cyan-300 transition"
                >
                  {item.name}
                </a>
              ))}
            </nav>

          </div>
        </header>

        {/* CONTENT */}
        <main className="pt-24 flex-1">
          {children}
        </main>

        {/* 🔥 MINIMAL FOOTER ONLY */}
        <footer className="text-center text-sm text-slate-400 py-6 border-t border-white/10">
          <p>© {new Date().getFullYear()} Nahiduzzaman. All rights reserved.</p>
          <p className="mt-1 text-cyan-300 font-semibold">
            Developed by Nahiduzzaman
          </p>
        </footer>

      </body>
    </html>
  );
}
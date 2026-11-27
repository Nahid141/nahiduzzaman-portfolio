"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { name: "Home", href: "/" },
  { name: "Research", href: "/research" },
  { name: "Publications", href: "/publications" },
  { name: "Tools", href: "/tools" },
  { name: "Blog", href: "/blog" },
  { name: "About", href: "/about" },
  { name: "Connect", href: "/connect" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        <Link href="/" className="group shrink-0">
          <div className="text-lg font-black text-cyan-300 transition group-hover:text-white md:text-xl">Nahiduzzaman</div>
          <div className="text-[11px] font-semibold text-slate-300">DVM • Researcher</div>
        </Link>

        <nav aria-label="Main" className="hidden gap-8 text-sm font-bold text-white md:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 transition hover:text-cyan-300 ${active ? "text-cyan-300" : ""}`}
              >
                {item.name}
                <span
                  className={`absolute -bottom-0.5 left-0 h-0.5 bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)] transition-all duration-300 ${
                    active ? "w-full" : "w-0"
                  }`}
                />
              </Link>
            );
          })}
        </nav>
      </div>

      <nav
        aria-label="Main"
        className="flex gap-3 overflow-x-auto border-t border-white/10 px-4 py-3 text-sm font-bold text-slate-200 md:hidden"
      >
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 transition hover:border-cyan-300 hover:text-cyan-300 ${
                active ? "border-cyan-300 bg-cyan-300/15 text-cyan-300" : "border-white/10 bg-white/5"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

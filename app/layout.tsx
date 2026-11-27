import "./globals.css";
import { Newsreader, Public_Sans } from "next/font/google";
import Backdrop from "./_components/Backdrop";
import SiteHeader from "./_components/SiteHeader";
import ProtectedEmail from "./_components/ProtectedEmail";
import { PROFILE_LINKS } from "./_data/profile";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata = {
  title: "Nahiduzzaman | Research Portfolio",
  description:
    "Veterinary microbiology, genomics and molecular epidemiology: publications, NCBI data and open research tools by Nahiduzzaman.",
};

// Backend URL (local + deployed)
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${publicSans.variable}`}>
      <body className="flex min-h-screen flex-col bg-lake font-sans text-birch antialiased">
        <Backdrop />
        <SiteHeader />

        <main className="relative z-10 flex-1 pt-36 md:pt-24">{children}</main>

        <footer className="relative z-10 border-t border-white/10 bg-slate-950/80 py-6 text-center text-sm text-slate-400 backdrop-blur-xl">
          <nav aria-label="Academic profiles" className="mb-3 flex flex-wrap justify-center gap-x-5 gap-y-2 px-4">
            {PROFILE_LINKS.map((link) => (
              <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="transition hover:text-cyan-300">
                {link.name}
              </a>
            ))}
          </nav>
          <div className="mb-3 flex justify-center px-4">
            <ProtectedEmail index={0} />
          </div>
          <p>© {new Date().getFullYear()} Nahiduzzaman. All rights reserved.</p>
          <p className="mt-1 font-semibold text-cyan-300">Developed by Nahiduzzaman</p>
          <a href="/connect" className="mt-2 inline-block text-xs text-slate-600 transition hover:text-cyan-300">
            Private Connect
          </a>
        </footer>
      </body>
    </html>
  );
}

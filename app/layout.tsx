import "./globals.css";
import { Newsreader, Public_Sans } from "next/font/google";
import Backdrop from "./_components/Backdrop";
import SiteHeader from "./_components/SiteHeader";
import { EMAILS, PROFILE_LINKS } from "./_data/profile";

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

        <main className="relative z-10 flex-1 pt-16">{children}</main>

        <footer className="relative z-10 border-t border-aspen/15 bg-lake/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-display text-2xl">Nahiduzzaman</p>
              <a href={`mailto:${EMAILS[0]}`} className="mt-1 inline-block text-sm text-mist hover:text-aspen">
                {EMAILS[0]}
              </a>
            </div>
            <nav aria-label="Academic profiles" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-mist">
              {PROFILE_LINKS.map((link) => (
                <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-aspen">
                  {link.name}
                </a>
              ))}
            </nav>
            <p className="text-sm text-mist/70">© {new Date().getFullYear()} Nahiduzzaman</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

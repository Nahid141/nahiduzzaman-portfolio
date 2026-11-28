import type { Metadata } from "next";
import { PlayDockProvider } from "./_components/PlayDock";

// Private application: keep it out of search results. This is not a security control;
// access is enforced by the Private Connect backend.
export const metadata: Metadata = {
  title: "Private Connect",
  robots: { index: false, follow: false, nocache: true },
  // Installable app shell. There is deliberately no service worker: private data is never cached offline.
  manifest: "/connect.webmanifest",
};

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return <PlayDockProvider>{children}</PlayDockProvider>;
}

import type { Metadata } from "next";

// Private application: keep it out of search results. This is not a security control;
// access is enforced by the Private Connect backend.
export const metadata: Metadata = {
  title: "Private Connect",
  robots: { index: false, follow: false, nocache: true },
};

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return <div className="relative">{children}</div>;
}

"use client";

import { usePathname } from "next/navigation";
import ScientificBackground from "./ScientificBackground";

/* The moving microbe/tree background, kept off the tool pages so it never
   competes with tables and plots. */
export default function Backdrop() {
  const pathname = usePathname();
  if (pathname.startsWith("/tools")) return null;

  return (
    <>
      <ScientificBackground />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(circle_at_70%_10%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(to_bottom,rgba(2,6,23,0.02),rgba(2,6,23,0.82))]"
      />
    </>
  );
}

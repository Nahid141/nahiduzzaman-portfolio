"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type ConnectUser } from "../_lib/api";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <div className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-slate-950/85 p-7 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
        <p className="relative text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Private Connect</p>
        <h1 className="relative mt-3 text-3xl font-black text-white">{title}</h1>
        {subtitle && <p className="relative mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>}
        <div className="relative mt-7">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-200">{label}</span>
      <input
        {...props}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Submit({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
        kind === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      }`}
    >
      {children}
    </p>
  );
}

export const TextLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-bold text-cyan-300 hover:text-white">
    {children}
  </Link>
);

/** Loads the signed-in user; sends visitors to the right sign-in page when needed. */
export function useMe(opts: { admin?: boolean } = {}) {
  const router = useRouter();
  const [me, setMe] = useState<ConnectUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ user: ConnectUser; mfaEnrollmentRequired: boolean }>("/auth/me")
      .then((r) => {
        if (!alive) return;
        if (r.mfaEnrollmentRequired) return router.replace("/connect/admin/mfa-setup");
        if (opts.admin && r.user.role !== "admin") return router.replace("/connect/dashboard");
        setMe(r.user);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) router.replace(opts.admin ? "/connect/admin/login" : "/connect/login");
        else setError("Cannot reach Private Connect right now.");
      });
    return () => {
      alive = false;
    };
  }, [router, opts.admin]);

  return { me, error };
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} />;
}

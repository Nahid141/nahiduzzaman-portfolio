"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Workspace from "../_components/Workspace";
import { api, type ConnectUser } from "../_lib/api";

type Stats = { totalMembers: number; byStatus: Record<string, number> };

function AdminSummary() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api<Stats>("/admin/stats").then(setStats).catch(() => setStats(null));
  }, []);
  if (!stats) return null;
  const pending = stats.byStatus.pending ?? 0;
  return (
    <Link
      href="/connect/admin"
      className="mt-6 block rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-5 transition hover:border-cyan-300/60"
    >
      <p className="text-sm font-bold text-cyan-200">Admin console</p>
      <p className="mt-1 text-2xl font-black text-white">
        {pending} registration{pending === 1 ? "" : "s"} waiting
      </p>
      <p className="mt-1 text-sm text-slate-400">{stats.totalMembers} accounts in total</p>
    </Link>
  );
}

function Welcome({ me }: { me: ConnectUser }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Dashboard</p>
      <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">Welcome, {me.fullName.split(" ")[0]}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-300">
        Your account is active. Chat, meetings, file sharing and the music lounge are being built in stages; the menu marks the
        ones that are not ready yet.
      </p>
      {me.role === "admin" && <AdminSummary />}
      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Role", me.role === "admin" ? "Administrator" : "Member"],
          ["Member since", new Date(me.createdAt).toLocaleDateString()],
          ["Two-factor", me.mfaEnabled ? "On" : me.role === "admin" ? "Required" : "Not required for members"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <dt className="text-xs font-bold text-slate-500">{k}</dt>
            <dd className="mt-1 font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function Dashboard() {
  return <Workspace>{(me) => <Welcome me={me} />}</Workspace>;
}

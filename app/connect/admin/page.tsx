"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "../_components/ui";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";

type Stats = { totalMembers: number; byStatus: Record<string, number> };
type Settings = { registrationEnabled: boolean; requireApproval: boolean; maintenanceMode: boolean };
type AuditRow = { id: string; action: string; actor: string | null; targetId: string | null; createdAt: string };

const STATUS_LABEL: Record<ConnectUser["status"], string> = {
  pending_verification: "Email not confirmed",
  pending: "Waiting for approval",
  active: "Active",
  rejected: "Rejected",
  suspended: "Suspended",
  banned: "Banned",
};

/* Which actions make sense for each status (the server enforces the same rules). */
const ACTIONS: Record<ConnectUser["status"], ("approve" | "reject" | "suspend" | "ban" | "reactivate")[]> = {
  pending_verification: ["reject", "ban"],
  pending: ["approve", "reject", "ban"],
  active: ["suspend", "ban"],
  rejected: ["reactivate", "ban"],
  suspended: ["reactivate", "ban"],
  banned: ["reactivate"],
};

const ACTION_LABEL = { approve: "Approve", reject: "Reject", suspend: "Suspend", ban: "Ban", reactivate: "Reactivate" };

function Console({ me }: { me: ConnectUser }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<ConnectUser[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<ConnectUser["status"] | "all">("pending");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    Promise.all([
      api<Stats>("/admin/stats"),
      api<ConnectUser[]>(filter === "all" ? "/admin/users" : `/admin/users?status=${filter}`),
      api<Settings>("/admin/settings"),
      api<AuditRow[]>("/admin/audit?limit=30"),
    ])
      .then(([s, u, st, a]) => {
        setStats(s);
        setUsers(u);
        setSettings(st);
        setAudit(a);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [filter]);

  useEffect(load, [load]);

  async function act(path: string, body: unknown = {}) {
    setError("");
    try {
      await api(path, { body });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    try {
      setSettings(await api<Settings>("/admin/settings", { method: "PUT", body: { [key]: !settings[key] } }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Admin console</p>
      <h1 className="mt-3 text-3xl font-black text-white">Members and access</h1>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Accounts", stats?.totalMembers],
          ["Active", stats?.byStatus.active ?? 0],
          ["Waiting", stats?.byStatus.pending ?? 0],
          ["Suspended or banned", (stats?.byStatus.suspended ?? 0) + (stats?.byStatus.banned ?? 0)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-2xl font-black text-cyan-200">{stats ? v : "–"}</p>
            <p className="text-xs font-bold text-slate-400">{k}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-white">Accounts</h2>
          <div className="flex flex-wrap gap-1">
            {(["pending", "active", "suspended", "banned", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${filter === s ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300 hover:text-white"}`}
              >
                {s === "all" ? "All" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        {users.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No accounts in this list.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {users.map((u) => (
              <li key={u.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white">
                      {u.fullName} <span className="text-slate-400">@{u.username}</span>
                      {u.role === "admin" && <span className="ml-2 rounded-full bg-cyan-300/15 px-2 py-0.5 text-xs text-cyan-200">admin</span>}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {u.email} · {STATUS_LABEL[u.status]} · joined {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                    {u.bio && <p className="mt-2 text-sm text-slate-300">{u.bio}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS[u.status].map((a) => (
                      <button
                        key={a}
                        type="button"
                        disabled={u.id === me.id && a !== "reactivate"}
                        onClick={() => act(`/admin/users/${u.id}/${a}`)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-black transition disabled:opacity-30 ${
                          a === "approve" || a === "reactivate"
                            ? "bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/30"
                            : "bg-rose-400/15 text-rose-100 hover:bg-rose-400/25"
                        }`}
                      >
                        {ACTION_LABEL[a]}
                      </button>
                    ))}
                    {u.status === "active" && u.id !== me.id && (
                      <button
                        type="button"
                        onClick={() => act(`/admin/users/${u.id}/role`, { role: u.role === "admin" ? "member" : "admin" })}
                        className="rounded-xl bg-white/5 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-white/10"
                      >
                        {u.role === "admin" ? "Make member" : "Make admin"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black text-white">Global settings</h2>
        <div className="mt-4 space-y-2">
          {settings &&
            (
              [
                ["registrationEnabled", "Allow new registrations"],
                ["requireApproval", "Require administrator approval for new members"],
                ["maintenanceMode", "Maintenance mode (stored; enforced once later modules exist)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="text-sm font-semibold text-slate-200">{label}</span>
                <input type="checkbox" checked={settings[key]} onChange={() => toggle(key)} className="h-5 w-5 accent-cyan-300" />
              </label>
            ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black text-white">Recent activity</h2>
        <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/10">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-200">
                {a.action} <span className="text-slate-500">by {a.actor ?? "system"}</span>
              </span>
              <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function AdminConsole() {
  return <Workspace admin>{(me) => <Console me={me} />}</Workspace>;
}

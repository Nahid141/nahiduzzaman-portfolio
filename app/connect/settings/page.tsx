"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Field, Submit } from "../_components/ui";
import Workspace from "../_components/Workspace";
import { api, errorMessage } from "../_lib/api";

type SessionRow = { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null };

function Sessions() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const load = useCallback(() => {
    api<SessionRow[]>("/auth/sessions").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function revoke(id: string) {
    await api(`/auth/sessions/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-black text-white">Where you are signed in</h2>
      <ul className="mt-4 space-y-2">
        {rows?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{s.userAgent ?? "Unknown device"}</p>
              <p className="text-xs text-slate-400">
                {s.ip ?? "unknown IP"} · last active {new Date(s.lastSeenAt).toLocaleString()}
              </p>
            </div>
            {s.current ? (
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">This device</span>
            ) : (
              <button type="button" onClick={() => revoke(s.id)} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-rose-300/50 hover:text-rose-200">
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) return setMsg({ kind: "error", text: "The new passwords do not match." });
    setBusy(true);
    try {
      await api("/auth/password/change", { body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
      setMsg({ kind: "ok", text: "Password changed. Your other devices were signed out." });
      form.reset();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-md space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <Field label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
      <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      <Submit busy={busy}>Change password</Submit>
    </form>
  );
}

export default function Settings() {
  return (
    <Workspace>
      {() => (
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Settings</p>
          <h1 className="mt-3 text-3xl font-black text-white">Account and security</h1>
          <PasswordForm />
          <Sessions />
        </div>
      )}
    </Workspace>
  );
}

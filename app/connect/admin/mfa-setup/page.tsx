"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AuthCard, Field, Submit } from "../../_components/ui";
import { api, ApiError, errorMessage } from "../../_lib/api";

export default function MfaSetup() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Each enroll call creates a new key, so request it exactly once (dev mode runs effects twice).
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    api<{ secret: string; uri: string }>("/auth/mfa/enroll", { body: {} })
      .then(setSetup)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/connect/admin/login");
        else if (err instanceof ApiError && err.code === "mfa_already_enabled") router.replace("/connect/admin");
        else setError(errorMessage(err));
      });
  }, [router]);

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ recoveryCodes: string[] }>("/auth/mfa/enroll/confirm", {
        body: { code: String(new FormData(e.currentTarget).get("code") ?? "").trim() },
      });
      setCodes(r.recoveryCodes);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  if (codes) {
    return (
      <AuthCard title="Save your recovery codes" subtitle="Each code works once if you lose your authenticator. They will not be shown again.">
        <ol className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-900 p-4 font-mono text-sm text-cyan-100">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(codes.join("\n"))}
            className="rounded-xl border border-cyan-300/30 px-4 py-2 text-sm font-bold text-cyan-100 hover:border-cyan-300"
          >
            Copy codes
          </button>
        </div>
        <label className="mt-6 flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1" />
          I saved these codes somewhere safe.
        </label>
        <button
          type="button"
          disabled={!saved}
          onClick={() => router.push("/connect/admin")}
          className="mt-5 w-full rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:opacity-40"
        >
          Open the admin console
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set up two-factor authentication" subtitle="Required for the administrator account.">
      {error && <Alert>{error}</Alert>}
      {setup ? (
        <form onSubmit={onConfirm} className="space-y-5">
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
            <li>
              Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) and add an account.
            </li>
            <li>
              On a phone, tap{" "}
              <a href={setup.uri} className="font-bold text-cyan-300 underline">
                this setup link
              </a>
              , or enter this key manually:
              <code className="mt-2 block break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-cyan-100">{setup.secret}</code>
            </li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <Field label="Authentication code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
          <Submit busy={busy}>Turn on two-factor authentication</Submit>
        </form>
      ) : (
        !error && <p className="text-slate-400">Preparing your setup key…</p>
      )}
    </AuthCard>
  );
}

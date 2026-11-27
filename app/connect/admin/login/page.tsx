"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AuthCard, Field, Submit, TextLink } from "../../_components/ui";
import { api, errorMessage } from "../../_lib/api";

type Step = { step: "mfa"; ticket: string } | { step: "enroll_mfa" } | { step: "done" };

export default function AdminLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await api<Step>("/auth/login/admin", { body: { identifier: f.get("identifier"), password: f.get("password") } });
      if (r.step === "enroll_mfa") return router.push("/connect/admin/mfa-setup");
      if (r.step === "mfa") setTicket(r.ticket);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await api("/auth/mfa/verify", { body: useRecovery ? { ticket, recoveryCode: value } : { ticket, code: value } });
      router.push("/connect/admin");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <AuthCard
        title="Two-factor check"
        subtitle={useRecovery ? "Enter one of your saved recovery codes." : "Enter the 6-digit code from your authenticator app."}
      >
        <form onSubmit={onCode} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field
            key={String(useRecovery)}
            label={useRecovery ? "Recovery code" : "Authentication code"}
            name="code"
            autoComplete="one-time-code"
            inputMode={useRecovery ? "text" : "numeric"}
            pattern={useRecovery ? undefined : "[0-9]{6}"}
            maxLength={useRecovery ? 12 : 6}
            autoFocus
            required
          />
          <Submit busy={busy}>Verify</Submit>
        </form>
        <button
          type="button"
          onClick={() => setUseRecovery((v) => !v)}
          className="mt-5 text-sm font-bold text-cyan-300 hover:text-white"
        >
          {useRecovery ? "Use the authenticator app instead" : "Lost your phone? Use a recovery code"}
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Administrator login" subtitle="Two-factor authentication is required after your password.">
      <form onSubmit={onPassword} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Username" name="identifier" autoComplete="username" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Submit busy={busy}>Continue</Submit>
      </form>
      <div className="mt-6 text-sm">
        <TextLink href="/connect">Back to Private Connect</TextLink>
      </div>
    </AuthCard>
  );
}

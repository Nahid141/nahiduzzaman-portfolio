"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, AuthCard, Field, Submit, TextLink } from "../_components/ui";
import { api, errorMessage } from "../_lib/api";

function Reset() {
  const token = useSearchParams().get("token");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setError("The passwords do not match.");
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/reset", { body: { token, password: f.get("password") } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Choose a new password" subtitle="This signs you out on every device.">
      {done ? (
        <Alert kind="ok">Your password was changed. Sign in with the new one.</Alert>
      ) : !token ? (
        <Alert>This link is missing its token. Open the link from your email again.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} hint="At least 12 characters." required />
          <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
          <Submit busy={busy}>Change password</Submit>
        </form>
      )}
      <p className="mt-6 text-sm">
        <TextLink href="/connect/member/login">Go to sign in</TextLink>
      </p>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}

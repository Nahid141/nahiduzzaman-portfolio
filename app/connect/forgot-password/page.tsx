"use client";

import { useState } from "react";
import { Alert, AuthCard, Field, Submit, TextLink } from "../_components/ui";
import { api, errorMessage } from "../_lib/api";

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/forgot", { body: { email: new FormData(e.currentTarget).get("email") } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Reset your password" subtitle="We will email you a link that works for one hour.">
      {done ? (
        <Alert kind="ok">If an account uses that address, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Submit busy={busy}>Send reset link</Submit>
        </form>
      )}
      <p className="mt-6 text-sm">
        <TextLink href="/connect">Back to Private Connect</TextLink>
      </p>
    </AuthCard>
  );
}

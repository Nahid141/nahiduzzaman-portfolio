"use client";

import { useState } from "react";
import { Alert, AuthCard, Field, Submit, TextLink } from "../_components/ui";
import { api, errorMessage } from "../_lib/api";

export default function Register() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirmPassword")) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/register", {
        body: {
          fullName: f.get("fullName"),
          username: f.get("username"),
          email: f.get("email"),
          password: f.get("password"),
          confirmPassword: f.get("confirmPassword"),
          bio: f.get("bio") || undefined,
          acceptTerms: f.get("acceptTerms") === "on",
        },
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="We sent a link to confirm your address.">
        <Alert kind="ok">
          After you confirm, the administrator reviews your request. You will get an email when your account is approved.
        </Alert>
        <p className="mt-6 text-sm">
          <TextLink href="/connect">Back to Private Connect</TextLink>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Request an account" subtitle="Accounts are approved by the administrator.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" name="fullName" autoComplete="name" maxLength={100} required />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          pattern="[A-Za-z0-9_.\-]{3,32}"
          hint="3–32 letters, numbers, dots, dashes or underscores."
          required
        />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} hint="At least 12 characters." required />
        <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required />
        <label className="block">
          <span className="text-sm font-bold text-slate-200">Short bio (optional)</span>
          <textarea
            name="bio"
            maxLength={500}
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-300"
          />
        </label>
        <p className="text-xs text-slate-500">You can add a profile picture after your account is approved.</p>
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" name="acceptTerms" required className="mt-1" />
          <span>
            I accept the terms of use and the privacy policy: my name, username, email and bio are stored to run this
            workspace and are visible to the administrator.
          </span>
        </label>
        <Submit busy={busy}>Send request</Submit>
      </form>
      <p className="mt-6 text-sm text-slate-400">
        Already have an account? <TextLink href="/connect/member/login">Sign in</TextLink>
      </p>
    </AuthCard>
  );
}

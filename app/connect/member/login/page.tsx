"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AuthCard, Field, Submit, TextLink } from "../../_components/ui";
import { api, errorMessage } from "../../_lib/api";

export default function MemberLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/auth/login/member", { body: { identifier: f.get("identifier"), password: f.get("password") } });
      router.push("/connect/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Member login" subtitle="Sign in with your username or email.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Username or email" name="identifier" autoComplete="username" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Submit busy={busy}>Sign in</Submit>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
        <TextLink href="/connect/forgot-password">Forgot password?</TextLink>
        <TextLink href="/connect/register">Request an account</TextLink>
      </div>
    </AuthCard>
  );
}

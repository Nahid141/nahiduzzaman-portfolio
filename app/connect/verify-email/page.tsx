"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Alert, AuthCard, TextLink } from "../_components/ui";
import { api, errorMessage } from "../_lib/api";

function Verify() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<{ kind: "busy" | "ok" | "error"; text: string }>({ kind: "busy", text: "Confirming your email…" });
  const sent = useRef(false); // the link works once; do not send it twice

  useEffect(() => {
    if (sent.current || !token) return;
    sent.current = true;
    api<{ status: string }>("/auth/verify-email", { body: { token } })
      .then((r) =>
        setState({
          kind: "ok",
          text:
            r.status === "active"
              ? "Your email is confirmed and your account is active. You can sign in now."
              : "Your email is confirmed. The administrator will review your request; you will get an email when it is approved.",
        })
      )
      .catch((err) => setState({ kind: "error", text: errorMessage(err) }));
  }, [token]);

  return (
    <AuthCard title="Email confirmation">
      {!token ? (
        <Alert>This link is missing its token. Open the link from your email again.</Alert>
      ) : state.kind === "busy" ? (
        <p className="text-slate-300">{state.text}</p>
      ) : (
        <Alert kind={state.kind}>{state.text}</Alert>
      )}
      <p className="mt-6 text-sm">
        <TextLink href="/connect/member/login">Go to sign in</TextLink>
      </p>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

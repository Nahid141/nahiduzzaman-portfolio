/* Client for the Private Connect backend. Every authorization decision happens there;
   this file only shapes requests and turns error codes into plain sentences. */

export const CONNECT_API = process.env.NEXT_PUBLIC_CONNECT_API_URL || "http://localhost:8020";

export type ConnectUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  bio: string | null;
  role: "admin" | "member";
  status: "pending_verification" | "pending" | "active" | "rejected" | "suspended" | "banned";
  mfaEnabled: boolean;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, public issues?: { path: string; message: string }[]) {
    super(code);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That username or password is not right.",
  rate_limited: "Too many attempts. Wait 15 minutes and try again.",
  account_pending: "Your account is waiting for the administrator's approval.",
  email_unverified: "Confirm your email address first. Check your inbox for the link.",
  account_inactive: "This account is not active. Contact the administrator.",
  username_taken: "That username is taken. Choose another.",
  registration_closed: "Registration is closed right now.",
  invalid_or_expired_token: "This link is invalid or has expired. Request a new one.",
  invalid_mfa: "That code is not right, or the sign-in attempt expired. Try again.",
  mfa_enrollment_required: "Set up two-factor authentication to continue.",
  unauthenticated: "Please sign in.",
  forbidden: "You do not have access to this.",
  last_admin: "You cannot remove the last active administrator.",
  invalid_transition: "That change is not possible from the account's current status.",
  csrf: "The request was blocked for security reasons. Reload the page and try again.",
  server_error: "Something went wrong on the server. Try again in a moment.",
  network: "Cannot reach Private Connect. Check your connection and try again.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_input" && err.issues?.length) return err.issues.map((i) => i.message).join(" ");
    return MESSAGES[err.code] ?? "Something went wrong. Try again.";
  }
  return MESSAGES.network;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CONNECT_API}/api/v1${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json", "x-connect-csrf": "1" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "server_error", data.issues);
  return data as T;
}

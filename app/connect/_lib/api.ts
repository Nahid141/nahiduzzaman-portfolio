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
  /** Full error body, e.g. the current state returned with a version conflict. */
  data?: Record<string, unknown>;
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
  network: "Cannot reach Private Connect. The free server sleeps when idle and takes about a minute to wake. Try again shortly.",
  not_found: "That item does not exist or you do not have access to it.",
  storage_unavailable: "File storage is not configured yet.",
  uploads_disabled: "Uploads are turned off by the administrator.",
  file_type_not_allowed: "That file type is not allowed. Use PDF, Office, text, images, audio, video or ZIP.",
  file_too_large: "That file is larger than the limit for its type.",
  user_quota_exceeded: "You have used your storage allowance. Delete some files first.",
  storage_full: "Shared storage is full. Ask the administrator to free some space.",
  egress_quota_exceeded: "This month's download allowance is used up. It resets on the 1st (UTC).",
  upload_missing: "The upload did not finish. Try again.",
  upload_rejected_signature_mismatch: "The file's contents do not match its type, so it was rejected.",
  upload_rejected_size_mismatch: "The uploaded file was not the size announced, so it was rejected.",
  upload_rejected_malware: "The file matches known malware and was deleted.",
  invalid_attachment: "One of the attachments is not available.",
  meetings_unavailable: "Video meetings are not configured yet.",
  meetings_disabled: "Meetings are turned off by the administrator.",
  meeting_full: "This meeting is full (10 people). Try again when someone leaves.",
  meeting_locked: "The host has locked this meeting.",
  meeting_ended: "This meeting has ended.",
  meeting_not_started: "This meeting has not started yet.",
  meeting_quota_exceeded: "This month's free meeting minutes are used up. They reset on the 1st (UTC).",
  not_admitted: "The host has not admitted you to this meeting.",
  version_conflict: "Someone else changed this at the same moment. The latest state is shown; try again.",
  file_not_shareable: "Only ready files shared in a public channel can be played for everyone.",
  not_audio: "Choose an audio file.",
  too_many_pending_requests: "You already have five requests waiting.",
  music_requests_disabled: "Music requests are turned off.",
  follow_host_disabled: "Turn on Follow Host Mode in the admin settings first.",
  poll_closed: "This poll is closed.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_input" && err.issues?.length) return err.issues.map((i) => i.message).join(" ");
    return MESSAGES[err.code] ?? "Something went wrong. Try again.";
  }
  return MESSAGES.network;
}

/* The free backend sleeps after 15 idle minutes; while it wakes, requests fail before reaching it.
   Those network-level failures are retried for about a minute (nothing was processed yet). */
const WAKE_DELAYS = [1500, 3000, 6000, 10000, 15000, 20000];
let waking = false;
const wakeListeners = new Set<(w: boolean) => void>();
export const onWaking = (fn: (w: boolean) => void) => (wakeListeners.add(fn), () => void wakeListeners.delete(fn));
const setWaking = (w: boolean) => {
  if (w !== waking) wakeListeners.forEach((fn) => fn((waking = w)));
};

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${CONNECT_API}/api/v1${path}`, {
        method: init.method ?? (init.body ? "POST" : "GET"),
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json", "x-connect-csrf": "1" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      setWaking(false);
      break;
    } catch {
      if (attempt >= WAKE_DELAYS.length) {
        setWaking(false);
        throw new ApiError(0, "network");
      }
      setWaking(true);
      await new Promise((r) => setTimeout(r, WAKE_DELAYS[attempt]));
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new ApiError(res.status, data.error ?? "server_error", data.issues), { data });
  return data as T;
}

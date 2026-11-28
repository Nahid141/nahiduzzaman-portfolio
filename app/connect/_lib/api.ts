/* Client for the Private Connect backend. Every authorization decision happens there;
   this file only shapes requests and turns error codes into plain sentences. */

const CONFIGURED_API = process.env.NEXT_PUBLIC_CONNECT_API_URL;
export const CONNECT_API = CONFIGURED_API || "http://localhost:8020";
export const CONNECT_HOME = "https://www.fnunahiduzzaman.com/connect";

/** A reason this page can never reach the backend (wrong deployment or build), or null. */
export function connectConfigProblem(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)) return null;
  if (!CONFIGURED_API) {
    return "This copy of the site was built without the Private Connect server address (NEXT_PUBLIC_CONNECT_API_URL). Set it in Vercel and redeploy.";
  }
  if (host.endsWith(".vercel.app")) {
    return `Private Connect only works at ${CONNECT_HOME}. Preview deployments are not allowed to sign in, by design.`;
  }
  return null;
}

export type ConnectUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  bio: string | null;
  avatarKey: string | null;
  statusEmoji: string | null;
  statusText: string | null;
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
  network: "Cannot reach the Private Connect server. Check your internet connection and try again.",
  request_blocked: `The browser blocked the request to the Private Connect server. Open Private Connect at ${CONNECT_HOME} and turn off extensions that block requests on this site.`,
  timeout: "The Private Connect server did not answer in time. Try again.",
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
  meeting_full: "This meeting is full (15 people). Try again when someone leaves.",
  invalid_youtube_link: "That is not a YouTube video link. Paste a link like https://www.youtube.com/watch?v=…",
  youtube_unavailable: "That video is private, removed or does not allow embedding. Try another one.",
  avatar_too_large: "The photo is still larger than 200 KB after compression. Try a smaller picture.",
  avatar_not_image: "Choose a JPEG, PNG or WebP photo.",
  buzz_cooldown: "You just buzzed them. Wait a few seconds before buzzing again.",
  invalid_target: "You cannot buzz yourself.",
  blocked: "You cannot contact this member.",
  too_many_tasks: "The to-do list is full (500 open items). Finish or delete some first.",
  request_too_soon: "Pick a time at least 30 minutes from now.",
  request_too_far: "Pick a time within the next 120 days.",
  slot_taken: "Another approved meeting overlaps that time.",
  not_pending: "This request has already been decided.",
  not_cancellable: "This request can no longer be cancelled.",
  invalid_range: "Choose a shorter date range.",
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
    // The notice at the top of the page already explains the problem and links to the right address.
    if (err.code === "config") return "Sign-in is not available at this address. Use the link above.";
    if (err.code === "invalid_input" && err.issues?.length) return err.issues.map((i) => i.message).join(" ");
    return MESSAGES[err.code] ?? "Something went wrong. Try again.";
  }
  return MESSAGES.network;
}

/* Network failures are diagnosed instead of all being blamed on a sleeping server:
   - a wrong deployment or build is reported at once (connectConfigProblem);
   - a request that is merely slow shows the "starting" notice after 4 s. Render holds requests to a sleeping
     service until it has started, so a cold start is a slow answer, not an error; the limit is 75 s;
   - a request that fails outright is followed by a cookie-less probe of /health. If the server answers it, the
     browser blocked the real request (an extension, for example): report that. If it does not, the server or
     the connection is down: retry for about 10 s, which is safe because the request never reached the server. */
const SLOW_NOTICE_MS = 4000;
const REQUEST_TIMEOUT_MS = 75_000;
const RETRY_DELAYS = [1000, 3000, 6000];
let slowRequests = 0;
const wakeListeners = new Set<(w: boolean) => void>();
export const onWaking = (fn: (w: boolean) => void) => (wakeListeners.add(fn), () => void wakeListeners.delete(fn));
const bumpSlow = (d: number) => {
  const before = slowRequests > 0;
  slowRequests = Math.max(0, slowRequests + d);
  if (before !== slowRequests > 0) wakeListeners.forEach((fn) => fn(slowRequests > 0));
};

async function serverAnswers(): Promise<boolean> {
  try {
    // A plain CORS request without cookies: it succeeds from an allowed origin whenever the server is up.
    // (A no-cors probe would not work: the API sends Cross-Origin-Resource-Policy: same-origin.)
    const r = await fetch(`${CONNECT_API}/api/v1/health`, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (connectConfigProblem()) throw new ApiError(0, "config");
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    let slow = false;
    const notice = setTimeout(() => ((slow = true), bumpSlow(1)), SLOW_NOTICE_MS);
    try {
      res = await fetch(`${CONNECT_API}/api/v1${path}`, {
        method: init.method ?? (init.body ? "POST" : "GET"),
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json", "x-connect-csrf": "1" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      break;
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") throw new ApiError(0, "timeout");
      if (await serverAnswers()) throw new ApiError(0, "request_blocked");
      if (attempt >= RETRY_DELAYS.length) throw new ApiError(0, "network");
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    } finally {
      clearTimeout(notice);
      if (slow) bumpSlow(-1);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new ApiError(res.status, data.error ?? "server_error", data.issues), { data });
  return data as T;
}

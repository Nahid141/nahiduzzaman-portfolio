"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, buzzMuted, setBuzzMuted } from "../_components/Social";
import { Alert, announceMe, Field, Submit } from "../_components/ui";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";

const AVATAR_MAX = 200 * 1024;
const STATUS_PRESETS = ["☕", "📚", "🧪", "💻", "🎧", "🏃", "🌙", "🎉"];

async function blobFrom(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Square-crops and re-encodes the photo in the browser until it is at most 200 KB (WebP, or JPEG as a fallback). */
async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  let size = Math.min(512, side);
  const canvas = document.createElement("canvas");
  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    for (const q of [0.88, 0.78, 0.66, 0.54, 0.42]) {
      const webp = await blobFrom(canvas, "image/webp", q);
      const blob = webp && webp.type === "image/webp" ? webp : await blobFrom(canvas, "image/jpeg", q);
      if (blob && blob.size <= AVATAR_MAX) {
        bitmap.close();
        return blob;
      }
    }
    size = Math.round(size * 0.8);
  }
  bitmap.close();
  throw new Error("too_large");
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

function Profile({ me }: { me: ConnectUser }) {
  const [fullName, setFullName] = useState(me.fullName);
  const [bio, setBio] = useState(me.bio ?? "");
  const [emoji, setEmoji] = useState(me.statusEmoji ?? "");
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState("");
  const [muted, setMuted] = useState(buzzMuted);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const u = await api<ConnectUser>("/me/profile", { method: "PUT", body: { fullName, bio: bio || null, statusEmoji: emoji || null, statusText: statusText || null } });
      announceMe(u);
      setMsg({ kind: "ok", text: "Profile saved." });
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    }
    setBusy(false);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    try {
      setPhotoBusy("Compressing…");
      const blob = await compressPhoto(file);
      setPhotoBusy(`Uploading ${Math.round(blob.size / 1024)} KB…`);
      const { avatarKey } = await api<{ avatarKey: string }>("/me/avatar", { method: "PUT", body: { data: await toBase64(blob) } });
      announceMe({ ...me, avatarKey });
      setMsg({ kind: "ok", text: `Photo updated (${Math.round(blob.size / 1024)} KB).` });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error && err.message === "too_large" ? "That picture could not be compressed below 200 KB." : errorMessage(err) });
    }
    setPhotoBusy("");
  }

  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-xl font-black text-white">Profile</h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Avatar user={me} size="lg" />
        <div className="space-y-2">
          <label className="inline-block cursor-pointer rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white">
            {photoBusy || (me.avatarKey ? "Change photo" : "Add a photo")}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={Boolean(photoBusy)} onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
          {me.avatarKey && (
            <button
              type="button"
              onClick={() =>
                api("/me/avatar", { method: "DELETE" })
                  .then(() => announceMe({ ...me, avatarKey: null }))
                  .catch((err) => setMsg({ kind: "error", text: errorMessage(err) }))
              }
              className="ml-2 text-sm font-bold text-slate-400 hover:text-rose-300"
            >
              Remove photo
            </button>
          )}
          <p className="text-xs text-slate-500">Cropped to a square and compressed to 200 KB or less on your device before upload.</p>
        </div>
      </div>
      <form onSubmit={save} className="mt-5 space-y-4">
        <Field label="Display name" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
        <div>
          <p className="text-sm font-bold text-slate-200">Status</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {STATUS_PRESETS.map((x) => (
              <button key={x} type="button" aria-pressed={emoji === x} onClick={() => setEmoji(emoji === x ? "" : x)} className={`rounded-full px-2.5 py-1 text-lg ${emoji === x ? "bg-cyan-300/30 ring-2 ring-cyan-300" : "bg-white/5"}`}>
                {x}
              </button>
            ))}
          </div>
          <input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={80} placeholder="What are you up to? (optional)" aria-label="Status message" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white" />
        </div>
        <label className="block">
          <span className="text-sm font-bold text-slate-200">Short bio</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white" />
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => {
              setBuzzMuted(e.target.checked);
              setMuted(e.target.checked);
            }}
          />
          Mute buzz alerts on this device (you still see who buzzed you)
        </label>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Submit busy={busy}>Save profile</Submit>
      </form>
    </section>
  );
}

type SessionRow = { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null };

function Sessions() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const load = useCallback(() => {
    api<SessionRow[]>("/auth/sessions").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function revoke(id: string) {
    await api(`/auth/sessions/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-black text-white">Where you are signed in</h2>
      <ul className="mt-4 space-y-2">
        {rows?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{s.userAgent ?? "Unknown device"}</p>
              <p className="text-xs text-slate-400">
                {s.ip ?? "unknown IP"} · last active {new Date(s.lastSeenAt).toLocaleString()}
              </p>
            </div>
            {s.current ? (
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">This device</span>
            ) : (
              <button type="button" onClick={() => revoke(s.id)} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-rose-300/50 hover:text-rose-200">
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) return setMsg({ kind: "error", text: "The new passwords do not match." });
    setBusy(true);
    try {
      await api("/auth/password/change", { body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
      setMsg({ kind: "ok", text: "Password changed. Your other devices were signed out." });
      form.reset();
    } catch (err) {
      setMsg({ kind: "error", text: errorMessage(err) });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-md space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <Field label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
      <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      <Submit busy={busy}>Change password</Submit>
    </form>
  );
}

export default function Settings() {
  return (
    <Workspace>
      {(me) => (
        <div>
          <h1 className="text-3xl font-black text-white">Profile and account</h1>
          <Profile me={me} />
          <PasswordForm />
          <Sessions />
        </div>
      )}
    </Workspace>
  );
}

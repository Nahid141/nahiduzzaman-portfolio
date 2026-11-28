"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, BuzzButton } from "../_components/Social";
import Workspace from "../_components/Workspace";
import { api, errorMessage } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

type Member = {
  id: string;
  username: string;
  fullName: string;
  bio: string | null;
  role: "admin" | "member";
  online: boolean;
  avatarKey: string | null;
  statusEmoji: string | null;
  statusText: string | null;
};

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      api<Member[]>("/members")
        .then(setMembers)
        .catch((e) => setError(errorMessage(e)));
    void load();
    const s = getSocket();
    s.on("members:changed", load);
    const onPresence = (p: { userId: string; online: boolean }) =>
      setMembers((prev) => prev.map((m) => (m.id === p.userId ? { ...m, online: p.online } : m)));
    s.on("presence:update", onPresence);
    return () => {
      s.off("presence:update", onPresence);
      s.off("members:changed", load);
    };
  }, []);

  async function message(id: string) {
    try {
      const r = await api<{ id: string }>("/conversations", { body: { userId: id } });
      router.push(`/connect/messages?c=${r.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const shown = members.filter((m) => `${m.fullName} ${m.username}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Workspace>
      {(me) => (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Members</p>
              <h1 className="mt-2 text-3xl font-black text-white">
                {members.length} members, {members.filter((m) => m.online).length} online
              </h1>
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a member"
              aria-label="Find a member"
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
            />
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-rose-200">
              {error}
            </p>
          )}
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {shown.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="relative shrink-0">
                  <Avatar user={m} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 ${m.online ? "bg-emerald-400" : "bg-slate-600"}`}
                    aria-label={m.online ? "online" : "offline"}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white">
                    {m.fullName} {m.role === "admin" && <span className="text-xs text-cyan-300">admin</span>}
                  </p>
                  <p className="text-xs text-slate-400">@{m.username}</p>
                  {(m.statusEmoji || m.statusText) && (
                    <p className="mt-1 text-sm text-slate-200">
                      {m.statusEmoji} {m.statusText}
                    </p>
                  )}
                  {m.bio && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{m.bio}</p>}
                </div>
                {m.id !== me.id && (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => message(m.id)}
                      className="rounded-xl bg-cyan-300/15 px-3 py-1.5 text-xs font-black text-cyan-100 hover:bg-cyan-300/25"
                    >
                      Message
                    </button>
                    <BuzzButton userId={m.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Workspace>
  );
}

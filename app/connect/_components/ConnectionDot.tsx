"use client";

import { useConnection } from "../_lib/realtime";

export default function ConnectionDot() {
  const connection = useConnection();
  return (
    <p className="flex items-center gap-2 text-xs font-bold text-slate-400">
      <span
        className={`h-2 w-2 rounded-full ${
          connection === "online" ? "bg-emerald-400" : connection === "connecting" ? "bg-amber-400" : "bg-rose-400"
        }`}
      />
      {connection === "online" ? "Connected" : connection === "connecting" ? "Connecting…" : "Offline, reconnecting…"}
    </p>
  );
}

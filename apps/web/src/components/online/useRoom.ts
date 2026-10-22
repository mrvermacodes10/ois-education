"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RoomClient, type RoomSnapshot } from "@ois/shared";
import { GAME_SERVER_URL } from "@/lib/server";

const safeSession = () => {
  try { const s = window.sessionStorage; s.getItem("x"); return s; } catch { return undefined; }
};

/** One RoomClient for the lifetime of a joined room. Each browser tab is its own player (token in sessionStorage). */
export function useRoom(join: { code: string; name: string } | null) {
  const [client, setClient] = useState<RoomClient | null>(null);
  useEffect(() => {
    if (!join) return;
    const c = new RoomClient({ serverUrl: GAME_SERVER_URL, code: join.code, name: join.name, storage: safeSession() });
    setClient(c);
    return () => { c.stop(); setClient(null); };
  }, [join?.code, join?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = useSyncExternalStore(
    (fn) => (client ? client.subscribe(fn) : () => {}),
    () => client?.snapshot ?? null,
    () => null,
  ) as RoomSnapshot | null;
  return { client, snapshot };
}

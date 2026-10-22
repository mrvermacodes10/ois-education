"use client";
// Stage 2 multiplayer prototype ("sync test"). Not one of the six games: it exists to prove rooms, the synced
// countdown, server-authoritative state and reconnects work between separate devices.
import { useEffect, useRef, useState } from "react";
import { SYNC, type RoomClient, type RoomSnapshot, type StateFrame, type SyncView } from "@ois/shared";
import OnlineLobby from "@/components/online/OnlineLobby";

const COLORS = ["#1e3b2f", "#9b3b2e", "#4f6fa0", "#b07a1e", "#6b4f8f", "#2f7f7a", "#8a5a44", "#5c6b60"];
const INTERP_DELAY_MS = 100; // draw other players slightly in the past, between two server updates

export default function SyncTest() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-[13px] font-medium uppercase tracking-wide text-moss">Developer page · not one of the six games</p>
      <h1 className="mt-1 text-[30px] font-semibold">Multiplayer sync test</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-moss">
        A tiny prototype to check that online rooms really work: open this page on two devices (or two browser windows),
        create a room on one and join with the code on the other. Move with <span className="keycap">WASD</span> or{" "}
        <span className="keycap">Arrows</span>. The server decides every position and coin; first to {SYNC.target} coins wins.
      </p>
      <div className="mt-6"><OnlineLobby game="sync-test" renderMatch={(c, s) => <Arena client={c} snap={s} />} /></div>
    </div>
  );
}

function lerpView(frames: StateFrame[], at: number): SyncView | null {
  if (!frames.length) return null;
  let i = frames.length - 1;
  while (i > 0 && frames[i - 1].serverTime > at) i--;
  const b = frames[i], a = frames[i - 1];
  if (!a || at >= b.serverTime) return b.state as SyncView;
  const t = Math.max(0, Math.min(1, (at - a.serverTime) / (b.serverTime - a.serverTime || 1)));
  const va = a.state as SyncView, vb = b.state as SyncView;
  return { ...vb, players: vb.players.map((p) => { const q = va.players.find((x) => x.id === p.id) ?? p; return { ...p, x: q.x + (p.x - q.x) * t, y: q.y + (p.y - q.y) * t }; }) };
}

function Arena({ client, snap }: { client: RoomClient; snap: RoomSnapshot }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ tick: 0, timeLeft: SYNC.durationMs as number, scores: [] as { name: string; score: number; me: boolean; color: string }[] });
  const playing = snap.lobby?.status === "playing";
  const players = snap.lobby?.players ?? [];
  const playersRef = useRef(players);
  playersRef.current = players;

  // Developer page only: lets the browser tests read what the server sent this tab.
  useEffect(() => { (window as unknown as { __oisRoom: RoomClient }).__oisRoom = client; }, [client]);

  // Keyboard → input messages (only when the direction changes).
  useEffect(() => {
    if (!playing) return;
    const held = new Set<string>();
    let last = "0,0";
    const send = () => {
      const dx = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const dy = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
      const k = `${dx},${dy}`;
      if (k !== last) { last = k; client.sendInput({ dx, dy }); }
    };
    const dir = (e: KeyboardEvent) => ({ KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" } as Record<string, string>)[e.code];
    const down = (e: KeyboardEvent) => { const d = dir(e); if (!d) return; e.preventDefault(); held.add(d); send(); };
    const up = (e: KeyboardEvent) => { const d = dir(e); if (!d) return; held.delete(d); send(); };
    const blur = () => { held.clear(); send(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [client, playing]);

  // Render loop.
  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const cv = canvas.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext("2d")!;
      const s = (w / SYNC.width) * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#fbfaf5"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.strokeStyle = "#e1e7d8"; ctx.lineWidth = 0.15;
      for (let x = 10; x < SYNC.width; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SYNC.height); ctx.stroke(); }
      for (let y = 10; y < SYNC.height; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SYNC.width, y); ctx.stroke(); }
      const view = lerpView(client.frames, client.serverNow() - INTERP_DELAY_MS);
      if (!view) return;
      ctx.fillStyle = "#b07a1e";
      ctx.beginPath(); ctx.arc(view.coin.x, view.coin.y, SYNC.coinRadius, 0, Math.PI * 2); ctx.fill();
      const roster = playersRef.current;
      view.players.forEach((p, i) => {
        if (p.gone) return;
        ctx.globalAlpha = roster.find((r) => r.id === p.id)?.connected === false ? 0.35 : 1;
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.beginPath(); ctx.arc(p.x, p.y, SYNC.radius, 0, Math.PI * 2); ctx.fill();
        if (p.id === snap.you) { ctx.strokeStyle = "#142a21"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, SYNC.radius + 0.9, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });
      if (now - lastHud > 200) {
        lastHud = now;
        const latest = client.frames.at(-1);
        setHud({
          tick: latest?.tick ?? 0,
          timeLeft: (latest?.state as SyncView | undefined)?.timeLeftMs ?? SYNC.durationMs,
          scores: view.players.map((p, i) => ({ name: roster.find((r) => r.id === p.id)?.name ?? "Player", score: p.score, me: p.id === snap.you, color: COLORS[i % COLORS.length] })),
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [client, snap.you]);

  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px]">
        {hud.scores.map((p) => (
          <span key={p.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}{p.me ? " (you)" : ""}: <b data-testid={p.me ? "my-score" : undefined}>{p.score}</b></span>
        ))}
        <span className="ml-auto tabular-nums text-moss">{Math.ceil(hud.timeLeft / 1000)} s left</span>
      </div>
      <canvas ref={canvas} data-testid="arena" className="mx-auto block aspect-[5/3] w-full max-w-[calc((100vh-300px)*5/3)] rounded-xl border border-line" aria-label="Sync test arena" />
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-moss" data-testid="netstats">
        <span>Server tick <span data-testid="tick">{hud.tick}</span></span>
        <span>Round trip {snap.rttMs ?? "–"} ms</span>
        <span>Clock offset {Math.round(client.clockOffset())} ms</span>
        <button className="ml-auto underline underline-offset-2 hover:text-forest" onClick={() => client.dropConnection()}>Simulate a dropped connection</button>
      </div>
    </div>
  );
}

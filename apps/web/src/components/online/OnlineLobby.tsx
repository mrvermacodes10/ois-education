"use client";
// Shared online flow for every multiplayer game: nickname → create or join by code → lobby → countdown → match → results.
// The match itself is drawn by the game via renderMatch. Everything shown here comes from the server.
import { useEffect, useState, type ReactNode } from "react";
import { cleanNickname, createRoom, normalizeRoomCode, type RoomClient, type RoomGame, type RoomSnapshot } from "@ois/shared";
import { GAME_SERVER_URL } from "@/lib/server";
import { useRoom } from "./useRoom";

const btn = "h-10 rounded-full bg-forest px-5 text-[14px] font-medium text-paper transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost = "h-10 rounded-full border border-line bg-card px-4 text-[14px] font-medium transition-colors hover:border-forest disabled:opacity-40";
const input = "h-10 w-full rounded-xl border border-line bg-card px-3 text-[15px] focus:border-forest focus:outline-none";

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export type MatchRender = (client: RoomClient, snap: RoomSnapshot) => ReactNode;

export default function OnlineLobby({ game, renderMatch }: { game: RoomGame; renderMatch: MatchRender }) {
  const [join, setJoin] = useState<{ code: string; name: string } | null>(null);
  const { client, snapshot } = useRoom(join);

  // Remember the room in the URL so a reload (or a shared link) gets back in.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (join) url.searchParams.set("room", join.code); else url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, [join]);

  if (!join || !client || !snapshot) return <JoinForm game={game} onJoin={setJoin} />;
  const leave = () => { client.leave(); setJoin(null); };
  const back = () => { client.stop(); setJoin(null); };

  if (snapshot.error?.fatal) {
    return (
      <Panel>
        <p role="alert" className="text-[16px] font-medium text-alert">{snapshot.error.message}</p>
        <button className={`${btn} mt-4`} onClick={back}>Back</button>
      </Panel>
    );
  }

  const lobby = snapshot.lobby;
  return (
    <div className="space-y-4">
      <ConnectionBar snap={snapshot} />
      {snapshot.error && !snapshot.error.fatal && <p role="status" className="rounded-xl bg-sage-soft px-4 py-2 text-[14px]">{snapshot.error.message}</p>}
      {!lobby ? (
        <Panel><p className="text-moss">Joining room {join.code}…</p></Panel>
      ) : lobby.status === "lobby" ? (
        <LobbyPanel client={client} snap={snapshot} onLeave={leave} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            {renderMatch(client, snapshot)}
            {lobby.status === "countdown" && lobby.startsAt && <Countdown client={client} startsAt={lobby.startsAt} />}
          </div>
          {lobby.status === "ended" && snapshot.results && <Results client={client} snap={snapshot} onLeave={leave} />}
          {lobby.status !== "ended" && (
            <div className="flex items-center justify-between text-[13px] text-moss">
              <span>Room <span className="font-semibold text-forest">{lobby.code}</span> · match {lobby.matchNumber}</span>
              <button className={btnGhost} onClick={leave}>Leave match</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-card p-6">{children}</div>;
}

function JoinForm({ game, onJoin }: { game: RoomGame; onJoin: (j: { code: string; name: string }) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const saved = store.get("ois:nickname") ?? "";
    setName(saved);
    const fromUrl = normalizeRoomCode(new URL(window.location.href).searchParams.get("room") ?? "");
    if (!fromUrl) return;
    setCode(fromUrl);
    // Page reloaded while in a room: this tab still has its seat token, so go straight back in.
    let hasSeat = false;
    try { hasSeat = !!sessionStorage.getItem(`ois:room:${fromUrl}`); } catch { /* storage blocked */ }
    const nick = cleanNickname(saved);
    if (hasSeat && nick) onJoin({ code: fromUrl, name: nick });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nick = cleanNickname(name);
  const go = (c: string) => { if (!nick) return; store.set("ois:nickname", nick); onJoin({ code: c, name: nick }); };
  const create = async () => {
    if (!nick) return setError("Choose a nickname first.");
    setBusy(true); setError(null);
    try { go(await createRoom(GAME_SERVER_URL, game)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const joinCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nick) return setError("Choose a nickname first.");
    const c = normalizeRoomCode(code);
    if (!c) return setError("Room codes look like OIS4K7Q (the OIS part is optional).");
    go(c);
  };

  return (
    <Panel>
      <label className="block text-[14px] font-medium" htmlFor="nick">Nickname</label>
      <input id="nick" className={`${input} mt-2 max-w-xs`} maxLength={16} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neel" autoComplete="nickname" />
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-[15px] font-semibold">Start a room</h3>
          <p className="mt-1 text-[14px] text-moss">You'll get a code to send to friends.</p>
          <button className={`${btn} mt-3`} onClick={create} disabled={busy}>{busy ? "Creating…" : "Create room"}</button>
        </div>
        <form onSubmit={joinCode}>
          <h3 className="text-[15px] font-semibold">Join a room</h3>
          <label htmlFor="code" className="mt-1 block text-[14px] text-moss">Enter the code you were sent.</label>
          <div className="mt-3 flex gap-2">
            <input id="code" className={`${input} max-w-[10rem] uppercase tracking-wider`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="OIS4K7Q" autoComplete="off" spellCheck={false} />
            <button className={btn} type="submit">Join</button>
          </div>
        </form>
      </div>
      {error && <p role="alert" className="mt-4 text-[14px] font-medium text-alert">{error}</p>}
    </Panel>
  );
}

function ConnectionBar({ snap }: { snap: RoomSnapshot }) {
  if (snap.connection === "open") return null;
  const text = snap.connection === "reconnecting" ? "Connection lost. Reconnecting… your seat is kept for a short while." : snap.connection === "closed" ? "Disconnected." : "Connecting…";
  return <p role="status" className="rounded-xl border border-line bg-sage-soft px-4 py-2 text-[14px] font-medium">{text}</p>;
}

function LobbyPanel({ client, snap, onLeave }: { client: RoomClient; snap: RoomSnapshot; onLeave: () => void }) {
  const lobby = snap.lobby!;
  const me = lobby.players.find((p) => p.id === snap.you);
  const isHost = lobby.hostId === snap.you;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? lobby.code : `${window.location.origin}${window.location.pathname}?room=${lobby.code}`;
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch { setCopied("failed"); }
  };
  return (
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-wide text-moss">Room code</p>
          <p data-testid="room-code" className="mt-1 text-[34px] font-semibold leading-none tracking-[0.12em]">{lobby.code}</p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => copy("code")}>{copied === "code" ? "Copied" : "Copy code"}</button>
          <button className={btnGhost} onClick={() => copy("link")}>{copied === "link" ? "Copied" : "Copy link"}</button>
        </div>
      </div>
      <h3 className="mt-6 text-[15px] font-semibold">Players ({lobby.players.length}/{lobby.maxPlayers})</h3>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-paper" data-testid="players">
        {lobby.players.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[15px]">
            <span className="flex items-center gap-2">
              <span aria-hidden className={`h-2 w-2 rounded-full ${p.connected ? "bg-forest" : "bg-line"}`} />
              <span className="font-medium">{p.name}</span>
              {p.id === snap.you && <span className="text-moss">(you)</span>}
              {p.isHost && <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[12px] font-medium">Host</span>}
            </span>
            <span className="text-[14px] text-moss">{!p.connected ? "Reconnecting…" : p.isHost ? "Starts the match" : p.ready ? "Ready" : "Not ready"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {isHost ? (
          <button className={btn} onClick={() => client.start()} disabled={!lobby.canStart}>Start match</button>
        ) : (
          <button className={btn} onClick={() => client.setReady(!me?.ready)}>{me?.ready ? "I'm not ready" : "I'm ready"}</button>
        )}
        <button className={btnGhost} onClick={onLeave}>Leave room</button>
        {lobby.startBlockedReason && <p className="text-[14px] text-moss">{lobby.startBlockedReason}</p>}
      </div>
    </Panel>
  );
}

function Countdown({ client, startsAt }: { client: RoomClient; startsAt: number }) {
  const [left, setLeft] = useState(() => startsAt - client.serverNow());
  useEffect(() => {
    let raf = 0;
    const loop = () => { setLeft(startsAt - client.serverNow()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [client, startsAt]);
  const n = Math.ceil(left / 1000);
  return (
    <div className="absolute inset-0 grid place-items-center rounded-2xl bg-paper/70">
      <p data-testid="countdown" className="text-[72px] font-semibold tabular-nums">{n > 0 ? n : "Go"}</p>
    </div>
  );
}

function Results({ client, snap, onLeave }: { client: RoomClient; snap: RoomSnapshot; onLeave: () => void }) {
  const r = snap.results!;
  const isHost = snap.lobby?.hostId === snap.you;
  const winners = r.ranking.filter((x) => r.winnerIds.includes(x.id)).map((x) => x.name);
  return (
    <Panel>
      <p className="text-[13px] font-medium uppercase tracking-wide text-moss">Match over · {r.reason}</p>
      <h3 data-testid="winner" className="mt-1 text-[24px] font-semibold">{winners.length === 0 ? "No winner" : winners.length === 1 ? `${winners[0]} wins` : `Draw: ${winners.join(", ")}`}</h3>
      <ol className="mt-3 space-y-1 text-[15px]">
        {r.ranking.map((x, i) => <li key={x.id}>{i + 1}. {x.name}{x.id === snap.you ? " (you)" : ""} · {x.score}</li>)}
      </ol>
      <div className="mt-5 flex gap-3">
        {isHost ? <button className={btn} onClick={() => client.rematch()}>Back to lobby for a rematch</button> : <p className="text-[14px] text-moss">Waiting for the host to start a rematch.</p>}
        <button className={btnGhost} onClick={onLeave}>Leave room</button>
      </div>
    </Panel>
  );
}

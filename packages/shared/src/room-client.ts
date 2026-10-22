// Connects to a room and keeps the connection alive. Works in browsers and Node 22 (both have WebSocket).
import { PROTOCOL_VERSION, type ErrorCode, type LobbyView, type MatchResults, type RoomGame, type ServerMsg } from "./protocol";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export type RoomSnapshot = {
  connection: ConnectionState;
  you: string | null;
  lobby: LobbyView | null;
  results: MatchResults | null;
  /** Last fatal error (the client stops reconnecting) or latest non-fatal one. */
  error: { code: ErrorCode; message: string; fatal: boolean } | null;
  /** Round-trip time of the best clock sample, ms. */
  rttMs: number | null;
};

export type StateFrame = { tick: number; serverTime: number; state: unknown; ack: number; receivedAt: number };

type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export type RoomClientOptions = {
  serverUrl: string;
  code: string;
  name: string;
  /** Where the reconnect token is kept (sessionStorage in browsers, so each tab is its own player). */
  storage?: KV;
  WebSocketImpl?: typeof WebSocket;
  /** Delays between reconnect attempts. */
  backoffMs?: number[];
};

export async function createRoom(serverUrl: string, game: RoomGame): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game }) });
  } catch {
    throw new Error("Can't reach the game server. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
  if (!res.ok || !body.code) throw new Error(body.error ?? "Couldn't create a room.");
  return body.code;
}

const memoryStorage = (): KV => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

export class RoomClient {
  snapshot: RoomSnapshot = { connection: "connecting", you: null, lobby: null, results: null, error: null, rttMs: null };
  /** Recent state frames, oldest first, for interpolation. */
  frames: StateFrame[] = [];
  private ws: WebSocket | null = null;
  private seq = 0;
  private attempt = 0;
  private stopped = false;
  private offset = 0;
  private bestRtt = Infinity;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeard = 0;
  private pings = 0;
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(f: StateFrame) => void>();
  private storage: KV;
  private WS: typeof WebSocket;
  private backoff: number[];

  constructor(private o: RoomClientOptions) {
    this.storage = o.storage ?? memoryStorage();
    this.WS = o.WebSocketImpl ?? WebSocket;
    this.backoff = o.backoffMs ?? [300, 1000, 2000, 4000, 8000];
    this.open();
  }

  get code() { return this.o.code; }
  /** Current server time estimated from clock sync. Use it for countdowns so every player sees the same number. */
  serverNow() { return Date.now() + this.offset; }
  /** Clock offset to the server in ms (server − local). */
  clockOffset() { return this.offset; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onFrame(fn: (f: StateFrame) => void) { this.frameListeners.add(fn); return () => this.frameListeners.delete(fn); }

  setReady(ready: boolean) { this.send({ type: "ready", ready }); }
  start() { this.send({ type: "start" }); }
  rematch() { this.send({ type: "rematch" }); }
  sendInput(input: unknown) { this.seq++; this.send({ type: "input", seq: this.seq, input }); return this.seq; }
  /** Leave for good: the seat is released and the token forgotten. */
  leave() {
    this.send({ type: "leave" });
    this.storage.removeItem(this.tokenKey());
    this.stop();
  }
  /** Close without giving up the seat (e.g. the page is being closed; you can come back within the grace period). */
  stop() {
    this.stopped = true;
    this.clearTimers();
    try { this.ws?.close(1000); } catch { /* ignore */ }
    this.update({ connection: "closed" });
  }
  /** Simulate a dropped network (tests / developer page): closes the socket and lets auto-reconnect kick in. */
  dropConnection() { if (this.ws) this.abandon(this.ws); }

  /** Give up on a socket that is stuck or dead and reconnect, without waiting for a close handshake. */
  private abandon(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.clearTimers();
    try { ws.close(1000); } catch { /* ignore */ }
    this.scheduleRetry();
  }

  private tokenKey() { return `ois:room:${this.o.code}`; }

  private open() {
    if (this.stopped) return;
    const url = this.o.serverUrl.replace(/^http/, "ws").replace(/\/$/, "") + `/api/rooms/${encodeURIComponent(this.o.code)}/ws`;
    let ws: WebSocket;
    try { ws = new this.WS(url); } catch { return this.scheduleRetry(); }
    this.ws = ws;
    this.connectTimer = setTimeout(() => { if (ws.readyState !== 1) this.abandon(ws); }, 5000);
    ws.addEventListener("open", () => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.lastHeard = Date.now();
      const token = this.storage.getItem(this.tokenKey()) ?? undefined;
      ws.send(JSON.stringify({ type: "hello", v: PROTOCOL_VERSION, name: this.o.name, token }));
      this.pings = 0;
      this.ping();
    });
    ws.addEventListener("message", (ev: { data: unknown }) => { this.lastHeard = Date.now(); try { this.handle(JSON.parse(String(ev.data)) as ServerMsg); } catch { /* ignore garbage */ } });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.stopped || this.snapshot.error?.fatal) return this.update({ connection: "closed" });
      this.scheduleRetry();
    });
  }

  private scheduleRetry() {
    if (this.stopped) return;
    this.update({ connection: "reconnecting" });
    const delay = this.backoff[Math.min(this.attempt, this.backoff.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private handle(m: ServerMsg) {
    switch (m.type) {
      case "welcome":
        this.attempt = 0;
        this.storage.setItem(this.tokenKey(), m.token);
        this.seq = Math.max(this.seq, m.lastSeq);
        return this.update({ connection: "open", you: m.you, error: null });
      case "lobby":
        if (m.lobby.status === "lobby" || m.lobby.status === "countdown") { if (this.snapshot.results && m.lobby.status === "lobby") this.update({ results: null }); }
        if (m.lobby.status === "countdown") this.frames = [];
        return this.update({ lobby: m.lobby });
      case "state": {
        const f: StateFrame = { tick: m.tick, serverTime: m.serverTime, state: m.state, ack: m.ack, receivedAt: Date.now() };
        this.frames.push(f);
        if (this.frames.length > 40) this.frames.shift();
        for (const fn of this.frameListeners) fn(f);
        return;
      }
      case "ended": return this.update({ results: m.results });
      case "pong": {
        const t1 = Date.now();
        const rtt = t1 - m.t0;
        // Keep the sample with the smallest round trip: it has the least uncertainty.
        if (rtt <= this.bestRtt) { this.bestRtt = rtt; this.offset = m.serverTime - (m.t0 + rtt / 2); this.update({ rttMs: rtt }); }
        return;
      }
      case "error":
        if (m.fatal) { this.stopped = m.code !== "SERVER_ERROR"; if (m.code === "ROOM_NOT_FOUND") this.storage.removeItem(this.tokenKey()); }
        return this.update({ error: { code: m.code, message: m.message, fatal: m.fatal } });
    }
  }

  private ping() {
    if (!this.ws || this.ws.readyState !== 1) return;
    // Nothing heard for 25 s (pings every 10 s): the connection is dead even if the OS hasn't noticed.
    if (Date.now() - this.lastHeard > 25_000) return this.abandon(this.ws);
    this.ws.send(JSON.stringify({ type: "ping", t0: Date.now() }));
    this.pings++;
    // Five quick samples to sync the clock, then a slow heartbeat (also keeps the connection alive).
    this.pingTimer = setTimeout(() => this.ping(), this.pings < 5 ? 250 : 10_000);
  }

  private send(m: object) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }
  private clearTimers() {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.pingTimer = this.retryTimer = this.connectTimer = null;
  }
  private update(p: Partial<RoomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...p };
    for (const fn of this.listeners) fn();
  }
}

// The rules of a room (lobby, ready-up, countdown, match, reconnects), with no Cloudflare code in it.
// The Durable Object in index.ts feeds it socket events and a clock; unit tests feed it fakes.
import {
  cleanNickname, ERROR_TEXT, LIMITS, PROTOCOL_VERSION,
  type ClientMsg, type ErrorCode, type GameFactory, type GameRuntime, type LobbyView,
  type MatchResults, type RoomGame, type RoomStatus, type ServerMsg,
} from "@ois/shared";
import { syncTest } from "@ois/shared";

/** Games that can be hosted online. Only the Stage 2 prototype for now. */
export const ONLINE_GAMES: Partial<Record<RoomGame, GameFactory<any>>> = { "sync-test": syncTest };

export const CLOSE = { LEFT: 1000, ROOM_GONE: 4000, REPLACED: 4001, VERSION: 4002, BAD_NAME: 4003, FULL: 4004, IN_PROGRESS: 4005 } as const;

export type Deps = {
  now(): number;
  randomId(): string;
  send(connId: string, msg: ServerMsg): void;
  close(connId: string, code: number, reason: string): void;
  /** Remember which player a socket belongs to (survives hibernation). */
  bind(connId: string, playerId: string): void;
};

type PlayerRec = { id: string; name: string; token: string; ready: boolean; joinedAt: number; lastSeq: number; disconnectedAt: number | null; gone: boolean };

export type RoomSave = {
  v: 1; code: string; game: RoomGame; createdAt: number; status: RoomStatus; hostId: string | null;
  players: PlayerRec[]; matchNumber: number; startsAt: number | null; matchStartedAt: number | null;
  tick: number; match: unknown | null; results: MatchResults | null; everJoined: boolean; emptySince: number | null;
};

type Conn = { playerId: string | null; tokens: number; refillAt: number; noticeAt: number };

/** Strict shape check: anything that isn't exactly a known message is rejected. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  let m: any;
  try { m = typeof raw === "string" ? JSON.parse(raw) : null; } catch { return null; }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  switch (m.type) {
    case "hello":
      if (typeof m.v !== "number" || typeof m.name !== "string") return null;
      if (m.token !== undefined && (typeof m.token !== "string" || m.token.length > 64)) return null;
      return { type: "hello", v: m.v, name: m.name, token: m.token };
    case "ready": return typeof m.ready === "boolean" ? { type: "ready", ready: m.ready } : null;
    case "start": case "rematch": case "leave": return { type: m.type };
    case "input":
      if (!Number.isInteger(m.seq) || m.seq < 1 || m.seq > 2 ** 31) return null;
      return { type: "input", seq: m.seq, input: m.input };
    case "ping": return Number.isFinite(m.t0) ? { type: "ping", t0: m.t0 } : null;
    default: return null;
  }
}

export class RoomCore {
  private conns = new Map<string, Conn>();
  private game: GameRuntime | null = null;
  private lastTickAt = 0;
  /** Set when something worth saving changed (the Durable Object persists and clears it). */
  dirty = false;

  private constructor(private s: RoomSave, private deps: Deps) {}

  static create(code: string, game: RoomGame, deps: Deps): RoomCore {
    if (!ONLINE_GAMES[game]) throw new Error(`Game ${game} isn't available online`);
    const core = new RoomCore({
      v: 1, code, game, createdAt: deps.now(), status: "lobby", hostId: null, players: [], matchNumber: 0,
      startsAt: null, matchStartedAt: null, tick: 0, match: null, results: null, everJoined: false, emptySince: null,
    }, deps);
    core.dirty = true;
    return core;
  }

  /** Rebuild after hibernation or a server restart. Call attach() for surviving sockets, then reconcile(). */
  static restore(save: RoomSave, deps: Deps): RoomCore {
    const core = new RoomCore(structuredClone(save), deps);
    if (save.match) core.game = ONLINE_GAMES[save.game]!.restore(save.match);
    core.lastTickAt = deps.now();
    return core;
  }
  attach(connId: string, playerId: string | null) { this.conns.set(connId, this.freshConn(playerId)); }
  /** Anyone without a live socket after a restart counts as disconnected from now (grace starts now). */
  reconcile() {
    const now = this.deps.now();
    for (const p of this.active()) {
      if (!this.isConnected(p.id) && p.disconnectedAt === null) { p.disconnectedAt = now; this.game?.onPlayerAway?.(p.id); this.dirty = true; }
    }
    if (this.s.everJoined && !this.active().some((p) => this.isConnected(p.id)) && this.s.emptySince === null) { this.s.emptySince = now; this.dirty = true; }
  }

  get code() { return this.s.code; }
  get status() { return this.s.status; }
  save(): RoomSave { return { ...structuredClone(this.s), match: this.game ? this.game.save() : null }; }

  // ---------------- socket events ----------------
  connect(connId: string) { this.conns.set(connId, this.freshConn(null)); }

  message(connId: string, raw: string | ArrayBuffer) {
    const conn = this.conns.get(connId);
    if (!conn) return;
    const now = this.deps.now();
    // token bucket rate limit
    conn.tokens = Math.min(LIMITS.msgBurst, conn.tokens + ((now - conn.refillAt) / 1000) * LIMITS.msgRate);
    conn.refillAt = now;
    if (conn.tokens < 1) {
      if (now - conn.noticeAt > 1000) { conn.noticeAt = now; this.error(connId, "RATE_LIMITED"); }
      return;
    }
    conn.tokens -= 1;
    if (typeof raw !== "string" || raw.length > LIMITS.maxMessageBytes) return this.error(connId, "BAD_MESSAGE");
    const m = parseClientMsg(raw);
    if (!m) return this.error(connId, "BAD_MESSAGE");

    if (m.type === "ping") return this.deps.send(connId, { type: "pong", t0: m.t0, serverTime: now });
    if (m.type === "hello") return this.hello(connId, conn, m);
    const p = conn.playerId ? this.player(conn.playerId) : undefined;
    if (!p) return this.error(connId, "NOT_JOINED");

    switch (m.type) {
      case "ready":
        if (this.s.status !== "lobby" || p.ready === m.ready) return;
        p.ready = m.ready;
        return this.changed();
      case "start": return this.start(connId, p);
      case "rematch":
        if (p.id !== this.s.hostId) return this.error(connId, "NOT_HOST");
        if (this.s.status !== "ended") return this.error(connId, "CANNOT_START", "The match isn't over yet.");
        this.s.status = "lobby";
        this.s.players = this.s.players.filter((q) => !q.gone);
        for (const q of this.s.players) { q.ready = false; q.lastSeq = 0; }
        this.game = null; this.s.startsAt = null;
        return this.changed();
      case "leave":
        this.conns.delete(connId);
        this.deps.close(connId, CLOSE.LEFT, "Left the room");
        this.drop(p);
        this.checkEmpty(now);
        return this.changed();
      case "input":
        if (this.s.status !== "playing" || !this.game || p.gone || m.seq <= p.lastSeq) return; // late/duplicate/out-of-order
        p.lastSeq = m.seq;
        this.game.onInput(p.id, m.input, now);
        return;
    }
  }

  disconnect(connId: string) {
    const conn = this.conns.get(connId);
    this.conns.delete(connId);
    if (!conn?.playerId) return;
    const p = this.player(conn.playerId);
    if (!p || p.gone || this.isConnected(p.id)) return;
    p.disconnectedAt = this.deps.now();
    if (this.s.status === "playing") this.game?.onPlayerAway?.(p.id);
    this.checkEmpty(p.disconnectedAt);
    this.changed();
  }

  // ---------------- time ----------------
  /** Run timers: countdown → playing, simulation ticks, reconnect grace expiry, match end. */
  advance() {
    const now = this.deps.now();
    if (this.s.status === "countdown" && this.s.startsAt !== null && now >= this.s.startsAt) {
      this.s.status = "playing";
      this.s.matchStartedAt = this.s.startsAt;
      this.lastTickAt = now;
      this.changed();
    }
    if (this.s.status === "playing" && this.game) {
      if (this.game.tickRate > 0) {
        this.game.tick(now - this.lastTickAt, now);
        this.lastTickAt = now;
        this.s.tick++;
        this.broadcastState();
      }
    }
    for (const p of this.active()) {
      if (p.disconnectedAt === null || this.isConnected(p.id)) continue;
      const grace = this.s.status === "lobby" || this.s.status === "ended" ? LIMITS.graceLobbyMs : LIMITS.graceMatchMs;
      if (now - p.disconnectedAt >= grace) { this.drop(p); this.changed(); }
    }
    this.checkMatchEnd(now);
  }

  needsTick() { return this.s.status === "countdown" || (this.s.status === "playing" && (this.game?.tickRate ?? 0) > 0); }
  tickRate() { return this.game?.tickRate || 20; }

  /** Earliest time a timer needs to run (for Durable Object alarms). */
  nextWakeAt(): number {
    const times: number[] = [this.expiresAt()];
    if (this.s.status === "countdown" && this.s.startsAt !== null) times.push(this.s.startsAt);
    for (const p of this.active()) {
      if (p.disconnectedAt === null || this.isConnected(p.id)) continue;
      const grace = this.s.status === "lobby" || this.s.status === "ended" ? LIMITS.graceLobbyMs : LIMITS.graceMatchMs;
      times.push(p.disconnectedAt + grace);
    }
    return Math.min(...times);
  }
  expiresAt(): number {
    if (!this.s.everJoined) return this.s.createdAt + LIMITS.unjoinedRoomTtlMs;
    if (this.s.emptySince !== null) return this.s.emptySince + LIMITS.emptyRoomTtlMs;
    return Infinity;
  }
  isExpired() { return this.deps.now() >= this.expiresAt(); }

  /** Tell everyone the room is gone and close their sockets (before deleting it). */
  closeAll(reason: string) {
    for (const id of [...this.conns.keys()]) {
      this.deps.send(id, { type: "error", code: "ROOM_NOT_FOUND", message: reason, fatal: true });
      this.deps.close(id, CLOSE.ROOM_GONE, reason);
    }
    this.conns.clear();
  }

  // ---------------- internals ----------------
  private hello(connId: string, conn: Conn, m: Extract<ClientMsg, { type: "hello" }>) {
    const now = this.deps.now();
    if (m.v !== PROTOCOL_VERSION) return this.fatal(connId, "VERSION_MISMATCH", CLOSE.VERSION);
    if (conn.playerId) return this.welcome(connId, this.player(conn.playerId)!); // repeated hello: harmless

    let p = m.token ? this.active().find((q) => q.token === m.token) : undefined;
    if (p) {
      // Reconnect: take over the seat. Any older socket for this player is closed.
      for (const [id, c] of this.conns) {
        if (id !== connId && c.playerId === p.id) { this.conns.delete(id); this.deps.close(id, CLOSE.REPLACED, "Opened somewhere else"); }
      }
      if (p.disconnectedAt !== null && this.s.status === "playing") { /* back in time: game resumes their input */ }
      p.disconnectedAt = null;
    } else {
      const name = cleanNickname(m.name);
      if (!name) return this.fatal(connId, "BAD_NAME", CLOSE.BAD_NAME);
      if (this.s.status !== "lobby" && this.s.status !== "ended") return this.fatal(connId, "MATCH_IN_PROGRESS", CLOSE.IN_PROGRESS);
      const factory = ONLINE_GAMES[this.s.game]!;
      if (this.active().length >= factory.maxPlayers) return this.fatal(connId, "ROOM_FULL", CLOSE.FULL);
      p = { id: this.deps.randomId().slice(0, 12), name: this.uniqueName(name), token: this.deps.randomId(), ready: false, joinedAt: now, lastSeq: 0, disconnectedAt: null, gone: false };
      this.s.players.push(p);
      this.s.everJoined = true;
      if (!this.s.hostId || !this.player(this.s.hostId)) this.s.hostId = p.id;
    }
    conn.playerId = p.id;
    this.deps.bind(connId, p.id);
    this.s.emptySince = null;
    this.welcome(connId, p);
    this.changed();
    if ((this.s.status === "playing" || this.s.status === "countdown") && this.game) this.sendState(connId, p);
    if (this.s.status === "ended" && this.s.results) this.deps.send(connId, { type: "ended", results: this.s.results, serverTime: now });
  }

  private welcome(connId: string, p: PlayerRec) {
    this.deps.send(connId, { type: "welcome", you: p.id, token: p.token, serverTime: this.deps.now(), lastSeq: p.lastSeq });
  }

  private start(connId: string, p: PlayerRec) {
    if (p.id !== this.s.hostId) return this.error(connId, "NOT_HOST");
    const lobby = this.lobbyView();
    if (!lobby.canStart) return this.error(connId, "CANNOT_START", lobby.startBlockedReason);
    const now = this.deps.now();
    const players = this.active();
    for (const q of players) q.lastSeq = 0;
    this.s.status = "countdown";
    this.s.startsAt = now + LIMITS.countdownMs;
    this.s.matchNumber++;
    this.s.tick = 0;
    this.s.results = null;
    const seed = parseInt(this.deps.randomId().slice(0, 8), 16) | 0;
    this.game = ONLINE_GAMES[this.s.game]!.create(players.map(({ id, name }) => ({ id, name })), seed, now);
    this.changed();
    this.broadcastState();
  }

  /** Remove a player for good: from the lobby, or marked "gone" during a match. */
  private drop(p: PlayerRec) {
    if (this.s.status === "lobby" || this.s.status === "ended") this.s.players = this.s.players.filter((q) => q.id !== p.id);
    else { p.gone = true; p.ready = false; this.game?.onPlayerGone(p.id); }
    if (this.s.hostId === p.id) {
      const next = this.active().find((q) => this.isConnected(q.id)) ?? this.active()[0];
      this.s.hostId = next?.id ?? null;
    }
  }

  private checkMatchEnd(now: number) {
    if ((this.s.status !== "playing" && this.s.status !== "countdown") || !this.game) return;
    let r = this.game.result();
    if (!r && this.active().length === 0) r = { winnerIds: [], ranking: [], reason: "Everyone left" };
    if (!r) return;
    const nameOf = (id: string) => this.player(id)?.name ?? "Player";
    this.s.results = {
      winnerIds: r.winnerIds,
      ranking: r.ranking.map((x) => ({ ...x, name: nameOf(x.id) })),
      durationMs: Math.max(0, now - (this.s.matchStartedAt ?? now)),
      reason: r.reason,
    };
    this.broadcastState();
    this.s.status = "ended";
    this.game = null;
    for (const q of this.s.players) q.ready = false;
    this.broadcast({ type: "ended", results: this.s.results, serverTime: now });
    this.changed();
  }

  private checkEmpty(now: number) {
    if (!this.active().some((q) => this.isConnected(q.id))) this.s.emptySince ??= now;
  }

  lobbyView(): LobbyView {
    const factory = ONLINE_GAMES[this.s.game]!;
    const active = this.active();
    let reason: string | undefined;
    if (this.s.status === "countdown" || this.s.status === "playing") reason = "The match is already running.";
    else if (this.s.status === "ended") reason = "Start a rematch first.";
    else if (active.length < factory.minPlayers) reason = `Need at least ${factory.minPlayers} players (${active.length} here).`;
    else {
      const away = active.filter((q) => !this.isConnected(q.id));
      const notReady = active.filter((q) => q.id !== this.s.hostId && !q.ready);
      if (away.length) reason = `Waiting for ${away.map((q) => q.name).join(", ")} to reconnect.`;
      else if (notReady.length) reason = `Waiting for ${notReady.map((q) => q.name).join(", ")} to get ready.`;
    }
    return {
      code: this.s.code, game: this.s.game, status: this.s.status, hostId: this.s.hostId ?? "",
      players: active.map((q) => ({ id: q.id, name: q.name, ready: q.ready, connected: this.isConnected(q.id), isHost: q.id === this.s.hostId })),
      minPlayers: factory.minPlayers, maxPlayers: factory.maxPlayers,
      startsAt: this.s.startsAt ?? undefined, matchNumber: this.s.matchNumber,
      canStart: reason === undefined, startBlockedReason: reason,
    };
  }

  private changed() {
    this.dirty = true;
    const msg: ServerMsg = { type: "lobby", lobby: this.lobbyView(), serverTime: this.deps.now() };
    this.broadcast(msg);
  }
  private broadcast(msg: ServerMsg) {
    for (const [id, c] of this.conns) if (c.playerId) this.deps.send(id, msg);
  }
  private broadcastState() {
    for (const [id, c] of this.conns) {
      const p = c.playerId ? this.player(c.playerId) : undefined;
      if (p) this.sendState(id, p);
    }
  }
  private sendState(connId: string, p: PlayerRec) {
    if (!this.game) return;
    this.deps.send(connId, { type: "state", tick: this.s.tick, serverTime: this.deps.now(), state: this.game.viewFor(p.id), ack: p.lastSeq });
  }
  private error(connId: string, code: ErrorCode, message = ERROR_TEXT[code]) {
    this.deps.send(connId, { type: "error", code, message, fatal: false });
  }
  private fatal(connId: string, code: ErrorCode, closeCode: number) {
    this.deps.send(connId, { type: "error", code, message: ERROR_TEXT[code], fatal: true });
    this.conns.delete(connId);
    this.deps.close(connId, closeCode, code);
  }
  private freshConn(playerId: string | null): Conn { const now = this.deps.now(); return { playerId, tokens: LIMITS.msgBurst, refillAt: now, noticeAt: 0 }; }
  private player(id: string) { return this.s.players.find((q) => q.id === id); }
  private active() { return this.s.players.filter((q) => !q.gone); }
  private isConnected(playerId: string) { for (const c of this.conns.values()) if (c.playerId === playerId) return true; return false; }
  private uniqueName(name: string) {
    const taken = new Set(this.active().map((q) => q.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) { const n = `${name.slice(0, 13)} ${i}`; if (!taken.has(n.toLowerCase())) return n; }
  }
}

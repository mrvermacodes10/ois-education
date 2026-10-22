// OIS Education room server: a Cloudflare Worker that routes each room code to its own Durable Object.
//   POST /api/rooms            {game}  → {code}      create a room
//   GET  /api/rooms/:code/ws           → WebSocket   join a room
//   GET  /api/health                   → {ok}
import { DurableObject } from "cloudflare:workers";
import { normalizeRoomCode, ROOM_CODE_ALPHABET, type RoomGame, type ServerMsg } from "@ois/shared";
import { CLOSE, ONLINE_GAMES, RoomCore, type RoomSave } from "./room-core";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** Comma-separated list of web origins allowed to use the server (the Vercel site, localhost). */
  ALLOWED_ORIGINS: string;
}

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const SAVE_EVERY_MS = 5_000; // match snapshots during play (fewer storage writes on the free plan)

function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(4));
  return "OIS" + [...r].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

function originAllowed(req: Request, env: Env) {
  const origin = req.headers.get("Origin");
  if (!origin) return true; // non-browser clients (tests); browsers always send Origin
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean).includes(origin);
}
function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin || !originAllowed(req, env)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}
const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: originAllowed(req, env) ? 204 : 403, headers: h });
    if (!originAllowed(req, env)) return json({ error: "This website isn't allowed to use the game server." }, 403);

    if (url.pathname === "/api/health") return json({ ok: true }, 200, h);

    if (url.pathname === "/api/rooms" && req.method === "POST") {
      let game: RoomGame;
      try { game = ((await req.json()) as { game: RoomGame }).game; } catch { return json({ error: "Bad request" }, 400, h); }
      if (!ONLINE_GAMES[game]) return json({ error: "That game can't be played online yet." }, 400, h);
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = newCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch("https://room/create", { method: "POST", body: JSON.stringify({ code, game }) });
        if (res.status === 201) return json({ code }, 201, h);
        if (res.status !== 409) return json({ error: "Couldn't create a room." }, 500, h);
      }
      return json({ error: "Couldn't create a room. Try again." }, 503, h);
    }

    const m = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (m && req.method === "GET") {
      if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "Expected a WebSocket" }, 426, h);
      const code = normalizeRoomCode(decodeURIComponent(m[1]));
      if (!code) return notFoundSocket();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(new Request("https://room/ws", req));
    }
    return json({ error: "Not found" }, 404, h);
  },
} satisfies ExportedHandler<Env>;

/** Accept the socket just long enough to say why, so the browser can show a clear message. */
function notFoundSocket() {
  const pair = new WebSocketPair();
  pair[1].accept();
  const msg: ServerMsg = { type: "error", code: "ROOM_NOT_FOUND", message: "There's no room with that code. Check the code, or the room may have expired.", fatal: true };
  pair[1].send(JSON.stringify(msg));
  pair[1].close(CLOSE.ROOM_GONE, "ROOM_NOT_FOUND");
  return new Response(null, { status: 101, webSocket: pair[0] });
}

type Attachment = { connId: string; playerId: string | null };

export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private sockets = new Map<string, WebSocket>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastSave = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Runs on first use, after hibernation and after a restart: reload the room and re-attach live sockets.
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomSave>("room");
      if (!saved) return;
      this.core = RoomCore.restore(saved, this.deps());
      for (const ws of ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment | null;
        if (!a) continue;
        this.sockets.set(a.connId, ws);
        this.core.attach(a.connId, a.playerId);
      }
      this.core.reconcile();
      await this.after();
    });
  }

  private deps() {
    return {
      now: () => Date.now(),
      randomId: () => hex(16),
      send: (connId: string, msg: ServerMsg) => { try { this.sockets.get(connId)?.send(JSON.stringify(msg)); } catch { /* socket already closing */ } },
      close: (connId: string, code: number, reason: string) => {
        const ws = this.sockets.get(connId);
        this.sockets.delete(connId);
        try { ws?.close(code, reason); } catch { /* already closed */ }
      },
      bind: (connId: string, playerId: string) => {
        const ws = this.sockets.get(connId);
        ws?.serializeAttachment({ connId, playerId } satisfies Attachment);
      },
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/create" && req.method === "POST") {
      if (this.core) return new Response("exists", { status: 409 });
      const { code, game } = (await req.json()) as { code: string; game: RoomGame };
      this.core = RoomCore.create(code, game, this.deps());
      await this.after();
      return new Response("created", { status: 201 });
    }
    if (url.pathname === "/ws") {
      if (!this.core) return notFoundSocket();
      const pair = new WebSocketPair();
      const connId = hex(8);
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ connId, playerId: null } satisfies Attachment);
      this.sockets.set(connId, pair[1]);
      this.core.connect(connId);
      await this.after();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a || !this.core) return;
    this.core.message(a.connId, msg);
    await this.after();
  }
  async webSocketClose(ws: WebSocket) {
    try { ws.close(1000, "bye"); } catch { /* already closed */ } // complete the closing handshake
    await this.gone(ws);
  }
  async webSocketError(ws: WebSocket) { await this.gone(ws); }
  private async gone(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a) return;
    this.sockets.delete(a.connId);
    this.core?.disconnect(a.connId);
    await this.after();
  }

  async alarm() {
    if (!this.core) return;
    this.core.advance();
    await this.after();
  }

  private tick = () => {
    if (!this.core) return;
    this.core.advance();
    // During a match, save a snapshot every few seconds so a restart can resume it.
    if (this.core.dirty || Date.now() - this.lastSave >= SAVE_EVERY_MS) void this.after();
    else this.syncLoop();
  };

  /** After every event: expire, persist, and set up the tick loop and the next alarm. */
  private async after() {
    const core = this.core;
    if (!core) return;
    if (core.isExpired()) {
      core.closeAll("This room has expired.");
      this.stopLoop();
      this.core = null;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    if (core.dirty || (core.needsTick() && Date.now() - this.lastSave >= SAVE_EVERY_MS)) {
      core.dirty = false;
      this.lastSave = Date.now();
      await this.ctx.storage.put("room", core.save());
    }
    this.syncLoop();
    const wake = core.nextWakeAt();
    if (Number.isFinite(wake)) await this.ctx.storage.setAlarm(Math.max(wake, Date.now() + 50));
    else await this.ctx.storage.deleteAlarm();
  }

  private syncLoop() {
    if (this.core?.needsTick()) {
      if (!this.loop) this.loop = setInterval(this.tick, Math.round(1000 / this.core.tickRate()));
    } else this.stopLoop();
  }
  private stopLoop() { if (this.loop) { clearInterval(this.loop); this.loop = null; } }
}

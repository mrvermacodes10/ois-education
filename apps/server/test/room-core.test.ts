import { describe, expect, test } from "vitest";
import { LIMITS, PROTOCOL_VERSION, SYNC, type ServerMsg } from "@ois/shared";
import { CLOSE, parseClientMsg, RoomCore, type Deps } from "../src/room-core";

/** A fake transport: a manual clock and an inbox per connection. */
function harness() {
  let t = 1_000_000;
  let n = 0;
  const inbox = new Map<string, ServerMsg[]>();
  const closed = new Map<string, number>();
  const deps: Deps = {
    now: () => t,
    randomId: () => (++n).toString(16).padEnd(32, "0"),
    send: (c, m) => inbox.get(c)?.push(structuredClone(m)),
    close: (c, code) => closed.set(c, code),
    bind: () => {},
  };
  const core = RoomCore.create("OISTEST", "sync-test", deps);
  let connN = 0;
  const open = (r: RoomCore = core) => { const id = `c${++connN}`; inbox.set(id, []); r.connect(id); return id; };
  const send = (c: string, m: object, r: RoomCore = core) => r.message(c, JSON.stringify(m));
  const hello = (c: string, name: string, token?: string, r: RoomCore = core) => send(c, { type: "hello", v: PROTOCOL_VERSION, name, token }, r);
  const last = <T extends ServerMsg["type"]>(c: string, type: T) =>
    [...(inbox.get(c) ?? [])].reverse().find((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined;
  const advance = (ms: number, step = 50, r: RoomCore = core) => { for (let s = 0; s < ms; s += step) { t += step; r.advance(); } };
  return { core, deps, open, send, hello, last, advance, inbox, closed, setTime: (v: number) => (t = v), now: () => t };
}

function twoPlayers() {
  const h = harness();
  const a = h.open(); h.hello(a, "Ana");
  const b = h.open(); h.hello(b, "Ben");
  return { ...h, a, b };
}

describe("message validation", () => {
  test("rejects malformed and unknown messages", () => {
    for (const bad of ["", "nope", "[]", "null", '{"type":"hack"}', '{"type":"ready","ready":"yes"}', '{"type":"input","seq":0}', '{"type":"input","seq":1.5}', '{"type":"hello","v":1}'])
      expect(parseClientMsg(bad)).toBeNull();
    expect(parseClientMsg('{"type":"input","seq":3,"input":{"dx":1,"dy":0}}')).toEqual({ type: "input", seq: 3, input: { dx: 1, dy: 0 } });
  });
  test("bad JSON, oversized and pre-join messages get errors but don't crash the room", () => {
    const h = harness();
    const c = h.open();
    h.core.message(c, "{{{");
    expect(h.last(c, "error")?.code).toBe("BAD_MESSAGE");
    h.core.message(c, "x".repeat(LIMITS.maxMessageBytes + 1));
    expect(h.last(c, "error")?.code).toBe("BAD_MESSAGE");
    h.send(c, { type: "start" });
    expect(h.last(c, "error")?.code).toBe("NOT_JOINED");
    h.send(c, { type: "ping", t0: 5 });
    expect(h.last(c, "pong")?.t0).toBe(5);
  });
  test("old clients are told to refresh", () => {
    const h = harness();
    const c = h.open();
    h.send(c, { type: "hello", v: 999, name: "Old" });
    expect(h.last(c, "error")).toMatchObject({ code: "VERSION_MISMATCH", fatal: true });
    expect(h.closed.get(c)).toBe(CLOSE.VERSION);
  });
  test("empty nicknames are refused", () => {
    const h = harness();
    const c = h.open();
    h.hello(c, "   ");
    expect(h.last(c, "error")?.code).toBe("BAD_NAME");
  });
  test("message flooding is rate limited", () => {
    const h = harness();
    const c = h.open(); h.hello(c, "Spam");
    for (let i = 0; i < LIMITS.msgBurst + 20; i++) h.send(c, { type: "ping", t0: i });
    expect(h.inbox.get(c)!.filter((m) => m.type === "pong").length).toBeLessThanOrEqual(LIMITS.msgBurst);
    expect(h.last(c, "error")?.code).toBe("RATE_LIMITED");
  });
});

describe("lobby", () => {
  test("first player is host; everyone sees the same lobby; duplicate names get a number", () => {
    const h = twoPlayers();
    const c = h.open(); h.hello(c, "ana");
    const views = [h.a, h.b, c].map((x) => h.last(x, "lobby")!.lobby);
    expect(views[0]).toEqual(views[1]);
    expect(views[1]).toEqual(views[2]);
    expect(views[0].players.map((p) => p.name)).toEqual(["Ana", "Ben", "ana 2"]);
    expect(views[0].players[0].isHost).toBe(true);
  });
  test("only the host can start, and only once others are ready", () => {
    const h = twoPlayers();
    expect(h.last(h.a, "lobby")!.lobby.canStart).toBe(false);
    expect(h.last(h.a, "lobby")!.lobby.startBlockedReason).toMatch(/Ben/);
    h.send(h.a, { type: "start" });
    expect(h.last(h.a, "error")?.code).toBe("CANNOT_START");
    h.send(h.b, { type: "ready", ready: true });
    h.send(h.b, { type: "start" });
    expect(h.last(h.b, "error")?.code).toBe("NOT_HOST");
    h.send(h.a, { type: "start" });
    expect(h.core.status).toBe("countdown");
  });
  test("a single player can't start a 2-player game", () => {
    const h = harness();
    const a = h.open(); h.hello(a, "Solo");
    expect(h.last(a, "lobby")!.lobby.startBlockedReason).toMatch(/at least 2/);
  });
  test("room full", () => {
    const h = harness();
    for (let i = 0; i < 8; i++) { const c = h.open(); h.hello(c, `P${i}`); }
    const extra = h.open(); h.hello(extra, "Late");
    expect(h.last(extra, "error")?.code).toBe("ROOM_FULL");
  });
  test("host leaving hands the room to the next player", () => {
    const h = twoPlayers();
    h.send(h.a, { type: "leave" });
    const lobby = h.last(h.b, "lobby")!.lobby;
    expect(lobby.players.map((p) => p.name)).toEqual(["Ben"]);
    expect(lobby.hostId).toBe(lobby.players[0].id);
  });
});

describe("countdown and match", () => {
  function started() {
    const h = twoPlayers();
    h.send(h.b, { type: "ready", ready: true });
    h.send(h.a, { type: "start" });
    return h;
  }
  test("both players get the same start time, 3 s ahead, and the match starts then", () => {
    const h = started();
    const sa = h.last(h.a, "lobby")!.lobby.startsAt!;
    expect(sa).toBe(h.last(h.b, "lobby")!.lobby.startsAt);
    expect(sa - h.now()).toBe(LIMITS.countdownMs);
    h.advance(LIMITS.countdownMs - 100);
    expect(h.core.status).toBe("countdown");
    h.advance(150);
    expect(h.core.status).toBe("playing");
  });
  test("joining mid-match is refused", () => {
    const h = started();
    const c = h.open(); h.hello(c, "Late");
    expect(h.last(c, "error")?.code).toBe("MATCH_IN_PROGRESS");
  });
  test("server moves players from inputs; both clients receive identical world state", () => {
    const h = started();
    h.advance(LIMITS.countdownMs + 50);
    h.send(h.a, { type: "input", seq: 1, input: { dx: 1, dy: 0 } });
    h.advance(1000);
    const sa = h.last(h.a, "state")!, sb = h.last(h.b, "state")!;
    expect(sa.state).toEqual(sb.state);
    expect(sa.tick).toBe(sb.tick);
    expect(sa.ack).toBe(1);
    const me = (sa.state as any).players[0];
    expect(me.x).toBeGreaterThan(SYNC.width / 3 + SYNC.speed * 0.9);
  });
  test("illegal, duplicate and out-of-order inputs are ignored", () => {
    const h = started();
    h.advance(LIMITS.countdownMs + 50);
    h.send(h.a, { type: "input", seq: 5, input: { dx: 1, dy: 0 } });
    h.send(h.a, { type: "input", seq: 4, input: { dx: -1, dy: 0 } }); // older: ignored
    h.send(h.a, { type: "input", seq: 6, input: { dx: 50, dy: 0 } }); // speed hack: ignored by the game
    h.advance(500);
    const p = (h.last(h.a, "state")!.state as any).players[0];
    expect(p.x).toBeCloseTo(SYNC.width / 3 + SYNC.speed * 0.5, 0);
  });
  test("match ends at the time limit with results for everyone; host can rematch", () => {
    const h = started();
    h.advance(LIMITS.countdownMs + SYNC.durationMs + 200, 100);
    expect(h.core.status).toBe("ended");
    expect(h.last(h.a, "ended")!.results).toEqual(h.last(h.b, "ended")!.results);
    expect(h.last(h.a, "ended")!.results.reason).toBe("Time's up");
    h.send(h.a, { type: "rematch" });
    expect(h.core.status).toBe("lobby");
    expect(h.last(h.b, "lobby")!.lobby.matchNumber).toBe(1);
  });
});

describe("disconnects and reconnects", () => {
  test("reconnecting with the token keeps the seat, name and host role", () => {
    const h = twoPlayers();
    const token = h.last(h.a, "welcome")!.token;
    const id = h.last(h.a, "welcome")!.you;
    h.core.disconnect(h.a);
    expect(h.last(h.b, "lobby")!.lobby.players[0].connected).toBe(false);
    h.advance(LIMITS.graceLobbyMs - 1000, 1000);
    const a2 = h.open(); h.hello(a2, "whatever", token);
    expect(h.last(a2, "welcome")!.you).toBe(id);
    const lobby = h.last(h.b, "lobby")!.lobby;
    expect(lobby.players[0]).toMatchObject({ name: "Ana", connected: true, isHost: true });
  });
  test("after the grace period the seat is released and the host moves", () => {
    const h = twoPlayers();
    h.core.disconnect(h.a);
    h.advance(LIMITS.graceLobbyMs + 100, 1000);
    const lobby = h.last(h.b, "lobby")!.lobby;
    expect(lobby.players.map((p) => p.name)).toEqual(["Ben"]);
    expect(lobby.players[0].isHost).toBe(true);
  });
  test("a disconnect mid-match pauses that player; reconnecting gets the live state and input seq", () => {
    const h = twoPlayers();
    h.send(h.b, { type: "ready", ready: true });
    h.send(h.a, { type: "start" });
    h.advance(LIMITS.countdownMs + 50);
    const token = h.last(h.b, "welcome")!.token;
    h.send(h.b, { type: "input", seq: 1, input: { dx: 0, dy: 1 } });
    h.advance(200);
    h.core.disconnect(h.b);
    const y = (h.last(h.a, "state")!.state as any).players[1].y;
    h.advance(1000);
    expect((h.last(h.a, "state")!.state as any).players[1].y).toBe(y); // stopped while away
    const b2 = h.open(); h.hello(b2, "Ben", token);
    expect(h.last(b2, "welcome")!.lastSeq).toBe(1);
    expect(h.last(b2, "state")).toBeDefined();
    expect(h.core.status).toBe("playing");
  });
  test("a second tab with the same token replaces the first", () => {
    const h = twoPlayers();
    const token = h.last(h.a, "welcome")!.token;
    const a2 = h.open(); h.hello(a2, "Ana", token);
    expect(h.closed.get(h.a)).toBe(CLOSE.REPLACED);
    expect(h.last(a2, "lobby")!.lobby.players).toHaveLength(2);
  });
});

describe("persistence and expiry", () => {
  test("a match survives a restart from its saved snapshot", () => {
    const h = twoPlayers();
    h.send(h.b, { type: "ready", ready: true });
    h.send(h.a, { type: "start" });
    h.advance(LIMITS.countdownMs + 50);
    h.send(h.a, { type: "input", seq: 1, input: { dx: 1, dy: 0 } });
    h.advance(1000);
    const before = h.last(h.a, "state")!.state as any;
    const tokenA = h.last(h.a, "welcome")!.token;
    const saved = JSON.parse(JSON.stringify(h.core.save())); // as written to storage

    // "restart": a fresh core from storage with no sockets
    const r = RoomCore.restore(saved, h.deps);
    r.reconcile();
    const a2 = h.open(r); h.hello(a2, "Ana", tokenA, r);
    expect(r.status).toBe("playing");
    const after = h.last(a2, "state")!.state as any;
    expect(after.players[0].x).toBeCloseTo(before.players[0].x, 5);
    expect(after.players.map((p: any) => p.score)).toEqual(before.players.map((p: any) => p.score));
  });
  test("a room nobody joins expires; an emptied room expires 15 minutes later", () => {
    const h = harness();
    expect(h.core.isExpired()).toBe(false);
    h.setTime(h.now() + LIMITS.unjoinedRoomTtlMs);
    expect(h.core.isExpired()).toBe(true);

    const h2 = twoPlayers();
    h2.core.disconnect(h2.a); h2.core.disconnect(h2.b);
    h2.advance(LIMITS.emptyRoomTtlMs - 1000, 1000);
    expect(h2.core.isExpired()).toBe(false);
    h2.advance(2000, 1000);
    expect(h2.core.isExpired()).toBe(true);
  });
});

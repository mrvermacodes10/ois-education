// Integration tests: the real Worker + Durable Object code running in Cloudflare's local runtime (workerd via
// `wrangler dev`), with players as separate OS processes talking over real WebSockets.
// This is local, not the deployed server. The deployed test is a separate step.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createRoom, LIMITS, PROTOCOL_VERSION, RoomClient, type ServerMsg } from "@ois/shared";

const PORT = 8790;
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const persist = mkdtempSync(join(tmpdir(), "ois-rooms-"));
let server: ChildProcess | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist, "--log-level", "warn"], {
    cwd: join(__dirname, ".."), env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  server.stderr?.on("data", () => {});
  server.stdout?.on("data", () => {});
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${HTTP}/api/health`)).ok) return; } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("wrangler dev didn't start");
}
async function stopServer() {
  if (!server?.pid) return;
  try { process.kill(-server.pid, "SIGKILL"); } catch { /* gone */ }
  server = null;
  for (let i = 0; i < 40; i++) { try { await fetch(`${HTTP}/api/health`); await sleep(100); } catch { return; } }
}

/** A player in its own Node process. */
function spawnPlayer(code: string) {
  const proc = spawn(process.execPath, [join(__dirname, "player.mjs"), `${WS}/api/rooms/${code}/ws`], { stdio: ["pipe", "pipe", "inherit"] });
  const msgs: any[] = [];
  const waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  let buf = "";
  proc.stdout!.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      msgs.push(m);
      for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
    }
  });
  const p = {
    pid: () => proc.pid,
    msgs,
    send: (m: object) => proc.stdin!.write(JSON.stringify(m) + "\n"),
    raw: (line: string) => proc.stdin!.write(line + "\n"),
    close: () => proc.stdin!.write("CLOSE\n"),
    kill: () => proc.kill("SIGKILL"),
    last: (type: string) => [...msgs].reverse().find((m) => m.type === type),
    waitFor: (pred: (m: any) => boolean, ms = 10_000): Promise<any> => {
      const hit = msgs.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => { if (waiters.includes(w)) reject(new Error(`timeout waiting; last: ${JSON.stringify(msgs.slice(-3))}`)); }, ms);
      });
    },
    hello: async (name: string, token?: string) => {
      await p.waitFor((m) => m.type === "_open");
      p.send({ type: "hello", v: PROTOCOL_VERSION, name, token });
      return p.waitFor((m) => m.type === "welcome" || (m.type === "error" && m.fatal));
    },
  };
  return p;
}
const lobbyWhere = (pred: (l: any) => boolean) => (m: any) => m.type === "lobby" && pred(m.lobby);

beforeAll(startServer);
afterAll(stopServer);

describe("rooms over real WebSockets (local Cloudflare runtime)", () => {
  test("health and room creation", async () => {
    expect((await fetch(`${HTTP}/api/health`)).status).toBe(200);
    const code = await createRoom(HTTP, "sync-test");
    expect(code).toMatch(/^OIS[2-9A-Z]{4}$/);
    await expect(createRoom(HTTP, "poker")).rejects.toThrow(/can't be played online yet/);
  });

  test("two separate processes: same lobby, same countdown, same server state", async () => {
    const code = await createRoom(HTTP, "sync-test");
    const a = spawnPlayer(code), b = spawnPlayer(code);
    expect(a.pid()).not.toBe(b.pid());
    const wa = await a.hello("Ana"), wb = await b.hello("Ben");
    expect(wa.you).not.toBe(wb.you);
    await a.waitFor(lobbyWhere((l) => l.players.length === 2));
    await b.waitFor(lobbyWhere((l) => l.players.length === 2));
    expect(a.last("lobby").lobby.players).toEqual(b.last("lobby").lobby.players);

    b.send({ type: "ready", ready: true });
    await a.waitFor(lobbyWhere((l) => l.canStart));
    a.send({ type: "start" });
    const ca = await a.waitFor(lobbyWhere((l) => l.status === "countdown"));
    const cb = await b.waitFor(lobbyWhere((l) => l.status === "countdown"));
    expect(ca.lobby.startsAt).toBe(cb.lobby.startsAt);
    expect(ca.lobby.startsAt - ca.serverTime).toBe(LIMITS.countdownMs);

    await a.waitFor(lobbyWhere((l) => l.status === "playing"), 6000);
    a.send({ type: "input", seq: 1, input: { dx: 1, dy: 0 } });
    b.send({ type: "input", seq: 1, input: { dx: 0, dy: -1 } });
    await sleep(1200);
    // Pick a tick both processes received and compare the world they were sent.
    const ticksA = new Map(a.msgs.filter((m) => m.type === "state").map((m) => [m.tick, m]));
    const common = b.msgs.filter((m) => m.type === "state" && ticksA.has(m.tick) && m.tick > 10);
    expect(common.length).toBeGreaterThan(10);
    for (const m of common) expect(m.state).toEqual(ticksA.get(m.tick)!.state);
    const latest = common.at(-1)!.state;
    expect(latest.players[0].x).toBeGreaterThan(100 / 3 + 20); // Ana moved right
    expect(latest.players[1].y).toBeLessThan(30 - 20); // Ben moved up
    // tick rate actually ~20 Hz
    const st = a.msgs.filter((m) => m.type === "state");
    const span = st.at(-1).serverTime - st[st.length - 21].serverTime;
    expect(span).toBeGreaterThan(800);
    expect(span).toBeLessThan(1400);
    a.kill(); b.kill();
  });

  test("errors: unknown room, bad code, full room, match in progress, non-host start, garbage, wrong website", async () => {
    const ghost = spawnPlayer("OIS2222");
    expect((await ghost.waitFor((m) => m.type === "error")).code).toBe("ROOM_NOT_FOUND");
    const bad = spawnPlayer("not-a-code");
    expect((await bad.waitFor((m) => m.type === "error")).code).toBe("ROOM_NOT_FOUND");

    const code = await createRoom(HTTP, "sync-test");
    const ps = Array.from({ length: 8 }, () => spawnPlayer(code));
    for (const [i, p] of ps.entries()) expect((await p.hello(`P${i}`)).type).toBe("welcome");
    const ninth = spawnPlayer(code);
    expect((await ninth.hello("Nine")).code).toBe("ROOM_FULL");

    ps[1].send({ type: "start" });
    expect((await ps[1].waitFor((m) => m.type === "error")).code).toBe("NOT_HOST");
    ps[1].raw("{not json");
    await ps[1].waitFor((m) => m.type === "error" && m.code === "BAD_MESSAGE");
    ps[1].send({ type: "input", seq: 1, input: { dx: 99, dy: 0 } }); // not playing: ignored, no crash
    ps[0].send({ type: "start" });
    expect((await ps[0].waitFor((m) => m.type === "error")).message).toMatch(/get ready/);

    for (const p of ps.slice(1)) p.send({ type: "ready", ready: true });
    await ps[0].waitFor(lobbyWhere((l) => l.canStart));
    ps[0].send({ type: "start" });
    await ps[0].waitFor(lobbyWhere((l) => l.status === "countdown"));
    ps[7].close();
    await ps[0].waitFor(lobbyWhere((l) => l.players.some((p: any) => !p.connected)));
    const late = spawnPlayer(code);
    expect((await late.hello("Late")).code).toBe("MATCH_IN_PROGRESS");

    const evil = await fetch(`${HTTP}/api/rooms`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: '{"game":"sync-test"}' });
    expect(evil.status).toBe(403);
    const ok = await fetch(`${HTTP}/api/rooms`, { method: "OPTIONS", headers: { Origin: "http://localhost:3200" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3200");
    for (const p of [...ps, ghost, bad, ninth, late]) p.kill();
  });

  test("disconnect and reconnect with the shared RoomClient keeps the seat mid-match", async () => {
    const code = await createRoom(HTTP, "sync-test");
    const opts = { serverUrl: HTTP, code, backoffMs: [200, 400] };
    const a = new RoomClient({ ...opts, name: "Ana" });
    const b = new RoomClient({ ...opts, name: "Ben" });
    const until = async (fn: () => boolean, ms = 8000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timeout"); await sleep(25); } };
    await until(() => a.snapshot.lobby?.players.length === 2 && b.snapshot.connection === "open");
    // clock sync: offsets agree with each other to within a few ms (same machine)
    await until(() => (a.snapshot.rttMs ?? 99) < 50 && (b.snapshot.rttMs ?? 99) < 50);
    expect(Math.abs(a.clockOffset() - b.clockOffset())).toBeLessThan(25);

    b.setReady(true);
    await until(() => !!a.snapshot.lobby?.canStart);
    a.start();
    await until(() => a.snapshot.lobby?.status === "playing", 6000);
    b.sendInput({ dx: 1, dy: 0 });
    await sleep(300);
    const bId = b.snapshot.you;

    b.dropConnection();
    await until(() => a.snapshot.lobby?.players.find((p) => p.id === bId)?.connected === false);
    await until(() => b.snapshot.connection === "open" && a.snapshot.lobby?.players.find((p) => p.id === bId)?.connected === true);
    expect(b.snapshot.you).toBe(bId);
    const seq = b.sendInput({ dx: -1, dy: 0 });
    expect(seq).toBe(2); // numbering continued from the server's lastSeq
    await until(() => b.frames.at(-1)?.ack === 2);
    a.stop(); b.stop();
  });

  test("server restart mid-match: room and match come back from storage; clients reconnect", async () => {
    const code = await createRoom(HTTP, "sync-test");
    const opts = { serverUrl: HTTP, code, backoffMs: [250, 500, 1000] };
    const a = new RoomClient({ ...opts, name: "Ana" });
    const b = new RoomClient({ ...opts, name: "Ben" });
    const until = async (fn: () => boolean, ms = 10_000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timeout"); await sleep(25); } };
    await until(() => a.snapshot.lobby?.players.length === 2 && b.snapshot.connection === "open");
    b.setReady(true);
    await until(() => !!a.snapshot.lobby?.canStart);
    a.start();
    await until(() => a.snapshot.lobby?.status === "playing", 6000);
    a.sendInput({ dx: 1, dy: 0 });
    await sleep(6000); // past one 5 s snapshot
    const ids = [a.snapshot.you, b.snapshot.you];
    const xBefore = (a.frames.at(-1)!.state as any).players[0].x;

    await stopServer();
    await until(() => a.snapshot.connection === "reconnecting" && b.snapshot.connection === "reconnecting");
    await startServer();

    await until(() => a.snapshot.connection === "open" && b.snapshot.connection === "open", 20_000);
    await until(() => (a.frames.at(-1) as any)?.receivedAt > Date.now() - 500);
    expect([a.snapshot.you, b.snapshot.you]).toEqual(ids);
    expect(a.snapshot.lobby?.status).toBe("playing");
    expect(a.snapshot.lobby?.matchNumber).toBe(1);
    const xAfter = (a.frames.at(-1)!.state as any).players[0].x;
    expect(xAfter).toBeGreaterThan(20); // restored from the snapshot, not reset to the start position
    expect(xAfter).toBeLessThanOrEqual(xBefore + 1);
    a.stop(); b.stop();
  });
});

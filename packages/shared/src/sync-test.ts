// "Sync test": the Stage 2 multiplayer prototype. Not one of the six games.
// Each player moves a dot; the server decides positions, coin pickups and scores.
import type { GameFactory, GameRuntime, RuntimePlayer } from "./game-runtime";

export const SYNC = { width: 100, height: 60, speed: 32, radius: 2.5, coinRadius: 2, target: 5, durationMs: 60_000, tickRate: 20 } as const;

export type SyncPlayer = { id: string; name: string; x: number; y: number; score: number; dx: number; dy: number; gone: boolean };
export type SyncState = { players: SyncPlayer[]; coin: { x: number; y: number }; elapsedMs: number; seed: number; coinsTaken: number; done: null | { winnerIds: string[]; reason: string } };
export type SyncInput = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

/** Deterministic pseudo-random numbers so coin positions can be reproduced from the seed. */
function rand(seed: number, n: number) {
  let t = (seed + n * 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const coinAt = (seed: number, n: number) => ({ x: 6 + rand(seed, n * 2) * (SYNC.width - 12), y: 6 + rand(seed, n * 2 + 1) * (SYNC.height - 12) });

export function isSyncInput(v: unknown): v is SyncInput {
  if (!v || typeof v !== "object") return false;
  const { dx, dy } = v as Record<string, unknown>;
  return [-1, 0, 1].includes(dx as number) && [-1, 0, 1].includes(dy as number);
}

class SyncRuntime implements GameRuntime<SyncState> {
  readonly tickRate = SYNC.tickRate;
  constructor(private s: SyncState) {}

  onInput(playerId: string, input: unknown) {
    const p = this.s.players.find((q) => q.id === playerId);
    if (!p || p.gone || this.s.done || !isSyncInput(input)) return;
    p.dx = input.dx;
    p.dy = input.dy;
  }
  tick(dtMs: number) {
    if (this.s.done) return;
    const dt = Math.min(dtMs, 250) / 1000;
    this.s.elapsedMs += dtMs;
    for (const p of this.s.players) {
      if (p.gone) continue;
      const len = Math.hypot(p.dx, p.dy) || 1;
      p.x = Math.min(SYNC.width - SYNC.radius, Math.max(SYNC.radius, p.x + (p.dx / len) * SYNC.speed * dt));
      p.y = Math.min(SYNC.height - SYNC.radius, Math.max(SYNC.radius, p.y + (p.dy / len) * SYNC.speed * dt));
      if (Math.hypot(p.x - this.s.coin.x, p.y - this.s.coin.y) < SYNC.radius + SYNC.coinRadius) {
        p.score++;
        this.s.coinsTaken++;
        this.s.coin = coinAt(this.s.seed, this.s.coinsTaken);
        if (p.score >= SYNC.target) this.s.done = { winnerIds: [p.id], reason: `${p.name} collected ${SYNC.target} coins` };
      }
    }
    if (!this.s.done && this.s.elapsedMs >= SYNC.durationMs) {
      const best = Math.max(...this.s.players.map((p) => p.score));
      this.s.done = { winnerIds: this.s.players.filter((p) => p.score === best).map((p) => p.id), reason: "Time's up" };
    }
  }
  viewFor() {
    return {
      players: this.s.players.map(({ id, x, y, score, gone }) => ({ id, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, score, gone })),
      coin: this.s.coin,
      timeLeftMs: Math.max(0, SYNC.durationMs - this.s.elapsedMs),
    };
  }
  onPlayerAway(playerId: string) {
    const p = this.s.players.find((q) => q.id === playerId);
    if (p) { p.dx = 0; p.dy = 0; }
  }
  onPlayerGone(playerId: string) {
    const p = this.s.players.find((q) => q.id === playerId);
    if (p) { p.gone = true; p.dx = 0; p.dy = 0; }
  }
  result() {
    if (!this.s.done) return null;
    return { ...this.s.done, ranking: [...this.s.players].sort((a, b) => b.score - a.score).map((p) => ({ id: p.id, score: p.score })) };
  }
  save() { return structuredClone(this.s); }
}

export type SyncView = ReturnType<SyncRuntime["viewFor"]>;

export const syncTest: GameFactory<SyncState> = {
  minPlayers: 2,
  maxPlayers: 8,
  create(players: RuntimePlayer[], seed: number) {
    const n = players.length;
    return new SyncRuntime({
      players: players.map((p, i) => ({ id: p.id, name: p.name, x: SYNC.width * ((i + 1) / (n + 1)), y: SYNC.height / 2, score: 0, dx: 0, dy: 0, gone: false })),
      coin: coinAt(seed, 0), elapsedMs: 0, seed, coinsTaken: 0, done: null,
    });
  },
  restore(saved) { return new SyncRuntime(structuredClone(saved)); },
};

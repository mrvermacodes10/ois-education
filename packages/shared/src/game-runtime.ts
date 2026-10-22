// What a game must provide to run inside a server room. Every multiplayer game implements this,
// so the room/lobby code is shared and each game only contains its own rules.

export type RuntimePlayer = { id: string; name: string };

export interface GameRuntime<State = unknown> {
  /** Ticks per second for real-time games; 0 for turn-based games that only change on input. */
  readonly tickRate: number;
  /** Apply one validated player input. Must ignore anything illegal (the client is never trusted). */
  onInput(playerId: string, input: unknown, now: number): void;
  /** Advance the simulation (real-time games). */
  tick(dtMs: number, now: number): void;
  /** What a particular player is allowed to see. Hidden information (e.g. poker hole cards) is removed here. */
  viewFor(playerId: string): unknown;
  /** Player's connection dropped (they may come back). Optional: e.g. stop their movement. */
  onPlayerAway?(playerId: string): void;
  /** Player left for good mid-match. */
  onPlayerGone(playerId: string): void;
  /** Non-null once the match is over. */
  result(): { winnerIds: string[]; ranking: { id: string; score: number; stat?: string }[]; reason: string } | null;
  /** Serializable state so a match survives a server restart. */
  save(): State;
}

export type GameFactory<State = unknown> = {
  create(players: RuntimePlayer[], seed: number, now: number): GameRuntime<State>;
  restore(saved: State): GameRuntime<State>;
  minPlayers: number;
  maxPlayers: number;
};

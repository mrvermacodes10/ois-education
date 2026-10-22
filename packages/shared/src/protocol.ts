// Messages between browsers and the OIS Education room server. Shared by both sides so they can't drift apart.
import type { GameId } from "./catalog";

export const PROTOCOL_VERSION = 1;

// Room codes look like "OIS4K7Q": "OIS" + 4 characters without look-alikes (no 0/O, 1/I/L).
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_RE = /^OIS[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
/** Accepts what people type ("ois 4k7q", "OIS-4K7Q") and returns the canonical code, or null. */
export function normalizeRoomCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = c.startsWith("OIS") ? c : `OIS${c}`;
  return ROOM_CODE_RE.test(code) ? code : null;
}

export const NICKNAME_MAX = 16;
export function cleanNickname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const n = input.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ").slice(0, NICKNAME_MAX);
  return n.length >= 1 ? n : null;
}

export type RoomGame = GameId | "sync-test";
export type RoomStatus = "lobby" | "countdown" | "playing" | "ended";

export type PlayerView = {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
};

export type LobbyView = {
  code: string;
  game: RoomGame;
  status: RoomStatus;
  hostId: string;
  players: PlayerView[];
  minPlayers: number;
  maxPlayers: number;
  /** Server time (ms since epoch) when the match starts. Present during countdown and play. */
  startsAt?: number;
  /** Increments every time a new match starts in this room (rematches). */
  matchNumber: number;
  canStart: boolean;
  /** Why the host can't start yet, in plain words. */
  startBlockedReason?: string;
};

// ---------- client → server ----------
export type ClientMsg =
  | { type: "hello"; v: number; name: string; token?: string }
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "rematch" }
  | { type: "leave" }
  | { type: "input"; seq: number; input: unknown }
  | { type: "ping"; t0: number };

// ---------- server → client ----------
export type ErrorCode =
  | "ROOM_NOT_FOUND" | "ROOM_FULL" | "MATCH_IN_PROGRESS" | "BAD_MESSAGE" | "BAD_NAME"
  | "NOT_HOST" | "CANNOT_START" | "RATE_LIMITED" | "VERSION_MISMATCH" | "NOT_JOINED" | "SERVER_ERROR";

export type ServerMsg =
  | { type: "welcome"; you: string; token: string; serverTime: number; /** Highest input seq the server has accepted from you (continue numbering after it). */ lastSeq: number }
  | { type: "lobby"; lobby: LobbyView; serverTime: number }
  | { type: "state"; tick: number; serverTime: number; state: unknown; /** Highest input seq applied for you. */ ack: number }
  | { type: "ended"; results: MatchResults; serverTime: number }
  | { type: "pong"; t0: number; serverTime: number }
  | { type: "error"; code: ErrorCode; message: string; fatal: boolean };

export type MatchResults = {
  winnerIds: string[];
  ranking: { id: string; name: string; score: number; stat?: string }[];
  durationMs: number;
  reason: string;
};

/** Human-friendly messages for errors players can actually hit. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: "There's no room with that code. Check the code, or the room may have expired.",
  ROOM_FULL: "That room is full.",
  MATCH_IN_PROGRESS: "That room's match has already started.",
  BAD_MESSAGE: "The game sent something the server didn't understand.",
  BAD_NAME: "Choose a nickname (1–16 characters).",
  NOT_HOST: "Only the host can do that.",
  CANNOT_START: "The match can't start yet.",
  RATE_LIMITED: "Too many messages. Slow down a little.",
  VERSION_MISMATCH: "This page is out of date. Refresh to get the latest version.",
  NOT_JOINED: "Join the room first.",
  SERVER_ERROR: "The game server had a problem. Try again.",
};

// Limits (also enforced by the server)
export const LIMITS = {
  maxMessageBytes: 4096,
  /** Messages per second allowed per connection (token bucket refill rate) and burst size. */
  msgRate: 40,
  msgBurst: 80,
  /** How long a disconnected player keeps their seat. */
  graceLobbyMs: 30_000,
  graceMatchMs: 60_000,
  countdownMs: 3_000,
  /** Empty rooms are deleted after this long. */
  emptyRoomTtlMs: 15 * 60_000,
  /** A room nobody ever joined is deleted after this long. */
  unjoinedRoomTtlMs: 10 * 60_000,
} as const;

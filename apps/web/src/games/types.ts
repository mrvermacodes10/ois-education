// The contract every game implements so the shared GameShell can run it.
import type { Difficulty } from "@ois/shared";

export type GameResult = { headline: string; lines: { label: string; value: string }[] };

export type MountOptions = {
  /** Element the game draws into. It fills the play area and is resized with it. */
  host: HTMLElement;
  mode: "solo" | "online";
  difficulty?: Difficulty;
  /** Called once when the match finishes. */
  onEnd: (result: GameResult) => void;
};

export type GameController = {
  start(): void;
  /** Must stop the render/update loop, not just hide it. */
  pause(): void;
  resume(): void;
  restart(): void;
  /** Remove listeners, stop loops, release WebGL/canvas resources. */
  destroy(): void;
};

export type GameModule = { mount(opts: MountOptions): GameController };

// Lazily loads each game's code only when someone presses Start.
// A game that isn't built yet returns null, and the page says so honestly.
import type { GameId } from "@ois/shared";
import type { GameModule } from "./types";

type Loader = () => Promise<GameModule>;

export const GAME_LOADERS: Record<GameId, Loader | null> = {
  racing: null,
  poker: null,
  football: null,
  basketball: null,
  deduction: null,
  territory: null,
};

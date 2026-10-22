import { describe, expect, it } from "vitest";
import { GAMES, gameBySlug } from "../src";

describe("game catalog", () => {
  it("has exactly the six planned games with unique ids and slugs", () => {
    expect(GAMES.map((g) => g.id).sort()).toEqual(["basketball", "deduction", "football", "poker", "racing", "territory"]);
    expect(new Set(GAMES.map((g) => g.slug)).size).toBe(6);
  });
  it("every game supports online play and some form of solo play", () => {
    for (const g of GAMES) {
      expect(g.online.minPlayers).toBeGreaterThanOrEqual(2);
      expect(g.online.maxPlayers).toBeGreaterThanOrEqual(g.online.minPlayers);
      if (g.solo.kind === "ai") expect(g.solo.difficulties).toEqual(["Easy", "Medium", "Hard", "Expert"]);
    }
  });
  it("only social deduction uses a solo practice mode; football and basketball are 1v1 online", () => {
    expect(GAMES.filter((g) => g.solo.kind === "practice").map((g) => g.id)).toEqual(["deduction"]);
    expect(gameBySlug("pixel-pitch")!.online).toEqual({ minPlayers: 2, maxPlayers: 2 });
    expect(gameBySlug("hoops-1v1")!.online).toEqual({ minPlayers: 2, maxPlayers: 2 });
  });
  it("every game lists keyboard controls (no controller or mouse-only gameplay)", () => {
    for (const g of GAMES) expect(g.controls.some((c) => c.keys.some((k) => k !== "Trackpad"))).toBe(true);
  });
});

// The six OIS Education games. One source of truth for the website and (later) the game server.

export type GameId = "racing" | "poker" | "football" | "basketball" | "deduction" | "territory";
export type Category = "Racing" | "Cards" | "Sports" | "Party" | "Arcade";
export type Difficulty = "Easy" | "Medium" | "Hard" | "Expert";
export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard", "Expert"];

/** Where a game is in development. Shown honestly on the site. */
export type BuildStatus = "planned" | "in-progress" | "playable";

export type Control = { keys: string[]; action: string };

export type GameInfo = {
  id: GameId;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: Category;
  /** Singleplayer: AI opponents, or a labelled solo practice mode where AI isn't meaningful (yet). */
  solo: { kind: "ai"; difficulties: Difficulty[] } | { kind: "practice"; note: string };
  online: { minPlayers: number; maxPlayers: number };
  renderer: "three" | "canvas2d" | "dom";
  controls: Control[];
  status: BuildStatus;
};

const MOVE = ["WASD", "Arrows"];

export const GAMES: GameInfo[] = [
  {
    id: "racing", slug: "low-poly-rally", name: "Low-Poly Rally",
    tagline: "Low-poly 3D racing",
    description: "Drive a low-poly car around original tracks. Hit every checkpoint, beat the AI or race friends online.",
    category: "Racing", renderer: "three",
    solo: { kind: "ai", difficulties: ["Easy", "Medium", "Hard", "Expert"] },
    online: { minPlayers: 2, maxPlayers: 6 },
    controls: [
      { keys: ["W", "↑"], action: "Accelerate" }, { keys: ["S", "↓"], action: "Brake / reverse" },
      { keys: ["A", "←", "D", "→"], action: "Steer" }, { keys: ["R"], action: "Reset to last checkpoint" },
      { keys: ["Esc"], action: "Pause" },
    ],
    status: "planned",
  },
  {
    id: "poker", slug: "holdem-table", name: "Hold'em Table",
    tagline: "Texas Hold'em with virtual chips",
    description: "Proper No-Limit Texas Hold'em with blinds, side pots and showdowns. Virtual chips only, never real money.",
    category: "Cards", renderer: "dom",
    solo: { kind: "ai", difficulties: ["Easy", "Medium", "Hard", "Expert"] },
    online: { minPlayers: 2, maxPlayers: 6 },
    controls: [
      { keys: ["F"], action: "Fold" }, { keys: ["C"], action: "Check / call" },
      { keys: ["R"], action: "Bet / raise" }, { keys: ["Trackpad"], action: "Choose bet size" },
    ],
    status: "planned",
  },
  {
    id: "football", slug: "pixel-pitch", name: "Pixel Pitch",
    tagline: "Retro arcade football",
    description: "Full arcade football matches: pass, shoot, tackle and score against AI teams or a friend online.",
    category: "Sports", renderer: "canvas2d",
    solo: { kind: "ai", difficulties: ["Easy", "Medium", "Hard", "Expert"] },
    online: { minPlayers: 2, maxPlayers: 2 },
    controls: [
      { keys: MOVE, action: "Move" }, { keys: ["J"], action: "Pass" },
      { keys: ["K"], action: "Shoot (hold for power)" }, { keys: ["Shift"], action: "Sprint" },
      { keys: ["L"], action: "Switch player" }, { keys: ["Esc"], action: "Pause" },
    ],
    status: "planned",
  },
  {
    id: "basketball", slug: "hoops-1v1", name: "Hoops 1v1",
    tagline: "Fast 1v1 street basketball",
    description: "One-on-one arcade basketball with timed shots, steals, blocks, rebounds and dunks.",
    category: "Sports", renderer: "canvas2d",
    solo: { kind: "ai", difficulties: ["Easy", "Medium", "Hard", "Expert"] },
    online: { minPlayers: 2, maxPlayers: 2 },
    controls: [
      { keys: MOVE, action: "Move" }, { keys: ["J"], action: "Shoot (release at the top)" },
      { keys: ["K"], action: "Steal" }, { keys: ["L"], action: "Block / contest" },
      { keys: ["Shift"], action: "Sprint" }, { keys: ["Esc"], action: "Pause" },
    ],
    status: "planned",
  },
  {
    id: "deduction", slug: "hidden-crew", name: "Hidden Crew",
    tagline: "Social deduction with friends",
    description: "Complete tasks around the station, call meetings and vote out the impostors before they take over.",
    category: "Party", renderer: "canvas2d",
    solo: { kind: "practice", note: "Solo practice: explore the map and try every task. The full game needs real players online." },
    online: { minPlayers: 4, maxPlayers: 10 },
    controls: [
      { keys: MOVE, action: "Move" }, { keys: ["E"], action: "Use / do task" },
      { keys: ["R"], action: "Report" }, { keys: ["Q"], action: "Eliminate (impostor)" },
      { keys: ["Trackpad"], action: "Tasks and voting" }, { keys: ["Esc"], action: "Menu" },
    ],
    status: "planned",
  },
  {
    id: "territory", slug: "paint-grab", name: "Paint Grab",
    tagline: "Draw loops, capture territory",
    description: "Leave your zone, draw a trail and loop back to capture the area inside. Cross someone's trail to knock them out.",
    category: "Arcade", renderer: "canvas2d",
    solo: { kind: "ai", difficulties: ["Easy", "Medium", "Hard", "Expert"] },
    online: { minPlayers: 2, maxPlayers: 8 },
    controls: [
      { keys: MOVE, action: "Change direction (no instant U-turns)" },
      { keys: ["Esc"], action: "Pause" },
    ],
    status: "planned",
  },
];

export const CATEGORIES: Category[] = ["Racing", "Cards", "Sports", "Party", "Arcade"];
export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug);
export const gameById = (id: GameId) => GAMES.find((g) => g.id === id)!;

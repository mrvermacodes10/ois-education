// Public address of the multiplayer server (not a secret). Set NEXT_PUBLIC_GAME_SERVER_URL on Vercel.
export const GAME_SERVER_URL = (process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:8787").replace(/\/$/, "");

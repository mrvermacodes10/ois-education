"use client";

// Developer-only page that runs the GameShell with a test module, to verify pause/resume/restart,
// fullscreen and keyboard handling before real games exist. Not linked from the library.
import { gameById } from "@ois/shared";
import GameShell from "@/components/GameShell";

const testGame = { ...gameById("territory"), name: "Shell test (developer page)", tagline: "Not a game: checks the shared game page controls" };

export default function ShellTestPage() {
  return <GameShell game={testGame} load={() => import("@/games/shell-test").then((m) => m.shellTestModule)} />;
}

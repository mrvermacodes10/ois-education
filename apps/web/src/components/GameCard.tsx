import Link from "next/link";
import type { GameInfo } from "@ois/shared";
import { Cover } from "./covers";

const STATUS: Record<GameInfo["status"], string> = { planned: "Coming soon", "in-progress": "In development", playable: "" };

export function soloLabel(g: GameInfo) {
  return g.solo.kind === "ai" ? "Solo vs AI" : "Solo practice";
}
export function onlineLabel(g: GameInfo) {
  const { minPlayers: a, maxPlayers: b } = g.online;
  return a === b ? `Online ${a === 2 ? "1v1" : `${a} players`}` : `Online ${a}–${b} players`;
}

export default function GameCard({ game }: { game: GameInfo }) {
  return (
    <Link href={`/games/${game.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-moss/50">
      <div className="relative">
        <Cover id={game.id} />
        {STATUS[game.status] && (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 text-[12px] font-medium text-forest">{STATUS[game.status]}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{game.name}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-moss">{game.description}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4 text-[13px]">
          <span className="rounded-full bg-sage-soft px-2.5 py-1">{soloLabel(game)}</span>
          <span className="rounded-full bg-sage-soft px-2.5 py-1">{onlineLabel(game)}</span>
        </div>
      </div>
    </Link>
  );
}

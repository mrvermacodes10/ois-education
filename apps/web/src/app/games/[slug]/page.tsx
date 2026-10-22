import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, gameBySlug } from "@ois/shared";
import GameShell from "@/components/GameShell";

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const game = gameBySlug((await params).slug);
  return game ? { title: game.name, description: game.description } : {};
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const game = gameBySlug((await params).slug);
  if (!game) notFound();
  return <GameShell game={game} />;
}

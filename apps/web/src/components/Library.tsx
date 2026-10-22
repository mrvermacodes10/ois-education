"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, GAMES, type Category } from "@ois/shared";
import GameCard from "./GameCard";

export default function Library() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter((g) =>
      (category === "All" || g.category === category) &&
      (!q || [g.name, g.tagline, g.description, g.category].some((t) => t.toLowerCase().includes(q))));
  }, [query, category]);

  return (
    <section aria-label="Game library" className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative sm:w-72">
          <span className="sr-only">Search games</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-moss" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games"
            className="h-11 w-full rounded-full border border-line bg-card pl-10 pr-4 text-[15px] placeholder:text-moss/70 focus:border-forest focus:outline-none" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
              className={`h-9 rounded-full px-3.5 text-[14px] transition-colors ${category === c ? "bg-forest text-paper" : "text-moss hover:bg-sage-soft hover:text-forest"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((g) => <GameCard key={g.id} game={g} />)}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-[17px] font-medium">No games match “{query}”.</p>
          <button type="button" onClick={() => { setQuery(""); setCategory("All"); }} className="mt-3 text-[15px] text-moss underline underline-offset-4 hover:text-forest">Show all games</button>
        </div>
      )}
    </section>
  );
}

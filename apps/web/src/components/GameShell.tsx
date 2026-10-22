"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Difficulty, GameInfo } from "@ois/shared";
import type { GameController, GameModule, GameResult } from "@/games/types";
import { GAME_LOADERS } from "@/games/registry";
import { Cover } from "./covers";

type Phase = "ready" | "loading" | "playing" | "paused" | "ended" | "error";
type Mode = "solo" | "online";

// Keys that would otherwise scroll the page or trigger browser behaviour during play.
const GAME_KEYS = new Set([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "Tab"]);
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

/** `load` overrides the registry (used only by the developer shell-test page). */
export default function GameShell({ game, load: loadOverride }: { game: GameInfo; load?: () => Promise<GameModule> }) {
  const load = loadOverride ?? GAME_LOADERS[game.id];
  const [mode, setMode] = useState<Mode>("solo");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false); // fallback when the Fullscreen API isn't available
  const areaRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<GameController | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const exitWhenFullscreen = useRef(false); // "Exit fullscreen" pressed while the browser was still entering it
  phaseRef.current = phase;

  const onlineReady = false; // Online rooms arrive in Stage 2 (multiplayer prototype).
  const playable = !!load && (mode === "solo" || onlineReady);

  const teardown = useCallback(() => {
    ctrl.current?.destroy();
    ctrl.current = null;
  }, []);
  useEffect(() => teardown, [teardown]);

  async function start() {
    if (!load || !hostRef.current) return;
    setError(null);
    setResult(null);
    setPhase("loading");
    try {
      const mod = await load();
      teardown();
      ctrl.current = mod.mount({
        host: hostRef.current, mode, difficulty: game.solo.kind === "ai" ? difficulty : undefined,
        onEnd: (r) => { setResult(r); setPhase("ended"); },
      });
      ctrl.current.start();
      setPhase("playing");
      areaRef.current?.focus({ preventScroll: true });
    } catch (e) {
      console.error(e);
      teardown();
      setError("The game couldn't load. Check your connection and try again.");
      setPhase("error");
    }
  }
  const pause = useCallback(() => { if (phaseRef.current === "playing") { ctrl.current?.pause(); setPhase("paused"); } }, []);
  const resume = () => { if (phaseRef.current === "paused") { ctrl.current?.resume(); setPhase("playing"); areaRef.current?.focus({ preventScroll: true }); } };
  const restart = () => { setResult(null); ctrl.current?.restart(); setPhase("playing"); areaRef.current?.focus({ preventScroll: true }); };
  const exit = () => { teardown(); setResult(null); setPhase("ready"); leaveFullscreen(); };

  // Keyboard: Escape pauses/resumes; game keys don't scroll the page while a match is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      if (p !== "playing" && p !== "paused") return;
      if (isTyping(e.target)) return;
      if (e.key === "Escape") {
        // In real fullscreen the browser uses Escape to leave fullscreen; we pause as well.
        if (p === "playing") pause(); else resume();
        return;
      }
      if (GAME_KEYS.has(e.key) && p === "playing") e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  });

  // Pause automatically when the tab is hidden or the window loses focus.
  useEffect(() => {
    const onHide = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", pause);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("blur", pause); };
  }, [pause]);

  // Fullscreen with a Safari prefix and an in-page fallback.
  useEffect(() => {
    const sync = () => {
      const d = document as FsDocument;
      const on = !!(document.fullscreenElement ?? d.webkitFullscreenElement);
      setFullscreen(on);
      if (on && exitWhenFullscreen.current) { exitWhenFullscreen.current = false; leaveFullscreen(); }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync); };
  }, []);
  async function enterFullscreen() {
    const el = areaRef.current as FsElement | null;
    if (!el) return;
    exitWhenFullscreen.current = false;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else setExpanded(true);
    } catch {
      setExpanded(true);
    }
  }
  function leaveFullscreen() {
    const d = document as FsDocument;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (d.webkitFullscreenElement) void d.webkitExitFullscreen?.();
    else exitWhenFullscreen.current = true; // still entering: leave as soon as it finishes
    setExpanded(false);
  }
  const big = fullscreen || expanded;
  const inMatch = phase === "playing" || phase === "paused";

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8">
      <Link href="/" className="inline-flex items-center gap-1.5 rounded-full py-1 pr-3 text-[14px] text-moss hover:text-forest">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Library
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold leading-tight tracking-[-0.025em]">{game.name}</h1>
          <p className="mt-1 text-[16px] text-moss">{game.tagline}</p>
        </div>
        {inMatch && (
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Game controls">
            {phase === "playing" ? <ShellButton onClick={pause}>Pause</ShellButton> : <ShellButton onClick={resume}>Resume</ShellButton>}
            <ShellButton onClick={restart}>Restart</ShellButton>
            <ShellButton onClick={big ? leaveFullscreen : enterFullscreen}>{big ? "Exit fullscreen" : "Fullscreen"}</ShellButton>
            <ShellButton onClick={exit}>Exit game</ShellButton>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Play area */}
        <div
          ref={areaRef}
          tabIndex={-1}
          aria-label={`${game.name} play area`}
          data-phase={phase}
          className={`overflow-hidden bg-forest-deep outline-none ${expanded
            ? "fixed inset-0 z-50"
            : fullscreen ? "relative h-full w-full" : "relative aspect-video max-h-[calc(100dvh-11rem)] w-full rounded-2xl"}`}
        >
          <div ref={hostRef} className="absolute inset-0" />

          {phase === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-paper">
              <Cover id={game.id} className="absolute inset-0 !aspect-auto h-full opacity-30" />
              <div className="relative max-w-sm rounded-2xl border border-line bg-paper px-7 py-6 text-center">
                {load ? (
                  <>
                    <p className="text-[17px] font-medium">{mode === "solo" ? "Ready when you are." : "Online play"}</p>
                    {mode === "online" && !onlineReady && <p className="mt-1 text-[15px] text-moss">Online rooms aren’t available yet. They’re the next stage of the build.</p>}
                    <button type="button" disabled={!playable} onClick={start}
                      className="mt-4 h-12 rounded-full bg-forest px-7 text-[16px] font-medium text-paper transition-colors hover:bg-forest-deep disabled:opacity-40">
                      Start
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[19px] font-semibold">Not playable yet</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-moss">{game.name} is still being built. This page shows how it will be laid out; the game itself isn’t ready.</p>
                  </>
                )}
              </div>
            </div>
          )}

          {phase === "loading" && <Overlay><p className="text-[17px] font-medium">Loading…</p></Overlay>}

          {phase === "paused" && (
            <Overlay>
              <p className="text-[22px] font-semibold">Paused</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <PrimaryButton onClick={resume}>Resume</PrimaryButton>
                <ShellButton onClick={restart}>Restart</ShellButton>
                <ShellButton onClick={exit}>Exit game</ShellButton>
              </div>
              <p className="mt-3 text-[13px] text-moss">Press Esc to resume</p>
            </Overlay>
          )}

          {phase === "ended" && result && (
            <Overlay>
              <p className="text-[24px] font-semibold tracking-[-0.02em]">{result.headline}</p>
              <dl className="mt-4 grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-left text-[15px]">
                {result.lines.map((l) => (<Fragment key={l.label}><dt className="text-moss">{l.label}</dt><dd className="font-semibold tabular-nums">{l.value}</dd></Fragment>))}
              </dl>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <PrimaryButton onClick={restart}>Play again</PrimaryButton>
                <ShellButton onClick={exit}>Change settings</ShellButton>
                <Link href="/" className="inline-flex h-10 items-center rounded-full border border-line bg-card px-4 text-[14px] font-medium hover:border-forest">Back to library</Link>
              </div>
            </Overlay>
          )}

          {phase === "error" && (
            <Overlay>
              <p className="text-[17px] font-semibold">{error}</p>
              <div className="mt-4 flex gap-2"><PrimaryButton onClick={start}>Try again</PrimaryButton><ShellButton onClick={exit}>Back</ShellButton></div>
            </Overlay>
          )}

          {/* In fullscreen the page toolbar isn't visible, so the essential controls live inside the play area. */}
          {big && phase === "playing" && (
            <div className="absolute right-3 top-3 z-10 flex gap-1.5">
              <button type="button" onClick={pause} className="rounded-full bg-paper/90 px-3 py-1.5 text-[13px] font-medium hover:bg-paper">Pause</button>
              <button type="button" onClick={leaveFullscreen} className="rounded-full bg-paper/90 px-3 py-1.5 text-[13px] font-medium hover:bg-paper">Exit fullscreen</button>
            </div>
          )}
        </div>

        {/* Side panel: mode, difficulty, controls */}
        <aside className="space-y-6">
          <fieldset disabled={inMatch} className="disabled:opacity-60">
            <legend className="text-[15px] font-semibold">Mode</legend>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-full border border-line bg-card p-1" role="radiogroup" aria-label="Mode">
              {(["solo", "online"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`h-9 rounded-full text-[14px] font-medium transition-colors ${mode === m ? "bg-forest text-paper" : "text-moss hover:text-forest"}`}>
                  {m === "solo" ? (game.solo.kind === "ai" ? "Solo vs AI" : "Solo practice") : "Online"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-moss">
              {mode === "solo"
                ? game.solo.kind === "ai" ? "Computer opponents play by the same rules as you." : game.solo.note
                : `Create a private room and share the code. ${game.online.minPlayers === game.online.maxPlayers ? "1v1." : `${game.online.minPlayers}–${game.online.maxPlayers} players.`}`}
            </p>
            {mode === "solo" && game.solo.kind === "ai" && (
              <label className="mt-4 block">
                <span className="text-[15px] font-semibold">Difficulty</span>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-card px-3 text-[15px] focus:border-forest focus:outline-none">
                  {game.solo.difficulties.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
            )}
          </fieldset>

          <section>
            <h2 className="text-[15px] font-semibold">Controls</h2>
            <ul className="mt-2.5 space-y-2.5">
              {game.controls.map((c) => (
                <li key={c.action} className="flex items-start justify-between gap-3 text-[14px]">
                  <span className="pt-1 text-moss">{c.action}</span>
                  <span className="flex flex-wrap justify-end gap-1">{c.keys.map((k) => <kbd key={k} className="keycap">{k}</kbd>)}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-paper/92 px-6 text-center backdrop-blur-[2px]">{children}</div>;
}
function ShellButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="h-10 rounded-full border border-line bg-card px-4 text-[14px] font-medium transition-colors hover:border-forest">{children}</button>;
}
function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="h-10 rounded-full bg-forest px-5 text-[14px] font-medium text-paper transition-colors hover:bg-forest-deep">{children}</button>;
}

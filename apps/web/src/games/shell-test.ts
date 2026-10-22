// Developer-only test module used to verify the GameShell (pause/resume/restart/fullscreen/keyboard).
// It is NOT a game and is not listed in the library. Reachable only at /dev/shell-test.
import type { GameModule } from "./types";

type Probe = { frames: number; running: boolean; x: number; y: number; restarts: number };
declare global { interface Window { __shellTest?: Probe } }

export const shellTestModule: GameModule = {
  mount({ host, onEnd }) {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const probe: Probe = { frames: 0, running: false, x: 0.5, y: 0.5, restarts: 0 };
    window.__shellTest = probe;
    const keys = new Set<string>();
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(host.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(host.clientHeight * dpr));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const down = (e: KeyboardEvent) => {
      keys.add(e.key);
      if (e.key === "Enter") onEnd({ headline: "Shell test finished", lines: [{ label: "Frames drawn", value: String(probe.frames) }] });
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - (last || t)) / 1000);
      last = t;
      const v = 0.5 * dt;
      if (keys.has("ArrowLeft")) probe.x -= v;
      if (keys.has("ArrowRight")) probe.x += v;
      if (keys.has("ArrowUp")) probe.y -= v;
      if (keys.has("ArrowDown")) probe.y += v;
      probe.x = Math.min(1, Math.max(0, probe.x));
      probe.y = Math.min(1, Math.max(0, probe.y));
      probe.frames++;
      const { width: w, height: h } = canvas;
      ctx.fillStyle = "#1e3b2f"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#b9c9ae"; ctx.beginPath(); ctx.arc(probe.x * w, probe.y * h, Math.min(w, h) * 0.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f2f1e8"; ctx.font = `${Math.round(h * 0.04)}px sans-serif`;
      ctx.fillText(`Shell test · frames ${probe.frames} · arrows move · Enter ends`, w * 0.03, h * 0.08);
      raf = requestAnimationFrame(frame);
    };
    const run = () => { if (probe.running) return; probe.running = true; last = 0; raf = requestAnimationFrame(frame); };
    const stop = () => { probe.running = false; cancelAnimationFrame(raf); keys.clear(); };

    return {
      start() { window.addEventListener("keydown", down); window.addEventListener("keyup", up); run(); },
      pause: stop,
      resume: run,
      restart() { stop(); probe.x = 0.5; probe.y = 0.5; probe.frames = 0; probe.restarts++; run(); },
      destroy() { stop(); ro.disconnect(); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); canvas.remove(); delete window.__shellTest; },
    };
  },
};

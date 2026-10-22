# OIS Education

A small, minimalist library of original browser games. Each game has singleplayer (with AI where it makes sense)
and genuine online multiplayer through private room codes.

| Game | Style | Solo | Online |
|---|---|---|---|
| Low-Poly Rally | Low-poly 3D racing | AI (Easy–Expert) | 2–6 players |
| Hold'em Table | Texas Hold'em, virtual chips only | AI (Easy–Expert) | 2–6 players |
| Pixel Pitch | Retro arcade football | AI (Easy–Expert) | 1v1 |
| Hoops 1v1 | Arcade 1v1 basketball | AI (Easy–Expert) | 1v1 |
| Hidden Crew | Social deduction | Solo practice | 4–10 players |
| Paint Grab | Trail-and-territory capture | AI (Easy–Expert) | 2–8 players |

**Status:** in development. See the build status on each game's card.

## Run locally (macOS)

```bash
cd ois-education     # this folder
npm install
npm run dev          # http://localhost:3000
```

## Project layout

```
apps/web          Next.js website (Vercel)
apps/server       Multiplayer server on Cloudflare Durable Objects (Stage 2)
packages/shared   Game catalog, shared types and network protocol
packages/games/*  Pure game rules, simulation and AI (shared by singleplayer and the server)
```

## Services

All on free plans. No paid service is used without explicit approval.

- GitHub: source code
- Vercel (Hobby, personal non-commercial use): the website
- Cloudflare Workers Free (Durable Objects): multiplayer rooms (from Stage 2)

# OIS Education — rules for working in this repo

This repository is **only** OIS Education (`github.com/mrvermacodes10/ois-education`).

## Safety (always)
- Before running commands, run `npm run guard` (checks the folder and Git remote). If it fails, stop and ask.
- Never touch other projects, repositories, databases, Vercel projects or Cloudflare Workers.
- Never delete or overwrite files just to make an error go away. No destructive commands (`rm -rf`, `git reset --hard`,
  `git push --force`, deleting branches) without explaining the consequences and getting approval.
- Never commit secrets. `.env*` and `.dev.vars` are git-ignored. Public config only goes in `NEXT_PUBLIC_*` variables.
- Don't use paid services or plans without explicit approval.
- Make a Git checkpoint (commit) after each tested milestone.

## Honesty
- Don't call a feature done until it's implemented and tested. Report what was actually run.
- Never present local simulation or bots as online multiplayer. Label placeholders as placeholders.
- Separate "automated tests (run in CI/sandbox)" from "manual tests on the MacBook Air".

## Layout
- `apps/web` — Next.js website (deployed to Vercel). UI, rendering and controls per game in `apps/web/src/games/<id>`.
- `apps/server` — multiplayer server on Cloudflare Durable Objects (added in Stage 2).
- `packages/shared` — game catalog and shared types/protocol.
- `packages/games/<id>` — pure rules/simulation/AI for each game (no DOM), shared by web (singleplayer) and server (multiplayer).

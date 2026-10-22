# Deploying OIS Education (free plans only)

Two separate free services:

| Part | Service | What gets created |
|---|---|---|
| Room server (`apps/server`) | Cloudflare Workers Free + Durable Objects | One Worker named `ois-education-rooms` |
| Website (`apps/web`) | Vercel Hobby | One new project linked to `mrvermacodes10/ois-education` |

Neither service asks for a card on its free plan. **If a card or a paid plan is ever requested, stop.** That means something is set up differently than expected.

## 1. Room server on Cloudflare (on your Mac, about 5 minutes)

```bash
cd ois-education
git pull
npm install
cd apps/server
npx wrangler login         # opens the browser; sign in or create a free Cloudflare account and click Allow
npx wrangler whoami        # check it's your account
npm run deploy             # checks the folder/Git remote, then deploys
```

`wrangler login` asks to let Wrangler manage your account's Workers (and related resources such as Durable Objects). That's the access needed to deploy. Deploying creates only the `ois-education-rooms` Worker. It doesn't touch any other Worker.

The deploy prints an address like `https://ois-education-rooms.<your-subdomain>.workers.dev`. Check it:
open `https://ois-education-rooms.<your-subdomain>.workers.dev/api/health` in the browser. It should show `{"ok":true}`.

## 2. Website on Vercel (in the browser)

1. vercel.com → sign in with GitHub (Hobby, free) → **Add New → Project** → import `mrvermacodes10/ois-education`.
   Vercel's GitHub app will ask which repositories it may access. Choose **Only select repositories → ois-education**.
2. **Root Directory:** `apps/web` (framework: Next.js is detected).
3. **Environment variable:** `NEXT_PUBLIC_GAME_SERVER_URL` = the workers.dev address from step 1 (no trailing slash). It's public, not a secret.
4. Deploy. Note the site address, e.g. `https://ois-education.vercel.app`.

## 3. Allow the website to use the room server

In `apps/server/wrangler.jsonc`, add the Vercel address to `ALLOWED_ORIGINS` (comma-separated, no trailing slash), then run `npm run deploy` again in `apps/server`.
(Claude can make this edit and commit it once you send the address.)

## 4. Deployed test

- Automated, from any machine with the repo:
  `BASE_URL=https://<site>.vercel.app npx playwright test tests/e2e/multiplayer.spec.ts`
- Manual, on the MacBook Air: see the checklist in the Stage 2 report.

## Free-plan limits that matter (checked 22 Oct 2026, official docs)

- Workers Free: 100,000 requests/day. Over the limit, requests fail with an error; nothing is charged. Resets 00:00 UTC (05:30 IST).
- Durable Objects (Free): 13,000 GB-s duration/day, about 29 hours of one active room per day at 128 MB. Incoming WebSocket messages count 20:1 as requests.
  SQLite storage: 100,000 rows written/day, 5 million read/day, 5 GB. The server saves a match snapshot every 5 s (about 720 writes per room-hour), so the duration limit is reached first.
- Vercel Hobby: free, non-commercial use. Over its limits, the project can be paused; there's no automatic billing.
- **Still to measure after deploying:** CPU/duration of the 20 ticks/second loop on the Free plan (Cloudflare dashboard → Workers → ois-education-rooms → Metrics).

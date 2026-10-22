// Two separate browser instances (two Chromium processes, nothing shared) play the sync-test prototype
// through the room server. Locally that server is Cloudflare's runtime on this machine; with BASE_URL
// pointing at the deployed site it's the real deployment.
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";

const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let browsers: Browser[] = [];
test.afterEach(async () => { await Promise.all(browsers.map((b) => b.close())); browsers = []; });

async function player(name: string) {
  const b = await launch();
  browsers.push(b);
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, baseURL: test.info().project.use.baseURL })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/dev/multiplayer");
  await page.getByLabel("Nickname").fill(name);
  return { page, errors };
}
const latest = (p: Page) => p.evaluate(() => {
  const r = (window as any).__oisRoom;
  return r ? { frames: r.frames.map((f: any) => ({ tick: f.tick, state: f.state })), you: r.snapshot.you, status: r.snapshot.lobby?.status } : null;
});

test("two separate browsers: create, join, ready, synced countdown, same server state, reload and drop recovery", async () => {
  const A = await player("Ana");
  const B = await player("Ben");

  await A.page.getByRole("button", { name: "Create room" }).click();
  const code = (await A.page.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^OIS[2-9A-Z]{4}$/);

  await B.page.getByLabel("Enter the code you were sent.").fill(code.slice(3).toLowerCase()); // forgiving input
  await B.page.getByRole("button", { name: "Join", exact: true }).click();
  for (const p of [A.page, B.page]) {
    await expect(p.getByTestId("players").locator("li")).toHaveCount(2);
    await expect(p.getByTestId("players")).toContainText("Ana");
    await expect(p.getByTestId("players")).toContainText("Ben");
  }
  await expect(A.page.getByRole("button", { name: "Start match" })).toBeDisabled();
  await expect(A.page.getByText("Waiting for Ben to get ready.")).toBeVisible();
  await B.page.getByRole("button", { name: "I'm ready" }).click();
  await expect(A.page.getByRole("button", { name: "Start match" })).toBeEnabled();
  await A.page.getByRole("button", { name: "Start match" }).click();

  // Synced countdown: both show a number at the same moment.
  await expect(A.page.getByTestId("countdown")).toBeVisible();
  await expect(B.page.getByTestId("countdown")).toBeVisible();
  const [na, nb] = await Promise.all([A.page.getByTestId("countdown").textContent(), B.page.getByTestId("countdown").textContent()]);
  expect(Math.abs(Number(na) - Number(nb))).toBeLessThanOrEqual(1);
  await expect(A.page.getByTestId("countdown")).toBeHidden({ timeout: 6000 });
  await expect(B.page.getByTestId("countdown")).toBeHidden({ timeout: 6000 });

  // Ana moves right with the keyboard; Ben moves up.
  await A.page.keyboard.down("ArrowRight");
  await B.page.keyboard.down("KeyW");
  await A.page.waitForTimeout(1000);
  await A.page.keyboard.up("ArrowRight");
  await B.page.keyboard.up("KeyW");
  await A.page.waitForTimeout(500);
  const [la, lb] = await Promise.all([latest(A.page), latest(B.page)]);
  const byTick = new Map(la!.frames.map((f: any) => [f.tick, f.state]));
  const shared = lb!.frames.filter((f: any) => byTick.has(f.tick));
  expect(shared.length).toBeGreaterThan(5);
  for (const f of shared) expect(f.state).toEqual(byTick.get(f.tick));
  const s = shared.at(-1).state;
  expect(s.players[0].x).toBeGreaterThan(100 / 3 + 15);
  expect(s.players[1].y).toBeLessThan(30 - 15);
  await A.page.screenshot({ path: "test-results/multiplayer-ana.png" });

  // Ben reloads mid-match: same tab, same seat, still playing.
  const benId = lb!.you;
  await B.page.reload();
  await expect(B.page.getByTestId("arena")).toBeVisible();
  await expect.poll(async () => (await latest(B.page))?.you).toBe(benId);
  await expect.poll(async () => (await latest(B.page))?.status).toBe("playing");

  // Ana's connection drops: she sees the reconnecting notice or comes straight back, and keeps playing.
  const anaId = la!.you;
  await A.page.getByRole("button", { name: "Simulate a dropped connection" }).click();
  await expect.poll(async () => (await latest(A.page))?.you).toBe(anaId);
  const t0 = Number(await A.page.getByTestId("tick").textContent());
  await expect.poll(async () => Number(await A.page.getByTestId("tick").textContent())).toBeGreaterThan(t0 + 10);

  expect(A.errors).toEqual([]);
  expect(B.errors).toEqual([]);
});

test("joining a room that doesn't exist shows a clear message", async () => {
  const C = await player("Cara");
  await C.page.getByLabel("Enter the code you were sent.").fill("OIS2222");
  await C.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(C.page.getByText("There's no room with that code")).toBeVisible();
});

test("a typo'd code is caught before contacting the server", async () => {
  const C = await player("Cara");
  await C.page.getByLabel("Enter the code you were sent.").fill("OIS12");
  await C.page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(C.page.getByText("Room codes look like")).toBeVisible();
});

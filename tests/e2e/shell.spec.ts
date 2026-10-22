// Tests the shared game shell with the developer-only test module (not a game).
import { expect, test, type Page } from "@playwright/test";

const probe = (page: Page) => page.evaluate(() => window.__shellTest ? { ...window.__shellTest } : null);
declare global { interface Window { __shellTest?: { frames: number; running: boolean; x: number; y: number; restarts: number } } }

async function startGame(page: Page) {
  await page.goto("/dev/shell-test");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(async () => (await probe(page))?.frames ?? 0).toBeGreaterThan(5);
}

test("arrow keys reach the game and don't scroll the page", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 }); // short window so the page could scroll
  await startGame(page);
  const before = (await probe(page))!;
  await page.keyboard.down("ArrowRight"); await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowRight"); await page.keyboard.up("ArrowDown");
  await page.keyboard.press("Space"); await page.keyboard.press("PageDown");
  const after = (await probe(page))!;
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("Escape pauses (and actually stops the loop), Escape resumes", async ({ page }) => {
  await startGame(page);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  const a = (await probe(page))!.frames;
  await page.waitForTimeout(300);
  expect((await probe(page))!.frames).toBe(a);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Paused", { exact: true })).toBeHidden();
  await expect.poll(async () => (await probe(page))!.frames).toBeGreaterThan(a);
});

test("switching away from the window pauses the game", async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  expect((await probe(page))!.running).toBe(false);
});

test("restart resets the game; results screen offers play again and exit", async ({ page }) => {
  await startGame(page);
  await page.getByRole("button", { name: "Restart" }).first().click();
  await expect.poll(async () => (await probe(page))!.restarts).toBe(1);
  await page.locator("[data-phase]").press("Enter");
  await expect(page.getByText("Shell test finished")).toBeVisible();
  await expect(page.getByText("Frames drawn")).toBeVisible();
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Exit game" }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  expect(await probe(page)).toBeNull(); // module destroyed: no leftover loop or listeners
});

test("fullscreen fills the screen and can be exited", async ({ page }) => {
  await startGame(page);
  await page.getByRole("button", { name: "Fullscreen" }).click();
  await expect(page.getByRole("button", { name: "Exit fullscreen" }).first()).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await page.locator("[data-phase]").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
  // In fullscreen, Pause and Exit fullscreen must be reachable inside the play area itself.
  const inArea = page.locator("[data-phase]");
  await inArea.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await inArea.getByRole("button", { name: "Resume" }).click();
  await inArea.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.getByRole("toolbar", { name: "Game controls" })).toContainText("Fullscreen");
  await expect(page.getByRole("toolbar", { name: "Game controls" })).not.toContainText("Exit fullscreen");
  expect((await probe(page))!.running).toBe(true); // game keeps working after leaving fullscreen
});

test("without the Fullscreen API, the in-page expanded view is used instead", async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error simulate a browser without fullscreen support
    delete Element.prototype.requestFullscreen;
    // @ts-expect-error same for the Safari-prefixed API
    delete Element.prototype.webkitRequestFullscreen;
  });
  await startGame(page);
  await page.getByRole("button", { name: "Fullscreen" }).click();
  const vp = page.viewportSize()!;
  const box = (await page.locator("[data-phase]").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);
  await page.locator("[data-phase]").getByRole("button", { name: "Exit fullscreen" }).click();
  const small = (await page.locator("[data-phase]").boundingBox())!;
  expect(small.width).toBeLessThan(vp.width);
});

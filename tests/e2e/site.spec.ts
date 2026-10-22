import { expect, test, type Page } from "@playwright/test";
import { GAMES } from "../../packages/shared/src/catalog";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("homepage shows all six games with covers, details and honest status", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Six games to play in your browser.");
  const cards = page.locator("a[href^='/games/']");
  await expect(cards).toHaveCount(6);
  for (const g of GAMES) {
    const card = page.locator(`a[href='/games/${g.slug}']`);
    await expect(card.getByRole("heading", { name: g.name })).toBeVisible();
    await expect(card.locator("svg[role=img]")).toBeVisible();
    await expect(card).toContainText(g.solo.kind === "ai" ? "Solo vs AI" : "Solo practice");
    if (g.status !== "playable") await expect(card).toContainText(/Coming soon|In development/);
  }
  expect(errors).toEqual([]);
});

test("search and category filters combine, and the empty state recovers", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("a[href^='/games/']");
  await page.getByRole("button", { name: "Sports" }).click();
  await expect(cards).toHaveCount(2);
  await page.getByPlaceholder("Search games").fill("basket");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Hoops 1v1");
  await page.getByPlaceholder("Search games").fill("zzz");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("No games match")).toBeVisible();
  await page.getByRole("button", { name: "Show all games" }).click();
  await expect(cards).toHaveCount(6);
});

for (const g of GAMES) {
  test(`${g.name}: card opens its game page with controls and modes`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await page.locator(`a[href='/games/${g.slug}']`).click();
    await expect(page).toHaveURL(`/games/${g.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(g.name);
    await expect(page.getByText("Not playable yet")).toBeVisible(); // honest placeholder until the game is built
    for (const c of g.controls) await expect(page.getByText(c.action, { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(g.solo.kind === "ai" ? 1 : 0); // difficulty only where there's AI
    await page.getByRole("radio", { name: "Online" }).click();
    await expect(page.getByText("Create a private room and share the code.")).toBeVisible();
    await page.getByRole("link", { name: "Library" }).first().click();
    await expect(page).toHaveURL("/");
    expect(errors).toEqual([]);
  });
}

test("unknown game URL shows a helpful not-found page", async ({ page }) => {
  const res = await page.goto("/games/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("That page doesn’t exist.")).toBeVisible();
  await page.getByRole("link", { name: "Back to the library" }).click();
  await expect(page).toHaveURL("/");
});

test("layout fits a MacBook Air screen, a smaller window and a phone without sideways scrolling", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1100, height: 700 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.goto("/");
    expect(await noHorizontalScroll(page), `home at ${size.width}px`).toBe(true);
    await page.goto(`/games/${GAMES[0].slug}`);
    expect(await noHorizontalScroll(page), `game page at ${size.width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/games/${GAMES[0].slug}`);
  const box = (await page.getByLabel(`${GAMES[0].name} play area`).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(900); // whole play area visible without scrolling
});

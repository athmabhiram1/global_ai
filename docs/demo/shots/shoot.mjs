// Real-UI screenshots for the README. Requires the compose stack up
// (Bifrost :8080, sidecar :8090, Next :3000) with at least one decision.
import { chromium } from "playwright-core";

const shots = async (page, items) => {
  for (const [sel, file, opts] of items) {
    if (sel) {
      await page.locator(sel).first().waitFor({ timeout: 20000 });
    }
    await page.screenshot({ path: file, fullPage: false, ...(opts || {}) });
    console.log("saved", file);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
await page.screenshot({ path: "docs/demo/shots/01-landing.png" });
console.log("saved 01");

await page.goto("http://127.0.0.1:3000/console", { waitUntil: "networkidle" });
await page.locator(".trow").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "docs/demo/shots/02-traces.png" });
console.log("saved 02");

await page.locator(".trow").first().click();
await page.locator("#drawer.open").waitFor({ timeout: 20000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "docs/demo/shots/03-drawer.png" });
console.log("saved 03");

await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Sources" }).click();
await page.locator("#rep-body .rrow").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: "docs/demo/shots/04-sources.png" });
console.log("saved 04");

await page.getByRole("button", { name: "Policy" }).click();
await page.locator(".codeblk").waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
await page.screenshot({ path: "docs/demo/shots/05-policy.png" });
console.log("saved 05");

await page.getByRole("button", { name: "Evals" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "docs/demo/shots/06-evals.png" });
console.log("saved 06");

await browser.close();
console.log("DONE");

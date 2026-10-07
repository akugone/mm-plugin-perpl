// Records one take of the main demo: the dashboard (Playwright, high-DPI stills several times a second) while VHS
// films the terminal from out/take.tape. Both sides log wall-clock times, so compose.mjs can sync them.
//
//   node record.mjs            (after: python3 make_tape.py real|rehearsal)
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const dashDir = join(out, "dash");
const URL = process.env.DASH_URL ?? "https://perpl-agent-monitor.vercel.app/?refresh=2000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(out, "take.tape"))) throw new Error("Run `python3 make_tape.py real|rehearsal` first.");
rmSync(dashDir, { recursive: true, force: true });
mkdirSync(dashDir, { recursive: true });
rmSync(join(out, "events.log"), { force: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2, colorScheme: "light" });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.getElementById("heroTitle")?.textContent?.startsWith("Account"), null, { timeout: 60000 });
await sleep(6000); // first activity scan pass
console.log("dashboard ready:", await page.textContent("#heroTitle"));

// Section boxes (CSS px) so the assembly can frame the positions table and the activity feed.
const boxes = () =>
  page.evaluate(() => {
    const box = (sel) => { const r = document.querySelector(sel)?.closest("section,.stats,.hero")?.getBoundingClientRect(); return r ? { x: r.x, y: r.y + scrollY, w: r.width, h: r.height } : null; };
    return { hero: box("#heroTitle"), stats: box("#k-eq"), positions: box("#positions"), alerts: box("#alerts"), activity: box("#activity"), markets: box("#markets") };
  });

const frames = [];
let stop = false;
const capture = (async () => {
  let i = 0;
  while (!stop) {
    const t = Date.now() / 1000;
    const file = `${String(i).padStart(5, "0")}.jpg`;
    await page.screenshot({ path: join(dashDir, file), type: "jpeg", quality: 90 });
    const entry = { i, t, file };
    if (i % 4 === 0) entry.boxes = await boxes();
    frames.push(entry);
    i++;
    await sleep(200);
  }
})();

console.log("recording the terminal with VHS…");
const vhs = spawn("vhs", [join(out, "take.tape")], { cwd: here, stdio: "inherit", env: { ...process.env, DEMO_EVENTS: join(out, "events.log") } });
const code = await new Promise((r) => vhs.on("exit", r));
await sleep(3000);
stop = true;
await capture;
await browser.close();
writeFileSync(join(dashDir, "frames.json"), JSON.stringify(frames));
console.log(`VHS exited with ${code}; ${frames.length} dashboard frames captured.`);
if (code !== 0) process.exit(code);
console.log("Next: node compose.mjs");

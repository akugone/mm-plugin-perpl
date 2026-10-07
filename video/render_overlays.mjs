// Renders the video's graphic layers as 1920x1080 PNGs, in the dashboard's style (Inter, black and white):
// subtitles (transparent), per-layout backgrounds with panel frames and labels, and the intro / outro cards.
//
//   node render_overlays.mjs out/overlays.json      (written by compose.py)
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(process.argv[2] ?? join(here, "out", "overlays.json"), "utf8"));
const logo = "data:image/png;base64," + readFileSync(join(here, "..", "assets", "logo-mono.png")).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const BASE = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
  *{box-sizing:border-box} html,body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Inter,sans-serif}
  .canvas{position:absolute;inset:0}
  .bg{background:#ececea}
  .label{position:absolute;top:30px;display:inline-flex;align-items:center;gap:10px;font:600 17px Inter;letter-spacing:.12em;color:#787774}
  .label i{width:9px;height:9px;border-radius:50%;background:#191919;display:inline-block}
  .label.human i{background:#0f7b6c}
  .panel{position:absolute;border-radius:14px;box-shadow:0 0 0 1px #d3d3d0,0 18px 40px rgba(15,15,15,.10)}
  .sub{position:absolute;left:40px;bottom:40px;max-width:1400px;padding:16px 24px;border-radius:12px;background:rgba(25,25,25,.9);color:#fff;font:600 34px/1.32 Inter;letter-spacing:-.005em}
  .card{position:absolute;inset:0;background:#f7f7f5;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:0 0 120px 180px}
  .card img{width:150px;height:150px;border-radius:32px;margin-bottom:44px}
  .card h1{margin:0;font:700 88px/1.05 Inter;letter-spacing:-.03em;color:#191919}
  .card p{margin:22px 0 0;font:400 38px/1.35 Inter;color:#787774;max-width:1200px}
  .card .links{margin-top:46px;font:500 26px "JetBrains Mono",monospace;color:#37352f;line-height:1.7}
</style>`;

function html(item) {
  switch (item.type) {
    case "subtitle":
      return `<div class="sub">${esc(item.text)}</div>`;
    case "bg": {
      const labels = (item.labels ?? []).map((l) => `<div class="label ${l.kind}" style="left:${l.x}px"><i></i>${esc(l.text)}</div>`).join("");
      const panels = (item.panels ?? []).map((p) => `<div class="panel" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;background:${p.fill ?? "#fff"}"></div>`).join("");
      return `<div class="canvas bg">${panels}${labels}</div>`;
    }
    case "card":
      return `<div class="card"><img src="${logo}"><h1>${esc(item.title)}</h1><p>${esc(item.text)}</p>${item.links ? `<div class="links">${item.links.map(esc).join("<br>")}</div>` : ""}</div>`;
    default:
      throw new Error(`unknown overlay type ${item.type}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const item of spec) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${BASE}</head><body>${html(item)}</body></html>`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(item.file), { recursive: true });
  await page.screenshot({ path: item.file, omitBackground: item.type === "subtitle" });
}
await browser.close();
console.log(`${spec.length} overlays rendered`);

// Generate the 792 brand PWA icons (home-screen icon, favicon, manifest icons)
// by screenshotting an HTML mark at exact sizes. No image dependencies.
// Usage: node scripts/gen-icons.mjs
import { chromium } from "playwright";
import { mkdirSync, existsSync, unlinkSync } from "fs";

const targets = [
  { file: "public/icons/icon-192.png", size: 192, scale: 0.33 },
  { file: "public/icons/icon-512.png", size: 512, scale: 0.33 },
  { file: "public/icons/icon-512-maskable.png", size: 512, scale: 0.22 }, // safe zone for Android masks
  { file: "src/app/apple-icon.png", size: 180, scale: 0.33 }, // iOS home screen
  { file: "src/app/icon.png", size: 512, scale: 0.33 }, // favicon + <link rel=icon>
];

mkdirSync("public/icons", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

for (const t of targets) {
  await page.setContent(
    `<!doctype html><html><body style="margin:0">
      <div id="mark" style="width:${t.size}px;height:${t.size}px;background:#18181b;display:flex;align-items:center;justify-content:center;">
        <span style="font-family:-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif;font-weight:900;color:#ffffff;letter-spacing:-0.05em;font-size:${Math.round(t.size * t.scale)}px;">792</span>
      </div>
    </body></html>`
  );
  const el = page.locator("#mark");
  await el.screenshot({ path: t.file });
  console.log("wrote", t.file, `${t.size}x${t.size}`);
}

await browser.close();

// remove the default Next.js favicon so app/icon.png takes over
if (existsSync("src/app/favicon.ico")) {
  unlinkSync("src/app/favicon.ico");
  console.log("removed default src/app/favicon.ico");
}

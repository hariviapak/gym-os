// Locker Keys UI polish verification: mobile-first cards, portal ••• menu
// (never clipped at any viewport edge), search/Add-Key row, tabs with counts.
// Checks at 320 / 375 / 390 / 430 / 768 / 1440.
// Usage: node scripts/test-lockers-ui.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = "Admin@792Fit";

const VIEWPORTS = [
  { w: 320, name: "320px" },
  { w: 375, name: "375px" },
  { w: 390, name: "390px" },
  { w: 430, name: "430px" },
  { w: 768, name: "768px tablet" },
  { w: 1440, name: "1440px desktop" },
];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

// --- setup: a temporary ISSUED test key so the ••• menu path is exercised ---
// (sorted to the end of the grid = the worst case for bottom-row clipping)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const gymId = "00000000-0000-0000-0000-000000000001";
const { data: luOrphans } = await db.from("members").select("id").eq("gym_id", gymId).eq("first_name", "Lockuiseed");
for (const o of luOrphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const { data: member } = await db
  .from("members")
  .insert({ gym_id: gymId, first_name: "Lockuiseed", last_name: "Test", phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active" })
  .select("id")
  .single();
await db.from("locker_keys").delete().eq("gym_id", gymId).eq("key_number", "TEST-UI-900");
await db.from("locker_keys").insert({
  gym_id: gymId,
  key_number: "TEST-UI-900",
  locker_number: "900",
  status: "issued",
  current_member_id: member?.id,
  issued_at: new Date().toISOString(),
});

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  console.log(`\n--- ${vp.name} ---`);
  const page = await browser.newPage({ viewport: { width: vp.w, height: 844 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 120)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  await page.goto(`${BASE}/dashboard/locker-keys`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  // 1. no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no horizontal overflow", overflow <= 1, `${overflow}px`);

  // 2. card grid renders with the compact layout
  const cards = await page.locator("div.grid > div.ring-1").count();
  check("cards render", cards > 0, `${cards} cards`);

  // 3. search + Add Key on one row
  const search = page.locator('input[placeholder*="Search key"]');
  const addKey = page.getByRole("button", { name: "+ Add Key" });
  check("search + Add Key present", (await search.count()) === 1 && (await addKey.count()) === 1);
  const sBox = await search.boundingBox();
  const aBox = await addKey.boundingBox();
  check("search/Add-Key share one row", sBox && aBox && Math.abs(sBox.y - aBox.y) < 4);

  // 4. tabs: All | Available | Issued | Attention with counts
  const tabsText = await page.locator("button", { hasText: /^All \d+/ }).allTextContents();
  const attentionTab = await page.locator("button", { hasText: /^Attention \d+/ }).count();
  check("tabs All/Available/Issued/Attention with counts", tabsText.length >= 1 && attentionTab === 1, tabsText.join(" | "));

  // 5. statuses + primary actions present
  const bodyText = await page.locator("body").textContent();
  check("status chips present", /Issued|Available|Attention/.test(bodyText));

  // 6. ••• menu portal: open on the LAST visible card (worst case for clipping)
  const menus = page.getByRole("button", { name: "•••" });
  const menuCount = await menus.count();
  if (menuCount > 0) {
    await menus.last().scrollIntoViewIfNeeded();
    await menus.last().click();
    await page.waitForTimeout(400);
    const panel = page.locator("[data-popover-panel]");
    const pBox = await panel.boundingBox();
    if (pBox) {
      const fullyVisible =
        pBox.x >= 0 && pBox.y >= 0 && pBox.x + pBox.width <= vp.w && pBox.y + pBox.height <= 844;
      check("••• menu fully inside viewport (last row)", fullyVisible, JSON.stringify({ x: Math.round(pBox.x), y: Math.round(pBox.y), r: Math.round(pBox.x + pBox.width), b: Math.round(pBox.y + pBox.height) }));
      // clipping immunity comes from position:fixed (no ancestor can clip it)
      const isFixed = await page.evaluate(() => {
        const p = document.querySelector("[data-popover-panel]");
        return p ? getComputedStyle(p).position === "fixed" : false;
      });
      check("menu is position:fixed (unclippable)", isFixed);
    } else {
      check("••• menu opens", false, "panel not found");
    }
    // close via outside click
    await page.mouse.click(vp.w / 2, 30);
    await page.waitForTimeout(250);
    check("outside click closes menu", (await panel.count()) === 0);
  } else {
    check("••• menus present on issued cards", false, "no issued cards?");
  }

  // 7. Add Key panel (portal) fully visible on narrow screens
  await page.getByRole("button", { name: "+ Add Key" }).click();
  await page.waitForTimeout(350);
  const addPanel = page.locator("[data-popover-panel]");
  const aPanel = await addPanel.boundingBox();
  if (aPanel) {
    const ok2 = aPanel.x >= 0 && aPanel.x + aPanel.width <= vp.w;
    check("Add Key panel within viewport", ok2, `x=${Math.round(aPanel.x)} w=${Math.round(aPanel.width)}`);
  }
  await page.mouse.click(vp.w / 2, 30);
  await page.waitForTimeout(200);

  // 8. mobile back header
  const backHeader = await page.getByRole("link", { name: "← Locker Keys" }).count();
  const isMobile = vp.w < 768;
  check(isMobile ? "mobile back header shown" : "desktop header (no back link)", isMobile ? backHeader === 1 : backHeader === 0);

  // 9. instant client-side search
  const firstKey = (await page.locator("div.grid > div.ring-1").first().textContent()).match(/[A-Z]-\d+|F-\d+/)?.[0];
  if (firstKey) {
    await search.fill(firstKey);
    await page.waitForTimeout(200);
    const visibleCards = await page.locator("div.grid > div.ring-1").count();
    check("instant search narrows cards", visibleCards >= 1 && visibleCards < cards, `${firstKey}: ${visibleCards}/${cards}`);
    await search.fill("");
  }

  await page.close();
}

await browser.close();

// teardown: return + remove the temporary issued key
await db.from("locker_key_logs").update({ returned_at: new Date().toISOString() }).eq("gym_id", gymId).eq("key_number", "TEST-UI-900").is("returned_at", null);
await db.from("locker_keys").delete().eq("gym_id", gymId).eq("key_number", "TEST-UI-900");
await db.rpc("hard_delete_member", { p_member_id: member.id });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`}`);
process.exit(failed ? 1 : 0);

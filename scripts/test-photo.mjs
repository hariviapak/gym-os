// Profile-photo lifecycle e2e (new avatar-flow):
//   (1) upload path: file picker → Adjust Photo (drag + zoom) → Use Photo
//   (2) webcam path: fake media device → Camera modal → Capture → crop
//   (3) processing: 512×512, ≤300KB, JPEG, DB has photo_url + photo_path
//   (4) remove: record cleared + Storage object deleted
//   (5) UI: no permanent photo buttons — avatar + menu only
// Usage: node scripts/test-photo.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "admin@792fitness.com";
const PASSWORD = "Admin@792Fit";
const GYM_ID = "00000000-0000-0000-0000-000000000001";

const env = readFileSync(".env.local", "utf8");
const sbUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const sbKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const anon = createClient(sbUrl, sbKey);
const { data: auth } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const db = createClient(sbUrl, sbKey, {
  global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
});

const { data: tm } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "PhotoTest", last_name: "Member", phone: "91" + Date.now().toString().slice(-10), status: "active" })
  .select()
  .single();
console.log("test member:", tm.id);

// wide camera-style BMP (2000×1200) — proves no blind center-crop is required
function bigBmp(w, h) {
  const rowSize = w * 3;
  const pad = (4 - (rowSize % 4)) % 4;
  const dataSize = (rowSize + pad) * h;
  const buf = Buffer.alloc(54 + dataSize);
  buf.write("BM");
  buf.writeUInt32LE(54 + dataSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(dataSize, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 54 + y * (rowSize + pad) + x * 3;
      buf[i] = (x * 255) / w;
      buf[i + 1] = (y * 255) / h;
      buf[i + 2] = (x * y) % 256;
    }
  }
  return buf;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({
  // fake webcam so the desktop getUserMedia path is exercised end-to-end
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 150)));


// login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);

async function openWidget() {
  await page.goto(`${BASE}/dashboard/members/${tm.id}/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.locator('button[title="Change photo"]').click();
  await page.waitForSelector("text=Change Photo");
}

try {
  // ---------- (1) upload → crop → use ----------
  await openWidget();
  const permBtns = await page.locator("button", { hasText: /Retake Photo|^Replace$|^Remove/ }).count();
  check("no permanent photo buttons on the page", permBtns === 0);
  check("menu shows Take/Upload (no Remove without photo)", (await page.getByRole("button", { name: "Take Photo" }).count()) === 1 && (await page.getByRole("button", { name: "Upload Photo" }).count()) === 1 && (await page.getByRole("button", { name: "Remove Photo" }).count()) === 0);
  await page.getByRole("button", { name: "Cancel" }).click();
  // camera indicator: complete circle, fully inside the avatar (no clipping)
  {
    const badgeOk = await page.evaluate(() => {
      const avatar = document.querySelector('button[title="Change photo"]');
      const badge = avatar?.querySelector("span[aria-hidden]");
      if (!avatar || !badge) return false;
      const a = avatar.getBoundingClientRect();
      const b = badge.getBoundingClientRect();
      const cx = a.left + a.width / 2, cy = a.top + a.height / 2;
      const r = a.width / 2;
      const bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
      return Math.hypot(bcx - cx, bcy - cy) + b.width / 2 + 2 <= r + 0.5;
    });
    check("camera badge is a complete circle inside the avatar", badgeOk);
  }

  // re-open the widget for the upload flow
  await page.locator('button[title="Change photo"]').click();
  await page.waitForSelector("text=Change Photo");
  await page.getByRole("button", { name: "Upload Photo" }).click();
  await page.setInputFiles('input[accept="image/*"]:not([capture])', { name: "wide.bmp", mimeType: "image/bmp", buffer: bigBmp(2000, 1200) });
  await page.waitForSelector("text=Adjust Photo");
  // drag + zoom inside the crop area, then confirm
  const crop = page.locator('div[style*="width: 300px"][style*="height: 300px"]').first();
  const box = await crop.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 - 30, { steps: 4 });
  await page.mouse.up();
  await page.getByLabel("Zoom in").click();
  await page.waitForTimeout(300);
  // WYSIWYG proof, part 1: screenshot of what the user sees in the crop circle
  const cropShot = await page.locator('div[style*="width: 300px"][style*="height: 300px"]').screenshot();
  await page.getByRole("button", { name: "Use Photo" }).click();
  await page.waitForSelector("text=Saving", { state: "detached", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const { data: m1 } = await db.from("members").select("photo_url, photo_path").eq("id", tm.id).single();
  check("record has photo_path + photo_url", !!m1?.photo_path && !!m1?.photo_url, m1?.photo_path ?? "missing");
  check("stored URL is versioned (no stale CDN after replace)", /\?v=\d+/.test(m1?.photo_url ?? ""), m1?.photo_url?.slice(-20) ?? "");

  const { data: obj, error: dlErr } = await db.storage.from("member-photos").download(m1.photo_path);
  check("storage object exists", !!obj && !dlErr, dlErr?.message ?? "");
  if (obj) {
    const buf = Buffer.from(await obj.arrayBuffer());
    check("≤300KB JPEG", buf.length <= 300 * 1024 && buf[0] === 0xff && buf[1] === 0xd8, `${Math.round(buf.length / 1024)}KB`);
  }

  // WYSIWYG proof, part 2: the stored avatar must match the crop preview
  // (grid-sample both over the centre region; jpeg noise stays well under 30)
  if (obj) {
    const avB64 = Buffer.from(await obj.arrayBuffer()).toString("base64");
    const shotB64 = cropShot.toString("base64");
    const meanDiff = await page.evaluate(async ({ avB64, shotB64 }) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const grid = async (src, N) => {
        const img = await load(src);
        const c = document.createElement("canvas");
        c.width = c.height = 512;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, 512, 512);
        const d = x.getImageData(0, 0, 512, 512).data;
        const pts = [];
        for (let gy = 1; gy <= N; gy++)
          for (let gx = 1; gx <= N; gx++) {
            const px = Math.round((512 * (0.2 + 0.6 * gx / (N + 1))));
            const py = Math.round((512 * (0.2 + 0.6 * gy / (N + 1))));
            const i = (py * 512 + px) * 4;
            pts.push([d[i], d[i + 1], d[i + 2]]);
          }
        return pts;
      };
      const a = await grid(`data:image/jpeg;base64,${avB64}`, 6);
      const b = await grid(`data:image/png;base64,${shotB64}`, 6);
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2]);
      return sum / (a.length * 3);
    }, { avB64, shotB64 });
    check("crop preview == final avatar (pixel mean diff < 30)", meanDiff < 30, `meanDiff ${meanDiff.toFixed(1)}`);
  }

  // after upload, Remove becomes available
  await openWidget();
  check("Remove appears once a photo exists", (await page.getByRole("button", { name: "Remove Photo" }).count()) === 1);
  await page.getByRole("button", { name: "Cancel" }).click();

  // ---------- (2) webcam capture → crop → use (replace path) ----------
  await openWidget();
  await page.getByRole("button", { name: "Take Photo" }).click();
  await page.waitForSelector("text=Camera", { timeout: 15000 });
  await page.waitForSelector('video', { timeout: 15000 });
  await page.waitForTimeout(800); // let the fake feed render a frame
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await page.waitForSelector("text=Adjust Photo");
  await page.getByRole("button", { name: "Use Photo" }).click();
  await page.waitForSelector("text=Saving", { state: "detached", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const { data: list } = await db.storage.from("member-photos").list(GYM_ID, { search: tm.id });
  check("replace keeps exactly ONE object", (list ?? []).filter((f) => f.name.startsWith(tm.id)).length === 1);
  const { data: m2 } = await db.from("members").select("photo_path").eq("id", tm.id).single();
  check("path stable after replace", m2.photo_path === m1.photo_path);

  // ---------- (3) remove ----------
  await openWidget();
  await page.getByRole("button", { name: "Remove Photo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove photo" }).click();
  await page.waitForTimeout(2500);
  const { data: m3 } = await db.from("members").select("photo_url, photo_path").eq("id", tm.id).single();
  check("record cleared", !m3.photo_url && !m3.photo_path);
  const { data: list2 } = await db.storage.from("member-photos").list(GYM_ID, { search: tm.id });
  check("storage object deleted", (list2 ?? []).filter((f) => f.name.startsWith(tm.id)).length === 0);

  // ---------- (3b) failed upload must not hang the avatar spinner ----------
  await openWidget();
  await page.getByRole("button", { name: "Upload Photo" }).click();
  await page.setInputFiles('input[accept="image/*"]:not([capture])', { name: "wide.bmp", mimeType: "image/bmp", buffer: bigBmp(1600, 1000) });
  await page.waitForSelector("text=Adjust Photo");
  await page.getByRole("button", { name: "Use Photo" }).click();
  // let it save once so a photo exists (the "replace" failure case)
  await page.waitForTimeout(3000);
  // NOW break the network for the next attempt: abort storage uploads
  await page.route(/supabase\.co\/storage/, (route) => route.abort());
  await openWidget();
  await page.getByRole("button", { name: "Upload Photo" }).click();
  await page.setInputFiles('input[accept="image/*"]:not([capture])', { name: "wide.bmp", mimeType: "image/bmp", buffer: bigBmp(1600, 1000) });
  await page.waitForSelector("text=Adjust Photo");
  await page.getByRole("button", { name: "Use Photo" }).click();
  const failStart = Date.now();
  // the cropper must surface an error and the avatar must be re-enabled
  await page.waitForSelector("text=Couldn't upload the photo", { timeout: 25000 });
  // the crop must stay open with the inline error (no bare Close-only box)
  const keptCrop = (await page.getByRole("button", { name: /Choose other photo|Retake/ }).count()) === 1;
  await page.mouse.click(2, 2); // dismiss via backdrop
  await page.waitForTimeout(600);
  const avatarEnabled = await page.locator('button[title="Change photo"]').isEnabled();
  const noStuckSpinner = !(await page.locator("text=Uploading").count());
  check("failed upload: inline error, crop kept, avatar not stuck", keptCrop && avatarEnabled && noStuckSpinner, `after ${Math.round((Date.now() - failStart) / 1000)}s`);
  await page.unroute(/supabase\.co\/storage/);
  // confirm the previous photo is still intact after the failed replace
  const { data: mStill } = await db.from("members").select("photo_path").eq("id", tm.id).single();
  check("existing photo untouched after failed upload", !!mStill?.photo_path);

  // ---------- (5) empty-state menu after final remove ----------
  await openWidget();
  await page.getByRole("button", { name: "Remove Photo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove photo" }).click();
  await page.waitForTimeout(2500);
  await openWidget();
  check("Remove hidden when no photo", (await page.getByRole("button", { name: "Remove Photo" }).count()) === 0);
} finally {
  try {
    const { error } = await db.rpc("hard_delete_member", { p_member_id: tm.id });
    if (error) console.error("cleanup:", error.message);
  } catch (e) {
    console.error("cleanup:", e.message);
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);

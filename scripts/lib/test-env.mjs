// Shared test-env access. Admin credentials live in .env.local (gitignored)
// — NEVER hardcoded in scripts: this repo is public.
import { readFileSync } from "fs";

export const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);

export function adminPassword() {
  const p = envKeys.ADMIN_PASSWORD;
  if (!p) {
    console.error("Set ADMIN_PASSWORD in .env.local (gitignored — never in the repo)");
    process.exit(1);
  }
  return p;
}

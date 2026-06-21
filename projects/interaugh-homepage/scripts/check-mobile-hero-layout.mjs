import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");

const css = await readFile(path.join(appRoot, "src/app/globals.css"), "utf8");
const landingPage = await readFile(path.join(appRoot, "src/components/landing-page.tsx"), "utf8");
const landingEffects = await readFile(path.join(appRoot, "src/components/landing-page-effects.tsx"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));

const failures = [];
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function mobileBlock(selector) {
  const start = css.indexOf("@media (max-width:920px)");
  const mobileCss = start === -1 ? "" : css.slice(start);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mobileCss.match(new RegExp(`(?:^|[}{])\\s*${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

// Architecture: static markup stays a Server Component, DOM effects isolated client-side.
assert(!landingPage.startsWith('"use client";'), "static landing HTML must remain a Server Component");
assert(landingEffects.startsWith('"use client";'), "DOM effects must stay isolated in the Client Component");

// Build pipeline must stay stable.
assert(packageJson.scripts?.build === "next build --webpack", "build script must keep the stable webpack builder");
assert(
  packageJson.scripts?.check === "pnpm test && pnpm lint && pnpm typecheck && pnpm build",
  "check script must run test, lint, typecheck, and build"
);

// Fonts the design depends on must be loaded.
assert(css.includes("Shippori+Mincho+B1"), "display font (Shippori Mincho) must be imported");
assert(css.includes("Zen+Kaku+Gothic+New"), "body font (Zen Kaku Gothic) must be imported");
assert(css.includes("Space+Mono"), "utility/mono font (Space Mono) must be imported");

// Key sections must exist in the markup so anchors and nav resolve.
for (const id of ["mission", "services", "craft", "contact"]) {
  assert(landingPage.includes(`id="${id}"`), `section #${id} must exist for nav anchors`);
}

// Mobile hero invariants: single-column layout so Japanese copy and the seal never collide.
assert(
  mobileBlock(".hero-grid").includes("grid-template-columns:1fr"),
  "mobile hero must collapse to a single column"
);
assert(
  mobileBlock(".cards").includes("grid-template-columns:1fr"),
  "mobile service cards must stack to one column"
);
assert(mobileBlock(".vrune").includes("display:none"), "vertical side rune must hide on mobile");
assert(mobileBlock(".nav-toggle").includes("display:block"), "mobile nav toggle must be visible on mobile");

// Reduced motion must be respected.
assert(css.includes("prefers-reduced-motion"), "reduced-motion users must get a calmer experience");

// Effects must wire the interactive pieces the markup relies on.
assert(landingEffects.includes("navToggle"), "effects must wire the mobile menu toggle");
assert(landingEffects.includes('"hdr"') || landingEffects.includes("'hdr'"), "effects must toggle the scrolled header");
assert(landingEffects.includes(".reveal"), "effects must drive scroll reveals");

if (failures.length > 0) {
  console.error("Interaugh homepage QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));

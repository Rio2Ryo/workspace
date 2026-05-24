import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");

const css = await readFile(path.join(appRoot, "src/app/globals.css"), "utf8");
const landingPage = await readFile(path.join(appRoot, "src/components/landing-page.tsx"), "utf8");
const landingEffects = await readFile(path.join(appRoot, "src/components/landing-page-effects.tsx"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8"));
const workflow = await readFile(path.join(repoRoot, ".github/workflows/interaugh-homepage.yml"), "utf8");

const failures = [];
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function declarationBlock(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

function mobileDeclarationBlock(selector) {
  const mobileStart = css.lastIndexOf("@media (max-width: 560px)");
  const mobileCss = mobileStart === -1 ? "" : css.slice(mobileStart);
  return declarationBlock(selector, mobileCss);
}

function numberDeclaration(block, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`${escaped}\\s*:\\s*([0-9.]+)px`));
  return match ? Number(match[1]) : null;
}

function hasAll(block, snippets) {
  return snippets.every((snippet) => block.includes(snippet));
}

function workflowBlock(pathParts) {
  const lines = workflow.split(/\r?\n/);
  let start = 0;
  let parentIndent = -1;

  for (const part of pathParts) {
    const matchIndex = lines.findIndex((line, index) => {
      if (index < start) return false;
      const match = line.match(/^(\s*)([^:#]+):/);
      if (!match) return false;
      const indent = match[1].length;
      return indent > parentIndent && match[2].trim() === part;
    });
    if (matchIndex === -1) return "";
    parentIndent = lines[matchIndex].match(/^(\s*)/)?.[1].length ?? 0;
    start = matchIndex + 1;
  }

  const blockLines = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      blockLines.push(line);
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= parentIndent) break;
    blockLines.push(line);
  }
  return blockLines.join("\n");
}

function workflowList(block, key) {
  const lines = block.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  if (keyIndex === -1) return [];
  const keyIndent = lines[keyIndex].match(/^(\s*)/)?.[1].length ?? 0;
  const values = [];
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= keyIndent) break;
    const value = line.match(/^\s*-\s+["']?([^"']+)["']?\s*$/)?.[1];
    if (value) values.push(value);
  }
  return values;
}

function workflowRunCommands(jobBlock) {
  return [...jobBlock.matchAll(/^\s*-\s+run:\s+(.+)$/gm)].map((match) => match[1].trim());
}

function workflowStepBlock(jobBlock, uses) {
  const lines = jobBlock.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(`uses: ${uses}`));
  if (start === -1) return "";
  const stepIndent = lines[start].match(/^(\s*)-\s+/)?.[1].length ?? 0;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      block.push(line);
      continue;
    }
    const nextStep = line.match(/^(\s*)-\s+/);
    if (nextStep && nextStep[1].length === stepIndent) break;
    block.push(line);
  }
  return block.join("\n");
}

const appMetaText = declarationBlock(".app-meta strong,\n.app-meta span");
assert(
  hasAll(appMetaText, ["white-space: nowrap", "word-break: keep-all", "overflow-wrap: normal"]),
  "app meta labels must keep Japanese app text on one line"
);

assert(
  hasAll(declarationBlock(".bcard .bco"), ["white-space: nowrap", "word-break: keep-all"]),
  "business card company names must keep Japanese text on one line"
);

assert(
  hasAll(declarationBlock(".bcard .bname"), ["white-space: nowrap", "word-break: keep-all"]),
  "business card person names must keep Japanese text on one line"
);

const phoneBlock = mobileDeclarationBlock(".hero-stage .phone");
const iconBlock = mobileDeclarationBlock(".app-ic");
const contentBlock = mobileDeclarationBlock(".phone-content");
const rowBlock = mobileDeclarationBlock(".app-row");
const logoBlock = mobileDeclarationBlock(".bcard .logo-mini");
const cardBlock = mobileDeclarationBlock(".bcard");

const phoneWidth = numberDeclaration(phoneBlock, "width");
const phoneHeight = numberDeclaration(phoneBlock, "height");
const iconWidth = numberDeclaration(iconBlock, "width");
const contentPaddingX = Number(contentBlock.match(/padding\s*:\s*[0-9.]+px\s+([0-9.]+)px/)?.[1] ?? NaN);
const rowGap = numberDeclaration(rowBlock, "gap");
const rowPaddingX = Number(rowBlock.match(/padding\s*:\s*[0-9.]+px\s+([0-9.]+)px/)?.[1] ?? NaN);
const logoHeight = numberDeclaration(logoBlock, "height");
const cardPaddingX = Number(cardBlock.match(/padding\s*:\s*[0-9.]+px\s+([0-9.]+)px/)?.[1] ?? NaN);

assert(phoneWidth !== null && phoneWidth >= 140, "mobile hero phone width must stay wide enough for Japanese labels");
assert(phoneHeight !== null && phoneHeight >= 290, "mobile hero phone height must preserve list row spacing");
assert(iconWidth !== null && iconWidth <= 26, "mobile hero app icons must stay compact enough for text");
assert(Number.isFinite(contentPaddingX) && contentPaddingX <= 7, "mobile phone horizontal content padding must stay compact");
assert(rowGap !== null && rowGap <= 5, "mobile app row gap must stay compact");
assert(Number.isFinite(rowPaddingX) && rowPaddingX <= 2, "mobile app row horizontal padding must stay compact");
assert(logoHeight !== null && logoHeight <= 15, "mobile business card logo must not squeeze Japanese names");
assert(Number.isFinite(cardPaddingX) && cardPaddingX <= 16, "mobile business card padding must leave room for Japanese names");

const phoneTextWidth =
  (phoneWidth ?? 0) -
  5 * 2 -
  (Number.isFinite(contentPaddingX) ? contentPaddingX : 999) * 2 -
  (Number.isFinite(rowPaddingX) ? rowPaddingX : 999) * 2 -
  (iconWidth ?? 999) -
  (rowGap ?? 999) * 2 -
  8;
assert(phoneTextWidth >= 70, `mobile hero phone text column is too narrow (${phoneTextWidth}px)`);

const interaughLogoRatio = 923 / 218;
const mobileCardWidth = 210;
const mobileCardHeadGap = 8;
const cardTextWidth =
  mobileCardWidth -
  (Number.isFinite(cardPaddingX) ? cardPaddingX : 999) * 2 -
  mobileCardHeadGap -
  interaughLogoRatio * (logoHeight ?? 999);
assert(cardTextWidth >= 95, `mobile business card text column is too narrow (${Math.round(cardTextWidth)}px)`);

assert(!landingPage.startsWith('"use client";'), "static landing HTML must remain a Server Component");
assert(landingEffects.startsWith('"use client";'), "DOM effects must stay isolated in the Client Component");
assert(packageJson.scripts?.build === "next build --webpack", "build script must keep the stable webpack builder");
assert(
  packageJson.scripts?.check === "pnpm test && pnpm lint && pnpm typecheck && pnpm build",
  "check script must run test, lint, typecheck, and build"
);

const workflowPullRequestPaths = workflowList(workflowBlock(["on", "pull_request"]), "paths");
const workflowPushPaths = workflowList(workflowBlock(["on", "push"]), "paths");
const workflowPermissions = workflowBlock(["permissions"]);
const workflowCheckJob = workflowBlock(["jobs", "check"]);
const workflowCheckRuns = workflowRunCommands(workflowCheckJob);
const workflowSetupNodeStep = workflowStepBlock(workflowCheckJob, "actions/setup-node@v4");

assert(
  workflowPullRequestPaths.includes("projects/interaugh-homepage/**") &&
    workflowPushPaths.includes("projects/interaugh-homepage/**"),
  "CI workflow must run for Interaugh homepage changes"
);
assert(
  workflowPullRequestPaths.includes(".github/workflows/interaugh-homepage.yml") &&
    workflowPushPaths.includes(".github/workflows/interaugh-homepage.yml"),
  "CI workflow must run when its own contract changes"
);
assert(
  workflowPermissions.includes("contents: read"),
  "CI workflow must run with read-only repository contents permission"
);
assert(
  workflowCheckJob.includes("working-directory: projects/interaugh-homepage"),
  "CI workflow must run in the app directory"
);
assert(
  workflowSetupNodeStep.includes("cache-dependency-path: projects/interaugh-homepage/pnpm-lock.yaml"),
  "CI workflow must cache the app lockfile"
);
assert(workflowCheckRuns.includes("pnpm install --frozen-lockfile"), "CI workflow must use the lockfile exactly");
assert(workflowCheckRuns.includes("pnpm check"), "CI workflow must run the full app check");

if (failures.length > 0) {
  console.error("Mobile hero layout QA failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks,
      phoneTextWidth,
      cardTextWidth: Math.round(cardTextWidth),
    },
    null,
    2
  )
);

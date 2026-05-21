import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { deliveryManifestOnepagerVerificationPayload } from './lib/delivery-manifest-utils.mjs';

const [targetDir, name, ...terms] = process.argv.slice(2);

if (!targetDir || !name) {
  emitResult(false, ['Usage: node slide-tool/scripts/verify-onepager.mjs <dir> <name> [required terms...]']);
  process.exit(2);
}

const required = terms.length ? terms : ['課題', '解決', '入力例', '主要機能', '次アクション'];
const htmlPath = path.join(targetDir, `${name}.html`);
const svgPath = path.join(targetDir, `${name}.svg`);
const errors = [];

if (!fs.existsSync(htmlPath)) errors.push(`missing HTML: ${htmlPath}`);
if (!fs.existsSync(svgPath)) errors.push(`missing SVG: ${svgPath}`);

const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
const svg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, 'utf8') : '';
const htmlVisibleText = visibleText(html);
const svgVisibleText = visibleText(svg);

for (const term of required) {
  if (!htmlVisibleText.includes(term)) errors.push(`HTML visible text missing term: ${term}`);
  if (!svgVisibleText.includes(term)) errors.push(`SVG visible text missing term: ${term}`);
}

const svgLooksComplete = /^<svg[\s>]/.test(svg.trim()) && /<\/svg>\s*$/.test(svg);
if (!svgLooksComplete) errors.push('SVG root/open-close check failed');

const xmllint = spawnSync('xmllint', ['--noout', svgPath], { encoding: 'utf8' });
if (xmllint.status !== 0) errors.push(`xmllint failed: ${xmllint.stderr.trim() || xmllint.stdout.trim()}`);

if (errors.length) {
  emitResult(false, errors);
  process.exit(1);
}

emitResult(true, []);

function emitResult(ok, errors) {
  const result = deliveryManifestOnepagerVerificationPayload({
    ok,
    htmlPath,
    svgPath,
    htmlBytes: fs.existsSync(htmlPath) ? fs.statSync(htmlPath).size : 0,
    svgBytes: fs.existsSync(svgPath) ? fs.statSync(svgPath).size : 0,
    required,
    errors,
  });
  const serialized = JSON.stringify(result, null, 2);
  if (ok) console.log(serialized);
  else console.error(serialized);
}

function visibleText(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

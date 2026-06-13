import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TARGET_URL = process.env.E2E_URL || 'https://interaugh-homepage.vercel.app/';
const CDP = process.env.CDP_URL || 'http://127.0.0.1:18800';
const OUT_DIR = process.env.E2E_OUT || path.resolve('qa-reports/mobile-visual');
const VIEWPORTS = [375, 390, 430];

await mkdir(OUT_DIR, { recursive: true });

async function openTab(url) {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`CDP new tab failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function withPage(fn) {
  const tab = await openTab('about:blank');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleEntries = [];
  const networkFailures = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') consoleEntries.push({ type: msg.params.type, text: msg.params.args?.map((a) => a.value ?? a.description ?? '').join(' ') });
    if (msg.method === 'Log.entryAdded') consoleEntries.push({ type: msg.params.entry.level, text: msg.params.entry.text, url: msg.params.entry.url });
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) networkFailures.push({ type: msg.params.type, errorText: msg.params.errorText });
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject, method });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Log.enable');
    return await fn({ send, consoleEntries, networkFailures });
  } finally {
    try { await fetch(`${CDP}/json/close/${tab.id}`); } catch {}
    ws.close();
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const results = [];
for (const width of VIEWPORTS) {
  const result = await withPage(async ({ send, consoleEntries, networkFailures }) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: width, screenHeight: 844 });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await send('Page.navigate', { url: TARGET_URL });
    await wait(2400);
    const evalJS = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result.exceptionDetails) throw new Error(res.result.exceptionDetails.text);
      return res.result.result.value;
    };
    await evalJS(`document.querySelectorAll('.fade-in').forEach(e=>e.classList.add('in'))`);
    const metrics = await evalJS(`(() => {
      const vw = document.documentElement.clientWidth;
      const vh = innerHeight;
      const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const offenders = [...document.querySelectorAll('body *')].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { tag: el.tagName.toLowerCase(), id: el.id, cls: String(el.className || '').slice(0,80), text: (el.innerText || el.alt || '').trim().replace(/\s+/g,' ').slice(0,80), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), display: cs.display, overflowX: cs.overflowX, fontSize: cs.fontSize };
      }).filter(x => x.width > 0 && x.height > 0 && (x.right > vw + 1 || x.left < -1)).slice(0,50);
      const tinyTexts = [...document.querySelectorAll('p, li, a, button, h1, h2, h3, .btn')].map((el) => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0,60), text: (el.innerText || '').trim().replace(/\s+/g,' ').slice(0,80), width: Math.round(r.width), height: Math.round(r.height), fontSize: parseFloat(cs.fontSize), lineHeight: cs.lineHeight, top: Math.round(r.top) };
      }).filter(x => x.fontSize > 0 && x.fontSize < 11 && x.text).slice(0,50);
      const buttons = [...document.querySelectorAll('a, button')].map((el) => {
        const r = el.getBoundingClientRect();
        if (!((el.innerText || '').trim())) return null;
        return { text: el.innerText.trim().replace(/\s+/g,' ').slice(0,80), href: el.getAttribute('href'), width: Math.round(r.width), height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
      }).filter(Boolean);
      const lowTouchTargets = buttons.filter(b => b.width < 44 || b.height < 44).slice(0,30);
      const sections = [...document.querySelectorAll('section, footer, .hero')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.id || null, cls: String(el.className || '').slice(0,80), topAbs: Math.round(r.top + scrollY), height: Math.round(r.height) }; });
      return { vw, vh, sw, docH, overflow: sw - vw, offenders, tinyTexts, lowTouchTargets, sections };
    })()`);
    const maxScroll = Math.max(0, metrics.docH - 844);
    const positions = Array.from(new Set([0, 844, 1688, 2532, 3376, 4220, 5064, 5908, 6752, 7596, 8440, 9284, 10128, 10972, 11816, 12660, 13504, 14348, 15192, 16036, 16880, 17724, 18568, 19412, 20256, maxScroll].filter(y => y <= maxScroll).map(y => Math.round(y))));
    const screenshots = [];
    for (let i = 0; i < positions.length; i += 1) {
      const y = positions[i];
      await evalJS(`window.scrollTo(0, ${y}); document.querySelectorAll('.fade-in').forEach(e=>e.classList.add('in'))`);
      await wait(250);
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = `mobile-${width}-${String(i + 1).padStart(2, '0')}-y${y}.png`;
      await writeFile(path.join(OUT_DIR, file), Buffer.from(shot.result.data, 'base64'));
      screenshots.push({ file, y });
    }
    return { width, metrics, consoleEntries, networkFailures, screenshots };
  });
  results.push(result);
}

await writeFile(path.join(OUT_DIR, 'visual-audit.json'), JSON.stringify({ url: TARGET_URL, results }, null, 2));
console.log(JSON.stringify({ url: TARGET_URL, outDir: OUT_DIR, viewports: VIEWPORTS, summaries: results.map(r => ({ width: r.width, overflow: r.metrics.overflow, offenders: r.metrics.offenders.length, tinyTexts: r.metrics.tinyTexts.length, lowTouchTargets: r.metrics.lowTouchTargets.length, screenshots: r.screenshots.length, networkFailures: r.networkFailures.length })) }, null, 2));

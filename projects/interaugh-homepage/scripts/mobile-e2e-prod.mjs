import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TARGET_URL = process.env.E2E_URL || 'https://interaugh-homepage.vercel.app/';
const CDP = process.env.CDP_URL || 'http://127.0.0.1:18800';
const OUT_DIR = process.env.E2E_OUT || path.resolve('qa-reports/mobile-e2e');

await mkdir(OUT_DIR, { recursive: true });

async function openTab(url) {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`CDP new tab failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const tab = await openTab('about:blank');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
const consoleEntries = [];
const networkFailures = [];
const dialogs = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject, method });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
    else p.resolve(msg);
    return;
  }
  events.push(msg);
  if (msg.method === 'Runtime.consoleAPICalled') {
    consoleEntries.push({
      type: msg.params.type,
      text: msg.params.args?.map((a) => a.value ?? a.description ?? '').join(' '),
    });
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    consoleEntries.push({ type: e.level, text: e.text, url: e.url });
  }
  if (msg.method === 'Network.loadingFailed') {
    const p = msg.params;
    if (!p.canceled) networkFailures.push({ requestId: p.requestId, type: p.type, errorText: p.errorText });
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
    dialogs.push({ type: msg.params.type, message: msg.params.message });
    // Confirm expected contact success alert so the test can continue.
    send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
  });

  const t0 = Date.now();
  await send('Page.navigate', { url: TARGET_URL });
  await new Promise((resolve) => {
    const done = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', done);
        resolve();
      }
    };
    ws.addEventListener('message', done);
  });
  await wait(1800);

  async function evalJS(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.result.exceptionDetails) throw new Error(res.result.exceptionDetails.text);
    return res.result.result.value;
  }

  const initial = await evalJS(`(() => {
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const visibleText = document.body.innerText;
    const sections = [...document.querySelectorAll('[data-screen-label], #contact, #faq')].map(el => ({
      label: el.getAttribute('data-screen-label') || el.id,
      id: el.id || null
    }));
    const offenders = [...document.querySelectorAll('body *')].map(el => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), id: el.id, cls: String(el.className || '').slice(0, 100), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    }).filter(x => x.width > 0 && (x.right > vw + 1 || x.left < -1)).slice(0, 20);
    return {
      title: document.title,
      vw, sw, overflow: sw - vw,
      hasHero: visibleText.includes('見た目は、いつもの名刺'),
      hasCTA: !!document.querySelector('a[href="#contact"].btn'),
      navVisible: getComputedStyle(document.querySelector('.nav')).position,
      sections,
      offenders,
      lcpEntries: performance.getEntriesByType('largest-contentful-paint').map(e => Math.round(e.startTime)),
      cls: performance.getEntriesByType('layout-shift').filter(e => !e.hadRecentInput).reduce((s,e)=>s+e.value,0),
      resourceCount: performance.getEntriesByType('resource').length
    };
  })()`);

  await send('Page.captureScreenshot', { format: 'png', fromSurface: true }).then(async (res) => {
    await writeFile(path.join(OUT_DIR, 'mobile-390-first-view.png'), Buffer.from(res.result.data, 'base64'));
  });

  const anchorResults = [];
  const visibleAnchors = await evalJS(`(() => [...document.querySelectorAll('a[href^="#"]')]
    .filter(a => {
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    })
    .map((a, i) => ({ index: i, href: a.getAttribute('href'), text: a.innerText || a.getAttribute('aria-label') || '' }))
  )()`);
  for (const { index, text } of visibleAnchors) {
    const result = await evalJS(`(async () => {
      const visible = [...document.querySelectorAll('a[href^="#"]')].filter(a => {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      });
      const a = visible[${index}];
      const href = a?.getAttribute('href');
      const target = href && href.length > 1 ? document.querySelector(href) : document.body;
      if (!a) return { index: ${index}, ok: false, reason: 'visible anchor not found' };
      if (!target) return { index: ${index}, href, text: ${JSON.stringify(text)}, ok: false, reason: 'target not found' };
      a.click();
      await new Promise(r => setTimeout(r, 1400));
      const r = target.getBoundingClientRect();
      return { index: ${index}, href, text: ${JSON.stringify(text)}, ok: r.top < 220 && r.bottom > 80, top: Math.round(r.top), bottom: Math.round(r.bottom) };
    })()`);
    anchorResults.push(result);
  }
  const internalHrefAudit = await evalJS(`(() => [...new Set([...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h && h.length > 1))]
    .map(href => ({ href, exists: !!document.querySelector(href), visibleCount: [...document.querySelectorAll('a[href="' + href + '"]')].filter(a => {
      const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    }).length }))
  )()`);

  const faqResult = await evalJS(`(() => {
    const items = [...document.querySelectorAll('details.faq-item')];
    const second = items[1];
    const before = second?.open ?? null;
    second?.querySelector('summary')?.click();
    const after = second?.open ?? null;
    return { count: items.length, secondToggled: before === false && after === true };
  })()`);

  const invalidForm = await evalJS(`(() => {
    const form = document.querySelector('form[data-contact-form="true"]');
    form.querySelector('input[type="email"]').value = 'invalid-email';
    form.querySelector('input[type="text"]').value = '山田 太郎';
    form.querySelector('textarea').value = 'スマホE2Eテストです';
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const browserValid = form.checkValidity();
    return { browserValid, emailValid: form.querySelector('input[type="email"]').validity.valid };
  })()`);

  const validForm = await evalJS(`(() => {
    const form = document.querySelector('form[data-contact-form="true"]');
    form.querySelector('input[type="text"]').value = '山田 太郎';
    form.querySelector('input[type="email"]').value = 'e2e@example.com';
    form.querySelector('textarea').value = 'スマホE2Eテストです';
    form.requestSubmit();
    return { submitted: true, valid: form.checkValidity() };
  })()`);
  await wait(500);

  const final = await evalJS(`(() => {
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    window.scrollTo(0, document.body.scrollHeight);
    const contact = document.querySelector('#contact');
    const c = contact.getBoundingClientRect();
    return { vw, sw, overflow: sw - vw, atContactVisible: c.top < innerHeight && c.bottom > 0 };
  })()`);

  await wait(300);
  await send('Page.captureScreenshot', { format: 'png', fromSurface: true }).then(async (res) => {
    await writeFile(path.join(OUT_DIR, 'mobile-390-contact.png'), Buffer.from(res.result.data, 'base64'));
  });

  const criticalConsole = consoleEntries.filter((e) => ['error', 'assert', 'critical'].includes(e.type));
  const checks = [
    ['page title loaded', /Interaugh/.test(initial.title)],
    ['hero visible', initial.hasHero],
    ['mobile width is 390', initial.vw === 390],
    ['no horizontal overflow initial', initial.overflow <= 1],
    ['no horizontal overflow final', final.overflow <= 1],
    ['main CTA exists', initial.hasCTA],
    ['all visible mobile anchors resolve/scroll', anchorResults.every((r) => r.ok)],
    ['FAQ toggles', faqResult.count >= 6 && faqResult.secondToggled],
    ['invalid email blocked by browser validation', invalidForm.browserValid === false && invalidForm.emailValid === false],
    ['valid form triggers success alert', validForm.valid === true && dialogs.some((d) => d.message.includes('お問い合わせありがとうございます'))],
    ['no critical console errors', criticalConsole.length === 0],
    ['no network loading failures', networkFailures.length === 0],
  ];
  const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);

  const report = {
    url: TARGET_URL,
    viewport: '390x844 mobile DPR3',
    durationMs: Date.now() - t0,
    summary: { passed: failures.length === 0, checksPassed: checks.length - failures.length, checksTotal: checks.length, failures },
    initial,
    anchorResults,
    internalHrefAudit,
    faqResult,
    invalidForm,
    validForm,
    dialogs,
    consoleEntries,
    criticalConsole,
    networkFailures,
    final,
    screenshots: ['mobile-390-first-view.png', 'mobile-390-contact.png'],
  };
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${path.join(OUT_DIR, 'report.json')}`);
  if (failures.length) process.exitCode = 1;
} finally {
  try { await fetch(`${CDP}/json/close/${tab.id}`); } catch {}
  ws.close();
}

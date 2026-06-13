#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = '/Users/umi/.openclaw/workspace';
const WEB_VIEW_DIR = path.join(ROOT, 'tmp/tmux-web-view-source');
const ENV_FILE = path.join(WEB_VIEW_DIR, '.env.local');
const STATE_DIR = path.join(ROOT, 'tmp/tmux-autopilot');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const REPORT_FILE = path.join(STATE_DIR, 'last-report.json');

const argv = new Set(process.argv.slice(2));
const act = argv.has('--act');
const quiet = argv.has('--quiet');
const force = argv.has('--force');
const maxNudges = numberArg('--max-nudges', 6);
const stalledMinutes = numberArg('--stalled-minutes', 20);
const now = Date.now();

const HOSTS = {
  shiro: { kind: 'local' },
  panai: { kind: 'ssh', host: 'panai' },
  gohanai: { kind: 'ssh', host: 'gohanai' },
  sora: { kind: 'ssh', host: 'sora' },
};

const BLOCK_PATTERNS = [
  /permission denied/i,
  /authentication|authorize|oauth|device code|login required/i,
  /password|passphrase|secret|token|api key/i,
  /approve|approval|confirm|are you sure|yes\/no|\by\/n\b/i,
  /delete|remove|rm -rf|drop table|destroy/i,
  /billing|payment|purchase|subscribe|課金/i,
  /本番|production|deploy/i,
  /人間|確認|承認|許可|判断待ち|ブロック/i,
];

const IDLE_PATTERNS = [
  /what would you like/i,
  /how can i help/i,
  /anything else/i,
  /待機中|指示待ち|次の指示/i,
  /[$#%❯>]\s*$/,
];

const NUDGE_TEXT = [
  '自律継続:',
  '現在のスレッド/作業状況から、危険な外部公開・削除・課金・秘密情報の表示を避けて、次に安全に進められる1ステップを実行してください。',
  '人間判断が必要なら、何が必要かを1-3行で明確に残して待機してください。',
].join(' ');

async function runCommand(file, args, options = {}) {
  return execFileAsync(file, args, {
    killSignal: 'SIGKILL',
    ...options,
  });
}

function sshArgs(host, command) {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=5',
    '-o',
    'ServerAliveInterval=5',
    '-o',
    'ServerAliveCountMax=1',
    host,
    command,
  ];
}

function numberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function readEnvValue(key) {
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return '';
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

function loadTargets() {
  return JSON.parse(readEnvValue('NEXT_PUBLIC_TMUX_TARGETS_JSON'));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sessions: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sessionKey(host, session) {
  return `${host}/${session}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function tmuxCapture(host, session) {
  const target = HOSTS[host];
  if (!target) throw new Error(`Unknown host: ${host}`);
  const args = ['capture-pane', '-pt', session, '-S', '-100'];
  if (target.kind === 'local') {
    const { stdout } = await runCommand('tmux', args, { timeout: 10000, maxBuffer: 1024 * 1024 });
    return stdout;
  }
  const { stdout } = await runCommand(
    'ssh',
    sshArgs(target.host, `TERM=xterm-256color tmux capture-pane -pt ${shellQuote(session)} -S -100`),
    { timeout: 15000, maxBuffer: 1024 * 1024 },
  );
  return stdout;
}

async function tmuxSend(host, session, text) {
  const target = HOSTS[host];
  if (!target) throw new Error(`Unknown host: ${host}`);
  if (target.kind === 'local') {
    await runCommand('tmux', ['send-keys', '-t', session, '-l', '--', text], { timeout: 10000 });
    await runCommand('tmux', ['send-keys', '-t', session, 'Enter'], { timeout: 10000 });
    return;
  }
  await runCommand(
    'ssh',
    sshArgs(target.host, `TERM=xterm-256color tmux send-keys -t ${shellQuote(session)} -l -- ${shellQuote(text)}`),
    { timeout: 15000 },
  );
  await runCommand(
    'ssh',
    sshArgs(target.host, `TERM=xterm-256color tmux send-keys -t ${shellQuote(session)} Enter`),
    { timeout: 15000 },
  );
}

function classify(output, previous) {
  const normalized = output.trim();
  const recent = normalized.split('\n').slice(-35).join('\n');
  const outputHash = hash(normalized);
  const changed = previous?.hash !== outputHash;
  const lastChangedAt = changed ? now : previous?.lastChangedAt || now;
  const stalledMs = now - lastChangedAt;
  const blocked = BLOCK_PATTERNS.find((pattern) => pattern.test(recent))?.source || '';
  const idlePrompt = IDLE_PATTERNS.some((pattern) => pattern.test(recent.slice(-1200)));
  const stale = stalledMs >= stalledMinutes * 60 * 1000;
  const recentlyNudged = previous?.lastNudgedAt && now - previous.lastNudgedAt < 30 * 60 * 1000;
  const shouldNudge = !blocked && !recentlyNudged && (force || idlePrompt || stale);
  return { outputHash, changed, lastChangedAt, stalledMs, blocked, idlePrompt, stale, recentlyNudged, shouldNudge };
}

async function main() {
  const targetsByHost = loadTargets();
  const state = loadState();
  const report = [];
  let nudges = 0;

  for (const [host, sessions] of Object.entries(targetsByHost)) {
    for (const session of sessions) {
      const key = sessionKey(host, session);
      const previous = state.sessions[key] || {};
      try {
        const output = await tmuxCapture(host, session);
        const status = classify(output, previous);
        const entry = {
          key,
          host,
          session,
          status: status.blocked ? 'blocked' : status.shouldNudge ? 'nudge-ready' : status.stale ? 'stale' : status.idlePrompt ? 'idle' : 'active',
          blocked: Boolean(status.blocked),
          blockPattern: status.blocked || undefined,
          idlePrompt: status.idlePrompt,
          staleMinutes: Math.round(status.stalledMs / 60000),
          acted: false,
        };

        state.sessions[key] = {
          hash: status.outputHash,
          lastSeenAt: now,
          lastChangedAt: status.lastChangedAt,
          lastNudgedAt: previous.lastNudgedAt,
          nudgeCount: previous.nudgeCount || 0,
        };

        if (act && status.shouldNudge && nudges < maxNudges) {
          await tmuxSend(host, session, NUDGE_TEXT);
          state.sessions[key].lastNudgedAt = now;
          state.sessions[key].nudgeCount += 1;
          entry.acted = true;
          entry.status = 'nudged';
          nudges += 1;
        }

        report.push(entry);
      } catch (error) {
        report.push({
          key,
          host,
          session,
          status: 'error',
          error: error?.message || String(error),
          acted: false,
        });
      }
    }
  }

  saveState(state);
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify({ capturedAt: new Date(now).toISOString(), act, nudges, report }, null, 2)}\n`);

  if (!quiet) {
    const summary = report.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({ act, nudges, summary, report }, null, 2));
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = '/Users/umi/.openclaw/workspace';
const STATE_DIR = path.join(ROOT, 'state/shiro-loop');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const REPORT_FILE = path.join(STATE_DIR, 'last-report.json');
const EVENTS_FILE = path.join(STATE_DIR, 'events.jsonl');

const argv = new Set(process.argv.slice(2));
const act = argv.has('--act');
const quiet = argv.has('--quiet');
const json = argv.has('--json') || quiet;
const force = argv.has('--force');
const now = Date.now();

const staleMinutes = numberArg('--stale-minutes', 30);
const notifyCooldownMinutes = numberArg('--notify-cooldown-minutes', 240);
const nudgeCooldownMinutes = numberArg('--nudge-cooldown-minutes', 45);
const captureLines = numberArg('--capture-lines', 80);
const maxNudges = numberArg('--max-nudges', 8);

const HIGH_RISK = [
  /push\b|git push/i,
  /deploy|vercel|production|本番|外部公開|公開/i,
  /env|environment|secret|token|api key|credentials|oauth|password/i,
  /delete|remove|rm -rf|drop table|migration|migrate|削除|破壊/i,
  /billing|payment|paid|purchase|課金|有料|予算/i,
  /承認|確認|判断|Yakon|permission-wait|approval/i,
];

const BLOCKED = [
  /blocked|blocker|ブロック|詰まり|待ち/i,
  /permission denied|missing access|認証|login required|credentials/i,
  /could not|failed|error/i,
];

const COMPLETED = [
  /completed|complete|done|finished|pass(?:ed)?\b/i,
  /完了|完遂|通過|pass|成功/i,
];

const ACTIVE = [
  /running|thinking|tokens|shell command|musing|clauding/i,
  /実行中|処理中|検証中|継続|確認中/i,
];

const PROMPT = [
  /❯\s*$/,
  /[$#%>]\s*$/,
  /what would you like/i,
  /how can i help/i,
  /指示待ち|待機中/i,
];

const EXTERNAL_ACTION = [
  /push\b|git push/i,
  /deploy|vercel --prod|production|本番|外部公開|公開/i,
  /wrangler d1|migration|migrate|drop table/i,
  /cloudflared|tunnel|env|environment|secret|token|api key|credentials|oauth|password/i,
  /app store connect|testflight|asc|google oauth|oauth uri|line developers|supabase|stripe|recaptcha/i,
  /delete|remove|rm -rf|削除|破壊/i,
  /billing|payment|paid|purchase|課金|有料|予算|生成API/i,
  /管理者登録|アップロード|本番DB/i,
];

const DONE_SIGNOFF = [
  /\[DONE\]|done designation|完了サイン|完了候補|技術的には完了|no local code changes needed|no issues found/i,
];

const DELEGATE_ACTION = [
  /sora|ao-vps|director|該当スレッド|discord.*投稿|実施依頼|missing access|転送|他担当|sora-vps/i,
];

const SELF_ACTION = [
  /credentials\.json|配置|検出|local-only|ローカル|read-only|smoke|検証|差分確認|整理|調査/i,
];

const BASE_NUDGE_RULES = [
  'Shiro loop tick:',
  'Gather current context, take exactly one safe local action, then verify it.',
  'Do not push, deploy, change production/env, delete data, expose secrets, or spend money.',
  'End with Japanese status: action taken, remaining blocker if any, and next check time.',
];

function numberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function run(file, args, options = {}) {
  return execFileAsync(file, args, {
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { version: 1, sessions: {}, lastRunAt: null };
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function appendEvents(events) {
  if (!events.length) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(EVENTS_FILE, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
}

async function listShiroSessions() {
  const { stdout } = await run('tmux', ['list-sessions', '-F', '#S']);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((session) => session.startsWith('shiro-'));
}

async function captureSession(session) {
  const { stdout } = await run('tmux', ['capture-pane', '-pt', `${session}:0.0`, '-S', `-${captureLines}`]);
  return stdout;
}

function nudgeText(status) {
  const reason = status.reason ? `Current evidence: ${status.reason}` : '';
  if (status.decisionKind === 'external-action') {
    return [
      ...BASE_NUDGE_RULES,
      reason,
      'This is not a stop state. First separate safe local verification from truly external/high-risk work.',
      'If safe local verification is possible, do it now.',
      'If only external/high-risk work remains, prepare a concrete Yakon approval packet now: scope, exact command/action, rollback, risk, recommended option, deadline, and consequence of waiting.',
      'Do not ask Yakon yet unless the packet is concrete enough to answer with yes/no.',
    ].filter(Boolean).join(' ');
  }
  if (status.decisionKind === 'done-signoff') {
    return [
      ...BASE_NUDGE_RULES,
      reason,
      'Prepare the [DONE] sign-off note now: completion evidence, tests, working tree/deploy status, residual risks, and whether any external/production change happened.',
      'Do not mark [DONE] yourself before Yakon approval.',
    ].filter(Boolean).join(' ');
  }
  if (status.decisionKind === 'needs-yakon') {
    return [
      ...BASE_NUDGE_RULES,
      reason,
      'Reduce this to one concrete decision question for Yakon with a recommended answer and impact of waiting.',
    ].filter(Boolean).join(' ');
  }
  return [
    ...BASE_NUDGE_RULES,
    reason,
    'If there is safe local work, do it now without waiting for Yakon.',
  ].filter(Boolean).join(' ');
}

async function sendNudge(session, status) {
  await run('tmux', ['send-keys', '-t', `${session}:0.0`, '-l', '--', nudgeText(status)]);
  await run('tmux', ['send-keys', '-t', `${session}:0.0`, 'Enter']);
}

function matches(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function cleanLine(line) {
  return line
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[│┃┆┊╎╏║]/g, ' ')
    .replace(/[╭╮╰╯─━═]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceLine(recent) {
  const patterns = [
    ...HIGH_RISK,
    ...EXTERNAL_ACTION,
    ...DONE_SIGNOFF,
    ...DELEGATE_ACTION,
    ...SELF_ACTION,
    ...BLOCKED,
  ];
  const lines = recent.split('\n').map(cleanLine).filter(Boolean);
  return [...lines].reverse().find((line) => matches(patterns, line)) || lines.at(-1) || '';
}

function decisionDetails(state, recent, highRisk) {
  const evidence = evidenceLine(recent);
  if (state === 'done-candidate' || matches(DONE_SIGNOFF, recent)) {
    return {
      decisionKind: 'done-signoff',
      risk: 'low',
      reason: evidence,
      next: 'Report completion evidence, residual risk, and external-change status for [DONE] confirmation.',
    };
  }
  if (highRisk || state === 'permission-wait') {
    const external = matches(EXTERNAL_ACTION, recent);
    return {
      decisionKind: external ? 'external-action' : 'needs-yakon',
      risk: external ? 'high' : 'mid',
      reason: evidence,
      next: external
        ? 'Prepare approval packet with scope, rollback, risk, and recommended action.'
        : 'Reduce choices to one recommendation and ask Yakon for the decision.',
    };
  }
  if (matches(DELEGATE_ACTION, recent)) {
    return {
      decisionKind: 'delegate',
      risk: 'low',
      reason: evidence,
      next: 'Mention the target Director in the relevant thread with purpose, action, ETA, and report format.',
    };
  }
  if (state === 'needs-action' || matches(SELF_ACTION, recent)) {
    return {
      decisionKind: 'self-action',
      risk: 'low',
      reason: evidence,
      next: 'Continue local verification, cleanup, or re-nudge without asking Yakon.',
    };
  }
  return {
    decisionKind: 'watch',
    risk: 'low',
    reason: evidence,
    next: 'Keep watching for a state change.',
  };
}

function classify(output, previous) {
  const trimmed = output.trim();
  const recent = trimmed.split('\n').slice(-45).join('\n');
  const fingerprint = hash(recent);
  const changed = previous?.fingerprint !== fingerprint;
  const lastChangedAt = changed ? now : previous?.lastChangedAt || now;
  const staleMs = now - lastChangedAt;
  const highRisk = matches(HIGH_RISK, recent);
  const blocked = matches(BLOCKED, recent);
  const completed = matches(COMPLETED, recent);
  const active = matches(ACTIVE, recent);
  const prompt = matches(PROMPT, recent.slice(-1400));

  let state = 'running';
  if (highRisk) state = 'permission-wait';
  else if (blocked) state = 'blocked';
  else if (completed && prompt) state = 'done-candidate';
  else if (prompt && staleMs >= staleMinutes * 60 * 1000) state = 'needs-action';
  else if (prompt) state = 'idle';
  else if (active) state = 'running';

  const blockerHash = state === 'permission-wait' || state === 'blocked'
    ? hash(recent.replace(/\s+/g, ' ').slice(-1600))
    : null;
  const decision = decisionDetails(state, recent, highRisk);

  return {
    state,
    ...decision,
    changed,
    fingerprint,
    blockerHash,
    lastChangedAt,
    staleMinutes: Math.round(staleMs / 60000),
    highRisk,
    prompt,
    recent: recent.split('\n').slice(-8).join('\n'),
  };
}

function shouldNotify(session, status, previous) {
  if (status.state === 'running' || status.state === 'idle') return false;
  const cooldownElapsed = !previous?.lastNotifiedAt || now - previous.lastNotifiedAt >= notifyCooldownMinutes * 60 * 1000;
  if (status.changed && previous?.state !== status.state) return true;
  if (status.blockerHash && previous?.blockerHash !== status.blockerHash) return true;
  if (status.state === 'done-candidate' && previous?.state !== 'done-candidate') return true;
  return force || cooldownElapsed && ['needs-action', 'blocked'].includes(status.state);
}

function shouldNudge(status, previous) {
  if (!act) return false;
  const needsApprovalPacket = status.state === 'permission-wait'
    && ['external-action', 'needs-yakon', 'done-signoff'].includes(status.decisionKind);
  const needsBlockedRefine = status.state === 'blocked';
  const needsStalePromptAction = status.state === 'needs-action';
  const shouldActOnState = needsApprovalPacket || needsBlockedRefine || needsStalePromptAction;
  if (!shouldActOnState) return false;
  if (status.highRisk && !needsApprovalPacket) return false;
  if (previous?.lastNudgedAt && now - previous.lastNudgedAt < nudgeCooldownMinutes * 60 * 1000) return false;
  return true;
}

function eventFor(session, status, previous, acted) {
  let kind = 'state-change';
  if (status.state === 'permission-wait') kind = 'needs-human';
  if (status.state === 'blocked') kind = 'blocked';
  if (status.state === 'done-candidate') kind = 'done-candidate';
  if (acted) kind = 'nudged';
  return {
    ts: new Date(now).toISOString(),
    session,
    kind,
    state: status.state,
    previousState: previous?.state || null,
    staleMinutes: status.staleMinutes,
    acted,
  };
}

async function main() {
  const state = loadState();
  const sessions = await listShiroSessions();
  const results = [];
  const notifications = [];
  const events = [];
  let nudges = 0;

  const inspected = [];
  for (const session of sessions) {
    const previous = state.sessions[session] || {};
    try {
      const output = await captureSession(session);
      const status = classify(output, previous);
      inspected.push({ session, previous, status });
    } catch (error) {
      inspected.push({ session, previous, error });
    }
  }

  inspected.sort((a, b) => {
    const aNeeds = a.status && shouldNudge(a.status, a.previous) ? 1 : 0;
    const bNeeds = b.status && shouldNudge(b.status, b.previous) ? 1 : 0;
    if (aNeeds !== bNeeds) return bNeeds - aNeeds;
    return (b.status?.staleMinutes || 0) - (a.status?.staleMinutes || 0);
  });

  for (const item of inspected) {
    const { session, previous, status, error } = item;
    if (error) {
      const event = {
        ts: new Date(now).toISOString(),
        session,
        kind: 'inspect-error',
        state: 'error',
        error: error?.message || String(error),
      };
      results.push(event);
      notifications.push(event);
      events.push(event);
      continue;
    }
    try {
      let acted = false;

      if (shouldNudge(status, previous) && nudges < maxNudges) {
        await sendNudge(session, status);
        acted = true;
        nudges += 1;
      }

      const notify = shouldNotify(session, status, previous) || acted;
      const next = {
        session,
        state: status.state,
        decisionKind: status.decisionKind,
        risk: status.risk,
        reason: status.reason,
        next: status.next,
        staleMinutes: status.staleMinutes,
        changed: status.changed,
        acted,
        notify,
      };
      results.push(next);

      if (notify) {
        const event = eventFor(session, status, previous, acted);
        events.push(event);
        notifications.push({
          ...event,
          decisionKind: status.decisionKind,
          risk: status.risk,
          reason: status.reason,
          next: status.next,
          excerpt: status.recent,
        });
      }

      state.sessions[session] = {
        state: status.state,
        decisionKind: status.decisionKind,
        risk: status.risk,
        reason: status.reason,
        next: status.next,
        fingerprint: status.fingerprint,
        blockerHash: status.blockerHash,
        lastSeenAt: now,
        lastChangedAt: status.lastChangedAt,
        lastNudgedAt: acted ? now : previous.lastNudgedAt || null,
        lastNotifiedAt: notify ? now : previous.lastNotifiedAt || null,
      };
    } catch (error) {
      const event = {
        ts: new Date(now).toISOString(),
        session,
        kind: 'inspect-error',
        state: 'error',
        error: error?.message || String(error),
      };
      results.push(event);
      notifications.push(event);
      events.push(event);
    }
  }

  state.lastRunAt = now;
  saveState(state);
  appendEvents(events);

  const summary = results.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});

  const report = {
    ts: new Date(now).toISOString(),
    act,
    sessions: sessions.length,
    nudges,
    summary,
    notifications,
    results,
  };

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`shiro-loop-tick ${new Date(now).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    console.log(`sessions=${sessions.length} nudges=${nudges} notifications=${notifications.length}`);
    console.log(JSON.stringify(summary));
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

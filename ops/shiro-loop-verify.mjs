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
const REPORT_FILE = path.join(STATE_DIR, 'last-verifier-report.json');
const RULES_FILE = path.join(STATE_DIR, 'learned-rules.json');
const EVENTS_FILE = path.join(STATE_DIR, 'events.jsonl');

const argv = new Set(process.argv.slice(2));
const json = argv.has('--json') || argv.has('--quiet');
const distill = argv.has('--distill');
const captureLines = numberArg('--capture-lines', 120);
const now = Date.now();

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

const DONE_EVIDENCE = [
  /\[DONE\]|done designation|完了サイン|完了候補|技術的には完了|no local code changes needed|no issues found/i,
  /tests? pass|build pass|working tree clean|検証完了|ローカル.*完了/i,
];

const SELF_ACTION = [
  /credentials\.json|配置|検出|local-only|ローカル|read-only|smoke|検証|差分確認|整理|調査/i,
  /continue|next command|cron watcher|safe local|no blocker remains/i,
];

const DELEGATE_ACTION = [
  /sora|ao-vps|director|該当スレッド|discord.*投稿|実施依頼|missing access|転送|他担当|sora-vps/i,
];

const HUMAN_WORDS = [
  /Yakon|承認|判断|確認|approval|approve|permission|option [abc]|選択肢/i,
];

const GENERIC_NEXT = [
  /^Prepare approval packet with scope, rollback, risk, and recommended action\.$/,
  /^Report completion evidence, residual risk, and external-change status for \[DONE\] confirmation\.$/,
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

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function appendEvents(events) {
  if (!events.length) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(EVENTS_FILE, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
}

async function captureSession(session) {
  const { stdout } = await run('tmux', ['capture-pane', '-pt', `${session}:0.0`, '-S', `-${captureLines}`]);
  return stdout;
}

function cleanLine(line) {
  return line
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[│┃┆┊╎╏║]/g, ' ')
    .replace(/[╭╮╰╯─━═]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function evidenceLine(output) {
  const patterns = [...EXTERNAL_ACTION, ...DONE_EVIDENCE, ...SELF_ACTION, ...DELEGATE_ACTION, ...HUMAN_WORDS];
  const lines = output.split('\n').map(cleanLine).filter(Boolean);
  return [...lines].reverse().find((line) => matches(patterns, line)) || lines.at(-1) || '';
}

function concreteEnough(text) {
  if (!text) return false;
  if (GENERIC_NEXT.some((pattern) => pattern.test(text.trim()))) return false;
  return text.trim().length >= 24;
}

function recommendedDecision(output, info) {
  const text = output || '';
  const hasExternal = matches(EXTERNAL_ACTION, text);
  const hasDone = matches(DONE_EVIDENCE, text);
  const hasSelfAction = matches(SELF_ACTION, text);
  const hasDelegate = matches(DELEGATE_ACTION, text);
  const hasHuman = matches(HUMAN_WORDS, text);

  if (hasDone && !hasExternal) {
    return {
      decisionKind: 'done-signoff',
      risk: 'low',
      consultRequired: true,
      canProceedWithoutYakon: false,
      recommendedAction: 'Ask Yakon for [DONE] sign-off with evidence and residual risk.',
    };
  }
  if (hasExternal || hasHuman || info.state === 'permission-wait') {
    return {
      decisionKind: hasExternal ? 'external-action' : 'needs-yakon',
      risk: hasExternal ? 'high' : 'mid',
      consultRequired: true,
      canProceedWithoutYakon: false,
      recommendedAction: hasExternal
        ? 'Prepare one approval packet: scope, exact command/action, rollback, risk, recommended option.'
        : 'Ask one concrete decision question with a recommended answer.',
    };
  }
  if (hasDelegate) {
    return {
      decisionKind: 'delegate',
      risk: 'low',
      consultRequired: false,
      canProceedWithoutYakon: true,
      recommendedAction: 'Send a mention-based Director instruction in the relevant thread.',
    };
  }
  if (hasSelfAction || info.state === 'needs-action') {
    return {
      decisionKind: 'self-action',
      risk: 'low',
      consultRequired: false,
      canProceedWithoutYakon: true,
      recommendedAction: 'Continue one low-risk local action, then verify and update state.',
    };
  }
  return {
    decisionKind: 'watch',
    risk: 'low',
    consultRequired: false,
    canProceedWithoutYakon: false,
    recommendedAction: 'Keep watching for changed output or a new prompt.',
  };
}

function verifySession(session, info, output) {
  const decision = recommendedDecision(output, info);
  const findings = [];
  const evidence = evidenceLine(output);
  const kindMismatch = info.decisionKind && info.decisionKind !== decision.decisionKind;
  const riskMismatch = info.risk && info.risk !== decision.risk;

  if (kindMismatch) findings.push(`decisionKind mismatch: state=${info.decisionKind} verifier=${decision.decisionKind}`);
  if (riskMismatch) findings.push(`risk mismatch: state=${info.risk} verifier=${decision.risk}`);
  if (!concreteEnough(info.reason || evidence)) findings.push('reason is too generic or missing');
  if (!concreteEnough(info.next || decision.recommendedAction)) findings.push('next action is too generic or missing');
  if (decision.consultRequired && !matches(HUMAN_WORDS, output) && decision.decisionKind !== 'external-action') {
    findings.push('consult required but no clear human decision text was found');
  }

  const score = Math.max(0, 100 - findings.length * 22 - (kindMismatch ? 12 : 0) - (riskMismatch ? 8 : 0));
  const verdict = findings.length ? 'needs-refine' : 'verified';

  return {
    session,
    verdict,
    score,
    state: info.state || 'unknown',
    decisionKind: decision.decisionKind,
    risk: decision.risk,
    consultRequired: decision.consultRequired,
    canProceedWithoutYakon: decision.canProceedWithoutYakon,
    reason: evidence || info.reason || '',
    recommendedAction: decision.recommendedAction,
    findings,
    outputHash: hash(output.split('\n').slice(-45).join('\n')),
  };
}

function buildDistill(results) {
  const external = results.filter((item) => item.decisionKind === 'external-action');
  const done = results.filter((item) => item.decisionKind === 'done-signoff');
  const refine = results.filter((item) => item.verdict !== 'verified');
  const self = results.filter((item) => item.canProceedWithoutYakon);

  const rules = [
    {
      id: 'no-raw-permission-wait',
      rule: 'Never present raw permission-wait counts without decisionKind, risk, reason, and next action.',
      evidence: `${external.length} external-action / ${done.length} done-signoff in latest verifier run`,
    },
    {
      id: 'verify-before-consult',
      rule: 'Before asking Yakon, verifier must confirm the item is external-action, needs-yakon, or done-signoff.',
      evidence: `${refine.length} sessions need classification refinement`,
    },
    {
      id: 'self-action-without-yakon',
      rule: 'If verifier marks canProceedWithoutYakon=true, Shiro should run one low-risk local action before reporting.',
      evidence: `${self.length} sessions are currently self-action/delegate candidates`,
    },
  ];

  return { rules, summary: { external: external.length, done: done.length, refine: refine.length, self: self.length } };
}

async function main() {
  const state = readJson(STATE_FILE, { version: 1, sessions: {} });
  const sessions = Object.entries(state.sessions || {});
  const results = [];
  const events = [];

  for (const [session, info] of sessions) {
    try {
      const output = await captureSession(session);
      const verified = verifySession(session, info, output);
      results.push(verified);
      const previousVerifier = info.verifier || {};
      const changed = previousVerifier.outputHash !== verified.outputHash
        || previousVerifier.verdict !== verified.verdict
        || previousVerifier.decisionKind !== verified.decisionKind;

      state.sessions[session] = {
        ...info,
        verifier: {
          verdict: verified.verdict,
          score: verified.score,
          decisionKind: verified.decisionKind,
          risk: verified.risk,
          consultRequired: verified.consultRequired,
          canProceedWithoutYakon: verified.canProceedWithoutYakon,
          reason: verified.reason,
          recommendedAction: verified.recommendedAction,
          findings: verified.findings,
          outputHash: verified.outputHash,
          verifiedAt: now,
        },
      };

      if (changed) {
        events.push({
          ts: new Date(now).toISOString(),
          session,
          kind: 'verified',
          state: info.state || 'unknown',
          verifierVerdict: verified.verdict,
          decisionKind: verified.decisionKind,
          risk: verified.risk,
        });
      }
    } catch (error) {
      results.push({
        session,
        verdict: 'inspect-error',
        score: 0,
        state: info.state || 'unknown',
        decisionKind: info.decisionKind || 'watch',
        risk: info.risk || 'low',
        consultRequired: false,
        canProceedWithoutYakon: false,
        reason: error?.message || String(error),
        recommendedAction: 'Fix verifier inspection error.',
        findings: [error?.message || String(error)],
      });
    }
  }

  const distillation = buildDistill(results);
  const summary = results.reduce((acc, item) => {
    acc[item.decisionKind] = (acc[item.decisionKind] || 0) + 1;
    return acc;
  }, {});
  const verdictSummary = results.reduce((acc, item) => {
    acc[item.verdict] = (acc[item.verdict] || 0) + 1;
    return acc;
  }, {});

  const report = {
    ts: new Date(now).toISOString(),
    sessions: results.length,
    summary,
    verdictSummary,
    distillation,
    consultItems: results.filter((item) => item.consultRequired),
    selfActionItems: results.filter((item) => item.canProceedWithoutYakon),
    refineItems: results.filter((item) => item.verdict !== 'verified'),
    results,
  };

  state.lastVerifiedAt = now;
  writeJson(STATE_FILE, state);
  writeJson(REPORT_FILE, report);
  writeJson(RULES_FILE, {
    updatedAt: new Date(now).toISOString(),
    sourceReport: REPORT_FILE,
    ...distillation,
  });
  appendEvents(events);

  if (distill) {
    const memoryFile = path.join(ROOT, `memory/${new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })}.md`);
    const lines = [
      '',
      `## ${new Date(now).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })} JST — Shiro Loop verifier distill`,
      `- Verifier summary: ${JSON.stringify(summary)} / verdicts ${JSON.stringify(verdictSummary)}.`,
      `- Learned: ${distillation.rules.map((item) => item.rule).join(' / ')}`,
    ];
    fs.appendFileSync(memoryFile, `${lines.join('\n')}\n`);
  }

  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`shiro-loop-verify ${new Date(now).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    console.log(`sessions=${results.length}`);
    console.log(JSON.stringify({ summary, verdictSummary }));
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

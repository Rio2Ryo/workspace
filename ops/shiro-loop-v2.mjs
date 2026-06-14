#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = '/Users/umi/.openclaw/workspace';
const V1_STATE_FILE = path.join(ROOT, 'state/shiro-loop/state.json');
const VERIFIER_FILE = path.join(ROOT, 'state/shiro-loop/last-verifier-report.json');
const TASK_MAP_FILE = path.join(ROOT, 'ops/task-session-map.json');
const POLICY_FILE = path.join(ROOT, 'ops/session-policies.json');
const V2_DIR = path.join(ROOT, 'state/shiro-loop-v2');
const LOOP_FILE = path.join(V2_DIR, 'loops.json');
const NEXT_ACTIONS_FILE = path.join(V2_DIR, 'next-actions.md');

const argv = new Set(process.argv.slice(2));
const write = argv.has('--write');
const json = argv.has('--json') || write;
const now = Date.now();

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

async function run(file, args, options = {}) {
  return execFileAsync(file, args, {
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

async function listTmuxSessions() {
  try {
    const { stdout } = await run('tmux', ['list-sessions', '-F', '#S']);
    return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mapBySession(taskMap) {
  const entries = Array.isArray(taskMap.sessions) ? taskMap.sessions : [];
  return new Map(entries.map((item) => [item.tmuxSession || item.sessionName, item]).filter(([key]) => key));
}

function policyFor(session, policies) {
  return policies.sessions?.[session] || policies.default || {};
}

function baseGoal(session, task) {
  if (task?.title) return task.title;
  if (task?.project) return `${task.project}: unresolved thread work`;
  return `${session}: unresolved thread work`;
}

function buildLoop({ session, task, policy, v1, verifier }) {
  const state = v1?.state || 'unknown';
  const decisionKind = verifier?.decisionKind || v1?.decisionKind || 'watch';
  const risk = verifier?.risk || v1?.risk || 'low';
  const consultRequired = Boolean(verifier?.consultRequired)
    || ['external-action', 'needs-yakon', 'done-signoff'].includes(decisionKind)
    || state === 'permission-wait';
  const canAutoProceed = !consultRequired
    && !['blocked', 'permission-wait', 'done-candidate'].includes(state)
    && risk === 'low';

  return {
    session,
    title: task?.title || session,
    threadId: task?.discordThreadId || null,
    host: task?.host || 'shiro',
    assigneeId: task?.assigneeId || null,
    project: task?.project || null,
    goal: baseGoal(session, task),
    loop: {
      discover: 'Read thread context, tmux output, repo status, and prior memory before acting.',
      plan: 'Choose one next action that moves toward the goal without mixing risk levels.',
      execute: canAutoProceed
        ? 'Run exactly one low-risk local action, then stop for verification.'
        : 'Do not execute high-risk work. Prepare a concrete approval packet or done sign-off.',
      verify: 'Use a separate verifier pass. The executor is not allowed to mark itself complete.',
      iterate: 'If verification fails, refine the packet/action. If it passes, update state and report only changed, decision-ready items.',
    },
    passCriteria: [
      'Goal-specific output or code change exists.',
      'Relevant tests, build, smoke test, or manual check are recorded.',
      'Working tree, deploy/push status, and production/external-change status are explicit.',
      'Residual risks are written in user-facing Japanese.',
      '[DONE] is never applied before Yakon approval.',
    ],
    autonomousAllowed: [
      'Read files, logs, tmux panes, and thread context.',
      'Run local tests, builds, lint, typecheck, and read-only diagnostics.',
      'Edit local code/docs for scoped fixes.',
      'Prepare approval packets and [DONE] sign-off drafts.',
    ],
    confirmationRequired: [
      'push / deploy / production or public-state change',
      'production DB migration or data deletion',
      'secret, token, OAuth, env, credential, billing, or paid API change',
      'external messages not already requested in the relevant thread',
      '[DONE] thread marking',
    ],
    current: {
      state,
      decisionKind,
      risk,
      verifierVerdict: verifier?.verdict || null,
      reason: verifier?.reason || v1?.reason || '',
      recommendedAction: verifier?.recommendedAction || v1?.next || '',
      canAutoProceed,
      consultRequired,
      lastSeenAt: v1?.lastSeenAt || null,
      lastChangedAt: v1?.lastChangedAt || null,
    },
    policy: {
      kind: policy.kind || 'implementation-agent',
      normalIdle: policy.normalIdle || 'continue',
      reportMode: policy.reportMode || 'concrete-results-only',
      userActionRule: policy.userActionRule || 'only-real-risk-or-environment-blocker',
    },
  };
}

function nextActionFor(loop) {
  const current = loop.current;
  if (current.consultRequired) {
    if (current.decisionKind === 'done-signoff') {
      return '完了根拠・残リスク・外部変更有無を1つの[DONE]確認文にする';
    }
    return '実行範囲・コマンド/操作・ロールバック・リスク・推奨案を1つの承認パケットにする';
  }
  if (current.canAutoProceed) return '低リスクのローカル作業を1つ進め、別検証へ回す';
  if (current.state === 'blocked') return 'ブロック原因を再分類し、白で解ける確認とYakon判断を分ける';
  return '変化待ち。ただしスレッドのLOOP定義は維持する';
}

function buildMarkdown(report) {
  const lines = [
    '# Shiro Loop v2 Next Actions',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Cron status: all OpenClaw cron jobs are intentionally disabled. Run this manually when needed:',
    '',
    '```sh',
    'node ops/shiro-loop-v2.mjs --write',
    '```',
    '',
    '## Summary',
    '',
    `- Loops: ${report.summary.total}`,
    `- Consult required: ${report.summary.consultRequired}`,
    `- Auto-proceed candidates: ${report.summary.canAutoProceed}`,
    `- Needs verifier refinement: ${report.summary.needsRefine}`,
    '',
    '## Actions',
    '',
  ];

  report.loops.forEach((loop) => {
    lines.push(`### ${loop.session}`);
    lines.push(`- Goal: ${loop.goal}`);
    lines.push(`- State: ${loop.current.state} / ${loop.current.decisionKind} / ${loop.current.risk}`);
    lines.push(`- Next: ${nextActionFor(loop)}`);
    if (loop.current.reason) lines.push(`- Evidence: ${loop.current.reason}`);
    if (loop.threadId) lines.push(`- Thread: ${loop.threadId}`);
    lines.push('');
  });

  return `${lines.join('\n')}\n`;
}

async function main() {
  const v1State = readJson(V1_STATE_FILE, { sessions: {} });
  const verifierReport = readJson(VERIFIER_FILE, { results: [] });
  const taskMap = readJson(TASK_MAP_FILE, { sessions: [] });
  const policies = readJson(POLICY_FILE, { default: {} });
  const tmuxSessions = await listTmuxSessions();
  const taskBySession = mapBySession(taskMap);
  const verifierBySession = new Map((verifierReport.results || []).map((item) => [item.session, item]));
  const sessionNames = [...new Set([
    ...Object.keys(v1State.sessions || {}),
    ...tmuxSessions.filter((name) => name.startsWith('shiro-')),
    ...Array.from(taskBySession.keys()).filter((name) => name.startsWith('shiro-')),
  ])].sort();

  const loops = sessionNames.map((session) => buildLoop({
    session,
    task: taskBySession.get(session),
    policy: policyFor(session, policies),
    v1: v1State.sessions?.[session] || {},
    verifier: verifierBySession.get(session) || v1State.sessions?.[session]?.verifier || null,
  }));

  const report = {
    version: 2,
    generatedAt: new Date(now).toISOString(),
    scheduler: {
      mode: 'manual',
      cronEnabled: false,
      note: 'Yakon instructed Shiro to stop all current cron jobs before moving to Loop v2.',
    },
    summary: {
      total: loops.length,
      consultRequired: loops.filter((loop) => loop.current.consultRequired).length,
      canAutoProceed: loops.filter((loop) => loop.current.canAutoProceed).length,
      needsRefine: loops.filter((loop) => loop.current.verifierVerdict === 'needs-refine').length,
    },
    loops,
  };

  if (write) {
    writeJson(LOOP_FILE, report);
    fs.mkdirSync(V2_DIR, { recursive: true });
    fs.writeFileSync(NEXT_ACTIONS_FILE, buildMarkdown(report));
  }

  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Shiro Loop v2: ${report.summary.total} loops / ${report.summary.consultRequired} consult required / ${report.summary.canAutoProceed} auto candidates`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

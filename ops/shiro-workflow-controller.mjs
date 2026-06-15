#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = '/Users/umi/.openclaw/workspace';
const WORKFLOW_DIR = path.join(ROOT, 'state/shiro-workflows');
const WORKFLOW_FILE = path.join(WORKFLOW_DIR, 'workflows.json');
const REPORT_FILE = path.join(WORKFLOW_DIR, 'last-report.json');
const MESSAGE_FILE = path.join(WORKFLOW_DIR, 'last-message.md');
const EVENTS_FILE = path.join(WORKFLOW_DIR, 'events.jsonl');
const APPROVAL_DISPATCH_FILE = path.join(WORKFLOW_DIR, 'approval-dispatch.json');

const THREAD_REGISTRY_FILE = path.join(ROOT, 'state/shiro-channel-thread-registry.json');
const TASK_MAP_FILE = path.join(ROOT, 'ops/task-session-map.json');
const POLICY_FILE = path.join(ROOT, 'ops/session-policies.json');
const LEGACY_STATE_FILE = path.join(ROOT, 'state/shiro-loop/state.json');
const LEGACY_REPORT_FILE = path.join(ROOT, 'state/shiro-loop/last-report.json');

const argv = new Set(process.argv.slice(2));
const act = argv.has('--act');
const json = argv.has('--json') || argv.has('--quiet');
const write = argv.has('--write') || act;
const force = argv.has('--force');
const now = Date.now();

const captureLines = numberArg('--capture-lines', 120);
const maxActions = numberArg('--max-actions', 6);
const actionCooldownMinutes = numberArg('--action-cooldown-minutes', 30);
const markApprovalSentIds = valuesArg('--mark-approval-sent');

const HIGH_RISK_PATTERNS = [
  /push\b|git push/i,
  /deploy|vercel|wrangler|production|本番|外部公開|公開/i,
  /env|environment|secret|token|api key|credentials|oauth|password|認証情報/i,
  /delete|remove|rm -rf|drop table|migration|migrate|削除|破壊/i,
  /billing|payment|paid|purchase|課金|有料|予算/i,
  /app store connect|testflight|supabase|stripe|cloudflare|line developers|google cloud/i,
];

const HUMAN_WAIT_PATTERNS = [
  /Yakon|承認|確認|判断|許可|approval|permission|sign[- ]?off/i,
  /待ち|提供待ち|設定した.*待ち|返答待ち/i,
];

const BLOCKED_PATTERNS = [
  /blocked|blocker|ブロック|詰まり|止ま|失敗|failed|error/i,
  /missing access|permission denied|unauthorized|forbidden|認証|login required|credentials/i,
  /not found|見つからない|まだ見つからない|no such file/i,
];

const RESULT_PATTERNS = [
  /commit\s+[0-9a-f]{7,40}|local commit|コミット/i,
  /tests?\s+pass|pass(?:ed)?\b|build\s+pass|typecheck\s+pass|lint\s+pass/i,
  /検証.*(完了|通過|成功)|テスト.*(完了|通過|成功)|build.*通過/i,
  /working tree clean|差分なし|残差分なし/i,
  /https?:\/\/[^\s)]+/i,
  /PR\s*#?\d+|pull request|マージ|merge/i,
  /完了根拠|成果|実装完了|修正完了/i,
];

const PROMPT_PATTERNS = [
  /❯\s*$/,
  /[$#%>]\s*$/,
  /what would you like/i,
  /how can i help/i,
  /指示待ち|待機中/i,
];

const ACTIVE_PATTERNS = [
  /running|thinking|tokens|shell command|musing|clauding/i,
  /実行中|処理中|検証中|継続|確認中/i,
];

const DONE_PATTERNS = [
  /\[DONE\]|done designation|完了候補|完了サイン|技術的には完了|no issues found/i,
];

const SAFE_ACTION_PATTERNS = [
  /local|ローカル|read-only|読み取り|調査|整理|検証|smoke|lint|typecheck|build|test/i,
  /credentials\.json|差分確認|ログ確認|再現|原因/i,
];

function numberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function valuesArg(name) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
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
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  fs.appendFileSync(EVENTS_FILE, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}

async function run(file, args, options = {}) {
  return execFileAsync(file, args, {
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
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

async function captureSession(session) {
  const { stdout } = await run('tmux', ['capture-pane', '-pt', `${session}:0.0`, '-S', `-${captureLines}`]);
  return stdout;
}

function hash(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

function cleanLine(line) {
  return line
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[│┃┆┊╎╏║]/g, ' ')
    .replace(/[╭╮╰╯─━═]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function linesOf(text) {
  return (text || '').split('\n').map(cleanLine).filter(Boolean);
}

function matches(patterns, text) {
  return patterns.some((pattern) => pattern.test(text || ''));
}

function recentText(output) {
  return linesOf(output).slice(-60).join('\n');
}

function evidenceLine(recent, patterns) {
  const lines = linesOf(recent);
  return [...lines].reverse().find((line) => matches(patterns, line)) || lines.at(-1) || '';
}

function extractUrls(text) {
  return [...new Set((text.match(/https?:\/\/[^\s)]+/g) || []).map((url) => url.replace(/[.,。]+$/, '')))];
}

function extractExactAction(recent) {
  const lines = linesOf(recent);
  const candidates = [...lines].reverse().filter((line) => (
    /❯|push|deploy|vercel|wrangler|migration|credentials|設定|削除|承認|確認|npm|pnpm|git/i.test(line)
  ));
  const raw = candidates[0] || lines.at(-1) || '';
  return raw.replace(/^❯\s*/, '').slice(0, 180);
}

function isConcreteApprovalPacket(packet) {
  if (!packet) return false;
  if (isNonDecisionAction(packet.exactAction) || isNonDecisionAction(packet.evidence)) return false;
  const fields = [
    packet.subject,
    packet.recommendedDecision,
    packet.exactAction,
    packet.risk,
    packet.rollback,
    packet.waitImpact,
  ];
  return fields.every((value) => typeof value === 'string' && value.trim().length >= 8);
}

function isNonDecisionAction(text) {
  if (!text) return true;
  if (/❯|確認して|許可して|一緒に|まだ見つからない|待ち|提供待ち|方針待ち|次回|次チェック|next check|new task|disk cleanup ok|^yes,|Shiro loop tick/i.test(text)) {
    return true;
  }
  if (!/(push|deploy|vercel|wrangler|migration|migrate|env|secret|token|credentials|oauth|delete|remove|rm -rf|本番|外部公開|公開|削除|課金|\[DONE\]|完了|Hermes|Discord|GitHub|PR|merge|マージ)/i.test(text)) {
    return true;
  }
  return false;
}

function policyFor(session, policies) {
  return policies.sessions?.[session] || policies.default || {};
}

function mapBySession(taskMap) {
  const entries = Array.isArray(taskMap.sessions) ? taskMap.sessions : [];
  return new Map(entries.map((item) => [item.tmuxSession || item.sessionName, item]).filter(([key]) => key));
}

function mapThreadBySession(registry) {
  const map = new Map();
  for (const thread of registry.threads || []) {
    if (thread.tmuxSession) map.set(thread.tmuxSession, thread);
    if (thread.tmuxSessionGuess && !map.has(thread.tmuxSessionGuess)) map.set(thread.tmuxSessionGuess, thread);
  }
  return map;
}

function buildInventory({ tmuxSessions, registry, taskBySession, previous }) {
  const items = new Map();

  for (const session of tmuxSessions.filter((name) => name.startsWith('shiro-'))) {
    items.set(session, { session, source: 'tmux' });
  }

  for (const thread of registry.threads || []) {
    const session = thread.tmuxSession || thread.tmuxSessionGuess || null;
    const key = session || `thread:${thread.threadId}`;
    if (!items.has(key)) items.set(key, {
      session,
      source: session ? 'thread+tmux-guess' : 'thread',
      threadOnly: !session,
      threadId: thread.threadId,
    });
  }

  for (const session of taskBySession.keys()) {
    if (session?.startsWith('shiro-') && !items.has(session)) items.set(session, { session, source: 'task-map' });
  }

  for (const workflow of previous.workflows || []) {
    const key = workflow.session || `thread:${workflow.threadId}`;
    if (key && !items.has(key)) items.set(key, { session: workflow.session || null, source: 'previous', threadOnly: !workflow.session });
  }

  return [...items.values()].sort((a, b) => (a.session || '').localeCompare(b.session || ''));
}

function buildApprovalPacket({ session, title, recent, risk, decisionKind, evidence }) {
  const exactAction = extractExactAction(recent);
  const isDone = decisionKind === 'done-signoff';
  const subject = isDone ? `${title} を [DONE] にしてよいか` : `${title} の外部/高リスク操作を進めてよいか`;
  const recommendedDecision = isDone
    ? '完了根拠と残リスクを確認できるなら承認'
    : 'exact action と rollback が明確なものだけ承認';
  const rollback = isDone
    ? '[DONE] 付与前なので、未承認なら進行対象へ戻せる'
    : /push|deploy|vercel|wrangler/i.test(exactAction)
      ? 'push/deploy前の現在commit/設定へ戻す。必要ならrevertまたは再deployで戻す'
      : '実行前に現状を保持し、変更対象を限定して戻せる状態で行う';
  const waitImpact = isDone
    ? '承認がない間は完了除外できず、監視対象に残る'
    : '承認がない間は外部反映・本番反映・秘密値操作が止まる';

  return {
    ready: false,
    subject,
    recommendedDecision,
    exactAction,
    risk: risk === 'high' ? '高: 外部公開/本番/秘密値/削除/課金の可能性' : '中: Yakon判断が必要',
    rollback,
    waitImpact,
    evidence: evidence || exactAction,
  };
}

function classifyWorkflow({ item, task, thread, policy, previous, tmuxOutput, captureError, legacy }) {
  const title = thread?.name || task?.title || item.session || `thread:${thread?.threadId || 'unknown'}`;
  const recent = recentText(tmuxOutput || '');
  const fingerprint = hash(`${title}\n${recent}`);
  const changed = previous?.fingerprint !== fingerprint;
  const lastChangedAt = changed ? now : previous?.lastChangedAt || now;
  const hasTmux = Boolean(item.session && !captureError);
  const doneThread = /^\[DONE\]/.test(title);
  const prompt = matches(PROMPT_PATTERNS, recent.slice(-1600));
  const active = matches(ACTIVE_PATTERNS, recent);
  const highRisk = matches(HIGH_RISK_PATTERNS, recent);
  const humanWait = matches(HUMAN_WAIT_PATTERNS, recent);
  const blocked = matches(BLOCKED_PATTERNS, recent);
  const resultEvidence = evidenceLine(recent, RESULT_PATTERNS);
  const resultObserved = isResultEvidence(resultEvidence, recent);
  const doneCandidate = matches(DONE_PATTERNS, recent) || (resultObserved && /完了|done|no issues/i.test(recent));
  const safeAction = matches(SAFE_ACTION_PATTERNS, recent);

  let status = 'watching';
  let decisionKind = 'watch';
  let risk = 'low';
  if (doneThread) {
    status = 'done_excluded';
    decisionKind = 'done-approved';
  } else if (!hasTmux) {
    status = 'needs_session';
    decisionKind = 'bootstrap-session';
    risk = 'low';
  } else if (blocked) {
    status = 'blocked';
    decisionKind = 'unblock';
    risk = /credentials|secret|token|oauth|本番|課金|削除/i.test(recent) ? 'high' : 'mid';
  } else if (highRisk || humanWait) {
    status = 'pending_approval';
    decisionKind = doneCandidate ? 'done-signoff' : highRisk ? 'external-action' : 'needs-yakon';
    risk = highRisk ? 'high' : 'mid';
  } else if (doneCandidate) {
    status = 'done_candidate';
    decisionKind = 'done-signoff';
  } else if (resultObserved) {
    status = 'needs_verification';
    decisionKind = 'verify-result';
  } else if (safeAction || (prompt && policy.normalIdle !== 'wait-for-user-material')) {
    status = 'ready_to_act';
    decisionKind = 'self-action';
  } else if (active) {
    status = 'active';
    decisionKind = 'watch';
  }

  const evidence = evidenceLine(recent, [
    ...RESULT_PATTERNS,
    ...HIGH_RISK_PATTERNS,
    ...HUMAN_WAIT_PATTERNS,
    ...BLOCKED_PATTERNS,
    ...SAFE_ACTION_PATTERNS,
  ]);

  const approvalPacket = ['external-action', 'needs-yakon', 'done-signoff'].includes(decisionKind)
    ? buildApprovalPacket({ session: item.session, title, recent, risk, decisionKind, evidence })
    : null;
  if (approvalPacket) approvalPacket.ready = isConcreteApprovalPacket(approvalPacket);

  const verification = {
    required: ['needs_verification', 'done_candidate'].includes(status) || resultObserved,
    resultObserved,
    evidence: resultObserved ? resultEvidence : evidence,
    urls: extractUrls(recent),
    executorSelfReportOnly: resultObserved && !/(npm|pnpm|git|test|build|tsc|lint|curl|playwright|commit|working tree)/i.test(recent),
  };

  const progressReportable = Boolean(
    resultObserved
    || approvalPacket?.ready
    || status === 'blocked'
    || status === 'needs_session'
    || status === 'done_candidate'
  );

  return {
    id: item.session || `thread:${thread?.threadId || hash(title).slice(0, 8)}`,
    session: item.session || null,
    threadId: thread?.threadId || task?.discordThreadId || previous?.threadId || null,
    title,
    source: item.source,
    status,
    decisionKind,
    risk,
    policy: {
      kind: policy.kind || 'implementation-agent',
      normalIdle: policy.normalIdle || 'continue',
      reportMode: policy.reportMode || 'concrete-results-only',
      userActionRule: policy.userActionRule || 'only-real-risk-or-environment-blocker',
    },
    hasTmux,
    doneThread,
    resultObserved,
    progressReportable,
    approvalPacket,
    verification,
    nextAutoAction: nextAutoAction({ status, decisionKind, risk, approvalPacket, hasTmux }),
    evidence,
    recentExcerpt: linesOf(recent).slice(-10).join('\n'),
    legacy: legacy || null,
    fingerprint,
    changed,
    lastSeenAt: now,
    lastChangedAt,
    lastActionAt: previous?.lastActionAt || null,
    lastReportedAt: previous?.lastReportedAt || null,
    actionHistory: (previous?.actionHistory || []).slice(-10),
    captureError: captureError ? String(captureError.message || captureError) : null,
  };
}

function isResultEvidence(line, recent) {
  if (!line) return false;
  if (/❯|許可して|確認して|承認|待ち|次回|次チェック|if|would|please/i.test(line)) return false;
  if (/ブロック|blocked|新規アクション:\s*なし|実行コマンド|実行があれば/i.test(line)) return false;
  if (/https?:\/\//.test(line)) {
    return /deploy|deployed|preview|production|公開|URL|検証URL|PR|pull request/i.test(line);
  }
  if (/commit\s+[0-9a-f]{7,40}|local commit|コミット/i.test(line)) return true;
  if (/working tree clean|差分なし|残差分なし/i.test(line)) return true;
  if (/(npm|pnpm|yarn|bun|pytest|playwright|tsc|lint|typecheck|build|test).*(pass|passed|通過|成功|完了)|(?:pass|passed|通過|成功).*(npm|pnpm|yarn|bun|pytest|playwright|tsc|lint|typecheck|build|test)/i.test(line)) return true;
  if (/検証.*(完了|通過|成功)|テスト.*(完了|通過|成功)|build.*通過/i.test(line)) return true;
  if (/PR\s*#?\d+|pull request|マージ|merge/i.test(line) && !/確認|待ち|次回/i.test(line)) return true;
  return false;
}

function nextAutoAction({ status, decisionKind, risk, approvalPacket, hasTmux }) {
  if (!hasTmux) return 'Claude Code tmux sessionを作成し、スレッド目標を投入する';
  if (status === 'pending_approval' && !approvalPacket?.ready) return '承認パケットを exact action / rollback / risk / wait impact まで具体化する';
  if (approvalPacket?.ready) return 'YakonさんへYes/Noで判断できる形で提示する';
  if (status === 'blocked') return risk === 'high' ? '秘密値/外部要因を切り分け、承認パケット化する' : '白が解けるローカル確認を1つ実行して詰まりを解消する';
  if (status === 'needs_verification') return 'executorとは別視点でテスト/差分/URL/ログを検証する';
  if (status === 'done_candidate') return '[DONE]確認文を作る。Yakon承認まではDONE付与しない';
  if (status === 'ready_to_act') return '低リスクのローカル作業を1つ実行し、結果を観測する';
  if (status === 'active') return '実行中として次tickで成果またはブロッカーを確認する';
  return '変化待ち';
}

function actionPrompt(workflow) {
  const base = [
    'Shiro workflow controller:',
    'Do not merely acknowledge this. Move the workflow to the next observable state.',
    'Low-risk local work is allowed. Do not push, deploy, change production/env/secrets, delete data, or spend money.',
    'End in Japanese with one of: RESULT_OBSERVED, APPROVAL_PACKET_READY, BLOCKED_CONCRETE, or STILL_RUNNING.',
  ];
  if (workflow.status === 'pending_approval' && !workflow.approvalPacket?.ready) {
    base.push('Create a concrete approval packet: subject, exact action/command, recommendation, rollback, risk, wait impact. Do not ask Yakon until it is answerable yes/no.');
  } else if (workflow.status === 'blocked') {
    base.push('Separate what Shiro can do locally from what truly requires Yakon. Perform one safe local check if possible; otherwise produce a concrete blocker packet.');
  } else if (workflow.status === 'needs_verification') {
    base.push('Verify the claimed result using commands/logs/files/URLs. Executor self-report is not enough.');
  } else if (workflow.status === 'done_candidate') {
    base.push('Prepare [DONE] sign-off evidence: completion proof, tests, working tree, deploy/push status, residual risk, external changes.');
  } else if (workflow.status === 'ready_to_act') {
    base.push('Take exactly one safe local action, then verify and report observable evidence.');
  } else {
    base.push(`Current next action: ${workflow.nextAutoAction}`);
  }
  if (workflow.evidence) base.push(`Current evidence: ${workflow.evidence}`);
  return base.join(' ');
}

function shouldSendAction(workflow, previous) {
  if (!act || !workflow.hasTmux) return false;
  if (!['pending_approval', 'blocked', 'needs_verification', 'done_candidate', 'ready_to_act'].includes(workflow.status)) return false;
  if (workflow.approvalPacket?.ready && workflow.status === 'pending_approval') return false;
  if (previous?.lastActionAt && now - previous.lastActionAt < actionCooldownMinutes * 60 * 1000) return false;
  return true;
}

async function sendAction(workflow) {
  await run('tmux', ['send-keys', '-t', `${workflow.session}:0.0`, '-l', '--', actionPrompt(workflow)]);
  await run('tmux', ['send-keys', '-t', `${workflow.session}:0.0`, 'Enter']);
}

function summarize(workflows, actions) {
  const byStatus = workflows.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    total: workflows.length,
    byStatus,
    resultObserved: workflows.filter((item) => item.resultObserved).length,
    approvalReady: workflows.filter((item) => item.approvalPacket?.ready).length,
    progressReportable: workflows.filter((item) => item.progressReportable).length,
    actionsSent: actions.length,
  };
}

function buildHumanMessage(report) {
  const workflows = report.workflows.filter((item) => !item.doneThread);
  const approvalReady = workflows.filter((item) => item.approvalPacket?.ready);
  const results = workflows.filter((item) => item.resultObserved);
  const blocked = workflows.filter((item) => item.status === 'blocked' || item.status === 'needs_session');
  const actioned = report.actionsSent || [];
  const notReportable = workflows.filter((item) => !item.progressReportable);

  const lines = [
    `Yakonさんにお願いしたいこと: ${approvalReady.length ? `${approvalReady.length}件` : 'なし'}`,
    `白が実行/確認したこと: ${results.length ? `${results.length}件` : '成果確認済みはまだなし'}${actioned.length ? ` / controller投入 ${actioned.length}件` : ''}`,
    `止まっているもの: ${blocked.length ? `${blocked.length}件` : 'なし'}`,
    `報告しないもの: ${notReportable.length}件（再投入・待機・未検証は進捗扱いしない）`,
  ];

  if (approvalReady.length) {
    lines.push('');
    lines.push('判断してほしいこと:');
    approvalReady.slice(0, 6).forEach((item) => {
      const packet = item.approvalPacket;
      lines.push(`- ${item.session || item.title}: ${packet.subject} / 推奨: ${packet.recommendedDecision} / 放置時: ${packet.waitImpact}`);
    });
    if (approvalReady.length > 6) lines.push(`- 他 ${approvalReady.length - 6}件`);
  }

  if (results.length) {
    lines.push('');
    lines.push('成果確認済み:');
    results.slice(0, 6).forEach((item) => {
      lines.push(`- ${item.session || item.title}: ${item.verification.evidence || item.evidence}`);
    });
    if (results.length > 6) lines.push(`- 他 ${results.length - 6}件`);
  }

  if (blocked.length) {
    lines.push('');
    lines.push('具体ブロッカー:');
    blocked.slice(0, 6).forEach((item) => {
      lines.push(`- ${item.session || item.title}: ${item.evidence || item.nextAutoAction}`);
    });
    if (blocked.length > 6) lines.push(`- 他 ${blocked.length - 6}件`);
  }

  if (actioned.length) {
    lines.push('');
    lines.push('controllerが投入した次アクション:');
    actioned.slice(0, 6).forEach((item) => {
      lines.push(`- ${item.session}: ${item.status} -> ${item.nextAutoAction}`);
    });
    if (actioned.length > 6) lines.push(`- 他 ${actioned.length - 6}件`);
  }

  lines.push('');
  lines.push(`事実: workflow ${report.summary.total} / approvalReady ${report.summary.approvalReady} / resultObserved ${report.summary.resultObserved} / actionsSent ${report.summary.actionsSent}`);
  lines.push('次: 次回tickで resultObserved または approvalPacket.ready になったものだけ報告します。');
  return lines.join('\n');
}

function buildApprovalRequests(workflows, dispatchState) {
  return workflows
    .filter((item) => item.approvalPacket?.ready)
    .map((item) => {
      const packet = item.approvalPacket;
      const message = [
        '<@797097185098858508>',
        `お願いしたいこと: ${packet.subject}`,
        `推奨: ${packet.recommendedDecision}`,
        `実行内容: ${packet.exactAction}`,
        `リスク: ${packet.risk}`,
        `ロールバック: ${packet.rollback}`,
        `放置時の影響: ${packet.waitImpact}`,
        `根拠: ${packet.evidence}`,
      ].join('\n');
      const requestId = hash(`${item.threadId || 'no-thread'}\n${message}`);
      const alreadySent = Boolean(dispatchState.sent?.[requestId]);
      return {
        requestId,
        session: item.session,
        threadId: item.threadId,
        title: item.title,
        message,
        packet,
        alreadySent,
        readyToSend: Boolean(item.threadId) && !alreadySent,
      };
    });
}

function markApprovalSent(ids) {
  const state = readJson(APPROVAL_DISPATCH_FILE, { version: 1, sent: {} });
  for (const id of ids) {
    state.sent[id] = { sentAt: new Date(now).toISOString() };
  }
  writeJson(APPROVAL_DISPATCH_FILE, state);
  return state;
}

async function main() {
  if (markApprovalSentIds.length) {
    const state = markApprovalSent(markApprovalSentIds);
    console.log(JSON.stringify({ ok: true, marked: markApprovalSentIds, totalSent: Object.keys(state.sent || {}).length }, null, 2));
    return;
  }

  const registry = readJson(THREAD_REGISTRY_FILE, { threads: [] });
  const taskMap = readJson(TASK_MAP_FILE, { sessions: [] });
  const policies = readJson(POLICY_FILE, { default: {} });
  const previous = readJson(WORKFLOW_FILE, { version: 3, workflows: [] });
  const approvalDispatchState = readJson(APPROVAL_DISPATCH_FILE, { version: 1, sent: {} });
  const legacyState = readJson(LEGACY_STATE_FILE, { sessions: {} });
  const legacyReport = readJson(LEGACY_REPORT_FILE, { results: [] });
  const previousById = new Map((previous.workflows || []).map((item) => [item.id, item]));
  const taskBySession = mapBySession(taskMap);
  const threadBySession = mapThreadBySession(registry);
  const tmuxSessions = await listTmuxSessions();
  const inventory = buildInventory({ tmuxSessions, registry, taskBySession, previous });
  const legacyBySession = new Map((legacyReport.results || []).map((item) => [item.session, item]));

  const workflows = [];
  const events = [];
  const actionsSent = [];
  let actionCount = 0;

  for (const item of inventory) {
    const session = item.session;
    const thread = session ? threadBySession.get(session) : (registry.threads || []).find((t) => t.threadId === item.threadId) || null;
    const task = session ? taskBySession.get(session) : null;
    const policy = policyFor(session, policies);
    const id = session || `thread:${thread?.threadId || hash(JSON.stringify(item)).slice(0, 8)}`;
    const prev = previousById.get(id) || {};
    let tmuxOutput = '';
    let captureError = null;
    if (session && tmuxSessions.includes(session)) {
      try {
        tmuxOutput = await captureSession(session);
      } catch (error) {
        captureError = error;
      }
    }
    const workflow = classifyWorkflow({
      item,
      task,
      thread,
      policy,
      previous: prev,
      tmuxOutput,
      captureError,
      legacy: legacyState.sessions?.[session] || legacyBySession.get(session) || null,
    });

    if (shouldSendAction(workflow, prev) && actionCount < maxActions) {
      await sendAction(workflow);
      workflow.lastActionAt = now;
      workflow.actionHistory = [
        ...(workflow.actionHistory || []),
        { ts: new Date(now).toISOString(), status: workflow.status, prompt: actionPrompt(workflow).slice(0, 500) },
      ].slice(-10);
      actionsSent.push({
        session: workflow.session,
        status: workflow.status,
        nextAutoAction: workflow.nextAutoAction,
      });
      actionCount += 1;
    }

    if (workflow.changed || force) {
      events.push({
        ts: new Date(now).toISOString(),
        id: workflow.id,
        session: workflow.session,
        threadId: workflow.threadId,
        status: workflow.status,
        decisionKind: workflow.decisionKind,
        resultObserved: workflow.resultObserved,
        approvalReady: Boolean(workflow.approvalPacket?.ready),
      });
    }

    workflows.push(workflow);
  }

  const report = {
    version: 3,
    ts: new Date(now).toISOString(),
    act,
    write,
    summary: summarize(workflows, actionsSent),
    actionsSent,
    workflows,
  };
  report.approvalRequests = buildApprovalRequests(workflows, approvalDispatchState);
  report.humanMessage = buildHumanMessage(report);

  if (write) {
    writeJson(WORKFLOW_FILE, { version: 3, updatedAt: report.ts, workflows });
    writeJson(REPORT_FILE, report);
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
    fs.writeFileSync(MESSAGE_FILE, `${report.humanMessage}\n`);
    appendEvents(events);
  }

  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`shiro-workflow-controller ${report.ts}`);
    console.log(JSON.stringify(report.summary));
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

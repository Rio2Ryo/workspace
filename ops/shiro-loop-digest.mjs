#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/umi/.openclaw/workspace';
const STATE_DIR = path.join(ROOT, 'state/shiro-loop');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const DIGEST_FILE = path.join(STATE_DIR, 'digest-state.json');
const VERIFIER_REPORT_FILE = path.join(STATE_DIR, 'last-verifier-report.json');
const LAST_REPORT_FILE = path.join(STATE_DIR, 'last-report.json');
const WORKFLOW_REPORT_FILE = path.join(ROOT, 'state/shiro-workflows/last-report.json');
const OPENCLAW_CONFIG_FILE = '/Users/umi/.openclaw/openclaw.json';
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

function byVerifierVerdict(item, verdict) {
  return item.verifier?.verdict === verdict;
}

function conciseReason(item) {
  const reason = item.verifier?.reason || item.reason || '理由未整理';
  return reason.length > 80 ? `${reason.slice(0, 77)}...` : reason;
}

function concreteEnough(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 24) return false;
  if (/^Prepare approval packet|^Report completion evidence|承認パケットが具体化されるまで保留/.test(trimmed)) return false;
  return true;
}

function readyForHumanDecision(item) {
  if (byVerifierVerdict(item, 'needs-refine')) return false;
  if (!['external-action', 'needs-yakon', 'done-signoff'].includes(item.decisionKind)) return false;
  const reason = item.verifier?.reason || item.reason || '';
  const action = item.verifier?.recommendedAction || item.next || '';
  return concreteEnough(reason) && concreteEnough(action);
}

function localModelHint() {
  const config = readJson(OPENCLAW_CONFIG_FILE, {});
  const providers = config.models?.providers || {};
  const ollama = providers['ollama-local'];
  if (!ollama) return null;
  const models = Array.isArray(ollama.models)
    ? ollama.models.map((model) => model.id).filter(Boolean).slice(0, 2)
    : [];
  return models.length
    ? `ローカルLLM候補あり: ${models.join(', ')}`
    : 'ローカルLLM provider は設定済み';
}

function buildProactiveSuggestions({ sessions, needsRefine, selfAction, verifierMismatch }) {
  const suggestions = [];
  const permissionWait = sessions.filter((item) => item.state === 'permission-wait');
  const blocked = sessions.filter((item) => item.state === 'blocked');
  const external = sessions.filter((item) => item.decisionKind === 'external-action');
  const missingAccess = sessions.filter((item) => /missing access|権限|permission|denied/i.test(`${item.reason} ${item.next} ${item.verifier?.reason || ''}`));
  const hint = localModelHint();

  if (needsRefine.length >= 3 || permissionWait.length >= 3) {
    suggestions.push(`外部操作候補/整理待ちが${permissionWait.length}件あるため、次回から各セッション内で止めずに「YakonさんがYes/Noだけ答える文」まで自動生成する`);
  }
  if (external.length >= 3) {
    suggestions.push(`外部操作待ちが${external.length}件あるため、push/deploy/DB/envを「承認済みなら実行、未承認なら確認文投稿」に分岐する実行ルールを強める`);
  }
  if (missingAccess.length >= 1) {
    suggestions.push(`Discord Missing Access/権限詰まりがあるため、投稿先権限とthread idを先に検査する`);
  }
  if (hint && (needsRefine.length >= 3 || verifierMismatch.length >= 2 || selfAction.length === 0)) {
    suggestions.push(`${hint}。ログ分類・承認文下書き・定型監視はHermes/OpenClawからローカルLLMへ逃がして、上位モデルは判断/実装に残す`);
  }

  return [...new Set(suggestions)].slice(0, 4);
}

function buildDecisionReport({ sessions, changedSinceLastDigest, verifierReport, lastReport }) {
  const needsRefine = sessions.filter((item) => byVerifierVerdict(item, 'needs-refine'));
  const readyForYakon = sessions.filter(readyForHumanDecision);
  const needsPacket = sessions.filter((item) => {
    if (readyForHumanDecision(item)) return false;
    return ['external-action', 'needs-yakon', 'done-signoff'].includes(item.decisionKind);
  });
  const pendingHuman = sessions.filter((item) => (
    item.state === 'permission-wait'
    || item.verifier?.consultRequired
    || ['external-action', 'needs-yakon', 'done-signoff'].includes(item.decisionKind)
  ));
  const selfAction = sessions.filter((item) => item.decisionKind === 'self-action' || item.verifier?.canProceedWithoutYakon);
  const verifierMismatch = sessions.filter((item) => {
    if (!item.verifier) return false;
    return item.decisionKind !== item.verifier.decisionKind || item.risk !== item.verifier.risk;
  });

  const yakonQuestions = readyForYakon.map((item) => {
    if (item.decisionKind === 'done-signoff') {
      return {
        session: item.session,
        question: `[DONE] にしてよいか`,
        recommendation: '完了根拠と残リスクを確認してから判断',
        reason: conciseReason(item),
      };
    }
    return {
      session: item.session,
      question: '外部操作・本番/公開/秘密値/削除/課金に進んでよいか',
      recommendation: '承認パケットが具体化されるまで保留',
      reason: conciseReason(item),
    };
  });

  const actionBySession = new Map();
  needsPacket.forEach((item) => {
    actionBySession.set(item.session, {
      session: item.session,
      action: item.decisionKind === 'done-signoff'
        ? '完了根拠・残リスク・外部変更有無を確認文にしてからYakonさんへ出す'
        : '実行範囲・コマンド・ロールバック・リスク・推奨案を具体化してからYakonさんへ出す',
      reason: conciseReason(item),
    });
  });
  needsRefine.forEach((item) => {
    if (actionBySession.has(item.session)) return;
    actionBySession.set(item.session, {
      session: item.session,
      action: item.decisionKind === 'done-signoff'
        ? '完了根拠・残リスク・外部変更有無を1つの確認文に整理'
        : '承認範囲・実行内容・ロールバック・リスク・推奨案を1つの確認文に整理',
      reason: conciseReason(item),
    });
  });
  selfAction.forEach((item) => {
    if (actionBySession.has(item.session)) return;
    actionBySession.set(item.session, {
      session: item.session,
      action: '低リスクのローカル作業を1つ進めて再検証',
      reason: conciseReason(item),
    });
  });
  const shiroActions = [...actionBySession.values()];
  const nudgedActions = Array.isArray(lastReport?.notifications)
    ? lastReport.notifications
      .filter((item) => item.kind === 'nudged' || item.acted === true)
      .map((item) => ({
        session: item.session,
        action: 'セッションへ再投入',
        reason: item.reason || item.next || '',
      }))
    : [];
  const actualActions = [];
  const proactiveSuggestions = buildProactiveSuggestions({ sessions, needsRefine, selfAction, verifierMismatch });

  const label = pendingHuman.length > 0
    ? 'Yakonさんがやることあり'
    : shiroActions.length > 0
      ? 'Yakonさんがやることなし'
      : '報告のみ';

  const recommendation = yakonQuestions.length > 0
    ? '下の確認事項だけ判断してください。未精製のものは白が先に整理します。'
    : pendingHuman.length > 0
      ? '未精製の項目があります。白が具体化しますが、「Yakonさん側の判断/作業が存在する」扱いです。'
    : needsRefine.length > 0
      ? 'Yakonさん確認に出す前に、白が各セッションの承認パケットを作り直します。'
      : selfAction.length > 0
        ? '白が低リスク作業を進め、変化が出たものだけ報告します。'
        : '現時点でYakonさんの判断は不要です。';

  const lines = [
    `Yakonさんがやること: ${pendingHuman.length ? `${pendingHuman.length}件あり（白が具体化中）` : 'なし'}`,
    `白がやること: ${nudgedActions.length ? `再投入後の結果確認 ${nudgedActions.length}件` : shiroActions.length ? `整理待ち ${shiroActions.length}件` : 'なし'}`,
    `期限/影響: ${pendingHuman.length ? 'Yakonさん判断/作業が必要な項目は止まります。白がYes/Noで答えられる形に詰めます。' : '放置してもYakonさん側の作業は増えません。白が進めます。'}`,
    `推奨: ${recommendation}`,
  ];

  if (yakonQuestions.length) {
    lines.push('');
    lines.push('判断してほしいこと:');
    yakonQuestions.slice(0, 5).forEach((item) => {
      lines.push(`- ${item.session}: ${item.question} / 推奨: ${item.recommendation}`);
    });
    if (yakonQuestions.length > 5) lines.push(`- 他 ${yakonQuestions.length - 5}件`);
  }

  if (actualActions.length) {
    lines.push('');
    lines.push('実行したこと:');
    actualActions.slice(0, 8).forEach((item) => {
      const reason = item.reason ? `（${item.reason.slice(0, 60)}）` : '';
      lines.push(`- ${item.session}: ${item.action}${reason}`);
    });
    if (actualActions.length > 8) lines.push(`- 他 ${actualActions.length - 8}件`);
  } else if (nudgedActions.length) {
    lines.push('');
    lines.push('再投入しただけで、まだ成果未確認:');
    nudgedActions.slice(0, 8).forEach((item) => {
      const reason = item.reason ? `（${item.reason.slice(0, 60)}）` : '';
      lines.push(`- ${item.session}: ${item.action}${reason}`);
    });
    if (nudgedActions.length > 8) lines.push(`- 他 ${nudgedActions.length - 8}件`);
  } else if (shiroActions.length) {
    lines.push('');
    lines.push('未実行の整理待ち:');
    shiroActions.slice(0, 8).forEach((item) => {
      lines.push(`- ${item.session}: ${item.action}`);
    });
    if (shiroActions.length > 8) lines.push(`- 他 ${shiroActions.length - 8}件`);
  }

  if (proactiveSuggestions.length) {
    lines.push('');
    lines.push('白からの先回り提案:');
    proactiveSuggestions.forEach((item) => {
      lines.push(`- ${item}`);
    });
  }

  lines.push('');
  lines.push(`事実: 総数${sessions.length} / 変化${changedSinceLastDigest.length} / 要整理${needsRefine.length} / 判断可能${yakonQuestions.length} / 自走候補${selfAction.length} / 判定ズレ${verifierMismatch.length}`);
  if (verifierReport?.verdictSummary) {
    const labels = {
      verified: '確認済み',
      'needs-refine': '要整理',
    };
    const verdicts = Object.entries(verifierReport.verdictSummary).map(([key, value]) => `${labels[key] || key}${value}`).join(' / ');
    lines.push(`検証: ${verdicts || 'なし'}`);
  }
  lines.push(actualActions.length
    ? '次: 実行結果を確認し、変化があったスレッド単位で報告します。'
    : nudgedActions.length
      ? '次: 再投入後の成果を確認し、成果が出るまで進捗扱いにしません。'
    : '次: 未実行なので、報告より先に各セッションへの確認送信・実行を進めます。');

  return {
    label,
    recommendation,
    yakonQuestions,
    shiroActions,
    actualActions,
    nudgedActions,
    proactiveSuggestions,
    verifierMismatch,
    humanMessage: lines.join('\n'),
  };
}

function main() {
  const workflowReport = readJson(WORKFLOW_REPORT_FILE, null);
  if (workflowReport?.humanMessage) {
    const report = {
      ts: new Date(now).toISOString(),
      shouldSend: true,
      reportLabel: 'Shiro workflow controller',
      source: 'state/shiro-workflows/last-report.json',
      humanMessage: workflowReport.humanMessage,
      workflowSummary: workflowReport.summary || null,
    };
    writeJson(path.join(STATE_DIR, 'last-digest.json'), report);
    writeJson(DIGEST_FILE, { lastDigestAt: now });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const state = readJson(STATE_FILE, { sessions: {} });
  const digestState = readJson(DIGEST_FILE, { lastDigestAt: null });
  const verifierReport = readJson(VERIFIER_REPORT_FILE, null);
  const lastReport = readJson(LAST_REPORT_FILE, null);
  const sessions = Object.entries(state.sessions || {}).map(([session, info]) => ({
    session,
    state: info.state || 'unknown',
    decisionKind: info.decisionKind || 'watch',
    risk: info.risk || 'low',
    reason: info.reason || '',
    next: info.next || '',
    verifier: info.verifier || null,
    lastSeenAt: info.lastSeenAt || null,
    lastChangedAt: info.lastChangedAt || null,
    lastNotifiedAt: info.lastNotifiedAt || null,
  }));

  const summary = sessions.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, {});

  const decisionSummary = sessions.reduce((acc, item) => {
    acc[item.decisionKind] = (acc[item.decisionKind] || 0) + 1;
    return acc;
  }, {});

  const since = digestState.lastDigestAt || 0;
  const changedSinceLastDigest = sessions
    .filter((item) => item.lastChangedAt && item.lastChangedAt > since)
    .sort((a, b) => (b.lastChangedAt || 0) - (a.lastChangedAt || 0));

  const attention = sessions
    .filter((item) => ['permission-wait', 'needs-action', 'blocked', 'done-candidate'].includes(item.state) || item.decisionKind !== 'watch')
    .sort((a, b) => a.session.localeCompare(b.session));

  const permissionWaitCount = summary['permission-wait'] || 0;
  const shouldSend = changedSinceLastDigest.length > 0 || attention.length > 0;
  const decisionReport = buildDecisionReport({ sessions, changedSinceLastDigest, verifierReport, lastReport });

  const report = {
    ts: new Date(now).toISOString(),
    shouldSend,
    reportLabel: decisionReport.label,
    humanMessage: decisionReport.humanMessage,
    recommendation: decisionReport.recommendation,
    yakonQuestions: decisionReport.yakonQuestions,
    shiroActions: decisionReport.shiroActions,
    actualActions: decisionReport.actualActions,
    proactiveSuggestions: decisionReport.proactiveSuggestions,
    verifierMismatch: decisionReport.verifierMismatch,
    total: sessions.length,
    summary,
    decisionSummary,
    verifierSummary: verifierReport ? {
      ts: verifierReport.ts,
      verdictSummary: verifierReport.verdictSummary || {},
      selfActionCount: Array.isArray(verifierReport.selfActionItems) ? verifierReport.selfActionItems.length : 0,
      consultCount: Array.isArray(verifierReport.consultItems) ? verifierReport.consultItems.length : 0,
      refineCount: Array.isArray(verifierReport.refineItems) ? verifierReport.refineItems.length : 0,
    } : null,
    changedSinceLastDigest,
    attention,
    permissionWaitCount,
  };

  writeJson(path.join(STATE_DIR, 'last-digest.json'), report);
  writeJson(DIGEST_FILE, { lastDigestAt: now });
  console.log(JSON.stringify(report, null, 2));
}

main();

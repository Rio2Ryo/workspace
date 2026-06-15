#!/usr/bin/env node
/**
 * shiro-daily-note.mjs
 * 毎朝 09:00 JST に Obsidian vault の 10_Daily/ に当日ノートを作成する。
 * 既存ファイルがある場合はスキップ。ローカル完結・外部呼び出しなし。
 */
import fs from 'node:fs';
import path from 'node:path';

const VAULT = '/Users/umi/.openclaw/workspace/second-brain/obsidian-vault';
const DAILY_DIR = path.join(VAULT, '10_Daily');
const TEMPLATE = path.join(VAULT, 'templates/daily.md');

function todayJST() {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function run() {
  const today = todayJST();
  const filePath = path.join(DAILY_DIR, `${today}.md`);

  if (fs.existsSync(filePath)) {
    console.log(`[shiro-daily-note] 本日ノート既存: ${filePath} — スキップ`);
    return { skipped: true, date: today, path: filePath };
  }

  const template = fs.readFileSync(TEMPLATE, 'utf-8');
  const content = template.replace(/YYYY-MM-DD/g, today);
  fs.writeFileSync(filePath, content, 'utf-8');

  console.log(`[shiro-daily-note] 作成完了: ${filePath}`);
  return { created: true, date: today, path: filePath };
}

const result = run();
process.exit(result.created || result.skipped ? 0 : 1);

#!/usr/bin/env node
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const configPath = process.env.TASK_SESSION_MAP || new URL('./task-session-map.json', import.meta.url).pathname;
const apiKey = process.env.SECOND_BRAIN_API_KEY || process.env.INTERNAL_TOKEN;
if (!apiKey) {
  console.error('Missing SECOND_BRAIN_API_KEY or INTERNAL_TOKEN. Refusing to sync tasks without explicit API auth.');
  process.exit(2);
}

const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const apiBase = (process.env.SECOND_BRAIN_API_BASE || config.apiBase || 'http://localhost:8787').replace(/\/$/, '');

function tmuxSessionExists(name) {
  const res = spawnSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
  return res.status === 0;
}

async function syncSession(entry) {
  const exists = tmuxSessionExists(entry.tmuxSession);
  const sourceId = `discord:${entry.discordThreadId}:tmux:${entry.tmuxSession}`;
  const title = entry.title || `${entry.tmuxSession} セッションタスク`;
  const description = [
    'Discordスレッドから発生したtmux作業をSecond Brainの canonical task DB に同期。',
    `tmuxSession: ${entry.tmuxSession}`,
    `discordThreadId: ${entry.discordThreadId}`,
    `tmuxSessionExists: ${exists}`,
  ].join('\n');

  const body = {
    title,
    description,
    status: exists ? 'doing' : 'blocked',
    priority: entry.priority ?? 1,
    assigneeId: entry.assigneeId ?? null,
    sourceLink: {
      source: 'discord_thread',
      sourceId,
      sourceUrl: `https://discord.com/channels/1221012768954515497/${entry.discordThreadId}`,
      tmuxSession: entry.tmuxSession,
      discordThreadId: entry.discordThreadId,
      metadata: {
        managedBy: 'ops/sync-tmux-discord-tasks.mjs',
        tmuxSessionExists: exists,
      },
    },
  };

  const res = await fetch(`${apiBase}/tasks/sync-source`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${entry.tmuxSession}: ${res.status} ${text}`);
  }
  const json = JSON.parse(text);
  console.log(`${entry.tmuxSession}: ${json.created ? 'created' : 'updated'} ${json.task?.id ?? ''}`);
}

let failures = 0;
for (const entry of config.sessions ?? []) {
  try {
    await syncSession(entry);
  } catch (error) {
    failures++;
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failures) process.exit(1);

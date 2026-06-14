PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (id, email, name) VALUES
  ('panai', 'panai@second-brain.ai', 'panai'),
  ('ontrust', 'ontrust@second-brain.ai', 'ontrust');

INSERT OR IGNORE INTO tasks (
  id, workspace_id, title, description, status, priority, assignee_id, due_at, created_by
) VALUES
  ('task_yakon_mother_vegetable_001', 'ws_default', 'マザベジ: 中西さんとTeam300譲渡先への打合せ', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_002', 'ws_default', 'マザベジ: mothervgetable.co.jp開発', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_003', 'ws_default', 'マザベジ: かいさんからの化粧水', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_004', 'ws_default', 'マザベジ: 松井さんからの食品', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_005', 'ws_default', 'マザベジ: 返金要望クレーマー対応', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_006', 'ws_default', 'マザベジ: 日本食品分析センター対応', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_007', 'ws_default', 'マザベジ: 女性器デオドラント輸出先交渉および製品づくり', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_008', 'ws_default', 'マザベジ: USDT, 銀行振込など経理全般', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_009', 'ws_default', 'マザベジ: シリカ水と枕セット商品', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_010', 'ws_default', 'マザベジ: 井上農場の追撃', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_011', 'ws_default', 'マザベジ: ネットフリックスと北海道農園の営業', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_012', 'ws_default', 'マザベジ: 岡山理科大学の対応', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_013', 'ws_default', 'マザベジ: 収支計算表の作成', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_014', 'ws_default', 'マザベジ: 東急ホテルへの1000万タイプ営業', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),
  ('task_yakon_mother_vegetable_015', 'ws_default', 'マザベジ: 1000万円タイプの投資対効果表作成', 'Project: マザベジ\n担当: panai\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'panai', NULL, 'user_demo'),

  ('task_yakon_ontrust_001', 'ws_default', 'onTrust: メールクライアント開発', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_002', 'ws_default', 'onTrust: 採用PF開発', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_003', 'ws_default', 'onTrust: onTrust評価システム開発', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_004', 'ws_default', 'onTrust: 手帳アプリ開発', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_005', 'ws_default', 'onTrust: Co2システム開発', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_006', 'ws_default', 'onTrust: Co2システム契約締結', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_007', 'ws_default', 'onTrust: Co2システムLP資料', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_008', 'ws_default', 'onTrust: Co2システム営業', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_009', 'ws_default', 'onTrust: 1000万円投資返金調整', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_010', 'ws_default', 'onTrust: アプリ開発営業', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),
  ('task_yakon_ontrust_011', 'ws_default', 'onTrust: 分身AI開発', 'Project: onTrust\n担当: ontrust\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'ontrust', NULL, 'user_demo'),

  ('task_yakon_kataomoi_001', 'ws_default', 'KATAOMOI: 土木関連アプリ開発', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),
  ('task_yakon_kataomoi_002', 'ws_default', 'KATAOMOI: 名刺営業', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),
  ('task_yakon_kataomoi_003', 'ws_default', 'KATAOMOI: 名刺管理アプリ開発', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),
  ('task_yakon_kataomoi_004', 'ws_default', 'KATAOMOI: 名刺遷移用5秒動画作', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),
  ('task_yakon_kataomoi_005', 'ws_default', 'KATAOMOI: ポスター自販機製造', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),
  ('task_yakon_kataomoi_006', 'ws_default', 'KATAOMOI: アイドル物販コラボ営業', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),
  ('task_yakon_kataomoi_007', 'ws_default', 'KATAOMOI: ポスター自販機アプリ開発', 'Project: KATAOMOI\n担当: 未割り当て\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, NULL, NULL, 'user_demo'),

  ('task_yakon_personal_001', 'ws_default', '個人: 転職 5/30面接', 'Project: 個人\n担当: Shiro\nSource: Discord #tmux-web-view 1508254495203917897', 'todo', 2, 'shiro', '2026-05-30T00:00:00+09:00', 'user_demo'),
  ('task_yakon_personal_002', 'ws_default', '個人: 嫁さん転職サポート', 'Project: 個人\n担当: Shiro\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'shiro', NULL, 'user_demo'),
  ('task_yakon_personal_003', 'ws_default', '個人: 引越し先調査', 'Project: 個人\n担当: Shiro\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'shiro', NULL, 'user_demo'),

  ('task_yakon_trust_relay_001', 'ws_default', 'Trust Relay: 不動産調査アプリ開発', 'Project: Trust Relay\n担当: sora\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'sora', NULL, 'user_demo'),
  ('task_yakon_trust_relay_002', 'ws_default', 'Trust Relay: 不動産投資判断アプリ開発', 'Project: Trust Relay\n担当: sora\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'sora', NULL, 'user_demo'),
  ('task_yakon_trust_relay_003', 'ws_default', 'Trust Relay: 個人ブランディング構築アプリ開発', 'Project: Trust Relay\n担当: sora\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'sora', NULL, 'user_demo'),
  ('task_yakon_trust_relay_004', 'ws_default', 'Trust Relay: 障がい者、未成年に向けた教育プログラム開発', 'Project: Trust Relay\n担当: sora\nSource: Discord #tmux-web-view 1508254495203917897', 'backlog', 1, 'sora', NULL, 'user_demo');

INSERT OR IGNORE INTO tasks_fts (task_id, title)
SELECT id, title FROM tasks WHERE id LIKE 'task_yakon_%';

CREATE TABLE IF NOT EXISTS task_source_links (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('discord_thread','tmux_session','tmux_web_view','second_brain','openclaw')),
  source_id TEXT NOT NULL,
  source_url TEXT,
  tmux_session TEXT,
  discord_thread_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_task_source_links_task_id ON task_source_links(task_id);
CREATE INDEX IF NOT EXISTS idx_task_source_links_tmux_session ON task_source_links(tmux_session);
CREATE INDEX IF NOT EXISTS idx_task_source_links_discord_thread_id ON task_source_links(discord_thread_id);

INSERT OR IGNORE INTO task_source_links (
  id, task_id, source, source_id, source_url, discord_thread_id, metadata
)
SELECT
  'link_' || id,
  id,
  'discord_thread',
  'discord:1501400748427051029:message:1508254495203917897:task:' || id,
  'https://discord.com/channels/1221012768954515497/1501400748427051029/1508254495203917897',
  '1501400748427051029',
  json_object('managedBy', 'ops/import-yakon-business-tasks-2026-05-25.sql', 'sourceMessageId', '1508254495203917897')
FROM tasks
WHERE id LIKE 'task_yakon_%';

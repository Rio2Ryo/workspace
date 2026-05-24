import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT || 4180)
const host = process.env.HOST || '127.0.0.1'
const baseHost = host.includes(':') ? `[${host}]` : host
const baseURL = `http://${baseHost}:${port}`
const webServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1'
  ? undefined
  : {
      command: `rm -f data.local.json && pnpm build && HOST=${host} PORT=${port} node scripts/preview-local.mjs`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    }

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.spec.ts',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
})

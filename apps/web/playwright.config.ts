import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: WEB_URL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'tv',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
      testMatch: /tv\..*spec/,
    },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /play\..*spec/ },
    // Opens its own TV and phone contexts inside each test.
    { name: 'multiplayer', use: { ...devices['Desktop Chrome'] }, testMatch: /lobby\..*spec/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter @gno/server dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
    },
    { command: 'pnpm --filter @gno/web dev', url: WEB_URL, reuseExistingServer: !process.env.CI },
  ],
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 }, // iPhone 세로 비율
    screenshot: 'only-on-failure',
    launchOptions: {
      // 컨테이너에 사전 설치된 Chromium 사용 (버전 고정 회피)
      executablePath: process.env.PW_CHROMIUM_PATH
        ?? '/opt/pw-browsers/chromium',
    },
  },
});

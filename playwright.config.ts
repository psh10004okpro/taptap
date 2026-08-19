import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// 컨테이너에 사전 설치된 Chromium 이 있으면 사용 (버전 고정 회피).
// CI(GitHub Actions)에는 없으므로 playwright 기본 브라우저로 폴백한다.
const localChromium = process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(localChromium) ? localChromium : undefined;

export default defineConfig({
  testDir: './tests',
  grepInvert: process.env.MONKEY ? undefined : /@monkey/, // 몽키는 npm run test:monkey 로만
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
    launchOptions: { executablePath },
  },
});

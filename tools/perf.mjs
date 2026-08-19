#!/usr/bin/env node
// 프레임 측정 — 저사양 기기에서 버티는지 CPU 감속으로 근사한다.
//
//   npm run preview          # 다른 터미널에서 (localhost:4173)
//   node tools/perf.mjs      # 실 GPU (창이 뜬다)
//   node tools/perf.mjs --headless
//
// 헤드리스는 SwiftShader(소프트웨어 렌더)라 절대 수치가 의미 없다 — GPU 병목에
// 갇혀 CPU 감속을 걸어도 수치가 거의 변하지 않는다. 기본은 헤디드다.
//
// 측정 조건: endgame 프리셋(영웅 24 + 유물 만렙 + 장비) + 스킬 6종 동시 발동 +
// 연타. 실제 플레이에서 이보다 무거운 프레임은 나오지 않는다.
import { chromium } from 'playwright';

const HEADLESS = process.argv.includes('--headless');
const URL = process.env.PERF_URL ?? 'http://localhost:4173/';

async function run(throttle, label) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 25_000 });
  await page.evaluate(() => {
    const t = window.__taptap;
    t.dev.applyPreset(t.state, 'endgame');
    t.state.tut = 99;
    t.state.save();
  });
  await page.reload();
  await page.waitForFunction(
    () => window.__taptap?.game?.registry?.get('uiReady') === true,
    undefined, { timeout: 25_000 },
  );
  await page.waitForTimeout(2000);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(() => {
    const s = window.__taptap.state;
    s.maxStage = 200;                       // 스킬 전부 해금
    for (let i = 0; i < 6; i++) s.tryActivateSkill(i);
  });

  const fps = [];
  for (let i = 0; i < 14; i++) {
    await page.mouse.click(360, 470);
    await page.waitForTimeout(250);
    fps.push(await page.evaluate(() => window.__taptap.game.loop.actualFps));
  }
  await browser.close();

  const s = fps.slice(4).sort((a, b) => a - b);   // 워밍업 4샘플 제외
  const median = s[Math.floor(s.length / 2)];
  console.log(`${label.padEnd(22)} median ${median.toFixed(1)} fps   `
    + `min ${s[0].toFixed(1)}   max ${s[s.length - 1].toFixed(1)}`);
  return median;
}

const base = await run(1, '기본 (1x)');
await run(4, '저사양 (CPU 4x)');
const slow = await run(6, '극저사양 (CPU 6x)');

console.log(`\n${HEADLESS ? '헤드리스(소프트웨어 렌더) — 절대 수치 무시' : '실 GPU'}`);
if (!HEADLESS && slow < 30) {
  console.log('경고: 6x 감속에서 30fps 미만 — 이펙트/드로우콜을 점검할 것');
  process.exit(1);
}
console.log(`감속 내성: ${(slow / base * 100).toFixed(0)}% 유지`);

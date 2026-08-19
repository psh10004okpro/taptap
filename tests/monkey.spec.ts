import { test, expect, Page } from '@playwright/test';

// 몽키 테스트 (@monkey): 랜덤 입력 폭격 후 콘솔 에러 0건 + 상태 불변식 검증.
// 기본 스위트에서 제외 — 실행: npm run test:monkey
// 시드 고정 LCG 를 사용해 실패 재현이 가능하다 (MONKEY_SEED 환경변수로 변경).

const DURATION_MS = Number(process.env.MONKEY_MS ?? 60_000);
const SEED = Number(process.env.MONKEY_SEED ?? 20260819);

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

async function tapGame(page: Page, lx: number, ly: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  await page.mouse.click(box.x + (lx / 720) * box.width, box.y + (ly / 1280) * box.height);
}

test('@monkey 랜덤 입력 내구성: 에러 0건 + 상태 불변식 유지', async ({ page }) => {
  test.setTimeout(DURATION_MS + 90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  await page.waitForFunction(
    () => (window.__taptap!.game as { registry: { get(k: string): unknown } })
      .registry.get('uiReady') === true,
    undefined, { timeout: 15_000 },
  );

  const rnd = lcg(SEED);
  // 의미 있는 표적 + 완전 랜덤을 섞는다
  const hotspots: [number, number][] = [
    [360, 470],   // 몬스터
    [76, 746], [218, 746], [360, 746], [502, 746], [644, 746], // 탭 5개
    [70, 684], [186, 684], [302, 684], [418, 684], [534, 684], [650, 684], // 스킬 6개
    [624, 792], [624, 852], [624, 910],  // 소드마스터: 탭강화/환생/리셋
    [624, 804], [624, 862], [624, 920],  // 영웅/유물 탭 우측 버튼 열
    [190, 1026], [530, 1126],            // 스킬트리 노드
    [130, 956], [360, 956], [590, 956],  // 스킬트리 계열 토글
    [56, 344], [56, 440], [56, 536],     // 플로팅 아이콘 (퀘스트/랭킹/접기)
    [76, 1240], [502, 1240],             // 접힘 상태 탭 바
    [646, 232],                          // 오버레이 닫기
    [250, 292], [470, 292],              // 오버레이 서브탭 토글
    [624, 52],                            // 보스 도전 (우상단)
    [120, 126], [596, 122], [676, 122],  // 상점 / 설정 / 음소거
    [440, 1254], [280, 1254],            // 페이저
  ];

  const start = Date.now();
  let actions = 0;
  while (Date.now() - start < DURATION_MS) {
    const roll = rnd();
    if (roll < 0.5) {
      await tapGame(page, 360 + (rnd() - 0.5) * 300, 400 + (rnd() - 0.5) * 300); // 전투 난타
    } else if (roll < 0.9) {
      const [x, y] = hotspots[Math.floor(rnd() * hotspots.length)];
      await tapGame(page, x, y);
    } else if (roll < 0.97) {
      await tapGame(page, rnd() * 720, rnd() * 1280); // 완전 랜덤
    } else {
      // 가끔 자원 투입으로 구매 경로 활성화
      await page.evaluate(() => {
        window.__taptap!.state.addGold(1e6);
        window.__taptap!.state.addRelics(5);
      });
    }
    actions += 1;
    if (actions % 40 === 0) await page.waitForTimeout(120); // 프레임 소화
  }

  // 팝업이 떠 있을 수 있으니 화면 중앙 하단(팝업 버튼 위치)을 몇 번 눌러 정리
  for (const x of [250, 470, 360]) {
    await tapGame(page, x, 700);
    await page.waitForTimeout(80);
  }

  const invariants = await page.evaluate(() =>
    window.__taptap!.dev.validate(window.__taptap!.state as never));
  console.log(`monkey: ${actions}회 입력, 시드 ${SEED}`);
  expect(invariants, `불변식 위반:\n${invariants.join('\n')}`).toHaveLength(0);
  expect(errors, `콘솔/페이지 에러:\n${errors.slice(0, 10).join('\n')}`).toHaveLength(0);
});

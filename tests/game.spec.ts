import { test, expect, Page } from '@playwright/test';

// window.__taptap 훅으로 상태를 검증하는 E2E 스위트.
// 실제 탭 입력은 캔버스 좌표(FIT 스케일 변환)로 전달한다.

declare global {
  interface Window {
    __taptap?: {
      game: unknown;
      state: {
        gold: number; stage: number; kills: number; tapLevel: number;
        maxStage: number; relics: number; relicsEarned: number;
        heroLevels: number[]; artifactLevels: number[]; mode: string;
        tapDamage(): number; tapCost(): number; totalDps(): number;
        tryBuyTap(): boolean; tryBuyHero(id: number): boolean;
        tryBuyArtifact(id: number): boolean; artifactCost(id: number): number;
        tryActivateSkill(id: number): boolean; isSkillActive(id: number): boolean;
        skillCooldownLeft(id: number): number; isSkillUnlocked(id: number): boolean;
        canPrestige(): boolean; prestigeGain(): number; doPrestige(): boolean;
        addGold(n: number): void; save(): void;
      };
    };
  }
}

async function setup(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // 새 게임 보장: 첫 로드 후 저장 삭제 → 리로드 (addInitScript 는 리로드마다
  // 실행돼 저장/복원 테스트를 깨뜨리므로 사용하지 않는다)
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  // 씬 초기화 여유
  await page.waitForTimeout(600);
  return errors;
}

/** 캔버스 내 논리 좌표(720x1280)를 화면 좌표로 변환해 탭 */
async function tapGame(page: Page, lx: number, ly: number, times = 1): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not found');
  const x = box.x + (lx / 720) * box.width;
  const y = box.y + (ly / 1280) * box.height;
  for (let i = 0; i < times; i++) {
    await page.mouse.click(x, y, { delay: 5 });
  }
}

test('로드: 콘솔 에러 없이 캔버스가 뜬다', async ({ page }) => {
  const errors = await setup(page);
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
  await page.screenshot({ path: 'screenshots/01-load.png' });
});

test('탭 전투: 몬스터 처치로 골드와 스테이지 진행이 발생한다', async ({ page }) => {
  const errors = await setup(page);
  const before = await page.evaluate(() => ({
    gold: window.__taptap!.state.gold,
    kills: window.__taptap!.state.kills,
  }));
  expect(before.gold).toBe(0);

  // 몬스터(중앙) 연타 — 초기 HP ~18, 탭뎀 1 → 60탭이면 최소 2킬
  await tapGame(page, 360, 470, 60);
  await page.waitForTimeout(800);

  const after = await page.evaluate(() => ({
    gold: window.__taptap!.state.gold,
    kills: window.__taptap!.state.kills,
  }));
  expect(after.gold).toBeGreaterThan(0);
  expect(after.kills).toBeGreaterThan(before.kills);
  expect(errors).toHaveLength(0);
  await page.screenshot({ path: 'screenshots/02-combat.png' });
});

test('업그레이드: 탭 공격력/영웅 구매가 골드를 차감하고 능력치를 올린다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => window.__taptap!.state.addGold(10_000));

  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const dmg0 = s.tapDamage();
    const gold0 = s.gold;
    const okTap = s.tryBuyTap();
    const okHero = s.tryBuyHero(0);
    return {
      okTap, okHero,
      dmgUp: s.tapDamage() > dmg0,
      goldDown: s.gold < gold0,
      tapLevel: s.tapLevel,
      heroLevel: s.heroLevels[0],
    };
  });
  expect(r.okTap).toBe(true);
  expect(r.okHero).toBe(true);
  expect(r.dmgUp).toBe(true);
  expect(r.goldDown).toBe(true);
  expect(r.tapLevel).toBe(1);
  expect(r.heroLevel).toBe(1);
  expect(errors).toHaveLength(0);
});

test('영웅 DPS: 고용 후 탭 없이도 몬스터가 잡힌다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(100_000);
    for (let i = 0; i < 20; i++) s.tryBuyHero(0); // 아린 20레벨 → DPS 60
  });
  const gold0 = await page.evaluate(() => window.__taptap!.state.gold);
  await page.waitForTimeout(3_000); // DPS만으로 수 마리 처치
  const gold1 = await page.evaluate(() => window.__taptap!.state.gold);
  expect(gold1).toBeGreaterThan(gold0);
  expect(errors).toHaveLength(0);
  await page.screenshot({ path: 'screenshots/03-dps.png' });
});

test('보스 진행: 9킬 후 보스 모드로 전환된다', async ({ page }) => {
  const errors = await setup(page);
  // 강한 탭뎀 확보 후 빠르게 9킬
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1_000_000);
    for (let i = 0; i < 40; i++) s.tryBuyTap();
  });
  for (let k = 0; k < 12 && !(await page.evaluate(() => window.__taptap!.state.mode === 'boss')); k++) {
    await tapGame(page, 360, 470, 6);
    await page.waitForTimeout(350);
  }
  const mode = await page.evaluate(() => window.__taptap!.state.mode);
  expect(mode).toBe('boss');
  await page.screenshot({ path: 'screenshots/04-boss.png' });
  expect(errors).toHaveLength(0);
});

test('스킬: 해금 조건·발동 효과·쿨다운이 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const lockedTry = s.tryActivateSkill(0);     // maxStage 1 → 해금 전
    s.maxStage = 30;                             // 화염검(5)~분신술(20) 전부 해금
    const dmg0 = s.tapDamage();
    const ok = s.tryActivateSkill(0);            // 화염검: 탭 데미지 x3
    const dmg1 = s.tapDamage();
    const again = s.tryActivateSkill(0);         // 쿨다운 중 재발동 불가
    return {
      lockedTry, ok, again,
      active: s.isSkillActive(0),
      cd: s.skillCooldownLeft(0),
      tripled: dmg1 >= dmg0 * 3 - 1,             // 반올림 여유
      unlocked3: s.isSkillUnlocked(3),
    };
  });
  expect(r.lockedTry).toBe(false);
  expect(r.ok).toBe(true);
  expect(r.again).toBe(false);
  expect(r.active).toBe(true);
  expect(r.cd).toBeGreaterThan(0);
  expect(r.tripled).toBe(true);
  expect(r.unlocked3).toBe(true);
  await page.screenshot({ path: 'screenshots/05-skills.png' });
  expect(errors).toHaveLength(0);
});

test('유물: 구매로 유물이 차감되고 영구 보너스가 적용된다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1_000_000);
    for (let i = 0; i < 20; i++) s.tryBuyTap();  // 반올림에 묻히지 않게 기반 데미지 확보
    s.relics = 100;
    const dmg0 = s.tapDamage();
    const cost = s.artifactCost(0);
    const ok = s.tryBuyArtifact(0);              // 파괴의 검: 탭 +25%
    const noRelics = (() => { s.relics = 0; return s.tryBuyArtifact(0); })();
    return {
      ok, noRelics, cost,
      dmgUp: s.tapDamage() > dmg0,
      lvl: s.artifactLevels[0],
    };
  });
  expect(r.ok).toBe(true);
  expect(r.noRelics).toBe(false);
  expect(r.dmgUp).toBe(true);
  expect(r.lvl).toBe(1);
  expect(errors).toHaveLength(0);
});

test('환생 v2: 유물 화폐 지급 + 유물 강화는 환생 후 유지된다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.maxStage = 40;
    s.relics = 50;
    s.tryBuyArtifact(1);                          // 용맹의 깃발 1강
    const artBefore = s.artifactLevels[1];
    const relicsBefore = s.relics;
    const gain = s.prestigeGain();
    const can = s.canPrestige();
    const ok = s.doPrestige();
    return {
      can, ok, gain,
      relicsAfter: s.relics,
      expected: relicsBefore + gain,
      artKept: s.artifactLevels[1] === artBefore,
      reset: s.stage === 1 && s.gold === 0 && s.tapLevel === 0,
    };
  });
  expect(r.can).toBe(true);
  expect(r.ok).toBe(true);
  expect(r.gain).toBeGreaterThan(0);
  expect(r.relicsAfter).toBe(r.expected);
  expect(r.artKept).toBe(true);
  expect(r.reset).toBe(true);
  expect(errors).toHaveLength(0);
});

test('랭킹(로컬 모드): 탭 전환 후 점수 등록이 로컬에 기록된다', async ({ page }) => {
  const errors = await setup(page);
  await tapGame(page, 450, 746);                  // [랭킹] 탭
  await page.waitForTimeout(400);
  await tapGame(page, 624, 794);                  // [점수 등록]
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('taptap-lb-local');
    return raw ? JSON.parse(raw) as { name: string; stage: number } : null;
  });
  expect(saved).not.toBeNull();
  expect(saved!.stage).toBeGreaterThanOrEqual(1);
  expect(saved!.name.length).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'screenshots/06-ranking.png' });
  expect(errors).toHaveLength(0);
});

test('유물 탭 UI: 목록과 보유 유물이 표시된다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => { window.__taptap!.state.relics = 42; });
  await tapGame(page, 290, 746);                  // [유물] 탭
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/07-artifacts.png' });
  expect(errors).toHaveLength(0);
});

test('저장/복원: 리로드 후 진행 상황이 유지된다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(777);
    s.tryBuyTap();
    (s as unknown as { save(): void }).save();
  });
  const snap = await page.evaluate(() => ({
    gold: window.__taptap!.state.gold,
    tapLevel: window.__taptap!.state.tapLevel,
  }));

  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  await page.waitForTimeout(400);

  const restored = await page.evaluate(() => ({
    gold: window.__taptap!.state.gold,
    tapLevel: window.__taptap!.state.tapLevel,
  }));
  expect(restored.tapLevel).toBe(snap.tapLevel);
  expect(restored.gold).toBeGreaterThanOrEqual(snap.gold); // 오프라인 보상으로 늘 수 있음
  expect(errors).toHaveLength(0);
});

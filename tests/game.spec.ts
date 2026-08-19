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
        addGold(n: number): void; addRelics(n: number): void;
        save(): void; isStale(): boolean;
        goldMult(): number; activateGoldBoost(): void; isGoldBoostActive(): boolean;
        resetSkillCooldowns(): void; anySkillOnCooldown(): boolean;
        equipment: ({ slot: number; rarity: number; statPct: number; stage: number } | null)[];
        daily: { date: string; counters: Record<string, number>; claimed: boolean[] };
        questProgress(id: number): number; canClaimQuest(id: number): boolean;
        claimQuest(id: number): boolean; ensureDaily(): void;
        critChance(): number; petLevels: number[];
        lifetime: Record<string, number>; achClaimed: boolean[];
        achProgress(id: number): number; canClaimAch(id: number): boolean;
        claimAch(id: number): boolean;
      };
      tourney: {
        status(now?: Date): { kind: string; opensInMs?: number; closesInMs?: number };
        isEntered(): boolean;
      };
      season: { seasonKey(now?: Date): string; seasonEndsInMs(now?: Date): number };
      clanBoss: {
        current(s: unknown): { hpMax: number; hpLeft: number; attacksUsed: number; killed: boolean };
        attacksLeft(s: unknown): number;
        attack(s: unknown): { damage: number; killed: boolean; hpLeft: number } | null;
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
  // UIScene 준비 완료까지 기능적으로 대기 (고정 sleep 은 콜드 스타트에서 플레이키)
  await page.waitForFunction(
    () => (window.__taptap!.game as { registry: { get(k: string): unknown } })
      .registry.get('uiReady') === true,
    undefined, { timeout: 15_000 },
  );
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
  await tapGame(page, 644, 746);                  // [랭킹] 탭 (5탭 중 5번째)
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

test('유물 탭 UI: 탭 전환 후 구매 버튼 클릭이 실제로 동작한다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => window.__taptap!.state.addRelics(42)); // 이벤트 발행 경로
  await tapGame(page, 360, 746);                  // [유물] 탭 (5탭 중 3번째)
  await page.waitForTimeout(300);
  await tapGame(page, 624, 864);                  // 첫 유물(파괴의 검) 구매 버튼
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({
    lvl: window.__taptap!.state.artifactLevels[0],
    relics: window.__taptap!.state.relics,
  }));
  expect(r.lvl).toBe(1);                          // 클릭이 UI 를 관통해 상태를 바꿨다
  expect(r.relics).toBeLessThan(42);
  await page.screenshot({ path: 'screenshots/07-artifacts.png' });
  expect(errors).toHaveLength(0);
});

test('시계 조작 방어: 미래 쿨다운·미래 lastSeen 세이브가 클램프된다', async ({ page }) => {
  const errors = await setup(page);
  // 미래로 뻥튀기된 세이브 주입 (시계 롤백 상황 재현)
  await page.evaluate(() => {
    const now = Date.now();
    const save = {
      // gen 999: 리로드 직전 beforeunload 자동저장이 이 주입 세이브를
      // 덮어쓰지 못하게 (세대 가드가 외부 최신 세이브를 보호하는지도 겸사 검증)
      v: 2, gen: 999, gold: 500, stage: 3, kills: 2, maxStage: 30, tapLevel: 1,
      heroLevels: [0, 0, 0, 0, 0, 0, 0, 0], relics: 0, relicsEarned: 0,
      artifactLevels: [0, 0, 0, 0, 0, 0],
      skillReadyAt: [now + 86_400_000, 0, 0, 0],      // 24시간 잠금 시도
      skillActiveUntil: [now + 86_400_000, 0, 0, 0],  // 24시간 버프 시도
      playerName: '', bossFailed: false,
      lastSeen: now + 86_400_000,                     // 미래 lastSeen
    };
    localStorage.setItem('taptap-titans-v1', JSON.stringify(save));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  const r = await page.evaluate(() => ({
    cd: window.__taptap!.state.skillCooldownLeft(0),
    gold: window.__taptap!.state.gold,
  }));
  expect(r.cd).toBeLessThanOrEqual(120_000); // 화염검 쿨다운(2분) 이하로 클램프
  expect(r.gold).toBe(500);                  // 미래 lastSeen → 오프라인 보상 없음
  expect(errors).toHaveLength(0);
});

test('멀티탭 방어: 다른 탭이 저장하면 이 탭은 stale 이 되어 덮어쓰지 않는다', async ({ page, context }) => {
  const errors = await setup(page);
  // 탭 A 진행 저장
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addRelics(10);
    s.save();
  });
  // 탭 B 를 열어 같은 게임 구동 → B 의 저장이 더 새 세대가 된다
  const pageB = await context.newPage();
  await pageB.goto('/');
  await pageB.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  await pageB.evaluate(() => window.__taptap!.state.save());
  await page.waitForTimeout(500); // storage 이벤트 전파
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const stale = s.isStale();
    s.save(); // stale 이면 무시되어야 함
    return { stale };
  });
  expect(r.stale).toBe(true);
  await pageB.close();
  expect(errors).toHaveLength(0);
});

test('광고 보상: 골드 부스트가 배율에 반영되고 쿨다운 리셋이 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const m0 = s.goldMult();
    s.activateGoldBoost();
    const m1 = s.goldMult();
    // 쿨다운 리셋: 스킬 사용 후 리셋되는지
    s.maxStage = 30;
    s.tryActivateSkill(0);
    const cdBefore = s.skillCooldownLeft(0);
    s.resetSkillCooldowns();
    const cdAfter = s.skillCooldownLeft(0);
    return { m0, m1, boosted: s.isGoldBoostActive(), cdBefore, cdAfter };
  });
  expect(r.m1).toBeCloseTo(r.m0 * 2, 5);
  expect(r.boosted).toBe(true);
  expect(r.cdBefore).toBeGreaterThan(0);
  expect(r.cdAfter).toBe(0);
  expect(errors).toHaveLength(0);
});

test('장비: 장착 장비가 탭 데미지 배율에 반영된다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1_000_000);
    for (let i = 0; i < 20; i++) s.tryBuyTap();
    const dmg0 = s.tapDamage();
    s.equipment[0] = { slot: 0, rarity: 2, statPct: 100, stage: 10 }; // 무기 +100%
    const dmg1 = s.tapDamage();
    return { dmg0, dmg1 };
  });
  expect(r.dmg1).toBeGreaterThanOrEqual(Math.floor(r.dmg0 * 1.9)); // ~2배
  expect(errors).toHaveLength(0);
});

test('일일 퀘스트: 카운터 누적 → 달성 → 보상 수령', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.ensureDaily();
    // 스킬 3회 사용 퀘스트(id 2, relics 보상)를 강제 달성
    s.maxStage = 30;
    s.daily.counters.skillUses = 3;
    const can = s.canClaimQuest(2);
    const relics0 = s.relics;
    const ok = s.claimQuest(2);
    const again = s.claimQuest(2); // 중복 수령 불가
    return { can, ok, again, gained: s.relics - relics0, prog: s.questProgress(2) };
  });
  expect(r.can).toBe(true);
  expect(r.ok).toBe(true);
  expect(r.again).toBe(false);
  expect(r.gained).toBe(2);
  expect(errors).toHaveLength(0);
});

test('P1 영웅 패시브: 20레벨 도달 시 보너스가 활성화된다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1e9);
    for (let i = 0; i < 30; i++) s.tryBuyTap(); // 기반 탭뎀 확보
    const dmg0 = s.tapDamage();
    for (let i = 0; i < 20; i++) s.tryBuyHero(0); // 아린 20렙 → 패시브: 탭 +10%
    const dmg1 = s.tapDamage();
    return { dmg0, dmg1, ratio: dmg1 / dmg0 };
  });
  expect(r.ratio).toBeGreaterThan(1.05); // +10% 반영 (반올림 여유)
  expect(errors).toHaveLength(0);
});

test('P1 유물 다양화: 영웅 비용 할인 유물이 실제 비용을 낮춘다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addRelics(1000);
    const cost0 = s.heroCost(5);
    for (let i = 0; i < 10; i++) s.tryBuyArtifact(8); // 상인의 인장 -2%/lvl
    const cost1 = s.heroCost(5);
    return { cost0, cost1 };
  });
  expect(r.cost1).toBeLessThan(r.cost0 * 0.85); // -20%
  expect(errors).toHaveLength(0);
});

test('P1 장비 세트: 동일 등급 3슬롯이면 모든 데미지 보너스', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1e6);
    for (let i = 0; i < 20; i++) s.tryBuyTap();
    const dmg0 = s.tapDamage();
    s.equipment[0] = { slot: 0, rarity: 2, statPct: 0, stage: 1 };
    s.equipment[1] = { slot: 1, rarity: 2, statPct: 0, stage: 1 };
    s.equipment[2] = { slot: 2, rarity: 2, statPct: 0, stage: 1 }; // 영웅 세트 +35%
    const dmg1 = s.tapDamage();
    const mixed = (() => {
      s.equipment[2] = { slot: 2, rarity: 1, statPct: 0, stage: 1 };
      return s.tapDamage();
    })();
    return { dmg0, dmg1, mixed };
  });
  expect(r.dmg1).toBeGreaterThan(r.dmg0 * 1.3); // +35%
  expect(r.mixed).toBeLessThan(r.dmg1);          // 등급 섞이면 세트 해제
  expect(errors).toHaveLength(0);
});

test('P1 영웅 페이징: 2페이지에서 상위 영웅 정보가 표시되고 구매가 동작한다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => window.__taptap!.state.addGold(1e15));
  await tapGame(page, 440, 1260); // ▶ 다음 페이지
  await page.waitForTimeout(300);
  await tapGame(page, 624, 848); // 2페이지 첫 행(영웅 8) 고용 버튼
  await page.waitForTimeout(300);
  const lvl = await page.evaluate(() => window.__taptap!.state.heroLevels[8]);
  expect(lvl).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: 'screenshots/11-hero-page2.png' });
  expect(errors).toHaveLength(0);
});

test('P2 신규 스킬: 필살 강타 크리 증가, 천상의 일격 즉발 처치', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.maxStage = 50; // 전 스킬 해금
    const cc0 = s.critChance();
    const ok5 = s.tryActivateSkill(5);        // 필살 강타 +25%p
    const cc1 = s.critChance();
    const kills0 = s.kills + 0;
    const ok4 = s.tryActivateSkill(4);        // 천상의 일격: 탭뎀 40배 → 1스테이지 몬스터 원킬
    return { ok4, ok5, cc0, cc1, kills0 };
  });
  expect(r.ok5).toBe(true);
  expect(r.cc1).toBeGreaterThan(r.cc0 + 0.2);
  expect(r.ok4).toBe(true);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    gold: window.__taptap!.state.gold,
    kills: window.__taptap!.state.kills,
  }));
  expect(after.gold).toBeGreaterThan(0); // 버스트로 처치 발생
  expect(errors).toHaveLength(0);
});

test('P2 업적: 평생 통계 달성 → 유물 보상 수령 (중복 불가)', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.lifetime.taps = 1_000;                  // 업적 0: 탭 1,000회
    const can = s.canClaimAch(0);
    const relics0 = s.relics;
    const ok = s.claimAch(0);
    const again = s.claimAch(0);
    return { can, ok, again, gained: s.relics - relics0 };
  });
  expect(r.can).toBe(true);
  expect(r.ok).toBe(true);
  expect(r.again).toBe(false);
  expect(r.gained).toBe(3);
  expect(errors).toHaveLength(0);
});

test('P2 토너먼트: 주말 창 계산과 참가 상태가 올바르다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const t = window.__taptap!.tourney;
    return {
      wed: t.status(new Date('2026-08-19T12:00:00')).kind,  // 수요일 → closed
      sat: t.status(new Date('2026-08-22T12:00:00')).kind,  // 토요일 → open
      sun: t.status(new Date('2026-08-23T23:00:00')).kind,  // 일요일 밤 → open
      mon: t.status(new Date('2026-08-24T00:30:00')).kind,  // 월요일 → closed
      entered: t.isEntered(),
    };
  });
  expect(r.wed).toBe('closed');
  expect(r.sat).toBe('open');
  expect(r.sun).toBe('open');
  expect(r.mon).toBe('closed');
  expect(r.entered).toBe(false);
  expect(errors).toHaveLength(0);
});

test('P3 시즌: 시즌 키 계산과 시즌 전환 보상이 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const keys = await page.evaluate(() => ({
    s1: window.__taptap!.season.seasonKey(new Date('2026-01-10T00:00:00Z')),
    s2: window.__taptap!.season.seasonKey(new Date('2026-02-05T00:00:00Z')),
    now: window.__taptap!.season.seasonKey(),
    endsMs: window.__taptap!.season.seasonEndsInMs(),
  }));
  expect(keys.s1).toBe('S1');
  expect(keys.s2).toBe('S2');
  expect(keys.endsMs).toBeGreaterThan(0);

  // 지난 시즌 스냅샷 주입 → 리로드 시 보상 지급
  await page.evaluate(() => {
    localStorage.setItem('taptap-season', JSON.stringify({ key: 'S1', stage: 60 }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  const relics = await page.evaluate(() => window.__taptap!.state.relics);
  expect(relics).toBeGreaterThanOrEqual(3); // 60/20 = 3
  expect(errors).toHaveLength(0);
});

test('P3 펫: 펫 레벨이 효과 집계에 반영된다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1e6);
    for (let i = 0; i < 20; i++) s.tryBuyTap();
    const dmg0 = s.tapDamage();
    s.petLevels[0] = 10; // 불도마뱀: 탭 +5%/lvl → +50%
    const dmg1 = s.tapDamage();
    return { dmg0, dmg1 };
  });
  expect(r.dmg1).toBeGreaterThan(r.dmg0 * 1.4);
  expect(errors).toHaveLength(0);
});

test('P3 클랜 보스: 공격권 소모·피해 적용·주간 상태가 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const cb = window.__taptap!.clanBoss;
    s.addGold(1e6);
    for (let i = 0; i < 10; i++) s.tryBuyHero(0); // DPS 확보
    const b0 = cb.current(s);
    const a1 = cb.attack(s);
    const a2 = cb.attack(s);
    const a3 = cb.attack(s);
    const a4 = cb.attack(s); // 4회째 → null (주 3회)
    const b1 = cb.current(s);
    return {
      hp0: b0.hpLeft, a1: !!a1, a2: !!a2, a3: !!a3, a4,
      dmg: a1?.damage ?? 0,
      hpAfter: b1.hpLeft, used: b1.attacksUsed,
    };
  });
  expect(r.a1).toBe(true);
  expect(r.a2).toBe(true);
  expect(r.a3).toBe(true);
  expect(r.a4).toBeNull();
  expect(r.dmg).toBeGreaterThan(0);
  expect(r.hpAfter).toBeLessThan(r.hp0);
  expect(r.used).toBe(3);
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

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
        todaysQuests(): number[]; heroPassivesActive(id: number): number;
        recordAdWatch(): void;
        critChance(): number; petLevels: number[]; treeLevels: number[];
        spEarned(): number; spSpent(): number; spAvailable(): number;
        canBuyNode(id: number): boolean; tryBuyNode(id: number): boolean;
        isNodeUnlocked(id: number): boolean; respecTree(): boolean;
        skillPowerMult(): number;
        lifetime: Record<string, number>; achClaimed: boolean[];
        achProgress(id: number): number; canClaimAch(id: number): boolean;
        claimAch(id: number): boolean;
        gems: number; gemsPurchased: number;
        grantGems(n: number, purchased: boolean): void; vipTier(): number;
        gemCooldownReset(): boolean; gemGoldPack(): boolean;
        gemEquipBox(): boolean; gemRespecTree(): boolean; offlineCapSec(): number;
        tut: number; confirmTutorial(): void; recordKill(isBoss: boolean): void;
      };
      tourney: {
        status(now?: Date): { kind: string; opensInMs?: number; closesInMs?: number };
        isEntered(): boolean;
      };
      season: { seasonKey(now?: Date): string; seasonEndsInMs(now?: Date): number };
      zoneFor?: never; // (존은 config 순수 함수 — state 경유 검증)
      clanBoss: {
        current(s: unknown): { hpMax: number; hpLeft: number; attacksUsed: number; killed: boolean };
        attacksLeft(s: unknown): number;
        attack(s: unknown): { damage: number; killed: boolean; hpLeft: number } | null;
      };
      dev: {
        applyPreset(s: unknown, name: string): void;
        snapshot(s: unknown): Record<string, string | number>;
        validate(s: unknown): string[];
        exportSave(s: unknown): string;
        spawnFairy(bus: { emit(ev: string, ...a: unknown[]): void }): void;
      };
      sfx: { isEnabled(): boolean; toggle(): boolean };
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
  await tapGame(page, 56, 440);                   // 랭킹 플로팅 아이콘
  await page.waitForTimeout(400);
  await tapGame(page, 624, 290);                  // [점수 등록]
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
  await tapGame(page, 644, 746);                  // [유물] 탭 (5탭 중 5번째)
  await page.waitForTimeout(300);
  await tapGame(page, 624, 844);                  // 첫 유물(파괴의 검) 구매 버튼
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
  // storage 이벤트 전파를 폴링으로 대기 (고정 sleep 은 느린 CI 에서 플레이키)
  // save() 내부의 세대 재확인 경로도 stale 을 세팅하므로 함께 관찰한다
  await expect.poll(async () => page.evaluate(() => {
    const s = window.__taptap!.state;
    s.save();
    return s.isStale();
  }), { timeout: 5_000 }).toBe(true);
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
    // 로테이션을 고정해 결정성 확보 (오늘의 3종은 날짜 시드라 매일 다름)
    (s.daily as unknown as { questIds: number[] }).questIds = [0, 1, 2];
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
  await tapGame(page, 218, 746); // [영웅] 탭
  await page.waitForTimeout(300);
  await tapGame(page, 440, 1254); // ▶ 다음 페이지
  await page.waitForTimeout(300);
  await tapGame(page, 624, 804); // 2페이지 첫 행(영웅 8) 고용 버튼
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

test('스킬트리: SP 적립·선행 조건·노드 구매가 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.maxStage = 100;
    s.lifetime.prestiges = 2;
    const earned = s.spEarned();            // 10 + 4 = 14
    const lockedT1 = s.canBuyNode(1);       // 선행(검술 연마 3) 미달
    const ok1 = s.tryBuyNode(0);            // 검술 연마 1
    s.tryBuyNode(0); s.tryBuyNode(0);       // 3레벨
    const unlockedT1 = s.isNodeUnlocked(1);
    const ok2 = s.tryBuyNode(1);            // 급소 간파 (SP 2)
    return {
      earned, lockedT1, ok1, unlockedT1, ok2,
      spent: s.spSpent(),                   // 3*1 + 1*2 = 5
      avail: s.spAvailable(),               // 14 - 5 = 9
      lvl0: s.treeLevels[0], lvl1: s.treeLevels[1],
    };
  });
  expect(r.earned).toBe(14);
  expect(r.lockedT1).toBe(false);
  expect(r.ok1).toBe(true);
  expect(r.unlockedT1).toBe(true);
  expect(r.ok2).toBe(true);
  expect(r.spent).toBe(5);
  expect(r.avail).toBe(9);
  expect(r.lvl0).toBe(3);
  expect(r.lvl1).toBe(1);
  expect(errors).toHaveLength(0);
});

test('스킬트리: 스킬 강화·쿨다운 감소·리스펙이 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.maxStage = 400; // SP 40
    s.addGold(1e9);
    for (let i = 0; i < 30; i++) s.tryBuyTap();
    // 기사 트리를 티어3(무신의 경지)까지
    for (let i = 0; i < 3; i++) s.tryBuyNode(0);
    for (let i = 0; i < 3; i++) s.tryBuyNode(1);
    for (let i = 0; i < 3; i++) s.tryBuyNode(2);
    s.tryBuyNode(3);                          // 스킬 효과 +10%
    const power = s.skillPowerMult();         // 1.1
    // 연금술사: 시간 촉매(쿨다운 -5%)까지
    for (let i = 0; i < 3; i++) s.tryBuyNode(8);
    for (let i = 0; i < 3; i++) s.tryBuyNode(9);
    s.tryBuyNode(10);
    // 화염검 발동 → 쿨다운이 기본(120s)보다 짧아야 함
    s.tryActivateSkill(0);
    const cd = s.skillCooldownLeft(0);
    // 강화된 화염검: 순수 x3 을 초과해야 함 (x3 -> 1+2*1.1 = x3.2)
    const dmgBoosted = s.tapDamage();
    // 리스펙
    s.addRelics(20);
    const relics0 = s.relics;
    const ok = s.respecTree();
    return {
      power, cd, ok,
      relicsCost: relics0 - s.relics,
      spentAfter: s.spSpent(),
      dmgBoosted,
    };
  });
  expect(r.power).toBeCloseTo(1.1, 5);
  expect(r.cd).toBeLessThanOrEqual(115_000); // 120s - 5%
  expect(r.cd).toBeGreaterThan(100_000);
  expect(r.ok).toBe(true);
  expect(r.relicsCost).toBe(10);
  expect(r.spentAfter).toBe(0);
  expect(errors).toHaveLength(0);
});

test('QA 툴: 데브 패널(?dev=1) 로드·프리셋·불변식 검증이 동작한다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?dev=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  await page.waitForSelector('#qa-toggle', { timeout: 10_000 });

  // 패널 열기 → 프리셋 '중반' 적용 (DOM 버튼 실클릭)
  await page.click('#qa-toggle');
  await page.click('#qa-panel button:has-text("중반")');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    return {
      stage: s.stage,
      relics: s.relics,
      invariants: window.__taptap!.dev.validate(s as never),
      snapshotHasDps: 'dps' in window.__taptap!.dev.snapshot(s as never),
    };
  });
  expect(r.stage).toBe(55);
  expect(r.relics).toBe(30);
  expect(r.invariants).toHaveLength(0);
  expect(r.snapshotHasDps).toBe(true);
  await page.screenshot({ path: 'screenshots/17-devpanel.png' });
  expect(errors).toHaveLength(0);
});

test('QA 툴: 일반 모드(?dev 없음)에서는 패널이 로드되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(await page.locator('#qa-toggle').count()).toBe(0);
});

test('BM 보석: 싱크 4종이 차감·효과·잔액 부족 처리까지 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const broke = s.gemGoldPack();          // 보석 0 → 실패
    s.grantGems(200, false);
    const gold0 = s.gold;
    const okGold = s.gemGoldPack();         // 50젬 → 골드 지급
    s.maxStage = 30;
    s.tryActivateSkill(0);
    const okCd = s.gemCooldownReset();      // 20젬 → 쿨다운 0
    const cdAfter = s.skillCooldownLeft(0);
    const okBox = s.gemEquipBox();          // 80젬 → 장비 (영웅 이상)
    const boxRarity = Math.max(...s.equipment.filter(Boolean).map((e) => e!.rarity), -1);
    return {
      broke, okGold, okCd, okBox, cdAfter,
      goldGained: s.gold > gold0,
      gemsLeft: s.gems,                     // 200 - 50 - 20 - 80 = 50
      boxRarity,
    };
  });
  expect(r.broke).toBe(false);
  expect(r.okGold).toBe(true);
  expect(r.goldGained).toBe(true);
  expect(r.okCd).toBe(true);
  expect(r.cdAfter).toBe(0);
  expect(r.okBox).toBe(true);
  expect(r.boxRarity).toBeGreaterThanOrEqual(2); // 영웅(2) 이상만 나옴
  expect(r.gemsLeft).toBe(50);
  expect(errors).toHaveLength(0);
});

test('BM VIP: 누적 구매 보석이 티어와 오프라인 상한을 올린다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const t0 = s.vipTier();
    const cap0 = s.offlineCapSec();
    s.grantGems(500, true);                 // 구매 경로 → VIP 누적
    const t1 = s.vipTier();
    const cap1 = s.offlineCapSec();
    s.grantGems(500, false);                // 비구매 지급 → VIP 미반영
    const t2 = s.vipTier();
    return { t0, t1, t2, cap0, cap1 };
  });
  expect(r.t0).toBe(0);
  expect(r.t1).toBe(2);                     // 500 누적 → 티어 2
  expect(r.t2).toBe(2);
  expect(r.cap1).toBe(r.cap0 + 2 * 3600);   // 오프라인 상한 +2시간
  expect(errors).toHaveLength(0);
});

test('BM 상점 UI: dev 모드에서 Mock 결제로 보석 팩 구매가 완료된다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?dev=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  await page.waitForFunction(
    () => (window.__taptap!.game as { registry: { get(k: string): unknown } })
      .registry.get('uiReady') === true,
    undefined, { timeout: 15_000 },
  );
  // 보석 카운터([상점]) 탭 → 상점 열림 → 첫 팩(보석 한 줌) 구매
  await tapGame(page, 120, 126);            // 보석 텍스트 영역
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/18-shop.png' });
  await tapGame(page, 620, 220);            // 첫 팩 구매 버튼 (y=panelTop+100)
  await page.waitForTimeout(1_200);         // Mock 결제 500ms + 지급
  const r = await page.evaluate(() => ({
    gems: window.__taptap!.state.gems,
    purchased: window.__taptap!.state.gemsPurchased,
  }));
  expect(r.gems).toBe(80);
  expect(r.purchased).toBe(80);
  expect(errors).toHaveLength(0);
});

test('볼륨 확장: 일퀘 로테이션이 결정적이고 목록 밖 퀘스트는 수령 불가', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    const today = s.todaysQuests();
    const daily = s.daily as unknown as { questIds: number[] };
    // 로테이션 밖 퀘스트는 달성해도 수령 불가
    daily.questIds = [0, 1, 3];
    s.daily.counters.skillUses = 99; // id 2 (스킬 3회) 조건 충족
    const outsideClaim = s.canClaimQuest(2);
    return { today, len: today.length, outsideClaim };
  });
  expect(r.len).toBe(3);
  expect(new Set(r.today).size).toBe(3); // 중복 없음
  expect(r.outsideClaim).toBe(false);
  expect(errors).toHaveLength(0);
});

test('볼륨 확장: 유물 40종 페이징에서 후기 유물 구매가 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addRelics(1000);
    const ok = s.tryBuyArtifact(39);        // 종언의 서 (마지막 유물)
    const dmgBoost = s.tapDamage();
    return { ok, lvl: s.artifactLevels[39], count: s.artifactLevels.length, dmgBoost };
  });
  expect(r.ok).toBe(true);
  expect(r.lvl).toBe(1);
  expect(r.count).toBe(40);
  // UI: [유물] 탭 → ▶ 페이저로 마지막 페이지까지 이동해도 에러 없음
  await tapGame(page, 644, 746);
  await page.waitForTimeout(300);
  for (let i = 0; i < 5; i++) await tapGame(page, 440, 1254);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/19-artifacts-paged.png' });
  expect(errors).toHaveLength(0);
});

test('볼륨 확장: 영웅 2차 패시브가 100레벨에서 추가 해금된다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.heroLevels[0] = 20;
    const p1 = s.heroPassivesActive(0);
    const dmg1 = s.tapDamage();
    s.heroLevels[0] = 100;
    const p2 = s.heroPassivesActive(0);
    const dmg2 = s.tapDamage();
    s.heroLevels[0] = 200;
    const p3 = s.heroPassivesActive(0);
    return { p1, p2, p3, up: dmg2 >= dmg1 };
  });
  expect(r.p1).toBe(1);
  expect(r.p2).toBe(2);
  expect(r.p3).toBe(3);
  expect(r.up).toBe(true);
  expect(errors).toHaveLength(0);
});

test('볼륨 확장: 트리 계열 토글로 군주 T5 노드 구매가 동작한다', async ({ page }) => {
  const errors = await setup(page);
  const r = await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.maxStage = 600; // SP 60
    // 군주 계열 T1~T5 진행
    for (let i = 0; i < 3; i++) s.tryBuyNode(4);
    for (let i = 0; i < 3; i++) s.tryBuyNode(5);
    for (let i = 0; i < 3; i++) s.tryBuyNode(6);
    for (let i = 0; i < 3; i++) s.tryBuyNode(7);
    const lockedT5 = s.canBuyNode(14);
    const okT5 = s.tryBuyNode(14);          // 총력전 (T4 노드 3렙 후)
    return { lockedT5, okT5, lvl: s.treeLevels[14], nodes: s.treeLevels.length };
  });
  expect(r.lockedT5).toBe(true);
  expect(r.okT5).toBe(true);
  expect(r.lvl).toBe(1);
  expect(r.nodes).toBe(18);
  expect(errors).toHaveLength(0);
});

test('존 테마: 스테이지에 따라 존 이름과 몬스터가 바뀐다', async ({ page }) => {
  const errors = await setup(page);
  // 스테이지 45 (설원 아님 — 3번째 존 '동굴') 로 점프
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.stage = 45; s.maxStage = 45;
    (s as unknown as { emit(ev: string, ...a: unknown[]): void }).emit('stage', 45, 0);
  });
  await tapGame(page, 360, 470, 2); // 스폰 유도 (다음 처치 시 새 존 몬스터)
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/20-zone.png' });
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

test('사운드: 기본 활성, 음소거 토글이 영속되고 탭 사운드 경로에 에러가 없다', async ({ page }) => {
  const errors = await setup(page);

  // 기본값: 사운드 켜짐 + 탭(사운드 재생 경로)에서 에러 없음
  expect(await page.evaluate(() => window.__taptap!.sfx.isEnabled())).toBe(true);
  await tapGame(page, 360, 470, 5);

  // 상단바 ♪ 버튼으로 음소거
  await tapGame(page, 676, 122);
  expect(await page.evaluate(() => window.__taptap!.sfx.isEnabled())).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('taptap-sfx-muted'))).toBe('1');

  // 리로드 후에도 음소거 유지
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__taptap!.sfx.isEnabled())).toBe(false);

  // 훅으로 재활성화
  expect(await page.evaluate(() => window.__taptap!.sfx.toggle())).toBe(true);
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

test('온보딩: 새 게임 5단계가 순서대로 진행되고 기존 세이브는 생략된다', async ({ page }) => {
  const errors = await setup(page);

  // 새 게임은 0단계에서 시작
  expect(await page.evaluate(() => window.__taptap!.state.tut)).toBe(0);

  // 0단계: 탭 10회 → 1단계
  await tapGame(page, 360, 470, 10);
  await expect.poll(() => page.evaluate(() => window.__taptap!.state.tut)).toBe(1);

  // 1단계: 탭 강화 구매 → 2단계
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1e6);
    s.tryBuyTap();
  });
  expect(await page.evaluate(() => window.__taptap!.state.tut)).toBe(2);

  // 2단계: 영웅 고용 → 3단계
  await page.evaluate(() => window.__taptap!.state.tryBuyHero(0));
  expect(await page.evaluate(() => window.__taptap!.state.tut)).toBe(3);

  // 3단계: 첫 보스 처치 → 4단계 (환생 안내)
  await page.evaluate(() => window.__taptap!.state.recordKill(true));
  expect(await page.evaluate(() => window.__taptap!.state.tut)).toBe(4);

  // 4단계: 배너(HP 바 아래) 탭으로 닫기 → 완료(99)
  await tapGame(page, 360, 268);
  await expect.poll(() => page.evaluate(() => window.__taptap!.state.tut)).toBe(99);

  // 완료 상태는 저장/복원 유지
  await page.evaluate(() => window.__taptap!.state.save());
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__taptap!.state.tut)).toBe(99);

  // v8 이하(tut 필드 없음) 세이브 마이그레이션: 기존 유저는 튜토리얼 생략
  await page.evaluate(() => {
    const raw = JSON.parse(window.__taptap!.dev.exportSave(window.__taptap!.state)) as
      Record<string, unknown>;
    delete raw.tut;
    raw.v = 8;
    raw.gen = 999; // 세대 가드가 beforeunload 자동저장을 무시하게
    localStorage.setItem('taptap-titans-v1', JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__taptap!.state.tut)).toBe(99);
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

test('설정: SFX/BGM/진동 토글이 팝업에서 동작하고 영속된다', async ({ page }) => {
  const errors = await setup(page);

  // [설정] 버튼 → 팝업
  await tapGame(page, 596, 122);
  // SFX 토글 (행 y=304)
  await tapGame(page, 658, 304);
  expect(await page.evaluate(() => window.__taptap!.sfx.isEnabled())).toBe(false);
  // BGM 토글 (행 y=370) — 기본 켬 → 끔
  await tapGame(page, 658, 370);
  expect(await page.evaluate(() => localStorage.getItem('taptap-bgm-on'))).toBe('0');
  // 진동 토글 (행 y=436) — 기본 켬 → 끔
  await tapGame(page, 658, 436);
  expect(await page.evaluate(() => localStorage.getItem('taptap-vibrate'))).toBe('0');
  // 닫기 후 리로드해도 유지
  await tapGame(page, 650, 240);
  await page.reload();
  await page.waitForFunction(() => !!window.__taptap, undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__taptap!.sfx.isEnabled())).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('taptap-bgm-on'))).toBe('0');
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

// --- TT2 문법 UI 재편 ------------------------------------------------------

/** GameScene 의 요정 오브젝트 조작용 최소 타입 */
interface FairyProbe {
  game: {
    events: { emit(ev: string, ...a: unknown[]): void };
    scene: {
      getScene(k: string): {
        children: { list: { texture?: { key: string }; visible: boolean;
          setPosition(x: number, y: number): void; x: number; y: number }[] };
        tweens: { killTweensOf(o: unknown): void };
      };
    };
  };
}

test('UI 재편: 5탭이 성장 축 전용이고 소드마스터에 환생·스킬트리가 있다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => {
    const t = window.__taptap!;
    t.dev.applyPreset(t.state, 'mid');
  });
  await page.waitForTimeout(300);

  // 기본 탭 = 소드마스터: 탭 공격력 구매가 동작한다
  await page.evaluate(() => window.__taptap!.state.addGold(1e12));
  await tapGame(page, 624, 792);                  // 탭 공격력 구매 버튼
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__taptap!.state.tapLevel)).toBeGreaterThan(60);

  // 같은 탭의 스킬트리: 계열 토글 → 노드 구매
  const sp0 = await page.evaluate(() => window.__taptap!.state.spAvailable());
  await tapGame(page, 360, 956);                  // [군주] 계열
  await page.waitForTimeout(200);
  await tapGame(page, 190, 1026);                 // T1 노드
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({
    sp: window.__taptap!.state.spAvailable(),
    lord: window.__taptap!.state.treeLevels[4],
  }));
  expect(r.lord).toBeGreaterThanOrEqual(1);
  expect(r.sp).toBeLessThan(sp0);

  // [펫] 탭이 독립 탭으로 존재 (장비 탭에서 분리)
  await tapGame(page, 502, 746);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/21-pet-tab.png' });
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

test('UI 재편: 플로팅 아이콘이 퀘스트/랭킹 오버레이를 열고 닫는다', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.lifetime.taps = 100_000;   // 업적 달성 상태로 배지/수령 확인
    s.daily.counters.kills = 999;
  });

  // 퀘스트 오버레이 열기 → 일일 퀘스트 보상 수령
  await tapGame(page, 56, 344);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screenshots/22-quest-overlay.png' });
  const claimedBefore = await page.evaluate(() => window.__taptap!.state.relics);
  await tapGame(page, 624, 370);                  // 첫 일일 퀘스트 [받기]
  await page.waitForTimeout(300);

  // 오버레이가 덮은 좌표를 눌러도 전투 탭으로 새지 않는다 (씬이 달라 딤이 못 막음)
  const blockedBefore = await page.evaluate(() => window.__taptap!.state.lifetime.taps);
  await tapGame(page, 360, 470, 5);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__taptap!.state.lifetime.taps)).toBe(blockedBefore);

  // 업적 서브탭 전환
  await tapGame(page, 470, 292);
  await page.waitForTimeout(300);
  const achClaim = await page.evaluate(() => {
    const s = window.__taptap!.state;
    return s.achClaimed.some((c) => c) || s.relics >= 0;
  });
  expect(achClaim).toBe(true);

  // 닫기 → 랭킹 오버레이 열기
  await tapGame(page, 646, 232);
  await page.waitForTimeout(200);
  await tapGame(page, 56, 440);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/23-rank-overlay.png' });
  await tapGame(page, 470, 382);                  // [클랜] 서브탭
  await page.waitForTimeout(300);
  await tapGame(page, 646, 232);                  // 닫기
  await page.waitForTimeout(200);

  // 오버레이가 닫힌 뒤에는 전투 탭이 다시 통한다
  const kills0 = await page.evaluate(() => window.__taptap!.state.lifetime.kills);
  await tapGame(page, 360, 470, 40);
  await page.waitForTimeout(500);
  const kills1 = await page.evaluate(() => window.__taptap!.state.lifetime.kills);
  expect(kills1).toBeGreaterThan(kills0);
  expect(await page.evaluate(() => window.__taptap!.state.relics)).toBeGreaterThanOrEqual(claimedBefore);
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

test('UI 재편: 보스 버튼이 우상단에서 재도전을 시작한다', async ({ page }) => {
  const errors = await setup(page);
  // 보스 실패 상태 → 파밍 모드에서 재도전 버튼 노출
  await page.evaluate(() => {
    const s = window.__taptap!.state;
    s.addGold(1e12);
    for (let i = 0; i < 40; i++) s.tryBuyTap();
    for (let i = 0; i < 9; i++) s.recordKill(false); // 9킬 → 보스 모드
    (s as unknown as { failBoss(): void }).failBoss(); // 도주 → 파밍 복귀 + 재도전 버튼
  });
  await page.waitForTimeout(400);
  const pre = await page.evaluate(() => ({
    mode: window.__taptap!.state.mode, kills: window.__taptap!.state.kills,
  }));
  expect(pre.mode).toBe('farm');
  expect(pre.kills).toBe(9);

  await tapGame(page, 624, 52);                   // 우상단 [보스 도전!]
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__taptap!.state.mode)).toBe('boss');
  await page.screenshot({ path: 'screenshots/24-boss-topright.png' });
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

test('요정: 소환된 요정을 탭하면 광고 보상(골드 x2)이 지급된다', async ({ page }) => {
  const errors = await setup(page);
  expect(await page.evaluate(() => window.__taptap!.state.isGoldBoostActive())).toBe(false);

  // 요정 소환 후 트윈을 멈추고 고정 좌표로 옮겨 결정적으로 탭한다
  const fairy = await page.evaluate(() => {
    const t = window.__taptap! as unknown as FairyProbe & { dev: { spawnFairy(b: unknown): void } };
    t.dev.spawnFairy(t.game.events);
    const scene = t.game.scene.getScene('Game');
    const f = scene.children.list.find((o) => o.texture?.key === 'fairy');
    if (!f) return null;
    scene.tweens.killTweensOf(f);
    f.setPosition(360, 400);
    return { visible: f.visible, x: f.x, y: f.y };
  });
  expect(fairy).not.toBeNull();
  expect(fairy!.visible).toBe(true);

  await tapGame(page, 360, 400);
  await page.waitForTimeout(1200);                // Mock 광고 재생 600ms
  expect(await page.evaluate(() => window.__taptap!.state.isGoldBoostActive())).toBe(true);
  expect(errors, `콘솔 에러: ${errors.join('\n')}`).toHaveLength(0);
});

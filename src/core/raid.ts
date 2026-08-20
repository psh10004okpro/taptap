// ---------------------------------------------------------------------------
// 레이드 카드 — 데이터와 순수 공식만. (docs/RAIDS.md)
//
// 아직 어떤 씬도 import 하지 않는다 → 번들에 실리지 않는다. 구현 착수 전에
// **경제가 성립하는지 먼저 시뮬로 확인하기 위한** 계층이다 (sim/raid.ts).
//
// 핵심 설계 결정(문서와 동일): 카드는 레이드 안에서만 힘을 갖는다.
// 본편 밸런스(config.ts 곡선, npm run sim)와 완전히 분리된 별도 경제라
// 카드가 아무리 세져도 본편 인플레가 생기지 않는다.
//
// 서버 확보 전에는 구현하지 않는다 — 카드 지급 원장은 서버에만 둔다.
// ---------------------------------------------------------------------------

export type CardRarity = 0 | 1 | 2 | 3; // 일반 / 희귀 / 영웅 / 전설
export type CardElement = 'fire' | 'shock' | 'void';

/** 레이드 한정 효과 축 */
export type CardEffect =
  | 'partDmg'      // 부위 데미지 +%
  | 'burn'         // 화상 도트 +% (초당, 전투 30초)
  | 'shock'        // 감전 도트 +%
  | 'breakBonus'   // 부위 파괴 보너스 +%
  | 'extraAttack'; // 공격권 +1 (전설 전용)

export interface CardDef {
  id: number;
  rarity: CardRarity;
  element: CardElement;
  effect: CardEffect;
  /** 레벨당 효과량 (extraAttack 은 레벨 무관 1회) */
  perLvl: number;
  maxLevel: number;
}

// 구현 시 표시 문구는 core/names.ts 접근자를 거쳐야 한다 (docs/I18N.md) —
// 여기 원문은 한국어 단일 출처로 남는다.
export const CARD_RARITY_NAMES = ['일반', '희귀', '영웅', '전설'] as const;

/** 등급별 장수: 일반 12 / 희귀 10 / 영웅 6 / 전설 2 = 30종 */
const RARITY_PLAN: { rarity: CardRarity; count: number; perLvl: number; maxLevel: number }[] = [
  { rarity: 0, count: 12, perLvl: 0.04, maxLevel: 10 },
  { rarity: 1, count: 10, perLvl: 0.09, maxLevel: 8 },
  { rarity: 2, count: 6, perLvl: 0.18, maxLevel: 6 },
  { rarity: 3, count: 2, perLvl: 0.35, maxLevel: 4 },
];

const EFFECT_CYCLE: CardEffect[] = ['partDmg', 'burn', 'shock', 'breakBonus'];
const ELEMENT_CYCLE: CardElement[] = ['fire', 'shock', 'void'];

export const CARDS: CardDef[] = (() => {
  const out: CardDef[] = [];
  let id = 0;
  for (const plan of RARITY_PLAN) {
    for (let i = 0; i < plan.count; i++) {
      // 전설 2장 중 1장만 공격권 +1 (문서: 공격권은 전설 전용, 희소해야 한다)
      const effect: CardEffect = plan.rarity === 3 && i === 0
        ? 'extraAttack'
        : EFFECT_CYCLE[id % EFFECT_CYCLE.length];
      out.push({
        id,
        rarity: plan.rarity,
        element: ELEMENT_CYCLE[id % ELEMENT_CYCLE.length],
        effect,
        perLvl: plan.perLvl,
        maxLevel: plan.maxLevel,
      });
      id++;
    }
  }
  return out;
})();

export const DECK_SIZE = 5;

/** 팩 1장당 등급 확률 — 공시 대상 (EQUIP_BOX_RATES 와 같은 단일 출처 규칙) */
export const CARD_PACK_RATES: { rarity: CardRarity; rate: number }[] = [
  { rarity: 0, rate: 0.70 },
  { rarity: 1, rate: 0.24 },
  { rarity: 2, rate: 0.055 },
  { rarity: 3, rate: 0.005 },
];

/** 중복 카드를 강화 재료로 쓸 때 필요한 장수 (레벨 → 다음 레벨) */
export function dupesForLevel(level: number): number {
  return level + 1;             // 1→2 에 2장, 2→3 에 3장 ...
}

/** 강화에 함께 드는 Dust */
export function dustForLevel(rarity: CardRarity, level: number): number {
  return Math.round(20 * (rarity + 1) * Math.pow(1.6, level));
}

/** 중복 카드를 Dust 로 분해할 때 나오는 양 (덱에 없는 카드의 출구) */
export function dustFromDupe(rarity: CardRarity): number {
  return [8, 24, 90, 400][rarity];
}

/**
 * Dust 상점 천장 — 원하는 등급을 확정 구매 (확률에 갇히지 않게).
 * 가격은 **실제 Dust 수입에 맞춰야** 천장 구실을 한다. 처음 잡았던
 * 30,000(전설)은 26주 누적 수입이 800 남짓이라 평생 닿지 않았다 —
 * 확률에만 갇히는 설계였다. 지금 값은 sim/raid.ts 기준
 * 영웅 ~4개월 / 전설 ~6개월에 확정 1장이 나오는 선이다.
 */
export function dustPityCost(rarity: CardRarity): number {
  return [60, 200, 500, 900][rarity];
}

// --- 레이드 보스 ------------------------------------------------------------

export const RAID_PARTS = ['head', 'body', 'tail'] as const;
export type RaidPart = typeof RAID_PARTS[number];
/** 부위별 HP 비중 (합 1). 꼬리가 얇아 먼저 깨지고, 몸통이 본체다 */
export const PART_HP_SHARE: Record<RaidPart, number> = { head: 0.3, body: 0.5, tail: 0.2 };
/** 부위 파괴 시 클랜 전체 데미지 버프 */
export const PART_BREAK_BUFF = 0.15;

/**
 * 주간 보상 (문서: 기여도 비례 — 카드 팩 + Dust).
 * Dust 를 분해 수입에만 의존시키면 천장까지 9개월이 걸린다 (sim/raid.ts 로 확인).
 * 직접 보상이 있어야 "이번 주도 천장에 가까워진다"는 감각이 생긴다.
 */
export const PACKS_ON_CLEAR = 6;
export const PACKS_ON_FAIL = 3;
export const DUST_ON_CLEAR = 120;
export const DUST_ON_FAIL = 50;

export const RAID_MAX_TIER = 10;
export const RAID_ATTACKS_PER_DAY = 1;
export const RAID_FIGHT_SEC = 30;

/**
 * 티어별 레이드 보스 HP. ClanBoss.bossHpFor 를 확장한다 —
 * 클랜 인원 x 티어 스케일. 인원이 적은 클랜이 낮은 티어에 머무는 것은 정상이고,
 * 티어는 직전 주 기록으로 자동 배정된다 (문서).
 */
export function raidBossHp(baseBossHp: number, tier: number, members: number): number {
  const t = Math.max(1, Math.min(RAID_MAX_TIER, tier));
  // 티어 배수는 덱 성장 속도(sim/raid.ts 로 측정)를 넘으면 안 된다.
  // 2.4 로 뒀을 때 티어 2 에서 26주 내내 정체했다 — 덱은 그 사이 1.6배밖에
  // 못 자란다. 1.28 은 "몇 주 준비하면 다음 티어가 열리는" 속도다.
  return baseBossHp * Math.pow(1.28, t - 1) * Math.max(1, members) * 0.6;
}

/** 덱의 레이드 데미지 배율 (본편 DPS 에 곱해지는 값이 아니라 레이드 전용 계수) */
export function deckPower(deck: { def: CardDef; level: number }[]): number {
  let dmg = 1;
  let dot = 0;
  let brk = 0;
  const elements = new Map<CardElement, number>();
  for (const c of deck) {
    const amount = c.def.perLvl * c.level;
    if (c.def.effect === 'partDmg') dmg += amount;
    else if (c.def.effect === 'burn' || c.def.effect === 'shock') dot += amount;
    else if (c.def.effect === 'breakBonus') brk += amount;
    elements.set(c.def.element, (elements.get(c.def.element) ?? 0) + 1);
  }
  // 같은 속성 3장 시너지
  let synergy = 1;
  for (const n of elements.values()) if (n >= 3) synergy += 0.12;
  return (dmg + dot * 0.8 + brk * 0.4) * synergy;
}

/** 공격 1회의 기대 데미지 = 본편 클랜보스 공격력 x 덱 계수 */
export function raidAttackDamage(baseAttack: number, deckMult: number): number {
  return baseAttack * deckMult;
}

/** 공격권: 기본 1회 + extraAttack 카드 보유 시 +1 */
export function attacksPerDay(deck: { def: CardDef }[]): number {
  return RAID_ATTACKS_PER_DAY + (deck.some((c) => c.def.effect === 'extraAttack') ? 1 : 0);
}

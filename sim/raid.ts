// 레이드 카드 경제 시뮬. 실행: node sim/raid.ts [주차]
//
// 구현 착수 전에 답해야 할 질문만 본다 (docs/RAIDS.md):
//   1. 덱 5장이 차는 데 몇 주 걸리나 (첫 목표까지의 거리)
//   2. 전설을 언제 만나나 — 확률에만 맡기면 얼마나 잔인한가, 천장은 작동하나
//   3. Dust 는 남아도나 모자라나 (분해 수입 vs 강화·천장 지출)
//   4. 티어가 오르는 속도와 보스 HP 증가가 덱 성장을 앞지르지 않나
//
// 본편 밸런스(sim/engine.ts)와 완전히 분리돼 있다 — 카드는 레이드 안에서만
// 힘을 갖기 때문에 이 시뮬 결과가 본편 곡선에 영향을 주지 않는다.
import {
  CARDS, CARD_PACK_RATES, DECK_SIZE, DUST_ON_CLEAR, DUST_ON_FAIL,
  PACKS_ON_CLEAR, PACKS_ON_FAIL, PART_BREAK_BUFF, RAID_MAX_TIER,
  attacksPerDay, deckPower, dupesForLevel, dustForLevel, dustFromDupe,
  dustPityCost, raidBossHp,
  type CardDef, type CardRarity,
} from '../src/core/raid.ts';

/** 재현 가능한 난수 (시드 고정 — 시뮬 결과가 실행마다 흔들리면 판단할 수 없다) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rollRarity(r: number): CardRarity {
  let acc = 0;
  for (const { rarity, rate } of CARD_PACK_RATES) {
    acc += rate;
    if (r < acc) return rarity;
  }
  return 0;
}

interface Owned { level: number; dupes: number }

interface WeekLog {
  week: number;
  tier: number;
  deckSize: number;
  deckMult: number;
  dust: number;
  legendaries: number;
  cleared: boolean;
}


function bestDeck(owned: Map<number, Owned>): { def: CardDef; level: number }[] {
  const list = [...owned.entries()]
    .map(([id, o]) => ({ def: CARDS[id], level: o.level }))
    // 등급 우선, 같은 등급이면 레벨 — 실제 유저의 직관적인 선택과 같다
    .sort((a, b) => (b.def.rarity - a.def.rarity) || (b.level - a.level));
  return list.slice(0, DECK_SIZE);
}

/**
 * 유저의 실제 행동을 모사한다: **덱에 들어갈 카드만 강화하고, 나머지 중복은 전부
 * 분해한다.** 이 규칙이 없으면 25종에 중복이 흩어져 Dust 도 레벨도 안 오른다
 * (첫 시뮬에서 Dust 가 26주 내내 0이었던 원인).
 */
function spend(owned: Map<number, Owned>, dust: number): number {
  const keep = new Set(bestDeck(owned).map((c) => c.def.id));
  // 덱 밖 카드의 중복은 즉시 분해
  for (const [id, o] of owned) {
    if (keep.has(id) || o.dupes <= 0) continue;
    dust += o.dupes * dustFromDupe(CARDS[id].rarity);
    o.dupes = 0;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, o] of owned) {
      if (!keep.has(id)) continue;
      const def = CARDS[id];
      if (o.level >= def.maxLevel) continue;
      const needD = dupesForLevel(o.level);
      const needDust = dustForLevel(def.rarity, o.level);
      if (o.dupes >= needD && dust >= needDust) {
        o.dupes -= needD;
        dust -= needDust;
        o.level += 1;
        changed = true;
      }
    }
  }
  for (const [id, o] of owned) {
    const def = CARDS[id];
    if (o.level >= def.maxLevel && o.dupes > 0) {
      dust += o.dupes * dustFromDupe(def.rarity);
      o.dupes = 0;
    }
  }
  return dust;
}

function simulate(weeks: number, seed: number): WeekLog[] {
  const rand = rng(seed);
  const owned = new Map<number, Owned>();
  let dust = 0;
  let tier = 1;
  const logs: WeekLog[] = [];
  // 본편 클랜보스 기준 공격력/HP 를 1로 정규화 — 여기서 보는 것은 비율이다
  const baseAttack = 1;
  const baseBossHp = 12;
  const members = 10;

  for (let w = 1; w <= weeks; w++) {
    const deck = bestDeck(owned);
    const mult = deck.length ? deckPower(deck) : 0;
    const perDay = attacksPerDay(deck);
    // 부위 파괴 버프는 전투가 진행될수록 붙는다 — 평균 1.5부위 파괴로 근사
    const buff = 1 + PART_BREAK_BUFF * 1.5;
    const weekDamage = mult * baseAttack * perDay * 7 * members * buff;
    const hp = raidBossHp(baseBossHp, tier, members);
    const cleared = weekDamage >= hp;

    const packs = cleared ? PACKS_ON_CLEAR : PACKS_ON_FAIL;
    for (let i = 0; i < packs; i++) {
      const rarity = rollRarity(rand());
      const pool = CARDS.filter((c) => c.rarity === rarity);
      const def = pool[Math.floor(rand() * pool.length)];
      const o = owned.get(def.id);
      if (o) o.dupes += 1;
      else owned.set(def.id, { level: 1, dupes: 0 });
    }
    dust += cleared ? DUST_ON_CLEAR : DUST_ON_FAIL;   // 주간 직접 보상
    dust = spend(owned, dust);

    // Dust 천장 구매. 유저는 두 가지 모드로 행동한다:
    //  - 덱이 아직 안 찼다: 지금 살 수 있는 가장 좋은 등급으로 자리를 메운다
    //  - 덱이 찼는데 전설이 없다: **전설을 위해 모은다** (하위 등급에 흘리지 않는다)
    // 이 저축 행동을 모델링하지 않으면 하위 구매가 Dust 를 계속 갉아먹어
    // 전설 천장이 영원히 발동하지 않는다 — 실제로 첫 시뮬이 그랬다.
    const hasLegend = [...owned.keys()].some((id) => CARDS[id].rarity === 3);
    const targets: CardRarity[] = owned.size < DECK_SIZE
      ? [2, 1, 0]
      : (hasLegend ? [2, 1] : [3]);
    for (const target of targets) {
      if (dust < dustPityCost(target)) continue;
      const missing = CARDS.find((c) => c.rarity === target && !owned.has(c.id));
      if (!missing) continue;
      dust -= dustPityCost(target);
      owned.set(missing.id, { level: 1, dupes: 0 });
      break;                      // 주당 1회만
    }

    logs.push({
      week: w, tier,
      deckSize: Math.min(owned.size, DECK_SIZE),
      deckMult: mult,
      dust,
      legendaries: [...owned.keys()].filter((id) => CARDS[id].rarity === 3).length,
      cleared,
    });
    if (cleared && tier < RAID_MAX_TIER) tier += 1;
  }
  return logs;
}

// --- 리포트 -----------------------------------------------------------------
const WEEKS = Number(process.argv[2] ?? 26);
const SEEDS = [1, 7, 20260820];

console.log(`카드 ${CARDS.length}종 · 덱 ${DECK_SIZE}장 · ${WEEKS}주 · 시드 ${SEEDS.length}개\n`);
console.log('팩 확률: ' + CARD_PACK_RATES
  .map((r) => `${['일반', '희귀', '영웅', '전설'][r.rarity]} ${(r.rate * 100).toFixed(1)}%`).join(' / '));

const deckFull: number[] = [];
const firstLegend: number[] = [];
const tierAt: number[] = [];

for (const seed of SEEDS) {
  const logs = simulate(WEEKS, seed);
  const full = logs.find((l) => l.deckSize >= DECK_SIZE);
  const leg = logs.find((l) => l.legendaries > 0);
  deckFull.push(full ? full.week : Infinity);
  firstLegend.push(leg ? leg.week : Infinity);
  tierAt.push(logs[logs.length - 1].tier);

  console.log(`\n--- 시드 ${seed} ---`);
  for (const l of logs) {
    if (l.week <= 8 || l.week % 4 === 0 || l.week === WEEKS) {
      console.log(`  ${String(l.week).padStart(2)}주  티어 ${String(l.tier).padStart(2)}`
        + `  덱 ${l.deckSize}/${DECK_SIZE}  배율 ${l.deckMult.toFixed(2)}`
        + `  Dust ${String(Math.round(l.dust)).padStart(6)}`
        + `  전설 ${l.legendaries}  ${l.cleared ? '처치' : '실패'}`);
    }
  }
}

const fmt = (xs: number[]) => xs.map((x) => (Number.isFinite(x) ? `${x}주` : '미달')).join(' / ');
console.log('\n===== 요약 =====');
console.log(`  덱 5장 완성:   ${fmt(deckFull)}`);
console.log(`  첫 전설:       ${fmt(firstLegend)}`);
console.log(`  ${WEEKS}주차 티어: ${tierAt.join(' / ')} (상한 ${RAID_MAX_TIER})`);
console.log('\n판단 기준 (docs/RAIDS.md):');
console.log('  - 덱 5장이 4주 안에 차야 첫 달 안에 "덱을 짜는 재미"가 시작된다');
console.log('  - 전설은 확률만으로는 수십 주가 정상 — 천장(Dust)이 실질 획득 경로여야 한다');
console.log('  - 티어가 매주 오르기만 하면 보스가 장식이다. 중간에 실패 주가 섞여야 한다');

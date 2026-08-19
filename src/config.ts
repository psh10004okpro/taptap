// ---------------------------------------------------------------------------
// 게임 전역 설정 & 밸런스 곡선
// 로직은 렌더링과 분리: 이 파일과 core/ 는 Phaser 의존 없이 순수 TS로 유지한다.
// ---------------------------------------------------------------------------

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// 레이아웃 (세로 모드 고정) — Scene/테스트가 공유하는 단일 출처
export const TOP_BAR_H = 150;
export const PANEL_Y = 748; // 하단 패널 시작
export const COMBAT_CENTER = { x: 360, y: 470 };
export const COMBAT_BOTTOM = 646;  // 전투 탭 존 하한 (스킬바 위)
export const SKILL_BAR_Y = 684;    // 스킬 버튼 중심 y
export const TAB_Y = PANEL_Y - 2;  // 패널 탭 버튼 중심 y

export const MONSTERS_PER_STAGE = 10; // 9마리 + 보스
export const BOSS_TIME_LIMIT = 30_000; // ms (유물로 연장 가능)
export const BASE_CRIT_CHANCE = 0.05;
export const BASE_CRIT_MULT = 8;
export const PRESTIGE_MIN_STAGE = 25;
export const OFFLINE_RATE = 0.4; // 오프라인 DPS 환산율
export const OFFLINE_CAP_SEC = 4 * 3600;

// --- 효과 타입 (영웅 패시브 / 유물 / 펫이 공유하는 보너스 집계 체계) ----------

export type EffectType =
  | 'tap'        // 탭 데미지 배율 (fraction: 0.1 = +10%)
  | 'dps'        // 영웅 DPS 배율
  | 'gold'       // 골드 획득 배율
  | 'allDmg'     // 탭+DPS 공통 배율
  | 'critChance' // 크리 확률 가산 (fraction: 0.01 = +1%p)
  | 'critMult'   // 크리 배율 가산 (절대값)
  | 'bossTime'   // 보스 제한시간 가산 (ms)
  | 'offline'    // 오프라인 보상 배율
  | 'skillDur'   // 스킬 지속시간 배율
  | 'heroCost';  // 영웅 비용 할인 (fraction, 총합 50% 상한)

export const HERO_COST_DISCOUNT_CAP = 0.5;

export interface HeroPassive {
  type: EffectType;
  value: number;
  desc: string;
}

export interface HeroDef {
  id: number;
  name: string;
  title: string;
  baseCost: number;
  baseDps: number;
  color: number;
  passive: HeroPassive;
}

/** 영웅 패시브 해금 레벨 */
export const HERO_PASSIVE_UNLOCK = 20;

const HERO_COLORS = [0xe74c3c, 0x2ecc71, 0xe67e22, 0x9b59b6, 0x95a5a6, 0xf1c40f, 0x3498db, 0x34495e];

// 티어 계수: 뒤 티어일수록 패시브가 강함 (1x / 2x / 3x)
const HERO_RAW: [string, string, EffectType, number, string][] = [
  ['아린', '견습 검사', 'tap', 0.10, '탭 데미지 +10%'],
  ['벨라', '숲의 궁수', 'dps', 0.10, '영웅 DPS +10%'],
  ['단테', '화염 마법사', 'gold', 0.08, '골드 획득 +8%'],
  ['리네', '달빛 도적', 'critChance', 0.01, '크리 확률 +1%p'],
  ['가온', '바위 수호자', 'bossTime', 1000, '보스 시간 +1초'],
  ['세라', '빛의 사제', 'offline', 0.08, '오프라인 보상 +8%'],
  ['카이', '뇌전 무사', 'allDmg', 0.05, '모든 데미지 +5%'],
  ['느와르', '심연의 기사', 'skillDur', 0.05, '스킬 지속 +5%'],
  ['하늘', '창공의 창기사', 'tap', 0.20, '탭 데미지 +20%'],
  ['모리안', '까마귀 주술사', 'dps', 0.20, '영웅 DPS +20%'],
  ['골디', '황금 연금술사', 'gold', 0.16, '골드 획득 +16%'],
  ['이졸데', '서리 무희', 'critChance', 0.02, '크리 확률 +2%p'],
  ['바위금', '고룡 조련사', 'bossTime', 2000, '보스 시간 +2초'],
  ['루멘', '별빛 현자', 'offline', 0.16, '오프라인 보상 +16%'],
  ['천둥', '뇌신의 후예', 'allDmg', 0.10, '모든 데미지 +10%'],
  ['그림자', '무영검사', 'skillDur', 0.10, '스킬 지속 +10%'],
  ['볼카르', '용암 거인', 'tap', 0.30, '탭 데미지 +30%'],
  ['세레스', '대지의 여신관', 'dps', 0.30, '영웅 DPS +30%'],
  ['미다스', '탐욕의 군주', 'gold', 0.24, '골드 획득 +24%'],
  ['혈랑', '붉은 늑대왕', 'critMult', 1.0, '크리 배율 +1'],
  ['타이탄', '거신 병기', 'heroCost', 0.05, '영웅 비용 -5%'],
  ['오로라', '극광의 마녀', 'offline', 0.24, '오프라인 보상 +24%'],
  ['라그나', '종말의 기사', 'allDmg', 0.15, '모든 데미지 +15%'],
  ['에테르', '시간의 감시자', 'skillDur', 0.15, '스킬 지속 +15%'],
];

/** 24영웅 — 비용 x9.5/티어 (sim 으로 페이싱 검증), DPS 는 비용의 6% (약 17초 회수) */
export const HEROES: HeroDef[] = HERO_RAW.map(([name, title, type, value, desc], i) => ({
  id: i,
  name,
  title,
  baseCost: Math.round(50 * Math.pow(9.5, i)),
  baseDps: Math.max(1, Math.round(50 * Math.pow(9.5, i) * 0.06 * 100) / 100),
  color: HERO_COLORS[i % HERO_COLORS.length],
  passive: { type, value, desc },
}));

// --- 액티브 스킬 -----------------------------------------------------------

export interface SkillDef {
  id: number;
  name: string;
  desc: string;
  unlockStage: number;   // maxStage 기준 해금
  duration: number;      // ms
  cooldown: number;      // ms (지속시간 포함)
  color: number;
  glyph: string;         // 버튼에 표시할 한 글자
}

export const SKILLS: SkillDef[] = [
  {
    id: 0, name: '화염검', desc: '30초간 탭 데미지 x3',
    unlockStage: 5, duration: 30_000, cooldown: 120_000, color: 0xe74c3c, glyph: '화',
  },
  {
    id: 1, name: '전투 함성', desc: '30초간 영웅 DPS x3',
    unlockStage: 10, duration: 30_000, cooldown: 180_000, color: 0x3498db, glyph: '함',
  },
  {
    id: 2, name: '황금손', desc: '30초간 골드 획득 x2',
    unlockStage: 15, duration: 30_000, cooldown: 180_000, color: 0xf1c40f, glyph: '금',
  },
  {
    id: 3, name: '분신술', desc: '30초간 초당 5회 자동 탭',
    unlockStage: 20, duration: 30_000, cooldown: 240_000, color: 0x9b59b6, glyph: '분',
  },
  {
    id: 4, name: '천상의 일격', desc: '즉시 탭 데미지 40배의 일격',
    unlockStage: 30, duration: 0, cooldown: 90_000, color: 0xf7dc6f, glyph: '천',
  },
  {
    id: 5, name: '필살 강타', desc: '15초간 크리티컬 확률 +25%p',
    unlockStage: 40, duration: 15_000, cooldown: 180_000, color: 0xec7063, glyph: '필',
  },
];

export const SKILL_TAP_MULT = 3;
export const SKILL_DPS_MULT = 3;
export const SKILL_GOLD_MULT = 2;
export const SHADOW_CLONE_TAPS_PER_SEC = 5;
export const HEAVENLY_STRIKE_MULT = 40;   // 천상의 일격: 탭 데미지 배수
export const DEADLY_STRIKE_CRIT_BONUS = 0.25; // 필살 강타: 크리 확률 가산

// --- 유물 (환생 화폐로 구매하는 영구 강화) -----------------------------------

export interface ArtifactDef {
  id: number;
  name: string;
  desc: string;          // 레벨당 효과 설명
  baseCost: number;      // 유물 개수
  maxLevel: number;      // 0 = 무제한
  color: number;
  effect: { type: EffectType; perLvl: number };
}

/** 유물 20종 — id 0~5 는 세이브 호환을 위해 효과/수치 불변 유지 */
export const ARTIFACTS: ArtifactDef[] = [
  { id: 0, name: '파괴의 검', desc: '탭 데미지 +25%', baseCost: 3, maxLevel: 0, color: 0xe74c3c, effect: { type: 'tap', perLvl: 0.25 } },
  { id: 1, name: '용맹의 깃발', desc: '영웅 DPS +25%', baseCost: 3, maxLevel: 0, color: 0x3498db, effect: { type: 'dps', perLvl: 0.25 } },
  { id: 2, name: '미다스의 잔', desc: '골드 획득 +20%', baseCost: 4, maxLevel: 0, color: 0xf1c40f, effect: { type: 'gold', perLvl: 0.2 } },
  { id: 3, name: '매의 눈', desc: '크리티컬 확률 +1%p', baseCost: 5, maxLevel: 20, color: 0x2ecc71, effect: { type: 'critChance', perLvl: 0.01 } },
  { id: 4, name: '거인의 심장', desc: '크리티컬 배율 +0.5', baseCost: 5, maxLevel: 0, color: 0xe67e22, effect: { type: 'critMult', perLvl: 0.5 } },
  { id: 5, name: '시간의 모래', desc: '보스 제한시간 +2초', baseCost: 6, maxLevel: 15, color: 0x9b59b6, effect: { type: 'bossTime', perLvl: 2000 } },
  { id: 6, name: '학자의 두루마리', desc: '오프라인 보상 +10%', baseCost: 4, maxLevel: 0, color: 0x1abc9c, effect: { type: 'offline', perLvl: 0.1 } },
  { id: 7, name: '바람의 부적', desc: '스킬 지속시간 +5%', baseCost: 5, maxLevel: 20, color: 0x76d7c4, effect: { type: 'skillDur', perLvl: 0.05 } },
  { id: 8, name: '상인의 인장', desc: '영웅 비용 -2%', baseCost: 6, maxLevel: 15, color: 0xd4ac0d, effect: { type: 'heroCost', perLvl: 0.02 } },
  { id: 9, name: '태초의 룬', desc: '모든 데미지 +15%', baseCost: 8, maxLevel: 0, color: 0xecf0f1, effect: { type: 'allDmg', perLvl: 0.15 } },
  { id: 10, name: '사냥꾼의 발톱', desc: '탭 데미지 +40%', baseCost: 5, maxLevel: 0, color: 0xc0392b, effect: { type: 'tap', perLvl: 0.4 } },
  { id: 11, name: '군단의 나팔', desc: '영웅 DPS +40%', baseCost: 5, maxLevel: 0, color: 0x2980b9, effect: { type: 'dps', perLvl: 0.4 } },
  { id: 12, name: '황금 골렘심장', desc: '골드 획득 +30%', baseCost: 7, maxLevel: 0, color: 0xf39c12, effect: { type: 'gold', perLvl: 0.3 } },
  { id: 13, name: '얼어붙은 눈물', desc: '보스 제한시간 +3초', baseCost: 8, maxLevel: 10, color: 0x85c1e9, effect: { type: 'bossTime', perLvl: 3000 } },
  { id: 14, name: '맹독 바늘', desc: '크리티컬 확률 +0.5%p', baseCost: 6, maxLevel: 30, color: 0x27ae60, effect: { type: 'critChance', perLvl: 0.005 } },
  { id: 15, name: '거신의 주먹', desc: '크리티컬 배율 +1', baseCost: 8, maxLevel: 0, color: 0xba4a00, effect: { type: 'critMult', perLvl: 1 } },
  { id: 16, name: '성좌의 지도', desc: '모든 데미지 +10%', baseCost: 5, maxLevel: 0, color: 0xbb8fce, effect: { type: 'allDmg', perLvl: 0.1 } },
  { id: 17, name: '여명의 등불', desc: '오프라인 보상 +15%', baseCost: 7, maxLevel: 0, color: 0xf8c471, effect: { type: 'offline', perLvl: 0.15 } },
  { id: 18, name: '폭풍의 핵', desc: '탭 데미지 +60%', baseCost: 9, maxLevel: 0, color: 0x5dade2, effect: { type: 'tap', perLvl: 0.6 } },
  { id: 19, name: '대지의 맥박', desc: '영웅 DPS +60%', baseCost: 9, maxLevel: 0, color: 0x7d6608, effect: { type: 'dps', perLvl: 0.6 } },
];

/** 유물 다음 레벨 비용 (유물 개수) */
export function artifactCost(def: ArtifactDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(1.35, level));
}

// --- 보상형 광고 슬롯 -------------------------------------------------------
// SDK(AdMob 등) 연동 전에도 게임 시스템으로서 먼저 존재한다. core/AdRewards.ts.

export const AD_GOLD_BOOST_MULT = 2;
export const AD_GOLD_BOOST_DURATION = 30 * 60_000; // 30분
export const AD_OFFLINE_MULT = 2; // 오프라인 보상 2배 (팝업에서 1회)

// --- 장비 (보스 드롭, 슬롯당 최고 1개 자동 장착) -----------------------------

export interface EquipSlotDef {
  id: number;
  name: string;
  stat: 'tap' | 'dps' | 'gold';
}

export const EQUIP_SLOTS: EquipSlotDef[] = [
  { id: 0, name: '무기', stat: 'tap' },
  { id: 1, name: '갑옷', stat: 'dps' },
  { id: 2, name: '장신구', stat: 'gold' },
];

export interface RarityDef { name: string; color: number; mult: number; weight: number }

export const RARITIES: RarityDef[] = [
  { name: '일반', color: 0x95a5a6, mult: 1.0, weight: 60 },
  { name: '희귀', color: 0x3498db, mult: 1.8, weight: 27 },
  { name: '영웅', color: 0x9b59b6, mult: 3.2, weight: 10 },
  { name: '전설', color: 0xf1c40f, mult: 6.0, weight: 3 },
];

export const EQUIP_DROP_CHANCE = 0.18; // 보스 처치당

/** 세트 효과: 3슬롯 전부 같은 등급이면 모든 데미지 +% (등급 인덱스별) */
export const EQUIP_SET_BONUS = [0.10, 0.20, 0.35, 0.60];

export interface EquipItem {
  slot: number;
  rarity: number;   // RARITIES 인덱스
  statPct: number;  // 해당 슬롯 스탯 +%
  stage: number;    // 획득 스테이지
}

/** 드롭 장비의 스탯% — 등급 배율 x 스테이지 스케일, 상한 300% */
export function equipStatPct(rarity: number, stage: number): number {
  const raw = RARITIES[rarity].mult * (5 + stage * 0.25);
  return Math.min(300, Math.round(raw));
}

// --- 일일 퀘스트 ------------------------------------------------------------

export type QuestMetric = 'kills' | 'bossKills' | 'skillUses';

export interface QuestDef {
  id: number;
  desc: string;
  metric: QuestMetric;
  target: number;
  reward: 'gold' | 'relics';
  /** gold 는 현재 스테이지 killGold 의 배수, relics 는 개수 */
  amount: number;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 0, desc: '몬스터 200마리 처치', metric: 'kills', target: 200, reward: 'gold', amount: 150 },
  { id: 1, desc: '보스 5회 처치', metric: 'bossKills', target: 5, reward: 'gold', amount: 400 },
  { id: 2, desc: '스킬 3회 사용', metric: 'skillUses', target: 3, reward: 'relics', amount: 2 },
];

// --- 펫 (보스가 떨어뜨리는 알로 획득/성장, 영구 보너스) -----------------------

export interface PetDef {
  id: number;
  name: string;
  glyph: string;
  color: number;
  bonus: { type: EffectType; perLvl: number };
  desc: string; // 레벨당 효과
}

export const PETS: PetDef[] = [
  { id: 0, name: '불도마뱀', glyph: '불', color: 0xe74c3c, bonus: { type: 'tap', perLvl: 0.05 }, desc: '탭 데미지 +5%' },
  { id: 1, name: '바람매', glyph: '매', color: 0x5dade2, bonus: { type: 'dps', perLvl: 0.05 }, desc: '영웅 DPS +5%' },
  { id: 2, name: '금두더지', glyph: '금', color: 0xf1c40f, bonus: { type: 'gold', perLvl: 0.04 }, desc: '골드 획득 +4%' },
  { id: 3, name: '그림자삵', glyph: '삵', color: 0x8e44ad, bonus: { type: 'critChance', perLvl: 0.002 }, desc: '크리 확률 +0.2%p' },
  { id: 4, name: '이끼거북', glyph: '龜', color: 0x27ae60, bonus: { type: 'offline', perLvl: 0.04 }, desc: '오프라인 보상 +4%' },
  { id: 5, name: '꼬마정령', glyph: '정', color: 0xec7063, bonus: { type: 'allDmg', perLvl: 0.02 }, desc: '모든 데미지 +2%' },
];

export const PET_EGG_DROP_CHANCE = 0.06; // 보스 처치당

// --- 업적 (평생 통계 기반, 보상: 유물) ---------------------------------------

export type LifetimeMetric = 'taps' | 'kills' | 'bossKills' | 'prestiges' | 'equipDrops' | 'maxStage';

export interface AchievementDef {
  id: number;
  desc: string;
  metric: LifetimeMetric;
  target: number;
  rewardRelics: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 0, desc: '탭 1,000회', metric: 'taps', target: 1_000, rewardRelics: 3 },
  { id: 1, desc: '탭 10,000회', metric: 'taps', target: 10_000, rewardRelics: 8 },
  { id: 2, desc: '몬스터 1,000마리 처치', metric: 'kills', target: 1_000, rewardRelics: 5 },
  { id: 3, desc: '보스 100회 처치', metric: 'bossKills', target: 100, rewardRelics: 6 },
  { id: 4, desc: '스테이지 50 도달', metric: 'maxStage', target: 50, rewardRelics: 5 },
  { id: 5, desc: '스테이지 100 도달', metric: 'maxStage', target: 100, rewardRelics: 12 },
  { id: 6, desc: '환생 3회', metric: 'prestiges', target: 3, rewardRelics: 8 },
  { id: 7, desc: '장비 10개 획득', metric: 'equipDrops', target: 10, rewardRelics: 6 },
];

// --- 주말 토너먼트 (어비셜 방식: 제로베이스 24h+ 경쟁) ------------------------

export const TOURNEY_REWARD_PER_10_STAGES = 1; // 종료 시 스테이지 10당 유물 1

export const MONSTER_NAMES = [
  '슬라임', '버섯돌이', '가시두꺼비', '동굴박쥐', '고블린',
  '숲도깨비', '진흙괴물', '얼음정령', '모래전갈', '그림자늑대',
];

export const BOSS_NAMES = [
  '왕슬라임', '거대 골렘', '화염 오우거', '서리 거인', '심연의 드래곤',
];

// --- 밸런스 곡선 -----------------------------------------------------------

/** 성장률 상수 — 벽(진행 정체)의 위치는 HP_GROWTH 와 GOLD_GROWTH 의 격차가 만든다.
 *  골드가 HP 를 그대로 따라가면(=같은 성장률) 수입이 난이도를 항상 따라잡아
 *  벽이 생기지 않는다는 것이 시뮬레이션으로 확인됨 (sim/run.ts). */
export const HP_GROWTH = 1.55;
export const GOLD_GROWTH = 1.42; // sim/tune.ts 스윕으로 선정
export const GOLD_BASE = 4;
export const BOSS_GOLD_MULT = 12;

/** 일반 몬스터 최대 체력 (스테이지 지수 성장) */
export function monsterHp(stage: number, isBoss: boolean): number {
  const base = 18 * Math.pow(HP_GROWTH, stage - 1);
  return Math.max(1, Math.round(base * (isBoss ? 6 : 1)));
}

/** 처치 골드 보상 — HP 와 독립된 완만한 곡선 (격차가 벽을 만든다) */
export function killGold(stage: number, isBoss: boolean): number {
  const base = GOLD_BASE * Math.pow(GOLD_GROWTH, stage - 1);
  return Math.max(1, Math.round(base * (isBoss ? BOSS_GOLD_MULT : 1)));
}

/** 탭 공격력: 레벨 누적 증가분 (캐시하여 사용) */
const tapDmgCache: number[] = [1];
export function tapDamageAt(level: number): number {
  for (let i = tapDmgCache.length; i <= level; i++) {
    tapDmgCache[i] = tapDmgCache[i - 1] + Math.max(1, Math.round(0.55 * Math.pow(1.09, i)));
  }
  return tapDmgCache[level];
}

/** 탭 공격력 다음 레벨 비용 */
export function tapCost(level: number): number {
  return Math.round(5 * Math.pow(1.082, level));
}

/** 영웅 다음 레벨 비용 (level=0 이면 고용 비용) */
export function heroCost(def: HeroDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(1.075, level));
}

/** 영웅 DPS: 25레벨마다 x2 마일스톤 */
export function heroDps(def: HeroDef, level: number): number {
  if (level <= 0) return 0;
  return def.baseDps * level * Math.pow(2, Math.floor(level / 25));
}

/** 환생 시점까지의 누적 유물 획득량 (신규 획득 = 이 값 - 이미 획득한 양) */
export function relicsFor(maxStage: number): number {
  if (maxStage < PRESTIGE_MIN_STAGE) return 0;
  return Math.floor(Math.pow(maxStage / 8, 1.6));
}

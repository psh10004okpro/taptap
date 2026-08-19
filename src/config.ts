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

export interface HeroDef {
  id: number;
  name: string;
  title: string;
  baseCost: number;
  baseDps: number;
  color: number;
}

export const HEROES: HeroDef[] = [
  { id: 0, name: '아린', title: '견습 검사', baseCost: 50, baseDps: 3, color: 0xe74c3c },
  { id: 1, name: '벨라', title: '숲의 궁수', baseCost: 800, baseDps: 44, color: 0x2ecc71 },
  { id: 2, name: '단테', title: '화염 마법사', baseCost: 12_800, baseDps: 640, color: 0xe67e22 },
  { id: 3, name: '리네', title: '달빛 도적', baseCost: 205_000, baseDps: 9_400, color: 0x9b59b6 },
  { id: 4, name: '가온', title: '바위 수호자', baseCost: 3_280_000, baseDps: 138_000, color: 0x95a5a6 },
  { id: 5, name: '세라', title: '빛의 사제', baseCost: 52_400_000, baseDps: 2_040_000, color: 0xf1c40f },
  { id: 6, name: '카이', title: '뇌전 무사', baseCost: 838_000_000, baseDps: 30_100_000, color: 0x3498db },
  { id: 7, name: '느와르', title: '심연의 기사', baseCost: 13_400_000_000, baseDps: 445_000_000, color: 0x34495e },
];

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
];

export const SKILL_TAP_MULT = 3;
export const SKILL_DPS_MULT = 3;
export const SKILL_GOLD_MULT = 2;
export const SHADOW_CLONE_TAPS_PER_SEC = 5;

// --- 유물 (환생 화폐로 구매하는 영구 강화) -----------------------------------

export interface ArtifactDef {
  id: number;
  name: string;
  desc: string;          // 레벨당 효과 설명
  baseCost: number;      // 유물 개수
  maxLevel: number;      // 0 = 무제한
  color: number;
}

export const ARTIFACTS: ArtifactDef[] = [
  { id: 0, name: '파괴의 검', desc: '탭 데미지 +25%', baseCost: 3, maxLevel: 0, color: 0xe74c3c },
  { id: 1, name: '용맹의 깃발', desc: '영웅 DPS +25%', baseCost: 3, maxLevel: 0, color: 0x3498db },
  { id: 2, name: '미다스의 잔', desc: '골드 획득 +20%', baseCost: 4, maxLevel: 0, color: 0xf1c40f },
  { id: 3, name: '매의 눈', desc: '크리티컬 확률 +1%p', baseCost: 5, maxLevel: 20, color: 0x2ecc71 },
  { id: 4, name: '거인의 심장', desc: '크리티컬 배율 +0.5', baseCost: 5, maxLevel: 0, color: 0xe67e22 },
  { id: 5, name: '시간의 모래', desc: '보스 제한시간 +2초', baseCost: 6, maxLevel: 15, color: 0x9b59b6 },
];

/** 유물 다음 레벨 비용 (유물 개수) */
export function artifactCost(def: ArtifactDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(1.35, level));
}

/** 유물 효과 배율/수치 */
export const ARTIFACT_TAP_PER_LVL = 0.25;
export const ARTIFACT_DPS_PER_LVL = 0.25;
export const ARTIFACT_GOLD_PER_LVL = 0.2;
export const ARTIFACT_CRIT_CHANCE_PER_LVL = 0.01;
export const ARTIFACT_CRIT_MULT_PER_LVL = 0.5;
export const ARTIFACT_BOSS_TIME_PER_LVL = 2_000; // ms

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

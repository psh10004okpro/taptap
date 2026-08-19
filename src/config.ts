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

// 전투 화면 좌측 플로팅 아이콘 (퀘스트/랭킹) — 하단 탭을 성장 축 전용으로 비우기 위해
// 부가 콘텐츠는 전투 화면 가장자리 아이콘이 여는 오버레이로 뺀다.
export const FLOAT_ICON = { x: 56, y0: 344, gap: 96, r: 38, count: 3 };
// 보스 도전 버튼 — 상단 우측(스테이지 표기 옆)
export const BOSS_BTN = { x: 624, y: 52 };
// 오버레이 카드(퀘스트/랭킹) 콘텐츠 컨테이너 y 오프셋.
// 내부 요소는 하단 패널 좌표계(PANEL_Y + n)를 그대로 쓰고 컨테이너만 끌어올린다.
export const OVERLAY_DY = -500;
// 요정(보상형 광고) 등장 주기 — 전투 화면을 가로질러 날아가고 탭하면 광고 제안
export const FAIRY = { firstMs: 22_000, minMs: 45_000, maxMs: 95_000, crossMs: 9_000 };

// UI 접기 — 하단 탭 바는 남기고 패널을 접어 배경/몬스터를 넓게 본다.
// 배경 텍스처는 화면 전체 높이(720x1280)라 접으면 아래쪽 지면이 그대로 드러난다.
export const COLLAPSED = {
  tabY: 1240,          // 탭 버튼 중심 y (화면 맨 아래)
  skillBarY: 1152,     // 스킬 버튼 중심 y
  combatBottom: 1104,  // 전투 탭 존 하한 (스킬바 위)
  monsterY: 696,       // 몬스터 중심 y
  monsterScale: 1.65,  // 몬스터/단상 배율
  groundY: 891,        // 발밑 단상 중심 y
};
// 펼침 상태의 발밑 단상 y (배경이 아니라 GameScene 이 그린다)
export const GROUND_Y = 588;

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
  | 'heroCost'   // 영웅 비용 할인 (fraction, 총합 50% 상한)
  | 'skillPower' // 스킬 효과 강화 (배율 효과의 증폭, fraction)
  | 'skillCd';   // 스킬 쿨다운 감소 (fraction, 총합 40% 상한)

export const HERO_COST_DISCOUNT_CAP = 0.5;

export interface HeroPassive {
  type: EffectType;
  value: number;
  desc: string;
  unlockLevel: number;
}

export interface HeroDef {
  id: number;
  name: string;
  title: string;
  baseCost: number;
  baseDps: number;
  color: number;
  /** 마일스톤 패시브 (레벨 20/50/100 해금) */
  passives: HeroPassive[];
}

/** 1차 패시브 해금 레벨 (2차 50, 3차 100 은 생성 규칙 참조) */
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

/** 24영웅 — 비용 x9.5/티어 (sim 으로 페이싱 검증), DPS 는 비용의 6% (약 17초 회수)
 *  패시브 3중 마일스톤: 20렙 = 고유 패시브, 100렙 = 동일 효과 x0.75 추가,
 *  150렙 = 모든 데미지 소량 — 수치/해금은 sim 페이싱으로 조정됨 (2x/3x 는 인플레) */
export const HEROES: HeroDef[] = HERO_RAW.map(([name, title, type, value, desc], i) => {
  const allDmg3rd = 0.02 * (1 + Math.floor(i / 8));
  return {
    id: i,
    name,
    title,
    baseCost: Math.round(50 * Math.pow(9.5, i)),
    baseDps: Math.max(1, Math.round(50 * Math.pow(9.5, i) * 0.06 * 100) / 100),
    color: HERO_COLORS[i % HERO_COLORS.length],
    passives: [
      { type, value, desc, unlockLevel: HERO_PASSIVE_UNLOCK },
      { type, value: value * 0.75, desc: `${desc} (강화)`, unlockLevel: 100 },
      { type: 'allDmg', value: allDmg3rd, desc: `모든 데미지 +${Math.round(allDmg3rd * 100)}%`, unlockLevel: 200 },
    ],
  };
});

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
  // --- 후기 유물 (id 20~39): 고비용·고효율, 환생 5회차+ 대상 ---
  { id: 20, name: '용왕의 이빨', desc: '탭 데미지 +100%', baseCost: 14, maxLevel: 0, color: 0x922b21, effect: { type: 'tap', perLvl: 1.0 } },
  { id: 21, name: '불멸 군단기', desc: '영웅 DPS +100%', baseCost: 14, maxLevel: 0, color: 0x1f618d, effect: { type: 'dps', perLvl: 1.0 } },
  { id: 22, name: '탐욕의 왕관', desc: '골드 획득 +50%', baseCost: 12, maxLevel: 0, color: 0xb7950b, effect: { type: 'gold', perLvl: 0.5 } },
  { id: 23, name: '창세의 파편', desc: '모든 데미지 +25%', baseCost: 16, maxLevel: 0, color: 0xfdfefe, effect: { type: 'allDmg', perLvl: 0.25 } },
  { id: 24, name: '월광 단검', desc: '크리티컬 확률 +0.8%p', baseCost: 10, maxLevel: 25, color: 0xa9cce3, effect: { type: 'critChance', perLvl: 0.008 } },
  { id: 25, name: '광기의 가면', desc: '크리티컬 배율 +2', baseCost: 13, maxLevel: 0, color: 0x6c3483, effect: { type: 'critMult', perLvl: 2 } },
  { id: 26, name: '멈춘 모래시계', desc: '보스 제한시간 +4초', baseCost: 15, maxLevel: 8, color: 0xd6dbdf, effect: { type: 'bossTime', perLvl: 4000 } },
  { id: 27, name: '꿈꾸는 수정구', desc: '오프라인 보상 +25%', baseCost: 12, maxLevel: 0, color: 0xd2b4de, effect: { type: 'offline', perLvl: 0.25 } },
  { id: 28, name: '질풍의 깃털', desc: '스킬 지속시간 +8%', baseCost: 11, maxLevel: 15, color: 0xa3e4d7, effect: { type: 'skillDur', perLvl: 0.08 } },
  { id: 29, name: '대상인의 금고', desc: '영웅 비용 -3%', baseCost: 13, maxLevel: 10, color: 0xf7dc6f, effect: { type: 'heroCost', perLvl: 0.03 } },
  { id: 30, name: '초시계 태엽', desc: '스킬 쿨다운 -4%', baseCost: 12, maxLevel: 8, color: 0xaeb6bf, effect: { type: 'skillCd', perLvl: 0.04 } },
  { id: 31, name: '영웅왕의 검명', desc: '스킬 효과 +8%', baseCost: 14, maxLevel: 10, color: 0xf8c471, effect: { type: 'skillPower', perLvl: 0.08 } },
  { id: 32, name: '균열의 심장', desc: '탭 데미지 +150%', baseCost: 20, maxLevel: 0, color: 0xcb4335, effect: { type: 'tap', perLvl: 1.5 } },
  { id: 33, name: '별의 성채', desc: '영웅 DPS +150%', baseCost: 20, maxLevel: 0, color: 0x2e86c1, effect: { type: 'dps', perLvl: 1.5 } },
  { id: 34, name: '황금 나침반', desc: '골드 획득 +80%', baseCost: 18, maxLevel: 0, color: 0xf4d03f, effect: { type: 'gold', perLvl: 0.8 } },
  { id: 35, name: '태양의 인장', desc: '모든 데미지 +40%', baseCost: 24, maxLevel: 0, color: 0xf5b041, effect: { type: 'allDmg', perLvl: 0.4 } },
  { id: 36, name: '서리 문장', desc: '보스 제한시간 +6초', baseCost: 22, maxLevel: 5, color: 0x85c1e9, effect: { type: 'bossTime', perLvl: 6000 } },
  { id: 37, name: '심연의 눈동자', desc: '크리티컬 배율 +3', baseCost: 21, maxLevel: 0, color: 0x1b2631, effect: { type: 'critMult', perLvl: 3 } },
  { id: 38, name: '수호자의 맹세', desc: '오프라인 보상 +40%', baseCost: 19, maxLevel: 0, color: 0x73c6b6, effect: { type: 'offline', perLvl: 0.4 } },
  { id: 39, name: '종언의 서', desc: '모든 데미지 +60%', baseCost: 30, maxLevel: 0, color: 0x4a235a, effect: { type: 'allDmg', perLvl: 0.6 } },
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

export type QuestMetric = 'kills' | 'bossKills' | 'skillUses' | 'drops' | 'ads' | 'prestiges';

export interface QuestDef {
  id: number;
  desc: string;
  metric: QuestMetric;
  target: number;
  reward: 'gold' | 'relics';
  /** gold 는 현재 스테이지 killGold 의 배수, relics 는 개수 */
  amount: number;
}

/** 퀘스트 풀 6종 — 매일 이 중 3개가 날짜 시드로 선택된다 (DAILY_QUEST_COUNT) */
export const DAILY_QUESTS: QuestDef[] = [
  { id: 0, desc: '몬스터 200마리 처치', metric: 'kills', target: 200, reward: 'gold', amount: 150 },
  { id: 1, desc: '보스 5회 처치', metric: 'bossKills', target: 5, reward: 'gold', amount: 400 },
  { id: 2, desc: '스킬 3회 사용', metric: 'skillUses', target: 3, reward: 'relics', amount: 2 },
  { id: 3, desc: '장비/펫 알 2개 획득', metric: 'drops', target: 2, reward: 'gold', amount: 500 },
  { id: 4, desc: '광고 2회 시청', metric: 'ads', target: 2, reward: 'relics', amount: 3 },
  { id: 5, desc: '환생 1회', metric: 'prestiges', target: 1, reward: 'relics', amount: 4 },
];

export const DAILY_QUEST_COUNT = 3;

/** 날짜 문자열 기반 결정적 선택 — 모든 유저가 같은 날 같은 퀘스트를 받는다 */
export function questsForDate(dateStr: string): number[] {
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ids = DAILY_QUESTS.map((q) => q.id);
  // 시드 셔플 (LCG)
  for (let i = ids.length - 1; i > 0; i--) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, DAILY_QUEST_COUNT).sort((a, b) => a - b);
}

// --- 스킬트리 (3계열 x 4티어 = 12노드, SP 소비) -------------------------------
// SP 는 최고 스테이지 10마다 1 + 환생당 2 로 적립되며 환생해도 유지된다.
// 전 노드 풀강에 필요한 SP(165)가 현실적 적립량을 넘도록 설계 → 빌드 선택 강제.

export type TreeBranch = 0 | 1 | 2; // 0=기사(탭) 1=군주(방치) 2=연금술사(경제)

export const TREE_BRANCH_NAMES = ['기사', '군주', '연금술사'] as const;

export interface TreeNodeDef {
  id: number;
  branch: TreeBranch;
  tier: number;          // 0..3 — 티어가 곧 레벨당 SP 비용
  name: string;
  desc: string;          // 레벨당 효과
  maxLevel: number;
  effect: { type: EffectType; perLvl: number };
  /** 선행 조건: 같은 계열의 직전 노드 레벨 (티어0 은 없음) */
  requiresLevel: number;
}

export const SKILL_TREE: TreeNodeDef[] = [
  // 기사 — 탭/크리 빌드
  { id: 0, branch: 0, tier: 0, name: '검술 연마', desc: '탭 데미지 +15%', maxLevel: 10, effect: { type: 'tap', perLvl: 0.15 }, requiresLevel: 0 },
  { id: 1, branch: 0, tier: 1, name: '급소 간파', desc: '크리 확률 +1%p', maxLevel: 5, effect: { type: 'critChance', perLvl: 0.01 }, requiresLevel: 3 },
  { id: 2, branch: 0, tier: 2, name: '파괴의 오의', desc: '크리 배율 +1', maxLevel: 5, effect: { type: 'critMult', perLvl: 1 }, requiresLevel: 3 },
  { id: 3, branch: 0, tier: 3, name: '무신의 경지', desc: '스킬 효과 +10%', maxLevel: 5, effect: { type: 'skillPower', perLvl: 0.1 }, requiresLevel: 3 },
  // 군주 — 영웅/방치 빌드
  { id: 4, branch: 1, tier: 0, name: '군단 지휘', desc: '영웅 DPS +15%', maxLevel: 10, effect: { type: 'dps', perLvl: 0.15 }, requiresLevel: 0 },
  { id: 5, branch: 1, tier: 1, name: '원정 보급', desc: '오프라인 보상 +10%', maxLevel: 5, effect: { type: 'offline', perLvl: 0.1 }, requiresLevel: 3 },
  { id: 6, branch: 1, tier: 2, name: '정예 훈련', desc: '모든 데미지 +5%', maxLevel: 5, effect: { type: 'allDmg', perLvl: 0.05 }, requiresLevel: 3 },
  { id: 7, branch: 1, tier: 3, name: '대군주의 위엄', desc: '보스 시간 +2초', maxLevel: 5, effect: { type: 'bossTime', perLvl: 2000 }, requiresLevel: 3 },
  // 연금술사 — 골드/유틸 빌드
  { id: 8, branch: 2, tier: 0, name: '황금 변환', desc: '골드 획득 +12%', maxLevel: 10, effect: { type: 'gold', perLvl: 0.12 }, requiresLevel: 0 },
  { id: 9, branch: 2, tier: 1, name: '계약 협상', desc: '영웅 비용 -3%', maxLevel: 5, effect: { type: 'heroCost', perLvl: 0.03 }, requiresLevel: 3 },
  { id: 10, branch: 2, tier: 2, name: '시간 촉매', desc: '스킬 쿨다운 -5%', maxLevel: 5, effect: { type: 'skillCd', perLvl: 0.05 }, requiresLevel: 3 },
  { id: 11, branch: 2, tier: 3, name: '현자의 돌', desc: '스킬 지속 +10%', maxLevel: 5, effect: { type: 'skillDur', perLvl: 0.1 }, requiresLevel: 3 },
  // T5/T6 — 후기 확장 (비용 6/7 SP per 레벨)
  { id: 12, branch: 0, tier: 4, name: '연격의 극의', desc: '탭 데미지 +25%', maxLevel: 5, effect: { type: 'tap', perLvl: 0.25 }, requiresLevel: 3 },
  { id: 13, branch: 0, tier: 5, name: '검신강림', desc: '모든 데미지 +10%', maxLevel: 5, effect: { type: 'allDmg', perLvl: 0.1 }, requiresLevel: 3 },
  { id: 14, branch: 1, tier: 4, name: '총력전', desc: '영웅 DPS +25%', maxLevel: 5, effect: { type: 'dps', perLvl: 0.25 }, requiresLevel: 3 },
  { id: 15, branch: 1, tier: 5, name: '왕의 군림', desc: '모든 데미지 +10%', maxLevel: 5, effect: { type: 'allDmg', perLvl: 0.1 }, requiresLevel: 3 },
  { id: 16, branch: 2, tier: 4, name: '황금 폭풍', desc: '골드 획득 +20%', maxLevel: 5, effect: { type: 'gold', perLvl: 0.2 }, requiresLevel: 3 },
  { id: 17, branch: 2, tier: 5, name: '연성의 극의', desc: '오프라인 보상 +15%', maxLevel: 5, effect: { type: 'offline', perLvl: 0.15 }, requiresLevel: 3 },
];

/** 노드 레벨당 SP 비용 = 티어 + 1 */
export function treeNodeCost(node: TreeNodeDef): number {
  return node.tier + 1;
}

export const SP_PER_STAGES = 10;      // 최고 스테이지 10마다 SP 1
export const SP_PER_PRESTIGE = 2;     // 환생당 SP 2
export const TREE_RESPEC_COST = 10;   // 리스펙 비용 (유물)
export const SKILL_CD_CAP = 0.4;      // 쿨다운 감소 상한

// --- 온보딩 튜토리얼 (단계 텍스트 — 진행 로직은 GameState) --------------------

export const TUTORIAL_STEPS = [
  '몬스터를 탭해 공격하세요! (10회)',
  '골드가 모이면 [탭 공격력]을 올려보세요',
  '영웅을 고용하면 자동으로 싸워줍니다',
  '몬스터를 처치하고 보스에 도전하세요!',
  '막히면 [환생]! 유물로 영구히 강해집니다 (탭하여 닫기)',
] as const;
export const TUT_TAP_GOAL = 10; // 1단계: 필요한 탭 수

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
  { id: 6, name: '천둥망아지', glyph: '뇌', color: 0x5499c7, bonus: { type: 'critMult', perLvl: 0.2 }, desc: '크리 배율 +0.2' },
  { id: 7, name: '재빠른담비', glyph: '담', color: 0xdc7633, bonus: { type: 'skillDur', perLvl: 0.02 }, desc: '스킬 지속 +2%' },
  { id: 8, name: '수정갑충', glyph: '갑', color: 0xa569bd, bonus: { type: 'heroCost', perLvl: 0.005 }, desc: '영웅 비용 -0.5%' },
  { id: 9, name: '용암두꺼비', glyph: '용', color: 0xc0392b, bonus: { type: 'tap', perLvl: 0.08 }, desc: '탭 데미지 +8%' },
  { id: 10, name: '고요한올빼미', glyph: '올', color: 0x7f8c8d, bonus: { type: 'dps', perLvl: 0.08 }, desc: '영웅 DPS +8%' },
  { id: 11, name: '무지개나비', glyph: '나', color: 0xf1948a, bonus: { type: 'allDmg', perLvl: 0.03 }, desc: '모든 데미지 +3%' },
];

export const PET_EGG_DROP_CHANCE = 0.06; // 보스 처치당

// --- BM: 보석(프리미엄 재화) / 상점 / VIP -------------------------------------
// 원칙: 무과금 페이싱은 IAP 없이 성립한다 (시뮬은 IAP 미반영이 기준선).
// 보석은 "시간 단축"만 판다 — 무과금이 도달 불가능한 파워는 팔지 않는다.

export interface GemPackDef {
  id: string;           // 스토어 product id 와 1:1
  name: string;
  gems: number;
  bonusDesc: string;    // 표기용 (첫구매 보너스 등)
  priceKrw: number;     // 표기용 — 실제 가격은 스토어가 결정
}

export const GEM_PACKS: GemPackDef[] = [
  { id: 'gems_s', name: '보석 한 줌', gems: 80, bonusDesc: '', priceKrw: 3_900 },
  { id: 'gems_m', name: '보석 주머니', gems: 450, bonusDesc: '+12% 보너스', priceKrw: 19_000 },
  { id: 'gems_l', name: '보석 금고', gems: 1_200, bonusDesc: '+23% 보너스', priceKrw: 45_000 },
  { id: 'starter', name: '스타터 팩', gems: 120, bonusDesc: '전설 장비 1개 포함 · 1회 한정', priceKrw: 5_900 },
];

/** 보석 소비처 (싱크) */
export const GEM_SINKS = {
  cooldownReset: 20,   // 모든 스킬 쿨다운 초기화
  goldPack: 50,        // 골드 팩: 현재 스테이지 killGold x GOLD_PACK_KILLS
  equipBox: 80,        // 장비 상자 (영웅 85% / 전설 15% — 확률 공시 필수)
  treeRespec: 30,      // 스킬트리 리스펙 (유물 10개 대체)
} as const;

export const GOLD_PACK_KILLS = 600; // "약 10분치 파밍" — 스테이지 비례라 인플레 없음
/** 장비 상자 확률 (한국 확률형 아이템 공시 대상 — UI 에 그대로 표기할 것) */
export const EQUIP_BOX_RATES: { rarity: number; pct: number }[] = [
  { rarity: 2, pct: 85 }, // 영웅
  { rarity: 3, pct: 15 }, // 전설
];

/** VIP: 누적 구매 보석 기준 영구 티어 (QoL 만 — 전투력 직접 판매 금지) */
export interface VipTierDef { need: number; offlineCapBonusHr: number; questGoldPct: number }
export const VIP_TIERS: VipTierDef[] = [
  { need: 0, offlineCapBonusHr: 0, questGoldPct: 0 },
  { need: 100, offlineCapBonusHr: 1, questGoldPct: 25 },
  { need: 500, offlineCapBonusHr: 2, questGoldPct: 50 },
  { need: 1500, offlineCapBonusHr: 4, questGoldPct: 100 },
];

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
  { id: 8, desc: '탭 100,000회', metric: 'taps', target: 100_000, rewardRelics: 20 },
  { id: 9, desc: '몬스터 10,000마리 처치', metric: 'kills', target: 10_000, rewardRelics: 12 },
  { id: 10, desc: '몬스터 50,000마리 처치', metric: 'kills', target: 50_000, rewardRelics: 25 },
  { id: 11, desc: '보스 500회 처치', metric: 'bossKills', target: 500, rewardRelics: 15 },
  { id: 12, desc: '보스 2,000회 처치', metric: 'bossKills', target: 2_000, rewardRelics: 30 },
  { id: 13, desc: '스테이지 150 도달', metric: 'maxStage', target: 150, rewardRelics: 18 },
  { id: 14, desc: '스테이지 200 도달', metric: 'maxStage', target: 200, rewardRelics: 30 },
  { id: 15, desc: '스테이지 300 도달', metric: 'maxStage', target: 300, rewardRelics: 50 },
  { id: 16, desc: '환생 10회', metric: 'prestiges', target: 10, rewardRelics: 20 },
  { id: 17, desc: '환생 25회', metric: 'prestiges', target: 25, rewardRelics: 40 },
  { id: 18, desc: '장비 30개 획득', metric: 'equipDrops', target: 30, rewardRelics: 15 },
  { id: 19, desc: '장비 100개 획득', metric: 'equipDrops', target: 100, rewardRelics: 35 },
];

// --- 주말 토너먼트 (어비셜 방식: 제로베이스 24h+ 경쟁) ------------------------

export const TOURNEY_REWARD_PER_10_STAGES = 1; // 종료 시 스테이지 10당 유물 1

// --- 스테이지 존 (20스테이지 단위 테마 — 배경 틴트/몬스터 조합/보스) ----------

export const STAGES_PER_ZONE = 20;

export interface ZoneDef {
  id: number;
  name: string;
  /** 전투 배경 위에 얹는 존 색 오버레이 */
  tint: number;
  /** 이 존에서 등장하는 몬스터 텍스처 id 6종 (0~11) */
  monsters: number[];
  monsterNames: string[];
  bossName: string;
}

export const ZONES: ZoneDef[] = [
  {
    id: 0, name: '초원', tint: 0x3f7d3a,
    monsters: [0, 1, 2, 3, 4, 5],
    monsterNames: ['슬라임', '버섯돌이', '들쥐돌이', '풀뭉치', '꿀벌레', '아기멧돼지'],
    bossName: '왕슬라임',
  },
  {
    id: 1, name: '어둔 숲', tint: 0x1e4d2b,
    monsters: [2, 3, 6, 7, 0, 5],
    monsterNames: ['숲도깨비', '가시두꺼비', '독버섯', '거미지기', '올빼미괴', '넝쿨정령'],
    bossName: '고목의 정령왕',
  },
  {
    id: 2, name: '동굴', tint: 0x3a4550,
    monsters: [4, 6, 8, 9, 1, 7],
    monsterNames: ['동굴박쥐', '돌게', '광석벌레', '동굴지네', '어둠쥐', '수정괴'],
    bossName: '거대 골렘',
  },
  {
    id: 3, name: '사막', tint: 0x8a6d2f,
    monsters: [3, 5, 8, 10, 2, 11],
    monsterNames: ['모래전갈', '선인장맨', '모래벌레', '미라지', '사막여우괴', '카라반도적'],
    bossName: '모래폭풍의 군주',
  },
  {
    id: 4, name: '늪지대', tint: 0x2e4a33,
    monsters: [0, 6, 7, 9, 10, 1],
    monsterNames: ['진흙괴물', '독개구리', '늪지렁이', '안개혼', '악어아귀', '수초괴'],
    bossName: '늪의 히드라',
  },
  {
    id: 5, name: '설원', tint: 0x5a7d9e,
    monsters: [1, 4, 8, 11, 5, 9],
    monsterNames: ['얼음정령', '눈토끼괴', '서리늑대', '고드름귀신', '설인아이', '얼음거미'],
    bossName: '서리 거인',
  },
  {
    id: 6, name: '화산', tint: 0x7d2c1e,
    monsters: [2, 5, 9, 10, 3, 8],
    monsterNames: ['용암도롱뇽', '화염박쥐', '재투성이', '마그마괴', '불꽃정령', '숯덩이악귀'],
    bossName: '화염 오우거',
  },
  {
    id: 7, name: '고대 폐허', tint: 0x4d3a63,
    monsters: [6, 7, 10, 11, 4, 0],
    monsterNames: ['석상병사', '유적거미', '망령', '지킴이골렘', '저주항아리', '해골정찰병'],
    bossName: '폐허의 수호자',
  },
  {
    id: 8, name: '천공섬', tint: 0x2f5d8a,
    monsters: [1, 3, 5, 11, 8, 6],
    monsterNames: ['바람정령', '구름양', '뇌운새', '하늘해파리', '풍선괴', '번개도마뱀'],
    bossName: '폭풍의 로크',
  },
  {
    id: 9, name: '심연', tint: 0x1b1b3a,
    monsters: [7, 9, 10, 11, 2, 4],
    monsterNames: ['그림자늑대', '심연시선', '공허벌레', '악몽덩이', '어둠촉수', '별삼킨자'],
    bossName: '심연의 드래곤',
  },
];

export function zoneFor(stage: number): ZoneDef {
  return ZONES[Math.floor((stage - 1) / STAGES_PER_ZONE) % ZONES.length];
}

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

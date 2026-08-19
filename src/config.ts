// ---------------------------------------------------------------------------
// 게임 전역 설정 & 밸런스 곡선
// 로직은 렌더링과 분리: 이 파일과 core/ 는 Phaser 의존 없이 순수 TS로 유지한다.
// ---------------------------------------------------------------------------

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// 레이아웃 (세로 모드 고정)
export const TOP_BAR_H = 150;
export const PANEL_Y = 748; // 하단 패널 시작
export const COMBAT_CENTER = { x: 360, y: 470 };

export const MONSTERS_PER_STAGE = 10; // 9마리 + 보스
export const BOSS_TIME_LIMIT = 30_000; // ms
export const CRIT_CHANCE = 0.05;
export const CRIT_MULT = 8;
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

export const MONSTER_NAMES = [
  '슬라임', '버섯돌이', '가시두꺼비', '동굴박쥐', '고블린',
  '숲도깨비', '진흙괴물', '얼음정령', '모래전갈', '그림자늑대',
];

export const BOSS_NAMES = [
  '왕슬라임', '거대 골렘', '화염 오우거', '서리 거인', '심연의 드래곤',
];

// --- 밸런스 곡선 -----------------------------------------------------------

/** 일반 몬스터 최대 체력 (스테이지 지수 성장) */
export function monsterHp(stage: number, isBoss: boolean): number {
  const base = 18 * Math.pow(1.55, stage - 1);
  return Math.max(1, Math.round(base * (isBoss ? 6 : 1)));
}

/** 처치 골드 보상 */
export function killGold(stage: number, isBoss: boolean): number {
  const hp = monsterHp(stage, isBoss);
  return Math.max(1, Math.round(hp * 0.2 * (isBoss ? 2 : 1)));
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

/** 환생 시 획득 유물 수 */
export function relicsFor(maxStage: number): number {
  if (maxStage < PRESTIGE_MIN_STAGE) return 0;
  return Math.floor(Math.pow(maxStage / 8, 1.6));
}

/** 유물 데미지 배율 (+10%/유물) */
export function relicMult(relics: number): number {
  return 1 + relics * 0.1;
}

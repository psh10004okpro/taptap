// ---------------------------------------------------------------------------
// 주간 클랜 보스 — 비동기 협동 콘텐츠의 로컬 우선 구현.
// 주간 보스 HP 를 두고 공격권(주 3회)으로 내 DPS x 30초 만큼 깎는다.
// 처치 시 유물 보상. 온라인(클랜 합산) 연동은 supabase/ 확장 참고 —
// 이 모듈의 damage 계산/검증 공식이 서버 사본과 동일해야 한다.
// ---------------------------------------------------------------------------
import { monsterHp } from '../config.ts';
import { GameState } from './GameState.ts';
import { Analytics } from './Analytics.ts';

const KEY = 'taptap-clanboss';
export const CLAN_BOSS_ATTACKS_PER_WEEK = 3;
export const CLAN_BOSS_FIGHT_SEC = 30;
export const CLAN_BOSS_REWARD_RELICS = 15;

interface BossState {
  week: string;
  hpMax: number;
  hpLeft: number;
  attacksUsed: number;
  killed: boolean;
}

function weekKey(now = new Date()): string {
  // 월요일 시작 주 키
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ls(): Storage | null {
  try { return localStorage; } catch { return null; }
}

/** 보스 HP: 내 최고 스테이지 +10 의 보스 HP x 40 (30초 DPS 수 회 분량) */
export function bossHpFor(maxStage: number): number {
  return monsterHp(maxStage + 10, true) * 40;
}

export function current(state: GameState, now = new Date()): BossState {
  const s = ls();
  const wk = weekKey(now);
  let b: BossState | null = null;
  try {
    const raw = s?.getItem(KEY);
    if (raw) b = JSON.parse(raw) as BossState;
  } catch { /* ignore */ }
  if (!b || b.week !== wk) {
    const hp = bossHpFor(state.maxStage);
    b = { week: wk, hpMax: hp, hpLeft: hp, attacksUsed: 0, killed: false };
    try { s?.setItem(KEY, JSON.stringify(b)); } catch { /* ignore */ }
  }
  return b;
}

export function attacksLeft(state: GameState): number {
  return Math.max(0, CLAN_BOSS_ATTACKS_PER_WEEK - current(state).attacksUsed);
}

/**
 * 공격 1회: 내 DPS x 30초 피해. 반환: 가한 피해와 처치 여부.
 * 처치 보상(유물)은 이 함수가 직접 지급한다.
 */
export function attack(state: GameState): { damage: number; killed: boolean; hpLeft: number } | null {
  const b = current(state);
  if (b.killed || b.attacksUsed >= CLAN_BOSS_ATTACKS_PER_WEEK) return null;
  // 탭 기여 근사 포함: DPS + 탭뎀 x 2탭/초
  const damage = Math.round((state.totalDps() + state.tapDamage() * 2) * CLAN_BOSS_FIGHT_SEC);
  if (damage <= 0) return null;
  b.attacksUsed += 1;
  b.hpLeft = Math.max(0, b.hpLeft - damage);
  const killedNow = !b.killed && b.hpLeft === 0;
  if (killedNow) {
    b.killed = true;
    state.addRelics(CLAN_BOSS_REWARD_RELICS);
  }
  try { ls()?.setItem(KEY, JSON.stringify(b)); } catch { /* ignore */ }
  Analytics.track('clan_boss_attack', {
    damage, hpLeft: b.hpLeft, attacksUsed: b.attacksUsed, killed: killedNow,
  });
  return { damage, killed: killedNow, hpLeft: b.hpLeft };
}

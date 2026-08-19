// ---------------------------------------------------------------------------
// QA/개발용 치트·프리셋 모음 — Phaser 비의존.
// UI(데브 패널)와 E2E 테스트가 같은 함수를 사용해 시나리오를 재현한다.
// 활성화는 URL ?dev=1 (main.ts) — 일반 유저 경로에는 노출되지 않는다.
// ---------------------------------------------------------------------------
import { HEROES, SKILLS, ARTIFACTS, PETS, EQUIP_SLOTS } from '../config.ts';
import { GameState } from './GameState.ts';

export type PresetName = 'fresh' | 'early' | 'mid' | 'prestige-ready' | 'endgame';

export const PRESETS: { name: PresetName; label: string; desc: string }[] = [
  { name: 'fresh', label: '신규', desc: '초기 상태 (세이브 삭제)' },
  { name: 'early', label: '초반', desc: '스테이지 15, 영웅 3명' },
  { name: 'mid', label: '중반', desc: '스테이지 55, 스킬 4종 해금, 유물 보유' },
  { name: 'prestige-ready', label: '환생 직전', desc: '스테이지 30 도달, 환생 가능' },
  { name: 'endgame', label: '후반', desc: '스테이지 130, 풀장비, 트리/펫 투자' },
];

function resetProgress(s: GameState): void {
  s.gold = 0;
  s.stage = 1;
  s.kills = 0;
  s.maxStage = 1;
  s.tapLevel = 0;
  s.heroLevels = HEROES.map(() => 0);
  s.relics = 0;
  s.relicsEarned = 0;
  s.artifactLevels = ARTIFACTS.map(() => 0);
  s.skillReadyAt = SKILLS.map(() => 0);
  s.skillActiveUntil = SKILLS.map(() => 0);
  s.goldBoostUntil = 0;
  s.equipment = EQUIP_SLOTS.map(() => null);
  s.petLevels = PETS.map(() => 0);
  s.treeLevels = s.treeLevels.map(() => 0);
  s.lifetime = { taps: 0, kills: 0, bossKills: 0, prestiges: 0, equipDrops: 0 };
  s.achClaimed = s.achClaimed.map(() => false);
}

/** 상태 프리셋 적용 후 즉시 저장. 화면 갱신 이벤트까지 발행한다. */
export function applyPreset(s: GameState, name: PresetName): void {
  resetProgress(s);
  switch (name) {
    case 'fresh':
      break;
    case 'early':
      s.stage = 15; s.maxStage = 15;
      s.gold = 5_000; s.tapLevel = 12;
      s.heroLevels[0] = 15; s.heroLevels[1] = 8; s.heroLevels[2] = 3;
      break;
    case 'mid':
      s.stage = 55; s.maxStage = 55;
      s.gold = 5e8; s.tapLevel = 60;
      for (let i = 0; i < 8; i++) s.heroLevels[i] = 40 - i * 4;
      s.relics = 30; s.relicsEarned = 45;
      s.artifactLevels[0] = 3; s.artifactLevels[1] = 3;
      s.lifetime.prestiges = 1;
      break;
    case 'prestige-ready':
      s.stage = 30; s.maxStage = 30;
      s.gold = 2e6; s.tapLevel = 35;
      for (let i = 0; i < 5; i++) s.heroLevels[i] = 25 - i * 4;
      break;
    case 'endgame':
      s.stage = 130; s.maxStage = 130;
      s.gold = 1e18; s.tapLevel = 150;
      for (let i = 0; i < HEROES.length; i++) s.heroLevels[i] = Math.max(0, 80 - i * 3);
      s.relics = 120; s.relicsEarned = 400;
      ARTIFACTS.forEach((a) => { s.artifactLevels[a.id] = a.maxLevel > 0 ? Math.min(3, a.maxLevel) : 4; });
      s.equipment = EQUIP_SLOTS.map((slot) => ({ slot: slot.id, rarity: 3, statPct: 180, stage: 120 }));
      s.petLevels = PETS.map(() => 5);
      s.lifetime = { taps: 30_000, kills: 8_000, bossKills: 700, prestiges: 6, equipDrops: 40 };
      // 기사 트리 투자 예시
      s.treeLevels[0] = 5; s.treeLevels[1] = 3; s.treeLevels[2] = 3;
      break;
  }
  s.save();
  s.emit('gold', s.gold);
  s.emit('stage', s.stage, s.kills);
  s.emit('upgrade');
  s.emit('quest');
}

/** 오프라인 복귀 시뮬: lastSeen 을 과거로 되돌린 세이브를 쓰고 리로드 */
export function simulateOffline(s: GameState, hours: number): void {
  s.save();
  try {
    const raw = localStorage.getItem(GameState.SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as { lastSeen: number };
    d.lastSeen = Date.now() - hours * 3_600_000;
    localStorage.setItem(GameState.SAVE_KEY, JSON.stringify(d));
  } catch { /* ignore */ }
  location.reload();
}

/** 세이브 JSON 내보내기 (문자열 반환) */
export function exportSave(s: GameState): string {
  s.save();
  try { return localStorage.getItem(GameState.SAVE_KEY) ?? ''; } catch { return ''; }
}

/** 세이브 JSON 가져오기 → 리로드. 성공 여부 반환 */
export function importSave(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { v?: number };
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.v !== 'number') return false;
    localStorage.setItem(GameState.SAVE_KEY, json);
    location.reload();
    return true;
  } catch {
    return false;
  }
}

/** 전체 초기화 (세이브 + 부속 키) 후 리로드 */
export function wipeAll(): void {
  try {
    ['taptap-titans-v1', 'taptap-lb-local', 'taptap-tourney-flag', 'taptap-tourney-history',
      'taptap-tourney-reward', 'taptap-main-stash', 'taptap-season', 'taptap-clanboss',
    ].forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  location.reload();
}

/** 상태 요약 (패널 상태창/테스트 불변식 검증용) */
export function snapshot(s: GameState): Record<string, string | number> {
  return {
    stage: s.stage,
    maxStage: s.maxStage,
    gold: s.gold,
    relics: s.relics,
    tapDamage: s.tapDamage(),
    dps: Math.round(s.totalDps()),
    goldMult: Number(s.goldMult().toFixed(2)),
    critChance: Number(s.critChance().toFixed(3)),
    critMult: Number(s.critMult().toFixed(1)),
    sp: `${s.spAvailable()}/${s.spEarned()}`,
    setBonus: s.equipSetBonus(),
    offlineRate: Number(s.offlineRate().toFixed(2)),
  };
}

/** 상태 불변식 검증 — 몽키 테스트가 종료 시 호출. 위반 목록 반환 (빈 배열 = 정상) */
export function validate(s: GameState): string[] {
  const bad: string[] = [];
  const fin = (label: string, v: number) => {
    if (!Number.isFinite(v)) bad.push(`${label} 비정상: ${v}`);
  };
  fin('gold', s.gold); fin('stage', s.stage); fin('relics', s.relics);
  fin('tapDamage', s.tapDamage()); fin('totalDps', s.totalDps()); fin('goldMult', s.goldMult());
  if (s.gold < 0) bad.push(`gold 음수: ${s.gold}`);
  if (s.relics < 0) bad.push(`relics 음수: ${s.relics}`);
  if (s.stage < 1) bad.push(`stage < 1: ${s.stage}`);
  if (s.maxStage < s.stage) bad.push(`maxStage(${s.maxStage}) < stage(${s.stage})`);
  if (s.kills < 0 || s.kills > 9) bad.push(`kills 범위 밖: ${s.kills}`);
  if (s.spAvailable() < 0) bad.push(`SP 음수: ${s.spAvailable()}`);
  if (s.heroLevels.some((l) => l < 0 || !Number.isFinite(l))) bad.push('heroLevels 비정상');
  if (s.critChance() > 0.75) bad.push(`critChance 상한 초과: ${s.critChance()}`);
  return bad;
}

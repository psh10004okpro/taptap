// ---------------------------------------------------------------------------
// 밸런스 시뮬레이터 엔진 — 실제 GameState 를 그대로 사용해 로직 드리프트를 없앤다.
// (GameState 는 Phaser 비의존 순수 TS. localStorage 접근은 내부 try/catch 로
//  Node 에서도 안전하다. save/load 는 시뮬에서 호출하지 않는다.)
// 실행: node sim/run.ts   (Node 22+ 네이티브 타입 스트리핑)
//
// 플레이어 모델: "탐욕적 준최적 플레이어"
//  - 매 스테이지 클리어(또는 파밍 청크)마다 ΔDPS/비용 최대 업그레이드를 반복 구매
//  - 스킬은 평균 가동률(지속/쿨다운)로 상시 배율 근사 (GameState 스킬은 비활성 유지)
//  - 정체 + 의미 있는 유물 보상이면 환생, 유물은 ROI 순 소비
// ---------------------------------------------------------------------------
import {
  HEROES, SKILLS, ARTIFACTS, MONSTERS_PER_STAGE, PRESTIGE_MIN_STAGE,
  SKILL_TAP_MULT, SKILL_DPS_MULT, SKILL_GOLD_MULT, SHADOW_CLONE_TAPS_PER_SEC,
  monsterHp, killGold, relicsFor,
} from '../src/config.ts';
import { GameState } from '../src/core/GameState.ts';

export interface SimProfile {
  name: string;
  tapsPerSec: number;    // 0 = 순수 방치
  useSkills: boolean;    // 해금 스킬을 평균 가동률로 사용
}

export interface StageClear { stage: number; t: number; prestigeNo: number }
export interface PrestigeEvent { t: number; atStage: number; gained: number; totalRelics: number }
export interface Wall { stage: number; dwellSec: number; kind: 'soft' | 'hard'; prestigeNo: number }

export interface SimResult {
  profile: string;
  clears: StageClear[];
  prestiges: PrestigeEvent[];
  walls: Wall[];
  maxStage: number;
  simDays: number;
}

const MIN_KILL_SEC = 0.55;        // 스폰 연출 등 처치당 최소 시간
const DECISION_FARM_SEC = 30;     // 파밍 중 구매 재평가 주기
const SOFT_WALL_SEC = 300;        // 5분/스테이지 = 소프트 벽
const HARD_WALL_SEC = 1800;       // 30분/스테이지 = 하드 벽
const PRESTIGE_STALL_SEC = 240;   // 이만큼 정체 + 보상 조건이면 환생

/** 스킬 평균 가동률 배율 (해금된 것만, useSkills 프로필 한정) */
function skillAvg(s: GameState, p: SimProfile, id: number, mult: number): number {
  if (!p.useSkills || !s.isSkillUnlocked(id)) return 1;
  const u = SKILLS[id].duration / SKILLS[id].cooldown;
  return 1 + u * (mult - 1);
}

/** 탭 + 영웅을 합친 실효 DPS (스킬 평균 가동률 포함) */
function effDps(s: GameState, p: SimProfile): number {
  const critFactor = 1 + s.critChance() * (s.critMult() - 1);
  const cloneTps = (p.useSkills && s.isSkillUnlocked(3))
    ? (SKILLS[3].duration / SKILLS[3].cooldown) * SHADOW_CLONE_TAPS_PER_SEC : 0;
  const tapDps = s.tapDamage() * skillAvg(s, p, 0, SKILL_TAP_MULT) * critFactor
    * (p.tapsPerSec + cloneTps);
  const heroDps = s.totalDps() * skillAvg(s, p, 1, SKILL_DPS_MULT);
  return tapDps + heroDps;
}

function goldMult(s: GameState, p: SimProfile): number {
  return s.goldMult() * skillAvg(s, p, 2, SKILL_GOLD_MULT);
}

/** ΔDPS/비용 최대 후보를 반복 구매 */
function spendGold(s: GameState, p: SimProfile): void {
  for (let guard = 0; guard < 4000; guard++) {
    let bestGain = 0; let bestCost = Infinity; let bestBuy: (() => void) | null = null;
    const base = effDps(s, p);

    const cT = s.tapCost();
    if (cT <= s.gold) {
      s.tapLevel++; const g = effDps(s, p) - base; s.tapLevel--;
      if (g / cT > bestGain / bestCost) { bestGain = g; bestCost = cT; bestBuy = () => { s.gold -= cT; s.tapLevel++; }; }
    }
    for (const h of HEROES) {
      const c = s.heroCost(h.id);
      if (c > s.gold) continue;
      s.heroLevels[h.id]++; const g = effDps(s, p) - base; s.heroLevels[h.id]--;
      if (g / c > bestGain / bestCost) { bestGain = g; bestCost = c; bestBuy = () => { s.gold -= c; s.heroLevels[h.id]++; }; }
    }
    if (!bestBuy || bestGain <= 0) return;
    bestBuy();
  }
}

/** 유물을 ROI 순으로 소비 */
function spendRelics(s: GameState, p: SimProfile, bossBlocked: boolean): void {
  for (let guard = 0; guard < 800; guard++) {
    let bestGain = 0; let bestCost = Infinity; let bestId = -1;
    const base = effDps(s, p);
    for (const a of ARTIFACTS) {
      if (s.isArtifactMaxed(a.id)) continue;
      const c = s.artifactCost(a.id);
      if (c > s.relics) continue;
      const t = a.effect.type;
      if (t === 'gold' || t === 'offline') continue;         // 아래 별도 규칙
      if (t === 'bossTime' && !bossBlocked) continue;
      s.artifactLevels[a.id]++;
      const g = t === 'bossTime' ? base * 0.02 : effDps(s, p) - base;
      s.artifactLevels[a.id]--;
      if (g / c > bestGain / bestCost) { bestGain = g; bestCost = c; bestId = a.id; }
    }
    if (bestId < 0) {
      // DPS 유물이 소진되면 골드 유물에 잔여의 절반 한도로 투자
      const goldArts = ARTIFACTS.filter((a) => a.effect.type === 'gold' && !s.isArtifactMaxed(a.id));
      const cheap = goldArts.map((a) => ({ a, c: s.artifactCost(a.id) }))
        .sort((x, y) => x.c - y.c)[0];
      if (cheap && cheap.c <= s.relics * 0.5) {
        s.relics -= cheap.c; s.artifactLevels[cheap.a.id]++;
        continue;
      }
      return;
    }
    s.relics -= bestCost;
    s.artifactLevels[bestId]++;
  }
}

export function simulate(profile: SimProfile, simDays: number, stageCap = 500): SimResult {
  const s = new GameState();
  const capSec = simDays * 86400;
  let t = 0;
  let prestigeNo = 0;
  let lastStageUpAt = 0;

  const clears: StageClear[] = [];
  const prestiges: PrestigeEvent[] = [];
  const walls: Wall[] = [];
  const seenGlobal = new Set<number>();

  const killTime = (hp: number, dps: number) => Math.max(hp / Math.max(dps, 1e-9), MIN_KILL_SEC);

  while (t < capSec && s.stage <= stageCap) {
    const dps = effDps(s, profile);
    const gm = goldMult(s, profile);
    const normalHp = monsterHp(s.stage, false);
    const bossHp = monsterHp(s.stage, true);
    const tNormals = (MONSTERS_PER_STAGE - 1) * killTime(normalHp, dps);
    const bossKillSec = killTime(bossHp, dps);
    const bossOk = bossKillSec <= s.bossTimeLimit() / 1000;

    if (bossOk) {
      t += tNormals + bossKillSec;
      s.gold += ((MONSTERS_PER_STAGE - 1) * killGold(s.stage, false) + killGold(s.stage, true)) * gm;
      const dwell = t - lastStageUpAt;
      if (!seenGlobal.has(s.stage)) {
        seenGlobal.add(s.stage);
        clears.push({ stage: s.stage, t, prestigeNo });
        if (dwell > HARD_WALL_SEC) walls.push({ stage: s.stage, dwellSec: dwell, kind: 'hard', prestigeNo });
        else if (dwell > SOFT_WALL_SEC) walls.push({ stage: s.stage, dwellSec: dwell, kind: 'soft', prestigeNo });
      }
      s.stage += 1;
      s.maxStage = Math.max(s.maxStage, s.stage);
      lastStageUpAt = t;
      spendGold(s, profile);
      continue;
    }

    // 보스 불가 → 파밍 청크
    const goldRate = (killGold(s.stage, false) * gm) / killTime(normalHp, dps);
    t += DECISION_FARM_SEC;
    s.gold += goldRate * DECISION_FARM_SEC;
    spendGold(s, profile);

    const gain = relicsFor(s.maxStage) - s.relicsEarned;
    const stalled = t - lastStageUpAt > PRESTIGE_STALL_SEC;
    const meaningful = gain >= Math.max(2, Math.floor(s.relicsEarned * 0.15));
    if (s.maxStage >= PRESTIGE_MIN_STAGE && stalled && meaningful && gain > 0) {
      s.relics += gain;
      s.relicsEarned = relicsFor(s.maxStage);
      prestigeNo += 1;
      prestiges.push({ t, atStage: s.maxStage, gained: gain, totalRelics: s.relicsEarned });
      s.gold = 0;
      s.stage = 1;
      s.tapLevel = 0;
      s.heroLevels = HEROES.map(() => 0);
      spendRelics(s, profile, true);
      lastStageUpAt = t;
    } else if (t - lastStageUpAt > HARD_WALL_SEC * 4 && s.maxStage < PRESTIGE_MIN_STAGE) {
      walls.push({ stage: s.stage, dwellSec: t - lastStageUpAt, kind: 'hard', prestigeNo });
      break;
    } else if (t - lastStageUpAt > HARD_WALL_SEC * 8) {
      walls.push({ stage: s.stage, dwellSec: t - lastStageUpAt, kind: 'hard', prestigeNo });
      break;
    }
  }

  return {
    profile: profile.name,
    clears, prestiges, walls,
    maxStage: s.maxStage,
    simDays: t / 86400,
  };
}

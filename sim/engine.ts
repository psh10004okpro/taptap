// ---------------------------------------------------------------------------
// 밸런스 시뮬레이터 엔진 — 렌더링 없이 config 곡선만으로 진행을 재현한다.
// 실행: node sim/run.ts   (Node 22+ 네이티브 타입 스트리핑)
//
// 플레이어 모델: "탐욕적 준최적 플레이어"
//  - 매 스테이지 클리어(또는 파밍 청크)마다 ΔDPS/비용 최대 업그레이드를 반복 구매
//  - 스킬은 해금 시 평균 가동률(지속/쿨다운)로 환산해 상시 배율로 근사
//  - 성장 정체(벽) + 의미 있는 유물 보상이면 환생, 유물은 ROI 순으로 소비
// ---------------------------------------------------------------------------
import {
  HEROES, SKILLS, ARTIFACTS, MONSTERS_PER_STAGE, PRESTIGE_MIN_STAGE,
  BASE_CRIT_CHANCE, BASE_CRIT_MULT, BOSS_TIME_LIMIT,
  SKILL_TAP_MULT, SKILL_DPS_MULT, SKILL_GOLD_MULT, SHADOW_CLONE_TAPS_PER_SEC,
  ARTIFACT_TAP_PER_LVL, ARTIFACT_DPS_PER_LVL, ARTIFACT_GOLD_PER_LVL,
  ARTIFACT_CRIT_CHANCE_PER_LVL, ARTIFACT_CRIT_MULT_PER_LVL, ARTIFACT_BOSS_TIME_PER_LVL,
  monsterHp, killGold, tapDamageAt, tapCost, heroCost, heroDps, relicsFor, artifactCost,
} from '../src/config.ts';

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

class SimState {
  gold = 0;
  stage = 1;
  tapLevel = 0;
  heroLevels = HEROES.map(() => 0);
  relics = 0;
  relicsEarned = 0;
  artifactLevels = ARTIFACTS.map(() => 0);
  maxStage = 1;

  readonly p: SimProfile;
  constructor(p: SimProfile) { this.p = p; }

  // --- 평균 가동률 스킬 배율 (해금된 것만) ---------------------------------
  private uptime(id: number): number {
    if (!this.p.useSkills || this.maxStage < SKILLS[id].unlockStage) return 0;
    return SKILLS[id].duration / SKILLS[id].cooldown;
  }
  private avgMult(id: number, mult: number): number {
    const u = this.uptime(id);
    return 1 + u * (mult - 1);
  }

  critFactor(): number {
    const chance = Math.min(0.5, BASE_CRIT_CHANCE + this.artifactLevels[3] * ARTIFACT_CRIT_CHANCE_PER_LVL);
    const mult = BASE_CRIT_MULT + this.artifactLevels[4] * ARTIFACT_CRIT_MULT_PER_LVL;
    return 1 + chance * (mult - 1);
  }

  /** 탭 + 영웅을 합친 실효 DPS */
  effDps(): number {
    const artTap = 1 + this.artifactLevels[0] * ARTIFACT_TAP_PER_LVL;
    const artDps = 1 + this.artifactLevels[1] * ARTIFACT_DPS_PER_LVL;
    const cloneTps = this.uptime(3) > 0 ? this.uptime(3) * SHADOW_CLONE_TAPS_PER_SEC : 0;
    const tapDmg = tapDamageAt(this.tapLevel) * artTap * this.avgMult(0, SKILL_TAP_MULT) * this.critFactor();
    const tapDps = tapDmg * (this.p.tapsPerSec + cloneTps);
    let hero = 0;
    for (const h of HEROES) hero += heroDps(h, this.heroLevels[h.id]);
    hero *= artDps * this.avgMult(1, SKILL_DPS_MULT);
    return tapDps + hero;
  }

  goldMult(): number {
    return (1 + this.artifactLevels[2] * ARTIFACT_GOLD_PER_LVL) * this.avgMult(2, SKILL_GOLD_MULT);
  }

  bossLimitSec(): number {
    return (BOSS_TIME_LIMIT + this.artifactLevels[5] * ARTIFACT_BOSS_TIME_PER_LVL) / 1000;
  }

  // --- 탐욕 구매 ------------------------------------------------------------
  /** 현재 골드로 ΔDPS/비용 최대 후보를 반복 구매 */
  spendGold(): void {
    for (let guard = 0; guard < 4000; guard++) {
      let bestGain = 0; let bestCost = Infinity; let bestBuy: (() => void) | null = null;
      const base = this.effDps();

      const cT = tapCost(this.tapLevel);
      if (cT <= this.gold) {
        this.tapLevel++; const g = this.effDps() - base; this.tapLevel--;
        if (g / cT > bestGain / bestCost) { bestGain = g; bestCost = cT; bestBuy = () => { this.tapLevel++; }; }
      }
      for (const h of HEROES) {
        const c = heroCost(h, this.heroLevels[h.id]);
        if (c > this.gold) continue;
        this.heroLevels[h.id]++; const g = this.effDps() - base; this.heroLevels[h.id]--;
        if (g / c > bestGain / bestCost) { bestGain = g; bestCost = c; bestBuy = () => { this.heroLevels[h.id]++; }; }
      }
      if (!bestBuy || bestGain <= 0) return;
      this.gold -= bestCost;
      bestBuy();
    }
  }

  /** 유물을 ROI 순으로 소비 (DPS 직결 0/1/3/4 우선, 보스 막힘 시 5) */
  spendRelics(bossBlocked: boolean): void {
    for (let guard = 0; guard < 500; guard++) {
      let bestGain = 0; let bestCost = Infinity; let bestId = -1;
      const base = this.effDps();
      for (const a of ARTIFACTS) {
        if (a.maxLevel > 0 && this.artifactLevels[a.id] >= a.maxLevel) continue;
        const c = artifactCost(a, this.artifactLevels[a.id]);
        if (c > this.relics) continue;
        if (a.id === 2) continue; // 골드 유물은 아래 별도 규칙
        if (a.id === 5 && !bossBlocked) continue;
        this.artifactLevels[a.id]++;
        const g = a.id === 5 ? base * 0.02 : this.effDps() - base; // 시간의 모래는 소가치 평가
        this.artifactLevels[a.id]--;
        if (g / c > bestGain / bestCost) { bestGain = g; bestCost = c; bestId = a.id; }
      }
      // 골드 유물: DPS 유물이 비싸질수록 상대 가치 상승 — 잔여 유물의 20% 한도로 구매
      if (bestId < 0) {
        const c2 = artifactCost(ARTIFACTS[2], this.artifactLevels[2]);
        if (c2 <= this.relics * 0.5) { this.relics -= c2; this.artifactLevels[2]++; continue; }
        return;
      }
      this.relics -= bestCost;
      this.artifactLevels[bestId]++;
    }
  }
}

export function simulate(profile: SimProfile, simDays: number, stageCap = 400): SimResult {
  const s = new SimState(profile);
  const capSec = simDays * 86400;
  let t = 0;
  let prestigeNo = 0;
  let lastStageUpAt = 0;

  const clears: StageClear[] = [];
  const prestiges: PrestigeEvent[] = [];
  const walls: Wall[] = [];
  const seenGlobal = new Set<number>(); // 전역 첫 도달 기록 (환생 반복 구간 제외)

  const killTime = (hp: number, dps: number) => Math.max(hp / Math.max(dps, 1e-9), MIN_KILL_SEC);

  while (t < capSec && s.stage <= stageCap) {
    const dps = s.effDps();
    const gm = s.goldMult();
    const normalHp = monsterHp(s.stage, false);
    const bossHp = monsterHp(s.stage, true);
    const tNormals = (MONSTERS_PER_STAGE - 1) * killTime(normalHp, dps);
    const bossKillSec = killTime(bossHp, dps);
    const bossOk = bossKillSec <= s.bossLimitSec();

    if (bossOk) {
      // 스테이지 클리어
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
      s.spendGold();
      continue;
    }

    // 보스 불가 → 일반 몬스터 파밍 청크
    const goldRate = (killGold(s.stage, false) * gm) / killTime(normalHp, dps);
    t += DECISION_FARM_SEC;
    s.gold += goldRate * DECISION_FARM_SEC;
    s.spendGold();

    // 환생 판단: 정체 + 의미 있는 유물
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
      s.spendRelics(true);
      lastStageUpAt = t;
    } else if (t - lastStageUpAt > HARD_WALL_SEC * 4 && s.maxStage < PRESTIGE_MIN_STAGE) {
      // 환생도 못 하는 초반 완전 정체 — 기록하고 종료
      walls.push({ stage: s.stage, dwellSec: t - lastStageUpAt, kind: 'hard', prestigeNo });
      break;
    } else if (t - lastStageUpAt > HARD_WALL_SEC * 8) {
      // 환생 후에도 뚫리지 않는 종말 벽 — 종료
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

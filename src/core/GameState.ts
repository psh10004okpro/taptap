// ---------------------------------------------------------------------------
// 중앙 게임 상태. 렌더링과 완전히 분리된 순수 로직 계층.
// 변경 시 이벤트를 발행하고, Scene 들은 구독만 한다.
//
// events:
//   'gold'          (gold: number)               골드 변경
//   'stage'         (stage, kills)               스테이지/처치수 변경
//   'mode'          (mode: Mode)                 farm <-> boss 전환
//   'upgrade'                                    탭/영웅/유물/장비/부스트 변경
//   'skill'         (id: number)                 스킬 발동
//   'drop'          (item: EquipItem, equipped)  장비 드롭
//   'pet'           (petId: number, level)       펫 알 획득
//   'quest'                                      퀘스트 진행/수령 변경
//   'prestige'      (relics: number)             환생 완료
// ---------------------------------------------------------------------------
import {
  HEROES, SKILLS, ARTIFACTS, MONSTERS_PER_STAGE, PRESTIGE_MIN_STAGE,
  OFFLINE_CAP_SEC, OFFLINE_RATE, BOSS_TIME_LIMIT,
  BASE_CRIT_CHANCE, BASE_CRIT_MULT,
  SKILL_TAP_MULT, SKILL_DPS_MULT, SKILL_GOLD_MULT,
  HERO_PASSIVE_UNLOCK, HERO_COST_DISCOUNT_CAP,
  AD_GOLD_BOOST_MULT, AD_GOLD_BOOST_DURATION,
  EQUIP_SLOTS, RARITIES, EQUIP_DROP_CHANCE, EQUIP_SET_BONUS, DAILY_QUESTS,
  ACHIEVEMENTS, DEADLY_STRIKE_CRIT_BONUS, PETS, PET_EGG_DROP_CHANCE,
  SKILL_TREE, SP_PER_STAGES, SP_PER_PRESTIGE, TREE_RESPEC_COST, SKILL_CD_CAP,
  treeNodeCost,
  tapDamageAt, tapCost, heroCost, heroDps, killGold, relicsFor, artifactCost, equipStatPct,
} from '../config.ts';
import type { EquipItem, QuestMetric, EffectType, LifetimeMetric } from '../config.ts';
import { Analytics } from './Analytics.ts';

export type Mode = 'farm' | 'boss';

interface DailyState {
  date: string; // YYYY-MM-DD (로컬)
  counters: Record<QuestMetric, number>;
  claimed: boolean[];
}

interface SaveData {
  v: number;
  gen: number; // 세이브 세대 카운터 — 멀티탭 last-writer-wins 방지
  gold: number;
  stage: number;
  kills: number;
  maxStage: number;
  tapLevel: number;
  heroLevels: number[];
  relics: number;
  relicsEarned: number;
  artifactLevels: number[];
  skillReadyAt: number[];
  skillActiveUntil: number[];
  goldBoostUntil: number;
  equipment: (EquipItem | null)[];
  daily: DailyState;
  lifetime: Record<string, number>;
  achClaimed: boolean[];
  petLevels: number[];
  treeLevels: number[];
  playerName: string;
  bossFailed: boolean;
  lastSeen: number;
}

const SAVE_KEY = 'taptap-titans-v1';

/** 손상 세이브의 NaN/문자열 전파 방지: 유한수 아니면 fallback */
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function freshDaily(): DailyState {
  return {
    date: todayStr(),
    counters: { kills: 0, bossKills: 0, skillUses: 0 },
    claimed: DAILY_QUESTS.map(() => false),
  };
}

type Listener = (...args: unknown[]) => void;

/** Phaser 비의존 초소형 이벤트 이미터 */
class Emitter {
  private map = new Map<string, Set<Listener>>();
  on(ev: string, fn: Listener): void {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn);
  }
  off(ev: string, fn: Listener): void {
    this.map.get(ev)?.delete(fn);
  }
  emit(ev: string, ...args: unknown[]): void {
    this.map.get(ev)?.forEach((fn) => fn(...args));
  }
}

export class GameState extends Emitter {
  gold = 0;
  stage = 1;
  kills = 0; // 현재 스테이지 일반 몬스터 처치 수 (0..9)
  maxStage = 1;
  tapLevel = 0;
  heroLevels: number[] = HEROES.map(() => 0);
  /** 소지 유물 (환생 화폐) */
  relics = 0;
  /** 지금까지 환생으로 얻은 누적 유물 (다음 환생 보상 계산 기준) */
  relicsEarned = 0;
  artifactLevels: number[] = ARTIFACTS.map(() => 0);
  /** 스킬 재사용 가능 시각 / 효과 종료 시각 (epoch ms — 오프라인에도 흐름) */
  skillReadyAt: number[] = SKILLS.map(() => 0);
  skillActiveUntil: number[] = SKILLS.map(() => 0);
  /** 광고 보상: 골드 x2 부스트 종료 시각 (epoch ms) */
  goldBoostUntil = 0;
  /** 슬롯별 장착 장비 (보스 드롭, 상위 아이템 자동 교체) */
  equipment: (EquipItem | null)[] = EQUIP_SLOTS.map(() => null);
  daily: DailyState = freshDaily();
  /** 평생 누적 통계 (업적/분석용) */
  lifetime: Record<Exclude<LifetimeMetric, 'maxStage'>, number> = {
    taps: 0, kills: 0, bossKills: 0, prestiges: 0, equipDrops: 0,
  };
  achClaimed: boolean[] = ACHIEVEMENTS.map(() => false);
  /** 펫 레벨 (0 = 미보유). 보스가 떨어뜨리는 알로 획득/성장 */
  petLevels: number[] = PETS.map(() => 0);
  /** 스킬트리 노드 레벨 (환생 유지, 리스펙으로만 초기화) */
  treeLevels: number[] = SKILL_TREE.map(() => 0);
  playerName = '';
  mode: Mode = 'farm';
  bossFailed = false;
  /** 마지막 세이브 시각 — 오프라인 보상 계산용 */
  lastSeen = Date.now();
  /** 세이브 세대. 다른 탭이 더 새 세대를 쓰면 이 인스턴스는 stale 이 되어 저장을 멈춘다 */
  private gen = 0;
  private stale = false;
  /** 벽 계측: 현재 스테이지 진입 시각 */
  private stageEnteredAt = Date.now();

  static readonly SAVE_KEY = SAVE_KEY;

  isStale(): boolean { return this.stale; }

  /** 다른 탭의 저장을 감지했을 때 호출 (storage 이벤트) */
  checkExternalWrite(raw: string | null): void {
    if (!raw) return;
    try {
      const g = (JSON.parse(raw) as SaveData).gen;
      if (typeof g === 'number' && g > this.gen) {
        this.stale = true;
        Analytics.track('save_stale', {});
      }
    } catch { /* ignore */ }
  }

  // --- 파생 값 (데이터 주도 효과 집계) --------------------------------------

  /** 유물 + 영웅 패시브(레벨 20+ 해금)의 타입별 합산 보너스 */
  bonus(type: EffectType): number {
    let sum = 0;
    for (const a of ARTIFACTS) {
      if (a.effect.type === type) sum += this.artifactLevels[a.id] * a.effect.perLvl;
    }
    for (const h of HEROES) {
      if (h.passive.type === type && this.heroLevels[h.id] >= HERO_PASSIVE_UNLOCK) {
        sum += h.passive.value;
      }
    }
    for (const pt of PETS) {
      if (pt.bonus.type === type) sum += this.petLevels[pt.id] * pt.bonus.perLvl;
    }
    for (const n of SKILL_TREE) {
      if (n.effect.type === type) sum += this.treeLevels[n.id] * n.effect.perLvl;
    }
    return sum;
  }

  /** 스킬 효과 강화 배율: 스킬의 "배율 - 1" 부분을 증폭한다 (x3 → x3+2*보너스) */
  skillPowerMult(): number {
    return 1 + this.bonus('skillPower');
  }

  /** 스킬 배율에 강화를 적용: base 배율 x -> 1 + (x-1)*강화 */
  private amplifiedSkillMult(base: number): number {
    return 1 + (base - 1) * this.skillPowerMult();
  }

  private equipMult(slot: number): number {
    const item = this.equipment[slot];
    return item ? 1 + item.statPct / 100 : 1;
  }

  /** 장비 세트 효과: 3슬롯 전부 같은 등급이면 모든 데미지 배율 */
  equipSetBonus(): number {
    const [a, b, c] = this.equipment;
    if (!a || !b || !c) return 0;
    if (a.rarity === b.rarity && b.rarity === c.rarity) return EQUIP_SET_BONUS[a.rarity] ?? 0;
    return 0;
  }

  private allDmgMult(): number {
    return (1 + this.bonus('allDmg')) * (1 + this.equipSetBonus());
  }

  tapDamage(): number {
    let dmg = tapDamageAt(this.tapLevel)
      * (1 + this.bonus('tap'))
      * this.allDmgMult()
      * this.equipMult(0);
    if (this.isSkillActive(0)) dmg *= this.amplifiedSkillMult(SKILL_TAP_MULT);
    return Math.max(1, Math.round(dmg));
  }

  totalDps(): number {
    let dps = 0;
    for (const h of HEROES) dps += heroDps(h, this.heroLevels[h.id]);
    dps *= (1 + this.bonus('dps')) * this.allDmgMult() * this.equipMult(1);
    if (this.isSkillActive(1)) dps *= this.amplifiedSkillMult(SKILL_DPS_MULT);
    return dps;
  }

  goldMult(): number {
    let m = (1 + this.bonus('gold')) * this.equipMult(2);
    if (this.isSkillActive(2)) m *= this.amplifiedSkillMult(SKILL_GOLD_MULT);
    if (this.isGoldBoostActive()) m *= AD_GOLD_BOOST_MULT;
    return m;
  }

  critChance(): number {
    const skill = this.isSkillActive(5)
      ? DEADLY_STRIKE_CRIT_BONUS * this.skillPowerMult() : 0;
    return Math.min(0.75, Math.min(0.5, BASE_CRIT_CHANCE + this.bonus('critChance')) + skill);
  }

  critMult(): number {
    return BASE_CRIT_MULT + this.bonus('critMult');
  }

  bossTimeLimit(): number {
    return BOSS_TIME_LIMIT + this.bonus('bossTime');
  }

  offlineRate(): number {
    return OFFLINE_RATE * (1 + this.bonus('offline'));
  }

  tapCost(): number { return tapCost(this.tapLevel); }

  heroCost(id: number): number {
    const discount = Math.min(HERO_COST_DISCOUNT_CAP, this.bonus('heroCost'));
    return Math.max(1, Math.round(heroCost(HEROES[id], this.heroLevels[id]) * (1 - discount)));
  }

  heroDps(id: number): number {
    return heroDps(HEROES[id], this.heroLevels[id])
      * (1 + this.bonus('dps')) * this.allDmgMult() * this.equipMult(1)
      * (this.isSkillActive(1) ? this.amplifiedSkillMult(SKILL_DPS_MULT) : 1);
  }

  /** 영웅 패시브 해금 여부 */
  isHeroPassiveActive(id: number): boolean {
    return this.heroLevels[id] >= HERO_PASSIVE_UNLOCK;
  }

  prestigeRelics(): number { return relicsFor(this.maxStage); }
  prestigeGain(): number { return Math.max(0, this.prestigeRelics() - this.relicsEarned); }
  canPrestige(): boolean {
    return this.maxStage >= PRESTIGE_MIN_STAGE && this.prestigeGain() > 0;
  }

  // --- 스킬 ---------------------------------------------------------------

  isSkillUnlocked(id: number): boolean {
    return this.maxStage >= SKILLS[id].unlockStage;
  }

  isSkillActive(id: number): boolean {
    return Date.now() < this.skillActiveUntil[id];
  }

  /** 남은 쿨다운 ms (0 = 사용 가능) */
  skillCooldownLeft(id: number): number {
    return Math.max(0, this.skillReadyAt[id] - Date.now());
  }

  /** 남은 지속시간 ms (0 = 비활성) */
  skillActiveLeft(id: number): number {
    return Math.max(0, this.skillActiveUntil[id] - Date.now());
  }

  tryActivateSkill(id: number): boolean {
    if (!this.isSkillUnlocked(id)) return false;
    if (this.skillCooldownLeft(id) > 0) return false;
    const now = Date.now();
    const def = SKILLS[id];
    const dur = Math.round(def.duration * (1 + this.bonus('skillDur')));
    const cdCut = Math.min(SKILL_CD_CAP, this.bonus('skillCd'));
    this.skillActiveUntil[id] = now + dur;
    this.skillReadyAt[id] = now + Math.round(def.cooldown * (1 - cdCut));
    this.bumpQuest('skillUses');
    Analytics.track('skill_use', { id, stage: this.stage });
    this.emit('skill', id);
    this.emit('upgrade'); // DPS/탭뎀 표기 갱신
    return true;
  }

  // --- 광고 보상 슬롯 -------------------------------------------------------

  isGoldBoostActive(): boolean { return Date.now() < this.goldBoostUntil; }
  goldBoostLeft(): number { return Math.max(0, this.goldBoostUntil - Date.now()); }

  /** 광고 보상: 골드 x2 부스트 (연장 아닌 갱신) */
  activateGoldBoost(): void {
    this.goldBoostUntil = Date.now() + AD_GOLD_BOOST_DURATION;
    this.emit('upgrade');
  }

  /** 광고 보상: 모든 스킬 쿨다운 초기화 */
  resetSkillCooldowns(): void {
    this.skillReadyAt = SKILLS.map(() => 0);
    this.emit('upgrade');
  }

  /** 쿨다운 리셋 광고가 의미 있는가 (하나라도 쿨다운 중) */
  anySkillOnCooldown(): boolean {
    return SKILLS.some((s) => this.isSkillUnlocked(s.id)
      && !this.isSkillActive(s.id) && this.skillCooldownLeft(s.id) > 0);
  }

  /** 사람의 실제 탭 1회 기록 (업적 통계) */
  recordTap(): void {
    this.lifetime.taps += 1;
  }

  // --- 스킬트리 -------------------------------------------------------------

  /** 누적 획득 SP: 최고 스테이지 10마다 1 + 환생당 2 */
  spEarned(): number {
    return Math.floor(this.maxStage / SP_PER_STAGES) + this.lifetime.prestiges * SP_PER_PRESTIGE;
  }

  spSpent(): number {
    return SKILL_TREE.reduce((sum, n) => sum + this.treeLevels[n.id] * treeNodeCost(n), 0);
  }

  spAvailable(): number {
    return Math.max(0, this.spEarned() - this.spSpent());
  }

  /** 선행 조건: 같은 계열 직전 티어 노드 레벨 */
  isNodeUnlocked(id: number): boolean {
    const n = SKILL_TREE[id];
    if (n.tier === 0) return true;
    const prev = SKILL_TREE.find((m) => m.branch === n.branch && m.tier === n.tier - 1);
    return !!prev && this.treeLevels[prev.id] >= n.requiresLevel;
  }

  canBuyNode(id: number): boolean {
    const n = SKILL_TREE[id];
    return this.treeLevels[id] < n.maxLevel
      && this.isNodeUnlocked(id)
      && this.spAvailable() >= treeNodeCost(n);
  }

  tryBuyNode(id: number): boolean {
    if (!this.canBuyNode(id)) return false;
    this.treeLevels[id] += 1;
    Analytics.track('tree_buy', { id, level: this.treeLevels[id] });
    this.emit('upgrade');
    return true;
  }

  /** 리스펙: 유물을 소비하고 모든 노드를 초기화 (SP 는 자동 반환됨) */
  respecTree(): boolean {
    if (this.spSpent() === 0) return false;
    if (this.relics < TREE_RESPEC_COST) return false;
    this.relics -= TREE_RESPEC_COST;
    this.treeLevels = SKILL_TREE.map(() => 0);
    Analytics.track('tree_respec', {});
    this.emit('upgrade');
    return true;
  }

  // --- 업적 ----------------------------------------------------------------

  achProgress(id: number): number {
    const a = ACHIEVEMENTS[id];
    const v = a.metric === 'maxStage' ? this.maxStage : this.lifetime[a.metric];
    return Math.min(v, a.target);
  }

  canClaimAch(id: number): boolean {
    return !this.achClaimed[id] && this.achProgress(id) >= ACHIEVEMENTS[id].target;
  }

  claimAch(id: number): boolean {
    if (!this.canClaimAch(id)) return false;
    this.achClaimed[id] = true;
    this.addRelics(ACHIEVEMENTS[id].rewardRelics);
    Analytics.track('ach_claim', { id, reward: ACHIEVEMENTS[id].rewardRelics });
    this.emit('quest');
    return true;
  }

  // --- 전투 진행 -----------------------------------------------------------

  /** 몬스터 처치 처리. 골드 지급 + 진행/보스 전환 + 드롭/퀘스트. */
  recordKill(isBoss: boolean): void {
    this.addGold(Math.round(killGold(this.stage, isBoss) * this.goldMult()));
    this.bumpQuest('kills');
    this.lifetime.kills += 1;
    if (isBoss) {
      this.bumpQuest('bossKills');
      this.lifetime.bossKills += 1;
      Analytics.track('stage_clear', {
        stage: this.stage,
        dwellMs: Date.now() - this.stageEnteredAt,
      });
      this.rollEquipDrop();
      this.rollPetEgg();
      this.stage += 1;
      this.maxStage = Math.max(this.maxStage, this.stage);
      this.kills = 0;
      this.bossFailed = false;
      this.stageEnteredAt = Date.now();
      this.setMode('farm');
    } else if (this.kills < MONSTERS_PER_STAGE - 1) {
      this.kills += 1;
      if (this.kills >= MONSTERS_PER_STAGE - 1 && !this.bossFailed) {
        this.setMode('boss');
      }
    }
    this.emit('stage', this.stage, this.kills);
  }

  /** 보스 시간 초과 → 파밍 모드로 후퇴 */
  failBoss(): void {
    this.bossFailed = true;
    Analytics.track('boss_fail', { stage: this.stage });
    this.setMode('farm');
    this.emit('stage', this.stage, this.kills);
  }

  /** "보스 도전" 버튼. 전환 성공 여부 반환 */
  engageBoss(): boolean {
    if (this.mode === 'boss') return false;
    if (this.kills < MONSTERS_PER_STAGE - 1) return false;
    this.setMode('boss');
    return true;
  }

  private setMode(m: Mode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.emit('mode', m);
  }

  addGold(n: number): void {
    this.gold += n;
    this.emit('gold', this.gold);
  }

  /** 유물 지급 (환생 외 경로용 — 이벤트를 발행해 UI 를 갱신한다) */
  addRelics(n: number): void {
    this.relics += n;
    this.emit('upgrade');
  }

  setPlayerName(name: string): boolean {
    const t = name.trim();
    if (t.length < 2 || t.length > 12) return false;
    this.playerName = t;
    this.save();
    return true;
  }

  // --- 장비 ----------------------------------------------------------------

  /** 보스 처치 시 확률 드롭. 상위 스탯이면 자동 장착. */
  private rollEquipDrop(): void {
    if (Math.random() >= EQUIP_DROP_CHANCE) return;
    // 가중치 기반 등급 추첨
    const totalW = RARITIES.reduce((a, r) => a + r.weight, 0);
    let roll = Math.random() * totalW;
    let rarity = 0;
    for (let i = 0; i < RARITIES.length; i++) {
      roll -= RARITIES[i].weight;
      if (roll <= 0) { rarity = i; break; }
    }
    const slot = Math.floor(Math.random() * EQUIP_SLOTS.length);
    const item: EquipItem = {
      slot, rarity,
      statPct: equipStatPct(rarity, this.stage),
      stage: this.stage,
    };
    this.lifetime.equipDrops += 1;
    const cur = this.equipment[slot];
    const equipped = !cur || item.statPct > cur.statPct;
    if (equipped) this.equipment[slot] = item;
    Analytics.track('equip_drop', { slot, rarity, statPct: item.statPct, stage: this.stage, equipped });
    this.emit('drop', item, equipped);
    if (equipped) this.emit('upgrade');
  }

  /** 보스 처치 시 펫 알 드롭 → 랜덤 펫 +1 레벨 */
  private rollPetEgg(): void {
    if (Math.random() >= PET_EGG_DROP_CHANCE) return;
    const id = Math.floor(Math.random() * PETS.length);
    this.petLevels[id] += 1;
    Analytics.track('pet_drop', { id, level: this.petLevels[id], stage: this.stage });
    this.emit('pet', id, this.petLevels[id]);
    this.emit('upgrade');
  }

  // --- 일일 퀘스트 ----------------------------------------------------------

  /** 날짜가 바뀌었으면 일일 퀘스트 리셋 */
  ensureDaily(): void {
    if (this.daily.date !== todayStr()) {
      this.daily = freshDaily();
      this.emit('quest');
    }
  }

  private bumpQuest(metric: QuestMetric): void {
    this.ensureDaily();
    this.daily.counters[metric] += 1;
    this.emit('quest');
  }

  questProgress(id: number): number {
    return Math.min(this.daily.counters[DAILY_QUESTS[id].metric], DAILY_QUESTS[id].target);
  }

  canClaimQuest(id: number): boolean {
    return !this.daily.claimed[id] && this.questProgress(id) >= DAILY_QUESTS[id].target;
  }

  /** 퀘스트 보상 수령. gold 보상은 현재 스테이지 killGold 배수 (부스트 미적용) */
  claimQuest(id: number): boolean {
    this.ensureDaily();
    if (!this.canClaimQuest(id)) return false;
    const q = DAILY_QUESTS[id];
    this.daily.claimed[id] = true;
    let rewarded = 0;
    if (q.reward === 'gold') {
      rewarded = killGold(this.stage, false) * q.amount;
      this.addGold(rewarded);
    } else {
      rewarded = q.amount;
      this.addRelics(q.amount);
    }
    Analytics.track('quest_claim', { id, reward: q.reward, amount: rewarded, stage: this.stage });
    this.emit('quest');
    return true;
  }

  // --- 업그레이드 ----------------------------------------------------------

  tryBuyTap(): boolean {
    const cost = this.tapCost();
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.tapLevel += 1;
    Analytics.track('upgrade_buy', { kind: 'tap', level: this.tapLevel, cost });
    this.emit('gold', this.gold);
    this.emit('upgrade');
    return true;
  }

  tryBuyHero(id: number): boolean {
    const cost = this.heroCost(id);
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.heroLevels[id] += 1;
    Analytics.track('upgrade_buy', { kind: 'hero', id, level: this.heroLevels[id], cost });
    this.emit('gold', this.gold);
    this.emit('upgrade');
    return true;
  }

  artifactCost(id: number): number {
    return artifactCost(ARTIFACTS[id], this.artifactLevels[id]);
  }

  isArtifactMaxed(id: number): boolean {
    const max = ARTIFACTS[id].maxLevel;
    return max > 0 && this.artifactLevels[id] >= max;
  }

  tryBuyArtifact(id: number): boolean {
    if (this.isArtifactMaxed(id)) return false;
    const cost = this.artifactCost(id);
    if (this.relics < cost) return false;
    this.relics -= cost;
    this.artifactLevels[id] += 1;
    Analytics.track('upgrade_buy', { kind: 'artifact', id, level: this.artifactLevels[id], cost });
    this.emit('upgrade');
    return true;
  }

  // --- 환생 ----------------------------------------------------------------

  doPrestige(): boolean {
    if (!this.canPrestige()) return false;
    const gain = this.prestigeGain();
    Analytics.track('prestige', { atStage: this.maxStage, gained: gain, totalRelics: this.relicsEarned + gain });
    this.lifetime.prestiges += 1;
    this.gold = 0;
    this.stage = 1;
    this.kills = 0;
    this.tapLevel = 0;
    this.heroLevels = HEROES.map(() => 0);
    this.relics += gain;
    this.relicsEarned = this.prestigeRelics();
    this.bossFailed = false;
    this.mode = 'farm';
    this.stageEnteredAt = Date.now();
    // 유물 강화·장비·스킬 쿨다운·이름·퀘스트는 유지
    this.save();
    this.emit('prestige', gain);
    this.emit('gold', this.gold);
    this.emit('stage', this.stage, this.kills);
    this.emit('upgrade');
    this.emit('mode', this.mode);
    return true;
  }

  // --- 저장/로드 -----------------------------------------------------------

  save(): void {
    if (this.stale) return; // 다른 탭이 더 최신 — 덮어쓰기 금지
    // 저장 직전 외부 세대 재확인 (storage 이벤트를 놓친 경우 대비)
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const g = (JSON.parse(raw) as SaveData).gen;
        if (typeof g === 'number' && g > this.gen) { this.stale = true; return; }
      }
    } catch { /* ignore */ }
    this.gen += 1;
    this.lastSeen = Date.now();
    const data: SaveData = {
      v: 6,
      gen: this.gen,
      gold: this.gold,
      stage: this.stage,
      kills: this.kills,
      maxStage: this.maxStage,
      tapLevel: this.tapLevel,
      heroLevels: this.heroLevels,
      relics: this.relics,
      relicsEarned: this.relicsEarned,
      artifactLevels: this.artifactLevels,
      skillReadyAt: this.skillReadyAt,
      skillActiveUntil: this.skillActiveUntil,
      goldBoostUntil: this.goldBoostUntil,
      equipment: this.equipment,
      daily: this.daily,
      lifetime: this.lifetime,
      achClaimed: this.achClaimed,
      petLevels: this.petLevels,
      treeLevels: this.treeLevels,
      playerName: this.playerName,
      bossFailed: this.bossFailed,
      lastSeen: this.lastSeen,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch { /* 사파리 프라이빗 모드 등 – 무시 */ }
  }

  /** 저장 데이터 로드. 반환값: 오프라인 경과 초 (보상 대상 아니면 0) */
  load(): number {
    let raw: string | null = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch { /* ignore */ }
    if (!raw) return 0;
    try {
      const d = JSON.parse(raw) as SaveData;
      const now = Date.now();
      // 모든 수치는 num() 으로 정화 — 손상 세이브의 NaN/문자열이 전파되지 않게
      this.gen = Math.max(0, Math.floor(num(d.gen, 0)));
      this.gold = Math.max(0, num(d.gold, 0));
      this.stage = Math.max(1, Math.floor(num(d.stage, 1)));
      this.kills = Math.min(MONSTERS_PER_STAGE - 1, Math.max(0, Math.floor(num(d.kills, 0))));
      this.maxStage = Math.max(this.stage, Math.floor(num(d.maxStage, 1)));
      this.tapLevel = Math.max(0, Math.floor(num(d.tapLevel, 0)));
      this.heroLevels = HEROES.map((h) => Math.max(0, Math.floor(num(d.heroLevels?.[h.id], 0))));
      this.relics = Math.max(0, Math.floor(num(d.relics, 0)));
      // v1 → v2: 기존 소지 유물은 이미 "획득한" 것으로 간주해 이중 지급을 막는다
      this.relicsEarned = Math.max(this.relics, Math.floor(num(d.relicsEarned, this.relics)));
      this.artifactLevels = ARTIFACTS.map((a) => {
        const lvl = Math.max(0, Math.floor(num(d.artifactLevels?.[a.id], 0)));
        return a.maxLevel > 0 ? Math.min(a.maxLevel, lvl) : lvl;
      });
      // 스킬/부스트 시계 클램프: 기기 시계 롤백이 쿨다운을 무기한 잠그거나
      // 버프를 장시간 유지하지 못하게, 정상 상한(now + cooldown/duration)으로 자른다
      this.skillReadyAt = SKILLS.map(
        (s) => Math.min(Math.max(0, num(d.skillReadyAt?.[s.id], 0)), now + s.cooldown),
      );
      this.skillActiveUntil = SKILLS.map(
        (s) => Math.min(Math.max(0, num(d.skillActiveUntil?.[s.id], 0)), now + s.duration * 2),
      );
      this.goldBoostUntil = Math.min(
        Math.max(0, num(d.goldBoostUntil, 0)), now + AD_GOLD_BOOST_DURATION,
      );
      // 장비 (v2 이하 세이브에는 없음)
      this.equipment = EQUIP_SLOTS.map((s) => {
        const e = d.equipment?.[s.id];
        if (!e || typeof e !== 'object') return null;
        const rarity = Math.min(RARITIES.length - 1, Math.max(0, Math.floor(num(e.rarity, 0))));
        return {
          slot: s.id,
          rarity,
          statPct: Math.min(300, Math.max(0, num(e.statPct, 0))),
          stage: Math.max(1, Math.floor(num(e.stage, 1))),
        };
      });
      // 일일 퀘스트 (날짜 다르면 리셋)
      const dd = d.daily;
      if (dd && typeof dd.date === 'string' && dd.date === todayStr()) {
        this.daily = {
          date: dd.date,
          counters: {
            kills: Math.max(0, Math.floor(num(dd.counters?.kills, 0))),
            bossKills: Math.max(0, Math.floor(num(dd.counters?.bossKills, 0))),
            skillUses: Math.max(0, Math.floor(num(dd.counters?.skillUses, 0))),
          },
          claimed: DAILY_QUESTS.map((q) => dd.claimed?.[q.id] === true),
        };
      } else {
        this.daily = freshDaily();
      }
      this.lifetime = {
        taps: Math.max(0, Math.floor(num(d.lifetime?.taps, 0))),
        kills: Math.max(0, Math.floor(num(d.lifetime?.kills, 0))),
        bossKills: Math.max(0, Math.floor(num(d.lifetime?.bossKills, 0))),
        prestiges: Math.max(0, Math.floor(num(d.lifetime?.prestiges, 0))),
        equipDrops: Math.max(0, Math.floor(num(d.lifetime?.equipDrops, 0))),
      };
      this.achClaimed = ACHIEVEMENTS.map((a) => d.achClaimed?.[a.id] === true);
      this.petLevels = PETS.map((pt) => Math.max(0, Math.floor(num(d.petLevels?.[pt.id], 0))));
      this.treeLevels = SKILL_TREE.map((n) => Math.min(
        n.maxLevel, Math.max(0, Math.floor(num(d.treeLevels?.[n.id], 0))),
      ));
      this.playerName = typeof d.playerName === 'string' ? d.playerName.slice(0, 12) : '';
      this.bossFailed = d.bossFailed === true;
      // 보스전 도중 저장이었다면 파밍부터 재개
      this.mode = 'farm';
      this.stageEnteredAt = now;
      // lastSeen 이 미래(시계 롤백)면 오프라인 보상 없음
      const away = (now - Math.min(num(d.lastSeen, now), now)) / 1000;
      return away > 60 ? Math.min(away, OFFLINE_CAP_SEC) : 0;
    } catch {
      return 0;
    }
  }

  /** 오프라인 보상 골드 계산 (지급은 호출측에서) */
  offlineGold(awaySec: number): number {
    return Math.floor(this.totalDps() * awaySec * this.offlineRate() * this.goldMult());
  }

  static hasSave(): boolean {
    try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
  }

  static wipe(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

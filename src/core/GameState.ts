// ---------------------------------------------------------------------------
// 중앙 게임 상태. 렌더링과 완전히 분리된 순수 로직 계층.
// 변경 시 이벤트를 발행하고, Scene 들은 구독만 한다.
//
// events:
//   'gold'          (gold: number)               골드 변경
//   'stage'         (stage, kills)               스테이지/처치수 변경
//   'mode'          (mode: Mode)                 farm <-> boss 전환
//   'upgrade'                                    탭/영웅/유물 레벨 변경
//   'skill'         (id: number)                 스킬 발동
//   'prestige'      (relics: number)             환생 완료
// ---------------------------------------------------------------------------
import {
  HEROES, SKILLS, ARTIFACTS, MONSTERS_PER_STAGE, PRESTIGE_MIN_STAGE,
  OFFLINE_CAP_SEC, OFFLINE_RATE, BOSS_TIME_LIMIT,
  BASE_CRIT_CHANCE, BASE_CRIT_MULT,
  SKILL_TAP_MULT, SKILL_DPS_MULT, SKILL_GOLD_MULT,
  ARTIFACT_TAP_PER_LVL, ARTIFACT_DPS_PER_LVL, ARTIFACT_GOLD_PER_LVL,
  ARTIFACT_CRIT_CHANCE_PER_LVL, ARTIFACT_CRIT_MULT_PER_LVL, ARTIFACT_BOSS_TIME_PER_LVL,
  tapDamageAt, tapCost, heroCost, heroDps, killGold, relicsFor, artifactCost,
} from '../config';

export type Mode = 'farm' | 'boss';

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
  playerName = '';
  mode: Mode = 'farm';
  bossFailed = false;
  /** 마지막 세이브 시각 — 오프라인 보상 계산용 */
  lastSeen = Date.now();
  /** 세이브 세대. 다른 탭이 더 새 세대를 쓰면 이 인스턴스는 stale 이 되어 저장을 멈춘다 */
  private gen = 0;
  private stale = false;

  static readonly SAVE_KEY = SAVE_KEY;

  isStale(): boolean { return this.stale; }

  /** 다른 탭의 저장을 감지했을 때 호출 (storage 이벤트) */
  checkExternalWrite(raw: string | null): void {
    if (!raw) return;
    try {
      const g = (JSON.parse(raw) as SaveData).gen;
      if (typeof g === 'number' && g > this.gen) this.stale = true;
    } catch { /* ignore */ }
  }

  // --- 파생 값 ------------------------------------------------------------

  private artifactMult(perLvl: number, id: number): number {
    return 1 + this.artifactLevels[id] * perLvl;
  }

  tapDamage(): number {
    let dmg = tapDamageAt(this.tapLevel) * this.artifactMult(ARTIFACT_TAP_PER_LVL, 0);
    if (this.isSkillActive(0)) dmg *= SKILL_TAP_MULT;
    return Math.max(1, Math.round(dmg));
  }

  totalDps(): number {
    let dps = 0;
    for (const h of HEROES) dps += heroDps(h, this.heroLevels[h.id]);
    dps *= this.artifactMult(ARTIFACT_DPS_PER_LVL, 1);
    if (this.isSkillActive(1)) dps *= SKILL_DPS_MULT;
    return dps;
  }

  goldMult(): number {
    let m = this.artifactMult(ARTIFACT_GOLD_PER_LVL, 2);
    if (this.isSkillActive(2)) m *= SKILL_GOLD_MULT;
    return m;
  }

  critChance(): number {
    return Math.min(0.5, BASE_CRIT_CHANCE + this.artifactLevels[3] * ARTIFACT_CRIT_CHANCE_PER_LVL);
  }

  critMult(): number {
    return BASE_CRIT_MULT + this.artifactLevels[4] * ARTIFACT_CRIT_MULT_PER_LVL;
  }

  bossTimeLimit(): number {
    return BOSS_TIME_LIMIT + this.artifactLevels[5] * ARTIFACT_BOSS_TIME_PER_LVL;
  }

  tapCost(): number { return tapCost(this.tapLevel); }
  heroCost(id: number): number { return heroCost(HEROES[id], this.heroLevels[id]); }
  heroDps(id: number): number {
    return heroDps(HEROES[id], this.heroLevels[id])
      * this.artifactMult(ARTIFACT_DPS_PER_LVL, 1)
      * (this.isSkillActive(1) ? SKILL_DPS_MULT : 1);
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
    this.skillActiveUntil[id] = now + def.duration;
    this.skillReadyAt[id] = now + def.cooldown;
    this.emit('skill', id);
    this.emit('upgrade'); // DPS/탭뎀 표기 갱신
    return true;
  }

  // --- 전투 진행 -----------------------------------------------------------

  /** 몬스터 처치 처리. 골드 지급 + 진행/보스 전환. */
  recordKill(isBoss: boolean): void {
    this.addGold(Math.round(killGold(this.stage, isBoss) * this.goldMult()));
    if (isBoss) {
      this.stage += 1;
      this.maxStage = Math.max(this.maxStage, this.stage);
      this.kills = 0;
      this.bossFailed = false;
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

  // --- 업그레이드 ----------------------------------------------------------

  tryBuyTap(): boolean {
    const cost = this.tapCost();
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.tapLevel += 1;
    this.emit('gold', this.gold);
    this.emit('upgrade');
    return true;
  }

  tryBuyHero(id: number): boolean {
    const cost = this.heroCost(id);
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.heroLevels[id] += 1;
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
    this.emit('upgrade');
    return true;
  }

  // --- 환생 ----------------------------------------------------------------

  doPrestige(): boolean {
    if (!this.canPrestige()) return false;
    const gain = this.prestigeGain();
    this.gold = 0;
    this.stage = 1;
    this.kills = 0;
    this.tapLevel = 0;
    this.heroLevels = HEROES.map(() => 0);
    this.relics += gain;
    this.relicsEarned = this.prestigeRelics();
    this.bossFailed = false;
    this.mode = 'farm';
    // 유물(artifactLevels)·스킬 쿨다운·이름은 유지
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
      v: 2,
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
      // 스킬 시계 클램프: 기기 시계 롤백이 쿨다운을 무기한 잠그거나
      // 버프를 장시간 유지하지 못하게, 정상 상한(now + cooldown/duration)으로 자른다
      this.skillReadyAt = SKILLS.map(
        (s) => Math.min(Math.max(0, num(d.skillReadyAt?.[s.id], 0)), now + s.cooldown),
      );
      this.skillActiveUntil = SKILLS.map(
        (s) => Math.min(Math.max(0, num(d.skillActiveUntil?.[s.id], 0)), now + s.duration),
      );
      this.playerName = typeof d.playerName === 'string' ? d.playerName.slice(0, 12) : '';
      this.bossFailed = d.bossFailed === true;
      // 보스전 도중 저장이었다면 파밍부터 재개
      this.mode = 'farm';
      // lastSeen 이 미래(시계 롤백)면 오프라인 보상 없음
      const away = (now - Math.min(num(d.lastSeen, now), now)) / 1000;
      return away > 60 ? Math.min(away, OFFLINE_CAP_SEC) : 0;
    } catch {
      return 0;
    }
  }

  /** 오프라인 보상 골드 계산 (지급은 호출측에서) */
  offlineGold(awaySec: number): number {
    return Math.floor(this.totalDps() * awaySec * OFFLINE_RATE * this.goldMult());
  }

  static hasSave(): boolean {
    try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
  }

  static wipe(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

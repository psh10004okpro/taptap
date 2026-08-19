// ---------------------------------------------------------------------------
// 중앙 게임 상태. 렌더링과 완전히 분리된 순수 로직 계층.
// 변경 시 이벤트를 발행하고, Scene 들은 구독만 한다.
//
// events:
//   'gold'          (gold: number)               골드 변경
//   'stage'         (stage, kills)               스테이지/처치수 변경
//   'mode'          (mode: Mode)                 farm <-> boss 전환
//   'upgrade'                                    탭/영웅 레벨 변경
//   'prestige'      (relics: number)             환생 완료
// ---------------------------------------------------------------------------
import {
  HEROES, MONSTERS_PER_STAGE, PRESTIGE_MIN_STAGE,
  OFFLINE_CAP_SEC, OFFLINE_RATE,
  tapDamageAt, tapCost, heroCost, heroDps, killGold, relicsFor, relicMult,
} from '../config';

export type Mode = 'farm' | 'boss';

interface SaveData {
  v: number;
  gold: number;
  stage: number;
  kills: number;
  maxStage: number;
  tapLevel: number;
  heroLevels: number[];
  relics: number;
  bossFailed: boolean;
  lastSeen: number;
}

const SAVE_KEY = 'taptap-titans-v1';

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
  relics = 0;
  mode: Mode = 'farm';
  bossFailed = false;
  /** 마지막 세이브 시각 — 오프라인 보상 계산용 */
  lastSeen = Date.now();

  // --- 파생 값 ------------------------------------------------------------

  tapDamage(): number {
    return Math.round(tapDamageAt(this.tapLevel) * relicMult(this.relics));
  }

  totalDps(): number {
    let dps = 0;
    for (const h of HEROES) dps += heroDps(h, this.heroLevels[h.id]);
    return dps * relicMult(this.relics);
  }

  tapCost(): number { return tapCost(this.tapLevel); }
  heroCost(id: number): number { return heroCost(HEROES[id], this.heroLevels[id]); }
  heroDps(id: number): number {
    return heroDps(HEROES[id], this.heroLevels[id]) * relicMult(this.relics);
  }

  prestigeRelics(): number { return relicsFor(this.maxStage); }
  canPrestige(): boolean {
    return this.maxStage >= PRESTIGE_MIN_STAGE && this.prestigeRelics() > this.relics;
  }

  // --- 전투 진행 -----------------------------------------------------------

  /** 몬스터 처치 처리. 골드 지급 + 진행/보스 전환. */
  recordKill(isBoss: boolean): void {
    this.addGold(killGold(this.stage, isBoss));
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

  // --- 환생 ----------------------------------------------------------------

  doPrestige(): boolean {
    if (!this.canPrestige()) return false;
    const relics = this.prestigeRelics();
    this.gold = 0;
    this.stage = 1;
    this.kills = 0;
    this.tapLevel = 0;
    this.heroLevels = HEROES.map(() => 0);
    this.relics = relics;
    this.bossFailed = false;
    this.mode = 'farm';
    this.save();
    this.emit('prestige', relics);
    this.emit('gold', this.gold);
    this.emit('stage', this.stage, this.kills);
    this.emit('upgrade');
    this.emit('mode', this.mode);
    return true;
  }

  // --- 저장/로드 -----------------------------------------------------------

  save(): void {
    this.lastSeen = Date.now();
    const data: SaveData = {
      v: 1,
      gold: this.gold,
      stage: this.stage,
      kills: this.kills,
      maxStage: this.maxStage,
      tapLevel: this.tapLevel,
      heroLevels: this.heroLevels,
      relics: this.relics,
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
      this.gold = d.gold ?? 0;
      this.stage = Math.max(1, d.stage ?? 1);
      this.kills = d.kills ?? 0;
      this.maxStage = Math.max(this.stage, d.maxStage ?? 1);
      this.tapLevel = d.tapLevel ?? 0;
      this.heroLevels = HEROES.map((h) => d.heroLevels?.[h.id] ?? 0);
      this.relics = d.relics ?? 0;
      this.bossFailed = d.bossFailed ?? false;
      // 보스전 도중 저장이었다면 파밍부터 재개
      this.mode = 'farm';
      const away = (Date.now() - (d.lastSeen ?? Date.now())) / 1000;
      return away > 60 ? Math.min(away, OFFLINE_CAP_SEC) : 0;
    } catch {
      return 0;
    }
  }

  /** 오프라인 보상 골드 계산 (지급은 호출측에서) */
  offlineGold(awaySec: number): number {
    return Math.floor(this.totalDps() * awaySec * OFFLINE_RATE);
  }

  static hasSave(): boolean {
    try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
  }

  static wipe(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

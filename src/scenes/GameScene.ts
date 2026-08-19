// ---------------------------------------------------------------------------
// GameScene: 전투 필드. 몬스터 스폰/탭 데미지/DPS 틱/보스 타이머.
// UIScene 과는 game.events 버스로 통신한다.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  COMBAT_CENTER, TOP_BAR_H, COMBAT_BOTTOM,
  SHADOW_CLONE_TAPS_PER_SEC, HEAVENLY_STRIKE_MULT, SKILLS, FLOAT_ICON, FAIRY,
  COLLAPSED, GROUND_Y, GAME_HEIGHT,
  monsterHp, zoneFor,
} from '../config.ts';
import { GameState } from '../core/GameState.ts';
import { fmt } from '../core/format.ts';
import { Sfx } from '../sfx.ts';
import { Haptics } from '../haptics.ts';

const FLOAT_POOL = 24;
const COIN_POOL = 16;

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private monster!: Phaser.GameObjects.Image;
  private monsterShadow!: Phaser.GameObjects.Ellipse;
  private nameText!: Phaser.GameObjects.Text;
  private hpFill!: Phaser.GameObjects.Image;
  private hpText!: Phaser.GameObjects.Text;

  private hp = 1;
  private hpMax = 1;
  private dead = false;
  private isBoss = false;
  private bossDeadline = 0;
  private bossLimit = 1;   // 이번 보스전의 제한시간 (유물 반영, 스폰 시 고정)
  private cloneTick = 0;   // 분신술 자동 탭 타이밍
  private baseScale = 1;   // 현재 몬스터의 기준 스케일 (반동 트윈 누적 방지)
  private zoneOverlay!: Phaser.GameObjects.Rectangle;
  private bgImage!: Phaser.GameObjects.Image;
  private spawnTimer: Phaser.Time.TimerEvent | null = null; // 스폰 예약 단일화

  private killFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fairy!: Phaser.GameObjects.Image;
  private fairyTimer: Phaser.Time.TimerEvent | null = null;
  private groundPlate!: Phaser.GameObjects.Ellipse;
  private tapZone!: Phaser.GameObjects.Zone;
  /** UI 접힘 여부 — 전투 화면을 아래까지 넓게 쓴다 */
  private collapsed = false;
  private floatPool: Phaser.GameObjects.Text[] = [];
  private floatIdx = 0;
  private coinPool: Phaser.GameObjects.Image[] = [];
  private coinIdx = 0;
  private dpsCarry = 0; // 0.5초마다 모아서 표시하는 DPS 누적치

  constructor() { super('Game'); }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    this.bgImage = this.add.image(0, 0, 'bg').setOrigin(0, 0).setDisplaySize(720, GAME_HEIGHT);
    // 존 테마 오버레이 (스폰 시 존 색으로 갱신)
    this.zoneOverlay = this.add.rectangle(0, 0, 720, GAME_HEIGHT, 0x000000, 0.18).setOrigin(0, 0);

    // 발밑 단상 + 그림자 (배경 텍스처가 아니라 여기 — 접기 시 함께 내려간다)
    this.groundPlate = this.add.ellipse(COMBAT_CENTER.x, GROUND_Y, 460, 70, 0x413060, 1);
    this.monsterShadow = this.add.ellipse(COMBAT_CENTER.x, GROUND_Y + 4, 190, 40, 0x000000, 0.35);
    this.monster = this.add.image(COMBAT_CENTER.x, COMBAT_CENTER.y, 'monster0').setOrigin(0.5, 0.78);

    // 처치 파티클 — 이미터 1개 재사용 (풀 규칙: 매 처치마다 생성 금지)
    this.killFx = this.add.particles(0, 0, 'spark', {
      speed: { min: 130, max: 340 },
      angle: { min: 200, max: 340 },
      gravityY: 750,
      lifespan: { min: 280, max: 560 },
      scale: { start: 1.1, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xffe08a, 0xffb020, 0xffffff],
      emitting: false,
    }).setDepth(18);

    // HP 바 + 이름
    this.nameText = this.add.text(COMBAT_CENTER.x, TOP_BAR_H + 26, '', {
      fontFamily: 'Trebuchet MS, Malgun Gothic, sans-serif',
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#22182f', strokeThickness: 5,
    }).setOrigin(0.5);
    this.add.image(COMBAT_CENTER.x, TOP_BAR_H + 66, 'hpbar-bg');
    this.hpFill = this.add.image(COMBAT_CENTER.x - 165, TOP_BAR_H + 66, 'hpbar-fill').setOrigin(0, 0.5);
    this.hpText = this.add.text(COMBAT_CENTER.x, TOP_BAR_H + 66, '', {
      fontFamily: 'Trebuchet MS, Malgun Gothic, sans-serif',
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#22182f', strokeThickness: 3,
    }).setOrigin(0.5);

    // 풀 준비
    for (let i = 0; i < FLOAT_POOL; i++) {
      this.floatPool.push(this.add.text(0, 0, '', {
        fontFamily: 'Trebuchet MS, Malgun Gothic, sans-serif',
        fontSize: '34px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#22182f', strokeThickness: 5,
      }).setOrigin(0.5).setVisible(false).setDepth(20));
    }
    for (let i = 0; i < COIN_POOL; i++) {
      this.coinPool.push(this.add.image(0, 0, 'coin').setVisible(false).setDepth(19));
    }

    // 탭 입력: 전투 영역만 (스킬바 위쪽 — UI 탭이 공격으로 새지 않게)
    this.tapZone = this.add.zone(0, TOP_BAR_H, 720, COMBAT_BOTTOM - TOP_BAR_H)
      .setOrigin(0, 0).setInteractive();
    this.tapZone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));

    // 요정: 광고 보상 캐리어. UIScene 이 'fairy-tap' 을 받아 광고를 제안한다.
    this.fairy = this.add.image(-100, 300, 'fairy').setDepth(30).setVisible(false);
    this.fairy.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!this.fairy.visible) return;
      if (this.registry.get('uiBlocking') === true) return;   // 모달 위 — UIScene 우선
      if (this.isReservedUi(this.fairy.x, this.fairy.y)) return; // 아이콘과 겹친 순간 — 아이콘 우선
      this.hideFairy();
      this.game.events.emit('fairy-tap');
      this.scheduleFairy(Phaser.Math.Between(FAIRY.minMs, FAIRY.maxMs));
    });
    this.scheduleFairy(FAIRY.firstMs);
    // QA/E2E: 요정 즉시 소환 (DevTools.spawnFairy 경유)
    this.game.events.on('fairy-force', this.flyFairy, this);
    // UI 접기: UIScene 이 알려주면 전투 화면을 아래까지 넓힌다
    this.game.events.on('ui-collapse', this.setCollapsed, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.fairyTimer?.remove(false);
      this.fairyTimer = null;
      this.game.events.off('fairy-force', this.flyFairy, this);
      this.game.events.off('ui-collapse', this.setCollapsed, this);
    });
    this.setCollapsed(this.registry.get('uiCollapsed') === true);

    // DPS 틱 (10Hz)
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.dpsTick() });

    // UI → 보스 도전
    this.game.events.on('engage-boss', this.onEngageBoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('engage-boss', this.onEngageBoss, this);
    });

    // 환생 시 몬스터 리셋
    this.state.on('prestige', () => { this.spawnTimer?.remove(false); this.spawnTimer = null; this.spawn(); });

    // 스킬 발동 연출 + 천상의 일격 즉발 대미지 (스킬트리 강화 반영)
    this.state.on('skill', (...args: unknown[]) => {
      const id = args[0] as number;
      if (id !== 4) {
        const c = Phaser.Display.Color.ValueToColor(SKILLS[id]?.color ?? 0xffffff);
        this.cameras.main.flash(130, c.red, c.green, c.blue);
      }
      if (args[0] !== 4 || this.dead) return;
      const dmg = Math.round(
        this.state.tapDamage() * HEAVENLY_STRIKE_MULT * this.state.skillPowerMult(),
      );
      this.cameras.main.flash(180, 255, 240, 160);
      this.applyDamage(dmg, true, COMBAT_CENTER.x, this.combatY() - 180);
    });

    this.spawn();
  }

  // --- 레이아웃 (UI 접기) ---------------------------------------------------

  /** 현재 레이아웃의 몬스터 중심 y */
  private combatY(): number {
    return this.collapsed ? COLLAPSED.monsterY : COMBAT_CENTER.y;
  }

  /** 현재 레이아웃의 전투 스케일 */
  private viewScale(): number {
    return this.collapsed ? COLLAPSED.monsterScale : 1;
  }

  /** 현재 레이아웃의 전투 탭 존 하한 */
  private combatBottom(): number {
    return this.collapsed ? COLLAPSED.combatBottom : COMBAT_BOTTOM;
  }

  /**
   * UI 접기 전환. 하단 패널이 사라진 만큼 몬스터/단상을 내리고 키워
   * 배경과 몬스터를 넓게 보여준다. 배경 텍스처는 이미 화면 전체 높이다.
   */
  private setCollapsed(on: boolean): void {
    this.collapsed = on;
    const s = this.viewScale();
    const gy = on ? COLLAPSED.groundY : GROUND_Y;
    this.tapZone.setSize(720, this.combatBottom() - TOP_BAR_H, true);
    this.groundPlate.setPosition(COMBAT_CENTER.x, gy).setScale(s);
    this.monsterShadow.setPosition(COMBAT_CENTER.x, gy + 4 * s)
      .setScale((this.isBoss ? 1.4 : 1) * s);
    this.baseScale = (this.isBoss ? 1.25 : 1) * s;
    this.tweens.killTweensOf(this.monster);
    this.monster.setPosition(COMBAT_CENTER.x, this.combatY()).setScale(this.baseScale);
  }

  // --- 요정 (보상형 광고) ---------------------------------------------------

  private scheduleFairy(delay: number): void {
    this.fairyTimer?.remove(false);
    this.fairyTimer = this.time.delayedCall(delay, () => {
      this.fairyTimer = null;
      this.flyFairy();
    });
  }

  /** 전투 영역을 좌→우(또는 우→좌)로 가로지르며 상하로 흔들린다 */
  private flyFairy(): void {
    const leftToRight = Math.random() < 0.5;
    const y = Phaser.Math.Between(TOP_BAR_H + 110, this.combatBottom() - 80);
    const from = leftToRight ? -60 : 780;
    const to = leftToRight ? 780 : -60;
    this.fairy.setPosition(from, y).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.fairy);
    this.tweens.add({
      targets: this.fairy, x: to, duration: FAIRY.crossMs, ease: 'Sine.InOut',
      onComplete: () => {
        this.hideFairy();
        this.scheduleFairy(Phaser.Math.Between(FAIRY.minMs, FAIRY.maxMs));
      },
    });
    this.tweens.add({
      targets: this.fairy, y: y + 46, duration: 900,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  private hideFairy(): void {
    this.tweens.killTweensOf(this.fairy);
    this.fairy.setVisible(false).setPosition(-100, 300);
  }

  /** 전투 탭이 좌측 플로팅 아이콘(UIScene) 영역으로 새지 않게 — 씬이 달라 입력이 겹친다 */
  private isReservedUi(x: number, y: number): boolean {
    for (let i = 0; i < FLOAT_ICON.count; i++) {
      const cy = FLOAT_ICON.y0 + i * FLOAT_ICON.gap;
      if (Math.abs(x - FLOAT_ICON.x) <= FLOAT_ICON.r && Math.abs(y - cy) <= FLOAT_ICON.r) {
        return true;
      }
    }
    return false;
  }

  // --- 스폰 ---------------------------------------------------------------

  /** 스폰 예약 단일 창구 — 기존 예약을 취소해 이중 스폰(보스 HP/타이머 리셋)을 막는다 */
  private scheduleSpawn(delay: number): void {
    this.spawnTimer?.remove(false);
    this.spawnTimer = this.time.delayedCall(delay, () => {
      this.spawnTimer = null;
      this.spawn();
    });
  }

  private spawn(): void {
    const st = this.state;
    this.isBoss = st.mode === 'boss';
    const base = monsterHp(st.stage, this.isBoss);
    this.hpMax = Math.max(1, Math.round(
      this.isBoss ? base : base * Phaser.Math.FloatBetween(0.85, 1.15),
    ));
    this.hp = this.hpMax;
    this.dead = false;

    const zone = zoneFor(st.stage);
    // 존별 생성 아트 배경이 있으면 교체하고 틴트는 옅게, 없으면 공용 bg + 진한 틴트
    const bgKey = 'bg-zone' + zone.id;
    if (this.textures.exists(bgKey)) {
      if (this.bgImage.texture.key !== bgKey) {
        this.bgImage.setTexture(bgKey).setDisplaySize(720, GAME_HEIGHT);
      }
      this.zoneOverlay.setFillStyle(zone.tint, 0.08);
    } else {
      this.zoneOverlay.setFillStyle(zone.tint, 0.22);
    }
    if (this.isBoss) {
      Sfx.play('bossSpawn');
      // 보스 등장 연출: 흔들림 + 붉은 섬광 + 이름 펀치
      this.cameras.main.shake(200, 0.006);
      this.cameras.main.flash(150, 110, 20, 30);
      this.monster.setTexture('boss');
      this.nameText.setText(zone.bossName).setColor('#ff9c9c').setScale(1.4);
      this.tweens.add({ targets: this.nameText, scale: 1, duration: 260, ease: 'Back.Out' });
      this.bossLimit = st.bossTimeLimit();
      this.bossDeadline = this.time.now + this.bossLimit;
    } else {
      const slot = (st.stage * 7 + st.kills * 3) % zone.monsters.length;
      this.monster.setTexture('monster' + zone.monsters[slot]);
      this.nameText.setText(zone.monsterNames[slot]).setColor('#ffffff').setScale(1);
      this.bossDeadline = 0;
      this.game.events.emit('boss-timer', -1);
    }

    const targetScale = (this.isBoss ? 1.25 : 1) * this.viewScale();
    this.baseScale = targetScale;
    this.tweens.killTweensOf(this.monster);
    this.monster.setPosition(COMBAT_CENTER.x, this.combatY()).setAlpha(0).setScale(targetScale * 0.6);
    this.monsterShadow.setScale((this.isBoss ? 1.4 : 1) * this.viewScale());
    this.tweens.add({
      targets: this.monster, alpha: 1, scale: targetScale,
      duration: 200, ease: 'Back.Out',
    });
    this.updateHpBar();
  }

  // --- 데미지 -------------------------------------------------------------

  private onTap(x: number, y: number): void {
    // UIScene 의 모달/오버레이·플로팅 아이콘은 씬이 달라 이 존을 가리지 못한다
    if (this.registry.get('uiBlocking') === true) return;
    if (this.isReservedUi(x, y)) return;
    // 탭 파문
    const ring = this.add.image(x, y, 'ring').setDepth(25).setScale(0.4);
    this.tweens.add({
      targets: ring, scale: 1.1, alpha: 0, duration: 260,
      onComplete: () => ring.destroy(),
    });
    this.state.recordTap(); // 업적 통계 (빗나간 탭 포함 — 사람의 입력 기준)
    if (this.dead) return;

    const crit = Math.random() < this.state.critChance();
    Sfx.play(crit ? 'crit' : 'tap');
    if (crit) this.cameras.main.shake(70, 0.004);
    const dmg = Math.round(this.state.tapDamage() * (crit ? this.state.critMult() : 1));
    this.applyDamage(dmg, crit, x, Math.min(y, this.combatBottom() - 60));
    // 몬스터 반동 — 기준 스케일 대비 절대값으로, 연타 시 누적 수축 방지
    this.tweens.killTweensOf(this.monster);
    this.monster.setScale(this.baseScale);
    this.tweens.add({
      targets: this.monster, scaleX: this.baseScale * 0.94, scaleY: this.baseScale * 1.05,
      duration: 45, yoyo: true,
      onComplete: () => { if (!this.dead) this.monster.setScale(this.baseScale); },
    });
  }

  private dpsTick(): void {
    // 보스 타이머 갱신
    if (this.isBoss && !this.dead && this.bossDeadline > 0) {
      const remain = this.bossDeadline - this.time.now;
      this.game.events.emit('boss-timer', Math.max(0, remain / this.bossLimit));
      if (remain <= 0) return this.bossEscape();
    }
    if (this.dead) return;

    // 분신술: 10Hz 틱에서 초당 SHADOW_CLONE_TAPS_PER_SEC 회 자동 탭
    if (this.state.isSkillActive(3)) {
      this.cloneTick += 1;
      if (this.cloneTick >= Math.max(1, Math.round(10 / SHADOW_CLONE_TAPS_PER_SEC))) {
        this.cloneTick = 0;
        const crit = Math.random() < this.state.critChance();
        const dmg = Math.round(
          this.state.tapDamage() * (crit ? this.state.critMult() : 1) * this.state.skillPowerMult(),
        );
        this.applyDamage(
          dmg, crit,
          COMBAT_CENTER.x + Phaser.Math.Between(-70, 70),
          this.combatY() - Phaser.Math.Between(60, 160),
        );
        if (this.dead) return;
      }
    }

    const dps = this.state.totalDps();
    if (dps <= 0) return;

    const tick = dps / 10;
    this.dpsCarry += tick;
    this.hp -= tick;
    if (this.dpsCarry >= dps / 2) { // 0.5초 단위로만 숫자 표시 (스팸 방지)
      this.showFloat(
        Phaser.Math.Between(COMBAT_CENTER.x - 90, COMBAT_CENTER.x + 90),
        Phaser.Math.Between(this.combatY() - 200, this.combatY() - 120),
        fmt(Math.round(this.dpsCarry)), '#9fd8ff', 30,
      );
      this.dpsCarry = 0;
    }
    this.updateHpBar();
    if (this.hp <= 0) this.kill();
  }

  private applyDamage(dmg: number, crit: boolean, x: number, y: number): void {
    this.hp -= dmg;
    this.showFloat(
      x + Phaser.Math.Between(-20, 20), y - 30,
      fmt(dmg), crit ? '#ffb020' : '#ffffff', crit ? 46 : 34,
    );
    this.updateHpBar();
    if (this.hp <= 0) this.kill();
  }

  private updateHpBar(): void {
    const ratio = Phaser.Math.Clamp(this.hp / this.hpMax, 0, 1);
    this.hpFill.setScale(Math.max(0.001, ratio), 1);
    this.hpText.setText(`${fmt(Math.max(0, Math.ceil(this.hp)))} / ${fmt(this.hpMax)}`);
  }

  // --- 처치/도주 ----------------------------------------------------------

  private kill(): void {
    if (this.dead) return;
    this.dead = true;
    const wasBoss = this.isBoss;
    Sfx.play(wasBoss ? 'bossWin' : 'kill');
    Sfx.play('coin');
    if (wasBoss) {
      Haptics.buzz(40);
      this.cameras.main.shake(220, 0.012);
      this.game.events.emit('boss-timer', -1);
    }
    this.burstCoins(wasBoss ? 8 : 4);
    this.killFx.explode(wasBoss ? 26 : 12, this.monster.x, this.monster.y - 60);
    this.tweens.killTweensOf(this.monster);
    this.tweens.add({
      targets: this.monster, alpha: 0, scaleY: this.baseScale * 0.3,
      scaleX: this.baseScale * 1.25, duration: 180, ease: 'Quad.In',
    });
    this.state.recordKill(wasBoss); // 골드 지급 + 모드 전환
    this.scheduleSpawn(260);
  }

  /** 보스 시간 초과 → 도주 */
  private bossEscape(): void {
    if (this.dead) return;
    this.dead = true;
    Sfx.play('bossFail');
    this.game.events.emit('boss-timer', -1);
    this.tweens.add({
      targets: this.monster, x: 900, alpha: 0, duration: 320, ease: 'Quad.In',
    });
    this.state.failBoss();
    this.scheduleSpawn(360);
  }

  private onEngageBoss(): void {
    if (!this.state.engageBoss()) return;
    this.dead = true; // 현재 일반 몬스터 즉시 교체
    this.tweens.killTweensOf(this.monster);
    this.tweens.add({ targets: this.monster, alpha: 0, duration: 120 });
    this.scheduleSpawn(140);
  }

  // --- 이펙트 -------------------------------------------------------------

  private showFloat(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.floatPool[this.floatIdx];
    this.floatIdx = (this.floatIdx + 1) % FLOAT_POOL;
    this.tweens.killTweensOf(t);
    t.setText(text).setColor(color).setFontSize(size)
      .setPosition(x, y).setAlpha(1).setVisible(true).setScale(1);
    this.tweens.add({
      targets: t, y: y - 90, alpha: 0, duration: 700, ease: 'Quad.Out',
      onComplete: () => t.setVisible(false),
    });
  }

  private burstCoins(n: number): void {
    for (let i = 0; i < n; i++) {
      const c = this.coinPool[this.coinIdx];
      this.coinIdx = (this.coinIdx + 1) % COIN_POOL;
      this.tweens.killTweensOf(c);
      const sx = COMBAT_CENTER.x + Phaser.Math.Between(-60, 60);
      const sy = COMBAT_CENTER.y - 40;
      c.setPosition(sx, sy).setVisible(true).setAlpha(1).setScale(1);
      // 위로 튀었다가 골드 카운터(좌상단)로 흡수
      this.tweens.add({
        targets: c,
        x: sx + Phaser.Math.Between(-70, 70),
        y: sy - Phaser.Math.Between(60, 140),
        duration: 200, ease: 'Quad.Out', delay: i * 30,
        onComplete: () => {
          this.tweens.add({
            targets: c, x: 46, y: 46, alpha: 0.4, scale: 0.6,
            duration: 340, ease: 'Quad.In',
            onComplete: () => c.setVisible(false),
          });
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// GameScene: 전투 필드. 몬스터 스폰/탭 데미지/DPS 틱/보스 타이머.
// UIScene 과는 game.events 버스로 통신한다.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  COMBAT_CENTER, PANEL_Y, TOP_BAR_H, COMBAT_BOTTOM,
  SHADOW_CLONE_TAPS_PER_SEC, HEAVENLY_STRIKE_MULT, SKILLS, monsterHp, zoneFor,
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
  private floatPool: Phaser.GameObjects.Text[] = [];
  private floatIdx = 0;
  private coinPool: Phaser.GameObjects.Image[] = [];
  private coinIdx = 0;
  private dpsCarry = 0; // 0.5초마다 모아서 표시하는 DPS 누적치

  constructor() { super('Game'); }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    this.bgImage = this.add.image(0, 0, 'bg').setOrigin(0, 0);
    // 존 테마 오버레이 (스폰 시 존 색으로 갱신)
    this.zoneOverlay = this.add.rectangle(0, 0, 720, PANEL_Y, 0x000000, 0.18).setOrigin(0, 0);

    this.monsterShadow = this.add.ellipse(COMBAT_CENTER.x, 592, 190, 40, 0x000000, 0.35);
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
    const zone = this.add.zone(0, TOP_BAR_H, 720, COMBAT_BOTTOM - TOP_BAR_H)
      .setOrigin(0, 0).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));

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
      this.applyDamage(dmg, true, COMBAT_CENTER.x, COMBAT_CENTER.y - 180);
    });

    this.spawn();
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
        this.bgImage.setTexture(bgKey).setDisplaySize(720, PANEL_Y);
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

    const targetScale = this.isBoss ? 1.25 : 1;
    this.baseScale = targetScale;
    this.tweens.killTweensOf(this.monster);
    this.monster.setPosition(COMBAT_CENTER.x, COMBAT_CENTER.y).setAlpha(0).setScale(targetScale * 0.6);
    this.monsterShadow.setScale(this.isBoss ? 1.4 : 1);
    this.tweens.add({
      targets: this.monster, alpha: 1, scale: targetScale,
      duration: 200, ease: 'Back.Out',
    });
    this.updateHpBar();
  }

  // --- 데미지 -------------------------------------------------------------

  private onTap(x: number, y: number): void {
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
    this.applyDamage(dmg, crit, x, Math.min(y, PANEL_Y - 120));
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
          COMBAT_CENTER.y - Phaser.Math.Between(60, 160),
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
        Phaser.Math.Between(COMBAT_CENTER.y - 200, COMBAT_CENTER.y - 120),
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

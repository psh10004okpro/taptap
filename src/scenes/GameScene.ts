// ---------------------------------------------------------------------------
// GameScene: 전투 필드. 몬스터 스폰/탭 데미지/DPS 틱/보스 타이머.
// UIScene 과는 game.events 버스로 통신한다.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  COMBAT_CENTER, PANEL_Y, TOP_BAR_H,
  SHADOW_CLONE_TAPS_PER_SEC, MONSTER_NAMES, BOSS_NAMES, monsterHp,
} from '../config';
import { GameState } from '../core/GameState';
import { fmt } from '../core/format';

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

  private floatPool: Phaser.GameObjects.Text[] = [];
  private floatIdx = 0;
  private coinPool: Phaser.GameObjects.Image[] = [];
  private coinIdx = 0;
  private dpsCarry = 0; // 0.5초마다 모아서 표시하는 DPS 누적치

  constructor() { super('Game'); }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    this.add.image(0, 0, 'bg').setOrigin(0, 0);

    this.monsterShadow = this.add.ellipse(COMBAT_CENTER.x, 592, 190, 40, 0x000000, 0.35);
    this.monster = this.add.image(COMBAT_CENTER.x, COMBAT_CENTER.y, 'monster0').setOrigin(0.5, 0.78);

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

    // 탭 입력: 전투 영역만 (스킬바 y=646 위쪽 — UI 탭이 공격으로 새지 않게)
    const COMBAT_BOTTOM = 646;
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
    this.state.on('prestige', () => this.spawn());

    this.spawn();
  }

  // --- 스폰 ---------------------------------------------------------------

  private spawn(): void {
    const st = this.state;
    this.isBoss = st.mode === 'boss';
    const base = monsterHp(st.stage, this.isBoss);
    this.hpMax = Math.max(1, Math.round(
      this.isBoss ? base : base * Phaser.Math.FloatBetween(0.85, 1.15),
    ));
    this.hp = this.hpMax;
    this.dead = false;

    if (this.isBoss) {
      this.monster.setTexture('boss');
      this.nameText.setText(BOSS_NAMES[(st.stage - 1) % BOSS_NAMES.length]).setColor('#ff9c9c');
      this.bossLimit = st.bossTimeLimit();
      this.bossDeadline = this.time.now + this.bossLimit;
    } else {
      const idx = (st.stage * 7 + st.kills * 3) % 6;
      this.monster.setTexture('monster' + idx);
      this.nameText.setText(MONSTER_NAMES[(st.stage - 1) % MONSTER_NAMES.length]).setColor('#ffffff');
      this.bossDeadline = 0;
      this.game.events.emit('boss-timer', -1);
    }

    const targetScale = this.isBoss ? 1.25 : 1;
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
    if (this.dead) return;

    const crit = Math.random() < this.state.critChance();
    const dmg = Math.round(this.state.tapDamage() * (crit ? this.state.critMult() : 1));
    this.applyDamage(dmg, crit, x, Math.min(y, PANEL_Y - 120));
    // 몬스터 반동
    this.tweens.add({
      targets: this.monster, scaleX: this.monster.scale * 0.94, scaleY: this.monster.scale * 1.05,
      duration: 45, yoyo: true,
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
        const dmg = Math.round(this.state.tapDamage() * (crit ? this.state.critMult() : 1));
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
    if (wasBoss) {
      this.cameras.main.shake(220, 0.012);
      this.game.events.emit('boss-timer', -1);
    }
    this.burstCoins(wasBoss ? 8 : 4);
    this.tweens.add({
      targets: this.monster, alpha: 0, scaleY: this.monster.scale * 0.3,
      scaleX: this.monster.scale * 1.25, duration: 180, ease: 'Quad.In',
    });
    this.state.recordKill(wasBoss); // 골드 지급 + 모드 전환
    this.time.delayedCall(260, () => this.spawn());
  }

  /** 보스 시간 초과 → 도주 */
  private bossEscape(): void {
    if (this.dead) return;
    this.dead = true;
    this.game.events.emit('boss-timer', -1);
    this.tweens.add({
      targets: this.monster, x: 900, alpha: 0, duration: 320, ease: 'Quad.In',
    });
    this.state.failBoss();
    this.time.delayedCall(360, () => this.spawn());
  }

  private onEngageBoss(): void {
    if (!this.state.engageBoss()) return;
    this.dead = true; // 현재 일반 몬스터 즉시 교체
    this.tweens.add({ targets: this.monster, alpha: 0, duration: 120 });
    this.time.delayedCall(140, () => this.spawn());
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

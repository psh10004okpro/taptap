// ---------------------------------------------------------------------------
// UIScene: 상단 HUD + 하단 업그레이드 패널 + 팝업. GameScene 위에 병렬 실행.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, PANEL_Y, HEROES, MONSTERS_PER_STAGE,
} from '../config';
import { GameState } from '../core/GameState';
import { fmt, fmtDuration } from '../core/format';

const FONT = 'Trebuchet MS, Malgun Gothic, sans-serif';

interface HeroRow {
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  btn: Phaser.GameObjects.Image;
  btnText: Phaser.GameObjects.Text;
}

export class UIScene extends Phaser.Scene {
  private state!: GameState;

  private goldText!: Phaser.GameObjects.Text;
  private dpsText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private progText!: Phaser.GameObjects.Text;
  private timerBg!: Phaser.GameObjects.Image;
  private timerFill!: Phaser.GameObjects.Image;
  private bossBtn!: Phaser.GameObjects.Container;
  private prestigeBtn!: Phaser.GameObjects.Container;
  private prestigeLabel!: Phaser.GameObjects.Text;

  private tapName!: Phaser.GameObjects.Text;
  private tapSub!: Phaser.GameObjects.Text;
  private tapBtn!: Phaser.GameObjects.Image;
  private tapBtnText!: Phaser.GameObjects.Text;
  private heroRows: HeroRow[] = [];

  constructor() { super('UI'); }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    this.buildTopBar();
    this.buildBossButton();
    this.buildPanel();
    this.bindEvents();
    this.refreshAll();

    // 오프라인 보상 팝업 (main.ts 에서 지급 후 registry 에 기록)
    const off = this.registry.get('offlineReward') as { sec: number; gold: number } | undefined;
    if (off && off.gold > 0) this.showOfflinePopup(off.sec, off.gold);
  }

  // --- 상단 HUD -----------------------------------------------------------

  private buildTopBar(): void {
    this.add.image(0, 0, 'topbar').setOrigin(0, 0);

    this.add.image(46, 46, 'coin').setScale(1.35);
    this.goldText = this.add.text(74, 46, '0', {
      fontFamily: FONT, fontSize: '34px', color: '#f9e79f', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.dpsText = this.add.text(74, 88, 'DPS 0', {
      fontFamily: FONT, fontSize: '19px', color: '#9fd8ff',
    }).setOrigin(0, 0.5);

    this.stageText = this.add.text(GAME_WIDTH / 2, 38, '', {
      fontFamily: FONT, fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.progText = this.add.text(GAME_WIDTH / 2, 72, '', {
      fontFamily: FONT, fontSize: '19px', color: '#c9b8e8',
    }).setOrigin(0.5);

    // 보스 타이머 바
    this.timerBg = this.add.image(GAME_WIDTH / 2, 112, 'hpbar-bg').setScale(1, 0.6).setVisible(false);
    this.timerFill = this.add.image(GAME_WIDTH / 2 - 165, 112, 'timer-fill')
      .setOrigin(0, 0.5).setVisible(false);

    // 환생 버튼
    const btn = this.add.image(0, 0, 'btn-prestige');
    this.prestigeLabel = this.add.text(0, 0, '환생', {
      fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5);
    this.prestigeBtn = this.add.container(GAME_WIDTH - 78, 50, [btn, this.prestigeLabel]);
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showPrestigePopup());
  }

  private buildBossButton(): void {
    const img = this.add.image(0, 0, 'btn-boss');
    const label = this.add.text(0, 0, '보스 도전!', {
      fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.bossBtn = this.add.container(GAME_WIDTH / 2, PANEL_Y - 70, [img, label]).setVisible(false);
    img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.game.events.emit('engage-boss');
    });
    this.tweens.add({
      targets: this.bossBtn, scale: 1.05, duration: 500, yoyo: true, repeat: -1,
    });
  }

  // --- 하단 패널 -----------------------------------------------------------

  private buildPanel(): void {
    this.add.image(0, PANEL_Y - 24, 'panel').setOrigin(0, 0);

    // 탭 공격력 행
    const tapY = PANEL_Y + 12;
    this.add.image(GAME_WIDTH / 2, tapY, 'row').setScale(1, 1.05);
    const swordIcon = this.add.graphics({ x: 40, y: tapY });
    swordIcon.fillStyle(0xf1c40f, 1).fillCircle(0, 0, 19);
    swordIcon.fillStyle(0x241b3e, 1).fillRect(-3, -12, 6, 17);
    swordIcon.fillRect(-8, 5, 16, 4);
    this.tapName = this.add.text(74, tapY - 12, '', {
      fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.tapSub = this.add.text(74, tapY + 12, '', {
      fontFamily: FONT, fontSize: '16px', color: '#c9b8e8',
    }).setOrigin(0, 0.5);
    this.tapBtn = this.add.image(GAME_WIDTH - 96, tapY, 'btn-buy');
    this.tapBtnText = this.add.text(GAME_WIDTH - 96, tapY, '', {
      fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tapBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.state.tryBuyTap()) this.pop(this.tapBtn);
    });

    // 영웅 행 x8
    HEROES.forEach((h, i) => {
      const y = PANEL_Y + 70 + i * 56;
      this.add.image(GAME_WIDTH / 2, y, 'row');
      this.add.image(40, y, 'hero' + h.id);
      this.add.text(40, y, h.name.charAt(0), {
        fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const name = this.add.text(74, y - 12, `${h.name} · ${h.title}`, {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const sub = this.add.text(74, y + 12, '', {
        fontFamily: FONT, fontSize: '15px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 96, y, 'btn-buy');
      const btnText = this.add.text(GAME_WIDTH - 96, y, '', {
        fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.state.tryBuyHero(h.id)) this.pop(btn);
      });
      this.heroRows.push({ name, sub, btn, btnText });
    });
  }

  // --- 이벤트 배선 ---------------------------------------------------------

  private bindEvents(): void {
    this.state.on('gold', () => this.refreshGold());
    this.state.on('upgrade', () => { this.refreshPanel(); this.refreshGold(); });
    this.state.on('stage', () => this.refreshStage());
    this.state.on('mode', () => this.refreshStage());
    this.state.on('prestige', () => this.refreshAll());

    this.game.events.on('boss-timer', this.onBossTimer, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('boss-timer', this.onBossTimer, this);
    });
  }

  private onBossTimer(ratio: number): void {
    const on = ratio >= 0;
    this.timerBg.setVisible(on);
    this.timerFill.setVisible(on);
    if (on) this.timerFill.setScale(Math.max(0.001, ratio), 1);
  }

  // --- 갱신 ---------------------------------------------------------------

  private refreshAll(): void {
    this.refreshGold();
    this.refreshStage();
    this.refreshPanel();
  }

  private refreshGold(): void {
    this.goldText.setText(fmt(this.state.gold));
    this.dpsText.setText(`DPS ${fmt(this.state.totalDps())}`);
    this.refreshAfford();
  }

  private refreshStage(): void {
    const st = this.state;
    this.stageText.setText(`스테이지 ${st.stage}`);
    if (st.mode === 'boss') {
      this.progText.setText('보스 전투 중!').setColor('#ff9c9c');
    } else {
      this.progText.setText(`${st.kills} / ${MONSTERS_PER_STAGE - 1}`).setColor('#c9b8e8');
    }
    this.bossBtn.setVisible(st.mode === 'farm' && st.kills >= MONSTERS_PER_STAGE - 1);
    // 환생 버튼 라벨
    const relics = st.prestigeRelics();
    this.prestigeLabel.setText(st.canPrestige() ? `환생 +${fmt(relics - st.relics)}` : '환생');
    this.prestigeBtn.setAlpha(st.canPrestige() ? 1 : 0.45);
  }

  private refreshPanel(): void {
    const st = this.state;
    this.tapName.setText(`탭 공격력  Lv.${st.tapLevel}`);
    this.tapSub.setText(`데미지 ${fmt(st.tapDamage())}`);
    this.tapBtnText.setText(fmt(st.tapCost()));
    HEROES.forEach((h, i) => {
      const row = this.heroRows[i];
      const lvl = st.heroLevels[h.id];
      row.sub.setText(lvl === 0 ? '미고용' : `Lv.${lvl} · DPS ${fmt(st.heroDps(h.id))}`);
      row.btnText.setText(lvl === 0 ? `고용 ${fmt(st.heroCost(h.id))}` : fmt(st.heroCost(h.id)));
    });
    this.refreshAfford();
    this.refreshStage();
  }

  private refreshAfford(): void {
    const st = this.state;
    this.setEnabled(this.tapBtn, st.gold >= st.tapCost());
    HEROES.forEach((h, i) => {
      this.setEnabled(this.heroRows[i].btn, st.gold >= st.heroCost(h.id));
    });
  }

  private setEnabled(btn: Phaser.GameObjects.Image, on: boolean): void {
    btn.setAlpha(on ? 1 : 0.4);
    if (on) btn.setInteractive({ useHandCursor: true });
    else btn.disableInteractive();
  }

  private pop(target: Phaser.GameObjects.Image): void {
    this.tweens.add({ targets: target, scale: 0.9, duration: 60, yoyo: true });
  }

  // --- 팝업 ---------------------------------------------------------------

  private showOfflinePopup(sec: number, gold: number): void {
    this.showPopup(
      '어서 오세요!',
      `${fmtDuration(sec)} 동안 자리를 비운 사이\n영웅들이 골드를 모았습니다.\n\n+${fmt(gold)} 골드`,
      [{ label: '받기', on: () => { /* 이미 지급됨 */ } }],
    );
  }

  private showPrestigePopup(): void {
    const st = this.state;
    if (!st.canPrestige()) {
      this.showPopup(
        '환생',
        `스테이지 25 이상 도달 시\n유물을 얻고 환생할 수 있습니다.\n\n현재 최고 스테이지: ${st.maxStage}`,
        [{ label: '닫기', on: () => { /* noop */ } }],
      );
      return;
    }
    const gain = st.prestigeRelics() - st.relics;
    this.showPopup(
      '환생하시겠습니까?',
      `골드·영웅·스테이지가 초기화되고\n유물 +${fmt(gain)} (총 ${fmt(st.prestigeRelics())}개)\n영구 데미지 +${st.prestigeRelics() * 10}%`,
      [
        { label: '환생하기', on: () => st.doPrestige() },
        { label: '취소', on: () => { /* noop */ } },
      ],
    );
  }

  private showPopup(
    title: string, body: string,
    buttons: { label: string; on: () => void }[],
  ): void {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2 - 60;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const dim = this.add.image(0, 0, 'dim').setOrigin(0, 0).setDepth(50).setInteractive();
    const card = this.add.image(cx, cy, 'card').setDepth(51);
    const titleT = this.add.text(cx, cy - 130, title, {
      fontFamily: FONT, fontSize: '32px', color: '#f9e79f', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(52);
    const bodyT = this.add.text(cx, cy - 20, body, {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setDepth(52);
    parts.push(dim, card, titleT, bodyT);

    const n = buttons.length;
    const close = () => parts.forEach((p) => p.destroy());
    buttons.forEach((b, i) => {
      const bx = cx + (i - (n - 1) / 2) * 220;
      const img = this.add.image(bx, cy + 120, 'btn-buy').setDepth(52).setScale(1.25, 1.2);
      const txt = this.add.text(bx, cy + 120, b.label, {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(53);
      if (i > 0) img.setAlpha(0.7);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        b.on();
        close();
      });
      parts.push(img, txt);
    });
  }
}

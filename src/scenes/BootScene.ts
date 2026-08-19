// ---------------------------------------------------------------------------
// BootScene: 외부 에셋 없이 모든 텍스처를 Graphics 로 절차 생성한다.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PANEL_Y, HEROES } from '../config';

const MONSTER_COLORS = [0x6fcf5a, 0x5aa8e8, 0xd86fd4, 0xe8a05a, 0x8a7de8, 0xe85a72];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    this.makeBackground();
    this.makeMonsters();
    this.makeBoss();
    this.makeCoin();
    this.makeUiTextures();
    this.scene.start('Game');
    this.scene.launch('UI');
  }

  /** 세로 그라데이션 하늘 + 능선 + 지면 */
  private makeBackground(): void {
    const g = this.add.graphics();
    const top = Phaser.Display.Color.ValueToColor(0x2b1e4f);
    const bottom = Phaser.Display.Color.ValueToColor(0x7a4f9e);
    const strips = 40;
    const stripH = PANEL_Y / strips;
    for (let i = 0; i < strips; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, strips, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, i * stripH, GAME_WIDTH, stripH + 1);
    }
    // 먼 능선
    g.fillStyle(0x3a2a63, 1);
    for (let x = 0; x <= GAME_WIDTH; x += 90) {
      g.fillTriangle(x - 70, 560, x + 20, 400 + (x % 180 === 0 ? -40 : 10), x + 110, 560);
    }
    // 지면
    g.fillStyle(0x2e2247, 1);
    g.fillRect(0, 560, GAME_WIDTH, PANEL_Y - 560);
    g.fillStyle(0x413060, 1);
    g.fillEllipse(360, 585, 460, 70); // 몬스터 발밑 단상
    g.generateTexture('bg', GAME_WIDTH, PANEL_Y);
    g.destroy();
  }

  /** 슬라임형 몬스터 6종 */
  private makeMonsters(): void {
    MONSTER_COLORS.forEach((color, i) => {
      const g = this.add.graphics();
      const dark = Phaser.Display.Color.ValueToColor(color).darken(25).color;
      const w = 200, h = 170;
      // 몸통
      g.fillStyle(dark, 1);
      g.fillEllipse(w / 2, h - 62, 176, 128);
      g.fillStyle(color, 1);
      g.fillEllipse(w / 2, h - 68, 160, 116);
      // 하이라이트
      g.fillStyle(0xffffff, 0.25);
      g.fillEllipse(w / 2 - 34, h - 96, 44, 26);
      // 눈
      g.fillStyle(0xffffff, 1);
      g.fillCircle(w / 2 - 28, h - 76, 16);
      g.fillCircle(w / 2 + 28, h - 76, 16);
      g.fillStyle(0x22182f, 1);
      g.fillCircle(w / 2 - 25, h - 74, 7);
      g.fillCircle(w / 2 + 31, h - 74, 7);
      // 입
      g.fillStyle(0x22182f, 1);
      g.fillEllipse(w / 2 + 2, h - 46, 26, 12);
      // 변형 포인트: 뿔/더듬이
      if (i % 3 === 1) {
        g.fillStyle(dark, 1);
        g.fillTriangle(w / 2 - 52, h - 118, w / 2 - 30, h - 160, w / 2 - 14, h - 118);
        g.fillTriangle(w / 2 + 14, h - 118, w / 2 + 30, h - 160, w / 2 + 52, h - 118);
      } else if (i % 3 === 2) {
        g.fillStyle(dark, 1);
        g.fillCircle(w / 2, h - 152, 12);
        g.fillRect(w / 2 - 3, h - 150, 6, 30);
      }
      g.generateTexture('monster' + i, w, h);
      g.destroy();
    });
  }

  /** 보스: 뿔 달린 대형 몬스터 */
  private makeBoss(): void {
    const g = this.add.graphics();
    const w = 280, h = 250;
    const color = 0xc0392b, dark = 0x7d241a;
    g.fillStyle(dark, 1);
    g.fillEllipse(w / 2, h - 90, 250, 190);
    g.fillStyle(color, 1);
    g.fillEllipse(w / 2, h - 98, 230, 172);
    // 뿔
    g.fillStyle(0xf5e6c8, 1);
    g.fillTriangle(w / 2 - 96, h - 170, w / 2 - 120, h - 236, w / 2 - 54, h - 186);
    g.fillTriangle(w / 2 + 54, h - 186, w / 2 + 120, h - 236, w / 2 + 96, h - 170);
    // 눈 (성난)
    g.fillStyle(0xfff200, 1);
    g.fillCircle(w / 2 - 40, h - 128, 20);
    g.fillCircle(w / 2 + 40, h - 128, 20);
    g.fillStyle(0x22182f, 1);
    g.fillCircle(w / 2 - 36, h - 126, 9);
    g.fillCircle(w / 2 + 44, h - 126, 9);
    g.fillStyle(dark, 1);
    g.fillRect(w / 2 - 64, h - 158, 48, 10);
    g.fillRect(w / 2 + 16, h - 158, 48, 10);
    // 입 + 이빨
    g.fillStyle(0x22182f, 1);
    g.fillEllipse(w / 2, h - 70, 90, 34);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(w / 2 - 30, h - 84, w / 2 - 20, h - 62, w / 2 - 10, h - 84);
    g.fillTriangle(w / 2 + 10, h - 84, w / 2 + 20, h - 62, w / 2 + 30, h - 84);
    g.generateTexture('boss', w, h);
    g.destroy();
  }

  private makeCoin(): void {
    const g = this.add.graphics();
    g.fillStyle(0xb8860b, 1);
    g.fillCircle(14, 14, 13);
    g.fillStyle(0xf1c40f, 1);
    g.fillCircle(14, 13, 11);
    g.fillStyle(0xf9e79f, 1);
    g.fillCircle(10, 9, 4);
    g.generateTexture('coin', 28, 28);
    g.destroy();
  }

  private makeUiTextures(): void {
    // 하단 패널
    let g = this.add.graphics();
    g.fillStyle(0x1d1630, 0.97);
    g.fillRoundedRect(0, 0, GAME_WIDTH, GAME_HEIGHT - PANEL_Y + 24, { tl: 26, tr: 26, bl: 0, br: 0 });
    g.generateTexture('panel', GAME_WIDTH, GAME_HEIGHT - PANEL_Y + 24);
    g.destroy();

    // 상단 바
    g = this.add.graphics();
    g.fillStyle(0x160f28, 0.92);
    g.fillRect(0, 0, GAME_WIDTH, 150);
    g.generateTexture('topbar', GAME_WIDTH, 150);
    g.destroy();

    // 리스트 행 배경
    g = this.add.graphics();
    g.fillStyle(0xffffff, 0.06);
    g.fillRoundedRect(0, 0, 690, 52, 10);
    g.generateTexture('row', 690, 52);
    g.destroy();

    // 버튼 (구매)
    g = this.add.graphics();
    g.fillStyle(0x27ae60, 1);
    g.fillRoundedRect(0, 0, 148, 44, 10);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(0, 0, 148, 20, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.generateTexture('btn-buy', 148, 44);
    g.destroy();

    // 버튼 (보스 도전)
    g = this.add.graphics();
    g.fillStyle(0xc0392b, 1);
    g.fillRoundedRect(0, 0, 240, 64, 14);
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(0, 0, 240, 28, { tl: 14, tr: 14, bl: 0, br: 0 });
    g.generateTexture('btn-boss', 240, 64);
    g.destroy();

    // 버튼 (환생)
    g = this.add.graphics();
    g.fillStyle(0x8e44ad, 1);
    g.fillRoundedRect(0, 0, 132, 50, 12);
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(0, 0, 132, 22, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.generateTexture('btn-prestige', 132, 50);
    g.destroy();

    // 탭 파문 링
    g = this.add.graphics();
    g.lineStyle(5, 0xffffff, 0.9);
    g.strokeCircle(32, 32, 28);
    g.generateTexture('ring', 64, 64);
    g.destroy();

    // HP 바 배경/채움
    g = this.add.graphics();
    g.fillStyle(0x120c20, 0.85);
    g.fillRoundedRect(0, 0, 340, 24, 12);
    g.generateTexture('hpbar-bg', 340, 24);
    g.destroy();

    g = this.add.graphics();
    g.fillStyle(0xe74c3c, 1);
    g.fillRoundedRect(0, 0, 330, 15, 7);
    g.generateTexture('hpbar-fill', 330, 15);
    g.destroy();

    // 보스 타이머 바
    g = this.add.graphics();
    g.fillStyle(0xf39c12, 1);
    g.fillRoundedRect(0, 0, 340, 10, 5);
    g.generateTexture('timer-fill', 340, 10);
    g.destroy();

    // 영웅 아이콘 (원형)
    HEROES.forEach((h) => {
      const gg = this.add.graphics();
      const dark = Phaser.Display.Color.ValueToColor(h.color).darken(30).color;
      gg.fillStyle(dark, 1);
      gg.fillCircle(21, 21, 21);
      gg.fillStyle(h.color, 1);
      gg.fillCircle(21, 20, 18);
      gg.fillStyle(0xffffff, 0.3);
      gg.fillEllipse(15, 13, 12, 8);
      gg.generateTexture('hero' + h.id, 42, 42);
      gg.destroy();
    });

    // 오버레이 딤
    g = this.add.graphics();
    g.fillStyle(0x000000, 0.72);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.generateTexture('dim', GAME_WIDTH, GAME_HEIGHT);
    g.destroy();

    // 팝업 카드
    g = this.add.graphics();
    g.fillStyle(0x241b3e, 1);
    g.fillRoundedRect(0, 0, 560, 360, 22);
    g.lineStyle(3, 0x8e44ad, 1);
    g.strokeRoundedRect(0, 0, 560, 360, 22);
    g.generateTexture('card', 560, 360);
    g.destroy();
  }
}

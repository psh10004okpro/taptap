// ---------------------------------------------------------------------------
// BootScene: 생성 아트(public/assets/, manifest.json 기준)를 로드하고,
// 없는 키는 Graphics 절차 생성으로 폴백한다. 텍스처 생성은 이 씬에서만.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PANEL_Y, HEROES, SKILLS, ARTIFACTS } from '../config.ts';

const MONSTER_COLORS = [
  0x6fcf5a, 0x5aa8e8, 0xd86fd4, 0xe8a05a, 0x8a7de8, 0xe85a72,
  0x58d0c0, 0xc9b458, 0x9e6b4a, 0x7a8a99, 0xd2527f, 0x86c232,
];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    // 에셋 목록은 manifest 가 단일 출처 — 없는 파일을 긁어 404 를 내지 않는다.
    this.load.json('asset-manifest', 'assets/manifest.json');
  }

  create(): void {
    const man = this.cache.json.get('asset-manifest') as { keys?: string[] } | undefined;
    const keys = (man?.keys ?? []).filter((k) => /^[\w-]+$/.test(k));
    if (keys.length > 0) {
      keys.forEach((k) => this.load.image(k, 'assets/' + k + '.png'));
      this.load.once('complete', () => this.buildAndStart());
      this.load.start();
    } else {
      this.buildAndStart();
    }
  }

  /** 로드되지 않은 키만 절차 생성한 뒤 게임을 시작한다 */
  private buildAndStart(): void {
    this.makeBackground();
    this.makeMonsters();
    this.makeBoss();
    this.makeCoin();
    this.makeUiTextures();
    this.scene.start('Game');
    this.scene.launch('UI');
  }

  private missing(key: string): boolean {
    return !this.textures.exists(key);
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
      if (!this.missing('monster' + i)) return;
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
      // 변형 포인트: 뿔 / 더듬이 / 등가시
      if (i % 4 === 1) {
        g.fillStyle(dark, 1);
        g.fillTriangle(w / 2 - 52, h - 118, w / 2 - 30, h - 160, w / 2 - 14, h - 118);
        g.fillTriangle(w / 2 + 14, h - 118, w / 2 + 30, h - 160, w / 2 + 52, h - 118);
      } else if (i % 4 === 2) {
        g.fillStyle(dark, 1);
        g.fillCircle(w / 2, h - 152, 12);
        g.fillRect(w / 2 - 3, h - 150, 6, 30);
      } else if (i % 4 === 3) {
        g.fillStyle(dark, 1);
        g.fillTriangle(w / 2 - 60, h - 100, w / 2 - 44, h - 148, w / 2 - 24, h - 108);
        g.fillTriangle(w / 2 - 18, h - 112, w / 2, h - 162, w / 2 + 18, h - 112);
        g.fillTriangle(w / 2 + 24, h - 108, w / 2 + 44, h - 148, w / 2 + 60, h - 100);
      }
      g.generateTexture('monster' + i, w, h);
      g.destroy();
    });
  }

  /** 보스: 뿔 달린 대형 몬스터 */
  private makeBoss(): void {
    if (!this.missing('boss')) return;
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
    if (!this.missing('coin')) return;
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

    // 처치 파티클 스파크 (다이아몬드 조각)
    g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(6, 0, 12, 6, 0, 6);
    g.fillTriangle(0, 6, 12, 6, 6, 12);
    g.generateTexture('spark', 12, 12);
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

    // 보스 타이머 바 (hpbar-fill 과 동일 330px — 배경 밖으로 삐져나오지 않게)
    g = this.add.graphics();
    g.fillStyle(0xf39c12, 1);
    g.fillRoundedRect(0, 0, 330, 10, 5);
    g.generateTexture('timer-fill', 330, 10);
    g.destroy();

    // 영웅 아이콘 (원형)
    HEROES.forEach((h) => {
      if (!this.missing('hero' + h.id)) return;
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

    // 스킬 버튼 (원형, 스킬 색상)
    SKILLS.forEach((s) => {
      if (!this.missing('skill' + s.id)) return;
      const gg = this.add.graphics();
      const dark = Phaser.Display.Color.ValueToColor(s.color).darken(35).color;
      gg.fillStyle(0x120c20, 0.9);
      gg.fillCircle(38, 38, 37);
      gg.fillStyle(dark, 1);
      gg.fillCircle(38, 38, 33);
      gg.fillStyle(s.color, 1);
      gg.fillCircle(38, 36, 29);
      gg.fillStyle(0xffffff, 0.25);
      gg.fillEllipse(30, 26, 20, 12);
      gg.generateTexture('skill' + s.id, 76, 76);
      gg.destroy();
    });

    // 스킬 활성 링
    g = this.add.graphics();
    g.lineStyle(5, 0x2ecc71, 1);
    g.strokeCircle(42, 42, 39);
    g.generateTexture('skill-ring', 84, 84);
    g.destroy();

    // 유물 보석 (다이아몬드)
    ARTIFACTS.forEach((a) => {
      if (!this.missing('artifact' + a.id)) return;
      const gg = this.add.graphics();
      const dark = Phaser.Display.Color.ValueToColor(a.color).darken(30).color;
      // 다이아몬드 = 위/아래 삼각형 (외곽 → 본체 → 하이라이트)
      gg.fillStyle(dark, 1);
      gg.fillTriangle(22, 2, 42, 22, 2, 22);
      gg.fillTriangle(2, 22, 42, 22, 22, 42);
      gg.fillStyle(a.color, 1);
      gg.fillTriangle(22, 6, 38, 22, 6, 22);
      gg.fillTriangle(6, 22, 38, 22, 22, 38);
      gg.fillStyle(0xffffff, 0.35);
      gg.fillTriangle(22, 9, 30, 17, 14, 17);
      gg.generateTexture('artifact' + a.id, 44, 44);
      gg.destroy();
    });

    // 패널 탭 (활성/비활성) — 5탭 x 132px
    g = this.add.graphics();
    g.fillStyle(0x8e44ad, 1);
    g.fillRoundedRect(0, 0, 132, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.generateTexture('tab-on', 132, 44);
    g.destroy();
    g = this.add.graphics();
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(0, 0, 132, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.generateTexture('tab-off', 132, 44);
    g.destroy();

    // 광고 보상 버튼 (오렌지)
    g = this.add.graphics();
    g.fillStyle(0xd35400, 1);
    g.fillRoundedRect(0, 0, 128, 38, 10);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(0, 0, 128, 17, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.generateTexture('btn-ad', 128, 38);
    g.destroy();

    // 장비 슬롯 아이콘: 무기(검) / 갑옷(방패) / 장신구(반지)
    g = this.add.graphics();
    g.fillStyle(0xbdc3c7, 1);
    g.fillTriangle(22, 4, 27, 26, 17, 26);      // 칼날
    g.fillStyle(0x8e6a3a, 1);
    g.fillRect(15, 27, 14, 5);                   // 가드
    g.fillRect(20, 32, 4, 9);                    // 손잡이
    g.generateTexture('equip0', 44, 44);
    g.destroy();
    g = this.add.graphics();
    g.fillStyle(0x7f8c8d, 1);
    g.fillRoundedRect(8, 6, 28, 24, 6);          // 방패 상단
    g.fillTriangle(8, 26, 36, 26, 22, 40);       // 방패 하단
    g.fillStyle(0xf1c40f, 1);
    g.fillCircle(22, 20, 5);                     // 문장
    g.generateTexture('equip1', 44, 44);
    g.destroy();
    g = this.add.graphics();
    g.lineStyle(6, 0xf1c40f, 1);
    g.strokeCircle(22, 26, 12);                  // 링
    g.fillStyle(0x9b59b6, 1);
    g.fillTriangle(22, 4, 30, 14, 14, 14);       // 보석
    g.generateTexture('equip2', 44, 44);
    g.destroy();

    // 스킬트리 노드 셀
    g = this.add.graphics();
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(0, 0, 208, 96, 12);
    g.lineStyle(2, 0x8e44ad, 0.7);
    g.strokeRoundedRect(1, 1, 206, 94, 12);
    g.generateTexture('node', 208, 96);
    g.destroy();

    // 튜토리얼 배너
    g = this.add.graphics();
    g.fillStyle(0x1d1630, 0.94);
    g.fillRoundedRect(0, 0, 600, 56, 14);
    g.lineStyle(2, 0xf1c40f, 0.9);
    g.strokeRoundedRect(1, 1, 598, 54, 14);
    g.generateTexture('tut-banner', 600, 56);
    g.destroy();

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

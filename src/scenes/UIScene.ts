// ---------------------------------------------------------------------------
// UIScene: 상단 HUD + 스킬바 + 하단 탭 패널(영웅/유물/랭킹) + 팝업.
// GameScene 위에 병렬 실행되며 상태 이벤트 구독으로만 갱신한다.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, PANEL_Y, SKILL_BAR_Y, TAB_Y,
  HEROES, SKILLS, ARTIFACTS, MONSTERS_PER_STAGE,
  EQUIP_SLOTS, RARITIES, DAILY_QUESTS, EQUIP_DROP_CHANCE, HERO_PASSIVE_UNLOCK,
} from '../config.ts';
import type { EquipItem } from '../config.ts';
import { GameState } from '../core/GameState.ts';
import { AdRewards } from '../core/AdRewards.ts';
import { Leaderboard, LbEntry } from '../core/Leaderboard.ts';
import { fmt, fmtDuration } from '../core/format.ts';

const FONT = 'Trebuchet MS, Malgun Gothic, sans-serif';
const TAB_NAMES = ['영웅', '장비', '유물', '퀘스트', '랭킹'] as const;

interface HeroRow {
  icon: Phaser.GameObjects.Image;
  initial: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  btn: Phaser.GameObjects.Image;
  btnText: Phaser.GameObjects.Text;
}

const HEROES_PER_PAGE = 8;

interface ArtifactRow {
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  btn: Phaser.GameObjects.Image;
  btnText: Phaser.GameObjects.Text;
}

interface SkillBtn {
  base: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  glyph: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

export class UIScene extends Phaser.Scene {
  private state!: GameState;
  private lb!: Leaderboard;

  private goldText!: Phaser.GameObjects.Text;
  private dpsText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private progText!: Phaser.GameObjects.Text;
  private timerBg!: Phaser.GameObjects.Image;
  private timerFill!: Phaser.GameObjects.Image;
  private bossBtn!: Phaser.GameObjects.Container;
  private prestigeBtn!: Phaser.GameObjects.Container;
  private prestigeLabel!: Phaser.GameObjects.Text;

  private skillBtns: SkillBtn[] = [];
  private skillSig = '';

  private tabButtons: { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private tabContents: Phaser.GameObjects.Container[] = [];

  private tapName!: Phaser.GameObjects.Text;
  private tapSub!: Phaser.GameObjects.Text;
  private tapBtn!: Phaser.GameObjects.Image;
  private tapBtnText!: Phaser.GameObjects.Text;
  private heroRows: HeroRow[] = [];
  private heroPage = 0;
  private heroPageLabel!: Phaser.GameObjects.Text;

  private relicText!: Phaser.GameObjects.Text;
  private artifactRows: ArtifactRow[] = [];

  private rankNameText!: Phaser.GameObjects.Text;
  private rankStatus!: Phaser.GameObjects.Text;
  private rankLines: Phaser.GameObjects.Text[] = [];

  private ads = new AdRewards();
  private boostBtnText!: Phaser.GameObjects.Text;
  private boostBtn!: Phaser.GameObjects.Image;
  private cdBtn!: Phaser.GameObjects.Image;
  private equipRows: { title: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }[] = [];
  private equipSetText!: Phaser.GameObjects.Text;
  private questRows: {
    desc: Phaser.GameObjects.Text; prog: Phaser.GameObjects.Text;
    btn: Phaser.GameObjects.Image; btnText: Phaser.GameObjects.Text;
  }[] = [];

  constructor() { super('UI'); }

  create(): void {
    // 씬 재시작에 대비해 수집 배열을 리셋 (파괴된 이전 세대 객체 참조 방지)
    this.skillBtns = [];
    this.tabButtons = [];
    this.tabContents = [];
    this.heroRows = [];
    this.artifactRows = [];
    this.rankLines = [];
    this.equipRows = [];
    this.questRows = [];
    this.heroPage = 0;
    this.skillSig = '';
    this.state = this.registry.get('state') as GameState;
    this.lb = new Leaderboard();

    this.buildTopBar();
    this.buildSkillBar();
    this.buildBossButton();
    this.buildPanel();
    this.bindEvents();
    this.refreshAll();
    this.setTab(0);

    // 스킬 쿨다운/지속시간은 시계 기반이라 주기 폴링으로 갱신
    this.time.addEvent({ delay: 200, loop: true, callback: () => this.refreshSkillBar() });

    // 오프라인 보상 팝업 (main.ts 에서 지급 후 registry 에 기록)
    const off = this.registry.get('offlineReward') as { sec: number; gold: number } | undefined;
    if (off && off.gold > 0) this.showOfflinePopup(off.sec, off.gold);

    this.registry.set('uiReady', true); // E2E: 씬 준비 완료 신호
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

    this.stageText = this.add.text(GAME_WIDTH / 2, 34, '', {
      fontFamily: FONT, fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.progText = this.add.text(GAME_WIDTH / 2, 64, '', {
      fontFamily: FONT, fontSize: '18px', color: '#c9b8e8',
    }).setOrigin(0.5);

    // 보스 타이머 바 (광고 버튼과 겹치지 않는 y)
    this.timerBg = this.add.image(GAME_WIDTH / 2, 92, 'hpbar-bg').setScale(1, 0.6).setVisible(false);
    this.timerFill = this.add.image(GAME_WIDTH / 2 - 165, 92, 'timer-fill')
      .setOrigin(0, 0.5).setVisible(false);

    // 광고 보상: 골드 x2 부스트 / 스킬 쿨다운 초기화
    this.boostBtn = this.add.image(288, 120, 'btn-ad');
    this.boostBtnText = this.add.text(288, 120, 'AD 골드x2', {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.boostBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.state.isGoldBoostActive()) return;
      this.showToast('광고 재생 중...');
      this.ads.offer('gold-boost', () => this.state.activateGoldBoost(), (ok) => {
        if (ok) this.showToast('30분간 골드 획득 2배!');
      });
    });
    this.cdBtn = this.add.image(432, 120, 'btn-ad');
    this.add.text(432, 120, 'AD 쿨다운', {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.cdBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!this.state.anySkillOnCooldown()) return;
      this.showToast('광고 재생 중...');
      this.ads.offer('cooldowns', () => this.state.resetSkillCooldowns(), (ok) => {
        if (ok) this.showToast('스킬 쿨다운이 초기화되었습니다!');
      });
    });

    // 환생 버튼
    const btn = this.add.image(0, 0, 'btn-prestige');
    this.prestigeLabel = this.add.text(0, 0, '환생', {
      fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5);
    this.prestigeBtn = this.add.container(GAME_WIDTH - 78, 50, [btn, this.prestigeLabel]);
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showPrestigePopup());
  }

  // --- 스킬바 --------------------------------------------------------------

  private buildSkillBar(): void {
    const y = SKILL_BAR_Y;
    SKILLS.forEach((s, i) => {
      const x = 120 + i * 160;
      const base = this.add.image(x, y, 'skill' + s.id).setDepth(5);
      const ring = this.add.image(x, y, 'skill-ring').setDepth(6).setVisible(false);
      const glyph = this.add.text(x, y - 2, s.glyph, {
        fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#22182f', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(7);
      const status = this.add.text(x, y + 26, '', {
        fontFamily: FONT, fontSize: '14px', color: '#f9e79f', fontStyle: 'bold',
        stroke: '#22182f', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(7);
      base.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.state.tryActivateSkill(s.id)) {
          this.tweens.add({ targets: [base, glyph], scale: 1.15, duration: 90, yoyo: true });
          this.showToast(`${s.name}! ${s.desc}`);
        } else if (!this.state.isSkillUnlocked(s.id)) {
          this.showToast(`스테이지 ${s.unlockStage} 도달 시 해금`);
        }
      });
      this.skillBtns.push({ base, ring, glyph, status });
    });
    this.refreshSkillBar();
  }

  private refreshSkillBar(): void {
    if (!this.dpsText) return; // create 완료 전 호출 방어
    const st = this.state;
    SKILLS.forEach((s, i) => {
      const b = this.skillBtns[i];
      if (!st.isSkillUnlocked(s.id)) {
        b.base.setAlpha(0.35);
        b.glyph.setAlpha(0.5);
        b.ring.setVisible(false);
        b.status.setText(`${s.unlockStage}층`);
        return;
      }
      const active = st.isSkillActive(s.id);
      const cd = st.skillCooldownLeft(s.id);
      b.ring.setVisible(active);
      if (active) {
        b.base.setAlpha(1);
        b.glyph.setAlpha(1);
        b.status.setText(`${Math.ceil(st.skillActiveLeft(s.id) / 1000)}s`).setColor('#7bed8d');
      } else if (cd > 0) {
        b.base.setAlpha(0.45);
        b.glyph.setAlpha(0.7);
        const sec = Math.ceil(cd / 1000);
        b.status.setText(sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`)
          .setColor('#f9e79f');
      } else {
        b.base.setAlpha(1);
        b.glyph.setAlpha(1);
        b.status.setText('준비').setColor('#9fd8ff');
      }
    });
    // 전투 함성 등으로 DPS 표기가 시간에 따라 변하므로 함께 갱신
    this.dpsText.setText(`DPS ${fmt(this.state.totalDps())}`);
    // 스킬 활성 상태가 바뀐 순간(발동/만료) 패널 수치도 갱신 — 배율 표기 스테일 방지
    // (골드 부스트 활성 여부도 시그니처에 포함해 만료를 감지)
    const sig = SKILLS.map((s) => (st.isSkillActive(s.id) ? '1' : '0')).join('')
      + (st.isGoldBoostActive() ? 'B' : 'b') + Math.ceil(st.goldBoostLeft() / 60_000);
    if (sig !== this.skillSig) {
      this.skillSig = sig;
      this.refreshPanel();
    }
  }

  private buildBossButton(): void {
    const img = this.add.image(0, 0, 'btn-boss');
    const label = this.add.text(0, 0, '보스 도전!', {
      fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.bossBtn = this.add.container(GAME_WIDTH / 2, 600, [img, label]).setVisible(false);
    img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.game.events.emit('engage-boss');
    });
    this.tweens.add({
      targets: this.bossBtn, scale: 1.05, duration: 500, yoyo: true, repeat: -1,
    });
  }

  // --- 하단 탭 패널 ---------------------------------------------------------

  private buildPanel(): void {
    this.add.image(0, PANEL_Y - 24, 'panel').setOrigin(0, 0);

    // 탭 버튼 (5탭 x 132px + 9px 간격)
    TAB_NAMES.forEach((label, i) => {
      const x = 76 + i * 142;
      const img = this.add.image(x, TAB_Y, i === 0 ? 'tab-on' : 'tab-off');
      const txt = this.add.text(x, TAB_Y, label, {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.setTab(i));
      this.tabButtons.push({ img, label: txt });
    });

    this.tabContents = [
      this.buildHeroTab(),
      this.buildEquipTab(),
      this.buildArtifactTab(),
      this.buildQuestTab(),
      this.buildRankTab(),
    ];
  }

  private setTab(i: number): void {
    this.tabButtons.forEach((t, k) => t.img.setTexture(k === i ? 'tab-on' : 'tab-off'));
    this.tabContents.forEach((c, k) => c.setVisible(k === i));
    this.refreshPanel(); // 탭 진입 시점 기준 최신 수치 표시
    if (i === TAB_NAMES.length - 1) this.loadRanking();
  }

  // --- 장비 탭 --------------------------------------------------------------

  private buildEquipTab(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setVisible(false);
    c.add(this.add.text(GAME_WIDTH / 2, PANEL_Y + 40,
      `보스 처치 시 ${Math.round(EQUIP_DROP_CHANCE * 100)}% 확률로 장비 드롭 · 상위 장비 자동 장착`, {
        fontFamily: FONT, fontSize: '16px', color: '#9a8bb8',
      }).setOrigin(0.5));
    this.equipSetText = this.add.text(GAME_WIDTH / 2, PANEL_Y + 68, '', {
      fontFamily: FONT, fontSize: '17px', color: '#f9e79f', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add(this.equipSetText);

    EQUIP_SLOTS.forEach((slot, i) => {
      const y = PANEL_Y + 118 + i * 90;
      c.add(this.add.image(GAME_WIDTH / 2, y, 'row').setScale(1, 1.6));
      c.add(this.add.image(48, y, 'equip' + slot.id).setScale(1.25));
      const title = this.add.text(94, y - 18, '', {
        fontFamily: FONT, fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const sub = this.add.text(94, y + 14, '', {
        fontFamily: FONT, fontSize: '16px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      c.add([title, sub]);
      this.equipRows.push({ title, sub });
    });
    return c;
  }

  // --- 퀘스트 탭 ------------------------------------------------------------

  private buildQuestTab(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setVisible(false);
    c.add(this.add.text(GAME_WIDTH / 2, PANEL_Y + 40, '일일 퀘스트 — 매일 자정 초기화', {
      fontFamily: FONT, fontSize: '16px', color: '#9a8bb8',
    }).setOrigin(0.5));

    DAILY_QUESTS.forEach((q, i) => {
      const y = PANEL_Y + 110 + i * 90;
      c.add(this.add.image(GAME_WIDTH / 2, y, 'row').setScale(1, 1.6));
      const desc = this.add.text(40, y - 18, q.desc, {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const prog = this.add.text(40, y + 14, '', {
        fontFamily: FONT, fontSize: '16px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 96, y, 'btn-buy');
      const btnText = this.add.text(GAME_WIDTH - 96, y, '받기', {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.state.claimQuest(q.id)) {
          this.pop(btn);
          this.showToast('퀘스트 보상을 받았습니다!');
        }
      });
      c.add([desc, prog, btn, btnText]);
      this.questRows.push({ desc, prog, btn, btnText });
    });
    return c;
  }

  private buildHeroTab(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);

    // 탭 공격력 행
    const tapY = PANEL_Y + 46;
    c.add(this.add.image(GAME_WIDTH / 2, tapY, 'row').setScale(1, 1.05));
    const swordIcon = this.add.graphics({ x: 40, y: tapY });
    swordIcon.fillStyle(0xf1c40f, 1).fillCircle(0, 0, 19);
    swordIcon.fillStyle(0x241b3e, 1).fillRect(-3, -12, 6, 17);
    swordIcon.fillRect(-8, 5, 16, 4);
    c.add(swordIcon);
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
    c.add([this.tapName, this.tapSub, this.tapBtn, this.tapBtnText]);

    // 영웅 행 x8 (페이지 주도 — 24명을 3페이지로)
    for (let i = 0; i < HEROES_PER_PAGE; i++) {
      const y = PANEL_Y + 100 + i * 54;
      c.add(this.add.image(GAME_WIDTH / 2, y, 'row'));
      const icon = this.add.image(40, y, 'hero0');
      const initial = this.add.text(40, y, '', {
        fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const name = this.add.text(74, y - 12, '', {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const sub = this.add.text(74, y + 12, '', {
        fontFamily: FONT, fontSize: '15px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 96, y, 'btn-buy');
      const btnText = this.add.text(GAME_WIDTH - 96, y, '', {
        fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const rowIdx = i;
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const id = this.heroPage * HEROES_PER_PAGE + rowIdx;
        if (id < HEROES.length && this.state.tryBuyHero(id)) this.pop(btn);
      });
      c.add([icon, initial, name, sub, btn, btnText]);
      this.heroRows.push({ icon, initial, name, sub, btn, btnText });
    }

    // 페이저 ◀ n / N ▶
    const pageY = GAME_HEIGHT - 20;
    const totalPages = Math.ceil(HEROES.length / HEROES_PER_PAGE);
    const prev = this.add.text(280, pageY, '◀', {
      fontFamily: FONT, fontSize: '22px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.heroPageLabel = this.add.text(GAME_WIDTH / 2, pageY, '', {
      fontFamily: FONT, fontSize: '17px', color: '#9a8bb8',
    }).setOrigin(0.5);
    const next = this.add.text(440, pageY, '▶', {
      fontFamily: FONT, fontSize: '22px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    prev.on('pointerdown', () => {
      this.heroPage = (this.heroPage + totalPages - 1) % totalPages;
      this.refreshPanel();
    });
    next.on('pointerdown', () => {
      this.heroPage = (this.heroPage + 1) % totalPages;
      this.refreshPanel();
    });
    c.add([prev, this.heroPageLabel, next]);
    return c;
  }

  private buildArtifactTab(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setVisible(false);

    this.relicText = this.add.text(GAME_WIDTH / 2, PANEL_Y + 40, '', {
      fontFamily: FONT, fontSize: '22px', color: '#d8b8ff', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add(this.relicText);
    c.add(this.add.text(GAME_WIDTH / 2, PANEL_Y + 68, '유물은 환생으로 얻고, 영구 강화에 사용합니다', {
      fontFamily: FONT, fontSize: '15px', color: '#9a8bb8',
    }).setOrigin(0.5));

    ARTIFACTS.forEach((a, i) => {
      const y = PANEL_Y + 116 + i * 62;
      c.add(this.add.image(GAME_WIDTH / 2, y, 'row').setScale(1, 1.15));
      c.add(this.add.image(42, y, 'artifact' + a.id));
      const name = this.add.text(76, y - 13, '', {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const desc = this.add.text(76, y + 13, '', {
        fontFamily: FONT, fontSize: '15px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 96, y, 'btn-buy');
      const btnText = this.add.text(GAME_WIDTH - 96, y, '', {
        fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.state.tryBuyArtifact(a.id)) this.pop(btn);
      });
      c.add([name, desc, btn, btnText]);
      this.artifactRows.push({ name, desc, btn, btnText });
    });
    return c;
  }

  private buildRankTab(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setVisible(false);

    this.rankNameText = this.add.text(40, PANEL_Y + 42, '', {
      fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    c.add(this.rankNameText);

    const nameBtn = this.add.image(GAME_WIDTH - 262, PANEL_Y + 42, 'btn-buy');
    const nameBtnT = this.add.text(GAME_WIDTH - 262, PANEL_Y + 42, '이름 변경', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    nameBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.changeName());

    const subBtn = this.add.image(GAME_WIDTH - 96, PANEL_Y + 42, 'btn-buy');
    const subBtnT = this.add.text(GAME_WIDTH - 96, PANEL_Y + 42, '점수 등록', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    subBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.submitScore());
    c.add([nameBtn, nameBtnT, subBtn, subBtnT]);

    this.rankStatus = this.add.text(GAME_WIDTH / 2, PANEL_Y + 80, '', {
      fontFamily: FONT, fontSize: '15px', color: '#9a8bb8',
    }).setOrigin(0.5);
    c.add(this.rankStatus);

    for (let i = 0; i < 10; i++) {
      const line = this.add.text(50, PANEL_Y + 116 + i * 42, '', {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff',
      }).setOrigin(0, 0.5);
      c.add(line);
      this.rankLines.push(line);
    }
    return c;
  }

  // --- 랭킹 동작 ------------------------------------------------------------

  private myName(): string {
    if (!this.state.playerName) {
      this.state.setPlayerName(`용사${1000 + Math.floor(Math.random() * 9000)}`);
    }
    return this.state.playerName;
  }

  private changeName(): void {
    const cur = this.myName();
    // 간단한 이름 입력 — 모바일/데스크톱 공용. 취소/헤드리스 환경이면 유지.
    const next = typeof window.prompt === 'function'
      ? window.prompt('닉네임 (2~12자)', cur) : null;
    if (next) this.state.setPlayerName(next);
    this.refreshRankHeader();
  }

  private async submitScore(): Promise<void> {
    const err = await this.lb.submit(this.myName(), this.state.maxStage, this.state.relicsEarned);
    this.showToast(err ?? '점수가 등록되었습니다!');
    if (!err) this.loadRanking();
  }

  private refreshRankHeader(): void {
    const modeTag = this.lb.mode === 'local' ? ' (로컬)' : '';
    this.rankNameText.setText(`${this.myName()}${modeTag}`);
  }

  private async loadRanking(): Promise<void> {
    this.refreshRankHeader();
    this.rankStatus.setText(this.lb.mode === 'local'
      ? '오프라인 모드 — Supabase 미설정 시 로컬 기록만 표시됩니다'
      : '불러오는 중...');
    const entries = await this.lb.top(10);
    if (entries === null) {
      this.rankStatus.setText('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
      this.renderRanking([]);
      return;
    }
    if (this.lb.mode === 'remote') {
      this.rankStatus.setText(entries.length === 0 ? '기록이 없습니다' : '');
    }
    this.renderRanking(entries);
  }

  private renderRanking(entries: LbEntry[]): void {
    this.rankLines.forEach((line, i) => {
      const e = entries[i];
      if (!e) { line.setText(''); return; }
      const me = e.isMe || e.name === this.state.playerName;
      line.setText(`${String(i + 1).padStart(2, ' ')}.  ${e.name}  —  스테이지 ${e.stage}`)
        .setColor(me ? '#f9e79f' : '#ffffff');
    });
  }

  // --- 이벤트 배선 ---------------------------------------------------------

  private bindEvents(): void {
    this.state.on('gold', () => this.refreshGold());
    this.state.on('upgrade', () => { this.refreshPanel(); this.refreshGold(); });
    this.state.on('stage', () => this.refreshStage());
    this.state.on('mode', () => this.refreshStage());
    this.state.on('prestige', () => this.refreshAll());
    this.state.on('quest', () => this.refreshPanel());
    this.state.on('drop', (...args: unknown[]) => {
      const item = args[0] as EquipItem;
      const equipped = args[1] as boolean;
      const r = RARITIES[item.rarity];
      const slot = EQUIP_SLOTS[item.slot];
      this.showToast(equipped
        ? `[${r.name}] ${slot.name} 획득! +${item.statPct}%`
        : `[${r.name}] ${slot.name} 드롭 (기존이 더 좋음)`);
      this.refreshPanel();
    });

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
    this.refreshSkillBar();
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
    this.prestigeLabel.setText(st.canPrestige() ? `환생 +${fmt(st.prestigeGain())}` : '환생');
    this.prestigeBtn.setAlpha(st.canPrestige() ? 1 : 0.45);
  }

  private refreshPanel(): void {
    if (!this.tapName) return; // buildPanel 이전 (create 초기) 호출 방어
    const st = this.state;
    this.tapName.setText(`탭 공격력  Lv.${st.tapLevel}`);
    this.tapSub.setText(`탭당 ${fmt(st.tapDamage())}`);
    this.tapBtnText.setText(fmt(st.tapCost()));
    const totalPages = Math.ceil(HEROES.length / HEROES_PER_PAGE);
    this.heroPageLabel.setText(`${this.heroPage + 1} / ${totalPages}`);
    this.heroRows.forEach((row, i) => {
      const id = this.heroPage * HEROES_PER_PAGE + i;
      const h = HEROES[id];
      const visible = !!h;
      [row.icon, row.initial, row.name, row.sub, row.btn, row.btnText]
        .forEach((o) => o.setVisible(visible));
      if (!h) return;
      const lvl = st.heroLevels[h.id];
      row.icon.setTexture('hero' + h.id);
      row.initial.setText(h.name.charAt(0));
      row.name.setText(`${h.name} · ${h.title}`);
      const passive = st.isHeroPassiveActive(h.id)
        ? ` · ${h.passive.desc}`
        : (lvl > 0 ? ` · ${HERO_PASSIVE_UNLOCK}렙: ${h.passive.desc}` : '');
      row.sub.setText(lvl === 0 ? '미고용' : `Lv.${lvl} · DPS ${fmt(st.heroDps(h.id))}${passive}`);
      row.btnText.setText(lvl === 0 ? `고용 ${fmt(st.heroCost(h.id))}` : fmt(st.heroCost(h.id)));
    });

    this.relicText.setText(`보유 유물  ${fmt(st.relics)}개`);
    ARTIFACTS.forEach((a, i) => {
      const row = this.artifactRows[i];
      const lvl = st.artifactLevels[a.id];
      row.name.setText(`${a.name}  Lv.${lvl}${a.maxLevel > 0 ? `/${a.maxLevel}` : ''}`);
      row.desc.setText(`레벨당 ${a.desc}`);
      row.btnText.setText(st.isArtifactMaxed(a.id) ? 'MAX' : `유물 ${fmt(st.artifactCost(a.id))}`);
    });

    // 장비 탭
    EQUIP_SLOTS.forEach((slot, i) => {
      const row = this.equipRows[i];
      const item = st.equipment[slot.id];
      const statName = slot.stat === 'tap' ? '탭 데미지' : slot.stat === 'dps' ? '영웅 DPS' : '골드 획득';
      if (item) {
        const r = RARITIES[item.rarity];
        row.title.setText(`${slot.name} · ${r.name}`)
          .setColor('#' + r.color.toString(16).padStart(6, '0'));
        row.sub.setText(`${statName} +${item.statPct}%  (스테이지 ${item.stage} 획득)`);
      } else {
        row.title.setText(`${slot.name} · 없음`).setColor('#8a7f9e');
        row.sub.setText(`${statName} 보너스 — 보스 처치로 획득`);
      }
    });

    const setPct = st.equipSetBonus();
    this.equipSetText.setText(setPct > 0
      ? `세트 효과 발동! 모든 데미지 +${Math.round(setPct * 100)}%`
      : '같은 등급 3종 장착 시 세트 효과 (모든 데미지 +10~60%)');

    // 퀘스트 탭
    st.ensureDaily();
    DAILY_QUESTS.forEach((q, i) => {
      const row = this.questRows[i];
      const prog = st.questProgress(q.id);
      const claimed = st.daily.claimed[q.id];
      const rewardTxt = q.reward === 'gold' ? '골드 보상' : `유물 ${q.amount}개`;
      row.prog.setText(claimed ? '완료!' : `${prog} / ${q.target} · ${rewardTxt}`);
      row.btnText.setText(claimed ? '완료' : '받기');
      this.setEnabled(row.btn, st.canClaimQuest(q.id));
    });

    // 광고 버튼 상태
    if (st.isGoldBoostActive()) {
      const min = Math.ceil(st.goldBoostLeft() / 60_000);
      this.boostBtnText.setText(`x2 ${min}분`);
      this.boostBtn.setAlpha(0.55);
    } else {
      this.boostBtnText.setText('AD 골드x2');
      this.boostBtn.setAlpha(1);
    }
    const cdOk = st.anySkillOnCooldown();
    this.cdBtn.setAlpha(cdOk ? 1 : 0.4);

    this.refreshAfford();
    this.refreshStage();
  }

  private refreshAfford(): void {
    const st = this.state;
    this.setEnabled(this.tapBtn, st.gold >= st.tapCost());
    this.heroRows.forEach((row, i) => {
      const id = this.heroPage * HEROES_PER_PAGE + i;
      if (id < HEROES.length) this.setEnabled(row.btn, st.gold >= st.heroCost(id));
    });
    ARTIFACTS.forEach((a, i) => {
      this.setEnabled(
        this.artifactRows[i].btn,
        !st.isArtifactMaxed(a.id) && st.relics >= st.artifactCost(a.id),
      );
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

  /** 하단 토스트 메시지 — 단일 인스턴스 재사용 (연속 호출 시 겹침 방지) */
  private toast: Phaser.GameObjects.Text | null = null;
  private showToast(msg: string): void {
    this.toast?.destroy();
    // depth 48: 스킬바 위, 모달 딤(50) 아래
    const t = this.add.text(GAME_WIDTH / 2, 640, msg, {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: '#241b3ecc', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(48);
    this.toast = t;
    this.tweens.add({
      targets: t, y: 610, alpha: 0, duration: 1400, ease: 'Quad.In', delay: 300,
      onComplete: () => { if (this.toast === t) this.toast = null; t.destroy(); },
    });
  }

  // --- 팝업 ---------------------------------------------------------------

  private showOfflinePopup(sec: number, gold: number): void {
    this.showPopup(
      '어서 오세요!',
      `${fmtDuration(sec)} 동안 자리를 비운 사이\n영웅들이 골드를 모았습니다.\n\n+${fmt(gold)} 골드`,
      [
        {
          label: 'AD 2배 받기',
          on: () => {
            this.showToast('광고 재생 중...');
            // 기본 보상은 이미 지급됨 — 광고 시청 시 동일량 추가 지급
            this.ads.offer('offline-x2', () => this.state.addGold(gold), (ok) => {
              if (ok) this.showToast(`+${fmt(gold)} 골드 추가 지급!`);
            });
          },
        },
        { label: '받기', on: () => { /* 이미 지급됨 */ } },
      ],
    );
  }

  private showPrestigePopup(): void {
    const st = this.state;
    if (!st.canPrestige()) {
      this.showPopup(
        '환생',
        `스테이지 25 이상 도달 시\n유물을 얻고 환생할 수 있습니다.\n유물은 유물 탭에서 영구 강화에 사용합니다.\n\n현재 최고 스테이지: ${st.maxStage}`,
        [{ label: '닫기', on: () => { /* noop */ } }],
      );
      return;
    }
    const gain = st.prestigeGain();
    this.showPopup(
      '환생하시겠습니까?',
      `골드·영웅·스테이지가 초기화됩니다.\n유물 +${fmt(gain)} 획득 (보유 ${fmt(st.relics)} → ${fmt(st.relics + gain)})\n구매한 유물 강화는 유지됩니다.`,
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

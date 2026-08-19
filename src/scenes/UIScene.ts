// ---------------------------------------------------------------------------
// UIScene: 상단 HUD + 스킬바 + 하단 탭 패널(영웅/유물/랭킹) + 팝업.
// GameScene 위에 병렬 실행되며 상태 이벤트 구독으로만 갱신한다.
// ---------------------------------------------------------------------------
import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, PANEL_Y, SKILL_BAR_Y, TAB_Y,
  HEROES, SKILLS, ARTIFACTS, MONSTERS_PER_STAGE,
  EQUIP_SLOTS, RARITIES, DAILY_QUESTS, EQUIP_DROP_CHANCE,
} from '../config.ts';
import type { EquipItem } from '../config.ts';
import {
  ACHIEVEMENTS, PETS, SKILL_TREE, TREE_BRANCH_NAMES, TREE_RESPEC_COST, treeNodeCost,
  GEM_PACKS, GEM_SINKS, EQUIP_BOX_RATES, RARITIES as RARITY_DEFS, VIP_TIERS,
} from '../config.ts';
import { GameState } from '../core/GameState.ts';
import { AdRewards } from '../core/AdRewards.ts';
import { IapService, MockIapProvider } from '../core/Iap.ts';
import * as Tournament from '../core/Tournament.ts';
import * as Season from '../core/Season.ts';
import * as ClanBoss from '../core/ClanBoss.ts';
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
  bg: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  btn: Phaser.GameObjects.Image;
  btnText: Phaser.GameObjects.Text;
}

const ARTIFACTS_PER_PAGE = 7;
const ACH_PER_PAGE = 8;

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
  private artifactSubTab = 0; // 0=유물, 1=스킬트리
  private artifactPage = 0;
  private artifactPageLabel!: Phaser.GameObjects.Text;
  private treeBranch = 0;
  private treeBranchToggle: { img: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text }[] = [];
  private achPage = 0;
  private achPageLabel!: Phaser.GameObjects.Text;
  private achPagerParts: Phaser.GameObjects.GameObject[] = [];
  private artifactToggle: { img: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text }[] = [];
  private artifactListParts: Phaser.GameObjects.GameObject[] = [];
  private treeParts: Phaser.GameObjects.GameObject[] = [];
  private spText!: Phaser.GameObjects.Text;
  private respecBtn!: Phaser.GameObjects.Image;
  private respecText!: Phaser.GameObjects.Text;
  private treeNodes: {
    bg: Phaser.GameObjects.Image;
    name: Phaser.GameObjects.Text;
    lvl: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
  }[] = [];

  private rankNameText!: Phaser.GameObjects.Text;
  private rankStatus!: Phaser.GameObjects.Text;
  private rankLines: Phaser.GameObjects.Text[] = [];

  private ads = new AdRewards();
  private iap = new IapService();
  private gemText!: Phaser.GameObjects.Text;
  private shopParts: Phaser.GameObjects.GameObject[] = [];
  private boostBtnText!: Phaser.GameObjects.Text;
  private boostBtn!: Phaser.GameObjects.Image;
  private cdBtn!: Phaser.GameObjects.Image;
  private equipRows: { title: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }[] = [];
  private equipSetText!: Phaser.GameObjects.Text;
  private questRows: {
    desc: Phaser.GameObjects.Text; prog: Phaser.GameObjects.Text;
    btn: Phaser.GameObjects.Image; btnText: Phaser.GameObjects.Text;
    bg: Phaser.GameObjects.Image;
  }[] = [];
  private achRows: {
    desc: Phaser.GameObjects.Text; prog: Phaser.GameObjects.Text;
    btn: Phaser.GameObjects.Image; btnText: Phaser.GameObjects.Text;
    bg: Phaser.GameObjects.Image;
  }[] = [];
  private questSubTab = 0; // 0=일일, 1=업적
  private questToggle: { img: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text }[] = [];
  private tourneyText!: Phaser.GameObjects.Text;
  private tourneyBtn!: Phaser.GameObjects.Image;
  private tourneyBtnText!: Phaser.GameObjects.Text;
  private petTexts: Phaser.GameObjects.Text[] = [];
  private rankSubTab = 0; // 0=개인, 1=클랜
  private rankToggle: { img: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text }[] = [];
  private personalView!: Phaser.GameObjects.Container;
  private clanView!: Phaser.GameObjects.Container;
  private clanHpFill!: Phaser.GameObjects.Image;
  private clanInfo!: Phaser.GameObjects.Text;
  private clanAtkBtn!: Phaser.GameObjects.Image;
  private clanAtkText!: Phaser.GameObjects.Text;

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
    this.achRows = [];
    this.questToggle = [];
    this.petTexts = [];
    this.artifactToggle = [];
    this.artifactListParts = [];
    this.treeParts = [];
    this.treeNodes = [];
    this.treeBranchToggle = [];
    this.artifactSubTab = 0;
    this.artifactPage = 0;
    this.treeBranch = 0;
    this.achPage = 0;
    this.achPagerParts = [];
    this.rankToggle = [];
    this.questSubTab = 0;
    this.rankSubTab = 0;
    this.heroPage = 0;
    this.skillSig = '';
    this.state = this.registry.get('state') as GameState;
    this.lb = new Leaderboard();
    this.shopParts = [];
    // QA 모드(?dev=1)에서는 Mock 결제로 상점 흐름 전체를 테스트할 수 있다
    if (new URLSearchParams(location.search).get('dev') === '1') {
      this.iap.setProvider(new MockIapProvider());
    }

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

    // 시즌 전환 보상 팝업
    const sr = this.registry.get('seasonReward') as { season: string; stage: number; relics: number } | undefined;
    if (sr) {
      this.showPopup(
        '시즌 종료!',
        `${sr.season} 시즌 기록: 스테이지 ${sr.stage}\n시즌 보상: 유물 +${sr.relics}\n새 시즌 랭킹이 시작되었습니다.`,
        [{ label: '받기', on: () => { /* 이미 지급됨 */ } }],
      );
    }

    // 토너먼트 정산 보상 팝업
    const tr = this.registry.get('tourneyReward') as { stage: number; relics: number } | undefined;
    if (tr) {
      this.showPopup(
        '토너먼트 결과',
        `지난 토너먼트 기록: 스테이지 ${tr.stage}\n보상: 유물 +${tr.relics}`,
        [{ label: '받기', on: () => { /* 이미 지급됨 */ } }],
      );
    }

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

    // 보석 카운터 (탭 → 상점)
    const gem = this.add.graphics({ x: 46, y: 126 });
    gem.fillStyle(0x8e44ad, 1);
    gem.fillTriangle(0, -9, 8, 0, -8, 0);
    gem.fillTriangle(-8, 0, 8, 0, 0, 10);
    gem.fillStyle(0xd8b8ff, 0.6);
    gem.fillTriangle(-3, -6, 3, -6, 0, -1);
    this.gemText = this.add.text(64, 126, '0  [상점]', {
      fontFamily: FONT, fontSize: '19px', color: '#d8b8ff', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.gemText.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openShop());

    // 광고 보상: 골드 x2 부스트 / 스킬 쿨다운 초기화
    this.boostBtn = this.add.image(288, 120, 'btn-ad');
    this.boostBtnText = this.add.text(288, 120, 'AD 골드x2', {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.boostBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.state.isGoldBoostActive()) return;
      this.showToast('광고 재생 중...');
      this.ads.offer('gold-boost', () => this.state.activateGoldBoost(), (ok) => {
        if (ok) { this.state.recordAdWatch(); this.showToast('30분간 골드 획득 2배!'); }
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
        if (ok) { this.state.recordAdWatch(); this.showToast('스킬 쿨다운이 초기화되었습니다!'); }
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
      const x = 70 + i * 116;
      const base = this.add.image(x, y, 'skill' + s.id).setDepth(5).setScale(0.92);
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

    // 펫 섹션 (보스 알 드롭으로 성장)
    c.add(this.add.text(GAME_WIDTH / 2, PANEL_Y + 402, '펫 — 보스가 6% 확률로 알을 떨어뜨립니다', {
      fontFamily: FONT, fontSize: '16px', color: '#9a8bb8',
    }).setOrigin(0.5));
    PETS.forEach((pt, i) => {
      const x = 85 + i * 110;
      const y = PANEL_Y + 452;
      const g = this.add.graphics({ x, y });
      const dark = Phaser.Display.Color.ValueToColor(pt.color).darken(30).color;
      g.fillStyle(dark, 1).fillCircle(0, 0, 26);
      g.fillStyle(pt.color, 1).fillCircle(0, -1, 22);
      c.add(g);
      c.add(this.add.text(x, y - 2, pt.glyph, {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#22182f', strokeThickness: 3,
      }).setOrigin(0.5));
      const lvl = this.add.text(x, y + 40, '', {
        fontFamily: FONT, fontSize: '14px', color: '#c9b8e8',
      }).setOrigin(0.5);
      c.add(lvl);
      this.petTexts.push(lvl);
    });
    return c;
  }

  // --- 퀘스트 탭 ------------------------------------------------------------

  private buildQuestTab(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0).setVisible(false);

    // 서브탭 토글 [일일 퀘스트 | 업적]
    ['일일 퀘스트', '업적'].forEach((label, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -110 : 110);
      const img = this.add.image(x, PANEL_Y + 44, i === 0 ? 'tab-on' : 'tab-off').setScale(1.4, 0.9);
      const txt = this.add.text(x, PANEL_Y + 44, label, {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.questSubTab = i;
        this.refreshPanel();
      });
      c.add([img, txt]);
      this.questToggle.push({ img, txt });
    });

    // 일일 퀘스트 3행 (내용은 오늘의 로테이션으로 refresh 에서 채움)
    for (let i = 0; i < 3; i++) {
      const y = PANEL_Y + 122 + i * 90;
      const bg = this.add.image(GAME_WIDTH / 2, y, 'row').setScale(1, 1.6);
      const desc = this.add.text(40, y - 18, '', {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const prog = this.add.text(40, y + 14, '', {
        fontFamily: FONT, fontSize: '16px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 96, y, 'btn-buy');
      const btnText = this.add.text(GAME_WIDTH - 96, y, '받기', {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const rowIdx = i;
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const qid = this.state.todaysQuests()[rowIdx];
        if (qid !== undefined && this.state.claimQuest(qid)) {
          this.pop(btn);
          this.showToast('퀘스트 보상을 받았습니다!');
        }
      });
      c.add([bg, desc, prog, btn, btnText]);
      this.questRows.push({ desc, prog, btn, btnText, bg });
    }

    // 업적 8행 (컴팩트, 페이지 기반 — 20종)
    for (let i = 0; i < ACH_PER_PAGE; i++) {
      const y = PANEL_Y + 100 + i * 47;
      const bg = this.add.image(GAME_WIDTH / 2, y, 'row').setScale(1, 0.82);
      const desc = this.add.text(40, y - 9, '', {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const prog = this.add.text(40, y + 12, '', {
        fontFamily: FONT, fontSize: '13px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 88, y, 'btn-buy').setScale(0.85, 0.75);
      const btnText = this.add.text(GAME_WIDTH - 88, y, '', {
        fontFamily: FONT, fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const rowIdx = i;
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const id = this.achPage * ACH_PER_PAGE + rowIdx;
        const a = ACHIEVEMENTS[id];
        if (a && this.state.claimAch(a.id)) {
          this.pop(btn);
          this.showToast(`업적 달성! 유물 +${a.rewardRelics}`);
        }
      });
      c.add([bg, desc, prog, btn, btnText]);
      this.achRows.push({ desc, prog, btn, btnText, bg });
    }

    // 업적 페이저
    const achPages = Math.ceil(ACHIEVEMENTS.length / ACH_PER_PAGE);
    const pY = GAME_HEIGHT - 20;
    const prev = this.add.text(280, pY, '◀', {
      fontFamily: FONT, fontSize: '22px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.achPageLabel = this.add.text(GAME_WIDTH / 2, pY, '', {
      fontFamily: FONT, fontSize: '17px', color: '#9a8bb8',
    }).setOrigin(0.5);
    const next = this.add.text(440, pY, '▶', {
      fontFamily: FONT, fontSize: '22px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    prev.on('pointerdown', () => {
      this.achPage = (this.achPage + achPages - 1) % achPages;
      this.refreshPanel();
    });
    next.on('pointerdown', () => {
      this.achPage = (this.achPage + 1) % achPages;
      this.refreshPanel();
    });
    c.add([prev, this.achPageLabel, next]);
    // 업적 서브탭에서만 보이도록 achRows 쪽 부속으로 함께 토글
    this.achPagerParts = [prev, this.achPageLabel, next];
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

    // 서브탭 [유물 | 스킬트리]
    ['유물', '스킬트리'].forEach((label, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -110 : 110);
      const img = this.add.image(x, PANEL_Y + 40, i === 0 ? 'tab-on' : 'tab-off').setScale(1.4, 0.9);
      const txt = this.add.text(x, PANEL_Y + 40, label, {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.artifactSubTab = i;
        this.refreshPanel();
      });
      c.add([img, txt]);
      this.artifactToggle.push({ img, txt });
    });

    this.relicText = this.add.text(GAME_WIDTH / 2, PANEL_Y + 78, '', {
      fontFamily: FONT, fontSize: '20px', color: '#d8b8ff', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add(this.relicText);

    // 유물 리스트: 7행 x 페이지 (40종)
    for (let i = 0; i < ARTIFACTS_PER_PAGE; i++) {
      const y = PANEL_Y + 118 + i * 58;
      const rowBg = this.add.image(GAME_WIDTH / 2, y, 'row').setScale(1, 1.06);
      const icon = this.add.image(42, y, 'artifact0');
      const name = this.add.text(76, y - 12, '', {
        fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const desc = this.add.text(76, y + 12, '', {
        fontFamily: FONT, fontSize: '14px', color: '#c9b8e8',
      }).setOrigin(0, 0.5);
      const btn = this.add.image(GAME_WIDTH - 96, y, 'btn-buy').setScale(1, 0.95);
      const btnText = this.add.text(GAME_WIDTH - 96, y, '', {
        fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const rowIdx = i;
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const id = this.artifactPage * ARTIFACTS_PER_PAGE + rowIdx;
        if (id < ARTIFACTS.length && this.state.tryBuyArtifact(id)) this.pop(btn);
      });
      c.add([rowBg, icon, name, desc, btn, btnText]);
      this.artifactRows.push({ name, desc, btn, btnText, bg: rowBg, icon });
      this.artifactListParts.push(rowBg, icon, name, desc, btn, btnText);
    }
    // 유물 페이저
    const apY = GAME_HEIGHT - 20;
    const aPages = Math.ceil(ARTIFACTS.length / ARTIFACTS_PER_PAGE);
    const aPrev = this.add.text(280, apY, '◀', {
      fontFamily: FONT, fontSize: '22px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.artifactPageLabel = this.add.text(GAME_WIDTH / 2, apY, '', {
      fontFamily: FONT, fontSize: '17px', color: '#9a8bb8',
    }).setOrigin(0.5);
    const aNext = this.add.text(440, apY, '▶', {
      fontFamily: FONT, fontSize: '22px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    aPrev.on('pointerdown', () => {
      this.artifactPage = (this.artifactPage + aPages - 1) % aPages;
      this.refreshPanel();
    });
    aNext.on('pointerdown', () => {
      this.artifactPage = (this.artifactPage + 1) % aPages;
      this.refreshPanel();
    });
    c.add([aPrev, this.artifactPageLabel, aNext]);
    this.artifactListParts.push(aPrev, this.artifactPageLabel, aNext);

    // --- 스킬트리 뷰: 계열 토글 + 선택 계열 6노드 (2열 x 3행) ---
    this.spText = this.add.text(60, PANEL_Y + 112, '', {
      fontFamily: FONT, fontSize: '19px', color: '#f9e79f', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.respecBtn = this.add.image(GAME_WIDTH - 96, PANEL_Y + 112, 'btn-buy');
    this.respecText = this.add.text(GAME_WIDTH - 96, PANEL_Y + 112, `리셋 유물${TREE_RESPEC_COST}`, {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.respecBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.showPopup(
        '스킬트리 초기화',
        `유물 ${TREE_RESPEC_COST}개를 소비하고\n모든 노드를 초기화합니다.\n사용한 SP 는 전액 돌려받습니다.`,
        [
          { label: '초기화', on: () => { if (this.state.respecTree()) this.showToast('스킬트리가 초기화되었습니다'); } },
          { label: '취소', on: () => { /* noop */ } },
        ],
      );
    });
    c.add([this.spText, this.respecBtn, this.respecText]);
    this.treeParts.push(this.spText, this.respecBtn, this.respecText);

    // 계열 토글 3버튼
    TREE_BRANCH_NAMES.forEach((bn, b) => {
      const x = 130 + b * 230;
      const img = this.add.image(x, PANEL_Y + 158, b === 0 ? 'tab-on' : 'tab-off').setScale(1.5, 0.85);
      const txt = this.add.text(x, PANEL_Y + 158, bn, {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.treeBranch = b;
        this.refreshPanel();
      });
      c.add([img, txt]);
      this.treeParts.push(img, txt);
      this.treeBranchToggle.push({ img, txt });
    });

    // 노드 셀 6개 (2열 x 3행) — 선택 계열의 티어 0~5
    for (let i = 0; i < 6; i++) {
      const x = 190 + (i % 2) * 340;
      const y = PANEL_Y + 250 + Math.floor(i / 2) * 120;
      const bg = this.add.image(x, y, 'node').setScale(1.45, 1.12);
      const name = this.add.text(x, y - 34, '', {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const lvl = this.add.text(x, y - 8, '', {
        fontFamily: FONT, fontSize: '14px', color: '#f9e79f',
      }).setOrigin(0.5);
      const desc = this.add.text(x, y + 24, '', {
        fontFamily: FONT, fontSize: '13px', color: '#9a8bb8', align: 'center', lineSpacing: 2,
      }).setOrigin(0.5);
      const cellIdx = i;
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const node = SKILL_TREE.filter((n) => n.branch === this.treeBranch)[cellIdx];
        if (!node) return;
        if (this.state.tryBuyNode(node.id)) {
          this.pop(bg);
        } else if (!this.state.isNodeUnlocked(node.id)) {
          this.showToast(`선행 노드 레벨 ${node.requiresLevel} 필요`);
        } else if (this.state.spAvailable() < treeNodeCost(node)) {
          this.showToast('SP가 부족합니다 (스테이지 10마다 +1, 환생 +2)');
        }
      });
      c.add([bg, name, lvl, desc]);
      this.treeParts.push(bg, name, lvl, desc);
      this.treeNodes.push({ bg, name, lvl, desc });
    }
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

    // 주말 토너먼트 카드
    c.add(this.add.image(GAME_WIDTH / 2, PANEL_Y + 92, 'row').setScale(1, 1.1));
    this.tourneyText = this.add.text(40, PANEL_Y + 92, '', {
      fontFamily: FONT, fontSize: '17px', color: '#f7dc6f', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.tourneyBtn = this.add.image(GAME_WIDTH - 96, PANEL_Y + 92, 'btn-buy');
    this.tourneyBtnText = this.add.text(GAME_WIDTH - 96, PANEL_Y + 92, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tourneyBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const st = Tournament.status();
      if (st.kind === 'open') {
        this.showPopup(
          '주말 토너먼트',
          '새 세이브로 최고 스테이지 경쟁!\n종료 시 스테이지 10당 유물 1개.\n메인 진행은 안전하게 보관됩니다.',
          [
            { label: '참가하기', on: () => Tournament.enter(this.state) },
            { label: '취소', on: () => { /* noop */ } },
          ],
        );
      } else if (st.kind === 'running') {
        this.showPopup(
          '토너먼트 종료',
          `현재 기록: 스테이지 ${this.state.maxStage}\n지금 종료하면 유물 ${Math.floor(this.state.maxStage / 10)}개를 받고\n메인 세이브로 돌아갑니다.`,
          [
            { label: '종료하기', on: () => Tournament.finish(this.state) },
            { label: '계속하기', on: () => { /* noop */ } },
          ],
        );
      }
    });
    c.add([this.tourneyText, this.tourneyBtn, this.tourneyBtnText]);

    // [개인|클랜] 토글
    ['개인 랭킹', '클랜'].forEach((label, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -110 : 110);
      const img = this.add.image(x, PANEL_Y + 134, i === 0 ? 'tab-on' : 'tab-off').setScale(1.4, 0.82);
      const txt = this.add.text(x, PANEL_Y + 134, label, {
        fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.rankSubTab = i;
        this.refreshPanel();
        if (i === 0) this.loadRanking();
      });
      c.add([img, txt]);
      this.rankToggle.push({ img, txt });
    });

    // 개인 뷰: 시즌/상태 + 리스트
    this.personalView = this.add.container(0, 0);
    this.rankStatus = this.add.text(GAME_WIDTH / 2, PANEL_Y + 168, '', {
      fontFamily: FONT, fontSize: '15px', color: '#9a8bb8',
    }).setOrigin(0.5);
    this.personalView.add(this.rankStatus);
    for (let i = 0; i < 8; i++) {
      const line = this.add.text(50, PANEL_Y + 198 + i * 41, '', {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff',
      }).setOrigin(0, 0.5);
      this.personalView.add(line);
      this.rankLines.push(line);
    }
    c.add(this.personalView);

    // 클랜 뷰: 주간 클랜 보스 (로컬 우선)
    this.clanView = this.add.container(0, 0).setVisible(false);
    this.clanView.add(this.add.text(GAME_WIDTH / 2, PANEL_Y + 172, '주간 클랜 보스', {
      fontFamily: FONT, fontSize: '22px', color: '#ff9c9c', fontStyle: 'bold',
    }).setOrigin(0.5));
    this.clanView.add(this.add.image(GAME_WIDTH / 2, PANEL_Y + 210, 'hpbar-bg'));
    this.clanHpFill = this.add.image(GAME_WIDTH / 2 - 165, PANEL_Y + 210, 'hpbar-fill').setOrigin(0, 0.5);
    this.clanView.add(this.clanHpFill);
    this.clanInfo = this.add.text(GAME_WIDTH / 2, PANEL_Y + 250, '', {
      fontFamily: FONT, fontSize: '17px', color: '#c9b8e8', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
    this.clanView.add(this.clanInfo);
    this.clanAtkBtn = this.add.image(GAME_WIDTH / 2, PANEL_Y + 330, 'btn-boss');
    this.clanAtkText = this.add.text(GAME_WIDTH / 2, PANEL_Y + 330, '공격! (30초 전투)', {
      fontFamily: FONT, fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.clanAtkBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const r = ClanBoss.attack(this.state);
      if (!r) return;
      this.showToast(r.killed
        ? `클랜 보스 처치! 유물 +${ClanBoss.CLAN_BOSS_REWARD_RELICS}`
        : `피해 ${fmt(r.damage)}!`);
      this.refreshPanel();
    });
    this.clanView.add([this.clanAtkBtn, this.clanAtkText]);
    this.clanView.add(this.add.text(GAME_WIDTH / 2, PANEL_Y + 400,
      '처치 보상: 유물 15개 · 공격권은 매주 월요일 3회 충전\n온라인 클랜(합산 랭킹·공동 보스)은 Supabase 연동 시 활성화', {
        fontFamily: FONT, fontSize: '14px', color: '#9a8bb8', align: 'center', lineSpacing: 6,
      }).setOrigin(0.5));
    c.add(this.clanView);
    return c;
  }

  private refreshClanView(): void {
    const b = ClanBoss.current(this.state);
    const ratio = b.hpMax > 0 ? b.hpLeft / b.hpMax : 0;
    this.clanHpFill.setScale(Math.max(0.001, ratio), 1);
    const left = ClanBoss.attacksLeft(this.state);
    this.clanInfo.setText(b.killed
      ? '이번 주 보스를 처치했습니다!\n다음 보스는 월요일에 나타납니다.'
      : `HP ${fmt(b.hpLeft)} / ${fmt(b.hpMax)}\n남은 공격권 ${left} / ${ClanBoss.CLAN_BOSS_ATTACKS_PER_WEEK}`);
    const can = !b.killed && left > 0;
    this.clanAtkBtn.setAlpha(can ? 1 : 0.4);
    if (can) this.clanAtkBtn.setInteractive({ useHandCursor: true });
    else this.clanAtkBtn.disableInteractive();
  }

  private refreshTourneyCard(): void {
    const st = Tournament.status();
    const hrs = (ms: number) => Math.max(1, Math.ceil(ms / 3_600_000));
    if (st.kind === 'closed') {
      const best = Tournament.historyBest();
      this.tourneyText.setText(`주말 토너먼트 — ${hrs(st.opensInMs)}시간 후 시작`
        + (best ? `  (최고 ${best.stage})` : ''));
      this.tourneyBtnText.setText('대기');
      this.setEnabled(this.tourneyBtn, false);
    } else if (st.kind === 'open') {
      this.tourneyText.setText(`토너먼트 진행 중! 마감까지 ${hrs(st.closesInMs)}시간`);
      this.tourneyBtnText.setText('참가');
      this.setEnabled(this.tourneyBtn, true);
    } else {
      this.tourneyText.setText(`참가 중 — 기록 ${this.state.maxStage} · ${hrs(st.closesInMs)}시간 남음`);
      this.tourneyBtnText.setText('종료');
      this.setEnabled(this.tourneyBtn, true);
    }
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
    const dLeft = Math.max(1, Math.ceil(Season.seasonEndsInMs() / 86_400_000));
    const seasonTag = `시즌 ${Season.seasonKey()} · 종료 D-${dLeft}`;
    this.rankStatus.setText(this.lb.mode === 'local'
      ? `${seasonTag} · 오프라인 모드`
      : `${seasonTag} · 불러오는 중...`);
    const entries = await this.lb.top(8);
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
    this.state.on('pet', (...args: unknown[]) => {
      const pt = PETS[args[0] as number];
      this.showToast(`펫 알 획득! ${pt.name} Lv.${args[1]} (${pt.desc})`);
    });
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
    const vip = this.state.vipTier();
    this.gemText?.setText(`${fmt(this.state.gems)}  [상점]${vip > 0 ? `  VIP${vip}` : ''}`);
    this.goldText.setText(fmt(this.state.gold));
    this.dpsText.setText(`DPS ${fmt(this.state.totalDps())}`);
    this.refreshAfford();
  }

  private refreshStage(): void {
    const st = this.state;
    const tourney = this.registry.get('tournamentMode') === true;
    this.stageText.setText(tourney ? `토너먼트 · 스테이지 ${st.stage}` : `스테이지 ${st.stage}`)
      .setColor(tourney ? '#f7dc6f' : '#ffffff');
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
      const active = st.heroPassivesActive(h.id);
      const next = h.passives.find((ps) => lvl < ps.unlockLevel);
      const passive = active > 0
        ? ` · P${active}/${h.passives.length} ${h.passives[active - 1].desc}`
        : (lvl > 0 && next ? ` · ${next.unlockLevel}렙: ${next.desc}` : '');
      row.sub.setText(lvl === 0 ? '미고용' : `Lv.${lvl} · DPS ${fmt(st.heroDps(h.id))}${passive}`);
      row.btnText.setText(lvl === 0 ? `고용 ${fmt(st.heroCost(h.id))}` : fmt(st.heroCost(h.id)));
    });

    this.relicText.setText(`보유 유물  ${fmt(st.relics)}개`);
    // 유물/스킬트리 서브탭 전환
    this.artifactToggle.forEach((t, i) => t.img.setTexture(i === this.artifactSubTab ? 'tab-on' : 'tab-off'));
    const showArts = this.artifactSubTab === 0;
    this.artifactListParts.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(showArts));
    this.treeParts.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(!showArts));
    if (showArts) {
      const aPages = Math.ceil(ARTIFACTS.length / 7);
      this.artifactPageLabel.setText(`${this.artifactPage + 1} / ${aPages}`);
      this.artifactRows.forEach((row, i) => {
        const id = this.artifactPage * 7 + i;
        const a = ARTIFACTS[id];
        [row.bg, row.icon, row.name, row.desc, row.btn, row.btnText]
          .forEach((o) => o.setVisible(!!a));
        if (!a) return;
        row.icon.setTexture('artifact' + (a.id % 20)); // 아이콘 20종 재사용
        const lvl = st.artifactLevels[a.id];
        row.name.setText(`${a.name}  Lv.${lvl}${a.maxLevel > 0 ? `/${a.maxLevel}` : ''}`);
        row.desc.setText(`레벨당 ${a.desc}`);
        row.btnText.setText(st.isArtifactMaxed(a.id) ? 'MAX' : `유물 ${fmt(st.artifactCost(a.id))}`);
      });
    } else {
      this.spText.setText(`SP ${st.spAvailable()} / 누적 ${st.spEarned()}`);
      this.setEnabled(this.respecBtn, st.spSpent() > 0 && st.relics >= TREE_RESPEC_COST);
      this.treeBranchToggle.forEach((t, b) => t.img.setTexture(b === this.treeBranch ? 'tab-on' : 'tab-off'));
      const branchNodes = SKILL_TREE.filter((n) => n.branch === this.treeBranch);
      this.treeNodes.forEach((node, i) => {
        const n = branchNodes[i];
        [node.bg, node.name, node.lvl, node.desc].forEach((o) => o.setVisible(!!n));
        if (!n) return;
        const lvl = st.treeLevels[n.id];
        const unlocked = st.isNodeUnlocked(n.id);
        const canBuy = st.canBuyNode(n.id);
        node.name.setText(n.name);
        node.lvl.setText(`Lv.${lvl} / ${n.maxLevel}`);
        node.desc.setText(`${n.desc} · SP ${treeNodeCost(n)}`);
        node.bg.setAlpha(unlocked ? (canBuy ? 1 : 0.75) : 0.3);
        node.name.setAlpha(unlocked ? 1 : 0.4);
        node.lvl.setColor(lvl >= n.maxLevel ? '#7bed8d' : canBuy ? '#f9e79f' : '#9a8bb8');
        node.desc.setAlpha(unlocked ? 1 : 0.4);
      });
    }

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

    // 퀘스트 탭 (서브탭: 일일/업적)
    st.ensureDaily();
    this.questToggle.forEach((t, i) => t.img.setTexture(i === this.questSubTab ? 'tab-on' : 'tab-off'));
    const showDaily = this.questSubTab === 0;
    const todays = st.todaysQuests();
    this.questRows.forEach((row, i) => {
      const qid = todays[i];
      const q = qid !== undefined ? DAILY_QUESTS[qid] : undefined;
      const vis = showDaily && !!q;
      [row.bg, row.desc, row.prog, row.btn, row.btnText].forEach((o) => o.setVisible(vis));
      if (!vis || !q) return;
      row.desc.setText(q.desc);
      const prog = st.questProgress(q.id);
      const claimed = st.daily.claimed[q.id];
      const rewardTxt = q.reward === 'gold' ? '골드 보상' : `유물 ${q.amount}개`;
      row.prog.setText(claimed ? '완료!' : `${prog} / ${q.target} · ${rewardTxt}`);
      row.btnText.setText(claimed ? '완료' : '받기');
      this.setEnabled(row.btn, st.canClaimQuest(q.id));
    });
    const achPages = Math.ceil(ACHIEVEMENTS.length / 8);
    this.achPageLabel?.setText(`${this.achPage + 1} / ${achPages}`);
    this.achPagerParts.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(!showDaily));
    this.achRows.forEach((row, i) => {
      const a = ACHIEVEMENTS[this.achPage * 8 + i];
      const vis = !showDaily && !!a;
      [row.bg, row.desc, row.prog, row.btn, row.btnText].forEach((o) => o.setVisible(vis));
      if (!vis || !a) return;
      row.desc.setText(a.desc);
      const claimed = st.achClaimed[a.id];
      row.prog.setText(claimed ? '완료!' : `${fmt(st.achProgress(a.id))} / ${fmt(a.target)} · 유물 ${a.rewardRelics}`);
      row.btnText.setText(claimed ? '완료' : '받기');
      this.setEnabled(row.btn, st.canClaimAch(a.id));
    });
    this.refreshTourneyCard();
    PETS.forEach((pt, i) => {
      const lvl = st.petLevels[pt.id];
      this.petTexts[i].setText(lvl > 0 ? `${pt.name} Lv.${lvl}` : `${pt.name} —`)
        .setColor(lvl > 0 ? '#ffffff' : '#6f6488');
    });
    this.rankToggle.forEach((t, i) => t.img.setTexture(i === this.rankSubTab ? 'tab-on' : 'tab-off'));
    this.personalView?.setVisible(this.rankSubTab === 0);
    this.clanView?.setVisible(this.rankSubTab === 1);
    if (this.rankSubTab === 1) this.refreshClanView();

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
    this.artifactRows.forEach((row, i) => {
      const id = this.artifactPage * 7 + i;
      const a = ARTIFACTS[id];
      if (a) {
        this.setEnabled(
          row.btn,
          this.artifactSubTab === 0 && !st.isArtifactMaxed(a.id) && st.relics >= st.artifactCost(a.id),
        );
      }
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

  // --- 상점 (보석) ----------------------------------------------------------

  private closeShop(): void {
    this.shopParts.forEach((o) => o.destroy());
    this.shopParts = [];
  }

  private openShop(): void {
    if (this.shopParts.length) return; // 이미 열림
    const st = this.state;
    const parts = this.shopParts;
    const dim = this.add.image(0, 0, 'dim').setOrigin(0, 0).setDepth(70).setInteractive();
    parts.push(dim);
    const panelTop = 120;
    const bg = this.add.image(GAME_WIDTH / 2, 640, 'panel').setDepth(71).setScale(0.94, 1.9);
    parts.push(bg);
    const title = this.add.text(GAME_WIDTH / 2, panelTop + 40, '상점', {
      fontFamily: FONT, fontSize: '30px', color: '#f9e79f', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(72);
    parts.push(title);
    const close = this.add.text(GAME_WIDTH - 70, panelTop + 40, '✕', {
      fontFamily: FONT, fontSize: '30px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(72).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.closeShop());
    parts.push(close);

    const row = (y: number, name: string, sub: string, btnLabel: string,
      enabled: boolean, onBuy: () => void): void => {
      const rbg = this.add.image(GAME_WIDTH / 2, y, 'row').setDepth(72).setScale(1, 1.35);
      const nameT = this.add.text(48, y - 15, name, {
        fontFamily: FONT, fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(73);
      const subT = this.add.text(48, y + 13, sub, {
        fontFamily: FONT, fontSize: '13px', color: '#9a8bb8',
      }).setOrigin(0, 0.5).setDepth(73);
      const btn = this.add.image(GAME_WIDTH - 100, y, 'btn-buy').setDepth(73);
      const btnT = this.add.text(GAME_WIDTH - 100, y, btnLabel, {
        fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(74);
      btn.setAlpha(enabled ? 1 : 0.4);
      if (enabled) {
        btn.setInteractive({ useHandCursor: true }).on('pointerdown', onBuy);
      }
      parts.push(rbg, nameT, subT, btn, btnT);
    };

    // 보석 팩 (구매)
    let y = panelTop + 100;
    parts.push(this.add.text(48, y - 34, `보석 구매 ${this.iap.isAvailable() ? '' : '— 상점 준비 중 (스토어 연동 후 활성화)'}`, {
      fontFamily: FONT, fontSize: '15px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(72));
    GEM_PACKS.forEach((pk) => {
      const sub = `보석 ${pk.gems}${pk.bonusDesc ? ` · ${pk.bonusDesc}` : ''}`;
      const soldOut = this.iap.alreadyPurchased(pk.id);
      row(y, pk.name, sub, soldOut ? '구매완료' : `₩${pk.priceKrw.toLocaleString()}`,
        this.iap.isAvailable() && !soldOut, () => {
          this.showToast('결제 진행 중...');
          void this.iap.buy(pk.id, (gems) => {
            st.grantGems(gems, true);
            if (pk.id === 'starter') {
              // 스타터 팩: 전설 장비 1개 동봉
              const slot = Math.floor(Math.random() * 3);
              st.equipment[slot] = { slot, rarity: 3, statPct: Math.min(300, 30 + st.stage * 2), stage: st.stage };
              st.emit('upgrade');
            }
          }).then((r) => {
            this.showToast(r.ok ? '구매 완료! 보석이 지급되었습니다.' : (r.reason ?? '구매 실패'));
            this.closeShop();
            this.refreshGold();
          });
        });
      y += 74;
    });

    // 보석 사용 (싱크)
    y += 24;
    parts.push(this.add.text(48, y - 34, '보석 사용', {
      fontFamily: FONT, fontSize: '15px', color: '#c9b8e8', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(72));
    const sinks: { name: string; sub: string; cost: number; can: boolean; run: () => boolean }[] = [
      {
        name: '스킬 쿨다운 초기화', sub: '모든 스킬을 즉시 사용 가능',
        cost: GEM_SINKS.cooldownReset, can: st.anySkillOnCooldown(), run: () => st.gemCooldownReset(),
      },
      {
        name: '골드 팩', sub: '현재 스테이지 약 10분치 파밍 골드',
        cost: GEM_SINKS.goldPack, can: true, run: () => st.gemGoldPack(),
      },
      {
        name: '장비 상자', sub: `확률: ${EQUIP_BOX_RATES.map((r) => `${RARITY_DEFS[r.rarity].name} ${r.pct}%`).join(' / ')}`,
        cost: GEM_SINKS.equipBox, can: true, run: () => st.gemEquipBox(),
      },
      {
        name: '스킬트리 초기화', sub: `유물 ${TREE_RESPEC_COST}개 대신 보석으로`,
        cost: GEM_SINKS.treeRespec, can: st.spSpent() > 0, run: () => st.gemRespecTree(),
      },
    ];
    sinks.forEach((sk) => {
      row(y, sk.name, sk.sub, `보석 ${sk.cost}`, sk.can && st.gems >= sk.cost, () => {
        if (sk.run()) {
          this.showToast(`${sk.name} 완료!`);
          this.closeShop();
        }
      });
      y += 74;
    });

    // VIP 안내 + 규제 고지
    const vip = st.vipTier();
    const next = VIP_TIERS[vip + 1];
    parts.push(this.add.text(GAME_WIDTH / 2, y + 6,
      `VIP ${vip} — 오프라인 상한 +${VIP_TIERS[vip].offlineCapBonusHr}시간 · 퀘스트 골드 +${VIP_TIERS[vip].questGoldPct}%`
      + (next ? `\n다음 티어까지 누적 보석 ${next.need - st.gemsPurchased}개`
        : '\n최고 티어입니다') + '\n확률형 상품(장비 상자)의 확률은 위 표기와 같습니다.', {
        fontFamily: FONT, fontSize: '13px', color: '#9a8bb8', align: 'center', lineSpacing: 5,
      }).setOrigin(0.5, 0).setDepth(72));
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
              if (ok) { this.state.recordAdWatch(); this.showToast(`+${fmt(gold)} 골드 추가 지급!`); }
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

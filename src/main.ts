import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config.ts';
import { GameState } from './core/GameState.ts';
import { initLang } from './core/i18n.ts';
import { en } from './core/locales/en.ts';
import { Analytics } from './core/Analytics.ts';
import * as Tournament from './core/Tournament.ts';
import * as Season from './core/Season.ts';
import * as ClanBoss from './core/ClanBoss.ts';
import * as DevTools from './core/DevTools.ts';
import { Sfx } from './sfx.ts';
import { BootScene } from './scenes/BootScene.ts';
import { GameScene } from './scenes/GameScene.ts';
import { UIScene } from './scenes/UIScene.ts';

declare global {
  interface Window {
    __taptap?: {
      game: Phaser.Game; state: GameState;
      tourney: typeof Tournament; season: typeof Season; clanBoss: typeof ClanBoss;
      dev: typeof DevTools; sfx: typeof Sfx;
    };
  }
}

function boot(): void {
  if (window.__taptap) return; // vite HMR 중복 생성 방지

  initLang({ en });
  const state = new GameState();
  const awaySec = state.load();
  state.ensureDaily();
  // 토너먼트: 만료 자동 정산(리로드됨) / 미지급 보상 수령
  const tourneyReward = Tournament.bootCheck(state);
  if (tourneyReward) state.addRelics(tourneyReward.relics);
  // 시즌: 시즌 전환 시 지난 시즌 보상 지급
  const seasonReward = Season.rollover(state.maxStage);
  if (seasonReward) state.addRelics(seasonReward.relics);
  Analytics.debug = import.meta.env.DEV; // 개발 모드에서만 콘솔 출력
  Analytics.track('session_start', {
    resumed: GameState.hasSave(),
    offlineSec: Math.round(awaySec),
    stage: state.stage,
    maxStage: state.maxStage,
    relics: state.relicsEarned,
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#0d0a1a',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance',
    },
    input: { activePointers: 4 }, // 멀티터치 연타 지원
    scene: [BootScene, GameScene, UIScene],
  });

  game.registry.set('state', state);

  // 오프라인 보상: 즉시 지급 + UIScene 팝업용 기록
  if (awaySec > 0) {
    const reward = state.offlineGold(awaySec);
    if (reward > 0) {
      state.addGold(reward);
      game.registry.set('offlineReward', { sec: awaySec, gold: reward });
    }
  }
  if (tourneyReward) game.registry.set('tourneyReward', tourneyReward);
  if (seasonReward) game.registry.set('seasonReward', seasonReward);
  game.registry.set('tournamentMode', Tournament.isEntered());

  // 자동 저장: 5초 주기 + 백그라운드 전환/종료 시
  // (save() 내부에서 세이브 세대를 검사해, 다른 탭이 더 최신이면 쓰지 않는다)
  setInterval(() => state.save(), 5000);
  setInterval(() => state.ensureDaily(), 60_000); // 자정 넘김 감지
  setInterval(() => Season.snapshot(state.maxStage), 30_000); // 시즌 기록 스냅샷
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') state.save();
  });
  window.addEventListener('beforeunload', () => state.save());
  // 다른 탭의 저장 감지 → 이 탭은 stale 로 전환 (진행 롤백 방지)
  window.addEventListener('storage', (e) => {
    if (e.key === GameState.SAVE_KEY) {
      state.checkExternalWrite(e.newValue);
      if (state.isStale()) {
        console.warn('[taptap] 다른 탭에서 게임이 실행 중입니다. 이 탭은 더 이상 저장하지 않습니다.');
      }
    }
  });

  // E2E 테스트/디버깅 훅
  window.__taptap = { game, state, tourney: Tournament, season: Season, clanBoss: ClanBoss, dev: DevTools, sfx: Sfx };

  // QA 패널: ?dev=1 일 때만 (동적 import — 일반 플레이 경로엔 미로드)
  if (new URLSearchParams(location.search).get('dev') === '1') {
    import('./devpanel.ts').then((m) => m.mountDevPanel(state));
  }
}

boot();

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { GameState } from './core/GameState';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

declare global {
  interface Window {
    __taptap?: { game: Phaser.Game; state: GameState };
  }
}

function boot(): void {
  if (window.__taptap) return; // vite HMR 중복 생성 방지

  const state = new GameState();
  const awaySec = state.load();

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

  // 자동 저장: 5초 주기 + 백그라운드 전환/종료 시
  setInterval(() => state.save(), 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') state.save();
  });
  window.addEventListener('beforeunload', () => state.save());

  // E2E 테스트/디버깅 훅
  window.__taptap = { game, state };
}

boot();

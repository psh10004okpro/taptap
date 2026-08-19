// ---------------------------------------------------------------------------
// 보상형 광고 훅 — SDK 없이도 게임 시스템으로 먼저 존재한다.
// 실제 연동(AdMob/AppLovin via Capacitor)은 AdProvider 구현체 교체만으로 끝난다.
// 보상 슬롯:
//   gold-boost  : 골드 획득 x2, 30분 (GameState.activateGoldBoost)
//   cooldowns   : 모든 스킬 쿨다운 초기화 (GameState.resetSkillCooldowns)
//   offline-x2  : 오프라인 보상 2배 (오프라인 팝업에서 1회)
// ---------------------------------------------------------------------------
import { Analytics } from './Analytics';

export type AdSlot = 'gold-boost' | 'cooldowns' | 'offline-x2';

export interface AdProvider {
  /** 광고 재생 가능 여부 (로드 완료 등) */
  isReady(slot: AdSlot): boolean;
  /** 광고 재생. 시청 완료 시 onReward, 중도 이탈/실패 시 onFail */
  show(slot: AdSlot, onReward: () => void, onFail: () => void): void;
}

/** 개발/미연동 모드: 짧은 지연 후 항상 보상 (실광고 흐름과 동일한 비동기 경로) */
export class MockAdProvider implements AdProvider {
  isReady(): boolean { return true; }
  show(_slot: AdSlot, onReward: () => void): void {
    setTimeout(onReward, 600);
  }
}

export class AdRewards {
  private provider: AdProvider;

  constructor(provider: AdProvider = new MockAdProvider()) {
    this.provider = provider;
  }

  /** 실제 SDK 연동 시 교체 지점 */
  setProvider(p: AdProvider): void { this.provider = p; }

  isReady(slot: AdSlot): boolean { return this.provider.isReady(slot); }

  /** 광고 제안→시청→보상 흐름. 보상 지급은 콜백에서 (GameState 메서드 경유) */
  offer(slot: AdSlot, grant: () => void, onDone?: (rewarded: boolean) => void): void {
    Analytics.track('ad_offer', { slot });
    if (!this.provider.isReady(slot)) {
      onDone?.(false);
      return;
    }
    this.provider.show(
      slot,
      () => {
        Analytics.track('ad_reward', { slot });
        grant();
        onDone?.(true);
      },
      () => {
        Analytics.track('ad_abort', { slot });
        onDone?.(false);
      },
    );
  }
}

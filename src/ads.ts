// ---------------------------------------------------------------------------
// AdMob 보상형 광고 프로바이더 (플랫폼 글루 — core/ 는 순수 로직 유지).
// core/AdRewards.ts 의 AdProvider 를 구현하며, 교체 지점은 여기 하나다.
//
// - 네이티브(Capacitor)에서만 동작한다. 웹/개발은 Mock 이 그대로 쓰인다.
// - 플러그인은 동적 import — 웹 번들에 SDK 셸이 섞이지 않는다.
// - 광고 단위 ID 는 빌드 환경변수. 미설정 시 구글 공식 테스트 단위로 떨어진다
//   (실광고를 실수로 자기 계정에 태우는 것보다 테스트 광고가 안전하다).
// ---------------------------------------------------------------------------
import { Capacitor } from '@capacitor/core';
import type { AdProvider, AdSlot } from './core/AdRewards.ts';

/** 구글 공식 테스트 광고 단위 (안드로이드 보상형) */
const TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917';

const env = import.meta.env as Record<string, string | undefined>;
const UNIT_ID = env.VITE_ADMOB_REWARDED_ID ?? TEST_REWARDED;
/** 단위 ID 를 지정하지 않았다면 테스트 광고로 요청한다 */
const IS_TESTING = !env.VITE_ADMOB_REWARDED_ID;

type AdMobModule = typeof import('@capacitor-community/admob');

export class AdMobProvider implements AdProvider {
  private mod: AdMobModule | null = null;
  private loaded = false;      // 다음 1회 재생 가능한 광고가 준비됐는지
  private loading = false;
  private showing = false;

  /** 네이티브에서만 실 SDK 를 쓴다 */
  static supported(): boolean {
    return Capacitor.isNativePlatform();
  }

  /** SDK 초기화 + 첫 광고 선로딩. 실패해도 게임은 그대로 진행된다(isReady=false). */
  async init(): Promise<void> {
    if (!AdMobProvider.supported()) return;
    try {
      this.mod = await import('@capacitor-community/admob');
      await this.mod.AdMob.initialize({ initializeForTesting: IS_TESTING });
      void this.preload();
    } catch {
      this.mod = null; // 플러그인 미설치/초기화 실패 → 광고 슬롯은 조용히 비활성
    }
  }

  private async preload(): Promise<void> {
    if (!this.mod || this.loaded || this.loading) return;
    this.loading = true;
    try {
      await this.mod.AdMob.prepareRewardVideoAd({ adId: UNIT_ID, isTesting: IS_TESTING });
      this.loaded = true;
    } catch {
      this.loaded = false; // 재고 없음/네트워크 — 다음 offer 때 다시 시도한다
    } finally {
      this.loading = false;
    }
  }

  isReady(_slot: AdSlot): boolean {
    if (!this.mod) return false;
    if (!this.loaded) void this.preload(); // 다음 기회를 위해 미리 채운다
    return this.loaded;
  }

  show(_slot: AdSlot, onReward: () => void, onFail: () => void): void {
    if (!this.mod || !this.loaded || this.showing) {
      onFail();
      return;
    }
    this.showing = true;
    this.loaded = false; // 1회성 — 재생 후 반드시 다시 로드한다
    let settled = false;
    const finish = (rewarded: boolean): void => {
      if (settled) return;
      settled = true;
      this.showing = false;
      void this.preload();
      (rewarded ? onReward : onFail)();
    };
    // showRewardVideoAd 는 보상 획득 시 resolve, 중도 이탈/실패 시 reject 한다
    this.mod.AdMob.showRewardVideoAd()
      .then(() => finish(true))
      .catch(() => finish(false));
  }
}

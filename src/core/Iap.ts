// ---------------------------------------------------------------------------
// IAP 훅 — 결제 SDK 없이도 상점 시스템이 완전히 동작한다.
// 실제 연동은 IapProvider 구현체 교체:
//   - 웹/개발: MockIapProvider (?dev=1 에서만 결제 성공 — 기본은 Unavailable)
//   - 안드로이드: Capacitor 결제 플러그인 → 영수증을 Edge Function(verify-purchase)
//     에 보내 서버 검증 후 지급 (supabase/functions/verify-purchase)
// 지급은 반드시 onGranted 콜백(=서버 검증 성공) 이후에만 일어난다.
// ---------------------------------------------------------------------------
import { GEM_PACKS } from '../config.ts';
import { Analytics } from './Analytics.ts';

export interface IapResult {
  ok: boolean;
  /** 사용자에게 보여줄 실패 사유 (ok=false 일 때) */
  reason?: string;
}

export interface IapProvider {
  /** 상점 사용 가능 여부 (스토어 초기화/네트워크) */
  isAvailable(): boolean;
  /**
   * 구매 시작. 결제 → (실연동에선) 서버 영수증 검증까지 끝난 뒤 resolve.
   * ok=true 반환 시에만 호출측이 재화를 지급한다.
   */
  purchase(productId: string): Promise<IapResult>;
}

/** 기본: 상점 비활성 (실 스토어 연동 전 프로덕션 기본값) */
export class UnavailableIapProvider implements IapProvider {
  isAvailable(): boolean { return false; }
  purchase(): Promise<IapResult> {
    return Promise.resolve({ ok: false, reason: '상점 준비 중입니다.' });
  }
}

/** 개발/QA 용: 짧은 지연 후 항상 성공 (?dev=1 에서만 장착) */
export class MockIapProvider implements IapProvider {
  isAvailable(): boolean { return true; }
  purchase(productId: string): Promise<IapResult> {
    void productId;
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 500));
  }
}

export class IapService {
  private provider: IapProvider;
  /** 스타터 팩 등 1회 한정 상품 구매 기록 (세이브 밖 — 서버 원장이 진실) */
  private purchasedOnce = new Set<string>();

  constructor(provider: IapProvider = new UnavailableIapProvider()) {
    this.provider = provider;
    try {
      const raw = localStorage.getItem('taptap-iap-once');
      if (raw) (JSON.parse(raw) as string[]).forEach((id) => this.purchasedOnce.add(id));
    } catch { /* ignore */ }
  }

  setProvider(p: IapProvider): void { this.provider = p; }
  isAvailable(): boolean { return this.provider.isAvailable(); }

  isOnceOnly(productId: string): boolean { return productId === 'starter'; }
  alreadyPurchased(productId: string): boolean {
    return this.isOnceOnly(productId) && this.purchasedOnce.has(productId);
  }

  /** 구매 흐름. 성공 시 onGranted(gems) 를 호출해 지급을 위임한다. */
  async buy(productId: string, onGranted: (gems: number) => void): Promise<IapResult> {
    const pack = GEM_PACKS.find((p) => p.id === productId);
    if (!pack) return { ok: false, reason: '알 수 없는 상품입니다.' };
    if (this.alreadyPurchased(productId)) return { ok: false, reason: '이미 구매한 상품입니다.' };
    Analytics.track('iap_start', { product: productId });
    const result = await this.provider.purchase(productId);
    if (!result.ok) {
      Analytics.track('iap_fail', { product: productId, reason: result.reason ?? '' });
      return result;
    }
    if (this.isOnceOnly(productId)) {
      this.purchasedOnce.add(productId);
      try {
        localStorage.setItem('taptap-iap-once', JSON.stringify([...this.purchasedOnce]));
      } catch { /* ignore */ }
    }
    Analytics.track('iap_purchase', { product: productId, gems: pack.gems, priceKrw: pack.priceKrw });
    onGranted(pack.gems);
    return { ok: true };
  }
}

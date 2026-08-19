// ---------------------------------------------------------------------------
// 분석 이벤트 코어 — Phaser 비의존. 이벤트 정의는 docs/ANALYTICS.md.
// 싱크(전송처)는 플러거블: 기본은 링버퍼 + (개발 모드) 콘솔.
// Firebase/Amplitude/Supabase 연동 시 setSink 하나만 갈아끼우면 된다.
// ---------------------------------------------------------------------------

export interface AnalyticsEvent {
  name: string;
  params: Record<string, unknown>;
  /** epoch ms */
  t: number;
  /** 세션 식별자 (부팅마다 갱신) */
  session: string;
}

export type AnalyticsSink = (e: AnalyticsEvent) => void;

const BUFFER_MAX = 300;

class AnalyticsImpl {
  private sink: AnalyticsSink | null = null;
  private buffer: AnalyticsEvent[] = [];
  private session = `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  /** true 면 콘솔에도 출력 (개발 확인용) */
  debug = false;

  track(name: string, params: Record<string, unknown> = {}): void {
    const e: AnalyticsEvent = { name, params, t: Date.now(), session: this.session };
    this.buffer.push(e);
    if (this.buffer.length > BUFFER_MAX) this.buffer.shift();
    if (this.debug) console.info('[analytics]', name, params);
    try { this.sink?.(e); } catch { /* 싱크 오류가 게임을 깨지 않게 */ }
  }

  /** 전송처 연결. 연결 시점까지 쌓인 버퍼를 재생할지 선택 */
  setSink(sink: AnalyticsSink, replayBuffer = true): void {
    this.sink = sink;
    if (replayBuffer) this.buffer.forEach((e) => { try { sink(e); } catch { /* ignore */ } });
  }

  /** 테스트/디버깅용 스냅샷 */
  snapshot(): readonly AnalyticsEvent[] { return this.buffer; }
}

/** 전역 싱글턴 — GameState 등 어디서든 Analytics.track(...) */
export const Analytics = new AnalyticsImpl();

// ---------------------------------------------------------------------------
// Haptics: 진동 (모바일 전용, navigator.vibrate 미지원 환경은 무음 무해).
// 설정은 기기 로컬(localStorage).
// ---------------------------------------------------------------------------

const KEY = 'taptap-vibrate';

class HapticsEngine {
  private on: boolean;

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    this.on = saved !== '0'; // 기본 켜짐
  }

  isEnabled(): boolean { return this.on; }

  toggle(): boolean {
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? '1' : '0'); } catch { /* noop */ }
    return this.on;
  }

  buzz(ms: number): void {
    if (!this.on) return;
    try { navigator.vibrate?.(ms); } catch { /* 미지원 — 무시 */ }
  }
}

export const Haptics = new HapticsEngine();

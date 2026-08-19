// ---------------------------------------------------------------------------
// Sfx: Web Audio 절차 합성 효과음 — 외부 오디오 파일 없이 코드로만 생성한다.
// 프레젠테이션 계층 (core 아님). 음소거 설정은 기기 로컬(localStorage).
// ---------------------------------------------------------------------------

export type SfxName =
  | 'tap' | 'crit' | 'kill' | 'coin' | 'buy' | 'tab' | 'skill'
  | 'bossSpawn' | 'bossWin' | 'bossFail' | 'prestige' | 'claim' | 'error';

const MUTE_KEY = 'taptap-sfx-muted';
const VOL_KEY = 'taptap-sfx-vol';

/** 이름별 최소 재생 간격(ms) — 연타/분신술 스팸 방지 */
const THROTTLE: Record<SfxName, number> = {
  tap: 30, crit: 60, kill: 70, coin: 90, buy: 60, tab: 40, skill: 120,
  bossSpawn: 300, bossWin: 300, bossFail: 300, prestige: 500, claim: 120,
  error: 120,
};

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Partial<Record<SfxName, number>> = {};
  private muted: boolean;
  private vol: number;

  constructor() {
    let saved: string | null = null;
    let vol: string | null = null;
    try {
      saved = localStorage.getItem(MUTE_KEY);
      vol = localStorage.getItem(VOL_KEY);
    } catch { /* 사파리 프라이빗 등 */ }
    this.muted = saved === '1';
    const v = Number(vol);
    this.vol = Number.isFinite(v) && vol !== null ? Math.min(1, Math.max(0, v)) : 0.5;
    // 브라우저 자동재생 정책: 첫 사용자 제스처에서 컨텍스트를 깨운다
    document.addEventListener('pointerdown', () => this.unlock(), { capture: true });
  }

  isEnabled(): boolean { return !this.muted; }
  volume(): number { return this.vol; }

  setVolume(v: number): void {
    this.vol = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(VOL_KEY, String(this.vol)); } catch { /* noop */ }
    if (this.master) this.master.gain.value = this.vol;
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* noop */ }
    if (!this.muted) this.unlock();
    return !this.muted;
  }

  private unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol;
        this.master.connect(this.ctx.destination);
      } catch { return; } // WebAudio 미지원 환경은 조용히 무음
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: SfxName): void {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const now = performance.now();
    if (now - (this.last[name] ?? -1e9) < THROTTLE[name]) return;
    this.last[name] = now;
    const t = ctx.currentTime;
    switch (name) {
      case 'tap': this.blip(t, 'sine', 210, 95, 0.055, 0.16); break;
      case 'crit':
        this.blip(t, 'square', 560, 170, 0.09, 0.14);
        this.noise(t, 0.05, 0.1, 2400);
        break;
      case 'kill': this.blip(t, 'sine', 280, 540, 0.09, 0.18); break;
      case 'coin':
        this.tone(t, 'sine', 988, 0.05, 0.12);
        this.tone(t + 0.055, 'sine', 1319, 0.09, 0.12);
        break;
      case 'buy':
        this.tone(t, 'square', 440, 0.05, 0.08);
        this.tone(t + 0.06, 'square', 660, 0.07, 0.08);
        break;
      case 'tab': this.noise(t, 0.025, 0.07, 3000); break;
      case 'skill':
        this.sweepNoise(t, 0.28, 0.16, 500, 2600);
        this.blip(t, 'sawtooth', 180, 420, 0.22, 0.07);
        break;
      case 'bossSpawn':
        this.blip(t, 'sawtooth', 130, 60, 0.42, 0.2);
        this.noise(t, 0.3, 0.08, 500);
        break;
      case 'bossWin': this.arp(t, [523, 659, 784, 1047], 0.09, 0.13); break;
      case 'bossFail':
        this.tone(t, 'triangle', 330, 0.16, 0.14);
        this.tone(t + 0.17, 'triangle', 220, 0.28, 0.14);
        break;
      case 'prestige':
        this.arp(t, [392, 523, 659, 784, 1047, 1319], 0.09, 0.11);
        this.sweepNoise(t, 0.55, 0.08, 400, 4000);
        break;
      case 'claim': this.arp(t, [880, 1109, 1319], 0.07, 0.12); break;
      case 'error': this.tone(t, 'square', 110, 0.09, 0.12); break;
    }
  }

  // --- 합성 프리미티브 ------------------------------------------------------

  /** 주파수 f0→f1 글라이드 톤 */
  private blip(t: number, type: OscillatorType, f0: number, f1: number,
               dur: number, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 고정 주파수 톤 */
  private tone(t: number, type: OscillatorType, freq: number,
               dur: number, vol: number): void {
    this.blip(t, type, freq, freq, dur, vol);
  }

  /** 상승 아르페지오 */
  private arp(t: number, freqs: number[], step: number, vol: number): void {
    freqs.forEach((f, i) => this.tone(t + i * step, 'sine', f, step * 2.2, vol));
  }

  /** 필터드 노이즈 버스트 */
  private noise(t: number, dur: number, vol: number, cutoff: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** 컷오프가 쓸려 올라가는 노이즈 (스킬 발동 휘익) */
  private sweepNoise(t: number, dur: number, vol: number,
                     from: number, to: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noiseBuf) {
      const ctx = this.ctx!;
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }
}

export const Sfx = new SfxEngine();

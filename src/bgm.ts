// ---------------------------------------------------------------------------
// Bgm: Web Audio 절차 생성 앰비언트 배경음악 — 외부 파일 없음.
// A 마이너 펜타토닉 위에서 베이스/패드/멜로디를 미리보기 스케줄링으로 생성한다.
// 설정은 기기 로컬(localStorage).
// ---------------------------------------------------------------------------

const KEY_ON = 'taptap-bgm-on';
const KEY_VOL = 'taptap-bgm-vol';

const BPM = 72;
const BEAT = 60 / BPM;
const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]; // A C D E G A
const BASS = [55.0, 65.41, 73.42, 82.41];                    // A C D E (저음)

class BgmEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextTime = 0;
  private beatCount = 0;
  private on: boolean;
  private vol: number;

  constructor() {
    let on: string | null = null;
    let vol: string | null = null;
    try {
      on = localStorage.getItem(KEY_ON);
      vol = localStorage.getItem(KEY_VOL);
    } catch { /* ignore */ }
    this.on = on !== '0'; // 기본 켜짐
    const v = Number(vol);
    this.vol = Number.isFinite(v) && vol !== null ? Math.min(1, Math.max(0, v)) : 0.5;
    document.addEventListener('pointerdown', () => this.unlock(), { capture: true });
  }

  isEnabled(): boolean { return this.on; }
  volume(): number { return this.vol; }

  toggle(): boolean {
    this.on = !this.on;
    try { localStorage.setItem(KEY_ON, this.on ? '1' : '0'); } catch { /* noop */ }
    if (this.on) this.unlock(); else this.stop();
    return this.on;
  }

  setVolume(v: number): void {
    this.vol = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(KEY_VOL, String(this.vol)); } catch { /* noop */ }
    if (this.master) this.master.gain.value = this.vol * 0.22; // BGM 은 SFX 보다 낮게
  }

  private unlock(): void {
    if (!this.on) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol * 0.22;
        this.master.connect(this.ctx.destination);
      } catch { return; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.timer) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.beatCount = 0;
      this.loop();
    }
  }

  private stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** 1.2초 미리보기 창 안의 비트를 스케줄하고 재귀 예약 */
  private loop(): void {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 1.2) {
      this.scheduleBeat(this.nextTime, this.beatCount);
      this.nextTime += BEAT;
      this.beatCount += 1;
    }
    this.timer = setTimeout(() => { if (this.on) this.loop(); }, 350);
  }

  private scheduleBeat(t: number, beat: number): void {
    // 베이스: 4비트마다, 16비트 주기로 근음 순환
    if (beat % 4 === 0) {
      const f = BASS[Math.floor(beat / 16) % BASS.length];
      this.note(t, 'triangle', f, BEAT * 3.6, 0.5, 0.4);
    }
    // 패드: 8비트마다 5도 화음, 느린 어택
    if (beat % 8 === 0) {
      const root = SCALE[(Math.floor(beat / 8) * 2) % SCALE.length];
      this.note(t, 'sine', root, BEAT * 7, 0.22, 2.2);
      this.note(t, 'sine', root * 1.5, BEAT * 7, 0.14, 2.6);
    }
    // 멜로디: 확률적 펜타토닉 (60%), 오프비트는 옥타브 위
    if (Math.random() < 0.6) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (beat % 2 ? 2 : 1);
      this.note(t + (beat % 2 ? BEAT * 0.5 : 0), 'sine', f, BEAT * 0.9, 0.16, 0.02);
    }
  }

  private note(t: number, type: OscillatorType, freq: number,
               dur: number, vol: number, attack: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

export const Bgm = new BgmEngine();

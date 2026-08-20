// ---------------------------------------------------------------------------
// 리더보드 클라이언트.
// - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되면 Supabase 원격 모드:
//   익명 로그인 → Edge Function(submit-score) 경유 제출(서버 검증) → 뷰 조회.
// - 미설정이면 로컬 모드: localStorage 에 저장, 데모 봇 몇 명과 함께 표시.
// 점수(최고 스테이지)는 클라이언트를 신뢰하지 않는다 — 서버 검증 규칙은
// supabase/functions/submit-score 참고.
import { seasonKey } from './Season.ts';
import { t } from './i18n.ts';

export interface LbEntry {
  name: string;
  stage: number;
  relics: number;
  isMe: boolean;
}

export type LbMode = 'remote' | 'local';

const LOCAL_KEY = 'taptap-lb-local';
const LOCAL_BOTS: Omit<LbEntry, 'isMe'>[] = [
  { name: '전설의고인물', stage: 87, relics: 41 },
  { name: '슬라임학살자', stage: 64, relics: 26 },
  { name: '탭탭이', stage: 51, relics: 17 },
  { name: '주말용사', stage: 33, relics: 8 },
  { name: '뉴비호소인', stage: 12, relics: 0 },
];

interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: unknown } }>;
    signInAnonymously(): Promise<{ error: unknown }>;
  };
  functions: {
    invoke(name: string, opts: { body: unknown }): Promise<{ data: unknown; error: unknown }>;
  };
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
}

export class Leaderboard {
  readonly mode: LbMode;
  private client: SupabaseLike | null = null;
  private ready: Promise<void> | null = null;

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    this.mode = url && key ? 'remote' : 'local';
    if (this.mode === 'remote') {
      this.ready = this.connect(url!, key!);
    }
  }

  private async connect(url: string, key: string): Promise<void> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const c = createClient(url, key) as unknown as SupabaseLike;
      const { data } = await c.auth.getSession();
      if (!data.session) await c.auth.signInAnonymously();
      this.client = c;
    } catch {
      this.client = null; // 네트워크/설정 문제 → 조회·제출 시 에러 메시지
    }
  }

  /** 점수 제출. 성공 시 null, 실패 시 사용자용 에러 메시지 반환 */
  async submit(name: string, stage: number, relics: number): Promise<string | null> {
    name = name.trim();
    if (name.length < 2 || name.length > 12) return t('lb.badName', '이름은 2~12자여야 합니다.');
    if (this.mode === 'local') {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ name, stage, relics }));
      } catch { /* ignore */ }
      return null;
    }
    await this.ready;
    if (!this.client) return t('lb.noServer', '서버에 연결할 수 없습니다.');
    const { error } = await this.client.functions.invoke('submit-score', {
      body: { name, stage, relics },
    });
    return error ? t('lb.rejected', '제출이 거부되었습니다. 잠시 후 다시 시도하세요.') : null;
  }

  /** 상위 N명 + 내 항목 표시. null = 원격 연결 실패 (빈 랭킹과 구분) */
  async top(n: number): Promise<LbEntry[] | null> {
    if (this.mode === 'local') {
      let me: LbEntry | null = null;
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) me = { ...(JSON.parse(raw) as Omit<LbEntry, 'isMe'>), isMe: true };
      } catch { /* ignore */ }
      const all = [...LOCAL_BOTS.map((b) => ({ ...b, isMe: false })), ...(me ? [me] : [])];
      return all.sort((a, b) => b.stage - a.stage).slice(0, n);
    }
    await this.ready;
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('leaderboard')
        .select('name, max_stage, relics')
        .eq('season', seasonKey())
        .order('max_stage', { ascending: false })
        .limit(n);
      if (error || !Array.isArray(data)) return null;
      return (data as { name: string; max_stage: number; relics: number }[]).map((r) => ({
        name: r.name, stage: r.max_stage, relics: r.relics ?? 0, isMe: false,
      }));
    } catch {
      return null;
    }
  }
}

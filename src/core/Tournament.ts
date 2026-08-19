// ---------------------------------------------------------------------------
// 주말 토너먼트 — 어비셜 방식: 주말 동안 제로베이스 새 세이브로 최고 스테이지 경쟁.
// 서버 없이도 동작한다: 메인 세이브를 스태시에 보관하고 빈 세이브로 리로드,
// 종료/만료 시 기록을 남기고 메인을 복원한다. 보상은 복원 후 부팅 시 지급.
// 온라인 순위 연동은 supabase/README.md 의 확장 항목 참고.
// ---------------------------------------------------------------------------
import { TOURNEY_REWARD_PER_10_STAGES } from '../config.ts';
import { GameState } from './GameState.ts';
import { Analytics } from './Analytics.ts';

const STASH_KEY = 'taptap-main-stash';
const FLAG_KEY = 'taptap-tourney-flag';       // { weekKey } — 참가 중 표시
const HISTORY_KEY = 'taptap-tourney-history'; // { [weekKey]: number(stage) }
const REWARD_KEY = 'taptap-tourney-reward';   // { weekKey, stage, relics } — 미지급 보상

export type TourneyStatus =
  | { kind: 'closed'; opensInMs: number }        // 평일 — 다음 주말까지
  | { kind: 'open'; closesInMs: number }         // 주말, 미참가
  | { kind: 'running'; closesInMs: number };     // 주말, 참가 중

function ls(): Storage | null {
  try { return localStorage; } catch { return null; }
}

/** 해당 시각이 속한 주의 토요일 00:00 (로컬) */
function weekendStart(d: Date): Date {
  const day = d.getDay(); // 0=일 ... 6=토
  const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // 토(6)→0일 전, 일(0)→1일 전, 그 외 → 다음 토요일
  if (day === 6) { /* 오늘 */ }
  else if (day === 0) sat.setDate(sat.getDate() - 1);
  else sat.setDate(sat.getDate() + (6 - day));
  return sat;
}

/** 주말 창: 토 00:00 ~ 월 00:00 (로컬) */
export function tourneyWindow(now = new Date()): { start: Date; end: Date; weekKey: string } {
  const start = weekendStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  const weekKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return { start, end, weekKey };
}

export function isWindowActive(now = new Date()): boolean {
  const { start, end } = tourneyWindow(now);
  return now >= start && now < end;
}

export function isEntered(): boolean {
  return ls()?.getItem(FLAG_KEY) != null;
}

export function status(now = new Date()): TourneyStatus {
  const { start, end } = tourneyWindow(now);
  if (now < start) return { kind: 'closed', opensInMs: start.getTime() - now.getTime() };
  if (isEntered()) return { kind: 'running', closesInMs: end.getTime() - now.getTime() };
  return { kind: 'open', closesInMs: end.getTime() - now.getTime() };
}

/** 참가: 메인 세이브 스태시 → 빈 세이브로 리로드 */
export function enter(state: GameState): void {
  const s = ls();
  if (!s || !isWindowActive() || isEntered()) return;
  state.save(); // 최신 상태를 스태시로
  const main = s.getItem(GameState.SAVE_KEY);
  if (main) s.setItem(STASH_KEY, main);
  s.removeItem(GameState.SAVE_KEY);
  s.setItem(FLAG_KEY, JSON.stringify({ weekKey: tourneyWindow().weekKey }));
  Analytics.track('tournament_enter', { weekKey: tourneyWindow().weekKey });
  location.reload();
}

/** 종료(수동/만료): 기록 저장 + 보상 예약 + 메인 복원 후 리로드 */
export function finish(state: GameState, reload = true): void {
  const s = ls();
  if (!s || !isEntered()) return;
  let weekKey = tourneyWindow().weekKey;
  try {
    const f = JSON.parse(s.getItem(FLAG_KEY) ?? '{}') as { weekKey?: string };
    if (f.weekKey) weekKey = f.weekKey;
  } catch { /* ignore */ }
  const stage = state.maxStage;

  // 주간 기록 (최고만 유지)
  try {
    const hist = JSON.parse(s.getItem(HISTORY_KEY) ?? '{}') as Record<string, number>;
    hist[weekKey] = Math.max(hist[weekKey] ?? 0, stage);
    s.setItem(HISTORY_KEY, JSON.stringify(hist));
  } catch { /* ignore */ }

  // 보상 예약 (메인 복원 후 부팅 시 지급)
  const relics = Math.floor(stage / 10) * TOURNEY_REWARD_PER_10_STAGES;
  if (relics > 0) s.setItem(REWARD_KEY, JSON.stringify({ weekKey, stage, relics }));

  // 메인 복원
  const stash = s.getItem(STASH_KEY);
  if (stash) s.setItem(GameState.SAVE_KEY, stash);
  else s.removeItem(GameState.SAVE_KEY);
  s.removeItem(STASH_KEY);
  s.removeItem(FLAG_KEY);
  Analytics.track('tournament_finish', { weekKey, stage, relics });
  if (reload) location.reload();
}

/** 부팅 시 호출: 창이 닫혔는데 참가 중이면 자동 정산. 미지급 보상 반환 */
export function bootCheck(state: GameState): { stage: number; relics: number } | null {
  const s = ls();
  if (!s) return null;
  if (isEntered() && !isWindowActive()) {
    finish(state, true); // 리로드 — 이후 부팅에서 보상 지급 경로로 진입
    return null;
  }
  const raw = s.getItem(REWARD_KEY);
  if (raw) {
    s.removeItem(REWARD_KEY);
    try {
      const r = JSON.parse(raw) as { stage: number; relics: number };
      if (Number.isFinite(r.relics) && r.relics > 0) return r;
    } catch { /* ignore */ }
  }
  return null;
}

export function historyBest(): { weekKey: string; stage: number } | null {
  try {
    const hist = JSON.parse(ls()?.getItem(HISTORY_KEY) ?? '{}') as Record<string, number>;
    const entries = Object.entries(hist);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { weekKey: entries[0][0], stage: entries[0][1] };
  } catch {
    return null;
  }
}

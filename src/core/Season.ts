// ---------------------------------------------------------------------------
// 4주 시즌제 — 시즌마다 랭킹이 리셋되고, 시즌 종료 시 도달 스테이지 보상.
// 시즌 키는 클라이언트/서버(submit-score)가 같은 공식으로 계산한다:
//   기준일 2026-01-05(월) 부터 28일 단위 → "S1", "S2", ...
// 보상은 현재 클라이언트 지급(로컬 스냅샷 기준) — 서버 권위 지급은
// supabase/README.md 확장 항목 참고.
// ---------------------------------------------------------------------------
import { Analytics } from './Analytics.ts';

export const SEASON_EPOCH_UTC = Date.UTC(2026, 0, 5); // 2026-01-05 (월)
export const SEASON_LEN_MS = 28 * 86_400_000;
export const SEASON_REWARD_PER_20_STAGES = 1; // 시즌 종료 보상: 스테이지 20당 유물 1

const SNAP_KEY = 'taptap-season';

export function seasonKey(now = new Date()): string {
  const n = Math.max(0, Math.floor((now.getTime() - SEASON_EPOCH_UTC) / SEASON_LEN_MS));
  return `S${n + 1}`;
}

export function seasonEndsInMs(now = new Date()): number {
  const n = Math.max(0, Math.floor((now.getTime() - SEASON_EPOCH_UTC) / SEASON_LEN_MS));
  return SEASON_EPOCH_UTC + (n + 1) * SEASON_LEN_MS - now.getTime();
}

function ls(): Storage | null {
  try { return localStorage; } catch { return null; }
}

/** 현재 시즌의 내 최고 스테이지 스냅샷 갱신 (autosave 주기로 호출) */
export function snapshot(maxStage: number): void {
  const s = ls();
  if (!s) return;
  try {
    const cur = JSON.parse(s.getItem(SNAP_KEY) ?? '{}') as { key?: string; stage?: number };
    if (cur.key === seasonKey()) {
      if ((cur.stage ?? 0) >= maxStage) return;
      s.setItem(SNAP_KEY, JSON.stringify({ key: seasonKey(), stage: maxStage }));
    } else if (!cur.key) {
      s.setItem(SNAP_KEY, JSON.stringify({ key: seasonKey(), stage: maxStage }));
    }
    // 이전 시즌 키가 남아 있으면 rollover() 가 정산할 때까지 유지
  } catch { /* ignore */ }
}

/** 부팅 시 호출: 시즌이 넘어갔으면 지난 시즌 보상 반환 후 스냅샷 리셋 */
export function rollover(maxStage: number): { season: string; stage: number; relics: number } | null {
  const s = ls();
  if (!s) return null;
  try {
    const cur = JSON.parse(s.getItem(SNAP_KEY) ?? '{}') as { key?: string; stage?: number };
    const nowKey = seasonKey();
    if (cur.key && cur.key !== nowKey && (cur.stage ?? 0) > 0) {
      const relics = Math.floor((cur.stage ?? 0) / 20) * SEASON_REWARD_PER_20_STAGES;
      s.setItem(SNAP_KEY, JSON.stringify({ key: nowKey, stage: maxStage }));
      if (relics > 0) {
        Analytics.track('season_reward', { season: cur.key, stage: cur.stage, relics });
        return { season: cur.key, stage: cur.stage ?? 0, relics };
      }
      return null;
    }
    if (!cur.key) s.setItem(SNAP_KEY, JSON.stringify({ key: nowKey, stage: maxStage }));
    return null;
  } catch {
    return null;
  }
}

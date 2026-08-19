// ---------------------------------------------------------------------------
// 시뮬 결과 HTML 리포트 생성 — 실행: npm run sim:report (sim 실행 후 report)
// 입력: sim/out/latest.json → 출력: sim/out/report.html (단일 파일, 로컬 열람)
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import type { SimResult } from './engine.ts';

const data = JSON.parse(readFileSync('sim/out/latest.json', 'utf8')) as {
  active: SimResult; casual: SimResult; idle: SimResult;
};

const SERIES = [
  { key: 'active' as const, label: '액티브 4탭/s', color: '#2a78d6' },
  { key: 'casual' as const, label: '캐주얼 1탭/s', color: '#eb6834' },
  { key: 'idle' as const, label: '저관여 0.25탭/s', color: '#1baf7a' },
];

const W = 860, H = 380, PAD = { l: 56, r: 150, t: 16, b: 44 };
const PW = W - PAD.l - PAD.r, PH = H - PAD.t - PAD.b;

function hms(sec: number): string {
  if (sec < 5400) return `${(sec / 60).toFixed(0)}분`;
  if (sec < 86400 * 2) return `${(sec / 3600).toFixed(1)}시간`;
  return `${(sec / 86400).toFixed(1)}일`;
}

// --- 차트 1: 스테이지 도달 곡선 (라인) --------------------------------------
const maxT = Math.max(...SERIES.map((s) => data[s.key].clears.at(-1)?.t ?? 0));
const maxStage = Math.max(...SERIES.map((s) => data[s.key].maxStage));
const xT = (t: number) => PAD.l + (t / maxT) * PW;
const yS = (st: number) => PAD.t + PH - (st / maxStage) * PH;

function lineChart(): string {
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const st = Math.round(maxStage * f);
    const y = yS(st);
    return `<line x1="${PAD.l}" y1="${y}" x2="${PAD.l + PW}" y2="${y}" stroke="#e4e2dc" stroke-width="1"/>`
      + `<text x="${PAD.l - 8}" y="${y + 4}" text-anchor="end" class="tick">${st}</text>`;
  }).join('');
  const gridX = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const t = maxT * f;
    const x = xT(t);
    return `<text x="${x}" y="${PAD.t + PH + 20}" text-anchor="middle" class="tick">${hms(t)}</text>`;
  }).join('');

  const paths = SERIES.map((s) => {
    const clears = data[s.key].clears;
    if (!clears.length) return '';
    const d = clears.map((c, i) => `${i ? 'L' : 'M'}${xT(c.t).toFixed(1)},${yS(c.stage).toFixed(1)}`).join('');
    const last = clears.at(-1)!;
    // 직접 라벨 (선 끝)
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round">`
      + `<title>${s.label}</title></path>`
      + `<circle cx="${xT(last.t).toFixed(1)}" cy="${yS(last.stage).toFixed(1)}" r="4" fill="${s.color}" stroke="#fcfcfb" stroke-width="2"/>`
      + `<text x="${xT(last.t) + 8}" y="${yS(last.stage) + 4}" class="dlabel" fill="#3d3c39">${s.label} · ${last.stage}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="프로필별 스테이지 최초 도달 곡선">
    ${gridY}${gridX}
    <line x1="${PAD.l}" y1="${PAD.t + PH}" x2="${PAD.l + PW}" y2="${PAD.t + PH}" stroke="#b7b5ad" stroke-width="1"/>
    ${paths}
  </svg>`;
}

// --- 차트 2: 체류시간(분) by 스테이지 — 액티브, 벽 탐지용 바 -----------------
function dwellChart(): string {
  const clears = data.active.clears;
  const dwell: { stage: number; min: number }[] = [];
  for (let i = 1; i < clears.length; i++) {
    dwell.push({ stage: clears[i].stage, min: (clears[i].t - clears[i - 1].t) / 60 });
  }
  const capped = dwell.map((d) => ({ ...d, v: Math.min(d.min, 60) }));
  const maxV = 60;
  const bw = Math.max(1, PW / capped.length - 1);
  const yD = (v: number) => PAD.t + PH - (v / maxV) * PH;

  const bars = capped.map((d, i) => {
    const x = PAD.l + (i / capped.length) * PW;
    const y = yD(d.v);
    const wall = d.min >= 30 ? '#eb6834' : '#2a78d6';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(PAD.t + PH - y).toFixed(1)}"`
      + ` fill="${wall}" rx="1"><title>스테이지 ${d.stage}: ${d.min.toFixed(1)}분${d.min >= 30 ? ' (하드 벽)' : ''}</title></rect>`;
  }).join('');

  const gridY = [0, 15, 30, 45, 60].map((v) => {
    const y = yD(v);
    return `<line x1="${PAD.l}" y1="${y}" x2="${PAD.l + PW}" y2="${y}" stroke="#e4e2dc" stroke-width="1"/>`
      + `<text x="${PAD.l - 8}" y="${y + 4}" text-anchor="end" class="tick">${v}분</text>`;
  }).join('');
  const first = capped[0]?.stage ?? 0, last = capped.at(-1)?.stage ?? 0;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="액티브 프로필 스테이지별 체류시간">
    ${gridY}
    <line x1="${PAD.l}" y1="${PAD.t + PH}" x2="${PAD.l + PW}" y2="${PAD.t + PH}" stroke="#b7b5ad" stroke-width="1"/>
    ${bars}
    <text x="${PAD.l}" y="${PAD.t + PH + 20}" class="tick">스테이지 ${first}</text>
    <text x="${PAD.l + PW}" y="${PAD.t + PH + 20}" text-anchor="end" class="tick">${last}</text>
    <text x="${PAD.l + PW}" y="${yD(60) - 6}" text-anchor="end" class="dlabel" fill="#eb6834">주황 = 30분+ (하드 벽) · 60분에서 절단</text>
  </svg>`;
}

// --- 테이블 (접근성 릴리프 + 정밀값) ----------------------------------------
function tables(): string {
  const milestones = [25, 50, 100, 150];
  const rows = SERIES.map((s) => {
    const r = data[s.key];
    const cells = milestones.map((m) => {
      const c = r.clears.find((c) => c.stage === m);
      return `<td>${c ? hms(c.t) : '—'}</td>`;
    }).join('');
    const p1 = r.prestiges[0];
    return `<tr><th scope="row"><span class="chip" style="background:${s.color}"></span>${s.label}</th>`
      + `${cells}<td>${r.maxStage}</td><td>${r.prestiges.length}회`
      + `${p1 ? ` (첫 ${hms(p1.t)})` : ''}</td><td>${r.walls.filter((w) => w.kind === 'hard').length}</td></tr>`;
  }).join('');
  return `<table>
    <thead><tr><th>프로필</th>${milestones.map((m) => `<th>s${m}</th>`).join('')}
    <th>3일 최고</th><th>환생</th><th>하드 벽</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>밸런스 시뮬 리포트</title>
<style>
  /* 로컬 QA 리포트 — 라이트 단일 룩 */
  body { background: #fcfcfb; color: #0b0b0b; font: 14px/1.5 -apple-system, 'Malgun Gothic', sans-serif;
         max-width: 920px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin: 28px 0 8px; }
  .meta { color: #52514e; font-size: 12px; }
  svg { width: 100%; height: auto; background: #fcfcfb; }
  svg rect:hover, svg path:hover { opacity: .75; }
  .tick { font: 11px sans-serif; fill: #52514e; }
  .dlabel { font: 12px sans-serif; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border-bottom: 1px solid #e4e2dc; padding: 6px 10px; text-align: right; }
  th[scope=row], thead th:first-child { text-align: left; }
  .chip { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
</style></head><body>
<h1>밸런스 시뮬 리포트</h1>
<p class="meta">생성: ${new Date().toISOString()} · 시뮬 ${data.active.simDays.toFixed(1)}일 · docs/BALANCE.md 의 목표 밴드와 비교할 것</p>
<h2>스테이지 최초 도달 곡선</h2>
${lineChart()}
<h2>스테이지별 체류시간 — 액티브 (벽 히트맵)</h2>
${dwellChart()}
<h2>요약</h2>
${tables()}
</body></html>`;

writeFileSync('sim/out/report.html', html);
console.log('리포트 생성: sim/out/report.html');

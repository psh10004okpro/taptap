// 밸런스 시뮬레이션 실행 + 리포트. 실행: node sim/run.ts
import { simulate, type SimResult } from './engine.ts';

function hms(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}초`;
  if (sec < 5400) return `${(sec / 60).toFixed(1)}분`;
  if (sec < 86400 * 2) return `${(sec / 3600).toFixed(1)}시간`;
  return `${(sec / 86400).toFixed(1)}일`;
}

function report(r: SimResult): void {
  console.log(`\n===== 프로필: ${r.profile} (시뮬 ${r.simDays.toFixed(2)}일, 최고 스테이지 ${r.maxStage}) =====`);

  const milestones = [10, 25, 40, 60, 80, 100, 150, 200, 300, 400];
  console.log('  [스테이지 최초 도달]');
  for (const m of milestones) {
    const c = r.clears.find((c) => c.stage === m);
    if (c) console.log(`    스테이지 ${String(m).padStart(3)}  ${hms(c.t).padStart(8)}  (환생 ${c.prestigeNo}회차)`);
  }

  console.log(`  [환생] 총 ${r.prestiges.length}회`);
  r.prestiges.slice(0, 12).forEach((p, i) => {
    console.log(`    #${i + 1}  ${hms(p.t).padStart(8)}  스테이지 ${p.atStage} 에서, 유물 +${p.gained} (누적 ${p.totalRelics})`);
  });
  if (r.prestiges.length > 12) console.log(`    ... 외 ${r.prestiges.length - 12}회`);

  console.log(`  [벽] soft>5분 hard>30분 — ${r.walls.length}건`);
  r.walls.slice(0, 15).forEach((w) => {
    console.log(`    ${w.kind.toUpperCase().padEnd(4)} 스테이지 ${String(w.stage).padStart(3)}  체류 ${hms(w.dwellSec)}  (환생 ${w.prestigeNo}회차)`);
  });
}

const DAYS = Number(process.argv[2] ?? 3);

const active = simulate({ name: '액티브 (4탭/초, 스킬 사용)', tapsPerSec: 4, useSkills: true }, DAYS);
const casual = simulate({ name: '캐주얼 (1탭/초, 스킬 사용)', tapsPerSec: 1, useSkills: true }, DAYS);
const idle = simulate({ name: '방치 (0탭/초, 스킬 미사용)', tapsPerSec: 0, useSkills: false }, DAYS);

report(active);
report(casual);
report(idle);

// JSON 덤프 (그래프/추후 비교용)
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('sim/out', { recursive: true });
writeFileSync('sim/out/latest.json', JSON.stringify({ active, casual, idle }, null, 1));
console.log('\nJSON: sim/out/latest.json');

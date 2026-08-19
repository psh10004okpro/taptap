// 곡선 파라미터 스윕 — GOLD_GROWTH 후보별 페이싱 요약. 실행: node sim/tune.ts
// config 를 직접 수정하지 않고 모듈 캐시를 우회하기 어려우므로,
// 이 스크립트는 "현재 config 값"으로 3개 프로필 요약만 출력한다.
// 후보 비교는 config 의 GOLD_GROWTH 를 바꿔가며 재실행한다:
//   for g in 1.34 1.38 1.42 1.46 1.50; do sed -i "s/GOLD_GROWTH = [0-9.]*/GOLD_GROWTH = $g/" src/config.ts; node sim/tune.ts; done
import { simulate } from './engine.ts';
import { GOLD_GROWTH, HP_GROWTH } from '../src/config.ts';

function hms(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${(sec / 60).toFixed(0)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function line(name: string, tapsPerSec: number, useSkills: boolean): void {
  const r = simulate({ name, tapsPerSec, useSkills }, 3);
  const at = (s: number) => {
    const c = r.clears.find((c) => c.stage === s);
    return c ? hms(c.t) : '--';
  };
  const firstWall = r.walls[0];
  const p1 = r.prestiges[0];
  console.log(
    `  ${name.padEnd(8)} max=${String(r.maxStage).padStart(3)}`
    + ` | s25=${at(25).padStart(5)} s40=${at(40).padStart(5)} s60=${at(60).padStart(5)} s100=${at(100).padStart(5)}`
    + ` | 환생 ${String(r.prestiges.length).padStart(2)}회(첫=${p1 ? hms(p1.t) + '@' + p1.atStage : '--'})`
    + ` | 벽 ${r.walls.length}건(첫=${firstWall ? firstWall.kind + '@' + firstWall.stage : '--'})`,
  );
}

console.log(`GOLD_GROWTH=${GOLD_GROWTH} HP_GROWTH=${HP_GROWTH} (3일 시뮬)`);
line('액티브4', 4, true);
line('캐주얼1', 1, true);
line('저관여.25', 0.25, false);

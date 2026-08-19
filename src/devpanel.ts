// ---------------------------------------------------------------------------
// 인게임 QA 패널 — DOM 오버레이 (게임 캔버스 비침투).
// 활성화: URL 에 ?dev=1  (main.ts 에서 동적 import → 일반 번들 경로와 분리)
// 모든 치트는 core/DevTools 를 경유하므로 E2E 테스트와 동일 코드가 실행된다.
// ---------------------------------------------------------------------------
import { GameState } from './core/GameState.ts';
import { Analytics } from './core/Analytics.ts';
import * as Dev from './core/DevTools.ts';

const CSS = `
#qa-toggle {
  position: fixed; top: 8px; left: 8px; z-index: 10000;
  background: #8e44ad; color: #fff; border: none; border-radius: 8px;
  font: bold 13px/1 sans-serif; padding: 8px 10px; opacity: .85; cursor: pointer;
}
#qa-panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: 300px; z-index: 10001;
  background: rgba(18, 12, 32, .96); color: #eee; overflow-y: auto;
  font: 12px/1.45 monospace; padding: 10px; box-sizing: border-box;
  transform: translateX(100%); transition: transform .15s ease;
}
#qa-panel.open { transform: translateX(0); }
#qa-panel h3 { margin: 10px 0 4px; font-size: 12px; color: #d8b8ff; }
#qa-panel button {
  background: #2c2145; color: #fff; border: 1px solid #8e44ad55; border-radius: 6px;
  font: 11px monospace; padding: 4px 7px; margin: 2px; cursor: pointer;
}
#qa-panel button:hover { background: #3d2d5e; }
#qa-panel pre {
  background: #0d0a1a; border-radius: 6px; padding: 6px; margin: 4px 0;
  white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow-y: auto;
}
#qa-panel textarea {
  width: 100%; height: 56px; background: #0d0a1a; color: #ddd;
  border: 1px solid #8e44ad55; border-radius: 6px; font: 10px monospace;
}
`;

export function mountDevPanel(state: GameState): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.id = 'qa-toggle';
  toggle.textContent = 'QA';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'qa-panel';
  document.body.appendChild(panel);
  toggle.onclick = () => panel.classList.toggle('open');

  const section = (title: string): HTMLDivElement => {
    const h = document.createElement('h3');
    h.textContent = title;
    panel.appendChild(h);
    const div = document.createElement('div');
    panel.appendChild(div);
    return div;
  };
  const btn = (parent: HTMLElement, label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    parent.appendChild(b);
  };

  // --- 상태 요약 (1초 갱신) ---
  const statusPre = document.createElement('pre');
  panel.appendChild(document.createElement('h3')).textContent = '상태';
  panel.appendChild(statusPre);
  const renderStatus = () => {
    const snap = Dev.snapshot(state);
    statusPre.textContent = Object.entries(snap)
      .map(([k, v]) => `${k.padEnd(11)} ${v}`).join('\n');
  };
  setInterval(renderStatus, 1000);
  renderStatus();

  // --- 자원 ---
  const res = section('자원');
  btn(res, '+골드 1K', () => state.addGold(1e3));
  btn(res, '+골드 1B', () => state.addGold(1e9));
  btn(res, '+골드 1aa', () => state.addGold(1e18));
  btn(res, '+유물 100', () => state.addRelics(100));

  // --- 진행 ---
  const prog = section('진행');
  const jump = (n: number) => {
    state.stage += n;
    state.maxStage = Math.max(state.maxStage, state.stage);
    state.kills = 0;
    state.emit('stage', state.stage, state.kills);
    state.emit('upgrade');
  };
  btn(prog, '스테이지 +10', () => jump(10));
  btn(prog, '스테이지 +50', () => jump(50));
  btn(prog, '환생 실행', () => { state.doPrestige(); });
  btn(prog, '쿨다운 리셋', () => state.resetSkillCooldowns());
  btn(prog, '일일퀘 리셋', () => {
    state.daily.date = '1970-01-01';
    state.ensureDaily();
  });
  btn(prog, '요정 소환', () => {
    const g = window.__taptap?.game;
    if (g) Dev.spawnFairy(g.events);
  });

  // --- 프리셋 ---
  const pre = section('상태 프리셋');
  Dev.PRESETS.forEach((p) => {
    btn(pre, p.label, () => {
      if (p.name === 'fresh') { Dev.wipeAll(); return; }
      Dev.applyPreset(state, p.name);
    });
  });

  // --- 시간 ---
  const time = section('시간 (리로드됨)');
  btn(time, '오프라인 1시간', () => Dev.simulateOffline(state, 1));
  btn(time, '오프라인 8시간', () => Dev.simulateOffline(state, 8));

  // --- 세이브 ---
  const save = section('세이브');
  const ta = document.createElement('textarea');
  btn(save, '내보내기', () => { ta.value = Dev.exportSave(state); ta.select(); });
  btn(save, '가져오기', () => {
    if (!Dev.importSave(ta.value)) ta.value = '!! 잘못된 세이브 JSON';
  });
  btn(save, '전체 초기화', () => {
    if (confirm('모든 로컬 데이터를 삭제할까요?')) Dev.wipeAll();
  });
  save.appendChild(ta);

  // --- 분석 이벤트 로그 ---
  const logSec = section('Analytics (최근 12)');
  const logPre = document.createElement('pre');
  logSec.appendChild(logPre);
  setInterval(() => {
    logPre.textContent = Analytics.snapshot().slice(-12)
      .map((e) => `${new Date(e.t).toLocaleTimeString('en-GB')} ${e.name} ${JSON.stringify(e.params)}`)
      .join('\n');
  }, 1000);

  // --- 불변식 검증 ---
  const val = section('검증');
  const valPre = document.createElement('pre');
  btn(val, '불변식 검사', () => {
    const bad = Dev.validate(state);
    valPre.textContent = bad.length ? bad.join('\n') : 'OK — 위반 없음';
    valPre.style.color = bad.length ? '#ff9c9c' : '#7bed8d';
  });
  val.appendChild(valPre);
}

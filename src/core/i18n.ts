// ---------------------------------------------------------------------------
// 다국어 — 한국어가 기본이자 폴백이다.
//
// 설계: **오버레이 방식**. config.ts 의 게임 데이터(영웅/유물/펫 이름·설명)는
// 한국어 그대로 두고, 다른 언어일 때만 카탈로그가 그 위에 덮어쓴다.
//   - 번역이 없는 키는 자동으로 한국어로 떨어진다 (빈 화면이 생기지 않는다)
//   - 콘텐츠를 늘려도 번역이 늦어질 뿐 게임이 깨지지 않는다
//   - lang='ko' 면 조회 자체를 건너뛴다 — 기존 동작과 바이트 단위로 같다
//
// Phaser 비의존 (core 규칙). 문자열 치환은 {name} 형태.
// ---------------------------------------------------------------------------

export type Lang = 'ko' | 'en';

const LANG_KEY = 'taptap-lang';
const SUPPORTED: Lang[] = ['ko', 'en'];

/** 화면 문구 카탈로그. ko 는 코드에 박힌 원문이므로 en 만 채운다. */
export type Catalog = Record<string, string>;

const CATALOGS: Partial<Record<Lang, Catalog>> = {};

let current: Lang = 'ko';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && (SUPPORTED as string[]).includes(saved)) return saved as Lang;
  } catch { /* ignore */ }
  try {
    const nav = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
    // ko, ko-KR → ko / 그 외 전부 en (한국어 외 지역에 한국어를 강요하지 않는다)
    return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  } catch { /* ignore */ }
  return 'ko';
}

/** 앱 부팅 시 1회. 저장된 선택 > 브라우저 언어 > 한국어 */
export function initLang(catalogs: Partial<Record<Lang, Catalog>> = {}): Lang {
  Object.assign(CATALOGS, catalogs);
  current = detect();
  return current;
}

export function lang(): Lang { return current; }

/** 언어 전환 (설정에서). 화면 재구성은 호출측 책임. */
export function setLang(l: Lang): void {
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
}

export function nextLang(): Lang {
  const i = SUPPORTED.indexOf(current);
  return SUPPORTED[(i + 1) % SUPPORTED.length];
}

export function langLabel(l: Lang = current): string {
  return l === 'ko' ? '한국어' : 'English';
}

function fill(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) =>
    (k in params ? String(params[k]) : m));
}

/**
 * 문구 조회. `ko` 는 원문(fallback)을 그대로 돌려준다.
 * @param key      카탈로그 키 (예: 'tab.heroes', 'hero.0.name')
 * @param fallback 한국어 원문 — 번역이 없으면 이 값이 쓰인다
 */
export function t(key: string, fallback: string,
                 params?: Record<string, string | number>): string {
  if (current === 'ko') return fill(fallback, params);
  const hit = CATALOGS[current]?.[key];
  return fill(hit ?? fallback, params);
}

import { t } from './i18n.ts';
// 큰 숫자 표기: 1.23K, 45.6M, 7.89B ... 이후 aa, ab 접미사
const UNITS = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae', 'af', 'ag'];

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return String(Math.floor(n));
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= UNITS.length) tier = UNITS.length - 1;
  const scaled = n / Math.pow(10, tier * 3);
  const digits = scaled >= 100 ? 1 : 2;
  return scaled.toFixed(digits) + UNITS[tier];
}

/** 초 → "1시간 23분" 형태 */
export function fmtDuration(sec: number): string {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return t('dur.hm', '{h}시간 {m}분', { h, m });
  if (m > 0) return t('dur.ms', '{m}분 {s}초', { m, s: sec % 60 });
  return t('dur.s', '{s}초', { s: sec });
}

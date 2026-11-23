// Fuso horário sem bibliotecas: usa Intl, que já vem no navegador.

export const TZ_JAPAO = 'Asia/Tokyo';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function partsIn(tz: string, ms: number) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) {
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

function offsetMs(tz: string, ms: number) {
  const p = partsIn(tz, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** "2026-12-30" + "08:15" no fuso indicado → instante absoluto (ms). */
export function zonedToEpoch(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = offsetMs(tz, guess);
  let t = guess - off1;
  const off2 = offsetMs(tz, t);
  if (off2 !== off1) t = guess - off2;
  return t;
}

/** Data do calendário ("AAAA-MM-DD") de um instante, vista no fuso indicado. */
export function dateInTz(ms: number, tz: string): string {
  const p = partsIn(tz, ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function hourInTz(ms: number, tz: string): number {
  return partsIn(tz, ms).hour;
}

/** Dias de calendário entre duas datas "AAAA-MM-DD" (b - a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-12-30" → "ter, 30 dez" */
export function formatDia(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[wd]}, ${d} ${MESES[m - 1]}`;
}

export function formatDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

// ---------- Relógio do app, com o modo simulação ?agora= ----------

let simOffset = 0;
let simAtivo = false;

/**
 * Lê ?agora=2026-12-30T09:00+09:00 uma vez. O relógio continua andando a partir
 * daquele momento. Na URL o "+" vira espaço, então devolvemos o "+".
 */
export function initRelogio(search = window.location.search) {
  const raw = new URLSearchParams(search).get('agora');
  if (!raw) return;
  const t = Date.parse(raw.trim().replace(' ', '+'));
  if (!Number.isNaN(t)) {
    simOffset = t - Date.now();
    simAtivo = true;
  }
}

export function agora(): number {
  return Date.now() + simOffset;
}

export function simulando(): boolean {
  return simAtivo;
}

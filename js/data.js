// data.js — тогтмолууд, огнооны хэрэгслүүд, XP тооцооны дүрэм.
// Энд DOM ч байхгүй, localStorage ч байхгүй. Зөвхөн цэвэр утга, цэвэр функц.

export const NAMESPACE = 'gym:';
export const SCHEMA_VERSION = 1;
export const STATE_KEY = NAMESPACE + 'state_v1';
export const BACKUP_PREFIX = NAMESPACE + 'backup_';

export const PROGRAM_URL = './data/program.json';

// Түүхийн дэлгэц хэдэн өдрийг харуулах вэ.
export const HISTORY_DAYS = 30;

// Гарагийн нэрс. Индекс 0 = Даваа ... 6 = Ням.
// Хөтөлбөрийн days[0] нь Даваа, days[6] нь Ням гэж үзнэ.
export const WEEKDAY_NAMES = [
  'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'
];

export const WEEKDAY_SHORT = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

// XP тооцооны дүрэм. Одоохондоо хаашаа ч илгээхгүй, зөвхөн дотооддоо тооцно.
export const XP_RULES = {
  perExercise: 10,      // дуусгасан дасгал тутамд
  completionBonus: 25,  // өдрийг бүтэн дуусгавал нэмэгдэл
  restDay: 5            // амралтын өдрийг хүндэтгэсэн төлөө
};

/**
 * Date объектыг ОРОН НУТГИЙН цагаар "YYYY-MM-DD" болгоно.
 * toISOString() нь UTC руу шилжүүлдэг тул энд хэзээ ч ашиглахгүй.
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Өнөөдрийн огноо, орон нутгийн цагаар. */
export function todayString() {
  return toDateString(new Date());
}

/** "YYYY-MM-DD" -> орон нутгийн Date (үд дунд, DST-ийн ирмэгээс зайлсхийхийн тулд). */
export function parseDateString(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** "YYYY-MM-DD" дээр өдөр нэмэх/хасах. */
export function shiftDate(str, days) {
  const date = parseDateString(str);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/** Гарагийн индекс: 0 = Даваа ... 6 = Ням. */
export function weekdayIndex(dateStr) {
  return (parseDateString(dateStr).getDay() + 6) % 7;
}

/** Тухайн өдрийг агуулах долоо хоногийн Даваа гаригийн огноо. */
export function startOfWeek(dateStr) {
  return shiftDate(dateStr, -weekdayIndex(dateStr));
}

/** "2026-08-18" -> "8 сарын 18" */
export function formatDate(dateStr) {
  const date = parseDateString(dateStr);
  return `${date.getMonth() + 1} сарын ${date.getDate()}`;
}

/** "2026-08-18" -> "8 сарын 18, Даваа" */
export function formatDateLong(dateStr) {
  return `${formatDate(dateStr)}, ${WEEKDAY_NAMES[weekdayIndex(dateStr)]}`;
}

/** Одоогийн цагийг орон нутгийн "YYYY-MM-DD HH:MM" болгоно. */
export function localTimestamp(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${toDateString(date)} ${hh}:${mm}`;
}

/** Амралтын хугацааг "90с" / "2м 30с" болгож харуулна. */
export function formatRest(seconds) {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}с`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}м ${s}с` : `${m}м`;
}

/**
 * Өдрийн үр дүнгээс XP тооцно.
 * @param {{done:number, total:number, isRest:boolean}} result
 */
export function calcXp({ done = 0, total = 0, isRest = false } = {}) {
  if (isRest) return XP_RULES.restDay;
  if (total <= 0) return 0;
  let xp = done * XP_RULES.perExercise;
  if (done >= total) xp += XP_RULES.completionBonus;
  return xp;
}

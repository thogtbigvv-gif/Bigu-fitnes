// data.js — тогтмолууд, огнооны хэрэгслүүд.
// Энд DOM ч байхгүй, localStorage ч байхгүй. Зөвхөн цэвэр утга, цэвэр функц.
//
// Бүх огноо ОРОН НУТГИЙН цагаар "YYYY-MM-DD" мөр хэлбэртэй. Энэ хэлбэр нь
// лексикографаар эрэмбэлэгдэхэд хугацааны дарааллаараа орох тул апп даяар
// `a < b` гэсэн энгийн харьцуулалт зөв ажиллана.

export const NAMESPACE = 'gym:';

// v2: төлөвт `swaps` (өдөр солилцоо) нэмэгдсэн. Хуучин v1 өгөгдөл
// migrate() дундуур бүтнээрээ шилжинэ — нэг ч тэмдэглэгээ алдагдахгүй.
export const SCHEMA_VERSION = 2;
export const STATE_KEY = NAMESPACE + 'state_v1';
export const BACKUP_PREFIX = NAMESPACE + 'backup_';

export const PROGRAM_URL = './data/program.json';

/** program.json-ыг хэдэн миллисекунд хүлээх вэ. Үүнээс хэтэрвэл алдаа гэж үзнэ. */
export const PROGRAM_TIMEOUT_MS = 10000;

// Түүхийн дэлгэц хамгийн ихдээ хэдэн өдрийг харуулах вэ.
export const HISTORY_DAYS = 30;

// Хөтлөж эхлээгүй байхад 30 хоосон мөр харуулах нь худал зураг өгнө
// ("20 өдөр хийгээгүй"). Тиймээс жагсаалт эхний тэмдэглэгээнээс эхэлнэ,
// гэхдээ дэлгэц хоосон харагдахгүйн тулд наад зах нь энэ хэдэн өдөр гарна.
export const MIN_HISTORY_DAYS = 7;

// Долоо хоногт хэдэн өдөр (хөтөлбөрийн мөчлөг).
export const WEEK_DAYS = 7;

// Цуваа тоолохдоо хамгийн ихдээ хэдэн өдөр ухрах вэ (хязгааргүй давталтаас хамгаална).
export const STREAK_LOOKBACK_DAYS = 366;

// Гарагийн нэрс. Индекс 0 = Даваа ... 6 = Ням.
// Хөтөлбөрийн days[0] нь Даваа, days[6] нь Ням гэж үзнэ.
export const WEEKDAY_NAMES = [
  'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'
];

export const WEEKDAY_SHORT = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

/** "YYYY-MM-DD" хэлбэрийн шалгуур. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Огнооны мөр зөв хэлбэртэй БӨГӨӨД бодитоор оршин байдаг өдөр мөн үү.
 * "2026-02-30" нь хэлбэрийн хувьд зөв ч өдөр нь байхгүй тул false.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d, 12, 0, 0, 0);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/**
 * Date объектыг ОРОН НУТГИЙН цагаар "YYYY-MM-DD" болгоно.
 * toISOString() нь UTC руу шилжүүлдэг тул энд хэзээ ч ашиглахгүй.
 * @param {Date} date
 * @returns {string}
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Өнөөдрийн огноо, орон нутгийн цагаар.
 * @returns {string}
 */
export function todayString() {
  return toDateString(new Date());
}

/**
 * "YYYY-MM-DD" -> орон нутгийн Date (үд дунд, DST-ийн ирмэгээс зайлсхийхийн тулд).
 *
 * Танихгүй утга ирвэл ӨНӨӨДӨР рүү найдвартай уначихна. Урьд нь энд `NaN`
 * үүсээд `toDateString` нь "NaN-aN-aN" гэж буцааж, тэр нь хадгалалт руу
 * орж, түүх бүхэлдээ эвдэрдэг эрсдэлтэй байв.
 * @param {string} str
 * @returns {Date}
 */
export function parseDateString(str) {
  if (!isDateString(str)) {
    console.warn(`Огноо танигдсангүй: ${String(str)} — өнөөдрөөр орлууллаа.`);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * "YYYY-MM-DD" дээр өдөр нэмэх/хасах.
 * @param {string} str
 * @param {number} days
 * @returns {string}
 */
export function shiftDate(str, days) {
  const date = parseDateString(str);
  date.setDate(date.getDate() + (Number(days) || 0));
  return toDateString(date);
}

/**
 * Гарагийн индекс: 0 = Даваа ... 6 = Ням.
 * @param {string} dateStr
 * @returns {number}
 */
export function weekdayIndex(dateStr) {
  return (parseDateString(dateStr).getDay() + 6) % 7;
}

/**
 * Тухайн өдрийг агуулах долоо хоногийн Даваа гаригийн огноо.
 * @param {string} dateStr
 * @returns {string}
 */
export function startOfWeek(dateStr) {
  return shiftDate(dateStr, -weekdayIndex(dateStr));
}

/**
 * "2026-08-18" -> "8 сарын 18"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  const date = parseDateString(dateStr);
  return `${date.getMonth() + 1} сарын ${date.getDate()}`;
}

/**
 * "2026-08-18" -> "8 сарын 18, Даваа"
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDateLong(dateStr) {
  return `${formatDate(dateStr)}, ${WEEKDAY_NAMES[weekdayIndex(dateStr)]}`;
}

/**
 * Одоогийн цагийг орон нутгийн "YYYY-MM-DD HH:MM" болгоно.
 * @param {Date} [date]
 * @returns {string}
 */
export function localTimestamp(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${toDateString(date)} ${hh}:${mm}`;
}

/** "YYYY-MM-DD HH:MM" тэмдэглэгээний шалгуур. */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

/**
 * Хадгалсан тэмдэглэгээ уншиж болохуйц хэлбэртэй юу.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isTimestamp(value) {
  return typeof value === 'string' && TIMESTAMP_PATTERN.test(value);
}

/**
 * "2026-08-18 19:40" -> "19:40". Танихгүй бол хоосон.
 * @param {unknown} stamp
 * @returns {string}
 */
export function timeOfTimestamp(stamp) {
  return isTimestamp(stamp) ? /** @type {string} */ (stamp).slice(11, 16) : '';
}

/**
 * Амралтын хугацааг "90с" / "2м 30с" болгож харуулна.
 * @param {number} seconds
 * @returns {string}
 */
export function formatRest(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return '';
  if (total < 60) return `${total}с`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}м ${s}с` : `${m}м`;
}

/**
 * Секундыг тоолуурын "M:SS" хэлбэрт оруулна.
 * @param {number} seconds
 * @returns {string}
 */
export function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * "2026-08-17" + "2026-08-23" -> "8 сарын 17 — 8 сарын 23"
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {string}
 */
export function formatRange(fromDate, toDate) {
  return `${formatDate(fromDate)} — ${formatDate(toDate)}`;
}

/**
 * Хоёр огнооны хоорондох өдрийн зөрүү (a - b).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function daysBetween(a, b) {
  const ms = parseDateString(a).getTime() - parseDateString(b).getTime();
  return Math.round(ms / 86400000);
}

/**
 * Хувийг 0..100 хооронд аюулгүйгээр тооцно (0-д хуваахаас хамгаална).
 * @param {number} done
 * @param {number} total
 * @returns {number}
 */
export function percent(done, total) {
  const d = Number(done) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((d / t) * 100)));
}

/**
 * Дараагийн орон нутгийн шөнө дунд хүртэл хэдэн миллисекунд үлдсэн бэ.
 * @param {Date} [now]
 * @returns {number}
 */
export function msUntilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

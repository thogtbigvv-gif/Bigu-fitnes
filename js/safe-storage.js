// safe-storage.js — хөтчийн хадгалалттай харьцах ЦОРЫН ГАНЦ доод давхарга.
//
// Яагаад тусдаа файл вэ:
//   Урьд нь storage.js өөрийн try/catch-тай байсан бол bridge.js өөрийн
//   гэсэн, timer.js бүр огт хамгаалалтгүй байв. Нэг хөтөч дээр localStorage
//   хаалттай байхад аль нэг файл нь чимээгүй унаж, нөгөө нь мэдэгддэг —
//   ижил асуудалд гурван өөр зан. Одоо бүгд энэ хаалгаар орно.
//
// Энэ файл ЮУ Ч тайлбарлахгүй: түлхүүр, утга, JSON бүгд дээд давхарга дээр.
// Энд зөвхөн "боломжтой юу, бичигдсэн үү, яагаад болсонгүй" гэдэг л байна.

/** @typedef {'ok'|'blocked'|'full'} StorageStatus */

/** @type {StorageStatus} */
let status = 'ok';

/** @type {Set<(status: StorageStatus) => void>} */
const watchers = new Set();

/**
 * Төлөв ӨӨРЧЛӨГДСӨН үед л мэдэгдэнэ. Бичилт бүрд дуудвал UI дэмий сэрнэ.
 * @param {StorageStatus} next
 */
function setStatus(next) {
  if (status === next) return;
  status = next;
  for (const watcher of watchers) {
    try {
      watcher(status);
    } catch (err) {
      console.warn('safe-storage сонсогч алдаа өглөө:', err);
    }
  }
}

/**
 * Хадгалалтын төлөв өөрчлөгдөхөд дуудагдах сонсогч.
 * @param {(status: StorageStatus) => void} watcher
 * @returns {() => void} бүртгэлээс хасах
 */
export function onStatusChange(watcher) {
  if (typeof watcher !== 'function') return () => {};
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

/** @returns {StorageStatus} */
export function getStatus() {
  return status;
}

/**
 * Хадгалалт ажиллаж байна уу.
 * `window.localStorage`-д ХАНДАХ үйлдэл өөрөө шидэж болно (Safari-гийн
 * нууц горим, сайтын өгөгдөл хаалттай) тул зөвхөн typeof шалгаад болохгүй.
 * @param {'local'|'session'} [kind]
 * @returns {Storage|null}
 */
function store(kind = 'local') {
  try {
    if (typeof window === 'undefined') return null;
    const target = kind === 'session' ? window.sessionStorage : window.localStorage;
    // Зарим хөтөч дээр объект нь байгаа мөртлөө хандахад шиднэ.
    if (!target || typeof target.getItem !== 'function') return null;
    return target;
  } catch (err) {
    return null;
  }
}

/**
 * Түлхүүр уншина. Ямар ч тохиолдолд шидэхгүй.
 * @param {string} key
 * @param {'local'|'session'} [kind]
 * @returns {string|null}
 */
export function readRaw(key, kind = 'local') {
  const target = store(kind);
  if (!target) {
    if (kind === 'local') setStatus('blocked');
    return null;
  }
  try {
    const value = target.getItem(key);
    if (kind === 'local') setStatus('ok');
    return value;
  } catch (err) {
    console.warn(`Хадгалалтаас "${key}" уншиж чадсангүй:`, err);
    if (kind === 'local') setStatus('blocked');
    return null;
  }
}

/**
 * Түлхүүр бичнэ. Ямар ч тохиолдолд шидэхгүй.
 * @param {string} key
 * @param {string} value
 * @param {'local'|'session'} [kind]
 * @returns {boolean} үнэхээр бичигдсэн эсэх
 */
export function writeRaw(key, value, kind = 'local') {
  const target = store(kind);
  if (!target) {
    if (kind === 'local') setStatus('blocked');
    return false;
  }
  try {
    target.setItem(key, value);
    if (kind === 'local') setStatus('ok');
    return true;
  } catch (err) {
    console.warn(`Хадгалалтад "${key}" бичиж чадсангүй:`, err);
    if (kind === 'local') setStatus(isQuotaError(err) ? 'full' : 'blocked');
    return false;
  }
}

/**
 * Түлхүүр устгана. Ямар ч тохиолдолд шидэхгүй.
 * @param {string} key
 * @param {'local'|'session'} [kind]
 * @returns {boolean}
 */
export function removeRaw(key, kind = 'local') {
  const target = store(kind);
  if (!target) return false;
  try {
    target.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`Хадгалалтаас "${key}" устгаж чадсангүй:`, err);
    return false;
  }
}

/**
 * Зай дүүрсний алдаа мөн үү. Хөтөч бүр өөр нэр / өөр код өгдөг тул
 * аль алиныг нь шалгана.
 * @param {unknown} err
 */
function isQuotaError(err) {
  if (!err || typeof err !== 'object') return false;
  const name = /** @type {{name?: string, code?: number}} */ (err).name;
  const code = /** @type {{name?: string, code?: number}} */ (err).code;
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/**
 * JSON уншина. Эвдэрсэн бол null буцаана — ЭНД хаяхгүй, дээд давхарга
 * нөөцлөх эсэхээ өөрөө шийднэ.
 * @param {string} key
 * @param {'local'|'session'} [kind]
 * @returns {{ raw: string, value: unknown }|null}
 */
export function readJson(key, kind = 'local') {
  const raw = readRaw(key, kind);
  if (raw == null || raw === '') return null;
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (err) {
    console.warn(`"${key}" доторх JSON эвдэрсэн байна:`, err);
    return { raw, value: null };
  }
}

/**
 * JSON бичнэ. Цуваалж чадахгүй утга (циклтэй объект) ирвэл ч унахгүй.
 * @param {string} key
 * @param {unknown} value
 * @param {'local'|'session'} [kind]
 * @returns {boolean}
 */
export function writeJson(key, value, kind = 'local') {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (err) {
    console.warn(`"${key}" -г JSON болгож чадсангүй:`, err);
    return false;
  }
  if (typeof text !== 'string') return false;
  return writeRaw(key, text, kind);
}

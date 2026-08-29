// ui.js — бүрхүүл: табууд, огнооны сонголт, event хуваарилалт, мэдэгдэл.
//
// Дэлгэц бүрийн зураглал js/views/ дотор. Энэ файл юу ч зурахгүй —
// зөвхөн "аль дэлгэц, ямар өдөр, ямар үйлдэл" гэдгийг шийднэ.

import { isDateString, todayString } from './data.js';
import { clear, el, h } from './dom.js';
import { dayForDate, swapDays, undoSwap } from './schedule.js';
import { clearAll, getStorageError, saveDay } from './storage.js';
import { countDone, isExerciseDone, readSets } from './stats.js';
import * as timer from './timer.js';

import { renderDay, resetProgress } from './views/day.js';
import { renderWeek } from './views/week.js';
import { armClear, openDetails, renderHistory, toggleDetails } from './views/history.js';

/** @typedef {import('./types.js').Day} Day */
/** @typedef {import('./types.js').SetMarks} SetMarks */

/* ---------------- Харагдацын төлөв ---------------- */

const screens = {
  today: () => el('screen-today'),
  week: () => el('screen-week'),
  history: () => el('screen-history')
};

const TAB_ORDER = /** @type {const} */ (['today', 'week', 'history']);

/** @type {'today'|'week'|'history'} */
let activeTab = 'today';

/** null бол өнөөдөр. Өөр огноо бол тэр өдрийг харж/засаж байна. */
/** @type {string|null} */
let viewDate = null;

/** Нээлттэй байгаа дасгалын мөрүүд. */
/** @type {Set<string>} */
const openCards = new Set();

/** Дөнгөж дарсан элемент — зөвхөн тэр дээр хөдөлгөөн тоглоно. */
/** @type {{exercise: string, kind: string, index: number}|null} */
let flash = null;

/** Өдөр солих жагсаалт нээлттэй байгаа эсэх (өдөр/таб солиход хаагдана). */
let swapOpen = false;

/** Одоо харж байгаа огноо. */
function currentDate() {
  return viewDate || todayString();
}

/* ---------------- Мэдэгдэл ---------------- */

/**
 * Хадгалалт бүтэхгүй байгаа бол ил хэлнэ. Чимээгүй алдагдах нь хамгийн муу
 * төлөв тул үүнийг хэрэглэгчээс нуухгүй.
 */
export function refreshNotice() {
  const node = el('notice');
  if (!node) return;

  const message = getStorageError();
  if (!message) {
    node.hidden = true;
    node.textContent = '';
    return;
  }

  // Ижил мессежийг дахин бичих нь role="status"-ыг дэмий уншуулна.
  if (node.textContent !== message) node.textContent = message;
  node.hidden = false;
}

/* ---------------- Бичих ---------------- */

/**
 * @param {string} date
 * @param {Day} day
 * @param {SetMarks} sets
 */
function commit(date, day, sets) {
  saveDay({
    date,
    dayId: day.id,
    sets,
    done: countDone(day, sets),
    total: day.exercises.length
  });
}

/* ---------------- Өдрийн дэлгэцийн үйлдлүүд ---------------- */

/** @param {MouseEvent} event */
function handleDayClick(event) {
  const trigger = /** @type {HTMLElement|null} */ (
    /** @type {Element} */ (event.target).closest('[data-action]')
  );
  if (!trigger) return;

  const { action, exercise: exerciseId, index, date: stepDate } = trigger.dataset;

  // --- Огноо солих ---
  if (action === 'back-today') return showDay(null);
  if (action === 'step') return showDay(stepDate || null);

  // --- Өдөр солилцоо ---
  if (action === 'swap-open') {
    swapOpen = !swapOpen;
    return render();
  }
  if (action === 'swap-pick') return applySwap(stepDate || null);
  if (action === 'swap-undo') return applySwap(null);

  if (action === 'timer-stop') {
    timer.stop();
    return render();
  }

  const date = currentDate();
  const today = todayString();
  const day = dayForDate(date);
  if (!day || day.isRest) return;

  if (action === 'open') {
    if (!exerciseId) return;
    if (openCards.has(exerciseId)) openCards.delete(exerciseId);
    else openCards.add(exerciseId);
    return render();
  }

  if (action !== 'toggle' && action !== 'set') return;
  if (date > today) return; // ирээдүйг урьдчилж тэмдэглэхгүй
  if (!exerciseId) return;

  const sets = readSets(date, day);
  const marks = sets[exerciseId];
  const exercise = day.exercises.find((item) => item.id === exerciseId);
  if (!marks || !exercise) return;

  if (action === 'toggle') {
    flash = { exercise: exerciseId, kind: action, index: -1 };
    const next = !isExerciseDone(marks);
    sets[exerciseId] = marks.map(() => next);
    // Дасгал бүтэн дуусахад амрах шаардлагагүй — тоолуурыг хаана.
    if (timer.isActiveFor(exerciseId)) timer.stop();
  } else {
    // data-index нь бидний өөрсдийн бичсэн утга ч гэсэн, гажсан DOM дээр
    // NaN болж болзошгүй — тэр тохиолдолд юу ч хийхгүй өнгөрөх нь зөв.
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= marks.length) return;

    flash = { exercise: exerciseId, kind: action, index: i };
    marks[i] = !marks[i];
    openCards.add(exerciseId); // сет дээр дархад мөр нээлттэй хэвээр байх нь зүйтэй
    updateTimer(exercise, marks, marks[i], date === today);
  }

  commit(date, day, sets);
  render();
  flash = null; // дараагийн render дээр дахин тоглохгүй
}

/**
 * Өдөр солих / солилцоог буцаах.
 *
 * Төлөвлөгөө нь бүхэлдээ солигдож байгаа тул нээлттэй байсан дасгалын
 * мөрүүд ба ажиллаж байгаа тоолуур утгагүй болно — хоёуланг нь тэглэнэ.
 * @param {string|null} target null бол солилцоог буцаана
 */
function applySwap(target) {
  const date = currentDate();
  const changed = target ? swapDays(date, target) : undoSwap(date);

  swapOpen = false;
  if (changed) {
    openCards.clear();
    timer.stop();
  }
  render();
}

/**
 * Сет тэмдэглэснээр амралтын тоолуур эхэлнэ.
 * - Зөвхөн ӨНӨӨДӨР. Өнгөрсөн өдөр нөхөж тэмдэглэхэд тоолуур утгагүй.
 * - Сет тайлахад тоолуур зогсоно.
 * - Сүүлчийн сет тэмдэглэгдэхэд амрах шаардлагагүй тул зогсоно.
 * @param {import('./types.js').Exercise} exercise
 * @param {boolean[]} marks
 * @param {boolean} turnedOn
 * @param {boolean} isToday
 */
function updateTimer(exercise, marks, turnedOn, isToday) {
  if (!isToday || !turnedOn) {
    if (timer.isActiveFor(exercise.id)) timer.stop();
    return;
  }
  if (marks.every(Boolean)) {
    timer.stop();
    return;
  }
  timer.start(exercise.id, exercise.rest);
}

/* ---------------- Долоо хоног / түүхийн үйлдлүүд ---------------- */

/** @param {MouseEvent} event */
function handleWeekClick(event) {
  const trigger = /** @type {HTMLElement|null} */ (
    /** @type {Element} */ (event.target).closest('[data-action="day"]')
  );
  if (trigger) showDay(trigger.dataset.date || null);
}

/** @param {MouseEvent} event */
function handleHistoryClick(event) {
  const trigger = /** @type {HTMLElement|null} */ (
    /** @type {Element} */ (event.target).closest('[data-action]')
  );
  if (!trigger) return;

  const { action, date } = trigger.dataset;

  if (action === 'day') return showDay(date || null);

  if (action === 'details') {
    toggleDetails();
    return render();
  }

  if (action === 'clear-arm') armClear(true);
  else if (action === 'clear-cancel') armClear(false);
  else if (action === 'clear-confirm') {
    clearAll();
    armClear(false);
  } else return;

  render();
}

/* ---------------- Табууд ба чиглүүлэлт ---------------- */

const RENDERERS = {
  today: (/** @type {HTMLElement} */ root) => renderDay(root, {
    date: currentDate(),
    today: todayString(),
    openCards,
    swapOpen,
    flash
  }),
  week: renderWeek,
  history: renderHistory
};

/* ---------------- Фокус ба скроллыг хадгалах ---------------- */

/**
 * Дэлгэц бүхэлдээ дахин баригддаг тул дарсан ТОВЧ ӨӨРӨӨ алга болдог.
 * Үүнээс болж:
 *   - гар/уншигчаар ажиллаж байгаа хүн сет тэмдэглэх бүрд фокусаа алдаж,
 *     дараагийн сет рүү шилжихийн тулд эхнээс нь Tab дарах шаардлагатай болдог;
 * Тиймээс дахин зурахаас ӨМНӨ фокустай элементийн "хаяг"-ийг цээжилж,
 * зурсны ДАРАА яг тэр хаягаар олж эргүүлэн өгнө.
 * @param {HTMLElement} root
 * @returns {string|null} CSS сонгогч
 */
function captureFocus(root) {
  const node = document.activeElement;
  if (!(node instanceof HTMLElement) || !root.contains(node)) return null;

  const { action, exercise, index, date } = node.dataset;
  if (!action) return null;

  const escape = (/** @type {string} */ value) =>
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(value)
      : value.replace(/["\\]/g, '\\$&');

  let selector = `[data-action="${escape(action)}"]`;
  if (exercise) selector += `[data-exercise="${escape(exercise)}"]`;
  if (index != null) selector += `[data-index="${escape(index)}"]`;
  if (date) selector += `[data-date="${escape(date)}"]`;
  return selector;
}

/**
 * @param {HTMLElement} root
 * @param {string|null} selector
 */
function restoreFocus(root, selector) {
  if (!selector) return;
  let target = null;
  try {
    target = root.querySelector(selector);
  } catch (err) {
    return; // гажсан сонгогч — фокус бол тав тух, алдаа болох ёсгүй
  }
  if (target instanceof HTMLElement && !(/** @type {any} */ (target).disabled)) {
    target.focus({ preventScroll: true });
  }
}

/**
 * Идэвхтэй дэлгэцийг дахин зурна.
 *
 * `replaceChildren()` хийх агшинд баримтын өндөр агшин зуур 0 болж, хөтөч
 * скроллыг дээш нь шахдаг. Урьд нь энэ нь урт жагсаалтын доод талын сет
 * дарах бүрд дэлгэцийг эхэнд нь буцаадаг байв. Хуучин байрлалыг санаж,
 * шинэ агуулга үүссэний дараа эргүүлж тавина.
 */
export function render() {
  const root = screens[activeTab]();
  if (!root) return;

  const focusSelector = captureFocus(root);
  const scrollY = window.scrollY;

  try {
    RENDERERS[activeTab](root);
  } catch (err) {
    console.error('Дэлгэц зурагдсангүй:', err);
    showError(
      'Дэлгэцийг зурахад алдаа гарлаа. Хуудсыг дахин ачаална уу. ' +
      `Дэлгэрэнгүй: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  restoreFocus(root, focusSelector);
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY });

  timer.refresh();
  refreshNotice();
}

/**
 * Табын chrome-ыг (заагч, aria, нуулт) идэвхтэй таб руу тааруулна.
 * @param {'today'|'week'|'history'} name
 */
function applyTab(name) {
  activeTab = name;

  for (const [key, get] of Object.entries(screens)) {
    const node = get();
    if (node) node.hidden = key !== name;
  }

  for (const tab of document.querySelectorAll('.tab')) {
    const isActive = /** @type {HTMLElement} */ (tab).dataset.tab === name;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    /** @type {HTMLElement} */ (tab).tabIndex = isActive ? 0 : -1;
  }

  const indicator = el('tab-ind');
  if (indicator) {
    indicator.style.transform = `translateX(${TAB_ORDER.indexOf(name) * 100}%)`;
  }

  armClear(false);     // таб солиход устгах баталгаажуулалт тайлагдана
  openDetails(false);  // түүх нь үргэлж чеклистээрээ эхэлнэ
  swapOpen = false;    // хагас нээлттэй жагсаалт өөр дэлгэц рүү дагаж очихгүй
  resetProgress();
  render();

  // Таб солиход дээрээс нь эхлэх нь зөв — энэ нь render()-ийн скролл
  // сэргээлтийг ЗОРИУДААР дарж бичнэ.
  window.scrollTo({ top: 0 });
}

/**
 * Таб солино. Аль ч таб руу шилжихэд огнооны сонголт өнөөдөр рүү буцна —
 * "яагаад өчигдөр харагдаж байна вэ" гэсэн эргэлзээ үүсэхгүй.
 * @param {string} name
 */
export function showTab(name) {
  if (!Object.prototype.hasOwnProperty.call(RENDERERS, name)) return;
  if (viewDate !== null) {
    viewDate = null;
    openCards.clear();
    timer.stop();
  }
  applyTab(/** @type {'today'|'week'|'history'} */ (name));
}

/**
 * Тухайн өдрийн дэлгэцийг нээнэ. Долоо хоног / түүхийн мөр дарахад дуудагдана.
 * @param {string|null} date null бол өнөөдөр
 */
export function showDay(date) {
  const today = todayString();
  // Танихгүй огноо ирвэл өнөөдөр рүү аюулгүйгээр унана.
  const valid = date && isDateString(date) ? date : null;
  const next = !valid || valid === today ? null : valid;

  if (next !== viewDate) {
    openCards.clear();
    swapOpen = false;
    timer.stop(); // өөр өдөр рүү шилжихэд амралтын тоолуур утгагүй болно
  }

  viewDate = next;
  applyTab('today');
}

/**
 * Шөнө дунд давсны дараа дуудагдана — харж байсан огноо өнөөдөр байсан бол
 * шинэ өдөр рүү аяндаа шилжинэ.
 */
export function refreshDate() {
  if (viewDate === null) {
    resetProgress();
    timer.stop();
  }
  render();
}

/**
 * Одоо харагдаж байгаа өдрийн дасгалын id-ууд.
 * Тоолуурыг сэргээхэд "энэ id өнөөдөр байгаа юу" гэдгийг шалгахад хэрэглэнэ.
 * @returns {string[]}
 */
export function visibleExerciseIds() {
  const day = dayForDate(currentDate());
  return day ? day.exercises.map((exercise) => exercise.id) : [];
}

/* ---------------- Холболт ---------------- */

/**
 * Табын хооронд сум товчоор шилжих (a11y).
 * @param {KeyboardEvent} event
 */
function handleTabKeydown(event) {
  const index = TAB_ORDER.indexOf(activeTab);
  let next = null;

  if (event.key === 'ArrowRight') next = (index + 1) % TAB_ORDER.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = TAB_ORDER.length - 1;
  else return;

  event.preventDefault();
  showTab(TAB_ORDER[next]);
  /** @type {HTMLElement|null} */ (document.querySelector('.tab.is-active'))?.focus();
}

/**
 * Event binding — нэг л удаа дуудагдана.
 * DOM бүрэн бүтэн эсэхийг ЭНД шалгана: index.html-ээс нэг хэсэг дутвал
 * хожим "null дээр addEventListener" гэсэн ойлгомжгүй алдаа гарахын оронд
 * шалтгааныг нь шууд хэлнэ.
 * @throws {Error} шаардлагатай элемент дутвал
 */
export function mount() {
  const required = ['screen-today', 'screen-week', 'screen-history', 'tabbar'];
  const missing = required.filter((id) => !el(id));
  if (missing.length > 0) {
    throw new Error(`index.html дотор дараах хэсэг олдсонгүй: ${missing.join(', ')}`);
  }

  /** @type {HTMLElement} */ (screens.today()).addEventListener('click', handleDayClick);
  /** @type {HTMLElement} */ (screens.week()).addEventListener('click', handleWeekClick);
  /** @type {HTMLElement} */ (screens.history()).addEventListener('click', handleHistoryClick);

  const tabbar = /** @type {HTMLElement} */ (el('tabbar'));
  tabbar.addEventListener('click', (event) => {
    const tab = /** @type {HTMLElement|null} */ (
      /** @type {Element} */ (event.target).closest('[data-tab]')
    );
    if (tab && tab.dataset.tab) showTab(tab.dataset.tab);
  });
  tabbar.addEventListener('keydown', handleTabKeydown);
}

/**
 * Ачаалахад алдаа гарвал дэлгэц дээр шууд харуулна.
 * @param {string} message
 */
export function showError(message) {
  const root = screens.today();
  if (!root) return;
  clear(root);
  root.appendChild(h('header', { class: 'head' }, [
    h('h1', { class: 'head__title', text: 'Алдаа гарлаа' })
  ]));
  root.appendChild(h('div', { class: 'error', text: message }));
}

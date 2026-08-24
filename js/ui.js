// ui.js — бүрхүүл: табууд, огнооны сонголт, event хуваарилалт, мэдэгдэл.
//
// Дэлгэц бүрийн зураглал js/views/ дотор. Энэ файл юу ч зурахгүй —
// зөвхөн "аль дэлгэц, ямар өдөр, ямар үйлдэл" гэдгийг шийднэ.

import { todayString } from './data.js';
import { clear, el, h } from './dom.js';
import { getDayForDate } from './program.js';
import { clearAll, getStorageError, saveDay } from './storage.js';
import { countDone, isExerciseDone, readSets } from './stats.js';
import * as timer from './timer.js';

import { renderDay, resetProgress } from './views/day.js';
import { renderWeek } from './views/week.js';
import { armClear, renderHistory } from './views/history.js';

/* ---------------- Харагдацын төлөв ---------------- */

const screens = {
  today: () => el('screen-today'),
  week: () => el('screen-week'),
  history: () => el('screen-history')
};

const TAB_ORDER = ['today', 'week', 'history'];

let activeTab = 'today';

/** null бол өнөөдөр. Өөр огноо бол тэр өдрийг харж/засаж байна. */
let viewDate = null;

/** Нээлттэй байгаа дасгалын мөрүүд. */
const openCards = new Set();

/** Дөнгөж дарсан элемент — зөвхөн тэр дээр хөдөлгөөн тоглоно. */
let flash = null;

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

  node.textContent = message;
  node.hidden = false;
}

/* ---------------- Бичих ---------------- */

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

function handleDayClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const { action, exercise: exerciseId, index, date: stepDate } = trigger.dataset;

  // --- Огноо солих ---
  if (action === 'back-today') return showDay(null);
  if (action === 'step') return showDay(stepDate);

  if (action === 'timer-stop') {
    timer.stop();
    return render();
  }

  const date = currentDate();
  const today = todayString();
  const day = getDayForDate(date);
  if (!day || day.isRest) return;

  if (action === 'open') {
    if (openCards.has(exerciseId)) openCards.delete(exerciseId);
    else openCards.add(exerciseId);
    return render();
  }

  if (action !== 'toggle' && action !== 'set') return;
  if (date > today) return; // ирээдүйг урьдчилж тэмдэглэхгүй

  const sets = readSets(date, day);
  const marks = sets[exerciseId];
  const exercise = day.exercises.find((item) => item.id === exerciseId);
  if (!marks || !exercise) return;

  flash = { exercise: exerciseId, kind: action, index: action === 'set' ? Number(index) : -1 };

  if (action === 'toggle') {
    const next = !isExerciseDone(marks);
    sets[exerciseId] = marks.map(() => next);
    // Дасгал бүтэн дуусахад амрах шаардлагагүй — тоолуурыг хаана.
    if (timer.isActiveFor(exerciseId)) timer.stop();
  } else {
    const i = Number(index);
    marks[i] = !marks[i];
    openCards.add(exerciseId); // сет дээр дархад мөр нээлттэй хэвээр байх нь зүйтэй
    updateTimer(exercise, marks, marks[i], date === today);
  }

  commit(date, day, sets);
  render();
  flash = null; // дараагийн render дээр дахин тоглохгүй
}

/**
 * Сет тэмдэглэснээр амралтын тоолуур эхэлнэ.
 * - Зөвхөн ӨНӨӨДӨР. Өнгөрсөн өдөр нөхөж тэмдэглэхэд тоолуур утгагүй.
 * - Сет тайлахад тоолуур зогсоно.
 * - Сүүлчийн сет тэмдэглэгдэхэд амрах шаардлагагүй тул зогсоно.
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

function handleWeekClick(event) {
  const trigger = event.target.closest('[data-action="day"]');
  if (trigger) showDay(trigger.dataset.date);
}

function handleHistoryClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const { action, date } = trigger.dataset;

  if (action === 'day') return showDay(date);

  if (action === 'clear-arm') armClear(true);
  else if (action === 'clear-cancel') armClear(false);
  else if (action === 'clear-confirm') {
    clearAll();
    armClear(false);
  } else return;

  renderHistory(screens.history());
}

/* ---------------- Табууд ба чиглүүлэлт ---------------- */

const RENDERERS = {
  today: (root) => renderDay(root, {
    date: currentDate(),
    today: todayString(),
    openCards,
    flash
  }),
  week: renderWeek,
  history: renderHistory
};

/** Идэвхтэй дэлгэцийг дахин зурна (скроллыг хөндөхгүй). */
export function render() {
  RENDERERS[activeTab](screens[activeTab]());
  timer.refresh();
  refreshNotice();
}

/** Табын chrome-ыг (заагч, aria, нуулт) идэвхтэй таб руу тааруулна. */
function applyTab(name) {
  activeTab = name;

  for (const [key, get] of Object.entries(screens)) {
    get().hidden = key !== name;
  }

  for (const tab of document.querySelectorAll('.tab')) {
    const isActive = tab.dataset.tab === name;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.tabIndex = isActive ? 0 : -1;
  }

  const indicator = el('tab-ind');
  if (indicator) {
    indicator.style.transform = `translateX(${TAB_ORDER.indexOf(name) * 100}%)`;
  }

  armClear(false);   // таб солиход устгах баталгаажуулалт тайлагдана
  resetProgress();
  render();

  el('app-main')?.scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0 });
}

/**
 * Таб солино. Аль ч таб руу шилжихэд огнооны сонголт өнөөдөр рүү буцна —
 * "яагаад өчигдөр харагдаж байна вэ" гэсэн эргэлзээ үүсэхгүй.
 */
export function showTab(name) {
  if (!RENDERERS[name]) return;
  if (viewDate !== null) {
    viewDate = null;
    openCards.clear();
    timer.stop();
  }
  applyTab(name);
}

/**
 * Тухайн өдрийн дэлгэцийг нээнэ. Долоо хоног / түүхийн мөр дарахад дуудагдана.
 * @param {string|null} date null бол өнөөдөр
 */
export function showDay(date) {
  const today = todayString();
  const next = !date || date === today ? null : date;

  if (next !== viewDate) {
    openCards.clear();
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

/* ---------------- Холболт ---------------- */

/** Табын хооронд сум товчоор шилжих (a11y). */
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
  document.querySelector('.tab.is-active')?.focus();
}

/** Event binding — нэг л удаа дуудагдана. */
export function mount() {
  screens.today().addEventListener('click', handleDayClick);
  screens.week().addEventListener('click', handleWeekClick);
  screens.history().addEventListener('click', handleHistoryClick);

  const tabbar = el('tabbar');
  tabbar.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) showTab(tab.dataset.tab);
  });
  tabbar.addEventListener('keydown', handleTabKeydown);
}

/** Ачаалахад алдаа гарвал дэлгэц дээр шууд харуулна. */
export function showError(message) {
  const root = screens.today();
  clear(root);
  root.appendChild(h('header', { class: 'head' }, [
    h('h1', { class: 'head__title', text: 'Алдаа гарлаа' })
  ]));
  root.appendChild(h('div', { class: 'error', text: message }));
}

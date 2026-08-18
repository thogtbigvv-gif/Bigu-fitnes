// ui.js — DOM render ба event binding. Өгөгдлийг өөрөө хадгалахгүй,
// зөвхөн program.js + storage.js-ээс уншиж, буцаагаад тэдэн рүү бичнэ.

import {
  HISTORY_DAYS,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  formatDate,
  formatDateLong,
  formatRest,
  startOfWeek,
  shiftDate,
  todayString,
  weekdayIndex
} from './data.js';

import { getDayForDate } from './program.js';

import {
  clearAll,
  getDaySets,
  getDayResult,
  getRecentDays,
  getWeekResults,
  saveDay
} from './storage.js';

/* ---------------- DOM туслахууд ---------------- */

const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>';

function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'icon') node.innerHTML = value; // зөвхөн дотоод тогтмол SVG
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

function clear(node) {
  node.replaceChildren();
}

const screens = {
  today: () => document.getElementById('screen-today'),
  week: () => document.getElementById('screen-week'),
  history: () => document.getElementById('screen-history')
};

/* ---------------- Харагдацын төлөв ---------------- */

let activeTab = 'today';
const openCards = new Set(); // нээлттэй байгаа дасгалын id-ууд
let confirmClear = false;    // "бүгдийг устгах" товч баталгаажуулалт хүлээж байна уу

/* ---------------- Тооцоолол ---------------- */

/** Тухайн өдрийн сет тэмдэглэгээг хөтөлбөртэй тааруулж жигдрүүлнэ. */
function readSets(date, day) {
  const stored = getDaySets(date);
  const sets = {};
  for (const exercise of day.exercises) {
    const marks = Array.isArray(stored[exercise.id]) ? stored[exercise.id] : [];
    sets[exercise.id] = Array.from({ length: exercise.sets }, (_, i) => Boolean(marks[i]));
  }
  return sets;
}

function isExerciseDone(marks) {
  return marks.length > 0 && marks.every(Boolean);
}

function countDone(day, sets) {
  return day.exercises.reduce(
    (sum, exercise) => sum + (isExerciseDone(sets[exercise.id]) ? 1 : 0),
    0
  );
}

/** Өдрийн төлөв: 'rest' | 'done' | 'partial' | 'none' */
function dayStatus(date) {
  const day = getDayForDate(date);
  if (!day) return { key: 'none', done: 0, total: 0, day: null };
  if (day.isRest) return { key: 'rest', done: 0, total: 0, day };

  const result = getDayResult(date);
  const total = day.exercises.length;
  const done = result ? Math.min(result.done, total) : 0;
  if (total > 0 && done >= total) return { key: 'done', done, total, day };
  if (done > 0) return { key: 'partial', done, total, day };
  return { key: 'none', done: 0, total, day };
}

/** Өнөөдрөөс хойших хамгийн ойрын бэлтгэлийн өдөр. */
function nextTrainingDay(fromDate) {
  for (let i = 1; i <= 7; i += 1) {
    const date = shiftDate(fromDate, i);
    const day = getDayForDate(date);
    if (day && !day.isRest) return { date, day };
  }
  return null;
}

/* ---------------- Өнөөдөр дэлгэц ---------------- */

function renderProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = h('div', { class: 'progress__fill' });
  fill.style.width = `${pct}%`;

  return h('div', { class: 'progress' }, [
    h('div', { class: 'progress__meta' }, [
      h('span', { class: 'progress__count num', text: `${done}/${total} дасгал` }),
      h('span', { class: 'progress__pct num', text: `${pct}%` })
    ]),
    h('div', {
      class: 'progress__track bleed',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': String(done),
      'aria-label': 'Өнөөдрийн гүйцэтгэл'
    }, [fill])
  ]);
}

function renderExerciseRow(exercise, marks) {
  const done = isExerciseDone(marks);
  const doneSets = marks.filter(Boolean).length;
  const partial = !done && doneSets > 0;
  const open = openCards.has(exercise.id);

  const meta = [`${exercise.sets} × ${exercise.reps}`];
  if (exercise.rest) meta.push(`амралт ${formatRest(exercise.rest)}`);

  const classes = ['row-ex'];
  if (done) classes.push('is-done');
  if (partial) classes.push('is-partial');
  if (open) classes.push('is-open');

  const box = h('span', { class: 'mark__box' }, [
    h('span', { class: 'num', text: partial ? String(doneSets) : '' }),
    h('span', { icon: CHECK, 'aria-hidden': 'true' })
  ]);

  const setButtons = marks.map((on, index) =>
    h('button', {
      type: 'button',
      class: `set num${on ? ' is-on' : ''}`,
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': `${index + 1}-р сет`,
      dataset: { action: 'set', exercise: exercise.id, index: String(index) },
      text: String(index + 1)
    })
  );

  return h('li', {}, [
    h('div', { class: classes.join(' ') }, [
      h('button', {
        type: 'button',
        class: 'mark',
        'aria-pressed': done ? 'true' : 'false',
        'aria-label': `${exercise.name} — дууссан гэж тэмдэглэх`,
        dataset: { action: 'toggle', exercise: exercise.id }
      }, [box]),

      h('button', {
        type: 'button',
        class: 'row-ex__body',
        'aria-expanded': open ? 'true' : 'false',
        dataset: { action: 'open', exercise: exercise.id }
      }, [
        h('span', { class: 'row-ex__name', text: exercise.name }),
        h('span', { class: 'row-ex__reps num', text: meta.join(' · ') }),
        exercise.note ? h('span', { class: 'row-ex__note', text: exercise.note }) : null
      ])
    ]),

    h('div', { class: 'sets' }, [
      h('div', { class: 'sets__label label num', text: `Сет — ${doneSets}/${marks.length}` }),
      h('div', { class: 'sets__row' }, setButtons)
    ])
  ]);
}

function renderRestDay(date, day) {
  const next = nextTrainingDay(date);

  return [
    h('header', { class: 'head' }, [
      h('div', { class: 'head__date num', text: formatDateLong(date) }),
      h('h1', { class: 'head__title', text: day.title })
    ]),
    h('section', { class: 'rest' }, [
      h('div', { class: 'rest__title', text: 'Өнөөдөр ачаалал алга' }),
      h('p', {
        class: 'rest__text',
        text: 'Булчин заал дээр биш, амрах үедээ ургадаг. Хоол, ус, нойроо гүйцээ.'
      }),
      next
        ? h('div', { class: 'rest__next' }, [
          h('div', { class: 'rest__next-label label', text: 'Дараагийн бэлтгэл' }),
          h('div', {
            class: 'rest__next-day',
            text: `${WEEKDAY_NAMES[weekdayIndex(next.date)]} — ${next.day.title}`
          })
        ])
        : null
    ])
  ];
}

function renderToday() {
  const root = screens.today();
  clear(root);

  const date = todayString();
  const day = getDayForDate(date);

  if (!day) {
    root.appendChild(h('div', { class: 'error', text: 'Өнөөдөрт тохирох өдөр хөтөлбөрөөс олдсонгүй.' }));
    return;
  }

  if (day.isRest) {
    for (const node of renderRestDay(date, day)) root.appendChild(node);
    return;
  }

  const sets = readSets(date, day);
  const done = countDone(day, sets);
  const total = day.exercises.length;
  const isComplete = total > 0 && done >= total;

  root.appendChild(h('header', { class: 'head' }, [
    h('div', { class: 'head__date num', text: formatDateLong(date) }),
    h('h1', { class: 'head__title', text: day.title }),
    renderProgress(done, total)
  ]));

  if (isComplete) {
    const result = getDayResult(date);
    root.appendChild(h('div', { class: 'done-block' }, [
      h('div', { class: 'done-block__title', text: 'Бэлтгэл дууслаа' }),
      h('div', {
        class: 'done-block__text num',
        text: result && result.completedAt
          ? `Дуусгасан ${result.completedAt.slice(11)} · ${total}/${total} дасгал`
          : `${total}/${total} дасгал тэмдэглэгдсэн`
      })
    ]));
  }

  root.appendChild(h('section', { class: 'section' }, [
    h('h2', { class: 'section__title label', text: 'Дасгалууд' }),
    h('ul', { class: 'list' }, day.exercises.map((exercise) =>
      renderExerciseRow(exercise, sets[exercise.id])
    ))
  ]));
}

/* ---------------- Долоо хоног дэлгэц ---------------- */

const STATE_LABEL = {
  done: 'Биелсэн',
  partial: 'Дутуу',
  rest: 'Амралт',
  none: 'Хийгээгүй',
  upcoming: 'Удахгүй'
};

const DOT_CLASS = {
  done: 'is-full',
  partial: 'is-half',
  rest: 'is-rest'
};

function renderDayRow(date, today, label) {
  const status = dayStatus(date);
  const isFuture = date > today;
  const key = isFuture && status.key === 'none' ? 'upcoming' : status.key;

  const classes = ['row-day'];
  if (date === today) classes.push('is-today');
  if (key === 'none' || key === 'upcoming') classes.push('is-idle');

  const meta = status.key === 'rest'
    ? 'Дасгал байхгүй'
    : `${status.done}/${status.total} дасгал`;

  return h('li', { class: classes.join(' ') }, [
    label ? h('div', { class: 'row-day__wd', text: label }) : null,
    h('div', { class: `row-day__dot ${DOT_CLASS[key] || ''}`.trim() }),
    h('div', { class: 'row-day__body' }, [
      h('div', { class: 'row-day__title', text: status.day ? status.day.title : '—' }),
      h('div', { class: 'row-day__meta num', text: `${formatDate(date)} · ${meta}` })
    ]),
    h('span', {
      class: `row-day__state${key === 'done' ? ' is-done' : ''}`,
      text: STATE_LABEL[key]
    })
  ]);
}

function renderWeek() {
  const root = screens.week();
  clear(root);

  const today = todayString();
  const monday = startOfWeek(today);
  const week = getWeekResults(monday);

  const trained = week.filter(({ date }) => dayStatus(date).key === 'done').length;
  const planned = week.filter(({ date }) => !dayStatus(date).day?.isRest).length;

  root.appendChild(h('header', { class: 'head' }, [
    h('div', { class: 'head__date num', text: `${formatDate(monday)} — ${formatDate(shiftDate(monday, 6))}` }),
    h('h1', { class: 'head__title', text: 'Долоо хоног' }),
    h('div', { class: 'head__sub num', text: `${planned} бэлтгэлийн өдрөөс ${trained} нь биелсэн` })
  ]));

  root.appendChild(h('ul', { class: 'list-tight' }, week.map(({ date }, index) =>
    renderDayRow(date, today, WEEKDAY_SHORT[index])
  )));
}

/* ---------------- Түүх дэлгэц ---------------- */

function renderHistory() {
  const root = screens.history();
  clear(root);

  const today = todayString();
  const days = getRecentDays(today, HISTORY_DAYS);

  let done = 0;
  let missed = 0;
  let rest = 0;
  for (const { date } of days) {
    const key = dayStatus(date).key;
    if (key === 'done') done += 1;
    else if (key === 'rest') rest += 1;
    else missed += 1;
  }

  root.appendChild(h('header', { class: 'head' }, [
    h('div', { class: 'head__date num', text: `Сүүлийн ${HISTORY_DAYS} өдөр` }),
    h('h1', { class: 'head__title', text: 'Түүх' })
  ]));

  root.appendChild(h('div', { class: 'stats' }, [
    h('div', { class: 'stat' }, [
      h('div', { class: 'stat__value num', text: String(done) }),
      h('div', { class: 'stat__label', text: 'Биелсэн' })
    ]),
    h('div', { class: 'stat' }, [
      h('div', { class: 'stat__value num', text: String(missed) }),
      h('div', { class: 'stat__label', text: 'Хийгээгүй' })
    ]),
    h('div', { class: 'stat' }, [
      h('div', { class: 'stat__value num', text: String(rest) }),
      h('div', { class: 'stat__label', text: 'Амралт' })
    ])
  ]));

  root.appendChild(h('section', { class: 'section' }, [
    h('h2', { class: 'section__title label', text: 'Өдрүүд' }),
    h('ul', { class: 'list-tight' }, days.map(({ date }) =>
      renderDayRow(date, today, WEEKDAY_SHORT[weekdayIndex(date)])
    ))
  ]));

  root.appendChild(renderDangerZone());
}

/**
 * Бүх тэмдэглэгээг устгах хэсэг. Санамсаргүй дарахаас сэргийлж хоёр алхамтай:
 * эхний дарахад "Итгэлтэй байна уу?" болж хувирна.
 */
function renderDangerZone() {
  const armed = confirmClear;

  return h('section', { class: 'section' }, [
    h('h2', { class: 'section__title label', text: 'Өгөгдөл' }),
    h('button', {
      type: 'button',
      class: `danger${armed ? ' is-armed' : ''}`,
      dataset: { action: armed ? 'clear-confirm' : 'clear-arm' },
      text: armed ? 'Итгэлтэй байна уу? Дарж устга' : 'Бүх тэмдэглэгээг устгах'
    }),
    armed
      ? h('button', {
        type: 'button',
        class: 'danger-cancel',
        dataset: { action: 'clear-cancel' },
        text: 'Болих'
      })
      : h('p', {
        class: 'hint',
        text: 'Энэ төхөөрөмж дээр хадгалсан бүх өдрийн тэмдэглэгээ устана. Буцаах боломжгүй.'
      })
  ]);
}

function handleHistoryClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const { action } = trigger.dataset;

  if (action === 'clear-arm') confirmClear = true;
  else if (action === 'clear-cancel') confirmClear = false;
  else if (action === 'clear-confirm') {
    clearAll();
    confirmClear = false;
  } else return;

  renderHistory();
}

/* ---------------- Бичих үйлдлүүд ---------------- */

function commit(date, day, sets) {
  saveDay({
    date,
    dayId: day.id,
    sets,
    done: countDone(day, sets),
    total: day.exercises.length
  });
}

function handleTodayClick(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const { action, exercise: exerciseId, index } = trigger.dataset;
  const date = todayString();
  const day = getDayForDate(date);
  if (!day || day.isRest) return;

  if (action === 'open') {
    if (openCards.has(exerciseId)) openCards.delete(exerciseId);
    else openCards.add(exerciseId);
    renderToday();
    return;
  }

  const sets = readSets(date, day);
  const marks = sets[exerciseId];
  if (!marks) return;

  if (action === 'toggle') {
    const next = !isExerciseDone(marks);
    sets[exerciseId] = marks.map(() => next);
  } else if (action === 'set') {
    const i = Number(index);
    marks[i] = !marks[i];
    // Сет дээр дархад мөр нээлттэй хэвээр байх нь зүйтэй
    openCards.add(exerciseId);
  } else {
    return;
  }

  commit(date, day, sets);
  renderToday();
}

/* ---------------- Табууд ---------------- */

const RENDERERS = {
  today: renderToday,
  week: renderWeek,
  history: renderHistory
};

export function showTab(name) {
  if (!RENDERERS[name]) return;
  activeTab = name;
  confirmClear = false; // таб солиход баталгаажуулалт тайлагдана

  for (const [key, get] of Object.entries(screens)) {
    get().hidden = key !== name;
  }

  for (const tab of document.querySelectorAll('.tab')) {
    const isActive = tab.dataset.tab === name;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }

  RENDERERS[name]();
  document.getElementById('app-main').scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0 });
}

/** Идэвхтэй дэлгэцийг дахин зурна. */
export function render() {
  RENDERERS[activeTab]();
}

/** Event binding — нэг л удаа дуудагдана. */
export function mount() {
  screens.today().addEventListener('click', handleTodayClick);
  screens.history().addEventListener('click', handleHistoryClick);

  document.getElementById('tabbar').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) showTab(tab.dataset.tab);
  });

  // Апп-ыг хэсэг хугацаанд орхиод буцаж ирэхэд шөнө дундыг давсан байж болно.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
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

// ui.js — DOM render ба event binding. Өгөгдлийг өөрөө хадгалахгүй,
// зөвхөн program.js + storage.js-ээс уншиж, буцаагаад тэдэн рүү бичнэ.

import {
  HISTORY_DAYS,
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
  getDaySets,
  getDayResult,
  getRecentDays,
  getWeekResults,
  saveDay
} from './storage.js';

/* ---------------- DOM туслахууд ---------------- */

const ICONS = {
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  moonSm: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  dot: '<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>',
  dash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>'
};

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

/* ---------------- Өнөөдөр дэлгэц ---------------- */

function renderProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = h('div', { class: 'progress__fill' });
  fill.style.width = `${pct}%`;

  return h('div', { class: `progress${done >= total && total > 0 ? ' is-done' : ''}` }, [
    h('div', { class: 'progress__meta' }, [
      h('span', { class: 'progress__count', text: `${done} / ${total} дасгал` }),
      h('span', { class: 'progress__pct', text: `${pct}%` })
    ]),
    h('div', {
      class: 'progress__track',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': String(done),
      'aria-label': 'Өнөөдрийн гүйцэтгэл'
    }, [fill])
  ]);
}

function renderExerciseCard(exercise, marks) {
  const done = isExerciseDone(marks);
  const doneSets = marks.filter(Boolean).length;
  const partial = !done && doneSets > 0;
  const open = openCards.has(exercise.id);

  const metaParts = [`${exercise.sets} сет × ${exercise.reps}`];
  if (exercise.rest) metaParts.push(`амралт ${formatRest(exercise.rest)}`);

  const classes = ['card'];
  if (done) classes.push('is-done');
  if (partial) classes.push('is-partial');
  if (open) classes.push('is-open');

  const setButtons = marks.map((on, index) =>
    h('button', {
      type: 'button',
      class: `set-btn${on ? ' is-on' : ''}`,
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': `${index + 1}-р сет`,
      dataset: { action: 'set', exercise: exercise.id, index: String(index) },
      text: String(index + 1)
    })
  );

  return h('li', { class: classes.join(' '), dataset: { exercise: exercise.id } }, [
    h('div', { class: 'card__head' }, [
      h('button', {
        type: 'button',
        class: 'check',
        'aria-pressed': done ? 'true' : 'false',
        'aria-label': `${exercise.name} — дууссан гэж тэмдэглэх`,
        dataset: { action: 'toggle', exercise: exercise.id }
      }, [h('span', { class: 'check__box', icon: ICONS.check })]),

      h('button', {
        type: 'button',
        class: 'card__body',
        'aria-expanded': open ? 'true' : 'false',
        dataset: { action: 'open', exercise: exercise.id }
      }, [
        h('div', { class: 'card__name', text: exercise.name }),
        h('div', { class: 'card__meta', text: metaParts.join(' · ') }),
        exercise.note ? h('div', { class: 'card__note', text: exercise.note }) : null
      ]),

      h('span', { class: 'card__chevron', icon: ICONS.chevron, 'aria-hidden': 'true' })
    ]),

    h('div', { class: 'sets' }, [
      h('div', { class: 'sets__label', text: `Сетүүд — ${doneSets}/${marks.length} хийсэн` }),
      h('div', { class: 'sets__row' }, setButtons)
    ])
  ]);
}

function renderRestDay(date, day) {
  return [
    h('header', { class: 'head' }, [
      h('div', { class: 'head__date', text: formatDateLong(date) }),
      h('h1', { class: 'head__title', text: day.title })
    ]),
    h('div', { class: 'pad' }, [
      h('div', { class: 'pad__icon', icon: ICONS.moon }),
      h('div', { class: 'pad__title', text: 'Өнөөдөр амралтын өдөр' }),
      h('p', { class: 'pad__text', text: 'Сэргэх нь бас бэлтгэлийн нэг хэсэг. Маргааш уулзацгаая.' })
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
    h('div', { class: 'head__date', text: formatDateLong(date) }),
    h('h1', { class: 'head__title', text: day.title }),
    renderProgress(done, total)
  ]));

  if (isComplete) {
    const result = getDayResult(date);
    root.appendChild(h('div', { class: 'banner' }, [
      h('div', { class: 'banner__icon', icon: ICONS.check }),
      h('div', {}, [
        h('div', { class: 'banner__title', text: 'Өнөөдрийн бэлтгэл дууслаа' }),
        h('div', {
          class: 'banner__text',
          text: result && result.completedAt
            ? `Дуусгасан: ${result.completedAt.slice(11)}`
            : 'Бүх дасгал тэмдэглэгдсэн.'
        })
      ])
    ]));
  }

  root.appendChild(h('section', { class: 'section' }, [
    h('h2', { class: 'section__title', text: 'Дасгалууд' }),
    h('ul', { class: 'stack' }, day.exercises.map((exercise) =>
      renderExerciseCard(exercise, sets[exercise.id])
    ))
  ]));
}

/* ---------------- Долоо хоног дэлгэц ---------------- */

const STATUS_LABEL = {
  done: 'Биелсэн',
  partial: 'Дутуу',
  rest: 'Амралт',
  none: 'Хийгээгүй',
  upcoming: 'Удахгүй'
};

function statusMark(key) {
  if (key === 'done') return h('div', { class: 'row__mark is-done', icon: ICONS.check });
  if (key === 'partial') return h('div', { class: 'row__mark is-partial', icon: ICONS.dot });
  if (key === 'rest') return h('div', { class: 'row__mark is-rest', icon: ICONS.moonSm });
  return h('div', { class: 'row__mark', icon: ICONS.dash });
}

function renderDayRow(date, today, label) {
  const status = dayStatus(date);
  const isFuture = date > today;
  const key = isFuture && status.key === 'none' ? 'upcoming' : status.key;

  const metaParts = [];
  if (status.key === 'rest') metaParts.push('Дасгал байхгүй');
  else metaParts.push(`${status.done}/${status.total} дасгал`);

  const classes = ['row'];
  if (date === today) classes.push('is-today');

  const badgeClass = key === 'done' ? ' is-done'
    : key === 'partial' ? ' is-partial'
      : key === 'rest' ? ' is-rest' : '';

  return h('li', { class: classes.join(' ') }, [
    label ? h('div', { class: 'row__day', text: label }) : null,
    statusMark(key),
    h('div', { class: 'row__body' }, [
      h('div', { class: 'row__title', text: status.day ? status.day.title : '—' }),
      h('div', { class: 'row__meta', text: `${formatDate(date)} · ${metaParts.join('')}` })
    ]),
    h('span', { class: `badge${badgeClass}`, text: STATUS_LABEL[key] })
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
    h('div', { class: 'head__date', text: `${formatDate(monday)} — ${formatDate(shiftDate(monday, 6))}` }),
    h('h1', { class: 'head__title', text: 'Долоо хоног' }),
    h('div', { class: 'head__sub', text: `${planned} бэлтгэлийн өдрөөс ${trained} нь биелсэн` })
  ]));

  root.appendChild(h('ul', { class: 'stack-sm' }, week.map(({ date }, index) =>
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
    h('div', { class: 'head__date', text: `Сүүлийн ${HISTORY_DAYS} өдөр` }),
    h('h1', { class: 'head__title', text: 'Түүх' })
  ]));

  root.appendChild(h('div', { class: 'stats' }, [
    h('div', { class: 'stat' }, [
      h('div', { class: 'stat__value', text: String(done) }),
      h('div', { class: 'stat__label', text: 'Биелсэн' })
    ]),
    h('div', { class: 'stat' }, [
      h('div', { class: 'stat__value', text: String(missed) }),
      h('div', { class: 'stat__label', text: 'Хийгээгүй' })
    ]),
    h('div', { class: 'stat' }, [
      h('div', { class: 'stat__value', text: String(rest) }),
      h('div', { class: 'stat__label', text: 'Амралт' })
    ])
  ]));

  root.appendChild(h('section', { class: 'section' }, [
    h('h2', { class: 'section__title', text: 'Өдрүүд' }),
    h('ul', { class: 'stack-sm' }, days.map(({ date }) =>
      renderDayRow(date, today, WEEKDAY_SHORT[weekdayIndex(date)])
    ))
  ]));
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
    // Сет дээр дархад карт нээлттэй хэвээр байх нь зүйтэй
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

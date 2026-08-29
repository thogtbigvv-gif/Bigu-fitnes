// views/history.js — сүүлийн 30 өдөр.
//
// Урьд нь энэ дэлгэц 30 ширхэг бүтэн мөр байсан: гүйлгэж байж л уншина,
// "энэ сард би хэр тогтвортой байв?" гэсэн ганц асуултад хариулахгүй.
//
// Одоо гол нь **чеклист** — 30 хоног хуанлийн тор болж, нэг дэлгэцэнд
// багтана. Хийсэн өдөр тэмдэглэгдэж, хийгээгүй өдөр хоосон нүд болж
// үлдэнэ; тасарсан газар нүдэнд шууд харагдана. Мөр мөрөөр нь харах
// хэрэгтэй бол "Дэлгэрэнгүй" дотор хэвээрээ байна.

import {
  HISTORY_DAYS,
  WEEKDAY_SHORT,
  formatDateLong,
  formatRange,
  percent,
  todayString,
  weekdayIndex
} from '../data.js';
import { ICONS, append, clear, h } from '../dom.js';
import { getProgramName } from '../program.js';
import { isSwapped } from '../schedule.js';
import { STATUS_LABEL, historyCalendar, historySummary } from '../stats.js';
import { dayRow } from './dayrow.js';

/** @typedef {import('../types.js').DayRow} DayRow */

/** Устгах товч баталгаажуулалт хүлээж байгаа эсэх (таб солиход тайлагдана). */
let confirmClear = false;

/** Мөр мөрөөр харуулах хэсэг задарсан эсэх (таб солиход хаагдана). */
let detailsOpen = false;

/** @param {boolean} value */
export function armClear(value) {
  confirmClear = Boolean(value);
}

/** @param {boolean} value */
export function openDetails(value) {
  detailsOpen = Boolean(value);
}

/** Дэлгэрэнгүй хэсгийг сэлгэнэ. */
export function toggleDetails() {
  detailsOpen = !detailsOpen;
}

/**
 * @param {number} value
 * @param {string} label
 */
function statTile(value, label) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'stat__value num', text: String(value) }),
    h('div', { class: 'stat__label', text: label })
  ]);
}

/** @param {{streak: number, rate: number}} summary */
function renderStreak(summary) {
  const line = summary.streak > 0
    ? `Цуваа ${summary.streak} бэлтгэл`
    : 'Цуваа тасарсан';

  return h('div', { class: 'streak' }, [
    h('div', { class: 'streak__main' }, [
      h('span', { class: 'streak__label label', text: 'Одоогийн цуваа' }),
      h('span', { class: 'streak__value num', text: line })
    ]),
    h('div', {
      class: 'streak__rate num',
      text: `${summary.rate}% гүйцэтгэл`
    })
  ]);
}

/* ---------------- Чеклист (хуанлийн тор) ---------------- */

/**
 * Нэг өдрийн нүд. Дарахад тэр өдрийн дэлгэц нээгдэнэ — жагсаалтын мөртэй
 * яг ижил үйлдэл.
 * @param {DayRow|null} cell
 * @param {string} today
 */
function renderCell(cell, today) {
  // Цонхны гадна унасан өдөр: тор эвдэрч болохгүй тул хоосон нүх үлдээнэ.
  if (!cell) return h('span', { class: 'cell cell--empty', 'aria-hidden': 'true' });

  const { date, status, key } = cell;
  const dayNumber = Number(date.slice(8, 10));
  const label = STATUS_LABEL[key] || '';

  const classes = ['cell', `is-${key}`];
  if (date === today) classes.push('is-today');

  // Дутуу өдөр: хийсэн хэсгийг нь нүдний ЁРООЛООС дүүргэж харуулна.
  // Урьд нь энд сетийн тоо бичигддэг байсан бөгөөд огнооны доор гарсан
  // хоёр дахь тоо нь бас огноо мэт уншигдаж, торыг эргэлзээтэй болгож байв.
  // Дүүргэлт нь "хэр явсныг" нэг харцаар, уншихгүйгээр хэлнэ.
  let fill = null;
  if (key === 'partial' && status.setsTotal > 0) {
    fill = h('span', { class: 'cell__fill', 'aria-hidden': 'true' });
    fill.style.height = `${Math.max(12, percent(status.setsDone, status.setsTotal))}%`;
  }

  return h('button', {
    type: 'button',
    class: classes.join(' '),
    dataset: { action: 'day', date },
    'aria-current': date === today ? 'date' : null,
    'aria-label': `${formatDateLong(date)} — ${label}${isSwapped(date) ? ', өдөр солигдсон' : ''}`
  }, [
    fill,
    h('span', { class: 'cell__day num', text: String(dayNumber) }),
    key === 'done'
      ? h('span', { class: 'cell__mark', icon: ICONS.check, 'aria-hidden': 'true' })
      : null
  ]);
}

/**
 * @param {{weeks: Array<{start: string, cells: Array<DayRow|null>}>,
 *          from: string, to: string}} calendar
 * @param {string} today
 */
function renderChecklist(calendar, today) {
  return h('section', { class: 'section' }, [
    h('div', { class: 'group__head' }, [
      h('h2', { class: 'group__title label', text: 'Чеклист' }),
      h('span', {
        class: 'group__note num',
        text: formatRange(calendar.from, calendar.to)
      })
    ]),

    h('div', { class: 'grid' }, [
      // Гарагийн толгой — багана бүр аль гараг болохыг нэг л удаа хэлнэ.
      h('div', { class: 'grid__head', 'aria-hidden': 'true' },
        WEEKDAY_SHORT.map((name) => h('span', { class: 'grid__wd label', text: name }))),

      ...calendar.weeks.map((week) =>
        h('div', { class: 'grid__row' }, week.cells.map((cell) => renderCell(cell, today))))
    ]),

    h('ul', { class: 'legend' }, [
      h('li', { class: 'legend__item' }, [
        h('span', { class: 'cell cell--chip is-done', 'aria-hidden': 'true' }, [
          h('span', { class: 'cell__mark', icon: ICONS.check })
        ]),
        h('span', { class: 'legend__text', text: 'Биелсэн' })
      ]),
      h('li', { class: 'legend__item' }, [
        h('span', { class: 'cell cell--chip is-partial', 'aria-hidden': 'true' }, [
          h('span', { class: 'cell__fill' })
        ]),
        h('span', { class: 'legend__text', text: 'Дутуу' })
      ]),
      h('li', { class: 'legend__item' }, [
        h('span', { class: 'cell cell--chip is-none', 'aria-hidden': 'true' }),
        h('span', { class: 'legend__text', text: 'Хийгээгүй' })
      ]),
      h('li', { class: 'legend__item' }, [
        h('span', { class: 'cell cell--chip is-rest', 'aria-hidden': 'true' }, [
          h('span', { class: 'cell__dash' })
        ]),
        h('span', { class: 'legend__text', text: 'Амралт' })
      ])
    ])
  ]);
}

/* ---------------- Дэлгэрэнгүй (мөр мөрөөр) ---------------- */

/**
 * @param {{label: string, note: string, rows: DayRow[]}} group
 * @param {string} today
 */
function renderWeekGroup(group, today) {
  return h('section', { class: 'group' }, [
    h('div', { class: 'group__head' }, [
      h('h2', { class: 'group__title label', text: group.label }),
      h('span', { class: 'group__note num', text: group.note })
    ]),
    h('ul', { class: 'list-tight' }, group.rows.map((row) =>
      dayRow(row, today, WEEKDAY_SHORT[weekdayIndex(row.date)])
    ))
  ]);
}

/**
 * Мөр мөрөөр харуулах хэсэг. Анхнаасаа хаалттай — чеклист нь өдөр тутмын
 * асуултад хариулчихдаг, дэлгэрэнгүй нь зөвхөн "тэр өдөр яг юу болсон бэ"
 * гэж асуухад л хэрэгтэй.
 * @param {ReturnType<typeof historySummary>} summary
 * @param {string} today
 */
function renderDetails(summary, today) {
  return h('section', { class: 'section' }, [
    h('button', {
      type: 'button',
      class: `disclosure${detailsOpen ? ' is-open' : ''}`,
      'aria-expanded': detailsOpen ? 'true' : 'false',
      'aria-controls': 'history-details',
      dataset: { action: 'details' }
    }, [
      h('span', { class: 'disclosure__icon', icon: ICONS.list, 'aria-hidden': 'true' }),
      h('span', { class: 'disclosure__text', text: 'Дэлгэрэнгүй' }),
      h('span', { class: 'disclosure__chevron', icon: ICONS.chevron, 'aria-hidden': 'true' })
    ]),

    detailsOpen
      ? h('div', { class: 'disclosure__panel', id: 'history-details' },
        summary.weeks.map((group) => renderWeekGroup(group, today)))
      : null
  ]);
}

/* ---------------- Устгах ---------------- */

/**
 * Бүх тэмдэглэгээг устгах хэсэг. Санамсаргүй дарахаас сэргийлж хоёр алхамтай:
 * эхний дарахад "Итгэлтэй байна уу?" болж хувирна.
 *
 * Тэмдэглэгээ огт байхгүй бол устгах юу ч байхгүй — товчийг харуулахгүй.
 * @param {boolean} hasData
 */
function renderDangerZone(hasData) {
  if (!hasData) return null;
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

/** @param {HTMLElement} root */
export function renderHistory(root) {
  clear(root);

  const today = todayString();
  const summary = historySummary(today, HISTORY_DAYS);
  const calendar = historyCalendar(today, HISTORY_DAYS);
  const hasData = summary.done + summary.partial > 0;

  append(root, [
    h('header', { class: 'head' }, [
      h('div', { class: 'head__eyebrow label', text: getProgramName() }),
      h('div', { class: 'head__date num', text: `Сүүлийн ${summary.span} өдөр` }),
      h('h1', { class: 'head__title', text: 'Түүх' })
    ]),

    renderStreak(summary),

    h('div', { class: 'stats' }, [
      statTile(summary.done, 'Биелсэн'),
      statTile(summary.partial, 'Дутуу'),
      statTile(summary.missed, 'Хийгээгүй'),
      statTile(summary.rest, 'Амралт')
    ]),

    renderChecklist(calendar, today),
    renderDetails(summary, today),
    renderDangerZone(hasData)
  ]);
}

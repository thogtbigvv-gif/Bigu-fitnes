// views/history.js — сүүлийн 30 өдөр.
//
// Урьд нь 30 ширхэг жигд мөр нэг урт жагсаалт байсан бөгөөд "дутуу" хийсэн
// өдрийг "хийгээгүй" рүү оруулж тоолдог байв. Одоо:
//   - өдрүүд долоо хоногоор бүлэглэгдэнэ,
//   - дутуу нь өөрийн гэсэн тоотой,
//   - дээр нь одоогийн цуваа ба гүйцэтгэлийн хувь гарна.

import { HISTORY_DAYS, WEEKDAY_SHORT, todayString, weekdayIndex } from '../data.js';
import { append, clear, h } from '../dom.js';
import { getProgramName } from '../program.js';
import { historySummary } from '../stats.js';
import { dayRow } from './dayrow.js';

/** @typedef {import('../types.js').DayRow} DayRow */

/** Устгах товч баталгаажуулалт хүлээж байгаа эсэх (таб солиход тайлагдана). */
let confirmClear = false;

/** @param {boolean} value */
export function armClear(value) {
  confirmClear = Boolean(value);
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
    ])
  ]);

  for (const group of summary.weeks) {
    root.appendChild(renderWeekGroup(group, today));
  }

  append(root, [renderDangerZone(hasData)]);
}

// views/week.js — долоо хоногийн тойм.
//
// Хураангуй нь урьд зөвхөн "биелсэн" тоог хэлдэг байсан тул дутуу хийсэн
// өдрүүд бүтэн алга болдог байв. Одоо биелсэн / дутуу / сет гурвуулаа харагдана.

import {
  WEEKDAY_SHORT,
  formatRange,
  percent,
  startOfWeek,
  todayString
} from '../data.js';
import { append, clear, h } from '../dom.js';
import { getProgramName } from '../program.js';
import { weekSummary } from '../stats.js';
import { dayRow } from './dayrow.js';

/**
 * Сетийн гүйцэтгэлийн хэмжүүр. Долоо хоногт нэг ч сет төлөвлөгдөөгүй
 * (бүгд амралт) бол огт харагдахгүй — 0/0 гэсэн хэмжүүр утгагүй.
 * @param {{setsDone: number, setsTotal: number}} week
 */
function renderMeter(week) {
  if (week.setsTotal <= 0) return null;

  return h('div', { class: 'meter' }, [
    h('div', { class: 'meter__row' }, [
      h('span', { class: 'meter__label label', text: 'Сетийн гүйцэтгэл' }),
      h('span', {
        class: 'meter__value num',
        text: `${week.setsDone}/${week.setsTotal}`
      })
    ]),
    h('div', {
      class: 'meter__track',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(week.setsTotal),
      'aria-valuenow': String(week.setsDone),
      'aria-label': 'Сетийн гүйцэтгэл'
    }, [
      h('div', {
        class: 'meter__fill',
        style: { width: `${percent(week.setsDone, week.setsTotal)}%` }
      })
    ])
  ]);
}

/** @param {HTMLElement} root */
export function renderWeek(root) {
  clear(root);

  const today = todayString();
  const monday = startOfWeek(today);
  const week = weekSummary(monday, today);

  const parts = [`${week.planned} бэлтгэлээс ${week.trained} биелсэн`];
  if (week.partial) parts.push(`${week.partial} дутуу`);

  append(root, [
    h('header', { class: 'head' }, [
      h('div', { class: 'head__eyebrow label', text: getProgramName() }),
      h('div', { class: 'head__date num', text: formatRange(week.from, week.to) }),
      h('h1', { class: 'head__title', text: 'Долоо хоног' }),
      h('div', { class: 'head__sub num', text: parts.join(' · ') })
    ]),

    renderMeter(week),

    h('section', { class: 'section' }, [
      h('h2', { class: 'section__title label', text: 'Өдрүүд' }),
      h('ul', { class: 'list-tight' }, week.days.map((row, index) =>
        dayRow(row, today, WEEKDAY_SHORT[index])
      ))
    ])
  ]);
}

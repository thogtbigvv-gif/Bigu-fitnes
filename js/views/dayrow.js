// views/dayrow.js — долоо хоног ба түүх хоёрын хуваалцдаг өдрийн мөр.
//
// Урьд нь энэ мөр хоёр файлд бараг ижилхэн хоёр удаа бичигдсэн байв.
// Одоо нэг л газар: төлөвийн үг, тэмдэг, дарах үйлдэл бүгд ижил.

import { formatDate } from '../data.js';
import { ICONS, h } from '../dom.js';
import { STATUS_DOT, STATUS_LABEL, describeStatus } from '../stats.js';

/** @typedef {import('../types.js').DayRow} DayRow */

/**
 * @param {DayRow} row
 * @param {string} today
 * @param {string} [weekday] зүүн талын гарагийн товч нэр ("Да", "Мя" ...)
 * @returns {HTMLElement}
 */
export function dayRow(row, today, weekday) {
  const { date, status, key } = row;
  const label = STATUS_LABEL[key] || '';

  const classes = ['row-day'];
  if (date === today) classes.push('is-today');
  if (key === 'none' || key === 'upcoming') classes.push('is-idle');
  if (key === 'rest') classes.push('is-quiet'); // амралт бол цаана нь байх хэмнэл

  const describe = describeStatus(status);
  const meta = describe ? `${formatDate(date)} · ${describe}` : formatDate(date);

  // Дэлгэрэнгүйг нь дуут уншигчид ч хүргэнэ — урьд нь зөвхөн огноо ба төлөв
  // уншигддаг байсан тул "3/7 дасгал" гэсэн мэдээлэл сонсогдохгүй байв.
  const spoken = describe
    ? `${formatDate(date)} — ${label}, ${describe}`
    : `${formatDate(date)} — ${label}`;

  return h('li', {}, [
    h('button', {
      type: 'button',
      class: classes.join(' '),
      dataset: { action: 'day', date },
      'aria-current': date === today ? 'date' : null,
      'aria-label': spoken
    }, [
      weekday ? h('span', { class: 'row-day__wd', text: weekday }) : null,
      h('span', { class: `row-day__dot ${STATUS_DOT[key] || ''}`.trim(), 'aria-hidden': 'true' }),
      h('span', { class: 'row-day__body' }, [
        h('span', { class: 'row-day__title', text: status.day ? status.day.title : '—' }),
        h('span', { class: 'row-day__meta num', text: meta })
      ]),
      h('span', {
        class: `row-day__state${key === 'done' ? ' is-done' : ''}`,
        text: label
      }),
      h('span', { class: 'row-day__go', icon: ICONS.forward, 'aria-hidden': 'true' })
    ])
  ]);
}

// Огнооны хэрэгслүүд — аппын бүх тооцоо эдгээрээс эхэлдэг тул хамгийн эмзэг хэсэг.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  daysBetween,
  formatClock,
  formatDate,
  formatRest,
  isDateString,
  isTimestamp,
  msUntilMidnight,
  percent,
  shiftDate,
  startOfWeek,
  timeOfTimestamp,
  toDateString,
  weekdayIndex
} from '../js/data.js';

import { muteWarnings } from './helpers.js';

test('isDateString нь хэлбэр ба бодит өдрийг хоёуланг шалгана', () => {
  assert.equal(isDateString('2026-08-26'), true);
  assert.equal(isDateString('2024-02-29'), true, 'үсрэлтийн жил');
  assert.equal(isDateString('2026-02-30'), false, 'байхгүй өдөр');
  assert.equal(isDateString('2026-13-01'), false);
  assert.equal(isDateString('2026-8-26'), false, 'padding заавал');
  assert.equal(isDateString(''), false);
  assert.equal(isDateString(null), false);
  assert.equal(isDateString(20260826), false);
});

test('parseDateString танихгүй утга дээр унахгүй, өнөөдөр рүү найдвартай уна', () => {
  // Урьд нь энд NaN үүсээд "NaN-aN-aN" гэсэн огноо хадгалалт руу орох эрсдэлтэй байв.
  muteWarnings(() => {
    const result = shiftDate('гэмтсэн', 0);
    assert.equal(isDateString(result), true);
  });
});

test('shiftDate сар, жилийн зааг дээр зөв ажиллана', () => {
  assert.equal(shiftDate('2026-08-31', 1), '2026-09-01');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftDate('2026-08-26', 0), '2026-08-26');
});

test('weekdayIndex-д Даваа = 0, Ням = 6', () => {
  assert.equal(weekdayIndex('2026-08-24'), 0); // Даваа
  assert.equal(weekdayIndex('2026-08-26'), 2); // Лхагва
  assert.equal(weekdayIndex('2026-08-30'), 6); // Ням
});

test('startOfWeek долоо хоногийн Даваа руу буцаана', () => {
  assert.equal(startOfWeek('2026-08-26'), '2026-08-24');
  assert.equal(startOfWeek('2026-08-24'), '2026-08-24');
  assert.equal(startOfWeek('2026-08-30'), '2026-08-24', 'Ням нь өмнөх Даваад харьяалагдана');
});

test('daysBetween нь DST шилжилтийг давсан ч бүхэл өдөр буцаана', () => {
  assert.equal(daysBetween('2026-08-26', '2026-08-19'), 7);
  assert.equal(daysBetween('2026-08-19', '2026-08-26'), -7);
  // Хойд хагас бөмбөрцгийн DST шилжилтийн долоо хоног.
  assert.equal(daysBetween('2026-03-15', '2026-03-01'), 14);
  assert.equal(daysBetween('2026-11-08', '2026-11-01'), 7);
});

test('toDateString нь ОРОН НУТГИЙН цагийг барина (UTC руу гулсахгүй)', () => {
  // 23:30 цагт UTC-д маргааш болсон байж болно — орон нутгийн өдөр хэвээр байх ёстой.
  const late = new Date(2026, 7, 26, 23, 30, 0);
  assert.equal(toDateString(late), '2026-08-26');
  const early = new Date(2026, 7, 26, 0, 15, 0);
  assert.equal(toDateString(early), '2026-08-26');
});

test('formatClock ба formatRest хүн уншихад ойлгомжтой', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9), '0:09');
  assert.equal(formatClock(90), '1:30');
  assert.equal(formatClock(-5), '0:00', 'сөрөг утга 0 болно');
  assert.equal(formatClock(Number.NaN), '0:00');

  assert.equal(formatRest(0), '');
  assert.equal(formatRest(90), '1м 30с');
  assert.equal(formatRest(45), '45с');
  assert.equal(formatRest(120), '2м');
});

test('percent нь 0-д хуваахаас хамгаалж, 0..100 дотор барина', () => {
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(5, 0), 0);
  assert.equal(percent(3, 7), 43);
  assert.equal(percent(7, 7), 100);
  assert.equal(percent(9, 7), 100, 'хэтэрсэн утга 100-аар таслагдана');
  assert.equal(percent(-1, 7), 0);
});

test('formatDate монгол хэлбэрээр гарна', () => {
  assert.equal(formatDate('2026-08-26'), '8 сарын 26');
  assert.equal(formatDate('2026-01-05'), '1 сарын 5');
});

test('timestamp хэрэгслүүд гажсан утгыг хүлээж авахгүй', () => {
  assert.equal(isTimestamp('2026-08-26 19:40'), true);
  assert.equal(isTimestamp('2026-08-26T19:40'), true);
  assert.equal(isTimestamp('2026-08-26'), false);
  assert.equal(isTimestamp(null), false);

  assert.equal(timeOfTimestamp('2026-08-26 19:40'), '19:40');
  assert.equal(timeOfTimestamp('гэмтсэн'), '');
  assert.equal(timeOfTimestamp(null), '');
});

test('msUntilMidnight үргэлж эерэг бөгөөд нэг хоногоос хэтрэхгүй', () => {
  const ms = msUntilMidnight(new Date(2026, 7, 26, 23, 59, 30));
  assert.ok(ms > 0 && ms <= 24 * 3600 * 1000);
  const early = msUntilMidnight(new Date(2026, 7, 26, 0, 0, 1));
  assert.ok(early > 23 * 3600 * 1000);
});

// program.json бол хүн гараар засдаг файл. normalizeProgram нь ЮУ ирснээс
// үл хамааран ажиллах чадвартай Program буцаах ёстой.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeProgram } from '../js/program.js';
import { muteWarnings, sampleProgramSource } from './helpers.js';

test('бүрэн бүтэн хөтөлбөр хэвээрээ гарна', () => {
  const program = normalizeProgram(sampleProgramSource());
  assert.equal(program.days.length, 7);
  assert.equal(program.name, 'Тестийн хөтөлбөр');
  assert.equal(program.days[0].isRest, false);
  assert.equal(program.days[2].isRest, true, 'd3 нь restDays дотор');
  assert.equal(program.days[6].isRest, true);
});

test('дасгалгүй өдөр автоматаар амралт болно', () => {
  const program = normalizeProgram({
    days: [{ id: 'd1', title: 'Хоосон', exercises: [] }]
  });
  assert.equal(program.days[0].isRest, true);
});

test('давхардсан ДАСГАЛЫН id ялгагдана', () => {
  // Энэ бол хамгийн аюултай алдаа: хоёр дасгал нэг сетийн мөрийг хуваалцаж,
  // нэгийг нь тэмдэглэхэд нөгөө нь дүүрч харагдана.
  let program;
  muteWarnings(() => {
    program = normalizeProgram({
      days: [{
        id: 'd1',
        title: 'Өдөр',
        exercises: [
          { id: 'e1', name: 'Эхний', sets: 3 },
          { id: 'e1', name: 'Хоёр дахь', sets: 4 }
        ]
      }]
    });
  });

  const ids = program.days[0].exercises.map((e) => e.id);
  assert.equal(new Set(ids).size, 2, 'id-ууд давхардаагүй байх ёстой');
  assert.equal(ids[0], 'e1');
  assert.equal(ids[1], 'e1-2');
});

test('давхардсан ӨДРИЙН id ялгагдана', () => {
  let program;
  muteWarnings(() => {
    program = normalizeProgram({
      days: [
        { id: 'd1', title: 'A', exercises: [{ id: 'x', name: 'X', sets: 1 }] },
        { id: 'd1', title: 'B', exercises: [{ id: 'y', name: 'Y', sets: 1 }] }
      ]
    });
  });
  assert.deepEqual(program.days.map((d) => d.id), ['d1', 'd1-2']);
});

test('дутуу талбарууд нөхөгдөнө', () => {
  const program = normalizeProgram({
    days: [{ exercises: [{}] }]
  });
  const day = program.days[0];
  assert.equal(day.id, 'd1');
  assert.equal(day.title, 'Гарчиггүй өдөр');

  const exercise = day.exercises[0];
  assert.equal(exercise.id, 'e1');
  assert.equal(exercise.name, 'Нэргүй дасгал');
  assert.equal(exercise.sets, 1);
  assert.equal(exercise.reps, '');
  assert.equal(exercise.rest, 0);
  assert.equal(exercise.note, '');
});

test('утгагүй сет / амралтын тоо хязгаарт орно', () => {
  const program = normalizeProgram({
    days: [{
      id: 'd1',
      exercises: [
        { id: 'a', sets: 99999, rest: -50 },
        { id: 'b', sets: 0, rest: 999999 },
        { id: 'c', sets: 'гурав', rest: 'удаан' }
      ]
    }]
  });
  const [a, b, c] = program.days[0].exercises;
  assert.equal(a.sets, 20, 'дээд хязгаар — дэлгэцийг хэдэн мянган товчоор дүүргэхгүй');
  assert.equal(a.rest, 0);
  assert.equal(b.sets, 1, 'доод хязгаар');
  assert.equal(b.rest, 3600);
  assert.equal(c.sets, 1);
  assert.equal(c.rest, 0);
});

test('огт танихгүй өгөгдөл ирсэн ч Program бүтэц буцаана', () => {
  for (const input of [null, undefined, 42, 'мөр', [], { days: 'биш массив' }]) {
    const program = normalizeProgram(input);
    assert.equal(Array.isArray(program.days), true);
    assert.equal(program.days.length, 0);
    assert.equal(typeof program.name, 'string');
  }
});

test('reps нь тоо байсан ч мөр болно', () => {
  const program = normalizeProgram({
    days: [{ id: 'd1', exercises: [{ id: 'a', reps: 12 }] }]
  });
  assert.equal(program.days[0].exercises[0].reps, '12');
});

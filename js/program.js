// program.js — data/program.json-ыг ачаалж, огноо -> өдөр холбоосыг тодорхойлно.
// Дасгалын нэр, сет, давталт КОД ДОТОР ХЭЗЭЭ Ч бичигдэхгүй — бүгд JSON-оос ирнэ.

import { PROGRAM_URL, weekdayIndex } from './data.js';

let program = null;

function normalizeExercise(raw, index) {
  return {
    id: String(raw.id || `e${index + 1}`),
    name: String(raw.name || 'Нэргүй дасгал'),
    sets: Math.max(1, Number(raw.sets) || 1),
    reps: raw.reps == null ? '' : String(raw.reps),
    rest: Number(raw.rest) || 0,
    note: raw.note == null ? '' : String(raw.note)
  };
}

function normalizeProgram(raw) {
  const restDays = Array.isArray(raw.restDays) ? raw.restDays.map(String) : [];
  const days = (Array.isArray(raw.days) ? raw.days : []).map((day, index) => {
    const id = String(day.id || `d${index + 1}`);
    const exercises = (Array.isArray(day.exercises) ? day.exercises : []).map(normalizeExercise);
    return {
      id,
      title: String(day.title || 'Гарчиггүй өдөр'),
      exercises,
      isRest: restDays.includes(id) || exercises.length === 0
    };
  });

  return {
    version: Number(raw.version) || 1,
    name: String(raw.name || 'Хөтөлбөр'),
    days,
    restDays
  };
}

/** program.json-ыг ачаална. Алдаа гарвал throw хийнэ — main.js барьж, дэлгэц дээр харуулна. */
export async function loadProgram() {
  const response = await fetch(PROGRAM_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`program.json ачаалагдсангүй (${response.status})`);
  }
  const raw = await response.json();
  program = normalizeProgram(raw);
  if (program.days.length === 0) {
    throw new Error('program.json дотор нэг ч өдөр алга байна');
  }
  return program;
}

export function getProgram() {
  return program;
}

export function getDays() {
  return program ? program.days : [];
}

export function getDayById(dayId) {
  return getDays().find((day) => day.id === dayId) || null;
}

/**
 * Огноо -> өдрийн id. Гарагийн дугаараар шууд холбоно (орон нутгийн цагаар):
 *   Даваа = d1, Мягмар = d2, Лхагва = d3, Пүрэв = d4,
 *   Баасан = d5, Бямба = d6, Ням = d7.
 * Хэрэв тухайн "dN" id хөтөлбөрт байхгүй бол жагсаалтын дараалалд шилжинэ.
 */
export function getDayIdForDate(dateStr) {
  const days = getDays();
  if (days.length === 0) return null;

  const index = weekdayIndex(dateStr); // 0 = Даваа ... 6 = Ням
  const byId = getDayById(`d${index + 1}`);
  if (byId) return byId.id;

  return days[index % days.length].id;
}

export function getDayForDate(dateStr) {
  const id = getDayIdForDate(dateStr);
  return id ? getDayById(id) : null;
}

export function isRestDay(dayId) {
  const day = getDayById(dayId);
  return day ? day.isRest : false;
}

/** Өдөрт хэдэн дасгал байгаа (=нийт тоо). */
export function exerciseCount(dayId) {
  const day = getDayById(dayId);
  return day ? day.exercises.length : 0;
}

/** Хөтөлбөрийн нэр. Толгой хэсэгт таних тэмдэг болж гарна. */
export function getProgramName() {
  return program ? program.name : '';
}


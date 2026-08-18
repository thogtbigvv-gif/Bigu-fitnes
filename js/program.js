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
 * Огноо -> өдрийн id.
 * Даваа = days[0], Ням = days[6]. Хөтөлбөрт 7-оос цөөн өдөр байвал эргэлдэнэ.
 */
export function getDayIdForDate(dateStr) {
  const days = getDays();
  if (days.length === 0) return null;
  return days[weekdayIndex(dateStr) % days.length].id;
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

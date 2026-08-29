// views/day.js — нэг өдрийн дэлгэц.
//
// Урьд нь энэ дэлгэц ЗӨВХӨН өнөөдрийг зурдаг байсан. Тэмдэглэхээ мартвал
// тэр өдөр үүрд хоосон үлддэг байв. Одоо ижил зураглал ЯМАР Ч огноог зурна:
//   - өнгөрсөн өдөр  -> засварлаж болно (мартсанаа нөхөж тэмдэглэнэ)
//   - өнөөдөр        -> хэвийн ажиллагаа + амралтын тоолуур
//   - ирээдүй        -> зөвхөн харна, урьдчилж тэмдэглэхгүй

import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  formatClock,
  formatDate,
  formatDateLong,
  formatRest,
  percent,
  shiftDate,
  timeOfTimestamp,
  weekdayIndex
} from '../data.js';
import { ICONS, append, clear, h } from '../dom.js';
import { getProgramName } from '../program.js';
import { dayForDate, swapOptions, swapPartner } from '../schedule.js';
import { getDayResult } from '../storage.js';
import {
  countDone,
  countSets,
  dayStatus,
  isExerciseDone,
  nextTrainingDay,
  readSets
} from '../stats.js';
import * as timer from '../timer.js';

/** @typedef {import('../types.js').Day} Day */
/** @typedef {import('../types.js').Exercise} Exercise */

// progress bar-ыг хаанаас нь гүйлгэхийг мэдэхийн тулд сүүлийн хувийг сануулна.
let lastPct = 0;

/** Хүлээгдэж байгаа хөдөлгөөний хүсэлт — давхарлахаас сэргийлнэ. */
/** @type {number|null} */
let progressFrame = null;

/**
 * Дэлгэц ДӨНГӨЖ нээгдсэн үү. Сет тэмдэглэх бүрд дэлгэц бүхэлдээ дахин
 * баригддаг тул жагсаалтын гарч ирэх хөдөлгөөнийг тэр болгонд тоглуулж
 * болохгүй — зөвхөн өдөр/таб солиход нэг удаа.
 */
let fresh = false;

/** Дараагийн зурагдалт дээр жагсаалтын хөдөлгөөнийг нэг удаа зөвшөөрнө. */
export function markFresh() {
  fresh = true;
}

/** Дэлгэц солигдоход progress дэмий гүйхээс сэргийлж тэглэнэ. */
export function resetProgress() {
  lastPct = 0;
  if (progressFrame !== null) {
    cancelAnimationFrame(progressFrame);
    progressFrame = null;
  }
}

/* ---------------- Толгой хэсэг ---------------- */

/**
 * @param {string} date
 * @param {string} today
 */
function renderDayBar(date, today) {
  const previous = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const canForward = next <= today;

  return h('div', { class: 'daybar' }, [
    h('button', {
      type: 'button',
      class: 'daybar__step',
      'aria-label': 'Өмнөх өдөр',
      dataset: { action: 'step', date: previous },
      icon: ICONS.back
    }),
    h('button', {
      type: 'button',
      class: 'daybar__today',
      dataset: { action: 'back-today' },
      text: 'Өнөөдөр рүү буцах'
    }),
    h('button', {
      type: 'button',
      class: 'daybar__step',
      'aria-label': 'Дараагийн өдөр',
      disabled: !canForward,
      dataset: canForward ? { action: 'step', date: next } : {},
      icon: ICONS.forward
    })
  ]);
}

/**
 * @param {number} done
 * @param {number} total
 * @param {number} setsDone
 * @param {number} setsTotal
 */
function renderProgress(done, total, setsDone, setsTotal) {
  const pct = percent(done, total);
  const fill = h('div', { class: 'progress__fill' });

  // Шинээр үүсгэсэн элемент дээр transition ажиллахгүй тул эхлээд
  // өмнөх хувиар зурж, дараагийн кадрт шинэ хувь руу гүйлгэнэ.
  fill.style.width = `${lastPct}%`;
  if (progressFrame !== null) cancelAnimationFrame(progressFrame);
  progressFrame = requestAnimationFrame(() => {
    progressFrame = null;
    // Элемент нь хүртэл дэлгэцэнд байгаа эсэхийг шалгана — хурдан дараалсан
    // дахин зурагдалт дээр аль хэдийн хаягдсан зангилаа руу бичихгүй.
    if (fill.isConnected) fill.style.width = `${pct}%`;
  });
  lastPct = pct;

  return h('div', { class: 'progress' }, [
    h('div', { class: 'progress__meta' }, [
      h('span', { class: 'progress__count num', text: `${done}/${total} дасгал` }),
      h('span', { class: 'progress__sets num', text: `${setsDone}/${setsTotal} сет` })
    ]),
    h('div', {
      class: 'progress__track bleed',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': String(done),
      'aria-valuetext': `${total} дасгалаас ${done} биелсэн`,
      'aria-label': 'Гүйцэтгэл'
    }, [fill])
  ]);
}

/**
 * @param {string} date
 * @param {Day} day
 * @param {HTMLElement|null} extra
 */
function renderHead(date, day, extra) {
  return h('header', { class: 'head' }, [
    h('div', { class: 'head__eyebrow label', text: getProgramName() }),
    h('div', { class: 'head__date num', text: formatDateLong(date) }),
    h('h1', { class: 'head__title', text: day.title }),
    extra
  ]);
}

/* ---------------- Өдөр солих ----------------
   Ажлаас ядраад маргаашийн бэлтгэлээ хийж чадахгүй бол түүнийгээ амралтын
   өдөр рүүгээ зөөнө. Хоёр өдөр ХАРИЛЦАН солигдоно: бэлтгэл алга болохгүй,
   хоосон үлдсэн өдөр "хийгээгүй" болж цувааг ч таслахгүй. */

/** Тухайн өдөр тэмдэглэгээтэй юу (солихыг хориглох цорын ганц шалтгаан). */
function hasMarks(date) {
  return dayStatus(date).setsDone > 0;
}

/**
 * Нэг сонголтын мөр.
 * @param {import('../types.js').SwapOption} option
 */
function renderSwapOption(option) {
  const { date, day, blocked } = option;
  const title = day ? day.title : '—';

  let when = formatDate(date);
  if (option.isToday) when = `${when} · өнөөдөр`;
  else if (option.isPast) when = `${when} · өнгөрсөн`;
  if (blocked) when = `${when} · тэмдэглэгээтэй`;

  return h('li', {}, [
    h('button', {
      type: 'button',
      class: `swapopt${day && day.isRest ? ' is-rest' : ''}`,
      disabled: blocked,
      dataset: blocked ? {} : { action: 'swap-pick', date },
      'aria-label': `${formatDateLong(date)} — ${title}`
    }, [
      h('span', { class: 'swapopt__wd label', text: WEEKDAY_SHORT[weekdayIndex(date)] }),
      h('span', { class: 'swapopt__body' }, [
        h('span', { class: 'swapopt__title', text: title }),
        h('span', { class: 'swapopt__meta num', text: when })
      ])
    ])
  ]);
}

/**
 * Өдөр солих хэсэг. Тэмдэглэгээтэй өдрийг солихгүй — хийчихсэн сетүүд шинэ
 * төлөвлөгөөнд таарахгүй болж, чимээгүй устах эрсдэлтэй.
 * @param {string} date
 * @param {Day} day
 * @param {{swapOpen: boolean}} ctx
 * @returns {HTMLElement|null}
 */
function renderSwap(date, day, ctx) {
  const partner = swapPartner(date);
  const marked = hasMarks(date);

  // Солигдсоныг мэдэгдэх зурвас — хаанаас ирснийг нь тодорхой хэлнэ.
  const banner = partner
    ? h('div', { class: 'swapped' }, [
      h('span', { class: 'swapped__icon', icon: ICONS.swap, 'aria-hidden': 'true' }),
      h('span', {
        class: 'swapped__text',
        text: `${WEEKDAY_NAMES[weekdayIndex(partner)]} гарагийн бэлтгэл энд шилжсэн`
      }),
      marked
        ? null
        : h('button', {
          type: 'button',
          class: 'swapped__undo',
          dataset: { action: 'swap-undo' },
          text: 'Буцаах'
        })
    ])
    : null;

  // Ирээдүйн өдрийг солих нь бүрэн утгатай (маргаашийнхаа төлөвлөгөөг
  // өнөөдөр зөөх), гэхдээ тэмдэглэгээтэй өдрийг хөндөхгүй: хийчихсэн сетүүд
  // шинэ төлөвлөгөөнд таарахгүй болж чимээгүй устана.
  //
  // Товч зүгээр алга болвол "яагаад байхгүй байна?" гэсэн эргэлзээ үлдэнэ —
  // тиймээс шалтгааныг нь хэлнэ.
  if (marked) {
    // Аппын бусад тайлбар мөртэй ижил хэлбэрээр (`note`) гарна — задгай
    // текст нь дэлгэцийн хэмнэлээс унаж, хаана ч харьяалагдахгүй харагддаг.
    return h('section', { class: 'swap' }, [
      banner,
      h('div', {
        class: 'note',
        text: 'Тэмдэглэгээтэй өдрийг зөөхгүй. Зөөх бол эхлээд тэмдэглэгээгээ ав.'
      })
    ]);
  }

  const label = day.isRest
    ? 'Энэ өдөр бэлтгэл хийх'
    : 'Энэ бэлтгэлийг өөр өдөр рүү зөөх';

  const toggle = h('button', {
    type: 'button',
    class: `disclosure${ctx.swapOpen ? ' is-open' : ''}`,
    'aria-expanded': ctx.swapOpen ? 'true' : 'false',
    'aria-controls': 'swap-list',
    dataset: { action: 'swap-open' }
  }, [
    h('span', { class: 'disclosure__icon', icon: ICONS.swap, 'aria-hidden': 'true' }),
    h('span', { class: 'disclosure__text', text: label }),
    h('span', { class: 'disclosure__chevron', icon: ICONS.chevron, 'aria-hidden': 'true' })
  ]);

  const options = ctx.swapOpen ? swapOptions(date, hasMarks) : [];

  return h('section', { class: 'swap' }, [
    banner,
    toggle,
    ctx.swapOpen
      ? h('div', { class: 'disclosure__panel', id: 'swap-list' }, [
        h('p', {
          class: 'hint',
          text: 'Сонгосон өдөртэйгээ бэлтгэлээ солино. Хоёр өдөр байраа солих тул '
            + 'нэг ч бэлтгэл алдагдахгүй.'
        }),
        h('ul', { class: 'list-tight' }, options.map(renderSwapOption))
      ])
      : null
  ]);
}

/* ---------------- Амралтын өдөр ---------------- */

/**
 * @param {HTMLElement} root
 * @param {string} date
 * @param {Day} day
 * @param {boolean} isToday
 * @param {{swapOpen: boolean}} ctx
 */
function renderRest(root, date, day, isToday, ctx) {
  const next = nextTrainingDay(date);

  append(root, [
    renderHead(date, day, null),
    // Амралтын өдөр бол "нөхөж хийх" хамгийн түгээмэл өдөр — солих хэсэг
    // яг энд хэрэгтэй. Ирээдүйн өдөр ч мөн адил: "маргааш ядрах нь тодорхой"
    // гэдэг яг тэр үед мэдэгддэг.
    renderSwap(date, day, ctx),
    // Урьд нь амралтын өдөр нь задгай текст байсан тул дэлгэц хагас хоосон,
    // "энд юу ч алга" гэсэн мэдрэмж үлдээдэг байв. Одоо аппын бусад хэсэгтэй
    // ижил КАРТ: сарны тэмдэг, том гарчиг, доор нь жижиг зөвлөмж.
    h('section', { class: 'rest' }, [
      h('div', { class: 'rest__icon', icon: ICONS.moon, 'aria-hidden': 'true' }),
      h('div', {
        class: 'rest__title',
        text: isToday ? 'Өнөөдөр ачаалал алга' : 'Ачаалалгүй өдөр'
      }),
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
  ]);
}

/* ---------------- Амралтын тоолуур ---------------- */

/** @param {Exercise} exercise */
function renderTimer(exercise) {
  const shot = timer.snapshot();
  if (!shot || shot.exerciseId !== exercise.id) return null;

  const fill = h('div', { class: 'timer__fill' });
  fill.style.width = `${shot.seconds > 0 ? percent(shot.remaining, shot.seconds) : 0}%`;

  return h('div', {
    class: `timer${shot.finished ? ' is-done' : ''}`,
    role: 'status',
    dataset: { timer: exercise.id }
  }, [
    h('div', { class: 'timer__row' }, [
      h('span', { class: 'timer__label label', text: shot.finished ? 'Амралт дууслаа' : 'Амралт' }),
      h('span', {
        class: 'timer__value num',
        text: shot.finished ? 'Бэлэн' : formatClock(shot.remaining)
      }),
      h('button', {
        type: 'button',
        class: 'timer__stop',
        dataset: { action: 'timer-stop' },
        text: shot.finished ? 'Хаах' : 'Болих'
      })
    ]),
    h('div', { class: 'timer__track' }, [fill])
  ]);
}

/* ---------------- Дасгалын мөр ---------------- */

/**
 * @param {Exercise} exercise
 * @param {boolean[]} marks
 * @param {{openCards: Set<string>, editable: boolean, flash: {exercise: string, kind: string, index: number}|null}} ctx
 */
function renderExerciseRow(exercise, marks, ctx) {
  const done = isExerciseDone(marks);
  const doneSets = marks.filter(Boolean).length;
  const partial = !done && doneSets > 0;
  const open = ctx.openCards.has(exercise.id);
  const { editable, flash } = ctx;

  const meta = [`${exercise.sets} × ${exercise.reps}`];
  if (exercise.rest) meta.push(`амралт ${formatRest(exercise.rest)}`);

  const classes = ['row-ex'];
  if (done) classes.push('is-done');
  if (partial) classes.push('is-partial');
  if (open) classes.push('is-open');
  if (!editable) classes.push('is-locked');
  if (flash && flash.exercise === exercise.id && flash.kind === 'toggle') classes.push('is-flash');

  const box = h('span', { class: 'mark__box' }, [
    h('span', { class: 'num', text: partial ? String(doneSets) : '' }),
    h('span', { icon: ICONS.check, 'aria-hidden': 'true' })
  ]);

  const setButtons = marks.map((on, index) => {
    const hit = flash && flash.exercise === exercise.id && flash.index === index;
    return h('button', {
      type: 'button',
      class: `set num${on ? ' is-on' : ''}${hit ? ' is-flash' : ''}`,
      disabled: !editable,
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': `${exercise.name}, ${index + 1}-р сет`,
      dataset: editable ? { action: 'set', exercise: exercise.id, index: String(index) } : {},
      text: String(index + 1)
    });
  });

  const panelId = `sets-${exercise.id}`;

  return h('li', {}, [
    h('div', { class: classes.join(' ') }, [
      h('button', {
        type: 'button',
        class: 'mark',
        disabled: !editable,
        'aria-pressed': done ? 'true' : 'false',
        'aria-label': `${exercise.name} — дууссан гэж тэмдэглэх`,
        dataset: editable ? { action: 'toggle', exercise: exercise.id } : {}
      }, [box]),

      h('button', {
        type: 'button',
        class: 'row-ex__body',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': panelId,
        'aria-label': `${exercise.name} — сетүүдийг харах`,
        dataset: { action: 'open', exercise: exercise.id }
      }, [
        h('span', { class: 'row-ex__text' }, [
          h('span', { class: 'row-ex__name', text: exercise.name }),
          h('span', { class: 'row-ex__reps num', text: meta.join(' · ') }),
          exercise.note ? h('span', { class: 'row-ex__note', text: exercise.note }) : null
        ]),
        h('span', { class: 'row-ex__chevron', icon: ICONS.chevron, 'aria-hidden': 'true' })
      ])
    ]),

    h('div', { class: 'sets-wrap', id: panelId }, [
      h('div', { class: 'sets' }, [
        h('div', { class: 'sets__label label num', text: `Сет — ${doneSets}/${marks.length}` }),
        h('div', { class: 'sets__row' }, setButtons),
        renderTimer(exercise)
      ])
    ])
  ]);
}

/* ---------------- Гол зураглал ---------------- */

/**
 * @param {HTMLElement} root
 * @param {{date: string, today: string, openCards: Set<string>, swapOpen: boolean,
 *          flash: {exercise: string, kind: string, index: number}|null}} ctx
 */
export function renderDay(root, ctx) {
  clear(root);

  const { date, today } = ctx;
  // Гарч ирэх хөдөлгөөн нэг л удаа — тэмдэглэх бүрд давтагдахгүй.
  const animate = fresh;
  fresh = false;
  const isToday = date === today;
  const isFuture = date > today;
  const editable = !isFuture;
  const day = dayForDate(date);

  if (!isToday) root.appendChild(renderDayBar(date, today));

  if (!day) {
    root.appendChild(h('div', {
      class: 'error',
      text: 'Энэ өдөрт тохирох өдөр хөтөлбөрөөс олдсонгүй.'
    }));
    return;
  }

  if (day.isRest) {
    lastPct = 0;
    renderRest(root, date, day, isToday, { swapOpen: ctx.swapOpen });
    return;
  }

  const sets = readSets(date, day);
  const total = day.exercises.length;
  const done = countDone(day, sets);
  const setCounts = countSets(day, sets);
  const isComplete = total > 0 && done >= total;

  root.appendChild(renderHead(
    date,
    day,
    renderProgress(done, total, setCounts.done, setCounts.total)
  ));

  append(root, [renderSwap(date, day, { swapOpen: ctx.swapOpen })]);

  if (isFuture) {
    root.appendChild(h('div', {
      class: 'note',
      text: 'Ирээдүйн өдөр. Төлөвлөгөөг нь харж болно, тэмдэглэх нь тэр өдрөө.'
    }));
  } else if (!isToday) {
    root.appendChild(h('div', {
      class: 'note',
      text: 'Өнгөрсөн өдөр. Мартсан тэмдэглэгээгээ одоо ч нөхөж болно.'
    }));
  }

  if (isComplete) {
    const result = getDayResult(date);
    const at = timeOfTimestamp(result && result.completedAt);
    root.appendChild(h('div', { class: 'done-block' }, [
      h('div', { class: 'done-block__title', text: 'Бэлтгэл дууслаа' }),
      h('div', {
        class: 'done-block__text num',
        text: at
          ? `Дуусгасан ${at} · ${total}/${total} дасгал`
          : `${total}/${total} дасгал тэмдэглэгдсэн`
      })
    ]));
  }

  root.appendChild(h('section', { class: 'section' }, [
    h('h2', { class: 'section__title label', text: 'Дасгалууд' }),
    h('ul', { class: `list${animate ? ' is-fresh' : ''}` }, day.exercises.map((exercise) =>
      renderExerciseRow(exercise, sets[exercise.id] || [], {
        openCards: ctx.openCards,
        flash: ctx.flash,
        editable
      })
    ))
  ]));
}

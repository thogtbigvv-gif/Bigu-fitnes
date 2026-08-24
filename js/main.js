// main.js — эхлүүлэх цэг ба амьдралын мөчлөг.
// Модулиудыг холбож, апп-ыг ажиллуулна. Аппын БҮХ таймер, БҮХ гадаад
// event энд бүртгэгддэг — өмнө нь ui.js, main.js хоёр тус тусдаа
// visibilitychange сонсдог байсныг нэг газар цуглууллаа.

import { STATE_KEY, msUntilMidnight, todayString } from './data.js';
import { publishBridge } from './bridge.js';
import { loadProgram, getDays } from './program.js';
import { loadState, reconcile, reload, subscribe } from './storage.js';
import { mount, refreshDate, refreshNotice, render, showError, showTab } from './ui.js';

/** Хамгийн сүүлд ямар өдөр байсан бэ — шөнө дундыг давсныг мэдэхэд. */
let lastDate = todayString();

/**
 * Огноо солигдсон эсэхийг шалгана. Апп нээлттэй хэвээр шөнө дундыг давахад
 * "өнөөдөр" хуучин өдөр дээрээ гацаж үлдэхээс сэргийлнэ.
 * @returns {boolean} солигдсон эсэх
 */
function checkDate() {
  const now = todayString();
  if (now === lastDate) return false;
  lastDate = now;
  refreshDate();
  publishBridge();
  return true;
}

/** Дараагийн шөнө дунд яг тэр агшинд сэрнэ, дараа нь дахин товлоно. */
function scheduleMidnight() {
  window.setTimeout(() => {
    checkDate();
    scheduleMidnight();
  }, msUntilMidnight());
}

function bindLifecycle() {
  // Апп-ыг орхиод буцаж ирэх: өдөр солигдсон байж болно, тоолуур урагшилсан
  // байна, өөр табд өгөгдөл өөрчлөгдсөн байж мэднэ.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    reload();
    if (!checkDate()) render();
    publishBridge();
  });

  // Ижил апп өөр табд нээлттэй бол тэндхийн тэмдэглэгээг тусгана.
  window.addEventListener('storage', (event) => {
    if (event.key !== STATE_KEY) return;
    reload();
    render();
  });

  scheduleMidnight();
}

async function start() {
  try {
    loadState();               // хуучин өгөгдлийг унших + migration
    await loadProgram();       // data/program.json
    reconcile(getDays());      // хөтөлбөртэй таарахаа больсон хуучин тэмдэглэгээг цэгцлэх

    // Гадагш чиглэсэн feed: тэмдэглэгээ бичигдэх бүрд gym:bridge шинэчлэгдэнэ.
    subscribe(publishBridge);
    // Хадгалалт бүтэхгүй бол мэдэгдэл нь тэр дор нь гарч ирнэ.
    subscribe(refreshNotice);
    publishBridge();

    mount();                   // event binding
    showTab('today');
    bindLifecycle();
  } catch (err) {
    console.error(err);
    showError(
      'Хөтөлбөрийн файл (data/program.json) ачаалагдсангүй. ' +
      'Апп-ыг файлаар шууд нээсэн бол локал сервер ашиглана уу. ' +
      `Дэлгэрэнгүй: ${err.message}`
    );
  }
}

start();

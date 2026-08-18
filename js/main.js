// main.js — эхлүүлэх цэг. Модулиудыг холбож, апп-ыг ажиллуулна.

import { publishBridge } from './bridge.js';
import { loadProgram, getDays } from './program.js';
import { loadState, reconcile, subscribe } from './storage.js';
import { mount, showTab, showError } from './ui.js';

async function start() {
  try {
    loadState();               // хуучин өгөгдлийг унших + migration
    await loadProgram();       // data/program.json
    reconcile(getDays());      // хөтөлбөртэй таарахаа больсон хуучин тэмдэглэгээг цэгцлэх

    // Гадагш чиглэсэн feed: тэмдэглэгээ бичигдэх бүрд gym:bridge шинэчлэгдэнэ.
    subscribe(publishBridge);
    publishBridge();

    mount();                   // event binding
    showTab('today');

    // Апп-ыг орхиод буцаж ирэхэд шөнө дундыг давсан байж болно — "today" шинэчилнэ.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) publishBridge();
    });
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

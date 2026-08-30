// dom.js — элемент угсрах ганц хэрэгсэл ба дотоод SVG тогтмолууд.
// Энд төлөв ч байхгүй, өгөгдөл ч байхгүй. Бүх view энэ нэг л функцээр DOM үүсгэнэ.

/**
 * Дотоод тогтмол SVG-ууд. Гадны icon library холбохгүй гэсэн зарчмаа барина —
 * бүгд энд, нэг газар. Өнгө нь үргэлж currentColor.
 */
export const ICONS = {
  check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l-6 6.5 6 6.5"/></svg>',
  forward: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5l6 6.5-6 6.5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5h13l-3.5-3.5M20 15.5H7l3.5 3.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/></svg>',
  // Амралтын өдрийг тодорхойлох сар. Дүүргэлтгүй, зөвхөн контур —
  // бусад icon-той нэг гэр бүл.
  moon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>'
};

/**
 * @typedef {Object} ElementProps
 * @property {string} [class]    className
 * @property {string} [text]     textContent (аюулгүй — хэрэглэгчийн текст үргэлж энд ордог)
 * @property {string} [icon]     innerHTML (ЗӨВХӨН дээрх ICONS доторх тогтмол SVG)
 * @property {Record<string, string>} [dataset] data-* талбарууд
 * @property {Record<string, string>} [style]   инлайн загвар (хэмжээ, өргөн гэх мэт)
 */

/**
 * Элемент үүсгэнэ.
 *   class   -> className
 *   text    -> textContent
 *   icon    -> innerHTML (зөвхөн дотоод тогтмол)
 *   dataset -> data-* талбарууд
 *   style   -> инлайн загварын талбарууд
 *   бусад   -> setAttribute (true бол хоосон утгатай атрибут)
 * null / false утгатай prop болон child алгасагдана.
 *
 * @param {string} tag
 * @param {ElementProps & Record<string, any>} [props]
 * @param {Array<Node|null|false|undefined>|Node|null} [children]
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'icon') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of [].concat(/** @type {any} */ (children))) {
    if (child) node.appendChild(child);
  }

  return node;
}

/**
 * Хүүхдүүдийг нь бүрэн цэвэрлэнэ.
 * @param {HTMLElement} node
 */
export function clear(node) {
  node.replaceChildren();
}

/**
 * Богино id хайлт.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function el(id) {
  return document.getElementById(id);
}

/**
 * Нэг зэрэг олон элемент root-д залгана (null-ыг алгасна).
 * @param {HTMLElement} root
 * @param {Array<Node|null|false|undefined>|Node|null} nodes
 * @returns {HTMLElement}
 */
export function append(root, nodes) {
  for (const node of [].concat(/** @type {any} */ (nodes))) {
    if (node) root.appendChild(node);
  }
  return root;
}

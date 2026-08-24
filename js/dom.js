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
  forward: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5l6 6.5-6 6.5"/></svg>'
};

/**
 * Элемент үүсгэнэ.
 *   class   -> className
 *   text    -> textContent (аюулгүй, хэрэглэгчийн текст үргэлж энд ордог)
 *   icon    -> innerHTML (ЗӨВХӨН дээрх ICONS доторх тогтмол SVG)
 *   dataset -> data-* талбарууд
 *   бусад   -> setAttribute (true бол хоосон утгатай атрибут)
 * null / false утгатай prop болон child алгасагдана.
 */
export function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'icon') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }

  return node;
}

/** Хүүхдүүдийг нь бүрэн цэвэрлэнэ. */
export function clear(node) {
  node.replaceChildren();
}

/** Богино id хайлт. */
export function el(id) {
  return document.getElementById(id);
}

/** Нэг зэрэг олон элемент root-д залгана (null-ыг алгасна). */
export function append(root, nodes) {
  for (const node of [].concat(nodes)) {
    if (node) root.appendChild(node);
  }
  return root;
}

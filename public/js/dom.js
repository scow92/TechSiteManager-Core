/** @template {HTMLElement} T @param {string} id @returns {T} */
function requiredElement(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Required shell element is missing: ${id}`);
  return /** @type {T} */ (node);
}

export const app = requiredElement('app');
export const nav = requiredElement('nav');
const toast = requiredElement('toast');

/** @template {keyof HTMLElementTagNameMap} K @param {K} name @param {Record<string, unknown>} [attributes] @param {...unknown} children @returns {HTMLElementTagNameMap[K]} */
export function el(name, attributes = {}, ...children) {
  const node = document.createElement(name);
  for (const [key, value] of Object.entries(attributes || {})) {
    if (key === 'class') node.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), /** @type {EventListener} */ (value));
    else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

/** @param {unknown} error @returns {string} */
export function errorMessage(error) { return error instanceof Error ? error.message : 'Unexpected error'; }

/** @param {string} message */
export function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/** @param {string} title @param {string} [description] @param {...Node} actions */
export function pageHead(title, description = '', ...actions) {
  return el('header', { class: 'page-head' },
    el('div', {}, el('h1', {}, title), ...(description ? [el('p', { class: 'page-subtitle' }, description)] : [])),
    ...(actions.length ? [el('div', { class: 'page-actions' }, ...actions)] : []));
}

/** @param {string} title @param {string} description */
export function emptyState(title, description) {
  return el('div', { class: 'empty-state' }, el('span', { class: 'empty-icon', 'aria-hidden': 'true' }, '◇'), el('h2', {}, title), el('p', {}, description));
}

/** @param {string} label @param {string} name @param {string} [type] @param {boolean} [required] */
export function field(label, name, type = 'text', required = false) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { name, type, required: required ? '' : null }));
}

/** @param {string} label @param {string} name @param {readonly (string | { value: string, label: string })[]} options @param {string} [selected] */
export function selectField(label, name, options, selected) {
  return el('label', { class: 'field' }, el('span', {}, label), el('select', { name }, ...options.map((option) => {
    const value = typeof option === 'string' ? option : option.value;
    const text = typeof option === 'string' ? option : option.label;
    return el('option', { value, selected: value === selected ? '' : null }, text);
  })));
}

/** @param {string} label @param {string} name @param {string} [value] */
export function multilineField(label, name, value = '') {
  return el('label', { class: 'field' }, el('span', {}, label), el('textarea', { name }, value));
}

/** @template T @param {string} title @param {readonly T[]} records @param {(record: T) => string | Node} render */
export function recordList(title, records, render) {
  return el('section', { class: 'panel record-panel' }, el('div', { class: 'section-head' }, el('h2', {}, title), el('span', { class: 'count-badge' }, records.length)), records.length
    ? el('ul', { class: 'record-list' }, ...records.map((record) => el('li', {}, render(record))))
    : el('p', { class: 'empty-inline' }, `No ${title.toLowerCase()} recorded.`));
}

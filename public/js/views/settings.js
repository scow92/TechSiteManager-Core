import { api } from '../api.js';
import { app, el, pageHead } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').ExporterDescriptor} ExporterDescriptor */

/** @param {User} user @param {() => void} cycleTheme */
export async function settingsView(user, cycleTheme) {
  const providers = /** @type {ProviderDescriptor[]} */ (await api('/import-providers'));
  const exporters = /** @type {ExporterDescriptor[]} */ (await api('/plugin-exporters'));
  const appearance = el('section', { class: 'panel stack' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Appearance')),
    el('p', { class: 'muted' }, 'Follow the device theme or choose a light or dark appearance for this browser.'),
    el('div', { class: 'actions' }, el('button', { type: 'button', class: 'secondary', onclick: cycleTheme }, 'Change theme')));
  const account = el('section', { class: 'panel stack' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Current account')),
    el('dl', { class: 'settings-list' },
      el('div', {}, el('dt', {}, 'Display name'), el('dd', {}, user.displayName || user.username)),
      el('div', {}, el('dt', {}, 'Username'), el('dd', {}, user.username)),
      el('div', {}, el('dt', {}, 'Role'), el('dd', {}, user.role))));
  const capabilities = el('section', { class: 'panel stack' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Import capabilities'), el('span', { class: 'count-badge' }, providers.length)),
    providers.length
      ? el('ul', { class: 'record-list' }, ...providers.map((provider) => el('li', {}, provider.label)))
      : el('p', { class: 'empty-inline' }, 'No import providers are configured. All generic core features remain available.'),
    exporters.length ? el('p', { class: 'muted' }, `${exporters.length} provider exporter${exporters.length === 1 ? '' : 's'} available.`) : el('p', { class: 'muted' }, 'Generic JSON and CSV exports remain available.'));
  app.replaceChildren(el('section', { class: 'stack' }, pageHead('Settings', 'Generic browser preferences, session details and configured capabilities.'), el('div', { class: 'section-grid' }, appearance, account), capabilities));
}

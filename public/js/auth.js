import { api } from './api.js';
import { app, el, errorMessage, field } from './dom.js';

/** @typedef {import('../../server/types/browser-models').User} User */
/** @param {boolean} setupNeeded @param {(user: User) => Promise<void>} onAuthenticated */
export function authView(setupNeeded, onAuthenticated) {
  const form = el('form', { class: 'panel stack' },
    el('h1', {}, setupNeeded ? 'Create the first administrator' : 'Sign in'),
    field('Username', 'username', 'text', true), field('Password', 'password', 'password', true),
    ...(setupNeeded ? [field('Display name', 'displayName', 'text', true), field('Email (optional)', 'email', 'email')] : []),
    el('button', { type: 'submit' }, setupNeeded ? 'Create account' : 'Sign in'), el('p', { class: 'error', id: 'auth-error' })
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    try {
      const user = await api(setupNeeded ? '/auth/setup' : '/auth/login', { method: 'POST', body: values });
      location.hash = '#home';
      await onAuthenticated(/** @type {User} */ (user));
    } catch (error) {
      const errorNode = form.querySelector('#auth-error');
      if (errorNode) errorNode.textContent = errorMessage(error);
    }
  });
  app.replaceChildren(form);
}

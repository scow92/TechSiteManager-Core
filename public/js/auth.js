import { api } from './api.js';
import { app, el, errorMessage, field } from './dom.js';

/** @typedef {import('../../server/types/browser-models').User} User */
/** @param {boolean} setupNeeded @param {(user: User) => Promise<void>} onAuthenticated */
export function authView(setupNeeded, onAuthenticated) {
  document.body.classList.add('auth-active');
  const form = el('form', { class: 'auth-card stack' },
    el('div', { class: 'auth-brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }), el('strong', {}, 'TechSiteManager')),
    el('h1', {}, setupNeeded ? 'Welcome — create your admin account' : 'Welcome back'),
    el('p', { class: 'auth-copy' }, setupNeeded ? 'This is the first run. The account you create here will administer this installation.' : 'Sign in to continue to your planning workspace.'),
    field('Username', 'username', 'text', true), field('Password', 'password', 'password', true),
    ...(setupNeeded ? [field('Display name', 'displayName', 'text', true), field('Email (optional)', 'email', 'email')] : []),
    el('button', { type: 'submit', class: 'button-primary button-block' }, setupNeeded ? 'Create account' : 'Sign in'), el('p', { class: 'form-error', id: 'auth-error', role: 'alert' })
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    try {
      const user = await api(setupNeeded ? '/auth/setup' : '/auth/login', { method: 'POST', body: values });
      await onAuthenticated(/** @type {User} */ (user));
    } catch (error) {
      const errorNode = form.querySelector('#auth-error');
      if (errorNode) errorNode.textContent = errorMessage(error);
    }
  });
  const request = setupNeeded ? null : el('details', { class: 'auth-request' }, el('summary', {}, 'Request an account'), el('form', { class: 'stack', 'aria-label': 'Account request' }, field('Requested account name', 'username', 'text', true), field('Requested passphrase', 'password', 'password', true), field('Your name', 'displayName', 'text', true), field('Email (optional)', 'email', 'email'), el('button', { type: 'submit', class: 'secondary' }, 'Send account request'), el('p', { class: 'form-error', role: 'status' })));
  if (request) {
    const requestForm = request.querySelector('form');
    requestForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = requestForm.querySelector('[role="status"]');
      try { await api('/auth/requests', { method: 'POST', body: Object.fromEntries(new FormData(requestForm)) }); requestForm.reset(); if (status) { status.className = 'success'; status.textContent = 'Request sent. An administrator must approve it before you can sign in.'; } }
      catch (error) { if (status) { status.className = 'form-error'; status.textContent = errorMessage(error); } }
    });
  }
  app.replaceChildren(el('section', { class: 'auth-overlay' }, form, ...(request ? [request] : [])));
}

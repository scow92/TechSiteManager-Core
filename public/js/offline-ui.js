import { el } from './dom.js';

export async function replayQueue() {
  return OfflineSync.replay(OfflineStore, fetch);
}

export async function recoverPendingLogout() {
  const pending = await OfflineStore.get('pending-logout', 'current');
  if (!pending) return false;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    if (response.status === 204 || response.status === 401) {
      await OfflineStore.delete('pending-logout', 'current');
      return false;
    }
  } catch { /* Keep the durable marker until the server session is revoked. */ }
  return true;
}

/** @param {() => Promise<void>} render */
export async function offlineStatus(render) {
  const [queued, rejected] = await Promise.all([OfflineStore.all('operation-queue'), OfflineStore.all('dead-letters')]);
  if (!queued.length && !rejected.length) return null;
  const retryButtons = rejected.map((operation) => el('button', { type: 'button', class: 'secondary', onclick: async () => {
    await OfflineStore.retryDeadLetter(operation.id);
    await replayQueue();
    await render();
  } }, `Retry rejected ${operation.method} ${operation.path}`));
  return el('aside', { class: 'panel stack', 'aria-label': 'Offline synchronization status' },
    el('h2', {}, 'Offline synchronization'),
    el('p', {}, `${queued.length} queued, ${rejected.length} rejected`),
    ...retryButtons);
}

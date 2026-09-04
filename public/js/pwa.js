import { api } from './api.js';

const ROUTE = /^(home|sites|settings|import(?:\/[A-Za-z0-9._-]+)?|site\/[0-9a-f-]{36}\/[a-z-]+|package\/[0-9a-f-]{36}\/[a-z-]+)$/;

/** @param {string} userPublicId @param {string} route @param {number} scrollX @param {number} scrollY */
export async function saveNavigationState(userPublicId, route, scrollX, scrollY) {
  if (!ROUTE.test(route)) return;
  await OfflineStore.put('navigation-state', { userPublicId, route, scrollX: Math.max(0, Math.round(scrollX)), scrollY: Math.max(0, Math.round(scrollY)), updatedAt: Date.now() });
}

/** @param {string} userPublicId */
export async function loadNavigationState(userPublicId) {
  const state = /** @type {{userPublicId:string,route:string,scrollX:number,scrollY:number,updatedAt:number}|null} */ (await OfflineStore.get('navigation-state', userPublicId));
  return state?.userPublicId === userPublicId && ROUTE.test(state.route) ? state : null;
}

/** @param {string} value */
function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export async function notificationState() {
  const config = await api('/auth/notification-config');
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  return { supported: Boolean(config.supported && registration && 'Notification' in globalThis && 'PushManager' in globalThis), permission: 'Notification' in globalThis ? Notification.permission : 'unsupported', subscribed: Boolean(subscription), applicationServerKey: config.applicationServerKey };
}

export async function enableNotifications() {
  const config = await api('/auth/notification-config');
  if (!config.supported || !config.applicationServerKey || !('Notification' in globalThis) || !('serviceWorker' in navigator)) throw new Error('Push notifications are not configured for this installation');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.applicationServerKey) });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Browser returned an invalid push subscription');
  await api('/auth/push-subscriptions', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
}

export async function unsubscribeNotifications() {
  let subscription = null;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    subscription = registration ? await registration.pushManager.getSubscription() : null;
  }
  await api('/auth/push-subscriptions', { method: 'DELETE' });
  if (subscription) await subscription.unsubscribe();
}

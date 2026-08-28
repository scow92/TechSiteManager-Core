'use strict';

(function () {
  const DB_NAME = 'techsitemanager-offline';
  const VERSION = 1;
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('reference-cache')) database.createObjectStore('reference-cache');
        if (!database.objectStoreNames.contains('dirty-work-packages')) database.createObjectStore('dirty-work-packages', { keyPath: 'publicId' });
        if (!database.objectStoreNames.contains('operation-queue')) database.createObjectStore('operation-queue', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('dead-letters')) database.createObjectStore('dead-letters', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('pending-logout')) database.createObjectStore('pending-logout');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transaction(storeName, mode, action) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      action(store);
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onerror = () => { database.close(); reject(tx.error); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    });
  }
  window.OfflineStore = Object.freeze({
    put(store, value, key) { return transaction(store, 'readwrite', (objectStore) => objectStore.put(value, key)); },
    delete(store, key) { return transaction(store, 'readwrite', (objectStore) => objectStore.delete(key)); },
    async get(store, key) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readonly');
        const request = tx.objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => database.close();
      });
    },
    async all(store) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readonly');
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => database.close();
      });
    }
  });
}());

'use strict';

(function () {
  const DB_NAME = 'techsitemanager-offline';
  const VERSION = 4;
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
        if (!database.objectStoreNames.contains('id-remaps')) database.createObjectStore('id-remaps', { keyPath: 'temporaryId' });
        if (!database.objectStoreNames.contains('operation-completions')) database.createObjectStore('operation-completions', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('navigation-state')) database.createObjectStore('navigation-state', { keyPath: 'userPublicId' });
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
  async function putOperation(value) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['operation-queue', 'operation-completions'], 'readwrite');
      const completion = tx.objectStore('operation-completions').get(value.id);
      completion.onsuccess = () => { if (!completion.result) tx.objectStore('operation-queue').put(value); };
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onerror = () => { database.close(); reject(tx.error); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    });
  }
  async function allOperations() {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['operation-queue', 'operation-completions'], 'readwrite');
      const queue = tx.objectStore('operation-queue');
      const completionStore = tx.objectStore('operation-completions');
      let result = [];
      const completions = completionStore.getAll();
      completions.onsuccess = () => {
        const completed = new Set(completions.result.map((entry) => entry.id));
        const expiry = Date.now() - 30 * 24 * 60 * 60 * 1000;
        for (const entry of completions.result) if (entry.completedAt < expiry) completionStore.delete(entry.id);
        const request = queue.getAll();
        request.onsuccess = () => {
          result = request.result.filter((operation) => !completed.has(operation.id));
          for (const operation of request.result) if (completed.has(operation.id)) queue.delete(operation.id);
        };
      };
      tx.oncomplete = () => { database.close(); resolve(result); };
      tx.onerror = () => { database.close(); reject(tx.error); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    });
  }
  window.OfflineStore = Object.freeze({
    put(store, value, key) { return store === 'operation-queue' ? putOperation(value) : transaction(store, 'readwrite', (objectStore) => objectStore.put(value, key)); },
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
      if (store === 'operation-queue') return allOperations();
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readonly');
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => database.close();
      });
    },
    async completeOperation(operationId, remap) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const stores = remap ? ['operation-queue', 'id-remaps', 'operation-completions', 'dirty-work-packages'] : ['operation-queue', 'operation-completions', 'dirty-work-packages'];
        const tx = database.transaction(stores, 'readwrite');
        const queue = tx.objectStore('operation-queue');
        const operation = queue.get(operationId);
        operation.onsuccess = () => {
          queue.delete(operationId);
          tx.objectStore('operation-completions').put({ id: operationId, completedAt: Date.now() });
          if (remap) tx.objectStore('id-remaps').put(remap);
          if (operation.result?.dirtyPackagePublicId) tx.objectStore('dirty-work-packages').delete(operation.result.dirtyPackagePublicId);
        };
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
        tx.onabort = () => { database.close(); reject(tx.error); };
      });
    },
    async updateOperation(operationId, changes) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(['operation-queue', 'operation-completions'], 'readwrite');
        const store = tx.objectStore('operation-queue');
        const completion = tx.objectStore('operation-completions').get(operationId);
        completion.onsuccess = () => {
          if (completion.result) return;
          const request = store.get(operationId);
          request.onsuccess = () => { if (request.result) store.put({ ...request.result, ...changes }); };
        };
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
        tx.onabort = () => { database.close(); reject(tx.error); };
      });
    },
    async rejectOperation(operation, rejection) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(['operation-queue', 'dead-letters', 'operation-completions'], 'readwrite');
        tx.objectStore('operation-queue').delete(operation.id);
        tx.objectStore('dead-letters').put({ ...operation, ...rejection });
        tx.objectStore('operation-completions').put({ id: operation.id, completedAt: Date.now() });
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
        tx.onabort = () => { database.close(); reject(tx.error); };
      });
    },
    async retryDeadLetter(operationId) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(['operation-queue', 'dead-letters', 'operation-completions'], 'readwrite');
        const deadLetters = tx.objectStore('dead-letters');
        const request = deadLetters.get(operationId);
        request.onsuccess = () => {
          if (!request.result) return;
          const operation = { ...request.result };
          delete operation.rejectedAt; delete operation.status; delete operation.reason;
          delete operation.serverCode; delete operation.serverMessage; delete operation.serverVersion;
          tx.objectStore('operation-queue').put({ ...operation, attempts: 0 });
          tx.objectStore('operation-completions').delete(operationId);
          deadLetters.delete(operationId);
        };
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
        tx.onabort = () => { database.close(); reject(tx.error); };
      });
    }
  });
}());

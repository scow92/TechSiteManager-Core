'use strict';

(function (root) {
  const TRANSIENT = new Set([408, 425, 429]);
  const PERMANENT = new Set([400, 403, 404, 405, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421, 422, 423, 424, 426, 428, 431, 451]);

  function classification(status) {
    if (TRANSIENT.has(status) || (status >= 500 && status <= 599)) return 'transient';
    if (PERMANENT.has(status)) return 'permanent';
    return 'unclassified';
  }

  function replaceAll(value, remaps) {
    let result = value;
    for (const remap of remaps) result = result.split(remap.temporaryId).join(remap.publicId);
    return result;
  }

  async function responsePublicId(response) {
    try {
      const body = await response.clone().json();
      return typeof body.publicId === 'string' ? body.publicId : null;
    } catch { return null; }
  }

  async function responseError(response) {
    try {
      const body = await response.clone().json();
      return body && typeof body === 'object' ? body : {};
    } catch { return {}; }
  }

  async function replayOnce(store, fetchImpl, now = Date.now) {
    const operations = (await store.all('operation-queue')).sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    const active = new Set(operations.map((operation) => operation.id));
    const rejected = new Set((await store.all('dead-letters')).map((operation) => operation.id));
    const remaps = await store.all('id-remaps');

    for (const operation of operations) {
      if ((operation.dependsOn || []).some((id) => rejected.has(id))) {
        await store.rejectOperation(operation, { rejectedAt: now(), status: 424, reason: 'dependency_rejected' });
        active.delete(operation.id); rejected.add(operation.id);
        continue;
      }
      if ((operation.dependsOn || []).some((id) => active.has(id))) return { state: 'waiting', operationId: operation.id };
      if ((operation.requiredTemporaryIds || []).some((id) => !remaps.some((entry) => entry.temporaryId === id))) return { state: 'waiting', operationId: operation.id };

      let response;
      try {
        response = await fetchImpl(`/api${replaceAll(operation.path, remaps)}`, {
          method: operation.method,
          headers: operation.headers,
          body: typeof operation.body === 'string' ? replaceAll(operation.body, remaps) : operation.body,
          credentials: 'same-origin'
        });
      } catch {
        await store.updateOperation(operation.id, { attempts: operation.attempts + 1, lastAttemptAt: now() });
        return { state: 'offline', operationId: operation.id };
      }

      if (response.ok) {
        let remap = null;
        if (operation.temporaryId) {
          const publicId = await responsePublicId(response);
          if (!publicId) {
            await store.updateOperation(operation.id, { attempts: operation.attempts + 1, lastAttemptAt: now() });
            return { state: 'unclassified', operationId: operation.id };
          }
          remap = { temporaryId: operation.temporaryId, publicId, operationId: operation.id, mappedAt: now() };
          remaps.push(remap);
        }
        await store.completeOperation(operation.id, remap);
        active.delete(operation.id);
        continue;
      }

      const kind = classification(response.status);
      if (kind === 'permanent') {
        const details = await responseError(response);
        const serverCode = typeof details.code === 'string' ? details.code : null;
        await store.rejectOperation(operation, {
          rejectedAt: now(), status: response.status,
          reason: serverCode === 'version_conflict' ? 'version_conflict' : 'server_rejected',
          serverCode,
          serverMessage: typeof details.error === 'string' ? details.error : null,
          serverVersion: Number.isInteger(details.serverVersion) ? details.serverVersion : null
        });
        active.delete(operation.id); rejected.add(operation.id);
        continue;
      }
      await store.updateOperation(operation.id, { attempts: operation.attempts + 1, lastAttemptAt: now(), lastStatus: response.status });
      return { state: kind, operationId: operation.id };
    }
    return { state: 'complete' };
  }

  let replayTail = Promise.resolve();
  function replay(store, fetchImpl, now = Date.now) {
    const result = replayTail.then(() => replayOnce(store, fetchImpl, now));
    replayTail = result.catch(() => undefined);
    return result;
  }

  const contract = Object.freeze({ classification, replay });
  root.OfflineSync = contract;
  if (typeof module !== 'undefined') module.exports = contract;
}(globalThis));

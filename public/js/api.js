/** @typedef {Omit<RequestInit, 'body'> & { body?: unknown, queueable?: boolean, queueMetadata?: { dependsOn?: string[], temporaryId?: string | null, requiredTemporaryIds?: string[], operationKey?: string | null, entityType?: string | null, entityPublicId?: string | null, dirtyPackagePublicId?: string | null, label?: string | null } }} ApiOptions */
/** @template T @param {string} path @param {ApiOptions} [options] @returns {Promise<T>} */
export async function api(path, options = {}) {
  const { queueable = false, queueMetadata = {}, ...requestOptions } = options;
  const method = requestOptions.method || 'GET';
  /** @type {BodyInit | null | undefined} */
  const body = requestOptions.body === null || requestOptions.body === undefined || typeof requestOptions.body === 'string' ? requestOptions.body : JSON.stringify(requestOptions.body);
  const headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
  let response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', ...requestOptions, method, headers, body });
  } catch (error) {
    if (method === 'GET') {
      const cached = await OfflineStore.get('reference-cache', path);
      if (cached !== undefined) return /** @type {T} */ (cached);
    }
    if (queueable) {
      const operationKey = queueMetadata.operationKey || null;
      const existing = operationKey
        ? (await OfflineStore.all('operation-queue')).find((entry) => entry.operationKey === operationKey)
        : null;
      const operation = {
        id: existing?.id || crypto.randomUUID(), path, method, headers, body,
        createdAt: existing?.createdAt || Date.now(), attempts: 0,
        dependsOn: queueMetadata.dependsOn || [], temporaryId: queueMetadata.temporaryId || null,
        requiredTemporaryIds: queueMetadata.requiredTemporaryIds || [], operationKey,
        entityType: queueMetadata.entityType || null, entityPublicId: queueMetadata.entityPublicId || null,
        dirtyPackagePublicId: queueMetadata.dirtyPackagePublicId || null,
        label: queueMetadata.label || null
      };
      await OfflineStore.put('operation-queue', operation);
      return /** @type {T} */ ({ queued: true, operationId: operation.id, publicId: operation.temporaryId });
    }
    if (error && typeof error === 'object') throw Object.assign(error, { offline: true });
    throw error;
  }
  if (response.status === 204) {
    if (method === 'GET') await OfflineStore.put('reference-cache', null, path);
    return /** @type {T} */ (null);
  }
  /** @type {unknown} */
  const data = await response.json();
  if (!response.ok) {
    const details = data && typeof data === 'object' ? data : {};
    const error = new Error('error' in details && typeof details.error === 'string' ? details.error : 'Request failed');
    Object.assign(error, {
      status: response.status,
      code: 'code' in details && typeof details.code === 'string' ? details.code : 'request_failed',
      requestId: 'requestId' in details && typeof details.requestId === 'string' ? details.requestId : null,
      serverVersion: 'serverVersion' in details && Number.isInteger(details.serverVersion) ? details.serverVersion : null
    });
    throw error;
  }
  if (queueable && queueMetadata.operationKey) {
    const existing = (await OfflineStore.all('operation-queue')).find((entry) => entry.operationKey === queueMetadata.operationKey);
    if (existing) await OfflineStore.completeOperation(existing.id, null);
  }
  if (method === 'GET') await OfflineStore.put('reference-cache', data, path);
  return /** @type {T} */ (data);
}

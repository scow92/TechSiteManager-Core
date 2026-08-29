/** @typedef {Omit<RequestInit, 'body'> & { body?: unknown, queueable?: boolean, queueMetadata?: { dependsOn?: string[], temporaryId?: string | null, requiredTemporaryIds?: string[] } }} ApiOptions */
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
      const operation = { id: crypto.randomUUID(), path, method, headers, body, createdAt: Date.now(), attempts: 0, dependsOn: queueMetadata.dependsOn || [], temporaryId: queueMetadata.temporaryId || null, requiredTemporaryIds: queueMetadata.requiredTemporaryIds || [] };
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
  if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Request failed');
  if (method === 'GET') await OfflineStore.put('reference-cache', data, path);
  return /** @type {T} */ (data);
}

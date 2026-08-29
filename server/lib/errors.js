'use strict';

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {string} [path]
   */
  constructor(status, code, message, path) {
    super(message);
    this.status = status;
    this.code = code;
    this.publicMessage = message;
    this.path = path;
    /** @type {number | undefined} */
    this.serverVersion = undefined;
  }
}

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {string} [path]
 */
function httpError(status, code, message, path) {
  return new HttpError(status, code, message, path);
}

/**
 * @typedef {{ error: string, code: string, requestId: string, path?: string }} PublicErrorBody
 */

/**
 * Convert an unknown thrown value into the stable public error response.
 * @param {unknown} error
 * @param {string} requestId
 * @returns {{ status: number, body: PublicErrorBody }}
 */
function errorBody(error, requestId) {
  const candidate = error && typeof error === 'object' ? error : {};
  const status = 'status' in candidate && Number.isInteger(candidate.status) ? Number(candidate.status) : 500;
  const publicMessage = 'publicMessage' in candidate && typeof candidate.publicMessage === 'string' ? candidate.publicMessage : null;
  const message = 'message' in candidate && typeof candidate.message === 'string' ? candidate.message : null;
  const code = 'code' in candidate && typeof candidate.code === 'string' ? candidate.code : 'internal_error';
  /** @type {PublicErrorBody} */
  const body = {
    error: status >= 500 ? 'The request could not be completed' : publicMessage || message || 'The request could not be completed',
    code,
    requestId
  };
  if ('path' in candidate && typeof candidate.path === 'string') body.path = candidate.path;
  return { status, body };
}

module.exports = { HttpError, httpError, errorBody };

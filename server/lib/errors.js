'use strict';

class HttpError extends Error {
  constructor(status, code, message, path) {
    super(message);
    this.status = status;
    this.code = code;
    this.publicMessage = message;
    this.path = path;
  }
}

function httpError(status, code, message, path) {
  return new HttpError(status, code, message, path);
}

function errorBody(error, requestId) {
  const status = Number.isInteger(error && error.status) ? error.status : 500;
  const body = {
    error: status >= 500 ? 'The request could not be completed' : error.publicMessage || error.message,
    code: error.code || 'internal_error',
    requestId
  };
  if (error.path) body.path = error.path;
  return { status, body };
}

module.exports = { HttpError, httpError, errorBody };

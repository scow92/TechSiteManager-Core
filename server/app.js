'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const auth = require('./lib/auth');
const { errorBody, httpError } = require('./lib/errors');

const PUBLIC_ROOT = path.join(__dirname, '..', 'public');
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'",
  "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
].join('; ');

module.exports = function createApp(registry) {
  const app = express();
  app.set('trust proxy', config.proxyMode === 'single' ? 1 : false);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-ID', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => console.log(JSON.stringify({ type: 'http_request', requestId: req.id, method: req.method, route: req.path, status: res.statusCode, durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10 })));
    next();
  });
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', CSP);
    if (config.secureTransport) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* invalid origin */ }
      if (host !== req.headers.host) return next(httpError(403, 'cross_origin_rejected', 'Cross-origin request rejected'));
    }
    next();
  });
  app.use(express.json({ limit: '14mb', strict: true }));
  app.use(auth.session);
  app.get('/api/health', (_req, res) => res.json({ status: registry.degraded.length ? 'degraded' : 'ready', pluginApiVersion: 1, providers: registry.providers.length, optionalPluginFailures: registry.degraded.length }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api', require('./routes/imports')(registry));
  app.use('/api', require('./routes/core'));

  const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');
  for (const dir of ['css', 'js']) app.use(`/${dir}`, express.static(path.join(PUBLIC_ROOT, dir), { setHeaders: noCache }));
  app.get('/manifest.json', (_req, res) => res.sendFile(path.join(PUBLIC_ROOT, 'manifest.json')));
  app.get('/sw.js', (_req, res) => { noCache(res); res.sendFile(path.join(PUBLIC_ROOT, 'sw.js')); });
  const index = fs.readFileSync(path.join(PUBLIC_ROOT, 'index.html'), 'utf8');
  app.get(['/', '/index.html'], (_req, res) => { noCache(res); res.type('html').send(index); });

  app.use((_req, _res, next) => next(httpError(404, 'not_found', 'Not found')));
  app.use((err, req, res, _next) => {
    let error = err;
    if (err && err.type === 'entity.parse.failed') error = httpError(400, 'invalid_json', 'Request body must contain valid JSON');
    if (err && err.type === 'entity.too.large') error = httpError(413, 'request_too_large', 'Request is too large');
    if (err && String(err.code || '').startsWith('SQLITE_CONSTRAINT')) error = httpError(409, 'constraint_conflict', 'The request conflicts with an existing record or relationship');
    const mapped = errorBody(error, req.id);
    if (error.serverVersion !== undefined) mapped.body.serverVersion = error.serverVersion;
    if (mapped.status >= 500) console.error(JSON.stringify({ type: 'request_error', requestId: req.id, code: error.code || 'internal_error' }));
    res.status(mapped.status).json(mapped.body);
  });
  return app;
};

'use strict';

const express = require('express');
const imports = require('../imports/service');
const exportService = require('../plugins/export-service');
const auth = require('../lib/auth');

/** @param {import('express').Request} req @returns {number} */
function actorId(req) {
  if (!req.user) throw new Error('authenticated route missing user');
  return req.user.id;
}

/** @param {string | string[]} value @returns {string} */
function routeParam(value) {
  if (typeof value !== 'string') throw new Error('route parameter is invalid');
  return value;
}

/** @param {import('techsitemanager/plugin-api').PluginRegistry} registry @returns {express.Router} */
module.exports = function createImportRouter(registry) {
  const router = express.Router();
  router.use(auth.requireSession);

  router.get('/import-providers', (_req, res) => res.json(registry.providers));
  router.get('/plugin-exporters', (_req, res) => res.json(registry.exporters));
  router.get('/presentation-profiles/:entityType', (req, res, next) => {
    try {
      const presentation = registry.presentationFor(routeParam(req.params.entityType));
      if (!presentation) return res.status(204).end();
      res.json(presentation);
    } catch (error) { next(error); }
  });
  router.post('/import-providers/:providerId/drafts', auth.requireWrite, async (req, res, next) => {
    try { res.status(201).json(await imports.stage(registry, routeParam(req.params.providerId), actorId(req), req.body)); } catch (error) { next(error); }
  });
  router.get('/import-drafts/:draftId', async (req, res, next) => {
    try { res.json(await imports.getDraft(routeParam(req.params.draftId), actorId(req))); } catch (error) { next(error); }
  });
  router.delete('/import-drafts/:draftId', auth.requireWrite, async (req, res, next) => {
    try { await imports.cancelDraft(routeParam(req.params.draftId), actorId(req)); res.status(204).end(); } catch (error) { next(error); }
  });
  router.post('/import-drafts/:draftId/apply', auth.requireWrite, async (req, res, next) => {
    try { res.json(await imports.apply(registry, routeParam(req.params.draftId), actorId(req), req.body)); } catch (error) { next(error); }
  });
  router.get('/import-runs/:runId', async (req, res, next) => {
    try { res.json(await imports.getRun(req.params.runId)); } catch (error) { next(error); }
  });
  router.get('/work-packages/:publicId/plugin-exports/:exporterId', async (req, res, next) => {
    try {
      const output = await exportService.generate(registry, req.params.exporterId, req.params.publicId);
      res.type(output.mediaType).attachment(output.fileName).send(output.content);
    } catch (error) { next(error); }
  });
  return router;
};

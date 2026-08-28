'use strict';

const express = require('express');
const imports = require('../imports/service');
const auth = require('../lib/auth');

module.exports = function createImportRouter(registry) {
  const router = express.Router();
  router.use(auth.requireSession);

  router.get('/import-providers', (_req, res) => res.json(registry.providers));
  router.post('/import-providers/:providerId/drafts', auth.requireWrite, async (req, res, next) => {
    try { res.status(201).json(await imports.stage(registry, req.params.providerId, req.user.id, req.body)); } catch (error) { next(error); }
  });
  router.get('/import-drafts/:draftId', async (req, res, next) => {
    try { res.json(await imports.getDraft(req.params.draftId, req.user.id)); } catch (error) { next(error); }
  });
  router.delete('/import-drafts/:draftId', auth.requireWrite, async (req, res, next) => {
    try { await imports.cancelDraft(req.params.draftId, req.user.id); res.status(204).end(); } catch (error) { next(error); }
  });
  router.post('/import-drafts/:draftId/apply', auth.requireWrite, async (req, res, next) => {
    try { res.json(await imports.apply(registry, req.params.draftId, req.user.id, req.body)); } catch (error) { next(error); }
  });
  router.get('/import-runs/:runId', async (req, res, next) => {
    try { res.json(await imports.getRun(req.params.runId)); } catch (error) { next(error); }
  });
  return router;
};

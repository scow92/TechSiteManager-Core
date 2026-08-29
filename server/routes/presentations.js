'use strict';

const express = require('express');
const auth = require('../lib/auth');
const extensionValues = require('../plugins/extension-values');

/** @param {string | string[]} value @returns {string} */
function routeParam(value) { if (typeof value !== 'string') throw new Error('route parameter is invalid'); return value; }

/** @param {import('techsitemanager/plugin-api').PluginRegistry} registry */
module.exports = function createPresentationRouter(registry) {
  const router = express.Router();
  router.use(auth.requireSession);
  router.put('/extension-values/:entityType/:entityPublicId/:fieldId', auth.requireWrite, async (req, res, next) => {
    try {
      if (!req.user) throw new Error('authenticated route missing user');
      const userId = req.user.id;
      const entityType = routeParam(req.params.entityType); const entityPublicId = routeParam(req.params.entityPublicId); const fieldId = routeParam(req.params.fieldId);
      const result = await extensionValues.put(registry, entityType, entityPublicId, fieldId, req.body, userId);
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
};

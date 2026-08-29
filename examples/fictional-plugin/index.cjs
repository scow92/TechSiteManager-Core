'use strict';

/** @param {unknown} value @returns {string} */
function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/** @type {import('techsitemanager/plugin-api').PluginPackage} */
const plugin = {
  manifest: {
    apiVersion: 1,
    id: 'example.fictional-facility',
    version: '1.0.0',
    coreCompatibility: '>=1.0.0-rc.1 <2.0.0'
  },
  transforms: {
    'example.normalize-label': normalizeLabel
  },
  profiles: [
    { id: 'example.facility-json-v1', file: 'profile.yaml' }
  ],
  imports: [
    {
      id: 'example.fictional-facility.json',
      label: 'Fictional facility plan',
      input: {
        type: 'pasted-text',
        maxBytes: 262144,
        fields: []
      },
      profileId: 'example.facility-json-v1',
      transform: require('./provider.cjs')
    }
  ],
  exporters: [
    {
      id: 'example.fictional-facility.summary',
      label: 'Fictional facility summary',
      mediaType: 'application/json',
      fileExtension: '.facility.json',
      maxBytes: 65536,
      export: require('./exporter.cjs')
    }
  ]
};

module.exports = plugin;

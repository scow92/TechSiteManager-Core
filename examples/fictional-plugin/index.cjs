'use strict';

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

module.exports = {
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
  ]
};

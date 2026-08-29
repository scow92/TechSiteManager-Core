'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDraft } = require('../imports/contracts');

const artifact = Object.freeze({
  contentHash: `sha256:${'a'.repeat(64)}`,
  connectorId: 'core.paste'
});

function validDraft() {
  return {
    schemaVersion: 'techsitemanager.io/import-draft/v1',
    providerId: 'example.contract-provider',
    source: { externalSourceId: 'fictional-source-1', sourceVersion: '1' },
    target: { siteCode: 'LAB-01', siteName: 'Fictional Lab' },
    workPackage: {
      sourceRecordKey: 'package:fictional-1',
      fields: {
        packageReference: { value: 'PKG-FICTIONAL-1', ownership: 'source-owned' },
        title: { value: 'Fictional contract fixture', ownership: 'source-owned' }
      },
      workItems: [],
      connections: []
    },
    warnings: []
  };
}

test('runtime import validation remains authoritative for external provider output', () => {
  const valid = validateDraft(validDraft(), 'example.contract-provider', '1.0.0', artifact, null);
  assert.equal(valid.workPackage.fields.title.value, 'Fictional contract fixture');

  const unknownContribution = { ...validDraft(), executable: 'not-supported' };
  assert.throws(
    () => validateDraft(unknownContribution, 'example.contract-provider', '1.0.0', artifact, null),
    (error) => error.code === 'unknown_field'
  );

  const invalidValue = validDraft();
  invalidValue.workPackage.fields.title.value = { nested: 'not-a-string' };
  assert.throws(
    () => validateDraft(invalidValue, 'example.contract-provider', '1.0.0', artifact, null),
    (error) => error.code === 'invalid_field'
  );
});

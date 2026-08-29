'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, canonicalHash, sourceFingerprint } = require('../imports/fingerprints');
const { inputFields } = require('../imports/artifacts');

test('source fingerprints are deterministic and distinguish source versions', () => {
  const draft = {
    providerId: 'fixture.provider',
    source: { externalSourceId: 'fictional-source', sourceVersion: '1', contentHash: sha256(Buffer.from('fictional-content')) }
  };
  const first = sourceFingerprint(/** @type {never} */ (draft));
  assert.equal(first, sourceFingerprint(/** @type {never} */ ({ ...draft, source: { ...draft.source } })));
  assert.notEqual(first, sourceFingerprint(/** @type {never} */ ({ ...draft, source: { ...draft.source, sourceVersion: '2' } })));
  assert.match(canonicalHash({ b: 2, a: 1 }), /^sha256:[a-f0-9]{64}$/);
});

test('artifact descriptor fields remain bounded and reject unknown input', () => {
  const provider = /** @type {never} */ ({ input: { fields: [{ id: 'fixture.label', label: 'Label', type: 'string', required: true, maxLength: 20 }] } });
  assert.deepEqual(inputFields(provider, { 'fixture.label': 'Fictional plan' }), { 'fixture.label': 'Fictional plan' });
  assert.throws(() => inputFields(provider, { unknown: 'value' }), { code: 'unknown_input_field' });
  assert.throws(() => inputFields(provider, {}), { code: 'required_field' });
});

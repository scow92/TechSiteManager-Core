'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-import-service-'));
process.env.DATA_DIR = testDataDir;
process.env.DB_FILE = path.join(testDataDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.PLUGIN_TIMEOUT_MS = '100';

const db = require('../db/knex');
const imports = require('../imports/service');
const exportService = require('../plugins/export-service');
const { loadPlugins } = require('../plugins/loader');

const root = path.join(__dirname, '..', '..');
const registry = loadPlugins({ configFile: path.join(root, 'config', 'fictional-plugin.json'), searchRoot: root });
const basePlan = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'fictional-plugin', 'example-plan.json'), 'utf8'));
let actorId;

test.before(async () => {
  await db.migrate.latest();
  [actorId] = await db('users').insert({ public_id: cryptoRandom(), username: 'import-tester', password_hash: 'test-only', role: 'admin', display_name: 'Import Tester', active: 1 });
});

test.after(async () => { await db.destroy(); fs.rmSync(testDataDir, { recursive: true, force: true }); });

function cryptoRandom() { return require('crypto').randomUUID(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function payload(plan) { const content = JSON.stringify(plan); return { content, contentEncoding: 'utf8', mediaType: 'text/plain', externalReference: plan.sourceId, fields: {} }; }
function approval(proposal, overrides = {}) {
  return { schemaVersion: 'techsitemanager.io/import-approval/v1', draftHash: proposal.draftHash, targetVersions: proposal.targetVersions, fieldDecisions: {}, absenceDecisions: {}, acknowledgeWarnings: [], ...overrides };
}
async function stage(plan) { return imports.stage(registry, 'example.fictional-facility.json', actorId, payload(plan)); }

test('fictional import creates a complete generic package and provenance atomically', async () => {
  const proposal = await stage(basePlan);
  assert.deepEqual(proposal.summary, { siteCode: 'LAB-01', siteName: 'Northwind Demo Lab', packageReference: 'PKG-DEMO-100', title: 'Demo lab cross-connects' });
  assert.equal(proposal.entityProposals.filter((entry) => entry.action === 'create').length, 4);
  const result = await imports.apply(registry, proposal.draftId, actorId, approval(proposal));
  assert.equal(result.status, 'applied');
  assert.equal(result.counts.created, 4);
  assert.equal(await db('work_packages').count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  assert.equal(await db('work_items').count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  assert.equal(await db('circuits').count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  assert.equal(await db('segments').count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  const extension = await db('extension_values').first();
  assert.equal(extension.plugin_id, 'example.fictional-facility'); assert.equal(JSON.parse(extension.value_json), 'LAB-01');
  const run = await db('import_runs').first();
  assert.equal(run.profile_id, 'example.facility-json-v1');
  assert.match(run.profile_hash, /^sha256:[a-f0-9]{64}$/);
});

test('raw source content is not retained in drafts, runs, links, or audit', async () => {
  const marker = 'TRANSIENT-MARKER-DO-NOT-RETAIN';
  const plan = clone(basePlan); plan.sourceId = 'nonretention-source'; plan.package.id = 'nonretention-package'; plan.package.reference = 'PKG-NONRETENTION'; plan.package.description = marker;
  const proposal = await stage(plan);
  const draftRow = await db('import_drafts').where({ id: proposal.draftId }).first();
  assert.equal(draftRow.normalized_draft_json.includes(marker), true, 'normalized values are retained for preview');
  assert.equal(draftRow.normalized_draft_json.includes(JSON.stringify(plan)), false, 'raw artifact envelope is not retained');
  assert.equal(Object.keys(draftRow).some((key) => /artifact|raw|content_bytes/.test(key)), false);
  await imports.cancelDraft(proposal.draftId, actorId);
  assert.equal(await db('import_drafts').where({ id: proposal.draftId }).first(), undefined);
});

test('fictional exporter receives a bounded core work-package projection', async () => {
  const pack = await db('work_packages').where({ package_ref: 'PKG-DEMO-100' }).first();
  const output = await exportService.generate(registry, 'example.fictional-facility.summary', pack.public_id);
  assert.equal(output.mediaType, 'application/json'); assert.equal(output.fileName, 'PKG-DEMO-100.facility.json');
  const parsed = JSON.parse(output.content.toString('utf8'));
  assert.equal(parsed.schemaVersion, 'example.test/facility-summary/v1'); assert.equal(parsed.segmentCount, 1);
  assert.deepEqual(Object.keys(parsed).sort(), ['connectionCount', 'packageReference', 'schemaVersion', 'segmentCount', 'siteCode', 'workItemCount'].sort());
});

test('identical repeated import is idempotent', async () => {
  const proposal = await stage(basePlan);
  const result = await imports.apply(registry, proposal.draftId, actorId, approval(proposal));
  assert.equal(result.status, 'applied');
  const pack = await db('work_packages').where({ package_ref: 'PKG-DEMO-100' }).first();
  assert.ok(result.workPackagePublicId); assert.equal(result.workPackagePublicId, pack.public_id);
  assert.equal(await db('work_packages').where({ package_ref: 'PKG-DEMO-100' }).count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  const run = await db('import_runs').where({ public_id: result.runId }).first();
  assert.ok(run.attempt_count >= 2);
});

test('record reordering preserves stable links and creates no duplicate entities', async () => {
  const plan = clone(basePlan); plan.revision = '2'; plan.items.unshift({ id: 'task-b', reference: 'ITEM-DEMO-B', title: 'Inspect demonstration panel' });
  plan.items.reverse();
  const proposal = await stage(plan);
  await imports.apply(registry, proposal.draftId, actorId, approval(proposal));
  assert.equal(await db('work_items').count({ count: '*' }).first().then((row) => Number(row.count)), 2);
  assert.equal(await db('import_entity_links').where({ entity_type: 'work_item' }).count({ count: '*' }).first().then((row) => Number(row.count)), 2);
});

test('manual edits are detected and not silently overwritten', async () => {
  const pack = await db('work_packages').where({ package_ref: 'PKG-DEMO-100' }).first();
  await db('work_packages').where({ id: pack.id }).update({ title: 'Manual planning title', version: pack.version + 1 });
  const plan = clone(basePlan); plan.revision = '3'; plan.package.title = 'Changed source title';
  const proposal = await stage(plan);
  const title = proposal.entityProposals.find((entry) => entry.entityType === 'work_package').fields.find((field) => field.fieldPath === 'title');
  assert.equal(title.conflict, true); assert.equal(title.recommended, 'keep-current');
  await imports.apply(registry, proposal.draftId, actorId, approval(proposal));
  assert.equal((await db('work_packages').where({ id: pack.id }).first()).title, 'Manual planning title');
});

test('a second source cannot take field ownership by provider order', async () => {
  const plan = clone(basePlan); plan.sourceId = 'independent-fictional-source'; plan.revision = '1'; plan.package.title = 'Second source candidate';
  plan.items = []; plan.connections = [];
  const proposal = await stage(plan);
  const title = proposal.entityProposals.find((entry) => entry.entityType === 'work_package').fields.find((field) => field.fieldPath === 'title');
  assert.equal(title.conflict, true);
  await imports.apply(registry, proposal.draftId, actorId, approval(proposal));
  assert.equal((await db('work_packages').where({ package_ref: 'PKG-DEMO-100' }).first()).title, 'Manual planning title');
  const owner = await db('import_field_ownership').where({ entity_type: 'work_package', field_path: 'title' }).first();
  const controllingLink = await db('import_entity_links').where({ id: owner.source_link_id }).first();
  const controllingSource = await db('import_sources').where({ id: controllingLink.source_id }).first();
  assert.equal(controllingSource.external_source_id, basePlan.sourceId);
});

test('source absence is recoverable and never deletes a core record', async () => {
  const plan = clone(basePlan); plan.revision = '4'; plan.items = []; plan.connections = [];
  const proposal = await stage(plan);
  assert.ok(proposal.absences.length >= 3);
  const absenceDecisions = Object.fromEntries(proposal.absences.map((entry) => [entry.proposalId, 'keep-linked-absent']));
  await imports.apply(registry, proposal.draftId, actorId, approval(proposal, { absenceDecisions }));
  assert.equal(await db('work_items').count({ count: '*' }).first().then((row) => Number(row.count)), 2);
  assert.equal(await db('circuits').count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  assert.ok(await db('import_entity_links').whereNotNull('absent_at').count({ count: '*' }).first().then((row) => Number(row.count)) >= 3);
});

test('cancelled and expired drafts cannot apply', async () => {
  const plan = clone(basePlan); plan.sourceId = 'cancel-source'; plan.package.id = 'cancel-package'; plan.package.reference = 'PKG-CANCEL';
  const cancelled = await stage(plan); await imports.cancelDraft(cancelled.draftId, actorId);
  await assert.rejects(imports.getDraft(cancelled.draftId, actorId), { status: 404 });
  plan.sourceId = 'expired-source'; plan.package.id = 'expired-package'; plan.package.reference = 'PKG-EXPIRED';
  const expired = await stage(plan); await db('import_drafts').where({ id: expired.draftId }).update({ expires_at: '2000-01-01T00:00:00.000Z' });
  await assert.rejects(imports.apply(registry, expired.draftId, actorId, approval(expired)), { status: 410 });
});

test('stale approval is rejected before writes', async () => {
  const plan = clone(basePlan); plan.revision = '5'; plan.package.description = 'New candidate description';
  const proposal = await stage(plan);
  const pack = await db('work_packages').where({ package_ref: 'PKG-DEMO-100' }).first();
  await db('work_packages').where({ id: pack.id }).increment('version', 1);
  await assert.rejects(imports.apply(registry, proposal.draftId, actorId, approval(proposal)), { code: 'stale_approval' });
});

test('approval rejects unknown or malformed field, absence, and warning decisions', async () => {
  const plan = clone(basePlan); plan.revision = 'approval-validation';
  const proposal = await stage(plan);
  await assert.rejects(imports.apply(registry, proposal.draftId, actorId, approval(proposal, { fieldDecisions: { 'work_package:missing.title': 'accept-source' } })), { code: 'invalid_field_decision' });
  await assert.rejects(imports.apply(registry, proposal.draftId, actorId, approval(proposal, { absenceDecisions: { 'absent:missing': 'unlink-and-keep' } })), { code: 'invalid_absence_decision' });
  await assert.rejects(imports.apply(registry, proposal.draftId, actorId, approval(proposal, { acknowledgeWarnings: ['example.unknown-warning'] })), { code: 'unknown_warning_acknowledgement' });
  await assert.rejects(imports.apply(registry, proposal.draftId, actorId, approval(proposal, { fieldDecisions: [] })), { code: 'invalid_shape' });
  assert.equal((await db('import_drafts').where({ id: proposal.draftId }).first()).applied_run_id, null);
});

test('transaction failure leaves no partial package, source, run, or links', async () => {
  const plan = clone(basePlan); plan.sourceId = 'rollback-source'; plan.package.id = 'rollback-package'; plan.package.reference = 'PKG-ROLLBACK';
  plan.items = [
    { id: 'rollback-a', reference: 'ITEM-DUPLICATE', title: 'First fictional item' },
    { id: 'rollback-b', reference: 'ITEM-DUPLICATE', title: 'Second fictional item' }
  ];
  plan.connections = [];
  const proposal = await stage(plan);
  await assert.rejects(imports.apply(registry, proposal.draftId, actorId, approval(proposal)));
  assert.equal(await db('work_packages').where({ package_ref: 'PKG-ROLLBACK' }).first(), undefined);
  assert.equal(await db('import_sources').where({ external_source_id: 'rollback-source' }).first(), undefined);
  assert.equal(await db('import_runs').where({ source_version: plan.revision, content_hash: imports.sha256(Buffer.from(JSON.stringify(plan))) }).first(), undefined);
});

test('same source version with changed content produces a bounded warning', async () => {
  const plan = clone(basePlan); plan.sourceId = 'same-version-source'; plan.revision = '7'; plan.package.id = 'same-version-package'; plan.package.reference = 'PKG-SAME-VERSION'; plan.items = []; plan.connections = [];
  const first = await stage(plan); await imports.apply(registry, first.draftId, actorId, approval(first));
  plan.package.title = 'Changed bytes with unchanged version';
  const changed = await stage(plan);
  assert.ok(changed.warnings.some((warning) => warning.code === 'core.source-version-content-changed'));
});

test('provider timeout and failure responses are sanitized', async () => {
  const provider = { id: 'fixture.timeout.provider', providerVersion: '1.0.0', input: { type: 'pasted-text', maxBytes: 1024, fields: [] }, transform: () => new Promise(() => {}) };
  const timeoutRegistry = { provider: () => provider, profile: () => null, transform: () => null };
  await assert.rejects(imports.stage(timeoutRegistry, provider.id, actorId, { content: '{}', mediaType: 'text/plain', fields: {} }), { code: 'provider_timeout' });
  const marker = 'SENSITIVE-SOURCE-VALUE';
  const failedProvider = { ...provider, id: 'fixture.failure.provider', transform: async () => { throw new Error(marker); } };
  const failureRegistry = { provider: () => failedProvider, profile: () => null, transform: () => null };
  await assert.rejects(imports.stage(failureRegistry, failedProvider.id, actorId, { content: marker, mediaType: 'text/plain', fields: {} }), (error) => error.code === 'provider_rejected_source' && !error.message.includes(marker));
});

test('external-reference connectors receive strictly validated descriptor fields', async () => {
  const provider = {
    id: 'example.external-reference', providerVersion: '1.0.0', connectorId: 'example.connector', profileId: null,
    input: { type: 'external-reference', maxBytes: 1024, fields: [{ id: 'example.label', label: 'Plan label', type: 'string', required: true, maxLength: 30 }] },
    async transform(artifact) {
      return { schemaVersion: 'techsitemanager.io/import-draft/v1', providerId: 'example.external-reference', source: { externalSourceId: artifact.externalReference, sourceVersion: null }, target: { siteCode: 'CONNECTOR-DEMO', siteName: 'Connector Demonstration' }, workPackage: { sourceRecordKey: 'package:connector-demo', fields: { packageReference: { value: 'PKG-CONNECTOR-DEMO', ownership: 'source-owned' }, title: { value: artifact.fields['example.label'], ownership: 'source-owned' } }, workItems: [], connections: [] }, warnings: [] };
    }
  };
  const connector = { id: 'example.connector', async acquire(reference) { assert.equal(reference.fields['example.label'], 'Fictional connector plan'); return { content: Buffer.from('{}'), mediaType: 'application/json' }; } };
  const connectorRegistry = { provider: (id) => id === provider.id ? provider : undefined, connector: (id) => id === connector.id ? connector : undefined, profile: () => null, transform: () => undefined };
  const proposal = await imports.stage(connectorRegistry, provider.id, actorId, { externalReference: 'fictional-reference-01', fields: { 'example.label': 'Fictional connector plan' } });
  assert.equal(proposal.entityProposals[0].action, 'create'); await imports.cancelDraft(proposal.draftId, actorId);
  await assert.rejects(imports.stage(connectorRegistry, provider.id, actorId, { externalReference: 'fictional-reference-02', fields: { unknown: 'rejected' } }), { code: 'unknown_input_field' });
  await assert.rejects(imports.stage(connectorRegistry, provider.id, actorId, { externalReference: 'fictional-reference-03', fields: {} }), { code: 'required_field' });
});

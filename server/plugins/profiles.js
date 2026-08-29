'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');
const { DURABLE_ID } = require('../lib/validation');

const MAX_BYTES = 256 * 1024;
const MAX_DEPTH = 12;
const MAX_COLLECTIONS = 2000;
const ALLOWED_KEYS = new Set(['schemaVersion', 'id', 'aliases', 'mappings', 'defaults', 'statusMap', 'categoryMap', 'fieldOwnership', 'identity', 'transforms']);
const POLICIES = new Set(['source-owned', 'user-owned', 'source-default', 'review-required']);
const SECRET_KEY = /(secret|password|credential|token|api[-_]?key|private[-_]?key)/i;
const FORBIDDEN_VALUE = /(?:BEGIN [A-Z ]*PRIVATE KEY|\b(?:https?|file):\/\/|\bSELECT\s+.+\s+FROM\b|\brequire\s*\(|=>|\$\{)/i;

/** @param {string} code @param {string} [pathName] @returns {never} */
function fail(code, pathName = 'profile') {
  throw Object.assign(new Error(code), { code, path: pathName });
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @param {{ collections: number }} [state]
 * @param {string} [pathName]
 */
function inspect(value, depth = 0, state = { collections: 0 }, pathName = 'profile') {
  if (depth > MAX_DEPTH) fail('profile_too_deep', pathName);
  if (Array.isArray(value)) {
    state.collections += value.length;
    if (state.collections > MAX_COLLECTIONS) fail('profile_too_many_values', pathName);
    value.forEach((entry, index) => inspect(entry, depth + 1, state, `${pathName}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && (value.length > 20_000 || FORBIDDEN_VALUE.test(value))) fail('profile_forbidden_value', pathName);
    return;
  }
  const entries = Object.entries(value);
  state.collections += entries.length;
  if (state.collections > MAX_COLLECTIONS) fail('profile_too_many_values', pathName);
  for (const [key, entry] of entries) {
    if (SECRET_KEY.test(key)) fail('profile_secret_field', `${pathName}.${key}`);
    inspect(entry, depth + 1, state, `${pathName}.${key}`);
  }
}

/** @param {unknown} value @param {string} pathName @returns {Record<string, unknown>} */
function ensurePlainMap(value, pathName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('profile_invalid_map', pathName);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @template T @param {T} value @returns {Readonly<T>} */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
  return Object.freeze(value);
}

/**
 * @param {string} source
 * @param {ReadonlyMap<string, import('techsitemanager/plugin-api').NamedTransform>} registeredTransforms
 * @returns {Readonly<import('techsitemanager/plugin-api').ImportProfile>}
 */
function parseProfile(source, registeredTransforms) {
  if (Buffer.byteLength(source) > MAX_BYTES) fail('profile_too_large');
  if (/(^|[\s,[{])(?:&|\*)[A-Za-z0-9_-]+|(^|\s)<<\s*:/m.test(source)) fail('profile_yaml_alias_forbidden');
  const document = YAML.parseDocument(source, { uniqueKeys: true, prettyErrors: false, strict: true });
  if (document.errors.length || document.warnings.length) fail('profile_invalid_yaml');
  const profile = ensurePlainMap(document.toJS({ maxAliasCount: 0 }), 'profile');
  for (const key of Object.keys(profile)) if (!ALLOWED_KEYS.has(key)) fail('profile_unknown_key', `profile.${key}`);
  if (profile.schemaVersion !== 'techsitemanager.io/import-profile/v1') fail('profile_schema_version');
  if (typeof profile.id !== 'string' || !DURABLE_ID.test(profile.id) || profile.id.length > 128) fail('profile_invalid_id', 'profile.id');
  inspect(profile);

  for (const name of ['aliases', 'mappings', 'defaults', 'statusMap', 'categoryMap', 'fieldOwnership', 'identity']) {
    if (profile[name] !== undefined) ensurePlainMap(profile[name], `profile.${name}`);
  }
  const fieldOwnership = profile.fieldOwnership === undefined ? {} : ensurePlainMap(profile.fieldOwnership, 'profile.fieldOwnership');
  for (const [field, policy] of Object.entries(fieldOwnership)) {
    if (typeof policy !== 'string' || !POLICIES.has(policy)) fail('profile_invalid_ownership', `profile.fieldOwnership.${field}`);
  }
  const transforms = profile.transforms || [];
  if (!Array.isArray(transforms)) fail('profile_invalid_transforms', 'profile.transforms');
  for (const [index, transformId] of transforms.entries()) {
    if (typeof transformId !== 'string') fail('profile_unknown_transform', `profile.transforms[${index}]`);
    if (!DURABLE_ID.test(transformId) || !registeredTransforms.has(transformId)) fail('profile_unknown_transform', `profile.transforms[${index}]`);
  }
  return deepFreeze(/** @type {import('techsitemanager/plugin-api').ImportProfile} */ (/** @type {unknown} */ (profile)));
}

/**
 * @param {string} packageRoot
 * @param {string} relativeFile
 * @param {ReadonlyMap<string, import('techsitemanager/plugin-api').NamedTransform>} registeredTransforms
 * @returns {Readonly<import('techsitemanager/plugin-api').ImportProfile & { hash: `sha256:${string}` }>}
 */
function loadProfile(packageRoot, relativeFile, registeredTransforms) {
  if (typeof relativeFile !== 'string' || !relativeFile || path.isAbsolute(relativeFile)) fail('profile_path_invalid');
  const root = fs.realpathSync(packageRoot);
  const requested = path.resolve(root, relativeFile);
  if (requested !== root && !requested.startsWith(root + path.sep)) fail('profile_path_escape');
  const real = fs.realpathSync(requested);
  if (real !== root && !real.startsWith(root + path.sep)) fail('profile_symlink_escape');
  const source = fs.readFileSync(real, 'utf8');
  const profile = parseProfile(source, registeredTransforms);
  return deepFreeze({ ...profile, hash: `sha256:${crypto.createHash('sha256').update(source).digest('hex')}` });
}

module.exports = { parseProfile, loadProfile, MAX_BYTES };

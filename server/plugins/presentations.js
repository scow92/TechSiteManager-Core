'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');
const { DURABLE_ID } = require('../lib/validation');
const { deepFreeze } = require('./contracts');

const MAX_BYTES = 256 * 1024;
const MAX_VIEWS = 20;
const MAX_FIELDS = 200;
const MAX_SECTIONS = 40;
const ENTITY_TYPES = new Set(['work-package', 'work-item', 'circuit', 'segment', 'consumable-requirement']);
const COMPONENTS = new Set(['record-form', 'child-record-tabs', 'connection-schedule', 'requirement-table', 'material-summary']);
const FIELD_TYPES = new Set(['string', 'multiline', 'date', 'integer', 'decimal', 'boolean', 'enum']);
const ROOT_KEYS = new Set(['schemaVersion', 'id', 'entityType', 'terms', 'fields', 'views']);
const TERM_KEYS = new Set(['singular', 'plural', 'childSingular', 'childPlural']);
const FIELD_KEYS = new Set(['id', 'entityType', 'binding', 'label', 'type', 'required', 'wide', 'maxLength', 'options']);
const VIEW_KEYS = new Set(['id', 'label', 'icon', 'component', 'title', 'description', 'emptyTitle', 'emptyDescription', 'media', 'sections', 'fields', 'circuitFields', 'segmentFields']);
const SECTION_KEYS = new Set(['id', 'label', 'hint', 'fields']);
const CORE_BINDINGS = Object.freeze({
  'work-package': new Set(['packageReference', 'title', 'status', 'externalReference', 'projectReference', 'description', 'leadAssignee', 'assignees']),
  'work-item': new Set(['itemReference', 'title', 'status', 'description']),
  circuit: new Set(['circuitReference', 'description', 'media', 'status']),
  segment: new Set(['segmentReference', 'fromEndpoint', 'fromEndpointMode', 'fromPort', 'fromConnector', 'toEndpoint', 'toEndpointMode', 'toPort', 'toConnector', 'lengthMetres', 'notes', 'fibreType', 'fibreMode', 'fibreSimplex', 'stockLengthMetres', 'itemType', 'copperCategory', 'copperShielding', 'copperPinout', 'dacConnector', 'dacMedia', 'dacDirection']),
  'consumable-requirement': new Set(['description', 'quantityRequired', 'unit'])
});
const SECRET_KEY = /(secret|password|credential|token|api[-_]?key|private[-_]?key)/i;
const FORBIDDEN_VALUE = /(?:BEGIN [A-Z ]*PRIVATE KEY|\b(?:https?|file):\/\/|\bSELECT\s+.+\s+FROM\b|\brequire\s*\(|=>|\$\{)/i;

/** @param {string} code @param {string} [pathName] @returns {never} */
function fail(code, pathName = 'presentation') { throw Object.assign(new Error(code), { code, path: pathName }); }

/** @param {unknown} value @param {string} pathName @returns {Record<string, unknown>} */
function record(value, pathName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('presentation_invalid_record', pathName);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {Set<string>} allowed @param {string} pathName */
function known(value, allowed, pathName) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail('presentation_unknown_key', `${pathName}.${key}`);
}

/** @param {unknown} value @param {string} pathName @param {number} [max] @returns {string} */
function text(value, pathName, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || FORBIDDEN_VALUE.test(value)) fail('presentation_invalid_text', pathName);
  return value;
}

/** @param {unknown} value @param {string} pathName @returns {string} */
function durableId(value, pathName) {
  if (typeof value !== 'string' || value.length > 128 || !DURABLE_ID.test(value)) fail('presentation_invalid_id', pathName);
  return value;
}

/** @param {unknown} value @param {string} pathName @returns {string} */
function localId(value, pathName) {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)) fail('presentation_invalid_id', pathName);
  return value;
}

/** @param {unknown} value @param {string} pathName @param {number} max @returns {unknown[]} */
function list(value, pathName, max) {
  if (!Array.isArray(value) || value.length > max) fail('presentation_invalid_list', pathName);
  return value;
}

/** @param {unknown} value @param {number} [depth] @param {{ count: number }} [state] @param {string} [pathName] */
function inspect(value, depth = 0, state = { count: 0 }, pathName = 'presentation') {
  if (depth > 12) fail('presentation_too_deep', pathName);
  if (Array.isArray(value)) {
    state.count += value.length;
    if (state.count > 4000) fail('presentation_too_many_values', pathName);
    value.forEach((entry, index) => inspect(entry, depth + 1, state, `${pathName}[${index}]`));
  } else if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    state.count += entries.length;
    if (state.count > 4000) fail('presentation_too_many_values', pathName);
    for (const [key, entry] of entries) {
      if (SECRET_KEY.test(key)) fail('presentation_secret_field', `${pathName}.${key}`);
      inspect(entry, depth + 1, state, `${pathName}.${key}`);
    }
  } else if (typeof value === 'string' && (value.length > 20_000 || FORBIDDEN_VALUE.test(value))) fail('presentation_forbidden_value', pathName);
}

/** @param {unknown} source @param {string} pathName @param {Set<string>} fieldIds @returns {string[]} */
function fieldReferences(source, pathName, fieldIds) {
  return list(source || [], pathName, MAX_FIELDS).map((value, index) => {
    const id = localId(value, `${pathName}[${index}]`);
    if (!fieldIds.has(id)) fail('presentation_unknown_field', `${pathName}[${index}]`);
    return id;
  });
}

/**
 * @param {string} source
 * @param {string} pluginId
 * @returns {Readonly<import('techsitemanager/plugin-api').PresentationProfile>}
 */
function parsePresentation(source, pluginId) {
  if (Buffer.byteLength(source) > MAX_BYTES) fail('presentation_too_large');
  if (/(^|[\s,[{])(?:&|\*)[A-Za-z0-9_-]+|(^|\s)<<\s*:/m.test(source)) fail('presentation_yaml_alias_forbidden');
  const document = YAML.parseDocument(source, { uniqueKeys: true, prettyErrors: false, strict: true });
  if (document.errors.length || document.warnings.length) fail('presentation_invalid_yaml');
  const input = record(document.toJS({ maxAliasCount: 0 }), 'presentation');
  known(input, ROOT_KEYS, 'presentation');
  inspect(input);
  if (input.schemaVersion !== 'techsitemanager.io/presentation-profile/v1') fail('presentation_schema_version');
  const id = durableId(input.id, 'presentation.id');
  const entityType = text(input.entityType, 'presentation.entityType', 64);
  if (entityType !== 'work-package') fail('presentation_entity_type_invalid', 'presentation.entityType');
  const terms = record(input.terms, 'presentation.terms');
  known(terms, TERM_KEYS, 'presentation.terms');
  const normalizedTerms = {
    singular: text(terms.singular, 'presentation.terms.singular'),
    plural: text(terms.plural, 'presentation.terms.plural'),
    childSingular: text(terms.childSingular, 'presentation.terms.childSingular'),
    childPlural: text(terms.childPlural, 'presentation.terms.childPlural')
  };
  const fields = list(input.fields, 'presentation.fields', MAX_FIELDS).map((value, index) => {
    const pathName = `presentation.fields[${index}]`;
    const field = record(value, pathName);
    known(field, FIELD_KEYS, pathName);
    const fieldId = localId(field.id, `${pathName}.id`);
    const fieldEntity = text(field.entityType, `${pathName}.entityType`, 64);
    if (!ENTITY_TYPES.has(fieldEntity)) fail('presentation_field_entity_invalid', `${pathName}.entityType`);
    const binding = text(field.binding, `${pathName}.binding`, 255);
    const corePrefix = 'core.';
    const extensionPrefix = `extension.${pluginId}.`;
    if (binding.startsWith(corePrefix)) {
      const coreName = binding.slice(corePrefix.length);
      if (!/** @type {Record<string, Set<string>>} */ (CORE_BINDINGS)[fieldEntity].has(coreName)) fail('presentation_core_binding_invalid', `${pathName}.binding`);
    } else if (binding.startsWith(extensionPrefix)) {
      localId(binding.slice(extensionPrefix.length), `${pathName}.binding`);
    } else fail('presentation_binding_scope_invalid', `${pathName}.binding`);
    const type = text(field.type, `${pathName}.type`, 32);
    if (!FIELD_TYPES.has(type)) fail('presentation_field_type_invalid', `${pathName}.type`);
    const options = field.options === undefined ? [] : list(field.options, `${pathName}.options`, 100).map((option, optionIndex) => text(option, `${pathName}.options[${optionIndex}]`, 100));
    if (type === 'enum' && !options.length) fail('presentation_field_options_invalid', `${pathName}.options`);
    if (field.required !== undefined && typeof field.required !== 'boolean') fail('presentation_field_flag_invalid', `${pathName}.required`);
    if (field.wide !== undefined && typeof field.wide !== 'boolean') fail('presentation_field_flag_invalid', `${pathName}.wide`);
    if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || /** @type {number} */ (field.maxLength) < 1 || /** @type {number} */ (field.maxLength) > 20_000)) fail('presentation_field_limit_invalid', `${pathName}.maxLength`);
    return { id: fieldId, entityType: fieldEntity, binding, label: text(field.label, `${pathName}.label`), type, required: field.required === true, wide: field.wide === true, maxLength: typeof field.maxLength === 'number' ? field.maxLength : (type === 'multiline' ? 20_000 : 255), options };
  });
  const fieldIds = new Set(fields.map((field) => field.id));
  if (fieldIds.size !== fields.length) fail('presentation_duplicate_field_id');
  const views = list(input.views, 'presentation.views', MAX_VIEWS).map((value, index) => {
    const pathName = `presentation.views[${index}]`;
    const view = record(value, pathName);
    known(view, VIEW_KEYS, pathName);
    const component = text(view.component, `${pathName}.component`, 64);
    if (!COMPONENTS.has(component)) fail('presentation_component_invalid', `${pathName}.component`);
    const sections = list(view.sections || [], `${pathName}.sections`, MAX_SECTIONS).map((sectionValue, sectionIndex) => {
      const sectionPath = `${pathName}.sections[${sectionIndex}]`;
      const section = record(sectionValue, sectionPath);
      known(section, SECTION_KEYS, sectionPath);
      return { id: localId(section.id, `${sectionPath}.id`), label: text(section.label, `${sectionPath}.label`), hint: section.hint === undefined ? '' : text(section.hint, `${sectionPath}.hint`, 500), fields: fieldReferences(section.fields, `${sectionPath}.fields`, fieldIds) };
    });
    const media = list(view.media || [], `${pathName}.media`, 20).map((entry, mediaIndex) => text(entry, `${pathName}.media[${mediaIndex}]`, 64).toLowerCase());
    return {
      id: localId(view.id, `${pathName}.id`), label: text(view.label, `${pathName}.label`), icon: view.icon === undefined ? '' : text(view.icon, `${pathName}.icon`, 8), component,
      title: view.title === undefined ? '' : text(view.title, `${pathName}.title`), description: view.description === undefined ? '' : text(view.description, `${pathName}.description`, 500),
      emptyTitle: view.emptyTitle === undefined ? '' : text(view.emptyTitle, `${pathName}.emptyTitle`), emptyDescription: view.emptyDescription === undefined ? '' : text(view.emptyDescription, `${pathName}.emptyDescription`, 500),
      media, sections, fields: fieldReferences(view.fields, `${pathName}.fields`, fieldIds), circuitFields: fieldReferences(view.circuitFields, `${pathName}.circuitFields`, fieldIds), segmentFields: fieldReferences(view.segmentFields, `${pathName}.segmentFields`, fieldIds)
    };
  });
  const viewIds = new Set(views.map((view) => view.id));
  if (!views.length || viewIds.size !== views.length) fail('presentation_duplicate_view_id');
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const view of views) {
    /** @param {string[]} references */
    const entities = (references) => references.map((fieldId) => byId.get(fieldId)?.entityType);
    if (view.component === 'record-form' && (!view.sections.length || view.sections.some((section) => entities(section.fields).some((entity) => entity !== 'work-package')))) fail('presentation_component_field_invalid', `presentation.views.${view.id}`);
    if (view.component === 'child-record-tabs' && (!view.fields.length || entities(view.fields).some((entity) => entity !== 'work-item'))) fail('presentation_component_field_invalid', `presentation.views.${view.id}`);
    if (view.component === 'connection-schedule' && (entities(view.circuitFields).some((entity) => entity !== 'circuit') || entities(view.segmentFields).some((entity) => entity !== 'segment') || !view.segmentFields.length)) fail('presentation_component_field_invalid', `presentation.views.${view.id}`);
    if (['requirement-table', 'material-summary'].includes(view.component) && entities(view.fields).some((entity) => entity !== 'consumable-requirement')) fail('presentation_component_field_invalid', `presentation.views.${view.id}`);
    if (view.media.length && view.component !== 'connection-schedule') fail('presentation_component_filter_invalid', `presentation.views.${view.id}.media`);
  }
  return deepFreeze(/** @type {import('techsitemanager/plugin-api').PresentationProfile} */ (/** @type {unknown} */ ({ schemaVersion: 'techsitemanager.io/presentation-profile/v1', id, entityType, pluginId, terms: normalizedTerms, fields, views })));
}

/** @param {string} packageRoot @param {string} relativeFile @param {string} pluginId */
function loadPresentation(packageRoot, relativeFile, pluginId) {
  if (typeof relativeFile !== 'string' || !relativeFile || path.isAbsolute(relativeFile)) fail('presentation_path_invalid');
  const root = fs.realpathSync(packageRoot);
  const requested = path.resolve(root, relativeFile);
  if (requested !== root && !requested.startsWith(root + path.sep)) fail('presentation_path_escape');
  const real = fs.realpathSync(requested);
  if (real !== root && !real.startsWith(root + path.sep)) fail('presentation_symlink_escape');
  const source = fs.readFileSync(real, 'utf8');
  const presentation = parsePresentation(source, pluginId);
  return deepFreeze({ ...presentation, hash: /** @type {`sha256:${string}`} */ (`sha256:${crypto.createHash('sha256').update(source).digest('hex')}`) });
}

module.exports = { parsePresentation, loadPresentation, CORE_BINDINGS, ENTITY_TYPES, FIELD_TYPES, MAX_BYTES };

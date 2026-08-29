'use strict';

/** @typedef {import('techsitemanager/import-contracts').FieldOwnershipPolicy} FieldOwnershipPolicy */
/**
 * @typedef {{
 *   id: string,
 *   reference: string,
 *   title: string,
 *   description?: string,
 *   status?: string
 * }} FictionalItem
 */
/**
 * @typedef {{
 *   id: string,
 *   reference: string,
 *   from: string,
 *   to: string,
 *   lengthMetres?: number,
 *   notes?: string
 * }} FictionalSegment
 */
/**
 * @typedef {{
 *   id: string,
 *   reference: string,
 *   description?: string,
 *   media: string,
 *   status?: string,
 *   segments: [FictionalSegment, ...FictionalSegment[]]
 * }} FictionalConnection
 */
/**
 * @typedef {{
 *   schemaVersion: 'example.test/facility-plan/v1',
 *   sourceId: string,
 *   revision?: string | number,
 *   site: { code: string, name: string },
 *   package: {
 *     id: string,
 *     reference: string,
 *     externalReference?: string,
 *     projectReference?: string,
 *     title: string,
 *     description?: string,
 *     status?: string
 *   },
 *   items?: FictionalItem[],
 *   connections?: FictionalConnection[]
 * }} FictionalSource
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is FictionalItem} */
function isItem(value) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.reference === 'string' &&
    typeof value.title === 'string' && (value.description === undefined || typeof value.description === 'string') &&
    (value.status === undefined || typeof value.status === 'string');
}

/** @param {unknown} value @returns {value is FictionalSegment} */
function isSegment(value) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.reference === 'string' &&
    typeof value.from === 'string' && typeof value.to === 'string' &&
    (value.lengthMetres === undefined || typeof value.lengthMetres === 'number') &&
    (value.notes === undefined || typeof value.notes === 'string');
}

/** @param {unknown} value @returns {value is FictionalConnection} */
function isConnection(value) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.reference === 'string' &&
    typeof value.media === 'string' && (value.description === undefined || typeof value.description === 'string') &&
    (value.status === undefined || typeof value.status === 'string') && Array.isArray(value.segments) &&
    value.segments.length > 0 && value.segments.every(isSegment);
}

/** @param {unknown} value @returns {value is FictionalSource} */
function isSource(value) {
  return isRecord(value) && value.schemaVersion === 'example.test/facility-plan/v1' &&
    typeof value.sourceId === 'string' &&
    (value.revision === undefined || typeof value.revision === 'string' || typeof value.revision === 'number') &&
    isRecord(value.site) && typeof value.site.code === 'string' && typeof value.site.name === 'string' &&
    isRecord(value.package) && typeof value.package.id === 'string' && typeof value.package.reference === 'string' &&
    typeof value.package.title === 'string' &&
    (value.package.externalReference === undefined || typeof value.package.externalReference === 'string') &&
    (value.package.projectReference === undefined || typeof value.package.projectReference === 'string') &&
    (value.package.description === undefined || typeof value.package.description === 'string') &&
    (value.package.status === undefined || typeof value.package.status === 'string') &&
    (value.items === undefined || (Array.isArray(value.items) && value.items.every(isItem))) &&
    (value.connections === undefined || (Array.isArray(value.connections) && value.connections.every(isConnection)));
}

/** @returns {Error & { code: string }} */
function unrecognized() {
  return Object.assign(new Error('source_unrecognized'), { code: 'source_unrecognized' });
}

/**
 * @template {string | number | null} T
 * @param {T} value
 * @param {FieldOwnershipPolicy} ownership
 * @returns {import('techsitemanager/import-contracts').ManagedValue<T>}
 */
function managed(value, ownership) {
  return { value, ownership };
}

/** @type {import('techsitemanager/plugin-api').ImportTransform} */
module.exports = async function transform(artifact, context) {
  /** @type {unknown} */
  let parsed;
  try { parsed = JSON.parse(artifact.content.toString('utf8')); } catch { throw unrecognized(); }
  if (!isSource(parsed) || !context.profile) throw unrecognized();
  const source = parsed;
  const normalizeTransform = context.transforms['example.normalize-label'];
  /** @param {unknown} value @returns {string} */
  const normalize = (value) => String(normalizeTransform(value));
  const profile = context.profile;
  const ownership = profile.fieldOwnership || {};
  /** @param {string} name @param {FieldOwnershipPolicy} fallback */
  const policy = (name, fallback) => ownership[name] || fallback;
  const defaultStatus = typeof profile.defaults?.status === 'string' ? profile.defaults.status : 'planned';
  const categoryMap = profile.categoryMap || {};
  return {
    schemaVersion: 'techsitemanager.io/import-draft/v2',
    providerId: 'example.fictional-facility.json',
    presentationId: 'example.fictional-facility.presentation-v1',
    source: { externalSourceId: String(source.sourceId), sourceVersion: source.revision === undefined ? null : String(source.revision) },
    target: { siteCode: normalize(source.site.code), siteName: normalize(source.site.name) },
    workPackage: {
      sourceRecordKey: `package:${source.package.id}`,
      fields: {
        packageReference: managed(String(normalize(source.package.reference)), policy('packageReference', 'source-owned')),
        externalReference: managed(String(normalize(source.package.externalReference || '')), policy('externalReference', 'source-owned')),
        projectReference: managed(String(normalize(source.package.projectReference || '')), policy('projectReference', 'source-default')),
        title: managed(String(normalize(source.package.title)), policy('title', 'source-owned')),
        description: managed(String(source.package.description || ''), policy('description', 'user-owned')),
        status: managed(source.package.status || defaultStatus, policy('status', 'source-default'))
      },
      extensions: { 'zone-code': managed(String(normalize(source.site.code)), 'source-owned') },
      workItems: (source.items || []).map((item, index) => ({
        sourceRecordKey: `item:${item.id}`,
        sequenceHint: index,
        fields: {
          itemReference: managed(String(normalize(item.reference)), 'source-owned'),
          title: managed(String(normalize(item.title)), 'source-owned'),
          description: managed(String(item.description || ''), 'user-owned'),
          status: managed(item.status || defaultStatus, 'source-default')
        }
      })),
      connections: (source.connections || []).map((connection) => {
        const category = categoryMap[connection.media];
        const segments = connection.segments.map((segment) => ({
          sourceRecordKey: `segment:${segment.id}`,
          fields: {
            segmentReference: managed(String(normalize(segment.reference)), 'source-owned'),
            fromEndpoint: managed(String(normalize(segment.from)), 'review-required'),
            toEndpoint: managed(String(normalize(segment.to)), 'review-required'),
            lengthMetres: managed(segment.lengthMetres === undefined ? null : segment.lengthMetres, 'review-required'),
            notes: managed(String(segment.notes || ''), 'user-owned')
          }
        }));
        return {
          sourceRecordKey: `connection:${connection.id}`,
          fields: {
            circuitReference: managed(String(normalize(connection.reference)), 'source-owned'),
            description: managed(String(connection.description || ''), 'user-owned'),
            media: managed(typeof category === 'string' ? category : connection.media, 'source-owned'),
            status: managed(connection.status || defaultStatus, 'source-default')
          },
          segments: /** @type {[typeof segments[number], ...typeof segments]} */ (segments)
        };
      }),
      consumableRequirements: []
    },
    warnings: []
  };
};

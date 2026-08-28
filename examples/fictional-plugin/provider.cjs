'use strict';

function managed(value, ownership) {
  return { value: value === undefined ? null : value, ownership };
}

module.exports = async function transform(artifact, context) {
  let source;
  try { source = JSON.parse(artifact.content.toString('utf8')); } catch { const error = new Error('source_unrecognized'); error.code = 'source_unrecognized'; throw error; }
  if (!source || source.schemaVersion !== 'example.test/facility-plan/v1' || !source.sourceId || !source.site || !source.package) {
    const error = new Error('source_unrecognized'); error.code = 'source_unrecognized'; throw error;
  }
  const normalize = context.transforms['example.normalize-label'];
  const ownership = context.profile.fieldOwnership;
  return {
    schemaVersion: 'techsitemanager.io/import-draft/v1',
    providerId: 'example.fictional-facility.json',
    source: { externalSourceId: String(source.sourceId), sourceVersion: source.revision === undefined ? null : String(source.revision) },
    target: { siteCode: normalize(source.site.code), siteName: normalize(source.site.name) },
    workPackage: {
      sourceRecordKey: `package:${source.package.id}`,
      fields: {
        packageReference: managed(normalize(source.package.reference), ownership.packageReference),
        externalReference: managed(normalize(source.package.externalReference || ''), ownership.externalReference),
        projectReference: managed(normalize(source.package.projectReference || ''), ownership.projectReference),
        title: managed(normalize(source.package.title), ownership.title),
        description: managed(String(source.package.description || ''), ownership.description),
        status: managed(source.package.status || context.profile.defaults.status, ownership.status)
      },
      workItems: (source.items || []).map((item, index) => ({
        sourceRecordKey: `item:${item.id}`,
        sequenceHint: index,
        fields: {
          itemReference: managed(normalize(item.reference), 'source-owned'),
          title: managed(normalize(item.title), 'source-owned'),
          description: managed(String(item.description || ''), 'user-owned'),
          status: managed(item.status || context.profile.defaults.status, 'source-default')
        }
      })),
      connections: (source.connections || []).map((connection) => ({
        sourceRecordKey: `connection:${connection.id}`,
        fields: {
          circuitReference: managed(normalize(connection.reference), 'source-owned'),
          description: managed(String(connection.description || ''), 'user-owned'),
          media: managed(context.profile.categoryMap[connection.media] || connection.media, 'source-owned'),
          status: managed(connection.status || context.profile.defaults.status, 'source-default')
        },
        segments: (connection.segments || []).map((segment) => ({
          sourceRecordKey: `segment:${segment.id}`,
          fields: {
            segmentReference: managed(normalize(segment.reference), 'source-owned'),
            fromEndpoint: managed(normalize(segment.from), 'review-required'),
            toEndpoint: managed(normalize(segment.to), 'review-required'),
            lengthMetres: managed(segment.lengthMetres === undefined ? null : segment.lengthMetres, 'review-required'),
            notes: managed(String(segment.notes || ''), 'user-owned')
          }
        }))
      }))
    },
    warnings: []
  };
};

'use strict';

/** @type {import('techsitemanager/plugin-api').Exporter['export']} */
module.exports = async function exportSummary(workPackage) {
  const summary = {
    schemaVersion: 'example.test/facility-summary/v1',
    packageReference: workPackage.packageReference,
    siteCode: workPackage.site.code,
    workItemCount: workPackage.workItems.length,
    connectionCount: workPackage.circuits.length,
    segmentCount: workPackage.circuits.reduce((count, circuit) => count + circuit.segments.length, 0)
  };
  return { content: Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, 'utf8') };
};

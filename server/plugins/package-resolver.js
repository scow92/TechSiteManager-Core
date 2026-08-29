'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');
const { plainRecord, pluginError } = require('./contracts');

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/**
 * Resolve only an exact installed package name and confine its entry point to
 * the real package root. Runtime installation and path/URL loading are not
 * supported by Plugin API V1.
 *
 * @param {string} packageName
 * @param {string} searchRoot
 * @returns {{ packageRoot: string, metadata: { name: string, version: string }, entry: string }}
 */
function resolvePackage(packageName, searchRoot) {
  if (!PACKAGE_NAME.test(packageName) || packageName.includes('..')) throw pluginError('plugin_package_name_invalid');
  const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [searchRoot] });
  const packageRoot = fs.realpathSync(path.dirname(packageJsonPath));
  /** @type {unknown} */
  const parsedMetadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const metadataRecord = plainRecord(parsedMetadata, 'plugin_package_metadata_invalid');
  if (metadataRecord.name !== packageName) throw pluginError('plugin_package_name_mismatch');
  if (typeof metadataRecord.version !== 'string' || !semver.valid(metadataRecord.version)) throw pluginError('plugin_package_metadata_invalid');
  const metadata = { name: packageName, version: metadataRecord.version };
  const entry = fs.realpathSync(require.resolve(packageName, { paths: [searchRoot] }));
  if (entry !== packageRoot && !entry.startsWith(packageRoot + path.sep)) throw pluginError('plugin_package_root_escape');
  return { packageRoot, metadata, entry };
}

module.exports = { PACKAGE_NAME, resolvePackage };

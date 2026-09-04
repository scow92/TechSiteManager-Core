# Export Projection API V1

Plugin API V2 exporters may opt into the read-only
`techsitemanager.io/export-projection/v1` input. The projection is an atomic,
bounded snapshot assembled by core for one authenticated work-package export.
It is not an HTTP data API and it is not a database abstraction.

An exporter requests it with:

```js
{
  projectionVersion: 'techsitemanager.io/export-projection/v1',
  export(projection, context) { /* return one bounded Buffer */ }
}
```

Exporters that omit `projectionVersion` retain the original
`WorkPackageProjection` input. Plugin API V1 packages cannot request the V1
export projection. Unknown projection versions fail package loading.

## Compatibility workbook field inventory

The compatibility Work Request workbook contains eight sheets. The following
table records every input used to construct them and whether it already exists
in the Plugin API V2 work-package projection.

| Sheet | Workbook values | Projection source |
| --- | --- | --- |
| Front Page | Site acronym, code, name, address and post code | `workPackage.site.code/name` already exist. Optional source-specific acronym/address/post-code values remain exporter-plugin extension values on the work package. |
| Front Page | Primary and secondary contact first name, last name, phone and email | Optional exporter-plugin extension values. These are not core user identities and core does not assign source semantics to them. |
| Front Page | Work Request reference, project reference and budget code | `workPackage.packageReference/projectReference` already exist; optional budget code remains an exporter-plugin extension value. |
| Work Order | Reference, class, work type, title, delivery process, priority, budget code, year, quarter, status and following-row description | Reference/title/status/description already exist on `workPackage.workItems`; the remaining source-shaped columns remain exporter-plugin extension values. |
| Cable Fibre, Cable Copper, Cable DAC | Media; A/B device, port, room, rack and connector; length; description/reference | Media, length, notes and stable circuit/segment references already exist. Source-shaped endpoint columns remain exporter-plugin segment extensions. |
| Racks | Rack label, room/location, height and suite line | New narrow `site.racks` projection, related to `site.rooms` by stable public ID. |
| Tie ODFs | Termination-point label, related room and notes | New narrow `site.terminationPoints` projection. A provider may derive a host rack from approved segment endpoint data when available. Core has no private tray/capacity model, so an exporter leaves unsupported cells blank rather than inventing values. |
| Consumables | SKU, description, unit, unit price, required quantity, value, lead time and comments | Description/unit/quantity and optional linked catalogue ID already exist; source-shaped SKU/price/value/lead-time/comments remain exporter-plugin extensions. New `catalogueItems` supplies only catalogue rows referenced by this work package. |

The compatibility BOM contains two sheets:

| Sheet | Workbook values | Projection source |
| --- | --- | --- |
| Bill of Materials | SKU/part number, description, quantity, line price and total | Work-package requirements, exporter-plugin requirement extensions and the new referenced `catalogueItems` projection. Workbook construction, rounding and formula neutralization remain plugin-owned. |
| Missing SKU | Run label, A endpoint, B endpoint and reason | Stable circuit/segment references, core endpoints and exporter-plugin endpoint/connector extensions already present in the work-package projection. Matching rules and reason text remain plugin-owned. |

No provider-specific label, mapping, matching rule, workbook layout or pricing
rule is added to core. Optional source-shaped values continue to use the
existing validated, plugin-scoped extension mechanism.

## Projection shape

`ExportProjectionV1` contains:

- `schemaVersion`: exactly `techsitemanager.io/export-projection/v1`;
- `workPackage`: the existing nested work-package projection, with extension
  values limited to the requesting exporter's plugin namespace;
- `site`: stable site identity plus deterministically ordered rooms, racks and
  termination points. Relationships use `roomPublicId`; display names are
  included only to avoid plugin-side lookups;
- `catalogueItems`: only catalogue rows referenced by this work package,
  ordered by catalogue reference and stable public ID; and
- `approvedImportRecords`: approved provenance links belonging to providers
  from the requesting exporter's plugin, ordered by source, entity type,
  source-record key and entity public ID.

Each approved import record exposes only `sourcePublicId`, `sourceRecordKey`,
`entityType`, `entityPublicId`, `parentEntityPublicId` and `state`. `state` is:

- `present` when the approved linked entity remains in the current package;
- `source-absent` after a reviewed `keep-linked-absent` decision; or
- `entity-missing` when durable provenance remains but the linked core entity
  cannot be found.

A reviewed `unlink-and-keep` decision removes the provenance link, so the kept
core entity remains in `workPackage` but has no `approvedImportRecords` entry.
The projection never turns any state into a deletion and cannot be used to
mutate or reconcile records.

## Authorization, bounds and stability

The core-owned export route requires an active authenticated session. The
current product has one shared workspace, so every active role has the same
read scope; the projection inherits that actor scope. Exporters receive no
session, user object, cookie or request. Any later tenant or record-level read
policy must be enforced before core constructs this projection.

Core rejects projections above `EXPORT_PROJECTION_MAX_RECORDS` (default
20,000) before loading the nested snapshot. Export is intentionally atomic, so
oversized projections fail with a redacted `export_projection_too_large`
response instead of pagination that could mix versions. Exporter execution
still has the existing time and result-byte limits.

Arrays have explicit deterministic ordering, relationships use stable public
IDs, and the wrapper schema version is immutable. Compatible additive work
requires a new projection version; V1 fields cannot be removed or
reinterpreted. The contract exposes no Knex handle, table/column names, raw
source artifact, provider implementation, field-ownership internals, audit
metadata, actor data, route control or mutation capability.

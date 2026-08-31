# Candidate database migration strategy

This decision completes the planning part of `INVENTORY-04`. It covers only
public TechSiteManager candidate databases. It contains no private schema,
source mapping, deployment topology, or operational value.

## Recovery order

Implementation proceeds in dependency order. Each slice must include its
browser workflow and applicable API, persistence, authorization, concurrency,
offline, recovery, and fictional automated evidence before the next dependent
slice relies on it.

1. Complete site create/read/update/search and conflict handling.
2. Restore rooms and canonical racks, then devices, termination points, rack
   elevations, photo lifecycles, and distance reuse.
3. Restore the transactional work-package editor, child work-item behavior,
   handover evidence, completion locks, search, and generic exports.
4. Build the shared cable grid and endpoint model before fibre-, copper-, and
   DAC-specific behavior.
5. Add catalogue, consumables, BOM, user, PWA, offline, and operational
   workflows after their infrastructure and package dependencies are stable.
6. Accept private providers only through the published plugin contract, then
   complete migration rehearsal and release acceptance.

The detailed item order remains authoritative in
[`CORE_PLUGIN_RECOVERY_GUIDE.md`](CORE_PLUGIN_RECOVERY_GUIDE.md). A later item
may add non-blocking tests or design work, but it must not become a substitute
for the first incomplete dependency.

## Database states

Migration tooling must classify a database without modifying it:

- **Empty:** no application tables; install every published migration.
- **Recognized public candidate:** the migration ledger is a valid prefix of
  the immutable public migrations and the corresponding schema checks pass;
  apply only the remaining forward migrations.
- **Current:** every expected migration and schema check is present; make no
  data change.
- **Unknown, divergent, or partially applied:** stop before writes and report
  only sanitized structural diagnostics. Do not guess, drop, recreate, or
  silently coerce data.

The published `0001_generic_baseline.js` and
`0002_plugin_api_v2_extensions.js` migrations are immutable. New schema work
uses monotonically numbered, core-owned migrations. Plugins never add
migrations or access Knex.

## Forward-only bridge

Ordinary application startup may continue applying compatible additive core
migrations. A migration that transforms, rekeys, splits, merges, or removes
stored data requires a separately invoked bridge and cannot run implicitly at
startup. That bridge must:

1. preflight the migration ledger, schema invariants, SQLite integrity,
   foreign keys, available space, and application version without writes;
2. require a SQLite-safe backup outside the live data directory, verify its
   hash and integrity, and rehearse against a restored copy;
3. stop application writes and refuse a live database that still has active
   writers;
4. run in a transaction where SQLite permits it and use shadow tables or a
   staged replacement when a single transaction is not sufficient;
5. preserve public IDs, stable child/device keys, relationships, versions,
   photo bytes and metadata, import provenance and ownership, extension
   values, users, sessions, and audit history;
6. validate record counts, uniqueness, foreign keys, integrity, representative
   reads/writes, authorization, search, import provenance, and a new backup
   before promotion; and
7. leave the original database and verified backup unchanged until explicit
   promotion and rollback expiry.

Invalid candidate records cause a stopped bridge with bounded counts and field
categories, not record values. A correcting migration must make its policy
explicit and prove it with fictional fixtures. Destructive cleanup is a later,
separately approved migration after preserved data is no longer needed.

Browser IndexedDB is a separate durability boundary. A deployment that changes
queued operation or dirty-package formats must either replay all pending work
before maintenance or provide a forward-compatible client-store migration and
temporary-ID remap test. Server migration never treats unsynchronized browser
work as disposable.

## Evidence gate and rollback

Every migration receives fresh-install and recognized-prefix tests plus a
fictional populated-database rehearsal. Tests use throwaway directories and
assert integrity, foreign keys, stable identities, relationships, versions,
audit/provenance, backup/restore, and application startup. The release record
must identify the input migration prefix, core version, backup hash, rehearsal
result, migration result, and manual acceptance without recording private
values or paths.

Rollback is forward recovery: stop the new version, retain the failed database
for diagnosis, restore or re-promote the verified untouched pre-migration
copy, and run the previously pinned core version. Production rollback never
runs Knex `down` migrations. Down/up tests remain limited to disposable test
databases.

# Generic core implementation plan

This is the public-safe delivery checklist for the generic candidate. It
contains no source-system mappings, legacy schema knowledge, operational data,
or private repository details.

Checked boxes in this document record implemented technical foundations or a
specific historical verification activity. They do **not** assert a complete
browser workflow, frozen-product parity, formal approval, or production
readiness. The authoritative layer-by-layer status is
[`CORE_PARITY_INVENTORY.md`](CORE_PARITY_INVENTORY.md): 1 workflow is
missing, 12 are partial, and 21 are verified end to end. The recovery order and
acceptance gates are tracked in
[`CORE_PLUGIN_RECOVERY_GUIDE.md`](CORE_PLUGIN_RECOVERY_GUIDE.md).

## Repository construction and disclosure

- [x] Start from a new root commit with no inherited Git ancestry.
- [x] Keep the candidate and its remote private during the original
  implementation and evidence review.
- [x] Define and enforce the candidate source allowlist.
- [x] Use purpose-built generic fresh-install migrations rather than copied
  historical or deployment-specific bridge migrations.
- [x] Record a candidate-baseline tracked-file, package, secret, binary,
  dependency, licence, and container-layer review. Later candidate heads still
  require revalidation.
- [x] Verify the implementation baseline from a fresh private clone. This is
  historical construction evidence, not current release approval.

## Generic core

- [x] Model sites, rooms, racks, termination points, devices, work packages,
  work items, circuits, segments, distances, consumables, photos, users,
  sessions, audit, and import provenance.
- [x] Give linkable records stable opaque public identifiers.
- [x] Provide zero-plugin reads, package search, generic JSON/CSV exports,
  optimistic concurrency, authentication, role checks, and backup/restore.
- [x] Complete mutation validation, audit, entity existence checks, and
  optimistic-concurrency coverage across the generic routes.
- [x] Extend zero-plugin search across generic infrastructure and package child
  records.
- [x] Restore the transactional work-package graph editor, assignments,
  work-item and administrator completion, handover galleries, ranked search,
  complete generic/print exports, optimistic conflict recovery and durable
  package replay (`W09`–`W15`).
- [x] Restore the shared fibre, copper and DAC schedule grid, typed device/ODF
  endpoints, transactional rack correction, media-specific validation and
  durable conflict-aware replay (`W16`–`W23`).
- [x] Add login throttling without account-existence disclosure.
- [x] Add shell navigation and selected route-level authorization regression
  coverage. Complete browser interactions and the product-wide role/state
  matrix remain partial (`W01` and `W31` in the inventory); the isolated
  site workflow in `W02` is verified.

## Plugin and import contract

- [x] Load only explicitly configured CommonJS packages.
- [x] Validate manifests, compatibility, profiles, contribution identifiers,
  package roots, and duplicate registry identifiers before freezing the
  registry.
- [x] Support bounded providers, connectors, named transforms, strict YAML
  profiles, and bounded exporters without plugin routes or browser code.
- [x] Stage, validate, preview, reconcile, approve, and atomically apply
  imports with stable links and field ownership.
- [x] Preserve manual divergence and represent source absence without deleting
  core records.
- [x] Tighten configuration/contribution schemas and approval validation.
- [x] Expose required exporters through a bounded core-owned route.
- [x] Complete descriptor-driven controls for every supported input type.
- [x] Add Plugin API V2 data-only presentation profiles without plugin browser
  code, routes, migrations, or database handles.
- [x] Add core-owned typed extension persistence, optimistic writes, audit,
  package projection, and transactional V2 import reconciliation.
- [x] Preserve V1 package compatibility and require a V2-compatible core range
  for packages that contribute presentations.

## Offline and operations

- [x] Keep API traffic out of the service-worker cache.
- [x] Define IndexedDB stores for disposable caches, durable operations, dead
  letters, dirty packages, ID remaps, and pending logout. Package graphs and
  selected infrastructure workflows are connected; later workflow coverage
  remains incomplete.
- [x] Implement and unit-test generic FIFO replay, response classification,
  queued dependencies, dead letters, ID remaps, and pending-logout recovery.
  Product-wide offline durability remains partial (`W28`).
- [x] Provide SQLite-safe online backup, verified restore, and integrity tests.
- [x] Provide a checked-in zero-plugin, non-root, read-only-root-filesystem
  container baseline. This is deployment plumbing, not production acceptance.
- [x] Record container smoke, layer, and filesystem inspection for the
  evidence baseline; current operational acceptance remains partial (`W33`).

## Technical verification and approval status

- [x] The recorded baseline lint, syntax, unit/integration, bounded browser,
  disclosure, dependency-audit, and zero-plugin/fictional-plugin checks pass.
- [x] Add focused tests for the technical foundation claims above. These tests
  do not cover every browser workflow or acceptance state.
- [x] Run the repository technical verification matrix and record passed,
  failed, and skipped checks in `docs/RELEASE_READINESS.md`. This was not the
  14-flow product acceptance matrix in the recovery guide.
- [x] Push reviewable checkpoints to the candidate branch while it was
  private.
- [x] Record the owner-selected `Apache-2.0` outbound licence.
- [x] Record that the source repository became public at commit
  `5d98b43f349c8329df71b0c1a603782b0c4ff368` on 2026-08-29 at 08:40:53 UTC.
- [ ] Verify every critical browser workflow end to end. All `FLOW-*` items in
  the recovery guide remain unchecked.
- [ ] Complete candidate-data migration, private-provider differential, and
  operational recovery acceptance where applicable.
- [ ] Record formal technical, security, disclosure, organizational, and
  publication approvals if they are later completed; public visibility alone
  does not establish them.

## Generic visual foundation and regression coverage

- [x] Restore the project-owned visual tokens and shared responsive shell in
  the native-module browser architecture.
- [x] Apply generic layouts to available work-package, site, infrastructure,
  import, settings, loading, empty, error, and synchronization states. Layout
  coverage does not establish interaction completeness.
- [x] Preserve generic terminology and descriptor-driven zero-plugin/plugin
  behavior without plugin browser code.
- [x] Add fictional Playwright screenshot-regression coverage for selected
  desktop, tablet, mobile, dark/light, offline, and reconciliation states.
- [x] Implement project-style Home hierarchy, contextual navigation, sectioned
  package layouts, read-only rack previews, and import result actions while
  retaining generic terminology and server-only providers. Package interactions
  and cable interactions are now verified separately; the remaining pages are
  still governed by the inventory rather than screenshot presence.
- [x] Enforce deterministic perceptual-drift thresholds for Home and package
  details across phone portrait/landscape, tablet portrait/landscape, and
  desktop in both themes, plus the complete cable media/state matrix and
  selected desktop-only route captures. This remains bounded workflow evidence,
  not product-wide visual or behavioral parity (`W34`).

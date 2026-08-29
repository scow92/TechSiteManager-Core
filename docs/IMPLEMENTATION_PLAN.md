# Generic core implementation plan

This is the public-safe delivery checklist for the generic candidate. It
contains no source-system mappings, legacy schema knowledge, operational data,
or private repository details.

## Repository construction and disclosure

- [x] Start from a new root commit with no inherited Git ancestry.
- [x] Keep the candidate and its remote private during implementation.
- [x] Define and enforce the candidate source allowlist.
- [x] Use one generic fresh-install migration rather than historical
  migrations.
- [ ] Complete tracked-file, package, secret, binary, dependency, licence, and
  container-layer review.
- [ ] Verify the final branch from a fresh private clone.

## Generic core

- [x] Model sites, rooms, racks, termination points, devices, work packages,
  work items, circuits, segments, distances, consumables, photos, users,
  sessions, audit, and import provenance.
- [x] Give linkable records stable opaque public identifiers.
- [x] Provide zero-plugin reads, package search, generic JSON/CSV exports,
  optimistic concurrency, authentication, role checks, and backup/restore.
- [ ] Complete mutation validation, audit, entity existence checks, and
  optimistic-concurrency coverage across the generic routes.
- [x] Extend zero-plugin search across generic infrastructure and package child
  records.
- [x] Add login throttling without account-existence disclosure.
- [ ] Complete browser navigation and remaining authorization regression
  coverage.

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
- [ ] Tighten configuration/contribution schemas and approval validation.
- [ ] Expose required exporters through a bounded core-owned route.
- [ ] Complete descriptor-driven controls for every supported input type.

## Offline and operations

- [x] Keep API traffic out of the service-worker cache.
- [x] Use IndexedDB for disposable caches, durable operations, dead letters,
  dirty packages, and pending logout.
- [ ] Harden FIFO replay, response classification, queued dependencies, and
  pending-logout recovery.
- [x] Provide SQLite-safe online backup, verified restore, and integrity tests.
- [x] Provide a zero-plugin, non-root, read-only-container deployment.
- [ ] Complete container smoke, layer, and filesystem inspection.

## Acceptance

- [x] Baseline lint, syntax, unit/integration, browser, disclosure, dependency
  audit, and zero-plugin/fictional-plugin paths pass.
- [ ] Add focused tests for every item completed above.
- [ ] Run the complete acceptance matrix and record passed, failed, and skipped
  checks in `docs/RELEASE_READINESS.md`.
- [ ] Push reviewable checkpoints to the private candidate branch.
- [ ] Stop before publication until an outbound licence and explicit human
  publication approval exist.

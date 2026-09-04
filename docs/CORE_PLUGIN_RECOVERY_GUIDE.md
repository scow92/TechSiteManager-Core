# Core and plugin recovery working guide

This is the operational implementation checklist for making the public
TechSiteManager core a complete, usable application while keeping private
source interpretation in approved server-side plugins.

Point Codex to this file at the beginning of each task. Update it in the same
pull request as completed work so the first actionable unchecked item remains
clear.

## Authoritative decision

The original private TechSiteManager repository is frozen at commit
`4bc778e9e948bde4389c73b7b47553ea66146227`, the final commit in pull request
23. It is a read-only product reference. No migration, plugin, documentation,
deployment, or application work belongs in that repository after the freeze.

This public core repository owns all new generic application work. The private
plugin repository owns approved private parsers, mappings and source-shaped
exporters. A separate private deployment repository eventually pins and
combines immutable core and plugin releases.

The current public core has useful persistence, API, import and plugin
foundations, but it is not functionally equivalent to the frozen product.
Backend tables, routes, generic forms, similar styling, or a successful import
do not establish product parity.

## Start every Codex task here

1. Read `AGENTS.md`, this guide, `docs/PLUGINS.md`,
   `docs/IMPORT_PROVIDER_API.md`, and the relevant implementation files.
2. Inspect `git status --short --branch` before fetching or switching. Preserve
   user changes and use a short-lived task branch.
3. Select only the first actionable unchecked item whose dependencies are
   complete. Do not substitute a simpler generic feature for the specified
   workflow.
4. State the affected parity surface, test plan, data/migration impact and
   rollback before editing.
5. Implement the complete path: browser interaction, API, validation,
   transaction, persistence, authorization, concurrency, offline behavior,
   import/export and tests as applicable.
6. Record the commit or pull request and exact evidence before checking an item
   off. Report skipped checks explicitly.

Reusable prompt:

> Read `AGENTS.md` and `docs/CORE_PLUGIN_RECOVERY_GUIDE.md`. Work only on the
> first actionable unchecked item. The private original is frozen at
> `4bc778e9`; use it only as the golden reference. Preserve complete workflows,
> keep private interpretation in plugins, update the checklist with evidence,
> and stop rather than claiming partial API or visual work as parity.

## Ownership boundary

| Owner | Required responsibilities | Prohibited responsibilities |
| --- | --- | --- |
| Public core | Complete UI and domain workflows, generic schema, validation, routes, transactions, authorization, audit, concurrency, offline queues, backup/recovery, plugin contracts and generic renderers | Private source mappings, company data, private fixtures, credentials or deployment topology |
| Private plugin | Bounded source acquisition, parsing, mappings, profiles, transforms and source-shaped export through the public contract | Browser scripts, HTML/CSS, routes, migrations, Express, Knex, sessions, direct persistence or replacement application UI |
| Private deployment | Exact core/plugin pins, integrity data, secret references, image composition, runbooks, monitoring and rollback | A source fork or unreviewed application implementation |
| Frozen original | Read-only golden behavior, workflow and differential reference | New commits or use as the migration worktree |

Core must implement a useful feature even when no plugin is installed. A plugin
may change bounded terminology, field declarations and source interpretation;
it cannot supply missing executable behavior.

## Evidence and status rules

- `[ ]` means incomplete, including partially implemented work.
- `[x]` requires a commit or PR plus exact automated and manual evidence.
- A parent phase remains incomplete until every required child passes.
- Tests must use fictional public data. Private differential fixtures and
  reports stay in approved private repositories or environments.
- Intentional golden differences require an explicit reason, owner and
  acceptance test. There is no general visual or behavioral tolerance.
- Screenshot similarity is supporting evidence only. Verify interaction,
  persistence, reload, permissions, error states and offline behavior.

## Current position

- [x] **BASE-01** Create this repository with independent, public-safe history.
  Evidence: repository history and publication review tooling.
- [x] **BASE-02** Implement generic persistence, authentication, core API,
  import staging/reconciliation and Plugin API V1/V2 foundations.
  Evidence: existing server contract, route and plugin tests.
- [x] **BASE-03** Implement a generic responsive shell and data-only
  presentation renderer.
  Evidence: existing browser and visual tests. This does not establish product
  parity.
- [x] **BASE-04** Replace the existing completion claims with an evidence-based
  capability inventory covering every workflow below.
  Evidence: `e108e1c` adds the 34-workflow inventory and `ed1fdf6` qualifies
  the plan, visual, release and readiness claims against it.
- [ ] **BASE-05** Record formal technical, security, disclosure,
  organizational and product approval. Public visibility is not approval.

## Current next action

Phases 1 through 5 and **PLUGIN-01** through **PLUGIN-02** are complete. The
next item is **PLUGIN-03**. Differentially compare pasted-content parsing,
security, normalization, preview and apply against the frozen behavior using
approved private fixtures.

### Phase 1 — Establish the public-safe parity inventory

- [x] **INVENTORY-01** Build a public-safe matrix mapping every frozen product
  workflow to its current core UI, API, persistence, offline and test coverage.
  Record `missing`, `partial`, or `verified`; never include private values.
  Evidence: `e108e1c` adds `docs/CORE_PARITY_INVENTORY.md`, mapping 34 detailed
  workflows and all 14 acceptance flows to exact frozen and current files/tests;
  it records 6 missing, 28 partial and 0 verified end-to-end workflows.
- [x] **INVENTORY-02** Replace or qualify checked claims in
  `docs/IMPLEMENTATION_PLAN.md`, `docs/VISUAL_PARITY.md` and release-readiness
  documents when they cover only styling, schema or API presence.
  Evidence: `ed1fdf6` distinguishes implemented technical foundations, partial
  browser workflows, verified end-to-end parity, and formal approval/production
  readiness across the plan, visual, release, deployment, publication,
  allowlist, licensing, and top-level status documents; each product-status
  claim points to `docs/CORE_PARITY_INVENTORY.md`.
- [x] **INVENTORY-03** Add failing fictional browser contract tests for the
  first missing workflow slice before implementing it.
  Evidence: `48bf45f` adds the isolated `npm run test:contract:site` suite. Its
  three fictional browser cases fail at the intentionally absent site edit,
  scoped stale-conflict and explicit viewer read-only interactions; the green
  release suite remains unchanged until `CORE-SITE-01` implements them.
- [x] **INVENTORY-04** Agree the implementation order and migration strategy
  for existing candidate databases. Do not silently discard candidate data.
  Evidence: `48bf45f` adds `docs/CANDIDATE_DATABASE_MIGRATION_STRATEGY.md`,
  fixing the dependency order, recognized database states, immutable published
  migrations, forward-only bridge, backup/rehearsal gates, browser-durability
  boundary and restore-based rollback.

### Phase 2 — Restore complete site infrastructure workflows

- [x] **CORE-SITE-01** Provide complete site create, read, update, search and
  optimistic-conflict workflows with admin/engineer/viewer behavior.
  Evidence: `f8b7ca0` adds the browser editor/read-only states, retained and
  resolvable stale drafts, idempotent optimistic retry, durable coalesced site
  updates, scoped offline conflict review and five green fictional browser
  contract cases. All required core, browser, visual, disclosure, licence and
  package checks passed; no server database migration was required.
- [x] **CORE-RACK-01** Add and edit canonical racks from the browser, including
  room ownership, default height, suite-line inference/confirmation, duplicate
  handling, concurrency and offline replay.
  Evidence: `d590638` adds room/rack create, edit and guarded delete; unique
  room-scoped labels; 47U default; suite inference/confirmation; optimistic
  conflict recovery; durable temporary-ID replay; and passing API/browser
  duplicate and offline contracts.
- [x] **CORE-RACK-02** Implement usable front and rear rack elevations with
  add, move, resize and remove device interactions while preserving stable
  device keys.
  Evidence: `d590638` adds bounded placement/collision validation and writer
  interactions for both faces; the browser contract proves add and move while
  the API contract proves overlap rejection, rear placement and stable keys;
  `3cb4162` extends the browser proof through resize and removal.
- [x] **CORE-RACK-03** Implement rack and per-device photo upload, metadata,
  current/history viewing, content retrieval, replacement and deletion with
  type, size, role and backup coverage.
  Evidence: `d590638` adds rack/device galleries, 10MB JPEG/PNG/WebP bounds,
  current/history replacement, optimistic deletion, viewer enforcement and
  backup/restore byte preservation; `3cb4162` explicitly covers device photos
  and rejected media types/sizes in addition to the browser rack lifecycle.
- [x] **CORE-ODF-01** Implement canonical termination-point/ODF create, edit,
  delete and relationship validation, including tray and fibre positions needed
  by schedules.
  Evidence: `d590638` adds termination-point and tray/position create, edit and
  delete, capacity and uniqueness validation, relationship-safe shrink rules,
  database triggers, UI workflows and recovery coverage.
- [x] **CORE-DEVICE-01** Implement the site device directory and canonical
  lowercase hostname/location behavior across schedules and racks.
  Evidence: `d590638` adds canonical room/rack device maintenance, lowercase
  hostnames, immutable keys, schedule endpoint suggestions from the site
  directory and browser/API location checks.
- [x] **CORE-DIST-01** Implement equipment-pair distance history, rack fallback,
  suggestions and the interactive distance calculator.
  Evidence: `d590638` adds structured device/rack pair history, exact-device
  and rack fallback matching, media scoping, max-observed suggestions and the
  interactive record/suggest workflow with API and browser coverage.

### Phase 3 — Restore complete work-package workflows

- [x] **CORE-PACK-01** Implement an in-memory transactional pack editor for
  metadata, work items, circuits, nested segments and per-package requirements,
  with stable child identity and debounced saving.
  Evidence: `e96ce08` adds the live package graph, 550ms durable/coalesced save,
  atomic optimistic snapshot API, stable client identities, idempotent receipts
  and rollback tests; the first T14 browser case and Phase 3 T2 route case pass.
- [x] **CORE-PACK-02** Preserve live nested object references after successful
  saves and retain the navigation `flushAll` barrier.
  Evidence: `e96ce08` merges canonical responses into existing package/item/
  circuit/segment/requirement objects, gates route changes and sign-out, and
  passes T14 live-reference, offline replay and explicit conflict-rebase cases.
- [x] **CORE-WORK-01** Implement full tabbed child work-item editing,
  completion/clear-completion and assignment behavior.
  Evidence: `e96ce08` adds tabbed item add/edit/remove, lead and multi-assignee
  fields, explicit completion/clear actions, actor/time evidence and frozen
  completed items; T2/T12/T14 cover writer, administrator and viewer states.
- [x] **CORE-HANDOVER-01** Implement package/work-item handover photo upload,
  naming, comments, gallery viewing and deletion with completion and role rules.
  Evidence: `e96ce08` adds bounded package/item galleries and online-only binary
  create/read/content/update/delete with optimistic metadata, role and completion
  locks; T11 restores both owners' bytes and T14 passes the browser lifecycle.
- [x] **CORE-COMPLETE-01** Implement administrator-controlled package
  completion, mutation locks and reopening across UI, API and offline paths.
  Evidence: `e96ce08` requires the admin completion/reopen routes, records
  actor/time, freezes core/import/extension/handover mutations in API and SQLite,
  and retains rejected offline work as a dead letter; T2/T11/T12/T14 pass.
- [x] **CORE-SEARCH-01** Match frozen search behavior for sites, package
  references, linked work items, projects and active/completed grouping.
  Evidence: `e96ce08` adds exact-match ranking, linked item context and explicit
  active/completed/infrastructure browser groups; T2 and T14 cover package,
  project and work-item matches plus completion grouping.
- [x] **CORE-EXPORT-01** Provide complete generic pack and print/PDF exports;
  keep source-shaped exporters in private plugins.
  Evidence: `e96ce08` expands formula-safe CSV and JSON to the complete generic
  graph, adds an escaped authenticated print/save-PDF document with handover
  evidence, retains bounded plugin exporters and passes T2/T9/T12/T14.

### Phase 4 — Restore usable cable schedules

- [x] **CORE-CABLE-01** Implement the full editable grid renderer shared by
  fibre, copper and DAC pages rather than generic circuit/segment cards.
  Evidence: `f65947c` adds the core-owned native-module schedule grid and
  mandatory zero-plugin Fibre, Copper and DAC package sections; T15 passes.
- [x] **CORE-CABLE-02** Restore row creation, deletion, field helpers, fill
  behavior, direct editing, debounced save, errors, conflict handling and
  reload without detaching live inputs.
  Evidence: `f65947c` connects row operations to the transactional durable
  package graph, preserves live identities, and passes T14/T15 reload, replay,
  keyboard, fill-down, debounce and stale-conflict cases.
- [x] **CORE-CABLE-03** Implement device and ODF endpoint modes, correct port
  controls, chained ODF hops and relationship validation.
  Evidence: `f65947c` adds typed device/ODF identities and ports, site-scoped
  validation and adjacent-hop continuity in UI, API and SQLite; T2/T11/T15 pass.
- [x] **CORE-CABLE-04** Implement endpoint room/rack autofill, transactional
  rack creation, committed rack corrections and canonical-reference updates.
  Evidence: `f65947c` derives canonical locations, applies existing/new rack
  corrections in the package transaction, refreshes references, reuses distance
  suggestions and passes rollback, conflict, audit and browser cases in T2/T15.
- [x] **CORE-FIBRE-01** Restore fibre-specific connector, type, mode, simplex,
  stock-length and item-type behavior.
  Evidence: `f65947c` persists and validates fibre fields, supplies stock and
  ODF helpers, exports them generically and passes API/browser/recovery evidence.
- [x] **CORE-COPPER-01** Restore copper-specific fields and row behavior.
  Evidence: `f65947c` adds category, shielding and pinout controls and validation
  with transactional persistence, offline replay and T2/T15 coverage.
- [x] **CORE-DAC-01** Restore DAC-specific fields, direction and media behavior.
  Evidence: `f65947c` adds bounded connector/media/direction fields and reverse
  behavior with matching-connector validation and T2/T15 coverage.
- [x] **CORE-CABLE-05** Verify desktop, iPad, phone, keyboard, pointer, light,
  dark, print, viewer, completed and offline states for all three schedules.
  Evidence: `f65947c` adds three T15 interaction/state journeys and expands T12
  to a 61-capture cable matrix; both pass with manual desktop, phone and print
  review, and the complete release verification passes.

### Phase 5 — Restore materials, catalogue and operational workflows

- [x] **CORE-CONS-01** Implement shared consumables catalogue administration
  and per-package required quantities without conflating them.
  Evidence: `e7a9609` adds concurrent admin catalogue CRUD, package selectors,
  independent quantity clearing, in-use delete protection and dependent
  temporary-ID replay, covered by T2/T6/T16/T17.
- [x] **CORE-BOM-01** Implement fibre SKU catalogue administration, exact
  matching, next-up lengths, simplex counts, totals, unmatched reasons and
  spreadsheet export.
  Evidence: `e7a9609` adds the constrained SKU catalogue and deterministic
  exact/shortest-next matcher with simplex quantities, grouped totals, explicit
  failure reasons and formula-safe CSV, covered by T16/T17 and recovery.
- [x] **CORE-USERS-01** Restore account request, approval, roles, engineer
  profiles, exact assignment matching and workload views.
  Evidence: `e7a9609` adds request/approval lifecycle, profile concurrency,
  exact whole-value assignment matching and team/self workload views while
  preserving four-role authorization, session revocation and audit in T16/T17.
- [x] **CORE-PWA-01** Restore same-user navigation/viewport resumption, shell
  caching, notification setup and sign-out subscription behavior.
  Evidence: `e7a9609` adds user-scoped IndexedDB route/scroll state, exact shell
  cache v15, bounded push handling and user-owned subscription deletion on
  disable/logout; T7/T16/T17 cover same/cross-user restore and lifecycle rules.
- [x] **CORE-OFFLINE-01** Complete durable dirty-pack and infrastructure
  operation queues, FIFO replay, temporary-ID remapping, scoped conflicts,
  dead letters, pending logout and no-silent-loss testing.
  Evidence: `e7a9609` connects termination positions and material/profile
  mutations to the durable queue, remaps raw and URL-encoded IDs inside dirty
  package snapshots, and passes T6/T7/T13–T17 no-loss/conflict/dead-letter cases.
- [x] **CORE-OPS-01** Verify non-root/read-only containers, graceful shutdown,
  health checks, encrypted backups, isolated restore and backup-age monitoring.
  Evidence: `e7a9609` adds database/backup-age health, bounded connection
  draining, AES-256-GCM SQLite-safe backups, protected-key enforcement and
  isolated authenticated restore; T11/T16 and a real non-root, read-only,
  capability-free zero-plugin container smoke pass.

### Phase 6 — Accept private providers without changing the product

- [x] **PLUGIN-01** Pin an exact private package version and supported core
  range; verify zero-plugin and required-plugin startup independently.
  Evidence: the approved private integration record pins the `v1.2.0-rc.1`
  core candidate, its packed integrity and an exact private package version;
  its disposable integration run verifies both independent startup modes
  without changing public core behavior. Private package identifiers and
  integrity records remain in the private integration and deployment scopes.
- [x] **PLUGIN-02** Differentially compare Work Request parsing, normalization,
  identity, reconciliation, apply, search and export against the frozen
  behavior using approved private fixtures.
  Evidence: `8c745e5` and `bb7e929` add the bounded, read-only export projection
  required by the frozen workbook contracts without exposing private mappings;
  the approved private evidence record compares generated fixtures across
  parsing, normalization, stable identity, atomic reconciliation/apply,
  reimport, manual-edit protection, absence, search and three export contracts.
  The exact packed-core integration and all public-core release checks pass.
- [ ] **PLUGIN-03** Differentially compare pasted-content parsing, security,
  normalization, preview and apply against the frozen behavior.
- [ ] **PLUGIN-04** Verify failed, cancelled, malformed, stale, ambiguous and
  rejected imports create no blank or partial records and retain no raw source.
- [ ] **PLUGIN-05** Verify installed plugins do not change any core workflow,
  route, permission, offline behavior or rendered interaction except an
  explicitly accepted private contribution.
- [ ] **PLUGIN-06** Run the private supported-core matrix and record immutable
  package, profile, exporter and combined-image hashes.

### Phase 7 — Migration and release acceptance

- [ ] **MIGRATE-01** Design a forward-only, reviewed bridge for candidate and
  approved legacy data. Rehearse only against restored copies.
- [ ] **MIGRATE-02** Preserve record relationships, stable device/child keys,
  photos, imported identity/provenance, ownership, versions, audit and durable
  offline work.
- [ ] **ACCEPT-01** Pass every critical workflow below with zero plugins using
  fictional data.
- [ ] **ACCEPT-02** Pass every critical workflow below with first-party plugins
  in the private integration environment.
- [ ] **ACCEPT-03** Complete exact golden workflow and screenshot comparisons at
  matching data, state, role, theme and viewport. Explain every difference.
- [ ] **ACCEPT-04** Complete security, disclosure, dependency, licence,
  package-content, container-layer, migration, backup and restore review.
- [ ] **ACCEPT-05** Obtain formal product, technical, security, disclosure and
  operational approval before calling the core production-ready.
- [ ] **CUTOVER-01** Rehearse and approve a versioned deployment/rollback
  runbook, then cut over immutable core and plugin versions through the private
  deployment repository.

## Critical workflow acceptance matrix

- [ ] **FLOW-01** Home, search, navigation context and reload/PWA resumption.
- [ ] **FLOW-02** Site, room, rack, ODF and device creation/editing.
- [ ] **FLOW-03** Front/rear rack elevation device editing and stable identity.
- [ ] **FLOW-04** Rack, device and handover photo lifecycle and recovery.
- [ ] **FLOW-05** Work-package details, assignments, work items and completion.
- [ ] **FLOW-06** Fibre cable schedule including ODF hops and fibre side effects.
- [ ] **FLOW-07** Copper and DAC schedule-specific editing behavior.
- [ ] **FLOW-08** Schedule-driven rack creation/correction and distance reuse.
- [ ] **FLOW-09** Consumables, fibre catalogue, BOM and exports.
- [ ] **FLOW-10** Work Request and pasted-content imports, reconciliation,
  retry, reimport, provenance, search and source-shaped export.
- [ ] **FLOW-11** Admin, manager, engineer and viewer permissions; account
  approval, workload, concurrency, completion locks and safe errors.
- [ ] **FLOW-12** Offline edit durability, replay, conflicts, dead letters,
  logout, notifications and reconnection.
- [ ] **FLOW-13** Fresh install, database bridge, backup, restore, container,
  shutdown, health and monitoring.
- [ ] **FLOW-14** Desktop, tablet, phone, light, dark and print rendering for
  every applicable state above.

The flow boxes represent final end-to-end acceptance. Do not check them merely
because a lower-level implementation item is complete.

## Required checks

Run focused tests during development. Before a core contract or acceptance
commit, run:

```bash
npm ci
npm run lint
npm run syntax
npm run typecheck
npm test
npm run test:e2e
npm run test:visual
npm run scan:public
npm run scan:history
npm run review:licenses
npm run review:package
```

Migration and deployment changes also require recovery tests, image build,
container smoke, non-root/read-only filesystem checks and restored-database
startup. Never test against the only operational database.

## Stop conditions

Stop and report rather than improvising when:

- a task would write to the frozen original repository;
- a plugin would need browser code, routes, migrations, Express, Knex or direct
  persistence;
- a core feature exists only as a table/API with no usable browser workflow;
- a screenshot test measures style but not the corresponding interaction;
- private data, mappings, paths, topology or source-derived fixtures would
  enter this repository;
- a migration or deployment lacks a verified backup, isolated restore and
  rollback;
- an unexplained golden differential remains;
- user work overlaps the files or branch needed for a change.

## Per-change handoff

Record the following in the pull request and add a concise row below:

```text
Checklist item:
Branch:
Commit/PR:
Core behavior changed:
Focused checks:
Full checks:
Skipped checks and reason:
Migration/backup impact:
Deployment/rollback impact:
Manual evidence:
Next unchecked item:
```

## Progress log

| Date | Item | Commit or PR | Evidence | Next action |
| --- | --- | --- | --- | --- |
| 2026-08-31 | Recovery decision | `6de4834` | Frozen original fixed at PR 23 commit `4bc778e9`; incomplete core parity acknowledged | INVENTORY-01 |
| 2026-08-31 | INVENTORY-01 | `e108e1c` | Public-safe 34-workflow UI/API/persistence/offline/test matrix plus all 14 acceptance-flow roll-ups in `docs/CORE_PARITY_INVENTORY.md` | INVENTORY-02 |
| 2026-08-31 | INVENTORY-02 | `ed1fdf6` | Qualified plan, visual, release, deployment, publication, allowlist, licensing and top-level status claims against `docs/CORE_PARITY_INVENTORY.md`; 6 missing, 28 partial and 0 verified end-to-end workflows remain | INVENTORY-03 |
| 2026-08-31 | INVENTORY-03 | `48bf45f` | Isolated fictional site browser contract executes three expected-red cases for edit persistence, stale-conflict retention and viewer read-only behavior without weakening the green suite | INVENTORY-04 |
| 2026-08-31 | INVENTORY-04 | `48bf45f` | Public candidate database states, forward-only preservation bridge, recovery order, evidence gates and restore-based rollback are fixed in `docs/CANDIDATE_DATABASE_MIGRATION_STRATEGY.md` | CORE-SITE-01 |
| 2026-08-31 | CORE-SITE-01 | `f8b7ca0` | Five-case site contract passes edit persistence, viewer state, online conflicts, durable/coalesced replay and offline conflict review; full unit, e2e, visual, disclosure, history, licence and package checks pass; IndexedDB advances to v3 with no server migration | CORE-RACK-01 |
| 2026-08-31 | Phase 2 (`CORE-RACK-01`–`CORE-DIST-01`) | `d590638`, `3cb4162` | 72 unit/route/recovery tests and all 7 site browser contracts pass; zero-plugin/plugin e2e and refreshed visual comparisons pass; disclosure/history, licence and package reviews pass; migration `0003` preserves constraints and survives down/up, backup/restore, non-root read-only image smoke and restored-database startup | CORE-PACK-01 |
| 2026-08-31 | Phase 3 (`CORE-PACK-01`–`CORE-EXPORT-01`) | `e96ce08` | 76 unit/route/recovery tests, all 4 package and 7 site browser contracts, zero-plugin/plugin e2e, and the expanded handover/completed/print visual matrix pass; disclosure/history, licence and 127-file package reviews pass; migration `0004` preserves pre-Phase-3 package/child rows and completion state through upgrade/down/up and backup/restore; the restored database starts under the non-root read-only/no-capability container | CORE-CABLE-01 |
| 2026-09-04 | Phase 4 (`CORE-CABLE-01`–`CORE-CABLE-05`) | `f65947c` | 78 unit/route/recovery tests, all 3 cable, 4 package and 7 site browser contracts, zero-plugin/plugin e2e, and the 61-capture visual matrix pass; disclosure/history, licence and 131-file package reviews pass; migration `0005` preserves legacy and typed schedule rows through upgrade/down/up and backup/restore; the restored database starts under the non-root read-only/no-capability container | CORE-CONS-01 |
| 2026-09-04 | Phase 5 (`CORE-CONS-01`–`CORE-OPS-01`) | `e7a9609` | 89 unit/route/recovery tests, the Phase 5 browser journey plus all 3 cable, 4 package and 7 site browser contracts, zero-plugin/plugin e2e, and the 65-capture visual matrix pass; disclosure/history, licence and 138-file package reviews pass; migration `0006` preserves earlier users and Phase 5 rows through upgrade/down/up and encrypted backup/restore; a real zero-plugin image passes non-root, read-only, no-capability health/startup | PLUGIN-01 |
| 2026-09-04 | PLUGIN-01 | Private integration evidence record | The exact `v1.2.0-rc.1` core candidate and packed integrity are pinned with an exact private package version and supported range; disposable required-plugin and zero-plugin startup runs pass independently. Private package identifiers and hashes remain outside this public repository. Core behavior and migrations are unchanged. | PLUGIN-02 |
| 2026-09-04 | PLUGIN-02 | `8c745e5`, `bb7e929`; private integration evidence record | A bounded read-only export projection closes the generic core contract gap; generated private fixtures match frozen Work Request parsing, normalization, identity, atomic reconciliation/apply, idempotent reimport, manual-edit protection, recoverable absence, search and source-shaped/legacy export behavior. The exact packed integration, 93 core tests, E2E/visual suites, disclosure/history scans, licence review and package review pass. No migration is required. | PLUGIN-03 |

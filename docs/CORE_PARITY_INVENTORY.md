# Core parity inventory

This inventory is the evidence record for `INVENTORY-01`. It compares the
public core through `e7a9609` with the frozen product workflow at
`4bc778e9e948bde4389c73b7b47553ea66146227`. The frozen repository was inspected
with read-only Git commands. No source data, source-derived mappings,
operational values, private paths, or deployment topology are reproduced here.

The inventory measures complete workflows, not the presence of a similarly
named table, route, form, or screenshot. All examples and automated evidence
in the public core use fictional data.

## Status method

- **verified** — the current layer implements the frozen workflow slice and
  targeted automated evidence exercises its success and material failure
  states.
- **partial** — a relevant foundation or usable subset exists, but at least one
  required interaction, rule, state, or targeted test is absent.
- **missing** — no usable implementation of that workflow slice exists in the
  layer. A generic field or otherwise unused table does not raise this status.

The five layer columns are independent. For example, a persistence layer can
be partial while its browser workflow is missing. The overall status is never
higher than the weakest layer required by the workflow. A test is partial when
it proves only a lower-level contract or a visual state rather than the frozen
interaction.

## Evidence index

### Frozen workflow references

These paths are references at frozen commit `4bc778e9`; they are not files to
copy into the public repository.

| ID | Frozen workflow evidence |
| --- | --- |
| G1 | `index.html`; `js/app.js`; `js/views/home.js`; `server/test/home-site-search.test.js` — hierarchical navigation, home search, grouping and context. |
| G2 | `js/views/sites.js`; `server/routes/sites.js`; `server/test/atomic-concurrency.test.js` — site create/edit/delete and concurrency. |
| G3 | `js/views/rack.js`; `server/routes/racks.js`; `server/test/rack-suite.test.js` — canonical racks, suite-line confirmation and elevations. |
| G4 | `js/views/rack.js`; `server/routes/racks.js`; `server/test/routes.test.js` — rack and stable-device-key photo history. |
| G5 | `js/views/odf.js`; `server/routes/odfs.js`; `js/views/cable.js` — ODF records and schedule terminations. |
| G6 | `js/views/devices.js`; `server/routes/sites.js`; `server/test/device-names.test.js` — canonical device directory and hostname rules. |
| G7 | `js/views/distances.js`; `server/routes/sites.js`; `server/test/distance-matching.test.js` — distance history, fallback, suggestions and calculator. |
| G8 | `js/views/details.js`; `js/store.js`; `server/lib/pack.js`; `server/test/pack-version.test.js` — transactional pack editing, debounced saves and conflicts. |
| G9 | `js/views/work-orders.js`; `js/views/handover.js`; `server/routes/jobs.js`; `server/test/work-orders-pack.test.js` — tabbed work records, completion and handover evidence. |
| G10 | `js/views/details.js`; `server/routes/jobs.js`; `server/test/work-request-completion-lock.test.js` — administrator completion, locking and reopening. |
| G11 | `js/views/home.js`; `server/routes/jobs.js`; `server/test/home-site-search.test.js` — product search and active/completed grouping. |
| G12 | `js/export.js`; `js/views/details.js`; `js/views/bom.js`; `server/test/spreadsheet-roundtrip.test.js` — pack, print and material exports. |
| G13 | `js/views/cable.js`; `js/cable-locations.js`; `server/test/cable-locations.test.js`; `server/test/schedule-racks.test.js` — editable fibre, copper and DAC schedules. |
| G14 | `js/views/consumables.js`; `js/views/settings.js`; `server/routes/settings.js` — shared catalogue and per-package quantities. |
| G15 | `js/views/bom.js`; `server/lib/bom.js`; `server/routes/skus.js`; `server/test/bom.test.js` — fibre catalogue, matching, totals and export. |
| G16 | `js/auth.js`; `js/views/settings.js`; `js/views/home.js`; `server/routes/auth.js`; `server/routes/engineers.js` — requests, approvals, profiles, assignments and workload. |
| G17 | `js/idb.js`; `js/offline.js`; `js/store.js`; `js/app.js`; `sw.js`; `server/test/e2e/offline-integrity.playwright.js` — resumption and durable offline behavior. |
| G18 | `js/import.js`; `js/confluence.js`; `js/views/import.js`; `server/test/atomic-import.test.js`; `server/test/wr-diff.test.js` — source import, preview, reconciliation and retry. |
| G19 | `Dockerfile`; `docker-compose.yml`; `server/lib/backup.js`; `server/test/deployment-recovery.test.js` — install, container and recovery operations. |
| G20 | `css/styles.css`; `server/test/e2e/smoke.playwright.js`; `server/test/e2e/rack-overview.playwright.js` — viewport, theme, input and print states. |

### Current implementation references

| ID | Current core evidence |
| --- | --- |
| U1 | `public/index.html`; `public/js/main.js` — native-module shell, hash routing, context selectors and theme. |
| U2 | `public/js/views/home.js` — site/package search, creation and active/completed lists. |
| U3 | `public/js/views/sites.js`; `public/js/views/infrastructure.js` — site editing/conflict recovery plus room, rack/elevation, photo, ODF, device and distance workflows with explicit role and offline states. |
| U4 | `public/js/views/work-package.js`; `public/js/work-package-store.js` — transactional package graph editing, assignments, completion, handover, exports, live-reference merging, conflicts and debounced durable saves. |
| U5 | `public/js/presentation.js` — core-owned record, child-tab, connection-table, requirement and material renderers. |
| U6 | `public/js/views/import.js`; `public/js/import/descriptors.js`; `public/js/import/reconciliation.js` — provider inputs, preview, decisions and apply. |
| U7 | `public/js/auth.js`; `public/js/views/settings.js`; `public/js/views/home.js` — account request/approval, profile, role-aware workload, catalogue administration, notification setup and appearance workflows. |
| U8 | `public/js/views/cable-schedule.js`; `public/js/views/work-package.js`; `public/js/work-package-store.js` — shared fibre/copper/DAC grid, typed endpoints, media helpers, transactional rack correction, distance reuse, conflict handling and durable editing. |
| U9 | `public/js/pwa.js`; `public/js/main.js`; `public/js/views/work-package.js` — user-scoped route/viewport resumption, subscription lifecycle and core-owned BOM/CSV presentation. |
| A1 | `server/routes/core.js` — generic infrastructure, package, child, search, export, catalogue and photo routes. |
| A2 | `server/routes/auth.js`; `server/lib/auth.js` — setup, login/logout, requests/approval, four roles, profiles, exact workload matching and user-owned push subscriptions. |
| A3 | `server/routes/imports.js`; `server/imports/service.js`; `server/imports/reconcile.js` — validated drafts, reconciliation, apply and provenance. |
| A4 | `server/routes/presentations.js`; `server/plugins/export-service.js`; `server/plugins/presentations.js` — typed extension writes and bounded presentation/export contributions. |
| A5 | `server/app.js`; `server/server.js` — security middleware, database/backup-age health and bounded graceful signal handling. |
| A6 | `server/routes/materials.js`; `server/lib/bom.js` — concurrent consumable/fibre-SKU administration and deterministic exact/next-up BOM calculation/export. |
| D1 | `server/db/migrations/0001_generic_baseline.js` — generic users, infrastructure, packages, children, materials, distances, photos, imports and audit. |
| D2 | `server/db/migrations/0002_plugin_api_v2_extensions.js` — plugin-scoped typed extension values. |
| D3 | `server/db/migrations/0003_phase2_infrastructure.js` — rack confirmation, ODF positions, canonical device locations, structured distance pairs and current photo history. |
| D4 | `server/db/migrations/0004_phase3_work_packages.js` — assignments, completion evidence, idempotent package-save receipts and database mutation locks with legacy completion preservation. |
| D5 | `server/db/migrations/0005_phase4_cable_schedules.js` — typed device/ODF endpoints, canonical locations and bounded fibre/copper/DAC segment fields with database guards and legacy-row compatibility. |
| D6 | `server/db/migrations/0006_phase5_operations.js` — preserved account lifecycle/profile data, user-owned push subscriptions and constrained fibre SKU catalogue. |
| O1 | `public/js/api.js`; `public/js/idb.js`; `public/js/offline.js`; `public/js/offline-ui.js`; `public/js/work-package-store.js`; `public/js/views/infrastructure.js`; `public/js/views/settings.js` — cached reads, durable/coalesced package/catalogue/profile/infrastructure drafts, operation/dead-letter stores, FIFO replay, dependent ID remaps, scoped conflicts and pending logout. |
| O2 | `public/sw.js`; `public/manifest.json`; `public/js/pwa.js` — exact versioned shell caching, install metadata, bounded push handling and user-scoped navigation state. |
| R1 | `server/lib/backup.js`; `server/scripts/backup.js`; `server/scripts/restore.js`; `docs/BACKUP_AND_RESTORE.md` — SQLite-safe encrypted backup, atomic age status and isolated authenticated restore. |
| R2 | `Dockerfile`; `docker-compose.yml`; `docs/DEPLOYMENT.md` — non-root image, read-only root filesystem example and health check. |

### Current automated-test references

Test labels below include the exact test title when the file uses Node's test
runner. Playwright scripts are identified by their emitted journey or capture
group.

| ID | Current automated evidence |
| --- | --- |
| T1 | `server/test/core-routes.test.js` — generic infrastructure/concurrency cases plus `Phase 2 infrastructure workflows validate placement, relationships, history, and photo lifecycle`. |
| T2 | `server/test/core-routes.test.js` — `generic work package persists nested records and is searchable without plugins`; `optimistic concurrency requires a base version and rejects stale writes`; `generic work-item, circuit, segment, and requirement mutations preserve stable IDs and concurrency`. |
| T3 | `server/test/core-routes.test.js` — `zero-plugin all-record search finds generic infrastructure`; `generic JSON and CSV exports are available without plugins and neutralize formula cells`; `photo metadata listing does not return image bytes`. |
| T4 | `server/test/core-routes.test.js` — `setup, authentication, role authorization, and session revocation work`; `writer roles can mutate core records but administrator boundaries remain enforced`; `user administration is concurrent, audited, and preserves an active administrator`. |
| T5 | `server/test/core-routes.test.js` — `origin checks, security headers, and public errors do not leak internals`; `generic mutations create sanitized audit events`. |
| T6 | `server/test/offline-replay.test.js` — FIFO identity remapping including catalogue IDs inside dirty package snapshots, transient/unclassified retention, recoverable dead letters, scoped optimistic-conflict details and serialized replay. |
| T7 | `server/test/browser-contracts.test.js` — exact shell coverage, network-first same-origin behavior, separated durable stores/navigation state, bounded push payloads, completion guards and logout-before-restore. |
| T8 | `server/test/e2e.playwright.js` — `PASS zero-plugin browser flow`; `PASS fictional-plugin import, navigation, reload and zero-plugin restart flow`. |
| T9 | `server/test/import-service.test.js` — atomic fictional import, no raw-source retention, idempotence, stable reordering, ownership conflicts, recoverable absence, stale/cancelled rejection and rollback. |
| T10 | `server/test/plugin-loader.test.js`; `server/test/plugin-modules.test.js`; `server/test/presentation-values.test.js` — zero-plugin startup, bounded contributions, presentation validation and typed extension concurrency. |
| T11 | `server/test/recovery.test.js` — fresh migration integrity/constraints/down-up, pre-Phase-3/4/5 preservation, encrypted/wrong-key restore, backup age and recovery of materials, profiles, schedules, completion, evidence and provenance. |
| T12 | `server/test/visual-parity.playwright.js` — 61 deterministic captures including all three cable media across desktop/tablet/phone and themes plus completed, offline and print states. |
| T13 | `server/test/site-workflow.contract.js` — seven passing fictional browser contracts covering site conflicts/replay and complete Phase 2 infrastructure interactions, viewer state and offline rack identity replay. Run with `npm run test:contract:site`. |
| T14 | `server/test/package-workflow.contract.js` — four passing fictional browser contracts covering transactional nested editing/live references, durable offline replay, explicit conflict rebase, assignments, work-item/package completion, handover, roles, search, print and completed-package dead letters. Run with `npm run test:contract:package`. |
| T15 | `server/test/cable-schedule.contract.js` — three passing fictional browser contracts covering fibre/copper/DAC editing, helpers, typed endpoints and ODF hops, rack correction, distances, conflicts, durable replay, roles, completion and the viewport/theme/print matrix. Run with `npm run test:contract:cable`. |
| T16 | `server/test/phase5.test.js`; `server/test/operations.test.js` — request/approval/profile/workload, catalogue/BOM/export/subscription contracts plus backup-age health, bounded shutdown and checked-in container hardening. |
| T17 | `server/test/phase5-workflow.contract.js` — fictional browser journey for catalogues, package quantities, BOM, exact workload, approval, route/viewport resumption and catalogue/termination-position offline replay. Run with `npm run test:contract:phase5`. |

## Workflow matrix

### Home and site infrastructure

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | Home, hierarchical navigation, context and reload resumption | G1, G17 | **verified** — U1/U2/U9 provide navigation, selectors and same-user route/viewport restore without cross-user inheritance | **verified** — A1 supplies complete lists/search; resumption is deliberately browser-local and needs no server route | **verified** — O2 persists navigation only under the authenticated public user ID | **verified** — O2 reloads the exact shell and cached records needed to reopen valid routes | **verified** — T7/T8/T17 cover shell dependencies, reload, same/cross-user routing and real scroll restoration | **verified** — hierarchical navigation and user-isolated reload resumption are complete. |
| W02 | Site create, read, update and search with role/conflict behavior | G2 | **verified** — U2/U3 create, list, search, open and edit sites; writers receive retained conflict resolution and viewers receive explicit read-only state | **verified** — A1 provides validated list/create/update/search, write authorization, optimistic versions, scoped server-version errors and exact idempotent retry | **verified** — D1 has canonical sites, unique codes and versions; successful writes and audits are transactional | **verified** — O1/U3 cache local site drafts, coalesce durable updates, serialize replay, guard completed operations and retain scoped conflicts for review/discard/reapply | **verified** — T1/T4 cover APIs, authorization and idempotent/divergent concurrency; T8 covers create/reload/search; T13 passes all five online/offline browser cases | **verified** — the zero-plugin site workflow is complete across browser, roles, persistence, conflicts, search and applicable offline recovery. |
| W03 | Room-owned canonical racks, default height, suite-line confirmation, duplicates and edit | G3 | **verified** — U3 provides room/rack create, edit, guarded delete, suite inference/confirmation and duplicate feedback | **verified** — A1 validates ownership, 47U default, case-insensitive room-scoped duplicates, versions and safe deletes | **verified** — D1/D3 store ownership, confirmation, bounds and versions with preserved database guards | **verified** — O1/U3 queue dependent room/rack writes, remap temporary IDs and expose retained conflicts | **verified** — T1/T13 cover defaults, duplicates, edit, roles, replay and no self-dependency | **verified** — the canonical room/rack workflow is usable and recoverable without plugins. |
| W04 | Front/rear rack elevation device add, move, resize and remove with stable identity | G3 | **verified** — U3 renders both faces and supports add, move, resize and remove | **verified** — A1 enforces rack bounds, face-specific collisions, safe deletion and immutable keys | **verified** — D1/D3 preserve device keys, room/rack location, face, U position, size and versions | **verified** — O1/U3 durably queue device operations and dependent temporary rack references | **verified** — T1/T13 cover overlap rejection, both faces, move/resize/remove and stable identity | **verified** — the zero-plugin rack elevation editor preserves canonical device identity. |
| W05 | Rack and per-device photo upload, current/history view, replacement and deletion | G4 | **verified** — U3 provides rack/device galleries, metadata, current/history, replacement and writer-only deletion | **verified** — A1 enforces entity/type/size/role bounds, current promotion, content retrieval and optimistic delete | **verified** — D1/D3 retain bytes, metadata, history/current state and versions; R1/T11 preserve them | **verified** — binary writes are explicitly online-only and failures remain visible; metadata/content use authenticated cached reads where available | **verified** — T1/T11/T13 cover rack and device lifecycle, viewer denial, type/size bounds and restore | **verified** — rack and per-device photo history is complete within the documented online-only binary policy. |
| W06 | ODF/termination create, edit, delete and tray/fibre relationship validation | G5 | **verified** — U3 provides termination-point and tray/position create, edit and delete | **verified** — A1 validates room ownership, capacity, unique coordinates, version conflicts and guarded capacity reduction | **verified** — D1/D3 store capacities/positions with foreign keys, uniqueness and capacity triggers | **verified** — O1/U3 queue points and positions, preserve parent dependencies and remap temporary identities without self-dependency | **verified** — T1/T11/T13/T17 cover position lifecycle, rejection, recovery and offline replay | **verified** — the canonical ODF workflow is complete online and through durable replay. |
| W07 | Site device directory and canonical lowercase hostname/location reuse | G6 | **verified** — U3/U8 maintain canonical devices and expose lowercased hostnames and canonical locations in schedules | **verified** — A1 validates site-scoped device identities and derives their location for every typed segment | **verified** — D1/D3/D5 preserve stable canonical device bindings on schedule endpoints | **verified** — O1 queues device and typed package-schedule changes with durable conflict handling | **verified** — T1/T13/T15 cover lowercase hostnames, stable identity, roles, location reuse and replay | **verified** — the device directory is reused canonically by the complete schedule workflow. |
| W08 | Distance history, exact/rack fallback, suggestions and interactive calculator | G7 | **verified** — U3 provides device-pair measurement history and interactive suggestions | **verified** — A1 supplies media-scoped exact and rack-pair fallback lookup with bounded measurements | **verified** — D1/D3 store structured device/rack references, media, length and observation time | **verified** — O1/U3 queue measurements with dependent IDs and cache read suggestions | **verified** — T1/T13 cover exact history, rack fallback, recording and calculator output | **verified** — the equipment-pair distance engine is usable without plugins. |

### Work packages and records

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W09 | In-memory transactional package editor for metadata and nested records | G8 | **verified** — U4 edits one live graph for package metadata, work items, circuits, nested segments and requirements with a 550ms debounce | **verified** — A1 accepts and validates a complete optimistic snapshot in one transaction with bounded idempotent save receipts | **verified** — D1/D4 preserve stable public identities, child versions and save receipts | **verified** — O1 writes every mutation to `dirty-work-packages` and coalesces one durable package operation | **verified** — T2/T14 prove stable identity, idempotence, rollback, browser editing and persistence | **verified** — the zero-plugin transactional package editor is complete across the required graph. |
| W10 | Preserve live nested references after save and flush all pending writes before navigation | G8 | **verified** — U1/U4 merge canonical responses into the live graph and gate route changes and sign-out through `flushAll` | **verified** — A1 returns canonical graph versions without replacing client identities | **verified** — D1/D4 preserve IDs and optimistic versions | **verified** — O1 retains drafts through offline/reload, clears them atomically after replay and leaves rejected drafts recoverable | **verified** — T14 asserts package, item, circuit, segment and requirement reference equality plus navigation flush, replay and conflict rebase | **verified** — successful saves retain live references and navigation cannot silently abandon pending work. |
| W11 | Full tabbed work-item edit, assignment and complete/clear-complete behavior | G9 | **verified** — U4 provides tabbed add/edit/remove, package/item lead and multi-assignment, completion evidence and clear-completion controls | **verified** — A1 validates assignments, requires explicit completion routes, freezes completed items and enforces roles/concurrency | **verified** — D4 stores item assignments, completion time/actor and invariants | **verified** — work-item graph changes use the durable package snapshot; completion actions are explicitly online and visible | **verified** — T2/T12/T14 cover edit, assignment, completion, freeze, clear, viewer and rendered states | **verified** — the complete zero-plugin child work-item workflow is usable. |
| W12 | Package/work-item handover upload, naming, comments, gallery and deletion | G9 | **verified** — U4 provides package and per-item upload forms, named/commented galleries, metadata edit and deletion with read-only states | **verified** — A1 supports bounded package/work-item photo create/read/content/update/delete with role, version and completion locks | **verified** — D1/D4 retain bytes/metadata and clean up package/item ownership safely | **verified** — binary handover writes are explicitly online-only; failures remain in the form and completed records reject queued mutations | **verified** — T11/T12/T14 cover both owners, metadata, gallery, deletion, viewer/completed rules and restored bytes | **verified** — package and work-item handover evidence is complete under the documented online-only binary policy. |
| W13 | Administrator-controlled completion, mutation locks and reopening | G10 | **verified** — U4 removes ordinary completion status editing, exposes admin complete/reopen, freezes completed packages and shows completion evidence | **verified** — A1 requires admin package completion/reopen, writer item completion, complete children and locks core, handover, import and extension writes | **verified** — D4 enforces completion invariants and package/child/photo mutation locks in SQLite | **verified** — O1 turns rejected completed-package replay into a recoverable dead letter while retaining the dirty graph | **verified** — T2/T11/T12/T14 cover authorization, incomplete rejection, actor/time, locks, dead letters and reopening | **verified** — completion is an explicit administrator-controlled state transition with defense-in-depth locks. |
| W14 | Search sites, package references, linked work items and projects with active/completed grouping | G11 | **verified** — U2 renders ranked package matches with linked item context and separate active, completed and infrastructure groups | **verified** — A1 searches site, package/project/external references, assignments, work-item content and connection fields with explicit exact-match ranking and grouping | **verified** — D1/D4 store all searched fields and completion state | **verified** — reads use the existing cache fallback; successful queued package replay is reflected on the next canonical search | **verified** — T2/T3/T8/T14 cover exact package/project/item matches, linked context and completed grouping | **verified** — zero-plugin home search covers the required package/site/project/work-item behavior. |
| W15 | Complete generic pack export plus print/PDF; bounded source-shaped exporters | G12 | **verified** — U4 exposes complete JSON/CSV, a print/save-PDF document and configured bounded plugin exporters | **verified** — A1 exports package metadata, assignments, items, circuits/segments, requirements and handover evidence with escaped print HTML and formula-safe CSV; A4 retains source-shaped exporter bounds | **verified** — exports project the canonical D1/D4 graph without creating mutable export state | **verified** — exports are explicitly authenticated online operations and never enter the mutation queue | **verified** — T2/T3/T9/T12/T14 cover JSON, comprehensive CSV, formula neutralization, bounded exporters and reviewed print rendering | **verified** — core supplies the complete generic pack/print outputs while source-shaped formats remain plugin-owned. |

### Cable schedules

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W16 | Shared full editable grid for fibre, copper and DAC | G13 | **verified** — U8 renders one direct-edit grid with media-specific columns on mandatory zero-plugin pages | **verified** — A1 projects and validates the complete typed schedule graph and standalone segment routes | **verified** — D1/D5 store logical circuits, physical segments and typed media detail | **verified** — O1 durably stores and replays the complete package graph | **verified** — T2/T12/T15 exercise all three media | **verified** — fibre, copper and DAC share the complete core-owned editor. |
| W17 | Row add/delete, helpers, fill, direct edit, debounce, error/conflict and reload-safe live inputs | G13 | **verified** — U8 supplies row add/delete, media helpers, fill-down, keyboard navigation and live direct inputs | **verified** — A1 supports transactional graph and concurrent standalone row mutations | **verified** — D1/D4/D5 retain row identity, versions and idempotent save receipts | **verified** — O1 coalesces durable schedule drafts and retains scoped conflicts | **verified** — T2/T14/T15 cover debounce, helpers, reload, replay and conflict recovery | **verified** — row editing remains attached and recoverable across saves, reload and offline replay. |
| W18 | Device/ODF endpoint modes, correct port controls, chained ODF hops and relationship validation | G5, G13 | **verified** — U8 switches device-port and ODF-position controls and provides an ODF hop helper | **verified** — A1 enforces same-site typed identities, correct ports and adjacent ODF continuity | **verified** — D3/D5 bind device and termination-position identities with database guards | **verified** — O1 replays typed endpoints in the durable package snapshot | **verified** — T2/T11/T15 cover valid and rejected endpoint chains | **verified** — canonical device and ODF termination behavior is complete. |
| W19 | Endpoint room/rack autofill, transactional rack creation/correction and distance reuse | G7, G13 | **verified** — U8 autofills canonical location, suggests measured distance and offers explicit rack correction | **verified** — A1 derives locations and applies existing/new rack corrections atomically with the package | **verified** — D3/D5 retain canonical endpoint/rack identities and audit the transaction | **verified** — O1 durably carries schedule rack corrections with the package graph | **verified** — T2/T15 cover correction, creation, audit, rollback, conflicts and distance reuse | **verified** — schedule location side effects commit atomically and refresh canonical references. |
| W20 | Fibre connector/type/mode/simplex/stock-length/item-type behavior | G13, G15 | **verified** — U8 provides fibre-specific connector, type, mode, simplex, stock and item controls and helpers | **verified** — A1 validates bounded fields and compatible fibre type/mode pairs | **verified** — D5 persists the complete fibre segment shape | **verified** — O1 durably replays fibre fields | **verified** — T2/T11/T12/T15 cover fibre interaction, persistence, recovery and rendering | **verified** — the schedule-side fibre workflow is complete and feeds the verified W25 catalogue/BOM matcher. |
| W21 | Copper-specific fields and row behavior | G13 | **verified** — U8 provides category, shielding and pinout controls | **verified** — A1 validates copper-specific values and connector compatibility | **verified** — D5 persists bounded copper fields | **verified** — O1 durably replays copper rows | **verified** — T2/T12/T15 cover copper behavior and states | **verified** — copper-specific schedule editing is complete. |
| W22 | DAC-specific fields, direction and media behavior | G13 | **verified** — U8 provides connector, media, direction and reverse behavior | **verified** — A1 validates bounded DAC fields and matching connectors | **verified** — D5 persists bounded DAC fields | **verified** — O1 durably replays DAC rows | **verified** — T2/T12/T15 cover DAC editing, reversal and states | **verified** — DAC-specific schedule editing is complete. |
| W23 | Schedule desktop/tablet/phone, keyboard/pointer, theme, print, viewer, completed and offline states | G20 | **verified** — U8 and shared CSS expose responsive card/grid, keyboard/pointer, theme, print and explicit read-only/offline states | **verified** — A1 enforces writer/viewer roles, optimistic conflicts and completed-package locks | **verified** — D4/D5 preserve completion and typed schedule invariants | **verified** — O1/O2 cache the shell and durably retain schedule drafts | **verified** — T12/T15 cover the complete schedule interaction/state matrix | **verified** — all three schedules pass the required role, state, input and viewport matrix. |

### Materials, users, PWA and offline behavior

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W24 | Shared consumables catalogue administration kept separate from package quantities | G14 | **verified** — U4/U7 provide admin catalogue CRUD, package selectors, editable quantities and explicit package clearing | **verified** — A1/A6 keep definitions and requirements separate, enforce optimistic versions and reject deletion while referenced | **verified** — D1 stores catalogue definitions separately from package-owned quantities | **verified** — O1 queues catalogue changes and dependent package snapshots with durable identity remapping | **verified** — T2/T6/T16/T17 cover separation, selection, clear, in-use delete and replay | **verified** — shared definitions never become package quantities and both workflows remain independently editable. |
| W25 | Fibre SKU catalogue, exact/next-up matching, simplex counts, totals, unmatched reasons and spreadsheet export | G15 | **verified** — U7/U9 provide fibre SKU administration and an attached package BOM with export | **verified** — A6 validates SKU tuples and deterministically calculates exact/shortest-next matches, counts, reasons and totals | **verified** — D6 stores constrained, versioned fibre SKUs independently of schedules | **verified** — O1/O2 queue catalogue changes and cache the resulting read-only BOM route | **verified** — T16/T17 cover exact/next-up lengths, simplex quantity, grouped totals, unmatched reasons, formula-safe CSV and browser use | **verified** — the zero-plugin fibre catalogue and BOM workflow is complete. |
| W26 | Account request/approval, roles, engineer profiles, exact assignment matching and workload | G16 | **verified** — U7 provides public request, admin approval/rejection, account editing, self profiles and role-aware workload | **verified** — A2 enforces lifecycle, four roles, concurrency, session revocation and normalized whole-value assignment matching | **verified** — D1/D6 store account lifecycle and unique versioned profile identities | **verified** — O1 queues self-profile edits and caches workload reads; approval remains an intentional online administrator action | **verified** — T4/T16/T17 cover pending-login denial, approval, roles, stale updates, exact-not-substring matching and team/self views | **verified** — operational account and workload workflows are complete without plugins. |
| W27 | Same-user navigation/viewport resumption, shell caching, notifications and sign-out subscription behavior | G17 | **verified** — U9 offers same-user route/scroll restore and browser notification enable/disable | **verified** — A2 owns validated subscriptions and deletes all current-user subscriptions on disable/logout | **verified** — D6 binds subscriptions to users with cascade cleanup; route state remains user-scoped browser data | **verified** — O1/O2 cache the exact shell, preserve pending logout and isolate navigation by user | **verified** — T7/T16/T17 cover shell equality, bounded push routes, subscription deletion and same/cross-user viewport behavior | **verified** — PWA resumption, notification and sign-out lifecycle are complete within deployment-configured push support. |
| W28 | Durable dirty-package and infrastructure queues, FIFO replay, ID remap, scoped conflicts, dead letters and no loss | G17 | **verified** — U3/U4/U7/U8 expose queued/conflict states for package, infrastructure, schedule and catalogue/profile mutations | **verified** — A1/A2/A6 supply optimistic conflicts, relationship validation and completed-package rejection for replayed operations | **verified** — D1/D4/D5/D6 provide versions, audit, receipts and relationships while durable drafts remain client-owned | **verified** — O1 serializes FIFO replay, coalesces drafts, remaps dependent IDs, guards completions and retains transient/conflicting/permanent failures | **verified** — T6/T7/T13–T17 cover dirty package snapshots, every infrastructure family including positions, dependent catalogue IDs, conflicts, dead letters, pending logout and no-loss cases | **verified** — all in-scope structured offline mutations have explicit durable replay or an explicit online-only binary/import policy. |

### Imports, security and operations

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W29 | Work Request source import, reconciliation, retry/reimport, provenance, search and source-shaped export | G18 | **partial** — U6 supplies a complete generic provider preview/apply interaction; no approved frozen-source provider is present | **partial** — A3/A4 implement bounded provider, reconciliation and exporter contracts; frozen interpretation stays outside core | **verified** — D1/D2 store drafts, runs, links, ownership, versions, audit and typed extensions transactionally | **missing** — import is online-only | **partial** — T9/T10 and T8 use fictional providers; no approved differential golden evidence | **partial** — the core contract is strong, provider/integration parity is intentionally unverified. |
| W30 | Pasted inert content parsing, preview, apply and safe failure | G18 | **partial** — U6 renders a bounded text descriptor and normalized preview when a provider declares it | **partial** — A3 accepts bounded text artifacts but contains no frozen parser | **verified** — D1 uses the same transactional draft/provenance model without raw-source retention | **missing** — import is online-only | **partial** — T9 covers fictional artifact/security failures, not frozen pasted-content differentials | **partial** — generic capability exists; source-specific behavior remains plugin evidence. |
| W31 | Admin/manager/engineer/viewer permissions, concurrency, locks, audit and safe errors | G2, G8, G10, G16 | **verified** — current core workflows expose explicit viewer/writer/admin, approval, completion and conflict states | **verified** — A1/A2/A5/A6 enforce write/admin boundaries, optimistic versions, origin checks, safe errors, ownership and completion locks | **verified** — D1/D4/D5/D6 provide roles, versions, audit and database lock/relationship guards | **verified** — O1 preserves scoped drafts, conflicts and completed-package dead letters without weakening server authorization | **verified** — T2/T4/T5/T13–T17 cover the implemented product-wide role, lifecycle, lock and safe-error matrix | **verified** — authorization and concurrency remain core-owned across every current workflow. |
| W32 | Fresh install, existing-database bridge, SQLite-safe backup and isolated restore | G19 | **missing** — operational workflow has no browser surface, as expected, and no operator UI is required | **partial** — startup migrates a fresh baseline; no candidate/legacy bridge contract exists | **partial** — D1/D2 install cleanly and R1 backs up/restores; migration preservation for candidate data is unproved | **missing** — operational recovery is not a browser-offline workflow | **partial** — T11 covers fresh install and generic restore only | **partial** — fresh/recovery foundations exist; the required forward bridge and representative migration proof do not. |
| W33 | Non-root/read-only container, graceful shutdown, health, encrypted backups and backup-age monitoring | G19 | **verified** — no browser UI is required; operator state is exposed through bounded health JSON and documented commands | **verified** — A5 checks SQLite and backup age, degrades without path disclosure, returns 503 on database failure and drains signals within a bound | **verified** — R1 creates SQLite-safe AES-256-GCM backups with protected keys, atomic status and isolated authenticated restore | **verified** — disconnected operation is server-side; the browser shell remains independently durable through O2 | **verified** — T11/T16 verify encryption, missing/wrong keys, stale status, clean SIGTERM, database integrity and checked-in non-root/read-only/capability-free controls | **verified** — generic operational controls and restore-based rollback are implemented; formal deployment approval remains separate. |
| W34 | Desktop, tablet, phone, light, dark and print rendering for every applicable workflow | G20 | **partial** — U1/U7–U9 use the shared responsive/theme/print system through Phase 5 | **verified** — APIs are viewport-neutral and all current workflow data is renderable | **verified** — theme and user-scoped viewport state are durably browser-local | **verified** — O2 caches the exact complete current shell | **partial** — T12/T15 cover the full cable matrix and T17 exercises Phase 5 desktop/scroll states; dedicated Phase 5 tablet/phone/theme/print captures remain | **partial** — Phase 5 uses the responsive shell, but product-wide visual-state acceptance remains for the final gate. |

## Acceptance-flow roll-up

Eleven critical acceptance flows now have verified implementation evidence at this
inventory scope. This roll-up maps every flow in the recovery guide to the
detailed rows above; it does not replace final acceptance or authorize checking
the guide's `FLOW-*` box before its broader role, viewport and release gates.

| Acceptance flow | Inventory rows | Status | Principal blockers |
| --- | --- | --- | --- |
| `FLOW-01` Home, search, navigation and resumption | W01, W14, W27 | **verified** | Lower-level navigation/search/resumption workflow is verified; final acceptance still requires the guide's broader release gates. |
| `FLOW-02` Site, room, rack, ODF and device editing | W02, W03, W06, W07 | **verified** | Lower-level canonical infrastructure workflow is verified online and through durable replay. |
| `FLOW-03` Rack elevation editing and identity | W04 | **verified** | Lower-level workflow verified; final product acceptance still requires the guide's broader role/viewport gates. |
| `FLOW-04` Rack, device and handover photos | W05, W12 | **verified** | Lower-level photo workflows are verified; final acceptance still requires broader role/viewport/release gates. |
| `FLOW-05` Package details, assignments, work items and completion | W09–W13 | **verified** | Lower-level package workflows are verified; final acceptance still requires broader product gates. |
| `FLOW-06` Fibre schedule and ODF hops | W16–W20, W23 | **verified** | Lower-level cable workflow verified; final acceptance still requires the guide's broader release gates. |
| `FLOW-07` Copper and DAC schedules | W16, W17, W21–W23 | **verified** | Lower-level cable workflows verified; final acceptance still requires the guide's broader release gates. |
| `FLOW-08` Schedule-driven racks and distances | W08, W19 | **verified** | Lower-level transactional rack/distance workflow verified; final acceptance still requires broader product gates. |
| `FLOW-09` Consumables, fibre catalogue, BOM and exports | W15, W24, W25 | **verified** | Lower-level shared materials, matching, totals and formula-safe export workflow is verified. |
| `FLOW-10` Imports, reconciliation, retry, provenance, search and export | W14, W15, W29, W30 | **partial** | Search/generic export are verified; approved provider differentials and online-only import policy remain. |
| `FLOW-11` Roles, approval, workload, concurrency, locks and safe errors | W13, W26, W31 | **verified** | Lower-level role, lifecycle, exact workload and concurrency workflow is verified. |
| `FLOW-12` Offline durability, replay, conflicts, logout and notifications | W27, W28 | **verified** | Lower-level durable queue, recovery, resumption and subscription lifecycle is verified. |
| `FLOW-13` Install, bridge, backup, container, shutdown, health and monitoring | W32, W33 | **partial** | Generic operations are verified; candidate/legacy bridge acceptance remains in Phase 7. |
| `FLOW-14` Desktop, tablet, phone, theme and print | W23, W34 | **partial** | Cable coverage is verified; later product workflows still need the same matrix. |

## Size and recovery order

The 34 detailed workflows contain **0 missing**, **4 partial**, and **30
verified** end-to-end outcomes. Verified lower layers remain useful
prerequisites, not parity claims for the other workflows.

The evidence supports the existing recovery order:

1. Complete `INVENTORY-02` before feature work so styling/schema/API claims are
   qualified against this matrix.
2. Add the first failing fictional browser contract in `INVENTORY-03`, then
   agree migration and preservation strategy in `INVENTORY-04`.
3. Restore canonical site/infrastructure browser workflows before cable
   schedules depend on them.
4. Restore transactional package/work-item/completion semantics before adding
   package-wide offline replay and exports.
5. Build the shared cable grid and endpoint model before media-specific fibre,
   copper and DAC behavior; the BOM depends on the fibre model and catalogue.
6. Complete account, PWA, offline and operational acceptance before private
   provider and migration acceptance.

This inventory makes no feature, schema, migration, deployment or release
change. It does not check any `FLOW-*` acceptance box.

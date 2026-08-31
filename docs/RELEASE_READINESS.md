# Release readiness

This document contains only public-safe gate status. Detailed review patterns
and any organization-specific findings must remain outside this repository.

## Current status

- **Implemented technical foundations:** the historical and current automated
  evidence supports generic schema/API, security boundaries, plugin/import
  contracts, shell rendering, selected offline primitives, backup/restore, and
  container-hardening claims at the layers identified in
  [`CORE_PARITY_INVENTORY.md`](CORE_PARITY_INVENTORY.md).
- **Partial browser workflows:** 28 workflows are partial and 6 are missing.
  Passing lower-level and screenshot tests does not close those gaps.
- **Verified end-to-end product parity:** none. All 14 critical `FLOW-*` items
  remain unchecked in
  [`CORE_PLUGIN_RECOVERY_GUIDE.md`](CORE_PLUGIN_RECOVERY_GUIDE.md).
- **Formal approval and production readiness:** not established. Human
  approvals, migration/provider evidence, complete workflow acceptance, and
  operational gates remain outstanding.

Accordingly, this repository is **not production-ready**. “Release candidate”
is a version label, while the passed checks below are bounded technical or
historical evidence; neither is a product-acceptance decision.

## Candidate identity

- Public source repository: `scow92/TechSiteManager-Core`
- Public-visibility timestamp: 2026-08-29 08:40:53 UTC
- Commit at public visibility:
  `5d98b43f349c8329df71b0c1a603782b0c4ff368`
- Evidence-bearing source commit:
  `96f9c62d17eb7a82f09f816c83933700e69fdc3a`
- Evidence baseline core version: `1.0.0-rc.1`
- Evidence baseline Plugin API version: `1`
- Current proposed core version: `1.1.0-rc.1`
- Current proposed Plugin API version: `2`
- Outbound licence: Apache License, Version 2.0 (`Apache-2.0`)
- Copyright holder: Copyright 2026 Sam Cowie
- CycloneDX SBOM serial:
  `urn:uuid:9014c75a-e7ad-4f8a-b374-4e9266086f79`
- CycloneDX SBOM SHA-256:
  `49011a82d6d4eab74e155866935bd3fe9e3e6bf03daeaa22855e2375a9247217`

The recorded evidence predates Plugin API V2. The V2-labelled candidate must be
revalidated and must receive the still-unrecorded approvals below before these
historical results can be treated as evidence for that candidate.

The evidence report and approval checklist are documentation-only additions
made after the evidence-bearing source commit. Because a commit cannot contain
its own hash, the final pull-request head is revalidated after this report is
committed; that exact head and its CI result are recorded on the pull request.

## Historical technical checks passed

The 2026-08-29 release review passed:

- lockfile-clean dependency installation with zero reported vulnerabilities;
- ESLint and JavaScript syntax checks;
- 58 unit and integration tests with no failures or skips;
- bounded zero-plugin and fictional-plugin Playwright smoke flows;
- zero-plugin behaviour, generic search, service-worker shell coverage,
  offline replay, authentication, authorization, optimistic concurrency,
  plugin loading and compatibility, strict YAML-profile security, import
  contracts, reconciliation, provenance, and generic exports;
- fresh database creation for zero-plugin and fictional-plugin profiles with
  `integrity_check` equal to `ok` and no foreign-key violations;
- backup, restore, schema constraints, and throwaway down/up recovery tests;
- a fresh private clone of the licensing commit, including lockfile install
  and the complete repository technical verification suite available then;
- current-tree, complete candidate history, tracked/hidden file, commit
  message, unexpected-artifact, and repository-integrity scans;
- one candidate root commit, no commit overlap with the original private
  repository, and no inherited Git ancestry;
- root and fictional-plugin package dry runs and extracted archive review;
- production and development dependency vulnerability audits with zero
  reported vulnerabilities;
- dependency metadata/licence review for 169 installed packages;
- CycloneDX 1.5 SBOM generation for 167 components;
- container build, health, non-root/read-only/capability inspection, SQLite
  integrity, application allowlist, dependency licence, final-filesystem,
  history, and all-layer review; and
- three required CI jobs on the evidence-bearing commit.

These checks validate the named technical boundaries at the historical
evidence commit. They did not exercise the recovery guide's 14 critical
workflows and do not establish frozen-product parity. Current workflow status
and exact test coverage are recorded in `CORE_PARITY_INVENTORY.md`.

At that historical baseline, the root package contained 73 files and the
fictional plugin contained seven.
Both archives contain the official licence and contain no binary or forbidden
artifact. The final image is
`sha256:c803fb2f94ee0a5a3f6328e656090053a7d5f5a96c4839c9f76f9c2d13dc3ecc`.
It runs as UID/GID 65532, retains `LICENSE` and `COPYRIGHT.md`, and uses the
digest-pinned distroless runtime base documented in `Dockerfile`.

## Third-party licensing

The observed dependency licences are `Apache-2.0`, `BSD-2-Clause`,
`BSD-3-Clause`, `BlueOak-1.0.0`, `ISC`, and `MIT`. Installed package
distributions retain their licence text. Development-only Playwright notices
remain with the packages to which they apply and are not copied to the
production image. The reviewed production dependency tree contains no
upstream `NOTICE` requiring a project-level aggregation. No project `NOTICE`
was created.

The tracked candidate contains no vendored JavaScript, fonts, icon/image
files, copied templates, source maps, or binary test assets. SheetJS is not
present. The production image contains dependency-supplied source maps and
better-sqlite3 native prebuilds; they were identified as upstream package
content, not project-authored or unexpected artifacts. See
`docs/THIRD_PARTY_LICENSES.md` for the inventory policy.

## Scan results

Repository-owned current-tree and history disclosure scans passed with no
findings. The complete history has one candidate root and zero commit overlap
with the original repository. Package and project-owned container content
produced no disclosure finding. Broad container scanning matched only
documented upstream examples and network test vectors inside installed
dependencies; manual classification found no credential or candidate-specific
infrastructure data.

Gitleaks, TruffleHog, detect-secrets, Syft, Grype, Trivy, Docker Scout, and a
standalone licence scanner were unavailable in the review environment and
were not run. The npm dependency audit, npm CycloneDX SBOM generation,
repository-owned disclosure/history scanners, package review, dependency
licence review, and manual image-layer review passed; these are not claimed as
substitutes for the unavailable tools. Any additional scanner mandated by the
organization requires external execution.

## Failed checks

No technical check in the completed historical evidence run failed. Initial harness
attempts that used read-only default tool caches stopped before evaluating the
candidate and passed when temporary writable caches were configured.

## Skipped checks

- No standalone formatter is configured; lint and syntax checks ran.
- The unavailable third-party scanners listed above were skipped, not passed.
- Private-provider, private legacy-schema bridge, and private deployment tests
  do not exist in this generic candidate by design.

## Known limitations and manual review

- The parity inventory records 6 missing, 16 partial, and 12 verified detailed
  workflow. No critical `FLOW-*` acceptance item is verified end to end.
- Plugins are trusted in-process code, not sandboxes.
- The build-stage Node image is selected by a release tag; the successful
  build resolved that tag to an immutable digest recorded in the build log.
- Upstream npm packages add source maps and multi-platform native prebuilds to
  the production image even though project source adds none.
- Git history contains one non-noreply author address. Its public disclosure
  must be accepted during human disclosure review.
- Reviewers must independently confirm the technical, security,
  copyright/IP, third-party licensing, and disclosure conclusions.

## Formal approvals not recorded

- Human technical review is not recorded.
- Human security review is not recorded.
- Human copyright/IP review is not recorded.
- Human third-party licensing review is not recorded.
- Human disclosure review is not recorded.
- Formal source-publication approval and approval for the repository visibility
  change are not recorded. The completed visibility event is documented
  separately from approval in `docs/PUBLICATION_APPROVAL_CHECKLIST.md`.
- If organization policy requires any unavailable scanner, its external result
  remains a blocker.

Sam Cowie has confirmed ownership of the candidate's original code, selected
`Apache-2.0` as its outbound licence, and approved the private pull-request
merge and private candidate rename. Those decisions are recorded in
`docs/PUBLICATION_APPROVAL_CHECKLIST.md`; they do not constitute technical,
security, disclosure, final publication, or public-visibility approval. The
candidate remained private throughout that review and later became the public
`scow92/TechSiteManager-Core` source repository. The original private
repository was not modified.

Public source visibility did not publish an npm package, public container
image, GitHub release, Pages site, or hosted deployment. Do not perform any of
those publication actions, or rename the original private repository, without
explicit approval.

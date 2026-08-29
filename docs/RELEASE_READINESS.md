# Release readiness

This document contains only public-safe gate status. Detailed private scan
patterns and findings are maintained outside this repository.

## Passed

The 2026-08-29 acceptance run passed:

- ESLint and JavaScript syntax checks;
- 58 unit and integration tests covering the generic schema, constraints,
  foreign keys, authentication, authorization, audit, optimistic concurrency,
  search, exports, offline replay, service worker, plugin contracts, strict
  profiles, imports, reconciliation, provenance, backup, and restore;
- Playwright zero-plugin and fictional-plugin browser flows;
- fresh empty database creation, `integrity_check`, `foreign_key_check`, and a
  down/up cycle in throwaway databases;
- current-tree and complete-candidate-history disclosure, secret-pattern,
  internal-address/path, binary, and forbidden-artifact scans with no findings;
- npm package dry-run allowlist inspection;
- development and production dependency audits with zero reported
  vulnerabilities;
- dependency metadata and licence allowlist review for 169 installed packages;
- CycloneDX SBOM generation;
- private fresh-clone lockfile install and the complete release suite;
- zero-plugin container build, health smoke, non-root/read-only/capability
  inspection, application filesystem allowlist, image history review, and
  in-container SQLite integrity and foreign-key checks.

The dependency licences observed were Apache-2.0, BSD-2-Clause,
BSD-3-Clause, BlueOak-1.0.0, ISC, and MIT. The `UNLICENSED` fictional example
is part of this unpublished candidate, not a third-party runtime dependency.

## Failed

No check in the final acceptance run failed. The first fresh-clone install
attempt used a read-only default node-gyp cache and stopped with `EROFS`; the
same clean clone installed and passed after both npm and node-gyp caches were
placed under `/tmp`.

## Skipped

- No standalone formatter is configured; lint and syntax checks ran.
- Third-party gitleaks, TruffleHog, Syft, and container-vulnerability scanners
  were not installed. Repository-owned current/history disclosure scans and
  npm CycloneDX generation ran instead; these are reported as their own passed
  checks, not as substitutes claimed to be those tools.
- Private-provider, private legacy-schema bridge, and private deployment tests
  do not exist in this candidate by design.

## Publication blockers

- the repository owner has not selected an outbound license;
- human technical, security, intellectual-property, and disclosure approval is
  still required;
- repository naming and public visibility require an explicit later approval.

Do not make this repository public, publish packages/images, create a release,
or reuse an existing repository name until every blocker is resolved.

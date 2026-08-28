# Release readiness

This document contains only public-safe gate status. Detailed private scan
patterns and findings are maintained outside this repository.

Implemented gates:

- generic fresh-install schema with stable opaque IDs;
- zero-plugin and fictional-plugin runtime paths;
- Plugin API V1 and strict YAML profiles;
- staged import, ownership-aware reconciliation, approval, atomic apply,
  provenance, expiry, and recoverable absence;
- generic import UI, search, export, authentication, concurrency, offline shell,
  backup/restore, and container definition;
- fictional tests and disclosure-oriented CI.

Publication blockers:

- the repository owner has not selected an outbound license;
- human technical, security, intellectual-property, and disclosure approval is
  still required;
- repository naming and public visibility require an explicit later approval.

Do not make this repository public, publish packages/images, create a release,
or reuse an existing repository name until every blocker is resolved.

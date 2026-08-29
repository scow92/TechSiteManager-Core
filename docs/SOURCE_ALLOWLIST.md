# Candidate source allowlist

This repository is constructed from an explicit generic allowlist. A file is
eligible only when both its path and content are appropriate for the generic
product. Inclusion on this list never bypasses disclosure, licence, secret, or
binary review.

## Allowed paths

- root project metadata: `AGENTS.md`, `README.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `COPYRIGHT.md`, `LICENSE`, `package.json`, `package-lock.json`,
  `.nvmrc`, `.gitignore`, and `.dockerignore`;
- public automation: `.github/dependabot.yml`,
  `.github/pull_request_template.md`, and `.github/workflows/ci.yml`;
- generic browser shell: `public/index.html`, `public/manifest.json`,
  `public/sw.js`, `public/css/`, and `public/js/`;
- generic server: `server/app.js`, `server/config.js`, `server/server.js`,
  `server/knexfile.js`, and generic files below `server/db/`, `server/lib/`,
  `server/routes/`, `server/imports/`, `server/plugins/`, and `server/scripts/`;
- public-safe tests: JavaScript below `server/test/` using invented data only;
- fictional integration example: `examples/fictional-plugin/`;
- zero-plugin and fictional-example configuration: `config/`;
- newly written public documentation: Markdown below `docs/`;
- generic deployment: `Dockerfile` and `docker-compose.yml`.

The only allowed database migration is
`server/db/migrations/0001_generic_baseline.js`. It defines a fresh generic
installation and contains no conversion path from another schema.

## Always excluded

The candidate excludes inherited Git objects and ancestry; historical
migrations; real records and fixtures; source-system layouts, mappings, and
folder conventions; environment-specific terminology, URLs, addresses,
hostnames, paths, package names, registries, topology, or credentials;
databases, backups, logs, uploads, screenshots, archives, package artifacts,
and generated reports; and any plugin or bridge intended for a particular
deployment.

The example plugin must remain invented independently for this repository. It
may demonstrate the contract, but it must not imitate an existing provider's
fields, parsing decisions, exports, or source identity.

## Review process

Before each commit, reviewers inspect the complete diff, run
`npm run scan:public` and `git diff --check`, and confirm that every added path
is allowlisted and every value is generic or obviously fictional. Before a
release candidate is proposed, the packed application and container layers
are inspected separately because source-tree review alone is insufficient.

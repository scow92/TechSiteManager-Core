# Deployment

This document describes deployment mechanics, not production approval. The
generic operational controls in `W33` are implemented, while the candidate
database bridge in `W32`, formal approvals and the broader `FLOW-13` gate in
[`CORE_PARITY_INVENTORY.md`](CORE_PARITY_INVENTORY.md) remain outstanding.

The public image contains core only and defaults to zero plugins. Its runtime is
a digest-pinned distroless Node image and runs as the non-root UID/GID 65532. It
serves only the explicit browser asset allowlist and writes only to `/app/data`
plus temporary storage.

The Compose example binds to loopback so an operator can place an approved TLS
reverse proxy in front of it. For a one-hop proxy, set `PROXY_MODE=single` and
`SECURE_TRANSPORT=true`; the latter enables HSTS and secure session cookies.
Do not expose an HTTP deployment to an untrusted network.

Keep the root filesystem read-only, drop Linux capabilities, enable
`no-new-privileges`, and provide a private mode-0700 data volume. Inject
secrets at runtime; never bake them into images, examples, or plugin profiles.

Process readiness is reported by `GET /api/health`. It indicates that the
process, database and configured plugin registry started; it is not evidence
of product parity, migration readiness, operational approval or production
readiness. A missing required plugin prevents startup. An optional plugin
failure reports degraded health without exposing package paths or configuration
values. `SIGTERM` and `SIGINT` stop new connections, drain idle connections and
close remaining connections after `SHUTDOWN_TIMEOUT_MS` (10 seconds by
default) before closing SQLite.

Configure `BACKUP_STATUS_FILE` to the status manifest written by the scheduled
encrypted backup job and set `MAX_BACKUP_AGE_HOURS` to the alert threshold (24
hours by default). Health remains HTTP 200 when the database is usable but
reports `status: "degraded"` and `backup.status: "stale"` or `"invalid"`;
monitor those fields explicitly. A database check failure returns HTTP 503.
Paths, keys and plugin configuration values are never included in the response.

Set `VAPID_PUBLIC_KEY` only when the deployment has a separately managed push
delivery service. Core stores user-owned browser subscriptions and removes
them on disable and sign-out; it does not embed notification credentials or a
delivery provider. See [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) for the
encrypted backup, isolated restore and restore-based rollback procedure.

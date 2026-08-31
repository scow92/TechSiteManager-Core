# Deployment

This document describes deployment mechanics, not production approval. The
container and recovery workflow is partial (`W32`, `W33`, and `FLOW-13` in
[`CORE_PARITY_INVENTORY.md`](CORE_PARITY_INVENTORY.md)); migration bridging,
encrypted backup operations, backup-age monitoring, and complete operational
acceptance remain outstanding.

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
process and configured plugin registry started; it is not evidence of product
parity, migration readiness, operational approval, or production readiness. A
missing required plugin prevents startup. An optional plugin failure reports
degraded health without exposing package paths or configuration values.

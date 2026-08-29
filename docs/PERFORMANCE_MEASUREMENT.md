# Performance measurement plan

The current release does not redesign persistence, replace SQLite, add a public
metrics endpoint, or add a helper process. Existing structured HTTP logs already
record route, status, request ID, and duration without request or response
payloads. Additional measurements should be introduced only with reviewed
sampling, retention, and access controls.

## Measurements

| Concern | Proposed measurement | Safe dimensions |
| --- | --- | --- |
| Event-loop delay | Sample Node.js event-loop delay histograms over a bounded interval | process role, interval, percentile bucket |
| Import transformation | Duration around the provider transform call | provider durable ID, outcome code, duration bucket |
| Import artifact size | In-memory byte length before transformation | provider durable ID, media-type class, size bucket |
| SQLite transaction | Duration around the single import-apply transaction | outcome code, created/updated count buckets |
| Draft/reconciliation size | Serialized byte length and entity/field/warning counts | count and size buckets only |
| Concurrent write conflicts | Count stable `stale_approval` and concurrency error codes | operation class and stable code |

The first implementation should use bounded structured logs or an existing
organization-approved collector. It must define sampling and retention before
activation and must be tested for shutdown, overload, and collector failure.
No new unauthenticated or browser-visible metrics API is approved by this plan.

## Prohibited data

Measurements and logs must never contain raw source content, field values,
credentials, cookies, authorization headers, private configuration, identifying
source filenames, human-entered references, internal filesystem paths, SQL
text with bound values, or serialized drafts/proposals. Provider and error IDs
must remain durable public identifiers and be length-bounded.

## Decision gate for isolation

Collect representative duration, event-loop, concurrency, and memory evidence
before proposing `worker_threads`, child processes, Python, or Go. A proposal
must state the measured threshold, bounded process contract, deployment impact,
timeouts/resource limits, cleanup behavior, and recovery tests. No benchmark
has been run or is claimed in this document.

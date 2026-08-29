# Import Provider API

A provider converts one bounded transient `SourceArtifact` into a normalized
`ImportDraft`. Core owns validation, preview, reconciliation, authorization,
approval, optimistic versions, atomic persistence, provenance, audit, and
sanitized results.

Provider input descriptors support only file, pasted text/inert HTML, or an
external reference acquired by a registered connector. Extra fields are
bounded strings, multiline values, integers, booleans, enums, or core-entity
selectors. No provider browser code is loaded.

Core renders these descriptors, validates field names/types/required values,
enforces the artifact byte and media-type limits, and invokes the configured
connector only for an external-reference provider. The browser never receives
connector code or credentials.

Normalized records use stable `sourceRecordKey` values and managed fields:

```json
{
  "title": {
    "value": "Fictional installation",
    "ownership": "source-owned"
  }
}
```

Ownership policies are `source-owned`, `user-owned`, `source-default`, and
`review-required`. A source-owned field is updated only while its live value
still equals the last applied value. Manual divergence creates a conflict.

Missing records become absence proposals with three choices: keep linked as
absent, unlink and keep, or defer. Import never hard-deletes a core entity.

Drafts are actor-scoped, hash-bound, version-bound, and expire after a bounded
interval. Apply validates them again and writes the package, children, links,
ownership, run summary, and audit event in one transaction.

Approval accepts decisions only for fields and absences present in that exact
proposal. Unknown decisions, malformed maps, unknown warning
acknowledgements, a changed draft hash, or changed target versions are rejected
before persistence.

Plugin API V2 providers may return `techsitemanager.io/import-draft/v2` and a
validated `presentationId`. Each normalized entity may then include an
`extensions` map keyed by field IDs declared by that plugin's presentation.
Core resolves those IDs to plugin-scoped bindings, validates their types and
bounds, includes them in preview and ownership decisions, and persists them in
the same import transaction. V1 drafts remain supported and cannot select a
presentation or provide extension fields.

Public TypeScript declarations for these shapes are available at
`types/import-contracts.d.ts`. They describe valid provider output and core
responses but do not make JSON, YAML, connector output, or callback returns
trusted. Core validates every runtime value again before reconciliation or
persistence.

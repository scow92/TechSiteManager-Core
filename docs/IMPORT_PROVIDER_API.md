# Import Provider API V1

A provider converts one bounded transient `SourceArtifact` into a normalized
`ImportDraft`. Core owns validation, preview, reconciliation, authorization,
approval, optimistic versions, atomic persistence, provenance, audit, and
sanitized results.

Provider input descriptors support only file, pasted text/inert HTML, or an
external reference acquired by a registered connector. Extra fields are
bounded strings, multiline values, integers, booleans, enums, or core-entity
selectors. No provider browser code is loaded.

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

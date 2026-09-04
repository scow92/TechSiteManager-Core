# Publication approval checklist

This checklist separates recorded owner decisions and the completed public-
visibility event from formal human approvals that remain unrecorded. Codex
assembled the evidence but is not a human approver.

It also does not establish product parity or production readiness. Current
workflow status is recorded in
[`CORE_PARITY_INVENTORY.md`](CORE_PARITY_INVENTORY.md), where no end-to-end
workflow is verified; release gates remain in
[`CORE_PLUGIN_RECOVERY_GUIDE.md`](CORE_PLUGIN_RECOVERY_GUIDE.md).

## Public-visibility event

- [x] GitHub records `scow92/TechSiteManager-Core` as public from 2026-08-29
  08:40:53 UTC. At that time `main` pointed at
  `5d98b43f349c8329df71b0c1a603782b0c4ff368`.
- [x] At the public-visibility event, the repository was a release candidate at
  version `1.0.0-rc.1`. The current proposed Plugin API V2 candidate is
  `1.2.0-rc.2` and requires fresh release evidence.
- [x] Public visibility applies to the source repository only. It did not
  publish an npm package, public container image, GitHub release, Pages site,
  or hosted deployment.

The timestamp is taken from GitHub's public repository metadata. Recording
what occurred does not retroactively assert an approval that was not recorded.

## Recorded owner decisions

- [x] Sam Cowie confirmed copyright ownership of the candidate's original
  code.
- [x] The owner selected Apache License, Version 2.0 (`Apache-2.0`) as the
  outbound licence and identified Copyright 2026 Sam Cowie.
- [x] The owner explicitly approved squash-merging private pull request #5.
- [x] The owner explicitly approved renaming the private candidate repository
  from `TechSiteManager-public-candidate` to `TechSiteManager-Core`, while
  keeping it private.

These decisions authorized the licence files, pre-publication validation, the
private pull-request merge, and the private candidate rename only. No separate
record approving the later visibility change has been located. The visibility
event is therefore recorded as an event, not treated as proof of formal
approval. No approval to publish a package, image, release, Pages site, or
hosted deployment is recorded.

## Formal approvals not recorded

- [ ] Technical review completed by an authorized human reviewer.
- [ ] Security review completed, including any organization-mandated external
  scanner results.
- [ ] Copyright and intellectual-property review completed.
- [ ] Third-party licensing and attribution review completed.
- [ ] Disclosure review completed, including Git author metadata.
- [ ] Formal source-publication approval recorded.
- [ ] Explicit approval for the public-visibility change recorded.

Record approver identity, date, evidence reference, and any conditions in the
private approval system used by the owner or organization. Do not add private
review findings or sensitive disclosure patterns to this public repository.

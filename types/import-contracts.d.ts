/** Plugin API V1 field ownership policy. Runtime validation remains authoritative. */
export type FieldOwnershipPolicy =
  | 'source-owned'
  | 'user-owned'
  | 'source-default'
  | 'review-required';

export interface ManagedValue<T extends string | number | null = string | number | null> {
  readonly value: T;
  readonly ownership: FieldOwnershipPolicy;
}

export interface SourceArtifact {
  readonly schemaVersion: 'techsitemanager.io/source-artifact/v1';
  readonly providerId: string;
  readonly connectorId: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType: string;
  readonly receivedAt: string;
  readonly externalReference: string | null;
  readonly fields: Readonly<Record<string, string | number | boolean>>;
  readonly content: Buffer;
}

export interface SourceWarning {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'blocking';
  readonly path?: string | null;
  readonly count?: number | null;
}

export interface WorkPackageFields {
  readonly packageReference: ManagedValue<string>;
  readonly title: ManagedValue<string>;
  readonly externalReference?: ManagedValue<string | null>;
  readonly projectReference?: ManagedValue<string | null>;
  readonly description?: ManagedValue<string | null>;
  readonly status?: ManagedValue<string | null>;
}

export interface WorkItemFields {
  readonly itemReference: ManagedValue<string>;
  readonly title: ManagedValue<string>;
  readonly description?: ManagedValue<string | null>;
  readonly status?: ManagedValue<string | null>;
}

export interface CircuitFields {
  readonly circuitReference: ManagedValue<string>;
  readonly media: ManagedValue<string>;
  readonly description?: ManagedValue<string | null>;
  readonly status?: ManagedValue<string | null>;
}

export interface SegmentFields {
  readonly segmentReference: ManagedValue<string>;
  readonly fromEndpoint: ManagedValue<string>;
  readonly toEndpoint: ManagedValue<string>;
  readonly lengthMetres?: ManagedValue<number | null>;
  readonly notes?: ManagedValue<string | null>;
}

export interface WorkItemDraft {
  readonly sourceRecordKey: string;
  readonly sequenceHint?: number | null;
  readonly fields: WorkItemFields;
}

export interface SegmentDraft {
  readonly sourceRecordKey: string;
  readonly fields: SegmentFields;
}

export interface CircuitDraft {
  readonly sourceRecordKey: string;
  readonly fields: CircuitFields;
  readonly segments: readonly [SegmentDraft, ...SegmentDraft[]];
}

export interface WorkPackageDraft {
  readonly sourceRecordKey: string;
  readonly fields: WorkPackageFields;
  readonly workItems?: readonly WorkItemDraft[];
  readonly connections?: readonly CircuitDraft[];
}

export interface ImportDraft {
  readonly schemaVersion: 'techsitemanager.io/import-draft/v1';
  readonly providerId: string;
  readonly source: {
    readonly externalSourceId: string;
    readonly sourceVersion?: string | null;
  };
  readonly target: {
    readonly siteCode: string;
    readonly siteName: string;
  };
  readonly workPackage: WorkPackageDraft;
  readonly warnings?: readonly SourceWarning[];
}

/** Core-owned normalized form produced only after runtime validation. */
export interface ValidatedImportDraft {
  readonly schemaVersion: 'techsitemanager.io/import-draft/v1';
  readonly providerId: string;
  readonly providerVersion: string;
  readonly profileId: string | null;
  readonly profileHash: `sha256:${string}` | null;
  readonly source: {
    readonly externalSourceId: string;
    readonly sourceVersion: string | null;
    readonly contentHash: `sha256:${string}`;
    readonly connectorId: string;
  };
  readonly target: { readonly siteCode: string; readonly siteName: string };
  readonly workPackage: {
    readonly sourceRecordKey: string;
    readonly fields: Readonly<Record<string, ManagedValue>>;
    readonly workItems: readonly {
      readonly sourceRecordKey: string;
      readonly sequenceHint: number;
      readonly fields: Readonly<Record<string, ManagedValue>>;
    }[];
    readonly connections: readonly {
      readonly sourceRecordKey: string;
      readonly fields: Readonly<Record<string, ManagedValue>>;
      readonly segments: readonly {
        readonly sourceRecordKey: string;
        readonly fields: Readonly<Record<string, ManagedValue>>;
      }[];
    }[];
  };
  readonly warnings: readonly Required<SourceWarning>[];
}

export type ReconciliationEntityType =
  | 'work_package'
  | 'work_item'
  | 'circuit'
  | 'segment';

export type FieldDecision =
  | 'accept-source'
  | 'keep-current'
  | 'make-user-owned'
  | 'return-to-source'
  | 'defer';

export type AbsenceDecision = 'keep-linked-absent' | 'unlink-and-keep' | 'defer';

export interface ReconciliationFieldProposal {
  readonly fieldPath: string;
  readonly currentValue: unknown;
  readonly sourceValue: unknown;
  readonly ownership: FieldOwnershipPolicy;
  readonly conflict: boolean;
  readonly recommended: FieldDecision;
  readonly changed: boolean;
}

export interface ReconciliationEntityProposal {
  readonly proposalId: string;
  readonly entityType: ReconciliationEntityType;
  readonly sourceRecordKey: string;
  readonly entityPublicId: string | null;
  readonly action: 'create' | 'update' | 'unchanged';
  readonly parentSourceRecordKey: string | null;
  readonly sequence: number;
  readonly fields: readonly ReconciliationFieldProposal[];
}

export interface ReconciliationAbsenceProposal {
  readonly proposalId: string;
  readonly entityType: ReconciliationEntityType;
  readonly sourceRecordKey: string;
  readonly entityPublicId: string;
  readonly action: 'absent';
  readonly choices: readonly ['keep-linked-absent', 'unlink-and-keep', 'defer'];
}

export interface ReconciliationProposal {
  readonly schemaVersion: 'techsitemanager.io/reconciliation/v1';
  readonly draftId: string;
  readonly draftHash: `sha256:${string}`;
  readonly targetVersions: Readonly<Record<string, number>>;
  readonly entityProposals: readonly ReconciliationEntityProposal[];
  readonly absences: readonly ReconciliationAbsenceProposal[];
  readonly warnings: readonly SourceWarning[];
  readonly expiresAt: string;
  readonly appliedRunId?: number | null;
}

export interface ImportApproval {
  readonly schemaVersion: 'techsitemanager.io/import-approval/v1';
  readonly draftHash: `sha256:${string}`;
  readonly targetVersions: Readonly<Record<string, number>>;
  readonly fieldDecisions?: Readonly<Record<string, FieldDecision>>;
  readonly absenceDecisions?: Readonly<Record<string, AbsenceDecision>>;
  readonly acknowledgeWarnings?: readonly string[];
}

export interface ImportResultCounts {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly absent: number;
  readonly unlinked: number;
  readonly conflicted: number;
}

export interface ImportResult {
  readonly schemaVersion: 'techsitemanager.io/import-result/v1';
  readonly runId: string;
  readonly status: string;
  readonly workPackagePublicId: string | null;
  readonly counts: ImportResultCounts;
  readonly warningCodes: readonly string[];
  readonly appliedAt: string | null;
  readonly attemptCount: number;
}

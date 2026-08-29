export interface User { readonly id: number; readonly role: 'admin' | 'manager' | 'engineer' | 'viewer'; }
export interface AuthStatus { readonly user: User | null; readonly setupNeeded: boolean; }
export interface Site { readonly publicId: string; readonly code: string; readonly name: string; readonly description: string; }
export interface ExporterDescriptor { readonly id: string; readonly label: string; }
export interface WorkPackageSummary { readonly publicId: string; readonly packageReference: string; readonly title: string; readonly status: string; readonly siteCode: string; readonly siteName: string; readonly externalReference: string | null; readonly projectReference: string | null; }
export interface SearchRecord extends Partial<WorkPackageSummary> { readonly entityType?: string; readonly reference?: string; }
export interface SiteRecord { readonly name?: string; readonly label?: string; readonly hostname?: string; readonly endpointA?: string; readonly endpointB?: string; }
export interface WorkItem { readonly itemReference: string; readonly title: string; readonly status: string; }
export interface Segment { readonly fromEndpoint: string; readonly toEndpoint: string; }
export interface Circuit { readonly circuitReference: string; readonly media: string; readonly segments: readonly Segment[]; }
export interface Requirement { readonly description: string; readonly quantityRequired: number; readonly unit: string | null; }
export interface WorkPackage extends WorkPackageSummary { readonly description: string; readonly leadAssignee: string | null; readonly assignees: readonly string[]; readonly version: number; readonly workItems: readonly WorkItem[]; readonly circuits: readonly Circuit[]; readonly consumableRequirements: readonly Requirement[]; }
export interface DescriptorField { readonly id: string; readonly label: string; readonly type: 'string' | 'multiline' | 'integer' | 'boolean' | 'enum' | 'core-entity-selector'; readonly required?: boolean; readonly maxLength?: number; readonly options?: readonly string[]; }
export interface ProviderDescriptor { readonly id: string; readonly label: string; readonly input: { readonly type: 'file' | 'pasted-text' | 'external-reference'; readonly maxBytes: number; readonly mediaTypes: readonly string[]; readonly fields: readonly DescriptorField[]; }; }
export interface ReconciliationField { readonly fieldPath: string; readonly currentValue: unknown; readonly sourceValue: unknown; readonly ownership: string; readonly conflict: boolean; readonly recommended: string; readonly changed: boolean; }
export interface ReconciliationEntity { readonly proposalId: string; readonly entityType: string; readonly action: string; readonly sourceRecordKey: string; readonly fields: readonly ReconciliationField[]; }
export interface ReconciliationAbsence { readonly proposalId: string; readonly entityType: string; readonly sourceRecordKey: string; readonly choices: readonly string[]; }
export interface SourceWarning { readonly code: string; readonly severity: string; readonly count: number | null; }
export interface ReconciliationProposal { readonly draftId: string; readonly draftHash: string; readonly targetVersions: Readonly<Record<string, number>>; readonly entityProposals: readonly ReconciliationEntity[]; readonly absences: readonly ReconciliationAbsence[]; readonly warnings: readonly SourceWarning[]; }

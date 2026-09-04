export interface User { readonly publicId: string; readonly username: string; readonly displayName: string; readonly email: string | null; readonly role: 'admin' | 'manager' | 'engineer' | 'viewer'; readonly active: boolean; readonly version: number; }
export interface AuthStatus { readonly user: User | null; readonly setupNeeded: boolean; }
export interface Site { readonly publicId: string; readonly code: string; readonly name: string; readonly description: string; readonly version: number; }
export interface ExporterDescriptor { readonly id: string; readonly label: string; }
export interface PresentationField { readonly id: string; readonly entityType: 'work-package' | 'work-item' | 'circuit' | 'segment' | 'consumable-requirement'; readonly binding: string; readonly label: string; readonly type: 'string' | 'multiline' | 'date' | 'integer' | 'decimal' | 'boolean' | 'enum'; readonly required: boolean; readonly wide: boolean; readonly maxLength: number; readonly options: readonly string[]; }
export interface PresentationSection { readonly id: string; readonly label: string; readonly hint: string; readonly fields: readonly string[]; }
export interface PresentationView { readonly id: string; readonly label: string; readonly icon: string; readonly component: 'record-form' | 'child-record-tabs' | 'connection-schedule' | 'requirement-table' | 'material-summary'; readonly title: string; readonly description: string; readonly emptyTitle: string; readonly emptyDescription: string; readonly media: readonly string[]; readonly sections: readonly PresentationSection[]; readonly fields: readonly string[]; readonly circuitFields: readonly string[]; readonly segmentFields: readonly string[]; }
export interface PresentationProfile { readonly schemaVersion: 'techsitemanager.io/presentation-profile/v1'; readonly id: string; readonly entityType: 'work-package'; readonly pluginId: string; readonly hash: string; readonly terms: { readonly singular: string; readonly plural: string; readonly childSingular: string; readonly childPlural: string; }; readonly fields: readonly PresentationField[]; readonly views: readonly PresentationView[]; }
export interface WorkPackageSummary { readonly publicId: string; readonly packageReference: string; readonly title: string; readonly status: string; readonly sitePublicId: string; readonly siteCode: string; readonly siteName: string; readonly externalReference: string | null; readonly projectReference: string | null; }
export interface SearchRecord extends Partial<WorkPackageSummary> { readonly entityType?: 'work_package' | 'site' | 'room' | 'rack' | 'termination_point' | 'device' | 'distance'; readonly reference?: string; readonly description?: string; readonly group?: 'active' | 'completed'; readonly matchType?: string; readonly matchedWorkItems?: readonly { readonly publicId: string; readonly itemReference: string; readonly title: string; readonly status: string }[]; }
export interface SiteRecord {
  readonly publicId: string;
  readonly version: number;
  readonly name?: string;
  readonly description?: string;
  readonly label?: string;
  readonly hostname?: string;
  readonly endpointA?: string;
  readonly endpointB?: string;
  readonly roomPublicId?: string | null;
  readonly rackPublicId?: string | null;
  readonly suiteLine?: string;
  readonly suiteLineConfirmed?: boolean;
  readonly sizeUnits?: number;
  readonly rackUnit?: number | null;
  readonly side?: string;
  readonly deviceKey?: string;
  readonly kind?: string;
  readonly notes?: string;
  readonly trayCount?: number;
  readonly positionsPerTray?: number;
  readonly endpointADevicePublicId?: string | null;
  readonly endpointBDevicePublicId?: string | null;
  readonly endpointARackPublicId?: string | null;
  readonly endpointBRackPublicId?: string | null;
  readonly media?: string;
  readonly lengthMetres?: number;
  readonly observedAt?: string;
}
export interface TerminationPosition { readonly publicId: string; readonly tray: number; readonly position: number; readonly label: string; readonly version: number; }
export interface PhotoRecord { readonly publicId: string; readonly name: string; readonly description: string; readonly mediaType: string; readonly current: boolean; readonly version: number; readonly createdAt: string; }
export type ExtensionValues = Readonly<Record<string, { readonly value: unknown; readonly version: number }>>;
export interface CompletionActor { readonly publicId: string; readonly displayName: string; }
export interface WorkItem { publicId: string; itemReference: string; title: string; description: string; status: string; sequence: number; leadAssignee: string | null; assignees: string[]; completedAt: string | null; completedBy: CompletionActor | null; handoverPhotos: PhotoRecord[]; version: number; readonly extensions: ExtensionValues; }
export type CableEndpointMode = 'legacy' | 'device' | 'odf';
export interface Segment {
  publicId: string; segmentReference: string; sequence: number;
  fromEndpoint: string; fromEndpointMode: CableEndpointMode; fromDevicePublicId: string | null; fromTerminationPositionPublicId: string | null; fromTerminationPointPublicId: string | null; fromPort: string; fromRoomPublicId: string | null; fromRoomName: string | null; fromRackPublicId: string | null; fromRackLabel: string | null;
  toEndpoint: string; toEndpointMode: CableEndpointMode; toDevicePublicId: string | null; toTerminationPositionPublicId: string | null; toTerminationPointPublicId: string | null; toPort: string; toRoomPublicId: string | null; toRoomName: string | null; toRackPublicId: string | null; toRackLabel: string | null;
  fromConnector: string; toConnector: string; lengthMetres: number | null; notes: string;
  fibreType: string; fibreMode: string; fibreSimplex: boolean; stockLengthMetres: number | null; itemType: string;
  copperCategory: string; copperShielding: string; copperPinout: string;
  dacConnector: string; dacMedia: string; dacDirection: string;
  version: number; readonly extensions: ExtensionValues;
}
export interface Circuit { publicId: string; circuitReference: string; description: string; media: string; status: string; version: number; readonly extensions: ExtensionValues; segments: Segment[]; }
export interface Requirement { publicId: string; cataloguePublicId: string | null; description: string; quantityRequired: number; unit: string | null; version: number; readonly extensions: ExtensionValues; }
export interface NewScheduleRack { publicId: string; roomPublicId: string; label: string; suiteLine: string; suiteLineConfirmed: boolean; sizeUnits: number; }
export interface ScheduleRackChange { devicePublicId: string; _baseDeviceVersion: number; targetRackPublicId?: string; newRack?: NewScheduleRack; }
export interface WorkPackage { publicId: string; readonly site: { readonly publicId: string; readonly code: string; readonly name: string; }; packageReference: string; externalReference: string | null; projectReference: string | null; title: string; description: string; status: string; leadAssignee: string | null; assignees: string[]; completedAt: string | null; completedBy: CompletionActor | null; handoverPhotos: PhotoRecord[]; version: number; readonly extensions: ExtensionValues; workItems: WorkItem[]; circuits: Circuit[]; consumableRequirements: Requirement[]; scheduleRackChanges: ScheduleRackChange[]; }
export interface CableReferenceData {
  readonly rooms: readonly { readonly publicId: string; readonly name: string; readonly version: number }[];
  readonly racks: readonly { readonly publicId: string; readonly roomPublicId: string | null; readonly label: string; readonly suiteLine: string; readonly suiteLineConfirmed: boolean; readonly sizeUnits: number; readonly version: number }[];
  readonly devices: readonly { readonly publicId: string; readonly roomPublicId: string | null; readonly rackPublicId: string | null; readonly hostname: string; readonly label: string; readonly deviceKey: string; readonly version: number }[];
  readonly terminationPoints: readonly { readonly publicId: string; readonly roomPublicId: string | null; readonly label: string; readonly kind: string; readonly version: number; readonly positions: readonly TerminationPosition[] }[];
}
export interface DescriptorField { readonly id: string; readonly label: string; readonly type: 'string' | 'multiline' | 'integer' | 'boolean' | 'enum' | 'core-entity-selector'; readonly required?: boolean; readonly maxLength?: number; readonly options?: readonly string[]; }
export interface ProviderDescriptor { readonly id: string; readonly label: string; readonly input: { readonly type: 'file' | 'pasted-text' | 'external-reference'; readonly maxBytes: number; readonly mediaTypes: readonly string[]; readonly fields: readonly DescriptorField[]; }; }
export interface ReconciliationField { readonly fieldPath: string; readonly currentValue: unknown; readonly sourceValue: unknown; readonly ownership: string; readonly conflict: boolean; readonly recommended: string; readonly changed: boolean; }
export interface ReconciliationEntity { readonly proposalId: string; readonly entityType: string; readonly action: string; readonly sourceRecordKey: string; readonly fields: readonly ReconciliationField[]; }
export interface ReconciliationAbsence { readonly proposalId: string; readonly entityType: string; readonly sourceRecordKey: string; readonly choices: readonly string[]; }
export interface SourceWarning { readonly code: string; readonly severity: string; readonly count: number | null; }
export interface ReconciliationProposal { readonly draftId: string; readonly draftHash: string; readonly targetVersions: Readonly<Record<string, number>>; readonly entityProposals: readonly ReconciliationEntity[]; readonly absences: readonly ReconciliationAbsence[]; readonly warnings: readonly SourceWarning[]; readonly summary?: { readonly siteCode: string; readonly siteName: string; readonly packageReference: string | null; readonly title: string | null; }; }
export interface ImportResultCounts { readonly created: number; readonly updated: number; readonly unchanged: number; readonly absent: number; readonly unlinked: number; readonly conflicted: number; }
export interface ImportResult { readonly schemaVersion: 'techsitemanager.io/import-result/v1'; readonly runId: string; readonly status: string; readonly workPackagePublicId: string | null; readonly counts: ImportResultCounts; readonly warningCodes: readonly string[]; readonly appliedAt: string | null; readonly attemptCount: number; }

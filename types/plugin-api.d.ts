import type { ImportDraft, SourceArtifact } from './import-contracts';

export interface PluginManifest {
  readonly apiVersion: 1 | 2;
  readonly id: string;
  readonly version: string;
  readonly coreCompatibility: string;
}

export type PluginInstanceConfig = Readonly<Record<string, unknown>>;

export interface PluginConfigEntry {
  readonly package: string;
  readonly required: boolean;
  readonly expectedVersion: string;
  readonly config?: PluginInstanceConfig;
}

export interface PluginConfiguration {
  readonly plugins: readonly PluginConfigEntry[];
}

export type DescriptorFieldType =
  | 'string'
  | 'multiline'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'core-entity-selector';

interface DescriptorFieldBase {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly maxLength?: number;
}

export type DescriptorField =
  | (DescriptorFieldBase & {
      readonly type: 'enum';
      readonly options: readonly [string, ...string[]];
    })
  | (DescriptorFieldBase & {
      readonly type: Exclude<DescriptorFieldType, 'enum'>;
      readonly options?: readonly string[];
    });

interface ProviderInputBase {
  readonly maxBytes: number;
  readonly fields?: readonly DescriptorField[];
}

export type ProviderInputDescriptor =
  | (ProviderInputBase & {
      readonly type: 'file';
      readonly mediaTypes: readonly [string, ...string[]];
    })
  | (ProviderInputBase & {
      readonly type: 'pasted-text' | 'external-reference';
      readonly mediaTypes?: readonly string[];
    });

export interface PluginLogEvent {
  readonly code?: string;
}

export interface PluginLogger {
  info(event: PluginLogEvent): void;
  warn(event: PluginLogEvent): void;
}

export interface ImportProfile {
  readonly schemaVersion: 'techsitemanager.io/import-profile/v1';
  readonly id: string;
  readonly aliases?: Readonly<Record<string, unknown>>;
  readonly mappings?: Readonly<Record<string, unknown>>;
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly statusMap?: Readonly<Record<string, unknown>>;
  readonly categoryMap?: Readonly<Record<string, unknown>>;
  readonly fieldOwnership?: Readonly<Record<string, import('./import-contracts').FieldOwnershipPolicy>>;
  readonly identity?: Readonly<Record<string, unknown>>;
  readonly transforms?: readonly string[];
  readonly hash?: `sha256:${string}`;
}

export type NamedTransform = (value: unknown) => unknown;

export interface ProviderContext {
  readonly abortSignal: AbortSignal;
  readonly now: () => string;
  readonly logger: PluginLogger;
  readonly profile: ImportProfile | null;
  readonly transforms: Readonly<Record<string, NamedTransform>>;
}

export type ImportTransform = (
  artifact: SourceArtifact,
  context: ProviderContext
) => ImportDraft | Promise<ImportDraft>;

export interface ImportProvider {
  readonly id: string;
  readonly label: string;
  readonly input: ProviderInputDescriptor;
  readonly profileId?: string;
  readonly connectorId?: string;
  readonly transform: ImportTransform;
}

export interface ExternalSourceReference {
  readonly externalReference: string;
  readonly fields: Readonly<Record<string, string | number | boolean>>;
}

export interface ConnectorContext {
  readonly abortSignal: AbortSignal;
  readonly now: () => string;
}

export interface AcquiredSourceArtifact {
  readonly content: Buffer;
  readonly mediaType: string;
}

export interface SourceConnector {
  readonly id: string;
  acquire(
    reference: ExternalSourceReference,
    context: ConnectorContext
  ): AcquiredSourceArtifact | Promise<AcquiredSourceArtifact>;
}

export interface YamlProfileReference {
  readonly id: string;
  readonly file: string;
}

export type YAMLProfileReference = YamlProfileReference;

export type PresentationEntityType =
  | 'work-package'
  | 'work-item'
  | 'circuit'
  | 'segment'
  | 'consumable-requirement';

export type PresentationComponent =
  | 'record-form'
  | 'child-record-tabs'
  | 'connection-schedule'
  | 'requirement-table'
  | 'material-summary';

export type PresentationFieldType =
  | 'string'
  | 'multiline'
  | 'date'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'enum';

export interface PresentationField {
  readonly id: string;
  readonly entityType: PresentationEntityType;
  readonly binding: `core.${string}` | `extension.${string}`;
  readonly label: string;
  readonly type: PresentationFieldType;
  readonly required: boolean;
  readonly wide: boolean;
  readonly maxLength: number;
  readonly options: readonly string[];
}

export interface PresentationSection {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly fields: readonly string[];
}

export interface PresentationView {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly component: PresentationComponent;
  readonly title: string;
  readonly description: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly media: readonly string[];
  readonly sections: readonly PresentationSection[];
  readonly fields: readonly string[];
  readonly circuitFields: readonly string[];
  readonly segmentFields: readonly string[];
}

export interface PresentationProfile {
  readonly schemaVersion: 'techsitemanager.io/presentation-profile/v1';
  readonly id: string;
  readonly entityType: 'work-package';
  readonly pluginId: string;
  readonly hash?: `sha256:${string}`;
  readonly terms: {
    readonly singular: string;
    readonly plural: string;
    readonly childSingular: string;
    readonly childPlural: string;
  };
  readonly fields: readonly PresentationField[];
  readonly views: readonly PresentationView[];
}

export interface PresentationProfileReference {
  readonly id: string;
  readonly file: string;
}

export interface ExportWorkItem {
  readonly publicId: string;
  readonly itemReference: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly sequence: number;
  readonly version: number;
  readonly extensions: Readonly<Record<string, { readonly value: unknown; readonly version: number }>>;
}

export interface ExportSegment {
  readonly publicId: string;
  readonly segmentReference: string;
  readonly sequence: number;
  readonly fromEndpoint: string;
  readonly toEndpoint: string;
  readonly lengthMetres: number | null;
  readonly notes: string;
  readonly version: number;
  readonly extensions: Readonly<Record<string, { readonly value: unknown; readonly version: number }>>;
}

export interface ExportCircuit {
  readonly publicId: string;
  readonly circuitReference: string;
  readonly description: string;
  readonly media: string;
  readonly status: string;
  readonly version: number;
  readonly extensions: Readonly<Record<string, { readonly value: unknown; readonly version: number }>>;
  readonly segments: readonly ExportSegment[];
}

export interface ExportConsumableRequirement {
  readonly publicId: string;
  readonly cataloguePublicId: string | null;
  readonly description: string;
  readonly quantityRequired: number;
  readonly unit: string | null;
  readonly version: number;
  readonly extensions: Readonly<Record<string, { readonly value: unknown; readonly version: number }>>;
}

export interface WorkPackageProjection {
  readonly publicId: string;
  readonly site: { readonly publicId: string; readonly code: string; readonly name: string };
  readonly packageReference: string;
  readonly externalReference: string | null;
  readonly projectReference: string | null;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly leadAssignee: string | null;
  readonly assignees: readonly string[];
  readonly version: number;
  readonly extensions: Readonly<Record<string, { readonly value: unknown; readonly version: number }>>;
  readonly workItems: readonly ExportWorkItem[];
  readonly circuits: readonly ExportCircuit[];
  readonly consumableRequirements: readonly ExportConsumableRequirement[];
}

export interface ExporterContext {
  readonly abortSignal: AbortSignal;
}

export interface ExportResult {
  readonly content: Buffer;
}

export interface Exporter {
  readonly id: string;
  readonly label: string;
  readonly mediaType: string;
  readonly fileExtension: string;
  readonly maxBytes: number;
  export(
    workPackage: WorkPackageProjection,
    context: ExporterContext
  ): ExportResult | Promise<ExportResult>;
}

export interface PluginPackage {
  readonly manifest: PluginManifest;
  readonly configSchema?: boolean | Readonly<Record<string, unknown>>;
  readonly imports?: readonly ImportProvider[];
  readonly connectors?: readonly SourceConnector[];
  readonly transforms?: Readonly<Record<string, NamedTransform>>;
  readonly profiles?: readonly YAMLProfileReference[];
  /** Plugin API V2 only. Data is loaded and strictly validated by core. */
  readonly presentations?: readonly PresentationProfileReference[];
  readonly exporters?: readonly Exporter[];
}

export interface ProviderDescriptor {
  readonly id: string;
  readonly label: string;
  readonly input: ProviderInputDescriptor & { readonly fields: readonly DescriptorField[] };
}

export interface ExporterDescriptor {
  readonly id: string;
  readonly label: string;
  readonly mediaType: string;
  readonly fileExtension: string;
}

export interface LoadedImportProvider extends ImportProvider {
  readonly pluginId: string;
  readonly providerVersion: string;
}

export interface LoadedSourceConnector extends SourceConnector {
  readonly pluginId: string;
}

export interface LoadedExporter extends Exporter {
  readonly pluginId: string;
}

export interface LoadedPlugin extends PluginManifest {
  readonly package: string;
  readonly config: PluginInstanceConfig;
}

export interface PluginRegistry {
  readonly providers: readonly ProviderDescriptor[];
  readonly exporters: readonly ExporterDescriptor[];
  readonly presentations: readonly PresentationProfile[];
  readonly degraded: readonly { readonly package: string; readonly code: string }[];
  provider(id: string): LoadedImportProvider | undefined;
  connector(id: string): LoadedSourceConnector | undefined;
  exporter(id: string): LoadedExporter | undefined;
  transform(id: string): NamedTransform | undefined;
  profile(id: string): ImportProfile | undefined;
  presentation(id: string): PresentationProfile | undefined;
  presentationFor(entityType: string): PresentationProfile | undefined;
  plugin(id: string): LoadedPlugin | undefined;
}

interface OfflineOperation {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly body?: string | null;
  readonly createdAt?: number;
  readonly operationKey?: string | null;
  readonly entityType?: string | null;
  readonly entityPublicId?: string | null;
  readonly label?: string | null;
  readonly status?: number;
  readonly reason?: string;
  readonly serverCode?: string | null;
  readonly serverMessage?: string | null;
  readonly serverVersion?: number | null;
}

declare const OfflineStore: {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, value: unknown, key?: string): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  all(store: string): Promise<OfflineOperation[]>;
  updateOperation(id: string, changes: Record<string, unknown>): Promise<void>;
  retryDeadLetter(id: string): Promise<void>;
};

declare const OfflineSync: {
  replay(store: typeof OfflineStore, request: typeof fetch): Promise<unknown>;
};

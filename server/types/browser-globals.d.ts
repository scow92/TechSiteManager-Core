interface OfflineOperation {
  readonly id: string;
  readonly method: string;
  readonly path: string;
}

declare const OfflineStore: {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, value: unknown, key?: string): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  all(store: string): Promise<OfflineOperation[]>;
  retryDeadLetter(id: string): Promise<void>;
};

declare const OfflineSync: {
  replay(store: typeof OfflineStore, request: typeof fetch): Promise<unknown>;
};

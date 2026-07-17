import type { CanvasElement, GenerationItem, WorkflowGroup } from './types';

const DATABASE_NAME = 'banana-canvas';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const ACTIVE_SESSION_KEY = 'banana-canvas.active-session';

export interface CanvasSession {
  id: string;
  name: string;
  elements: CanvasElement[];
  generationItems: GenerationItem[];
  workflowGroups: WorkflowGroup[];
  trashedElements: CanvasElement[];
  lastAnnotationPreview: string | null;
  createdAt: number;
  updatedAt: number;
}

export type CanvasSessionSummary = Pick<CanvasSession, 'id' | 'name' | 'createdAt' | 'updatedAt'>;

const createSessionId = () => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(SESSION_STORE)) {
      database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Unable to open the canvas database.'));
});

const runRequest = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(SESSION_STORE, mode);
      const request = action(transaction.objectStore(SESSION_STORE));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('Canvas database request failed.'));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('Canvas database transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Canvas database transaction was aborted.'));
    });
  } finally {
    database.close();
  }
};

export const createCanvasSession = (
  name: string,
  elements: CanvasElement[],
): CanvasSession => {
  const now = Date.now();
  return {
    id: createSessionId(),
    name,
    elements,
    generationItems: [],
    workflowGroups: [],
    trashedElements: [],
    lastAnnotationPreview: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const getCanvasSession = (id: string) => runRequest<CanvasSession | undefined>(
  'readonly',
  store => store.get(id),
);

export const listCanvasSessions = async (): Promise<CanvasSessionSummary[]> => {
  const sessions = await runRequest<CanvasSession[]>('readonly', store => store.getAll());
  return sessions
    .map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const saveCanvasSession = (session: CanvasSession) => runRequest<IDBValidKey>(
  'readwrite',
  store => store.put(session),
);

export const deleteCanvasSession = (id: string) => runRequest<undefined>(
  'readwrite',
  store => store.delete(id),
);

export const getActiveSessionId = () => localStorage.getItem(ACTIVE_SESSION_KEY);

export const setActiveSessionId = (id: string) => localStorage.setItem(ACTIVE_SESSION_KEY, id);

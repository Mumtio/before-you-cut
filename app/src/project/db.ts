import type { ProjectFile, ProjectSummary } from './format';

/**
 * Projects hold full-size PNGs, which localStorage cannot take, so they live in
 * IndexedDB. Summaries are kept in a second store so the picker can list
 * projects without pulling megabytes of image data.
 */
const DB_NAME = 'sampleroom';
const DB_VERSION = 1;
const DOCS = 'projects';
const INDEX = 'summaries';
const LAST_OPENED = 'sampleroom.lastProject';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(INDEX)) db.createObjectStore(INDEX, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveProject(doc: ProjectFile): Promise<void> {
  await run(DOCS, 'readwrite', (s) => s.put(doc));
  await run(INDEX, 'readwrite', (s) =>
    s.put({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt } satisfies ProjectSummary),
  );
}

export function loadProject(id: string): Promise<ProjectFile | undefined> {
  return run<ProjectFile | undefined>(DOCS, 'readonly', (s) => s.get(id));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await run<ProjectSummary[]>(INDEX, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await run(DOCS, 'readwrite', (s) => s.delete(id));
  await run(INDEX, 'readwrite', (s) => s.delete(id));
}

export function rememberLastOpened(id: string) {
  try {
    localStorage.setItem(LAST_OPENED, id);
  } catch {
    // Not worth failing over.
  }
}

export function getLastOpened(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED);
  } catch {
    return null;
  }
}

// Minimal promise wrapper around a single IndexedDB key/value store.
const DB_NAME = "pointless";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        // Let other tabs delete the database (see clearAllLocalData)
        request.result.onversionchange = () => {
          writesDisabled = true;
          request.result.close();
          dbPromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
    // Private windows or blocked storage: fall back to an in-memory store
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

const memory = new Map<string, unknown>();
// Set while wiping data, so pending saves (e.g. on pagehide) can't recreate it
let writesDisabled = false;

// Tell other open tabs when data is cleared so they start fresh too
const channel = "BroadcastChannel" in window ? new BroadcastChannel("pointless") : null;
channel?.addEventListener("message", (e) => {
  if (e.data === "cleared") {
    writesDisabled = true;
    location.reload();
  }
});

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = fn(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>("readonly", (s) => s.get(key));
  } catch {
    return memory.get(key) as T | undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  if (writesDisabled) return;
  memory.set(key, value);
  try {
    await run("readwrite", (s) => s.put(value, key));
  } catch {
    // memory fallback already updated
  }
}

export async function idbDelete(key: string): Promise<void> {
  memory.delete(key);
  try {
    await run("readwrite", (s) => s.delete(key));
  } catch {
    // ignore
  }
}

export async function idbKeys(prefix: string): Promise<string[]> {
  try {
    const keys = await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return keys.map(String).filter((k) => k.startsWith(prefix));
  } catch {
    return [...memory.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** Deletes the whole database (and localStorage) for this site. */
export async function clearAllLocalData(): Promise<void> {
  writesDisabled = true;
  memory.clear();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // storage unavailable
  }
  const db = await dbPromise?.catch(() => null);
  db?.close();
  dbPromise = null;
  // Other tabs close their connection on versionchange; don't hang if one can't
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = () => resolve();
    setTimeout(resolve, 3000);
  });
  channel?.postMessage("cleared");
}

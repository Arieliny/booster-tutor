/**
 * Tiny IndexedDB wrapper. Three stores:
 *   - cubes:    key = cube.id (string)        value = Cube
 *   - sessions: key = cube.id (string)        value = CubeSession
 *   - meta:     key-value pairs (selectedCubeId, etc.)
 */

import type { Cube, CubeSession } from "../types";

const DB_NAME = "booster-tutor";
const DB_VERSION = 2;

const STORE_CUBES = "cubes";
const STORE_SESSIONS = "sessions";
const STORE_META = "meta";
const STORE_INVENTORIES = "inventories";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CUBES)) {
        db.createObjectStore(STORE_CUBES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_INVENTORIES)) {
        db.createObjectStore(STORE_INVENTORIES);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const result = fn(store);
        if (result instanceof Promise) {
          result.then(resolve, reject);
          return;
        }
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      }),
  );
}

// ---------- cubes ----------

export async function getAllCubes(): Promise<Cube[]> {
  return tx(STORE_CUBES, "readonly", (s) => s.getAll() as IDBRequest<Cube[]>);
}

export async function getCube(id: string): Promise<Cube | undefined> {
  return tx(STORE_CUBES, "readonly", (s) => s.get(id) as IDBRequest<Cube | undefined>);
}

export async function putCube(cube: Cube): Promise<void> {
  await tx(STORE_CUBES, "readwrite", (s) => s.put(cube) as IDBRequest<IDBValidKey>);
}

export async function deleteCube(id: string): Promise<void> {
  await tx(STORE_CUBES, "readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
  // Also drop any session and inventory for that cube.
  await tx(STORE_SESSIONS, "readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
  await tx(STORE_INVENTORIES, "readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

// ---------- sessions ----------

export async function getSession(cubeId: string): Promise<CubeSession | undefined> {
  return tx(STORE_SESSIONS, "readonly", (s) =>
    s.get(cubeId) as IDBRequest<CubeSession | undefined>,
  );
}

export async function putSession(cubeId: string, session: CubeSession): Promise<void> {
  await tx(STORE_SESSIONS, "readwrite", (s) =>
    s.put(session, cubeId) as IDBRequest<IDBValidKey>,
  );
}

export async function clearSession(cubeId: string): Promise<void> {
  await tx(STORE_SESSIONS, "readwrite", (s) => s.delete(cubeId) as IDBRequest<undefined>);
}

// ---------- meta ----------

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return tx(STORE_META, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await tx(STORE_META, "readwrite", (s) =>
    s.put(value as unknown, key) as IDBRequest<IDBValidKey>,
  );
}

// ---------- inventories ----------

export async function getInventory(cubeId: string): Promise<string[] | undefined> {
  return tx(STORE_INVENTORIES, "readonly", (s) =>
    s.get(cubeId) as IDBRequest<string[] | undefined>,
  );
}

export async function putInventory(cubeId: string, ids: string[]): Promise<void> {
  await tx(STORE_INVENTORIES, "readwrite", (s) =>
    s.put(ids, cubeId) as IDBRequest<IDBValidKey>,
  );
}

export async function clearInventory(cubeId: string): Promise<void> {
  await tx(STORE_INVENTORIES, "readwrite", (s) =>
    s.delete(cubeId) as IDBRequest<undefined>,
  );
}

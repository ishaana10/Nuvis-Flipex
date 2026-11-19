/**
 * Nuvis Flipex Studio — IndexedDB Offline Storage & Resiliency Engine
 * Provides multi-megabyte structured cloning storage for 50+ page documents,
 * preventing localStorage 5MB quota errors during offline design sessions.
 */

export interface StudioOfflineDraft {
  docId: number;
  title: string;
  pages: any[];
  timestamp: string;
  revision?: number;
  pendingSync?: boolean;
}

const DB_NAME = 'NuvisFlipexStudio';
const DB_VERSION = 1;
const STORE_NAME = 'offline_drafts';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'docId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveOfflineDraft(draft: StudioOfflineDraft): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(draft);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Graceful fallback to localStorage if IndexedDB is blocked
    try {
      localStorage.setItem(`flipex_studio_draft_${draft.docId}`, JSON.stringify(draft));
    } catch {}
  }
}

export async function getOfflineDraft(docId: number): Promise<StudioOfflineDraft | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(docId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(`flipex_studio_draft_${docId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function clearOfflineDraft(docId: number): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(docId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    try {
      localStorage.removeItem(`flipex_studio_draft_${docId}`);
    } catch {}
  }
}

export async function listAllOfflineDrafts(): Promise<StudioOfflineDraft[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

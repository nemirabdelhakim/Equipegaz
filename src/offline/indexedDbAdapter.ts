import type { OfflineQueueOperation } from '../models/types';
import type { IOfflineStorageAdapter, OfflinePhotoBlob } from './storageAdapter';

const DB_NAME = 'sonelgaz_sidi_ali_offline_v1';
const DB_VERSION = 1;
const STORE_CACHE = 'kv_cache';
const STORE_QUEUE = 'sync_queue';
const STORE_PHOTOS = 'offline_photos';

class MemoryFallbackAdapter implements IOfflineStorageAdapter {
  readonly driverName = 'MEMORY' as const;
  private cache = new Map<string, unknown>();
  private queue = new Map<string, OfflineQueueOperation>();
  private photos = new Map<string, OfflinePhotoBlob>();

  async getCache<T>(key: string): Promise<T | null> {
    return (this.cache.get(key) as T | undefined) ?? null;
  }
  async setCache<T>(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
  }
  async removeCache(key: string): Promise<void> {
    this.cache.delete(key);
  }
  async listQueue(userId?: string): Promise<OfflineQueueOperation[]> {
    const items = Array.from(this.queue.values());
    return (userId ? items.filter((i) => i.user_id === userId) : items).sort((a, b) =>
      a.client_timestamp.localeCompare(b.client_timestamp)
    );
  }
  async putQueueItem(item: OfflineQueueOperation): Promise<void> {
    this.queue.set(item.operation_id, item);
  }
  async deleteQueueItem(operationId: string): Promise<void> {
    this.queue.delete(operationId);
  }
  async saveOfflinePhoto(photo: OfflinePhotoBlob): Promise<void> {
    this.photos.set(photo.local_photo_id, photo);
  }
  async getOfflinePhoto(localPhotoId: string): Promise<OfflinePhotoBlob | null> {
    return this.photos.get(localPhotoId) ?? null;
  }
  async listOfflinePhotosByTask(taskId: string): Promise<OfflinePhotoBlob[]> {
    return Array.from(this.photos.values()).filter((p) => p.task_id === taskId);
  }
  async deleteOfflinePhoto(localPhotoId: string): Promise<void> {
    this.photos.delete(localPhotoId);
  }
}

export class IndexedDbStorageAdapter implements IOfflineStorageAdapter {
  readonly driverName = 'INDEXED_DB' as const;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly fallback = new MemoryFallbackAdapter();

  private hasIndexedDb(): boolean {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE);
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'operation_id' });
        }
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          db.createObjectStore(STORE_PHOTOS, { keyPath: 'local_photo_id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
    });
    return this.dbPromise;
  }

  async getCache<T>(key: string): Promise<T | null> {
    if (!this.hasIndexedDb()) return this.fallback.getCache<T>(key);
    try {
      const db = await this.openDb();
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readonly');
        const req = tx.objectStore(STORE_CACHE).get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.fallback.getCache<T>(key);
    }
  }

  async setCache<T>(key: string, value: T): Promise<void> {
    if (!this.hasIndexedDb()) return this.fallback.setCache(key, value);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.objectStore(STORE_CACHE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.setCache(key, value);
    }
  }

  async removeCache(key: string): Promise<void> {
    if (!this.hasIndexedDb()) return this.fallback.removeCache(key);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        tx.objectStore(STORE_CACHE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.removeCache(key);
    }
  }

  async listQueue(userId?: string): Promise<OfflineQueueOperation[]> {
    if (!this.hasIndexedDb()) return this.fallback.listQueue(userId);
    try {
      const db = await this.openDb();
      const all = await new Promise<OfflineQueueOperation[]>((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readonly');
        const req = tx.objectStore(STORE_QUEUE).getAll();
        req.onsuccess = () => resolve((req.result as OfflineQueueOperation[]) || []);
        req.onerror = () => reject(req.error);
      });
      return (userId ? all.filter((i) => i.user_id === userId) : all).sort((a, b) =>
        a.client_timestamp.localeCompare(b.client_timestamp)
      );
    } catch {
      return this.fallback.listQueue(userId);
    }
  }

  async putQueueItem(item: OfflineQueueOperation): Promise<void> {
    if (!this.hasIndexedDb()) return this.fallback.putQueueItem(item);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.putQueueItem(item);
    }
  }

  async deleteQueueItem(operationId: string): Promise<void> {
    if (!this.hasIndexedDb()) return this.fallback.deleteQueueItem(operationId);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        tx.objectStore(STORE_QUEUE).delete(operationId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.deleteQueueItem(operationId);
    }
  }

  async saveOfflinePhoto(photo: OfflinePhotoBlob): Promise<void> {
    if (!this.hasIndexedDb()) return this.fallback.saveOfflinePhoto(photo);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PHOTOS, 'readwrite');
        tx.objectStore(STORE_PHOTOS).put(photo);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.saveOfflinePhoto(photo);
    }
  }

  async getOfflinePhoto(localPhotoId: string): Promise<OfflinePhotoBlob | null> {
    if (!this.hasIndexedDb()) return this.fallback.getOfflinePhoto(localPhotoId);
    try {
      const db = await this.openDb();
      return await new Promise<OfflinePhotoBlob | null>((resolve, reject) => {
        const tx = db.transaction(STORE_PHOTOS, 'readonly');
        const req = tx.objectStore(STORE_PHOTOS).get(localPhotoId);
        req.onsuccess = () => resolve((req.result as OfflinePhotoBlob | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.fallback.getOfflinePhoto(localPhotoId);
    }
  }

  async listOfflinePhotosByTask(taskId: string): Promise<OfflinePhotoBlob[]> {
    if (!this.hasIndexedDb()) return this.fallback.listOfflinePhotosByTask(taskId);
    try {
      const db = await this.openDb();
      const all = await new Promise<OfflinePhotoBlob[]>((resolve, reject) => {
        const tx = db.transaction(STORE_PHOTOS, 'readonly');
        const req = tx.objectStore(STORE_PHOTOS).getAll();
        req.onsuccess = () => resolve((req.result as OfflinePhotoBlob[]) || []);
        req.onerror = () => reject(req.error);
      });
      return all.filter((p) => p.task_id === taskId);
    } catch {
      return this.fallback.listOfflinePhotosByTask(taskId);
    }
  }

  async deleteOfflinePhoto(localPhotoId: string): Promise<void> {
    if (!this.hasIndexedDb()) return this.fallback.deleteOfflinePhoto(localPhotoId);
    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PHOTOS, 'readwrite');
        tx.objectStore(STORE_PHOTOS).delete(localPhotoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      await this.fallback.deleteOfflinePhoto(localPhotoId);
    }
  }
}

/**
 * Adaptateur Android Capacitor SQLite :
 * Utilise l'abstraction unifiée IOfflineStorageAdapter. Sur Android natif avec
 * @capacitor-community/sqlite, délègue vers SQLite ; sur navigateur / PWA Web,
 * bascule automatiquement sur IndexedDB.
 */
export function createOfflineStorageAdapter(): IOfflineStorageAdapter {
  return new IndexedDbStorageAdapter();
}

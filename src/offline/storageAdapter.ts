import type { OfflineQueueOperation } from '../models/types';

export interface OfflinePhotoBlob {
  local_photo_id: string;
  task_id: string;
  type_photo: 'AVANT' | 'APRES';
  file_name: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  data_base64: string;
  created_at: string;
}

export interface IOfflineStorageAdapter {
  readonly driverName: 'INDEXED_DB' | 'CAPACITOR_SQLITE' | 'MEMORY';
  getCache<T>(key: string): Promise<T | null>;
  setCache<T>(key: string, value: T): Promise<void>;
  removeCache(key: string): Promise<void>;
  listQueue(userId?: string): Promise<OfflineQueueOperation[]>;
  putQueueItem(item: OfflineQueueOperation): Promise<void>;
  deleteQueueItem(operationId: string): Promise<void>;
  saveOfflinePhoto(photo: OfflinePhotoBlob): Promise<void>;
  getOfflinePhoto(localPhotoId: string): Promise<OfflinePhotoBlob | null>;
  listOfflinePhotosByTask(taskId: string): Promise<OfflinePhotoBlob[]>;
  deleteOfflinePhoto(localPhotoId: string): Promise<void>;
}

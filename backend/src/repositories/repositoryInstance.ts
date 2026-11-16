import { GoogleSyncService } from '../services/googleSyncService.js';
import { GoogleSheetsRepository } from './GoogleSheetsRepository.js';
import type { IDataRepository } from './interfaces.js';

let repositoryInstance: GoogleSheetsRepository | null = null;
let syncServiceInstance: GoogleSyncService | null = null;

function ensureInitialized(): void {
  if (!repositoryInstance) {
    repositoryInstance = new GoogleSheetsRepository();
    syncServiceInstance = new GoogleSyncService(repositoryInstance);
    repositoryInstance.attachSyncService(syncServiceInstance);
  }
}

export function getDataRepository(): IDataRepository {
  ensureInitialized();
  return repositoryInstance!;
}

export function getGoogleSyncService(): GoogleSyncService {
  ensureInitialized();
  return syncServiceInstance!;
}

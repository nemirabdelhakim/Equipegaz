import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getGoogleSyncService } from '../repositories/repositoryInstance.js';
import { GoogleApiError } from '../services/googleSheetsClient.js';

function extractGoogleAccessToken(req: AuthenticatedRequest): string | undefined {
  const header = req.headers['x-google-access-token'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  return undefined;
}

export async function getStorageStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const syncService = getGoogleSyncService();
  res.json(syncService.getStatus());
}

export async function connectGoogleWorkspace(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(400).json({
      error: 'MISSING_GOOGLE_TOKEN',
      message: 'Jeton Google Workspace manquant dans X-Google-Access-Token.',
    });
    return;
  }

  try {
    const syncService = getGoogleSyncService();
    const result = await syncService.connectWithOAuthToken(accessToken, req.currentUser);
    res.json(result);
  } catch (err) {
    if (err instanceof GoogleApiError) {
      res.status(err.status).json({ error: 'GOOGLE_API_ERROR', message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur de connexion Google.' });
  }
}

export async function disconnectGoogleWorkspace(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const syncService = getGoogleSyncService();
  syncService.disconnectOAuth();
  res.json({ success: true });
}

export async function provisionSheetsWorkbook(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const accessToken = extractGoogleAccessToken(req);
  const customSpreadsheetId =
    typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : undefined;

  try {
    const syncService = getGoogleSyncService();
    const metadata = await syncService.provisionWorkbookAndDrive(
      req.currentUser,
      accessToken,
      customSpreadsheetId || undefined
    );
    res.json({ success: true, metadata });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      res.status(err.status).json({ error: 'GOOGLE_API_ERROR', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de créer ou lier le classeur Google Sheets.',
    });
  }
}

export async function syncSheetsNow(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const accessToken = extractGoogleAccessToken(req);

  try {
    const syncService = getGoogleSyncService();
    const metadata = await syncService.syncNow(req.currentUser, accessToken);
    res.json({ success: true, metadata });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      res.status(err.status).json({ error: 'GOOGLE_API_ERROR', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Échec de la synchronisation Google Sheets.',
    });
  }
}

export async function previewSheetRows(req: AuthenticatedRequest, res: Response): Promise<void> {
  const sheetName = String(req.params.sheetName || 'AGENTS');
  const accessToken = extractGoogleAccessToken(req);

  try {
    const syncService = getGoogleSyncService();
    const preview = await syncService.inspectSheetPreview(sheetName, accessToken);
    res.json(preview);
  } catch (err) {
    if (err instanceof GoogleApiError) {
      res.status(err.status).json({ error: 'GOOGLE_API_ERROR', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de lire la feuille Google Sheets.',
    });
  }
}

export async function listBackups(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const syncService = getGoogleSyncService();
  res.json({ backups: syncService.listBackups() });
}

export async function createBackup(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const uploadToDrive = Boolean(req.body?.uploadToDrive);
  const accessToken = extractGoogleAccessToken(req);

  try {
    const syncService = getGoogleSyncService();
    const result = await syncService.createBackup(req.currentUser, uploadToDrive, accessToken);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof GoogleApiError) {
      res.status(err.status).json({ error: 'GOOGLE_API_ERROR', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Erreur lors de la création de la sauvegarde.',
    });
  }
}

export async function restoreBackup(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const filename = String(req.params.filename || '');

  try {
    const syncService = getGoogleSyncService();
    await syncService.restoreBackup(filename, req.currentUser);
    res.json({ success: true, filename });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      res.status(err.status).json({ error: 'GOOGLE_API_ERROR', message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Erreur lors de la restauration de la sauvegarde.',
    });
  }
}

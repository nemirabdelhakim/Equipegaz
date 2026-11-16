import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository, getGoogleSyncService } from '../repositories/repositoryInstance.js';
import { ServiceError } from '../services/agentService.js';
import { SyncService } from '../services/syncService.js';
import { SyncPushBatchSchema } from '../validators/syncValidator.js';

function getSyncService(): SyncService {
  const repo = getDataRepository();
  return new SyncService(repo, getGoogleSyncService());
}

export async function pushSyncBatch(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const parsed = SyncPushBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message || 'Lot de synchronisation invalide.',
      });
    }

    const result = await getSyncService().pushBatch(
      parsed.data.device_id,
      parsed.data.operations,
      req.currentUser
    );
    return res.json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.code, message: err.message });
    }
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Erreur lors de la synchronisation montante.',
    });
  }
}

export async function pullSyncSnapshot(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const since =
      typeof req.query.since === 'string' && req.query.since.trim()
        ? req.query.since.trim()
        : undefined;
    const result = await getSyncService().pullSnapshot(req.currentUser, since);
    return res.json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.code, message: err.message });
    }
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Erreur lors de la récupération des données synchronisées.',
    });
  }
}

export async function getSyncStatus(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const result = await getSyncService().getSyncStatus(req.currentUser);
    return res.json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ error: err.code, message: err.message });
    }
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Erreur lors de la lecture du statut de synchronisation.',
    });
  }
}

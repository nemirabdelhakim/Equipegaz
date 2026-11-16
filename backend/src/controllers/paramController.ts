import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';
import { ServiceError } from '../services/agentService.js';
import { TaskService } from '../services/taskService.js';
import { CreateParamSchema, UpdateParamSchema } from '../validators/taskValidator.js';

const taskService = new TaskService(getDataRepository());

export async function createParameter(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = CreateParamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Paramètre invalide.',
    });
    return;
  }

  try {
    const param = await taskService.createParameter(parsed.data, req.currentUser);
    res.status(201).json({ parameter: param });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de créer le paramètre.' });
  }
}

export async function updateParameter(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = UpdateParamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Mise à jour invalide.',
    });
    return;
  }

  try {
    const param = await taskService.updateParameter(
      String(req.params.id || ''),
      parsed.data,
      req.currentUser
    );
    res.json({ parameter: param });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de modifier le paramètre.',
    });
  }
}

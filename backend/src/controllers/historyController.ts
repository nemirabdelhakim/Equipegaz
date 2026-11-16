import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';

export async function listHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const repo = getDataRepository();
  const limit = Number(req.query.limit) || 200;

  if (req.currentUser.role === 'CHEF') {
    const history = await repo.listHistory({ limit });
    res.json({ history });
    return;
  }

  const history = await repo.listHistory({
    userId: req.currentUser.agent_id,
    limit,
  });
  res.json({ history });
}

export async function listParameters(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const repo = getDataRepository();
  const parameters = await repo.listParameters();
  res.json({ parameters });
}

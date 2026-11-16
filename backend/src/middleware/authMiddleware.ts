import type { NextFunction, Request, Response } from 'express';
import type { AgentRecord, UserRole } from '../models/domain.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';
import { verifySessionToken } from '../utils/crypto.js';

export interface AuthenticatedRequest extends Request {
  currentUser?: AgentRecord;
  deviceId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentification requise.',
      });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const payload = await verifySessionToken(token);
    if (!payload) {
      res.status(401).json({
        error: 'INVALID_SESSION',
        message: 'Session expirée ou invalide. Veuillez vous reconnecter.',
      });
      return;
    }

    const repo = getDataRepository();
    const agent = await repo.getAgentById(payload.sub);
    if (!agent) {
      res.status(401).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: 'Compte utilisateur introuvable.',
      });
      return;
    }

    if (agent.statut !== 'ACTIF') {
      res.status(403).json({
        error: 'ACCOUNT_DISABLED',
        message: `Votre accès est actuellement désactivé (${agent.statut}).`,
      });
      return;
    }

    if (agent.token_version !== payload.tv) {
      res.status(401).json({
        error: 'SESSION_REVOKED',
        message: 'Votre session a été révoquée. Veuillez vous reconnecter.',
      });
      return;
    }

    req.currentUser = agent;
    req.deviceId = payload.did;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentification requise.' });
      return;
    }
    if (!allowedRoles.includes(req.currentUser.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: "Action réservée au Chef d'équipe.",
      });
      return;
    }
    next();
  };
}

import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';
import { AgentService, ServiceError } from '../services/agentService.js';
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  UpdateAgentStatusSchema,
} from '../validators/agentValidator.js';

const agentService = new AgentService(getDataRepository());

export async function listAgents(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const agents = await agentService.listAgents(req.currentUser.role);
  res.json({ agents });
}

export async function getAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '');
    const agent = await agentService.getAgentById(id);
    res.json({ agent });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur serveur.' });
  }
}

export async function createAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = CreateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Données agent invalides.',
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await agentService.createAgent(parsed.data, req.currentUser);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: "Impossible de créer l'agent." });
  }
}

export async function updateAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = UpdateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Données de mise à jour invalides.',
    });
    return;
  }

  try {
    const id = String(req.params.id || '');
    const agent = await agentService.updateAgent(id, parsed.data, req.currentUser);
    res.json({ agent });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: "Impossible de modifier l'agent." });
  }
}

export async function patchAgentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = UpdateAgentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Statut invalide.',
    });
    return;
  }

  try {
    const id = String(req.params.id || '');
    const agent = await agentService.changeAgentStatus(
      id,
      parsed.data.statut,
      parsed.data.commentaire,
      req.currentUser
    );
    res.json({ agent });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de modifier le statut.' });
  }
}

export async function resetAgentAccess(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  try {
    const id = String(req.params.id || '');
    const result = await agentService.resetAgentAccess(id, req.currentUser);
    res.json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de réinitialiser.' });
  }
}

export async function getAgentHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const targetId = String(req.params.id || '');
  if (req.currentUser.role !== 'CHEF' && req.currentUser.agent_id !== targetId) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: "Vous ne pouvez consulter que votre propre historique d'accès.",
    });
    return;
  }

  try {
    const history = await agentService.getAgentHistory(targetId);
    res.json({ history });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur serveur.' });
  }
}

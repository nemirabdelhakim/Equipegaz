import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';
import { ServiceError } from '../services/agentService.js';
import { TaskService } from '../services/taskService.js';
import {
  AgentExecutionStatusSchema,
  AssignAgentsSchema,
  ChefTaskStatusSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
} from '../validators/taskValidator.js';

const taskService = new TaskService(getDataRepository());

export async function listTasks(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const tasks = await taskService.listAllTasks();
  res.json({ tasks });
}

export async function getTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const task = await taskService.getTaskById(String(req.params.id || ''));
    res.json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur serveur.' });
  }
}

export async function createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Données tâche invalides.',
    });
    return;
  }

  try {
    const task = await taskService.createTask(parsed.data, req.currentUser);
    res.status(201).json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de créer la tâche.' });
  }
}

export async function updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = UpdateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Mise à jour invalide.',
    });
    return;
  }

  try {
    const task = await taskService.updateTask(
      String(req.params.id || ''),
      parsed.data,
      req.currentUser
    );
    res.json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Impossible de modifier la tâche.' });
  }
}

export async function assignAgents(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = AssignAgentsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Affectation invalide.',
    });
    return;
  }

  try {
    const task = await taskService.assignAgents(
      String(req.params.id || ''),
      parsed.data.agent_ids,
      parsed.data.equipe,
      parsed.data.mode,
      req.currentUser
    );
    res.json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: "Erreur lors de l'affectation." });
  }
}

export async function unassignAgent(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const task = await taskService.unassignAgent(
      String(req.params.id || ''),
      String(req.params.agentId || ''),
      req.currentUser
    );
    res.json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors du retrait.' });
  }
}

export async function patchTaskStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = ChefTaskStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Statut invalide.',
    });
    return;
  }

  try {
    const task = await taskService.changeTaskStatusByChef(
      String(req.params.id || ''),
      parsed.data.statut,
      parsed.data.commentaire,
      req.currentUser
    );
    res.json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur de changement de statut.' });
  }
}

export async function patchMyExecutionStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = AgentExecutionStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Statut terrain invalide.',
    });
    return;
  }

  try {
    const task = await taskService.updateAgentExecutionStatus(
      String(req.params.id || ''),
      parsed.data.statut_agent,
      parsed.data.motif,
      req.currentUser
    );
    res.json({ task });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: "Erreur lors de la mise à jour de l'avancement terrain.",
    });
  }
}


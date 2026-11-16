import type { Request, Response } from 'express';
import { toPublicAgent } from '../models/domain.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';
import { AuthError, AuthService } from '../services/authService.js';
import {
  ChangePasswordSchema,
  FirebaseSessionSchema,
  LoginCredentialsSchema,
} from '../validators/agentValidator.js';

const authService = new AuthService(getDataRepository());

export async function loginWithCredentials(req: Request, res: Response): Promise<void> {
  const parsed = LoginCredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Données de connexion invalides.',
    });
    return;
  }

  try {
    const result = await authService.loginWithCredentials(
      parsed.data.identifier,
      parsed.data.password,
      parsed.data.device_id,
      parsed.data.plateforme
    );
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur interne lors de la connexion.' });
  }
}

export async function loginWithFirebase(req: Request, res: Response): Promise<void> {
  const parsed = FirebaseSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Jeton Firebase manquant.',
    });
    return;
  }

  try {
    const result = await authService.loginWithFirebaseToken(
      parsed.data.idToken,
      parsed.data.device_id,
      parsed.data.plateforme
    );
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: "Impossible de valider l'authentification Firebase.",
    });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const repo = getDataRepository();
  const sessions = await repo.listSessionsByUser(req.currentUser.agent_id);
  res.json({
    user: toPublicAgent(req.currentUser),
    sessions,
  });
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Mot de passe invalide.',
    });
    return;
  }

  try {
    await authService.changeOwnPassword(
      req.currentUser.agent_id,
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lors de la mise à jour.' });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.currentUser) {
    await authService.logout(req.currentUser, req.deviceId || 'web-browser');
  }
  res.json({ success: true });
}

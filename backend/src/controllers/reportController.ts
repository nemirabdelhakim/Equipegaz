import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository, getGoogleSyncService } from '../repositories/repositoryInstance.js';
import { ServiceError } from '../services/agentService.js';
import { ReportService } from '../services/reportService.js';
import {
  CreateReportSchema,
  ReviewReportSchema,
  UploadPhotoSchema,
} from '../validators/taskValidator.js';

const reportService = new ReportService(getDataRepository(), getGoogleSyncService());

export async function listAllReports(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const reports = await reportService.listAllReports();
  res.json({ reports });
}

export async function listTaskReports(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await reportService.listTaskReportsAndPhotos(String(req.params.id || ''));
    res.json(result);
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur chargement comptes-rendus.' });
  }
}

export async function submitReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = CreateReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Compte-rendu invalide.',
    });
    return;
  }

  try {
    const report = await reportService.submitReport(
      String(req.params.id || ''),
      parsed.data,
      req.currentUser
    );
    res.status(201).json({ report });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de soumettre le compte-rendu.',
    });
  }
}

export async function uploadPhoto(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = UploadPhotoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Photo invalide.',
    });
    return;
  }

  try {
    const photo = await reportService.uploadTaskPhoto(
      String(req.params.id || ''),
      parsed.data,
      req.currentUser
    );
    res.status(201).json({ photo });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de téléverser la photo.',
    });
  }
}

export async function getPhotoContent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { photo, buffer } = await reportService.getPhotoFileBuffer(
      String(req.params.photoId || '')
    );
    res.setHeader('Content-Type', photo.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lecture photo.' });
  }
}

export async function reviewReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }

  const parsed = ReviewReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Décision invalide.',
    });
    return;
  }

  try {
    const report = await reportService.reviewReport(
      String(req.params.reportId || ''),
      parsed.data.decision,
      parsed.data.commentaire_chef,
      req.currentUser
    );
    res.json({ report });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de valider ou refuser le compte-rendu.',
    });
  }
}

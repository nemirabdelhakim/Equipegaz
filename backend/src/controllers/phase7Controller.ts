import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getDataRepository } from '../repositories/repositoryInstance.js';
import { ServiceError } from '../services/agentService.js';
import { ExportService, type ExportFormat, type ExportReportType } from '../services/exportService.js';
import { NotificationService } from '../services/notificationService.js';
import { StatisticsService } from '../services/statisticsService.js';

const ExportQuerySchema = z.object({
  type: z.enum([
    'DAILY_PROGRAM',
    'DAILY_WORK',
    'WEEKLY',
    'MONTHLY',
    'BY_AGENT',
    'BY_COMMUNE',
    'BY_DP',
    'BY_CATEGORY',
    'UNFINISHED',
    'OVERDUE',
    'BLOCKED',
    'VALIDATED_REPORTS',
  ]),
  format: z.enum(['pdf', 'xlsx', 'csv']).default('pdf'),
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  agentId: z.string().optional(),
  commune: z.string().optional(),
  dp: z.string().optional(),
  categorie: z.string().optional(),
  observations: z.string().optional(),
});

const RegisterDeviceTokenSchema = z.object({
  device_id: z.string().trim().min(2).max(128),
  plateforme: z.enum(['ANDROID', 'WEB']).default('WEB'),
  token_notification: z.string().trim().min(2).max(1024),
});

function strQuery(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export async function getDashboardStatistics(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const granRaw = strQuery(req.query.granularity);
    const granularity =
      granRaw === 'week' || granRaw === 'month' || granRaw === 'day' ? granRaw : 'day';
    const service = new StatisticsService(getDataRepository());
    const dashboard = await service.getDashboardStats({
      dateFrom: strQuery(req.query.dateFrom),
      dateTo: strQuery(req.query.dateTo),
      commune: strQuery(req.query.commune),
      dp: strQuery(req.query.dp),
      categorie: strQuery(req.query.categorie),
      agentId: strQuery(req.query.agentId),
      priorite: strQuery(req.query.priorite),
      statut: strQuery(req.query.statut),
      granularity,
    });
    res.json(dashboard);
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur calcul statistiques.' });
  }
}

export async function getAgentStatistics(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const service = new StatisticsService(getDataRepository());
    const agents = await service.getAgentTrackingList(req.currentUser, {
      dateFrom: strQuery(req.query.dateFrom),
      dateTo: strQuery(req.query.dateTo),
      agentId: strQuery(req.query.agentId),
    });
    res.json({ agents });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Erreur calcul suivi individuel des agents.',
    });
  }
}

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const service = new NotificationService(getDataRepository());
    const result = await service.listUserNotifications(req.currentUser);
    res.json(result);
  } catch {
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Erreur chargement des notifications.',
    });
  }
}

export async function markNotificationRead(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const service = new NotificationService(getDataRepository());
    const notification = await service.markAsRead(
      String(req.params.id || ''),
      req.currentUser
    );
    res.json({ notification });
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur lecture notification.' });
  }
}

export async function markAllNotificationsRead(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  try {
    const service = new NotificationService(getDataRepository());
    const result = await service.markAllAsRead(req.currentUser);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur mise à jour notifications.' });
  }
}

export async function registerNotificationDevice(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = RegisterDeviceTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Jeton de notification invalide.',
    });
    return;
  }
  try {
    const service = new NotificationService(getDataRepository());
    const session = await service.registerDeviceToken(req.currentUser, parsed.data);
    res.json({ session });
  } catch {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur enregistrement appareil.' });
  }
}

export async function exportOfficialReport(req: AuthenticatedRequest, res: Response) {
  if (!req.currentUser) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Non authentifié.' });
    return;
  }
  const parsed = ExportQuerySchema.safeParse({
    type: strQuery(req.query.type) || 'DAILY_PROGRAM',
    format: (strQuery(req.query.format) || 'pdf').toLowerCase(),
    date: strQuery(req.query.date),
    dateFrom: strQuery(req.query.dateFrom),
    dateTo: strQuery(req.query.dateTo),
    agentId: strQuery(req.query.agentId),
    commune: strQuery(req.query.commune),
    dp: strQuery(req.query.dp),
    categorie: strQuery(req.query.categorie),
    observations: strQuery(req.query.observations),
  });
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Paramètres d’export invalides.',
    });
    return;
  }
  try {
    const service = new ExportService(getDataRepository());
    const result = await service.generateReport(
      {
        type: parsed.data.type as ExportReportType,
        format: parsed.data.format as ExportFormat,
        date: parsed.data.date,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        agentId: parsed.data.agentId,
        commune: parsed.data.commune,
        dp: parsed.data.dp,
        categorie: parsed.data.categorie,
        observations: parsed.data.observations,
      },
      req.currentUser
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.fileName}"`
    );
    res.setHeader('X-Report-Number', result.reportNumber);
    res.send(result.buffer);
  } catch (err) {
    if (err instanceof ServiceError) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'Impossible de générer le document d’export.',
    });
  }
}

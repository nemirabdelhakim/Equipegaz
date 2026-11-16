import { Router } from 'express';
import * as agentController from '../controllers/agentController.js';
import * as authController from '../controllers/authController.js';
import * as historyController from '../controllers/historyController.js';
import * as paramController from '../controllers/paramController.js';
import * as phase7Controller from '../controllers/phase7Controller.js';
import * as reportController from '../controllers/reportController.js';
import * as storageController from '../controllers/storageController.js';
import * as syncController from '../controllers/syncController.js';
import * as taskController from '../controllers/taskController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { createRateLimiter } from '../middleware/rateLimitMiddleware.js';
import { formatDateTimeAlgiers, nowIso } from '../utils/dateAlgiers.js';

export function createApiRouter(): Router {
  const router = Router();
  const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 30,
    message:
      'Trop de tentatives de connexion depuis cet appareil. Réessayez dans quelques minutes.',
  });

  // Santé serveur
  router.get('/health', (_req, res) => {
    const now = nowIso();
    res.json({
      status: 'OK',
      service: 'GESTION ÉQUIPE GAZ – SIDI ALI',
      timezone: 'Africa/Algiers',
      server_time_iso: now,
      server_time_fr: formatDateTimeAlgiers(now),
      phase: 8,
      security_hardened: true,
    });
  });

  // Authentification
  router.post('/auth/login', authRateLimiter, authController.loginWithCredentials);
  router.post('/auth/firebase', authRateLimiter, authController.loginWithFirebase);
  router.post('/auth/logout', requireAuth, authController.logout);
  router.get('/auth/me', requireAuth, authController.getMe);
  router.post('/auth/change-password', requireAuth, authController.changePassword);

  // Agents
  router.get('/agents', requireAuth, agentController.listAgents);
  router.post('/agents', requireAuth, requireRole('CHEF'), agentController.createAgent);
  router.get('/agents/:id', requireAuth, agentController.getAgent);
  router.put('/agents/:id', requireAuth, requireRole('CHEF'), agentController.updateAgent);
  router.patch(
    '/agents/:id/status',
    requireAuth,
    requireRole('CHEF'),
    agentController.patchAgentStatus
  );
  router.post(
    '/agents/:id/reset-access',
    requireAuth,
    requireRole('CHEF'),
    agentController.resetAgentAccess
  );
  router.get('/agents/:id/history', requireAuth, agentController.getAgentHistory);

  // Tâches & Affectations (Phase 3)
  router.get('/tasks', requireAuth, taskController.listTasks);
  router.post('/tasks', requireAuth, requireRole('CHEF'), taskController.createTask);
  router.get('/tasks/:id', requireAuth, taskController.getTask);
  router.put('/tasks/:id', requireAuth, requireRole('CHEF'), taskController.updateTask);
  router.patch(
    '/tasks/:id/status',
    requireAuth,
    requireRole('CHEF'),
    taskController.patchTaskStatus
  );
  router.patch(
    '/tasks/:id/my-status',
    requireAuth,
    taskController.patchMyExecutionStatus
  );
  router.post(
    '/tasks/:id/assign',
    requireAuth,
    requireRole('CHEF'),
    taskController.assignAgents
  );
  router.delete(
    '/tasks/:id/assign/:agentId',
    requireAuth,
    requireRole('CHEF'),
    taskController.unassignAgent
  );

  // Comptes-rendus & Photos (Phase 5)
  router.get('/reports', requireAuth, reportController.listAllReports);
  router.get('/tasks/:id/reports', requireAuth, reportController.listTaskReports);
  router.post('/tasks/:id/reports', requireAuth, reportController.submitReport);
  router.post('/tasks/:id/photos', requireAuth, reportController.uploadPhoto);
  router.get('/photos/:photoId/content', requireAuth, reportController.getPhotoContent);
  router.post(
    '/reports/:reportId/review',
    requireAuth,
    requireRole('CHEF'),
    reportController.reviewReport
  );

  // Synchronisation temps réel & hors-ligne (Phase 6)
  router.post('/sync/push', requireAuth, syncController.pushSyncBatch);
  router.get('/sync/pull', requireAuth, syncController.pullSyncSnapshot);
  router.get('/sync/status', requireAuth, syncController.getSyncStatus);

  // Tableau de bord, Statistiques, Notifications & Exports (Phase 7)
  router.get('/dashboard', requireAuth, phase7Controller.getDashboardStatistics);
  router.get('/statistics/tasks', requireAuth, phase7Controller.getDashboardStatistics);
  router.get('/statistics/agents', requireAuth, phase7Controller.getAgentStatistics);
  router.get('/notifications', requireAuth, phase7Controller.listNotifications);
  router.patch('/notifications/:id/read', requireAuth, phase7Controller.markNotificationRead);
  router.post('/notifications/read-all', requireAuth, phase7Controller.markAllNotificationsRead);
  router.post(
    '/notifications/register-device',
    requireAuth,
    phase7Controller.registerNotificationDevice
  );
  router.get('/exports/report', requireAuth, phase7Controller.exportOfficialReport);

  // Historique & Paramètres district
  router.get('/history', requireAuth, historyController.listHistory);
  router.get('/params', requireAuth, historyController.listParameters);
  router.post('/params', requireAuth, requireRole('CHEF'), paramController.createParameter);
  router.put('/params/:id', requireAuth, requireRole('CHEF'), paramController.updateParameter);

  // Stockage Central Google Sheets, Drive & Sauvegardes
  router.get('/storage/status', requireAuth, storageController.getStorageStatus);
  router.post(
    '/storage/google/connect',
    requireAuth,
    requireRole('CHEF'),
    storageController.connectGoogleWorkspace
  );
  router.post(
    '/storage/google/disconnect',
    requireAuth,
    requireRole('CHEF'),
    storageController.disconnectGoogleWorkspace
  );
  router.post(
    '/storage/sheets/provision',
    requireAuth,
    requireRole('CHEF'),
    storageController.provisionSheetsWorkbook
  );
  router.post(
    '/storage/sheets/sync',
    requireAuth,
    requireRole('CHEF'),
    storageController.syncSheetsNow
  );
  router.get(
    '/storage/sheets/preview/:sheetName',
    requireAuth,
    requireRole('CHEF'),
    storageController.previewSheetRows
  );
  router.get(
    '/storage/backups',
    requireAuth,
    requireRole('CHEF'),
    storageController.listBackups
  );
  router.post(
    '/storage/backups',
    requireAuth,
    requireRole('CHEF'),
    storageController.createBackup
  );
  router.post(
    '/storage/backups/:filename/restore',
    requireAuth,
    requireRole('CHEF'),
    storageController.restoreBackup
  );

  return router;
}

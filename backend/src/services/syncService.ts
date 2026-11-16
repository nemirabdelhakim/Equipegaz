import {
  toPublicAgent,
  type AgentRecord,
  type SyncOperationRecord,
  type SyncOperationStatus,
  type SyncOperationType,
} from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { formatDateTimeAlgiers, nowIso } from '../utils/dateAlgiers.js';
import {
  AgentExecutionStatusSchema,
  CreateReportSchema,
  UpdateTaskSchema,
  UploadPhotoSchema,
} from '../validators/taskValidator.js';
import { ServiceError } from './agentService.js';
import type { GoogleSyncService } from './googleSyncService.js';
import { NotificationService } from './notificationService.js';
import { ReportService } from './reportService.js';
import { TaskService } from './taskService.js';

export interface SyncPushOperationInput {
  operation_id: string;
  type_operation: SyncOperationType;
  target_id: string;
  client_timestamp: string;
  base_version?: number;
  local_photo_id?: string;
  payload: Record<string, unknown>;
}

export interface SyncPushResultItem {
  operation_id: string;
  type_operation: SyncOperationType;
  target_id: string;
  statut: SyncOperationStatus;
  duplicate: boolean;
  message: string;
  server_version?: number;
  server_updated_at?: string;
  server_status?: string;
  mapped_photo_id?: string;
}

export class SyncService {
  private readonly taskService: TaskService;
  private readonly reportService: ReportService;

  constructor(
    private readonly repo: IDataRepository,
    googleSyncService?: GoogleSyncService,
    uploadsDir?: string
  ) {
    this.taskService = new TaskService(repo);
    this.reportService = new ReportService(repo, googleSyncService, uploadsDir);
  }

  async pushBatch(
    deviceId: string,
    operations: SyncPushOperationInput[],
    actor: AgentRecord
  ): Promise<{
    server_time_iso: string;
    results: SyncPushResultItem[];
  }> {
    const results: SyncPushResultItem[] = [];
    // Permet à REPORT_SUBMIT hors-ligne de retrouver le vrai photo_id créé juste avant dans le même lot
    const localPhotoMap = new Map<string, string>();

    // Charger aussi d'éventuelles correspondances déjà synchronisées par cet utilisateur
    const pastOps = await this.repo.listSyncOperations({ userId: actor.agent_id, limit: 200 });
    for (const prev of pastOps) {
      if (prev.statut === 'SYNCHRONISÉ' && prev.result_json) {
        try {
          const parsed = JSON.parse(prev.result_json) as {
            local_photo_id?: string;
            photo_id?: string;
          };
          if (parsed.local_photo_id && parsed.photo_id) {
            localPhotoMap.set(parsed.local_photo_id, parsed.photo_id);
          }
        } catch {
          // ignore malformed result_json
        }
      }
    }

    for (const op of operations) {
      // 1. Déduplication stricte par UUID d'opération
      const existing = await this.repo.getSyncOperationById(op.operation_id);
      if (existing && existing.statut === 'SYNCHRONISÉ') {
        let mappedPhotoId: string | undefined;
        if (existing.result_json) {
          try {
            const parsed = JSON.parse(existing.result_json) as {
              local_photo_id?: string;
              photo_id?: string;
            };
            if (parsed.local_photo_id && parsed.photo_id) {
              localPhotoMap.set(parsed.local_photo_id, parsed.photo_id);
              mappedPhotoId = parsed.photo_id;
            }
          } catch {
            // ignore
          }
        }
        results.push({
          operation_id: op.operation_id,
          type_operation: op.type_operation,
          target_id: op.target_id,
          statut: 'SYNCHRONISÉ',
          duplicate: true,
          message: 'Opération déjà synchronisée précédemment (doublon ignoré).',
          mapped_photo_id: mappedPhotoId,
        });
        continue;
      }

      const syncDate = nowIso();
      try {
        if (op.type_operation === 'TASK_AGENT_STATUS') {
          const parsed = AgentExecutionStatusSchema.safeParse(op.payload);
          if (!parsed.success) {
            throw new ServiceError(
              400,
              'VALIDATION_ERROR',
              parsed.error.issues[0]?.message || 'Données statut agent invalides.'
            );
          }

          const currentTask = await this.repo.getTaskById(op.target_id);
          if (!currentTask) {
            throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable sur le serveur.');
          }
          if (
            currentTask.statut_global === 'ANNULÉE' ||
            currentTask.statut_global === 'VALIDÉE'
          ) {
            throw new ServiceError(
              409,
              'VERSION_CONFLICT',
              `Conflit détecté : la tâche ${currentTask.numero_tache} est déjà ${currentTask.statut_global} sur le serveur.`
            );
          }
          if (
            op.base_version !== undefined &&
            currentTask.version !== op.base_version
          ) {
            // Vérifier s'il y a eu une modification de la tâche par le Chef entre-temps
            const taskHist = await this.repo.listHistory({ taskId: currentTask.task_id, limit: 20 });
            const chefEditedAfter = taskHist.some(
              (h) =>
                h.date_serveur > op.client_timestamp &&
                [
                  'MODIFICATION_TACHE',
                  'MODIFICATION_PRIORITE',
                  'MODIFICATION_PLANNING',
                  'MODIFICATION_ECHEANCE',
                  'MODIFICATION_STATUT_CHEF',
                  'CHANGEMENT_PRIORITE',
                  'CHANGEMENT_STATUT_CHEF',
                  'AFFECTATION_AGENTS',
                  'REAFFECTATION_AGENTS',
                  'RETRAIT_AGENT',
                ].includes(h.action)
            );
            if (chefEditedAfter) {
              throw new ServiceError(
                409,
                'VERSION_CONFLICT',
                `Conflit détecté sur ${currentTask.numero_tache} (serveur v${currentTask.version}, local v${op.base_version}) : la tâche a été modifiée par le Chef pendant la coupure.`
              );
            }
          }

          const updatedTask = await this.taskService.updateAgentExecutionStatus(
            op.target_id,
            parsed.data.statut_agent,
            parsed.data.motif,
            actor
          );

          await this.repo.upsertSyncOperation({
            operation_id: op.operation_id,
            user_id: actor.agent_id,
            device_id: deviceId,
            type_operation: op.type_operation,
            target_id: op.target_id,
            date_operation: syncDate,
            statut: 'SYNCHRONISÉ',
            message_erreur: '',
            result_json: JSON.stringify({
              task_version: updatedTask.version,
              statut_global: updatedTask.statut_global,
            }),
          });

          results.push({
            operation_id: op.operation_id,
            type_operation: op.type_operation,
            target_id: op.target_id,
            statut: 'SYNCHRONISÉ',
            duplicate: false,
            message: `Statut agent mis à jour (${parsed.data.statut_agent}).`,
            server_version: updatedTask.version,
            server_updated_at: updatedTask.updated_at,
            server_status: updatedTask.statut_global,
          });
        } else if (op.type_operation === 'TASK_UPDATE') {
          if (actor.role !== 'CHEF') {
            throw new ServiceError(
              403,
              'FORBIDDEN',
              "Seul le Chef d'équipe peut modifier la fiche d'une tâche."
            );
          }
          const parsed = UpdateTaskSchema.safeParse({
            ...op.payload,
            expected_version: op.base_version ?? op.payload.expected_version,
          });
          if (!parsed.success) {
            throw new ServiceError(
              400,
              'VALIDATION_ERROR',
              parsed.error.issues[0]?.message || 'Données de modification tâche invalides.'
            );
          }

          const updatedTask = await this.taskService.updateTask(
            op.target_id,
            parsed.data,
            actor
          );

          await this.repo.upsertSyncOperation({
            operation_id: op.operation_id,
            user_id: actor.agent_id,
            device_id: deviceId,
            type_operation: op.type_operation,
            target_id: op.target_id,
            date_operation: syncDate,
            statut: 'SYNCHRONISÉ',
            message_erreur: '',
            result_json: JSON.stringify({ task_version: updatedTask.version }),
          });

          results.push({
            operation_id: op.operation_id,
            type_operation: op.type_operation,
            target_id: op.target_id,
            statut: 'SYNCHRONISÉ',
            duplicate: false,
            message: `Tâche ${updatedTask.numero_tache} mise à jour (v${updatedTask.version}).`,
            server_version: updatedTask.version,
            server_updated_at: updatedTask.updated_at,
            server_status: updatedTask.statut_global,
          });
        } else if (op.type_operation === 'PHOTO_UPLOAD') {
          const parsed = UploadPhotoSchema.safeParse(op.payload);
          if (!parsed.success) {
            throw new ServiceError(
              400,
              'VALIDATION_ERROR',
              parsed.error.issues[0]?.message || 'Photo hors-ligne invalide.'
            );
          }
          const createdPhoto = await this.reportService.uploadTaskPhoto(
            op.target_id,
            parsed.data,
            actor
          );
          if (op.local_photo_id) {
            localPhotoMap.set(op.local_photo_id, createdPhoto.photo_id);
          }

          await this.repo.upsertSyncOperation({
            operation_id: op.operation_id,
            user_id: actor.agent_id,
            device_id: deviceId,
            type_operation: op.type_operation,
            target_id: op.target_id,
            date_operation: syncDate,
            statut: 'SYNCHRONISÉ',
            message_erreur: '',
            result_json: JSON.stringify({
              local_photo_id: op.local_photo_id || '',
              photo_id: createdPhoto.photo_id,
            }),
          });

          results.push({
            operation_id: op.operation_id,
            type_operation: op.type_operation,
            target_id: op.target_id,
            statut: 'SYNCHRONISÉ',
            duplicate: false,
            message: `Photo ${createdPhoto.type_photo} archivée.`,
            mapped_photo_id: createdPhoto.photo_id,
          });
        } else if (op.type_operation === 'REPORT_SUBMIT') {
          const parsed = CreateReportSchema.safeParse(op.payload);
          if (!parsed.success) {
            throw new ServiceError(
              400,
              'VALIDATION_ERROR',
              parsed.error.issues[0]?.message || 'Compte-rendu hors-ligne invalide.'
            );
          }

          const mappedPhotoIds = parsed.data.photo_ids.map(
            (id) => localPhotoMap.get(id) || id
          );

          const createdReport = await this.reportService.submitReport(
            op.target_id,
            {
              ...parsed.data,
              photo_ids: mappedPhotoIds,
            },
            actor
          );

          await this.repo.upsertSyncOperation({
            operation_id: op.operation_id,
            user_id: actor.agent_id,
            device_id: deviceId,
            type_operation: op.type_operation,
            target_id: op.target_id,
            date_operation: syncDate,
            statut: 'SYNCHRONISÉ',
            message_erreur: '',
            result_json: JSON.stringify({
              report_id: createdReport.report_id,
              version: createdReport.version,
            }),
          });

          results.push({
            operation_id: op.operation_id,
            type_operation: op.type_operation,
            target_id: op.target_id,
            statut: 'SYNCHRONISÉ',
            duplicate: false,
            message: `Compte-rendu v${createdReport.version} synchronisé.`,
            server_version: createdReport.version,
          });
        }
      } catch (err) {
        const isConflict =
          err instanceof ServiceError &&
          (err.statusCode === 409 || err.code === 'VERSION_CONFLICT');
        const status: SyncOperationStatus = isConflict ? 'CONFLIT' : 'ERREUR';
        const message =
          err instanceof Error ? err.message : 'Erreur inattendue de synchronisation.';

        const currentTask = await this.repo.getTaskById(op.target_id);
        await this.repo.upsertSyncOperation({
          operation_id: op.operation_id,
          user_id: actor.agent_id,
          device_id: deviceId,
          type_operation: op.type_operation,
          target_id: op.target_id,
          date_operation: syncDate,
          statut: status,
          message_erreur: message,
        });

        results.push({
          operation_id: op.operation_id,
          type_operation: op.type_operation,
          target_id: op.target_id,
          statut: status,
          duplicate: false,
          message,
          server_version: currentTask?.version,
          server_updated_at: currentTask?.updated_at,
          server_status: currentTask?.statut_global,
        });
      }
    }

    return {
      server_time_iso: nowIso(),
      results,
    };
  }

  async pullSnapshot(actor: AgentRecord, sinceIso?: string) {
    const notificationService = new NotificationService(this.repo);
    await notificationService.generateOverdueNotificationsIfNeeded();

    const [agents, tasks, reports, history, parameters, notifications] = await Promise.all([
      this.repo.listAgents(),
      this.taskService.listAllTasks(),
      this.reportService.listAllReports(),
      this.repo.listHistory({ limit: 200 }),
      this.repo.listParameters(),
      this.repo.listNotificationsByUser(actor.agent_id),
    ]);

    const serverTime = nowIso();
    const lastTaskChange = tasks.reduce(
      (max, t) => (t.updated_at > max ? t.updated_at : max),
      ''
    );
    const hasChanges = !sinceIso || lastTaskChange > sinceIso || history.some((h) => h.date_serveur > sinceIso);

    return {
      server_time_iso: serverTime,
      server_time_fr: formatDateTimeAlgiers(serverTime),
      has_changes: hasChanges,
      snapshot: {
        agents: agents.map(toPublicAgent),
        tasks,
        reports,
        history,
        parameters,
        notifications,
      },
    };
  }

  async getSyncStatus(actor: AgentRecord): Promise<{
    server_time_iso: string;
    server_time_fr: string;
    operations: SyncOperationRecord[];
  }> {
    const now = nowIso();
    const operations = await this.repo.listSyncOperations({
      userId: actor.role === 'CHEF' ? undefined : actor.agent_id,
      limit: 100,
    });
    return {
      server_time_iso: now,
      server_time_fr: formatDateTimeAlgiers(now),
      operations,
    };
  }
}

import { v4 as uuidv4 } from 'uuid';
import type { AgentRecord, NotificationRecord, TaskStatus } from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { formatIsoDateToFr, nowIso, todayAlgiersIso } from '../utils/dateAlgiers.js';
import { ServiceError } from './agentService.js';

const CLOSED_STATUSES: TaskStatus[] = ['TERMINÉE', 'À VALIDER', 'VALIDÉE', 'ANNULÉE'];

export class NotificationService {
  constructor(private readonly repo: IDataRepository) {}

  async generateOverdueNotificationsIfNeeded(): Promise<void> {
    const todayIso = todayAlgiersIso();
    const [tasks, assignments, agents] = await Promise.all([
      this.repo.listTasks(),
      this.repo.listAssignments(),
      this.repo.listAgents(),
    ]);

    const activeChefs = agents.filter((a) => a.role === 'CHEF' && a.statut === 'ACTIF');
    const activeAgentIds = new Set(
      agents.filter((a) => a.statut === 'ACTIF').map((a) => a.agent_id)
    );
    const now = nowIso();

    for (const task of tasks) {
      if (
        !task.date_fin_prevue ||
        task.date_fin_prevue >= todayIso ||
        CLOSED_STATUSES.includes(task.statut_global)
      ) {
        continue;
      }

      const assignedIds = assignments
        .filter((a) => a.task_id === task.task_id && activeAgentIds.has(a.agent_id))
        .map((a) => a.agent_id);
      const recipients = Array.from(
        new Set([...assignedIds, ...activeChefs.map((c) => c.agent_id)])
      );

      for (const userId of recipients) {
        await this.repo.createNotificationIfUnique({
          notification_id: uuidv4(),
          dedup_key: `overdue:${task.task_id}:${todayIso}:${userId}`,
          user_id: userId,
          task_id: task.task_id,
          type_event: 'TACHE_EN_RETARD',
          titre: `Échéance dépassée · ${task.numero_tache}`,
          message: `L'intervention "${task.titre}" (${task.commune}) avait pour échéance le ${formatIsoDateToFr(
            task.date_fin_prevue
          )}.`,
          date_creation: now,
          statut_envoi: 'ENVOYÉ',
          date_lecture: '',
        });
      }
    }
  }

  async listUserNotifications(actor: AgentRecord): Promise<{
    notifications: NotificationRecord[];
    unread_count: number;
  }> {
    await this.generateOverdueNotificationsIfNeeded();
    const notifications = await this.repo.listNotificationsByUser(actor.agent_id);
    const unread_count = notifications.filter((n) => !n.date_lecture).length;
    return { notifications, unread_count };
  }

  async markAsRead(
    notificationId: string,
    actor: AgentRecord
  ): Promise<NotificationRecord> {
    const updated = await this.repo.markNotificationRead(
      notificationId,
      actor.agent_id,
      nowIso()
    );
    if (!updated) {
      throw new ServiceError(404, 'NOTIFICATION_NOT_FOUND', 'Notification introuvable.');
    }
    return updated;
  }

  async markAllAsRead(actor: AgentRecord): Promise<{ updated_count: number }> {
    const updated_count = await this.repo.markAllNotificationsRead(
      actor.agent_id,
      nowIso()
    );
    return { updated_count };
  }

  async registerDeviceToken(
    actor: AgentRecord,
    input: {
      device_id: string;
      plateforme: 'ANDROID' | 'WEB';
      token_notification: string;
    }
  ) {
    const session = await this.repo.upsertSessionDevice({
      device_id: input.device_id,
      user_id: actor.agent_id,
      plateforme: input.plateforme,
      derniere_connexion: nowIso(),
      token_notification: input.token_notification,
      statut: 'ACTIF',
    });
    return session;
  }
}

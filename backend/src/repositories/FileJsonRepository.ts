import fs from 'fs';
import path from 'path';
import type {
  AgentRecord,
  AgentStatus,
  AssignmentRecord,
  CentralStoreSnapshot,
  DistrictParamRecord,
  HistoryRecord,
  NotificationRecord,
  PhotoRecord,
  ReportRecord,
  SessionDeviceRecord,
  SyncOperationRecord,
  TaskRecord,
} from '../models/domain.js';
import { buildInitialChiefAgent, buildSeedParameters } from '../config/seedData.js';
import { nowIso } from '../utils/dateAlgiers.js';
import type { IDataRepository } from './interfaces.js';

export class FileJsonRepository implements IDataRepository {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized = false;
  private snapshot: CentralStoreSnapshot = {
    version: 1,
    updated_at: nowIso(),
    agents: [],
    tasks: [],
    assignments: [],
    reports: [],
    photos: [],
    notifications: [],
    history: [],
    parameters: [],
    sessions: [],
    sync_operations: [],
  };

  constructor(customPath?: string) {
    this.filePath =
      customPath || path.resolve(process.cwd(), 'database', 'backups', 'central-store.json');
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private persistSync(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.snapshot.updated_at = nowIso();
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.snapshot, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.enqueueWrite(async () => {
      if (this.initialized) return;

      if (fs.existsSync(this.filePath)) {
        try {
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          const parsed = JSON.parse(raw) as Partial<CentralStoreSnapshot>;
          this.snapshot = {
            version: parsed.version || 1,
            updated_at: parsed.updated_at || nowIso(),
            agents: Array.isArray(parsed.agents) ? parsed.agents : [],
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
            assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
            reports: Array.isArray(parsed.reports) ? parsed.reports : [],
            photos: Array.isArray(parsed.photos) ? parsed.photos : [],
            notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
            history: Array.isArray(parsed.history) ? parsed.history : [],
            parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
            sync_operations: Array.isArray(parsed.sync_operations) ? parsed.sync_operations : [],
          };
        } catch {
          const backupBroken = `${this.filePath}.corrupted.${Date.now()}`;
          fs.copyFileSync(this.filePath, backupBroken);
          this.snapshot.agents = [buildInitialChiefAgent()];
          this.snapshot.parameters = buildSeedParameters();
          this.persistSync();
        }
      }

      if (this.snapshot.agents.length === 0) {
        this.snapshot.agents.push(buildInitialChiefAgent());
      }
      if (this.snapshot.parameters.length === 0) {
        this.snapshot.parameters = buildSeedParameters();
      }

      this.persistSync();
      this.initialized = true;
    });
  }

  async listAgents(): Promise<AgentRecord[]> {
    await this.init();
    return this.snapshot.agents.map((a) => ({ ...a }));
  }

  async getAgentById(agentId: string): Promise<AgentRecord | null> {
    await this.init();
    const found = this.snapshot.agents.find((a) => a.agent_id === agentId);
    return found ? { ...found } : null;
  }

  async getAgentByIdentifier(identifier: string): Promise<AgentRecord | null> {
    await this.init();
    const normalized = identifier.trim().toLowerCase();
    const found = this.snapshot.agents.find(
      (a) =>
        a.login_email.toLowerCase() === normalized ||
        a.matricule.toLowerCase() === normalized
    );
    return found ? { ...found } : null;
  }

  async getAgentByFirebaseUid(uid: string): Promise<AgentRecord | null> {
    await this.init();
    if (!uid) return null;
    const found = this.snapshot.agents.find((a) => a.firebase_uid === uid);
    return found ? { ...found } : null;
  }

  async createAgent(agent: AgentRecord): Promise<AgentRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      const duplicateEmail = this.snapshot.agents.some(
        (a) => a.login_email.toLowerCase() === agent.login_email.toLowerCase()
      );
      if (duplicateEmail) throw new Error('DUPLICATE_EMAIL');

      const duplicateMatricule = this.snapshot.agents.some(
        (a) => a.matricule.toLowerCase() === agent.matricule.toLowerCase()
      );
      if (duplicateMatricule) throw new Error('DUPLICATE_MATRICULE');

      const record = { ...agent };
      this.snapshot.agents.push(record);
      this.persistSync();
      return { ...record };
    });
  }

  async updateAgent(agentId: string, patch: Partial<AgentRecord>): Promise<AgentRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      const idx = this.snapshot.agents.findIndex((a) => a.agent_id === agentId);
      if (idx === -1) return null;

      if (patch.login_email) {
        const conflict = this.snapshot.agents.some(
          (a) =>
            a.agent_id !== agentId &&
            a.login_email.toLowerCase() === patch.login_email!.toLowerCase()
        );
        if (conflict) throw new Error('DUPLICATE_EMAIL');
      }
      if (patch.matricule) {
        const conflict = this.snapshot.agents.some(
          (a) =>
            a.agent_id !== agentId &&
            a.matricule.toLowerCase() === patch.matricule!.toLowerCase()
        );
        if (conflict) throw new Error('DUPLICATE_MATRICULE');
      }

      const updated: AgentRecord = {
        ...this.snapshot.agents[idx],
        ...patch,
        agent_id: this.snapshot.agents[idx].agent_id,
        date_creation: this.snapshot.agents[idx].date_creation,
      };
      this.snapshot.agents[idx] = updated;
      this.persistSync();
      return { ...updated };
    });
  }

  async updateAgentStatus(agentId: string, statut: AgentStatus): Promise<AgentRecord | null> {
    return this.updateAgent(agentId, { statut });
  }

  // Tâches
  async listTasks(): Promise<TaskRecord[]> {
    await this.init();
    return this.snapshot.tasks.map((t) => ({ ...t }));
  }

  async getTaskById(taskId: string): Promise<TaskRecord | null> {
    await this.init();
    const found = this.snapshot.tasks.find((t) => t.task_id === taskId);
    return found ? { ...found } : null;
  }

  async createTask(task: TaskRecord): Promise<TaskRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      const copy = { ...task };
      this.snapshot.tasks.push(copy);
      this.persistSync();
      return { ...copy };
    });
  }

  async updateTask(taskId: string, patch: Partial<TaskRecord>): Promise<TaskRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      const idx = this.snapshot.tasks.findIndex((t) => t.task_id === taskId);
      if (idx === -1) return null;
      const current = this.snapshot.tasks[idx];
      const updated: TaskRecord = {
        ...current,
        ...patch,
        task_id: current.task_id,
        numero_tache: current.numero_tache,
        date_creation: current.date_creation,
        createur_id: current.createur_id,
      };
      this.snapshot.tasks[idx] = updated;
      this.persistSync();
      return { ...updated };
    });
  }

  // Affectations
  async listAssignments(taskId?: string): Promise<AssignmentRecord[]> {
    await this.init();
    const rows = taskId
      ? this.snapshot.assignments.filter((a) => a.task_id === taskId)
      : this.snapshot.assignments;
    return rows.map((a) => ({ ...a }));
  }

  async upsertAssignmentsForTask(
    taskId: string,
    assignments: AssignmentRecord[]
  ): Promise<AssignmentRecord[]> {
    await this.init();
    return this.enqueueWrite(async () => {
      const remaining = this.snapshot.assignments.filter((a) => a.task_id !== taskId);
      const copies = assignments.map((a) => ({ ...a }));
      this.snapshot.assignments = [...remaining, ...copies];
      this.persistSync();
      return copies.map((a) => ({ ...a }));
    });
  }

  async updateAssignment(
    assignmentId: string,
    patch: Partial<AssignmentRecord>
  ): Promise<AssignmentRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      const idx = this.snapshot.assignments.findIndex((a) => a.assignment_id === assignmentId);
      if (idx === -1) return null;
      const updated: AssignmentRecord = {
        ...this.snapshot.assignments[idx],
        ...patch,
        assignment_id: this.snapshot.assignments[idx].assignment_id,
        task_id: this.snapshot.assignments[idx].task_id,
        agent_id: this.snapshot.assignments[idx].agent_id,
      };
      this.snapshot.assignments[idx] = updated;
      this.persistSync();
      return { ...updated };
    });
  }

  async removeAssignment(taskId: string, agentId: string): Promise<boolean> {
    await this.init();
    return this.enqueueWrite(async () => {
      const before = this.snapshot.assignments.length;
      this.snapshot.assignments = this.snapshot.assignments.filter(
        (a) => !(a.task_id === taskId && a.agent_id === agentId)
      );
      const removed = this.snapshot.assignments.length !== before;
      if (removed) this.persistSync();
      return removed;
    });
  }

  // Comptes-rendus & Photos
  async listReports(taskId?: string): Promise<ReportRecord[]> {
    await this.init();
    const list = this.snapshot.reports || [];
    const filtered = taskId ? list.filter((r) => r.task_id === taskId) : list;
    return filtered.map((r) => ({ ...r }));
  }

  async getReportById(reportId: string): Promise<ReportRecord | null> {
    await this.init();
    const found = (this.snapshot.reports || []).find((r) => r.report_id === reportId);
    return found ? { ...found } : null;
  }

  async createReport(report: ReportRecord): Promise<ReportRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      if (!this.snapshot.reports) this.snapshot.reports = [];
      const copy = { ...report };
      this.snapshot.reports.push(copy);
      this.persistSync();
      return { ...copy };
    });
  }

  async updateReport(
    reportId: string,
    patch: Partial<ReportRecord>
  ): Promise<ReportRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      if (!this.snapshot.reports) this.snapshot.reports = [];
      const idx = this.snapshot.reports.findIndex((r) => r.report_id === reportId);
      if (idx === -1) return null;
      const current = this.snapshot.reports[idx];
      const updated: ReportRecord = {
        ...current,
        ...patch,
        report_id: current.report_id,
        task_id: current.task_id,
        agent_id: current.agent_id,
        version: current.version,
      };
      this.snapshot.reports[idx] = updated;
      this.persistSync();
      return { ...updated };
    });
  }

  async listPhotos(filters?: { taskId?: string; reportId?: string }): Promise<PhotoRecord[]> {
    await this.init();
    let list = [...(this.snapshot.photos || [])];
    if (filters?.taskId) {
      list = list.filter((p) => p.task_id === filters.taskId);
    }
    if (filters?.reportId) {
      list = list.filter((p) => p.report_id === filters.reportId);
    }
    return list.map((p) => ({ ...p }));
  }

  async getPhotoById(photoId: string): Promise<PhotoRecord | null> {
    await this.init();
    const found = (this.snapshot.photos || []).find((p) => p.photo_id === photoId);
    return found ? { ...found } : null;
  }

  async createPhoto(photo: PhotoRecord): Promise<PhotoRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      if (!this.snapshot.photos) this.snapshot.photos = [];
      const copy = { ...photo };
      this.snapshot.photos.push(copy);
      this.persistSync();
      return { ...copy };
    });
  }

  async updatePhoto(
    photoId: string,
    patch: Partial<PhotoRecord>
  ): Promise<PhotoRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      if (!this.snapshot.photos) this.snapshot.photos = [];
      const idx = this.snapshot.photos.findIndex((p) => p.photo_id === photoId);
      if (idx === -1) return null;
      const updated: PhotoRecord = {
        ...this.snapshot.photos[idx],
        ...patch,
        photo_id: this.snapshot.photos[idx].photo_id,
      };
      this.snapshot.photos[idx] = updated;
      this.persistSync();
      return { ...updated };
    });
  }

  // Notifications
  async listNotificationsByUser(userId: string): Promise<NotificationRecord[]> {
    await this.init();
    return this.snapshot.notifications
      .filter((n) => n.user_id === userId)
      .sort((a, b) => b.date_creation.localeCompare(a.date_creation))
      .map((n) => ({ ...n }));
  }

  async createNotificationIfUnique(
    notification: NotificationRecord
  ): Promise<NotificationRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      const exists = this.snapshot.notifications.some(
        (n) => n.dedup_key === notification.dedup_key
      );
      if (exists) return null;
      const copy = { ...notification };
      this.snapshot.notifications.push(copy);
      this.persistSync();
      return { ...copy };
    });
  }

  async markNotificationRead(
    notificationId: string,
    userId: string,
    readAtIso: string
  ): Promise<NotificationRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      const idx = this.snapshot.notifications.findIndex(
        (n) => n.notification_id === notificationId && n.user_id === userId
      );
      if (idx === -1) return null;
      if (!this.snapshot.notifications[idx].date_lecture) {
        this.snapshot.notifications[idx] = {
          ...this.snapshot.notifications[idx],
          date_lecture: readAtIso,
        };
        this.persistSync();
      }
      return { ...this.snapshot.notifications[idx] };
    });
  }

  async markAllNotificationsRead(userId: string, readAtIso: string): Promise<number> {
    await this.init();
    return this.enqueueWrite(async () => {
      let updatedCount = 0;
      this.snapshot.notifications = this.snapshot.notifications.map((n) => {
        if (n.user_id === userId && !n.date_lecture) {
          updatedCount += 1;
          return { ...n, date_lecture: readAtIso };
        }
        return n;
      });
      if (updatedCount > 0) {
        this.persistSync();
      }
      return updatedCount;
    });
  }

  // Historique
  async listHistory(filters?: {
    userId?: string;
    taskId?: string;
    limit?: number;
  }): Promise<HistoryRecord[]> {
    await this.init();
    let list = [...this.snapshot.history];
    if (filters?.userId) {
      list = list.filter((h) => h.user_id === filters.userId);
    }
    if (filters?.taskId) {
      list = list.filter((h) => h.task_id === filters.taskId);
    }
    list.sort((a, b) => b.date_serveur.localeCompare(a.date_serveur));
    if (filters?.limit && filters.limit > 0) {
      list = list.slice(0, filters.limit);
    }
    return list;
  }

  async appendHistory(entry: HistoryRecord): Promise<HistoryRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      const copy = { ...entry };
      this.snapshot.history.push(copy);
      this.persistSync();
      return { ...copy };
    });
  }

  // Paramètres
  async listParameters(): Promise<DistrictParamRecord[]> {
    await this.init();
    return this.snapshot.parameters.map((p) => ({ ...p }));
  }

  async createParameter(param: DistrictParamRecord): Promise<DistrictParamRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      const duplicate = this.snapshot.parameters.some(
        (p) =>
          p.categorie === param.categorie &&
          p.valeur.toLowerCase() === param.valeur.toLowerCase()
      );
      if (duplicate) throw new Error('DUPLICATE_PARAM');
      const copy = { ...param };
      this.snapshot.parameters.push(copy);
      this.persistSync();
      return { ...copy };
    });
  }

  async updateParameter(
    paramId: string,
    patch: Partial<DistrictParamRecord>
  ): Promise<DistrictParamRecord | null> {
    await this.init();
    return this.enqueueWrite(async () => {
      const idx = this.snapshot.parameters.findIndex((p) => p.param_id === paramId);
      if (idx === -1) return null;
      const updated: DistrictParamRecord = {
        ...this.snapshot.parameters[idx],
        ...patch,
        param_id: this.snapshot.parameters[idx].param_id,
      };
      this.snapshot.parameters[idx] = updated;
      this.persistSync();
      return { ...updated };
    });
  }

  // Sessions
  async upsertSessionDevice(device: SessionDeviceRecord): Promise<SessionDeviceRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      const idx = this.snapshot.sessions.findIndex(
        (s) => s.device_id === device.device_id && s.user_id === device.user_id
      );
      const copy = { ...device };
      if (idx >= 0) {
        this.snapshot.sessions[idx] = copy;
      } else {
        this.snapshot.sessions.push(copy);
      }
      this.persistSync();
      return { ...copy };
    });
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.init();
    await this.enqueueWrite(async () => {
      this.snapshot.sessions = this.snapshot.sessions.map((s) =>
        s.user_id === userId ? { ...s, statut: 'RÉVOQUÉ' } : s
      );
      this.persistSync();
    });
  }

  listSessionsByUser(userId: string): Promise<SessionDeviceRecord[]> {
    return this.init().then(() =>
      this.snapshot.sessions
        .filter((s) => s.user_id === userId)
        .map((s) => ({ ...s }))
    );
  }

  // Journal de synchronisation hors-ligne
  async listSyncOperations(filters?: {
    userId?: string;
    limit?: number;
  }): Promise<SyncOperationRecord[]> {
    await this.init();
    let list = [...(this.snapshot.sync_operations || [])];
    if (filters?.userId) {
      list = list.filter((op) => op.user_id === filters.userId);
    }
    list.sort((a, b) => b.date_operation.localeCompare(a.date_operation));
    if (filters?.limit && filters.limit > 0) {
      list = list.slice(0, filters.limit);
    }
    return list.map((op) => ({ ...op }));
  }

  async getSyncOperationById(operationId: string): Promise<SyncOperationRecord | null> {
    await this.init();
    const found = (this.snapshot.sync_operations || []).find(
      (op) => op.operation_id === operationId
    );
    return found ? { ...found } : null;
  }

  async upsertSyncOperation(op: SyncOperationRecord): Promise<SyncOperationRecord> {
    await this.init();
    return this.enqueueWrite(async () => {
      if (!this.snapshot.sync_operations) this.snapshot.sync_operations = [];
      const idx = this.snapshot.sync_operations.findIndex(
        (existing) => existing.operation_id === op.operation_id
      );
      const copy = { ...op };
      if (idx >= 0) {
        this.snapshot.sync_operations[idx] = copy;
      } else {
        this.snapshot.sync_operations.push(copy);
      }
      this.persistSync();
      return { ...copy };
    });
  }

  async exportSnapshot(): Promise<CentralStoreSnapshot> {
    await this.init();
    return JSON.parse(JSON.stringify(this.snapshot)) as CentralStoreSnapshot;
  }

  async restoreSnapshot(snapshot: CentralStoreSnapshot): Promise<void> {
    await this.init();
    await this.enqueueWrite(async () => {
      this.snapshot = {
        version: snapshot.version || 1,
        updated_at: nowIso(),
        agents: Array.isArray(snapshot.agents) ? snapshot.agents : [],
        tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : [],
        assignments: Array.isArray(snapshot.assignments) ? snapshot.assignments : [],
        reports: Array.isArray(snapshot.reports) ? snapshot.reports : [],
        photos: Array.isArray(snapshot.photos) ? snapshot.photos : [],
        notifications: Array.isArray(snapshot.notifications) ? snapshot.notifications : [],
        history: Array.isArray(snapshot.history) ? snapshot.history : [],
        parameters: Array.isArray(snapshot.parameters) ? snapshot.parameters : [],
        sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions : [],
        sync_operations: Array.isArray(snapshot.sync_operations)
          ? snapshot.sync_operations
          : [],
      };
      this.persistSync();
    });
  }
}

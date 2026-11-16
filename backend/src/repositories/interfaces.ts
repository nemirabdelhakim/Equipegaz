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

export interface IDataRepository {
  init(): Promise<void>;

  // Agents
  listAgents(): Promise<AgentRecord[]>;
  getAgentById(agentId: string): Promise<AgentRecord | null>;
  getAgentByIdentifier(identifier: string): Promise<AgentRecord | null>;
  getAgentByFirebaseUid(uid: string): Promise<AgentRecord | null>;
  createAgent(agent: AgentRecord): Promise<AgentRecord>;
  updateAgent(agentId: string, patch: Partial<AgentRecord>): Promise<AgentRecord | null>;
  updateAgentStatus(agentId: string, statut: AgentStatus): Promise<AgentRecord | null>;

  // Tâches & Affectations (Phase 3)
  listTasks(): Promise<TaskRecord[]>;
  getTaskById(taskId: string): Promise<TaskRecord | null>;
  createTask(task: TaskRecord): Promise<TaskRecord>;
  updateTask(taskId: string, patch: Partial<TaskRecord>): Promise<TaskRecord | null>;
  listAssignments(taskId?: string): Promise<AssignmentRecord[]>;
  upsertAssignmentsForTask(
    taskId: string,
    assignments: AssignmentRecord[]
  ): Promise<AssignmentRecord[]>;
  updateAssignment(
    assignmentId: string,
    patch: Partial<AssignmentRecord>
  ): Promise<AssignmentRecord | null>;
  removeAssignment(taskId: string, agentId: string): Promise<boolean>;

  // Comptes-rendus & Photos (Phase 5)
  listReports(taskId?: string): Promise<ReportRecord[]>;
  getReportById(reportId: string): Promise<ReportRecord | null>;
  createReport(report: ReportRecord): Promise<ReportRecord>;
  updateReport(reportId: string, patch: Partial<ReportRecord>): Promise<ReportRecord | null>;
  listPhotos(filters?: { taskId?: string; reportId?: string }): Promise<PhotoRecord[]>;
  getPhotoById(photoId: string): Promise<PhotoRecord | null>;
  createPhoto(photo: PhotoRecord): Promise<PhotoRecord>;
  updatePhoto(photoId: string, patch: Partial<PhotoRecord>): Promise<PhotoRecord | null>;

  // Notifications
  listNotificationsByUser(userId: string): Promise<NotificationRecord[]>;
  createNotificationIfUnique(notification: NotificationRecord): Promise<NotificationRecord | null>;
  markNotificationRead(
    notificationId: string,
    userId: string,
    readAtIso: string
  ): Promise<NotificationRecord | null>;
  markAllNotificationsRead(userId: string, readAtIso: string): Promise<number>;

  // Historique (append-only)
  listHistory(filters?: { userId?: string; taskId?: string; limit?: number }): Promise<HistoryRecord[]>;
  appendHistory(entry: HistoryRecord): Promise<HistoryRecord>;

  // Paramètres
  listParameters(): Promise<DistrictParamRecord[]>;
  createParameter(param: DistrictParamRecord): Promise<DistrictParamRecord>;
  updateParameter(
    paramId: string,
    patch: Partial<DistrictParamRecord>
  ): Promise<DistrictParamRecord | null>;

  // Sessions et appareils
  upsertSessionDevice(device: SessionDeviceRecord): Promise<SessionDeviceRecord>;
  revokeUserSessions(userId: string): Promise<void>;
  listSessionsByUser(userId: string): Promise<SessionDeviceRecord[]>;

  // Journal de synchronisation hors-ligne (Phase 6)
  listSyncOperations(filters?: { userId?: string; limit?: number }): Promise<SyncOperationRecord[]>;
  getSyncOperationById(operationId: string): Promise<SyncOperationRecord | null>;
  upsertSyncOperation(op: SyncOperationRecord): Promise<SyncOperationRecord>;

  // Sauvegarde et restauration
  exportSnapshot(): Promise<CentralStoreSnapshot>;
  restoreSnapshot(snapshot: CentralStoreSnapshot): Promise<void>;
}

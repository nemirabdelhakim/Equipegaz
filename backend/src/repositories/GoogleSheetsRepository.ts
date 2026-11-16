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
import type { GoogleSyncService } from '../services/googleSyncService.js';
import { FileJsonRepository } from './FileJsonRepository.js';
import type { IDataRepository } from './interfaces.js';

export class GoogleSheetsRepository implements IDataRepository {
  private syncService: GoogleSyncService | null = null;

  constructor(private readonly localRepo: FileJsonRepository = new FileJsonRepository()) {}

  attachSyncService(service: GoogleSyncService): void {
    this.syncService = service;
  }

  private scheduleSheetsSync(): void {
    if (!this.syncService) return;
    void this.syncService.tryBackgroundSync();
  }

  init(): Promise<void> {
    return this.localRepo.init();
  }

  listAgents(): Promise<AgentRecord[]> {
    return this.localRepo.listAgents();
  }

  getAgentById(agentId: string): Promise<AgentRecord | null> {
    return this.localRepo.getAgentById(agentId);
  }

  getAgentByIdentifier(identifier: string): Promise<AgentRecord | null> {
    return this.localRepo.getAgentByIdentifier(identifier);
  }

  getAgentByFirebaseUid(uid: string): Promise<AgentRecord | null> {
    return this.localRepo.getAgentByFirebaseUid(uid);
  }

  async createAgent(agent: AgentRecord): Promise<AgentRecord> {
    const res = await this.localRepo.createAgent(agent);
    this.scheduleSheetsSync();
    return res;
  }

  async updateAgent(agentId: string, patch: Partial<AgentRecord>): Promise<AgentRecord | null> {
    const res = await this.localRepo.updateAgent(agentId, patch);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  async updateAgentStatus(agentId: string, statut: AgentStatus): Promise<AgentRecord | null> {
    const res = await this.localRepo.updateAgentStatus(agentId, statut);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  // Tâches & Affectations
  listTasks(): Promise<TaskRecord[]> {
    return this.localRepo.listTasks();
  }

  getTaskById(taskId: string): Promise<TaskRecord | null> {
    return this.localRepo.getTaskById(taskId);
  }

  async createTask(task: TaskRecord): Promise<TaskRecord> {
    const res = await this.localRepo.createTask(task);
    this.scheduleSheetsSync();
    return res;
  }

  async updateTask(taskId: string, patch: Partial<TaskRecord>): Promise<TaskRecord | null> {
    const res = await this.localRepo.updateTask(taskId, patch);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  listAssignments(taskId?: string): Promise<AssignmentRecord[]> {
    return this.localRepo.listAssignments(taskId);
  }

  async upsertAssignmentsForTask(
    taskId: string,
    assignments: AssignmentRecord[]
  ): Promise<AssignmentRecord[]> {
    const res = await this.localRepo.upsertAssignmentsForTask(taskId, assignments);
    this.scheduleSheetsSync();
    return res;
  }

  async updateAssignment(
    assignmentId: string,
    patch: Partial<AssignmentRecord>
  ): Promise<AssignmentRecord | null> {
    const res = await this.localRepo.updateAssignment(assignmentId, patch);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  async removeAssignment(taskId: string, agentId: string): Promise<boolean> {
    const removed = await this.localRepo.removeAssignment(taskId, agentId);
    if (removed) this.scheduleSheetsSync();
    return removed;
  }

  // Comptes-rendus & Photos
  listReports(taskId?: string): Promise<ReportRecord[]> {
    return this.localRepo.listReports(taskId);
  }

  getReportById(reportId: string): Promise<ReportRecord | null> {
    return this.localRepo.getReportById(reportId);
  }

  async createReport(report: ReportRecord): Promise<ReportRecord> {
    const res = await this.localRepo.createReport(report);
    this.scheduleSheetsSync();
    return res;
  }

  async updateReport(
    reportId: string,
    patch: Partial<ReportRecord>
  ): Promise<ReportRecord | null> {
    const res = await this.localRepo.updateReport(reportId, patch);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  listPhotos(filters?: { taskId?: string; reportId?: string }): Promise<PhotoRecord[]> {
    return this.localRepo.listPhotos(filters);
  }

  getPhotoById(photoId: string): Promise<PhotoRecord | null> {
    return this.localRepo.getPhotoById(photoId);
  }

  async createPhoto(photo: PhotoRecord): Promise<PhotoRecord> {
    const res = await this.localRepo.createPhoto(photo);
    this.scheduleSheetsSync();
    return res;
  }

  async updatePhoto(
    photoId: string,
    patch: Partial<PhotoRecord>
  ): Promise<PhotoRecord | null> {
    const res = await this.localRepo.updatePhoto(photoId, patch);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  // Notifications
  listNotificationsByUser(userId: string): Promise<NotificationRecord[]> {
    return this.localRepo.listNotificationsByUser(userId);
  }

  async createNotificationIfUnique(
    notification: NotificationRecord
  ): Promise<NotificationRecord | null> {
    const res = await this.localRepo.createNotificationIfUnique(notification);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  async markNotificationRead(
    notificationId: string,
    userId: string,
    readAtIso: string
  ): Promise<NotificationRecord | null> {
    const res = await this.localRepo.markNotificationRead(notificationId, userId, readAtIso);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  async markAllNotificationsRead(userId: string, readAtIso: string): Promise<number> {
    const count = await this.localRepo.markAllNotificationsRead(userId, readAtIso);
    if (count > 0) this.scheduleSheetsSync();
    return count;
  }

  // Historique
  listHistory(filters?: {
    userId?: string;
    taskId?: string;
    limit?: number;
  }): Promise<HistoryRecord[]> {
    return this.localRepo.listHistory(filters);
  }

  async appendHistory(entry: HistoryRecord): Promise<HistoryRecord> {
    const res = await this.localRepo.appendHistory(entry);
    this.scheduleSheetsSync();
    return res;
  }

  // Paramètres
  listParameters(): Promise<DistrictParamRecord[]> {
    return this.localRepo.listParameters();
  }

  async createParameter(param: DistrictParamRecord): Promise<DistrictParamRecord> {
    const res = await this.localRepo.createParameter(param);
    this.scheduleSheetsSync();
    return res;
  }

  async updateParameter(
    paramId: string,
    patch: Partial<DistrictParamRecord>
  ): Promise<DistrictParamRecord | null> {
    const res = await this.localRepo.updateParameter(paramId, patch);
    if (res) this.scheduleSheetsSync();
    return res;
  }

  // Sessions
  async upsertSessionDevice(device: SessionDeviceRecord): Promise<SessionDeviceRecord> {
    const res = await this.localRepo.upsertSessionDevice(device);
    this.scheduleSheetsSync();
    return res;
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.localRepo.revokeUserSessions(userId);
    this.scheduleSheetsSync();
  }

  listSessionsByUser(userId: string): Promise<SessionDeviceRecord[]> {
    return this.localRepo.listSessionsByUser(userId);
  }

  listSyncOperations(filters?: {
    userId?: string;
    limit?: number;
  }): Promise<SyncOperationRecord[]> {
    return this.localRepo.listSyncOperations(filters);
  }

  getSyncOperationById(operationId: string): Promise<SyncOperationRecord | null> {
    return this.localRepo.getSyncOperationById(operationId);
  }

  async upsertSyncOperation(op: SyncOperationRecord): Promise<SyncOperationRecord> {
    const res = await this.localRepo.upsertSyncOperation(op);
    this.scheduleSheetsSync();
    return res;
  }

  exportSnapshot(): Promise<CentralStoreSnapshot> {
    return this.localRepo.exportSnapshot();
  }

  async restoreSnapshot(snapshot: CentralStoreSnapshot): Promise<void> {
    await this.localRepo.restoreSnapshot(snapshot);
    this.scheduleSheetsSync();
  }
}

import { getInMemoryWorkspaceToken } from '../lib/firebase';
import type {
  AgentAssignmentStatus,
  AgentDTO,
  AgentStatus,
  AgentTrackingDTO,
  BackupFileInfo,
  DashboardFilterParams,
  DashboardStatsDTO,
  DistrictParam,
  ExportFormat,
  ExportReportType,
  HistoryEntry,
  NotificationDTO,
  ParamCategory,
  PhotoRecord,
  PhotoType,
  ReportDTO,
  ServerSyncOperation,
  SessionDevice,
  SheetPreviewDTO,
  StorageStatusDTO,
  SyncOperationType,
  SyncPushResultItem,
  TaskDTO,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '../models/types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return err instanceof TypeError || (err instanceof Error && /network|fetch|offline/i.test(err.message));
}

const TOKEN_STORAGE_KEY = 'sonelgaz_sa_session_token';
const API_BASE_STORAGE_KEY = 'sonelgaz_sa_api_base_url';

export function isNativeCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  if (typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return true;
  }
  return window.location.protocol === 'capacitor:';
}

export function getClientPlatform(): 'ANDROID' | 'WEB' {
  return isNativeCapacitorApp() ? 'ANDROID' : 'WEB';
}

export function getApiBaseUrl(): string {
  try {
    const custom = localStorage.getItem(API_BASE_STORAGE_KEY);
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  } catch {
    // ignore storage errors
  }
  const envUrl =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
          ?.VITE_API_BASE_URL ?? '')
      : '';
  return envUrl.trim().replace(/\/+$/, '');
}

export function setApiBaseUrl(url: string): void {
  try {
    const cleaned = url.trim().replace(/\/+$/, '');
    if (cleaned) {
      localStorage.setItem(API_BASE_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(API_BASE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function resolveApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api${normalizedPath}`;
}

let memoryToken: string | null = null;
let onUnauthorizedCallback: ((message: string) => void) | null = null;

export function setUnauthorizedHandler(cb: (message: string) => void): void {
  onUnauthorizedCallback = cb;
}

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken =
      localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return memoryToken;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  googleAccessToken?: string | null
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const wsToken = googleAccessToken ?? getInMemoryWorkspaceToken();
  if (wsToken && path.startsWith('/storage/')) {
    headers.set('X-Google-Access-Token', wsToken);
  }

  const res = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.error || 'REQUEST_ERROR';
    const message = data.message || `Erreur HTTP ${res.status}`;
    if (
      res.status === 401 &&
      path !== '/auth/login' &&
      path !== '/auth/firebase' &&
      !path.startsWith('/storage/')
    ) {
      setStoredToken(null);
      onUnauthorizedCallback?.(message);
    }
    if (
      res.status === 403 &&
      (code === 'ACCOUNT_DISABLED' || code === 'SESSION_REVOKED')
    ) {
      setStoredToken(null);
      onUnauthorizedCallback?.(message);
    }
    throw new ApiError(res.status, code, message);
  }

  return data as T;
}

export interface CreateAgentPayload {
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: string;
  login_email: string;
  role: UserRole;
  statut: AgentStatus;
  initial_password?: string;
}

export type UpdateAgentPayload = Partial<Omit<CreateAgentPayload, 'initial_password'>>;

export interface CreateTaskPayload {
  titre: string;
  categorie: string;
  description: string;
  instructions: string;
  commune: string;
  dp: string;
  adresse: string;
  repere_geo: string;
  latitude: string;
  longitude: string;
  priorite: TaskPriority;
  date_debut_prevue: string;
  heure_prevue: string;
  date_fin_prevue: string;
  equipe: string;
  materiel_necessaire: string;
  observations: string;
  assigned_agent_ids: string[];
}

export type UpdateTaskPayload = Partial<CreateTaskPayload> & {
  expected_version?: number;
};

export const apiClient = {
  loginWithCredentials(payload: {
    identifier: string;
    password: string;
    device_id: string;
    plateforme: 'WEB' | 'ANDROID';
  }) {
    return request<{ token: string; user: AgentDTO }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  loginWithFirebase(payload: {
    idToken: string;
    device_id: string;
    plateforme: 'WEB' | 'ANDROID';
  }) {
    return request<{ token: string; user: AgentDTO }>('/auth/firebase', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMe() {
    return request<{ user: AgentDTO; sessions: SessionDevice[] }>('/auth/me');
  },

  logout() {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  listAgents() {
    return request<{ agents: AgentDTO[] }>('/agents');
  },

  createAgent(payload: CreateAgentPayload) {
    return request<{ agent: AgentDTO; temporaryPassword: string }>('/agents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAgent(agentId: string, payload: UpdateAgentPayload) {
    return request<{ agent: AgentDTO }>(`/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  updateAgentStatus(agentId: string, statut: AgentStatus, commentaire?: string) {
    return request<{ agent: AgentDTO }>(`/agents/${agentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ statut, commentaire }),
    });
  },

  resetAgentAccess(agentId: string) {
    return request<{ agent: AgentDTO; temporaryPassword: string }>(
      `/agents/${agentId}/reset-access`,
      { method: 'POST' }
    );
  },

  getAgentHistory(agentId: string) {
    return request<{ history: HistoryEntry[] }>(`/agents/${agentId}/history`);
  },

  // Phase 3 : Tâches & Affectations
  listTasks() {
    return request<{ tasks: TaskDTO[] }>('/tasks');
  },

  getTask(taskId: string) {
    return request<{ task: TaskDTO }>(`/tasks/${taskId}`);
  },

  createTask(payload: CreateTaskPayload) {
    return request<{ task: TaskDTO }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateTask(taskId: string, payload: UpdateTaskPayload) {
    return request<{ task: TaskDTO }>(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  patchTaskStatus(taskId: string, statut: TaskStatus, commentaire: string) {
    return request<{ task: TaskDTO }>(`/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ statut, commentaire }),
    });
  },

  // Phase 4 : Exécution terrain agent affecté
  patchMyTaskExecution(
    taskId: string,
    statut_agent: AgentAssignmentStatus,
    motif = ''
  ) {
    return request<{ task: TaskDTO }>(`/tasks/${taskId}/my-status`, {
      method: 'PATCH',
      body: JSON.stringify({ statut_agent, motif }),
    });
  },

  assignAgents(
    taskId: string,
    agent_ids: string[],
    equipe = '',
    mode: 'ADD' | 'REPLACE' = 'ADD'
  ) {
    return request<{ task: TaskDTO }>(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agent_ids, equipe, mode }),
    });
  },

  unassignAgent(taskId: string, agentId: string) {
    return request<{ task: TaskDTO }>(`/tasks/${taskId}/assign/${agentId}`, {
      method: 'DELETE',
    });
  },

  // Phase 5 : Comptes-rendus, Photos & Validation Chef
  listAllReports() {
    return request<{ reports: ReportDTO[] }>('/reports');
  },

  listTaskReports(taskId: string) {
    return request<{ reports: ReportDTO[]; photos: PhotoRecord[] }>(
      `/tasks/${taskId}/reports`
    );
  },

  submitTaskReport(
    taskId: string,
    payload: {
      travail_effectue: string;
      resultat: string;
      difficultes: string;
      materiel: string;
      travaux_restants: string;
      recommandations: string;
      temps_passe_minutes: number;
      photo_ids: string[];
    }
  ) {
    return request<{ report: ReportDTO }>(`/tasks/${taskId}/reports`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  uploadTaskPhoto(
    taskId: string,
    payload: {
      type_photo: PhotoType;
      file_name: string;
      mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
      data_base64: string;
      report_id?: string;
    }
  ) {
    return request<{ photo: PhotoRecord }>(`/tasks/${taskId}/photos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  reviewReport(
    reportId: string,
    decision: 'VALIDÉ' | 'REFUSÉ',
    commentaire_chef: string
  ) {
    return request<{ report: ReportDTO }>(`/reports/${reportId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, commentaire_chef }),
    });
  },

  async fetchProtectedPhotoBlobUrl(photoId: string): Promise<string> {
    const token = getStoredToken();
    const res = await fetch(resolveApiUrl(`/photos/${encodeURIComponent(photoId)}/content`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error('Photo indisponible');
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  listHistory(limit = 200) {
    return request<{ history: HistoryEntry[] }>(`/history?limit=${limit}`);
  },

  listParams() {
    return request<{ parameters: DistrictParam[] }>('/params');
  },

  createParam(payload: {
    categorie: ParamCategory;
    valeur: string;
    libelle: string;
    metadata_json?: string;
    actif?: boolean;
  }) {
    return request<{ parameter: DistrictParam }>('/params', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateParam(
    paramId: string,
    payload: Partial<{
      valeur: string;
      libelle: string;
      metadata_json: string;
      actif: boolean;
    }>
  ) {
    return request<{ parameter: DistrictParam }>(`/params/${paramId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  // Phase 2 : Stockage Central Google Sheets / Drive & Sauvegardes
  getStorageStatus() {
    return request<StorageStatusDTO>('/storage/status');
  },

  connectGoogleWorkspace(accessToken: string) {
    return request<{ connected: boolean; email: string; metadata: StorageStatusDTO['metadata'] }>(
      '/storage/google/connect',
      { method: 'POST' },
      accessToken
    );
  },

  disconnectGoogleWorkspace() {
    return request<{ success: boolean }>('/storage/google/disconnect', {
      method: 'POST',
    });
  },

  provisionSheetsWorkbook(spreadsheetId?: string) {
    return request<{ success: boolean; metadata: StorageStatusDTO['metadata'] }>(
      '/storage/sheets/provision',
      {
        method: 'POST',
        body: JSON.stringify({ spreadsheetId: spreadsheetId || undefined }),
      }
    );
  },

  syncSheetsNow() {
    return request<{ success: boolean; metadata: StorageStatusDTO['metadata'] }>(
      '/storage/sheets/sync',
      { method: 'POST' }
    );
  },

  previewSheet(sheetName: string) {
    return request<SheetPreviewDTO>(
      `/storage/sheets/preview/${encodeURIComponent(sheetName)}`
    );
  },

  listBackups() {
    return request<{ backups: BackupFileInfo[] }>('/storage/backups');
  },

  createBackup(uploadToDrive = false) {
    return request<{ backup: BackupFileInfo; driveFileUrl?: string }>(
      '/storage/backups',
      {
        method: 'POST',
        body: JSON.stringify({ uploadToDrive }),
      }
    );
  },

  restoreBackup(filename: string) {
    return request<{ success: boolean; filename: string }>(
      `/storage/backups/${encodeURIComponent(filename)}/restore`,
      { method: 'POST' }
    );
  },

  // Phase 6 : Synchronisation temps réel & hors-ligne
  syncPush(
    device_id: string,
    operations: Array<{
      operation_id: string;
      type_operation: SyncOperationType;
      target_id: string;
      client_timestamp: string;
      base_version?: number;
      local_photo_id?: string;
      payload: Record<string, unknown>;
    }>
  ) {
    return request<{
      server_time_iso: string;
      results: SyncPushResultItem[];
    }>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ device_id, operations }),
    });
  },

  syncPull(sinceIso?: string) {
    const q = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : '';
    return request<{
      server_time_iso: string;
      server_time_fr: string;
      has_changes: boolean;
      snapshot: {
        agents: AgentDTO[];
        tasks: TaskDTO[];
        reports: ReportDTO[];
        history: HistoryEntry[];
        parameters: DistrictParam[];
        notifications: NotificationDTO[];
      };
    }>(`/sync/pull${q}`);
  },

  getSyncStatus() {
    return request<{
      server_time_iso: string;
      server_time_fr: string;
      operations: ServerSyncOperation[];
    }>('/sync/status');
  },

  // Phase 7 : Tableau de bord KPI, suivi individuel, notifications & exports
  getDashboardStats(filters: DashboardFilterParams = {}) {
    const search = new URLSearchParams();
    if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) search.set('dateTo', filters.dateTo);
    if (filters.commune) search.set('commune', filters.commune);
    if (filters.dp) search.set('dp', filters.dp);
    if (filters.categorie) search.set('categorie', filters.categorie);
    if (filters.agentId) search.set('agentId', filters.agentId);
    if (filters.priorite) search.set('priorite', filters.priorite);
    if (filters.statut) search.set('statut', filters.statut);
    if (filters.granularity) search.set('granularity', filters.granularity);
    const qs = search.toString();
    return request<DashboardStatsDTO>(`/dashboard${qs ? `?${qs}` : ''}`);
  },

  getAgentStatistics(filters: { dateFrom?: string; dateTo?: string; agentId?: string } = {}) {
    const search = new URLSearchParams();
    if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) search.set('dateTo', filters.dateTo);
    if (filters.agentId) search.set('agentId', filters.agentId);
    const qs = search.toString();
    return request<{ agents: AgentTrackingDTO[] }>(`/statistics/agents${qs ? `?${qs}` : ''}`);
  },

  listNotifications() {
    return request<{ notifications: NotificationDTO[]; unread_count: number }>('/notifications');
  },

  markNotificationRead(notificationId: string) {
    return request<{ notification: NotificationDTO }>(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'PATCH' }
    );
  },

  markAllNotificationsRead() {
    return request<{ updated_count: number }>('/notifications/read-all', {
      method: 'POST',
    });
  },

  registerNotificationDevice(
    device_id: string,
    plateforme: 'ANDROID' | 'WEB',
    token_notification: string
  ) {
    return request<{ session: SessionDevice }>('/notifications/register-device', {
      method: 'POST',
      body: JSON.stringify({ device_id, plateforme, token_notification }),
    });
  },

  async downloadOfficialReport(params: {
    type: ExportReportType;
    format: ExportFormat;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    agentId?: string;
    commune?: string;
    dp?: string;
    categorie?: string;
    observations?: string;
  }): Promise<{ blob: Blob; fileName: string; reportNumber: string }> {
    const search = new URLSearchParams();
    search.set('type', params.type);
    search.set('format', params.format);
    if (params.date) search.set('date', params.date);
    if (params.dateFrom) search.set('dateFrom', params.dateFrom);
    if (params.dateTo) search.set('dateTo', params.dateTo);
    if (params.agentId) search.set('agentId', params.agentId);
    if (params.commune) search.set('commune', params.commune);
    if (params.dp) search.set('dp', params.dp);
    if (params.categorie) search.set('categorie', params.categorie);
    if (params.observations) search.set('observations', params.observations);

    const token = getStoredToken();
    const res = await fetch(resolveApiUrl(`/exports/report?${search.toString()}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        errData.error || 'EXPORT_ERROR',
        errData.message || `Erreur export HTTP ${res.status}`
      );
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const fileName =
      match?.[1] || `sonelgaz_sidi_ali_${params.type.toLowerCase()}.${params.format}`;
    const reportNumber = res.headers.get('X-Report-Number') || '';
    return { blob, fileName, reportNumber };
  },
};

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

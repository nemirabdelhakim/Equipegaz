export type UserRole = 'CHEF' | 'AGENT';

export type AgentStatus = 'ACTIF' | 'INACTIF' | 'ABSENT' | 'CONGÉ' | 'SUSPENDU';

export type TaskPriority = 'URGENTE' | 'HAUTE' | 'NORMALE' | 'BASSE';

export type TaskStatus =
  | 'NOUVELLE'
  | 'TRANSMISE'
  | 'ACCEPTÉE'
  | 'EN COURS'
  | 'EN ATTENTE'
  | 'BLOQUÉE'
  | 'TERMINÉE'
  | 'À VALIDER'
  | 'VALIDÉE'
  | 'REFUSÉE'
  | 'ANNULÉE';

export type AgentAssignmentStatus =
  | 'TRANSMISE'
  | 'ACCEPTÉE'
  | 'EN COURS'
  | 'EN ATTENTE'
  | 'BLOQUÉE'
  | 'TERMINÉE';

export type ParamCategory = 'COMMUNE' | 'DP' | 'COMMUNE_DP' | 'CATEGORIE_TRAVAUX' | 'EQUIPE';

export interface AgentDTO {
  agent_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: string;
  photo_url: string;
  login_email: string;
  firebase_uid: string;
  role: UserRole;
  statut: AgentStatus;
  must_change_password: boolean;
  token_version: number;
  date_creation: string;
  derniere_connexion: string;
}

export interface TaskAssignmentDTO {
  assignment_id: string;
  task_id: string;
  agent_id: string;
  equipe: string;
  date_affectation: string;
  statut_agent: AgentAssignmentStatus;
  motif_blocage_attente: string;
  date_acceptation: string;
  date_debut: string;
  date_fin: string;
  agent_matricule: string;
  agent_nom: string;
  agent_prenom: string;
  agent_fonction: string;
}

export interface TaskDTO {
  task_id: string;
  numero_tache: string;
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
  date_creation: string;
  date_debut_prevue: string;
  heure_prevue: string;
  date_fin_prevue: string;
  equipe: string;
  materiel_necessaire: string;
  observations: string;
  statut_global: TaskStatus;
  createur_id: string;
  version: number;
  updated_at: string;
  assignments: TaskAssignmentDTO[];
}

export type ReportValidationStatus = 'EN_ATTENTE' | 'VALIDÉ' | 'REFUSÉ';

export type PhotoType = 'AVANT' | 'APRES';

export interface PhotoRecord {
  photo_id: string;
  task_id: string;
  report_id: string;
  agent_id: string;
  type_photo: PhotoType;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  drive_file_id: string;
  drive_url: string;
  local_file: string;
  synced_to_drive: boolean;
  date_creation: string;
}

export interface ReportDTO {
  report_id: string;
  task_id: string;
  agent_id: string;
  version: number;
  travail_effectue: string;
  resultat: string;
  difficultes: string;
  materiel: string;
  travaux_restants: string;
  recommandations: string;
  temps_passe_minutes: number;
  date_soumission: string;
  validation: ReportValidationStatus;
  commentaire_chef: string;
  date_validation: string;
  validateur_id: string;
  agent_matricule: string;
  agent_nom: string;
  agent_prenom: string;
  validateur_nom: string;
  photos: PhotoRecord[];
}

export interface HistoryEntry {
  history_id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  action: string;
  ancien_etat: string;
  nouvel_etat: string;
  ancienne_valeur: string;
  nouvelle_valeur: string;
  commentaire: string;
  date_serveur: string;
}

export interface DistrictParam {
  param_id: string;
  categorie: ParamCategory;
  valeur: string;
  libelle: string;
  metadata_json: string;
  actif: boolean;
}

export interface SessionDevice {
  device_id: string;
  user_id: string;
  plateforme: 'ANDROID' | 'WEB';
  derniere_connexion: string;
  token_notification: string;
  statut: 'ACTIF' | 'RÉVOQUÉ';
}

export interface StorageStatusDTO {
  googleConnected: boolean;
  authMode: 'SERVICE_ACCOUNT' | 'OAUTH_SESSION' | 'LOCAL_MIRROR';
  metadata: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    driveFolderId: string;
    connectedAccountEmail: string;
    lastSyncedAt: string;
    pendingMutations: number;
  };
  sheetCount: number;
  sheets: Array<{ name: string; columns: number }>;
  backupsCount: number;
}

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  createdAtFr: string;
}

export interface SheetPreviewDTO {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

export type SyncOperationStatus =
  | 'SYNCHRONISÉ'
  | 'EN ATTENTE'
  | 'EN COURS'
  | 'ERREUR'
  | 'CONFLIT';

export type SyncOperationType =
  | 'TASK_AGENT_STATUS'
  | 'TASK_UPDATE'
  | 'PHOTO_UPLOAD'
  | 'REPORT_SUBMIT';

export interface OfflineQueueOperation {
  operation_id: string; // UUID unique
  user_id: string;
  type_operation: SyncOperationType;
  target_id: string;
  label: string;
  client_timestamp: string;
  base_version?: number;
  local_photo_id?: string;
  payload: Record<string, unknown>;
  statut: SyncOperationStatus;
  message_erreur?: string;
  server_version?: number;
  server_status?: string;
  synced_at?: string;
}

export interface ServerSyncOperation {
  operation_id: string;
  user_id: string;
  device_id: string;
  type_operation: SyncOperationType;
  target_id: string;
  date_operation: string;
  statut: SyncOperationStatus;
  message_erreur: string;
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

export interface NotificationDTO {
  notification_id: string;
  dedup_key: string;
  user_id: string;
  task_id: string;
  type_event: string;
  titre: string;
  message: string;
  date_creation: string;
  statut_envoi: 'EN_ATTENTE' | 'ENVOYÉ' | 'ERREUR';
  date_lecture: string;
}

export interface DashboardFilterParams {
  dateFrom?: string;
  dateTo?: string;
  commune?: string;
  dp?: string;
  categorie?: string;
  agentId?: string;
  priorite?: string;
  statut?: string;
  granularity?: 'day' | 'week' | 'month';
}

export interface DashboardStatsDTO {
  today_iso: string;
  kpis: {
    total: number;
    nouvelle: number;
    transmise: number;
    acceptee: number;
    en_cours: number;
    en_attente: number;
    bloquee: number;
    terminee: number;
    a_valider: number;
    validee: number;
    refusee: number;
    annulee: number;
    en_retard: number;
    cr_a_valider: number;
    cr_valides: number;
    cr_refuses: number;
  };
  byCategory: Array<{
    code: string;
    libelle: string;
    count: number;
    urgentCount: number;
    validatedCount: number;
  }>;
  byCommune: Array<{
    commune: string;
    count: number;
    activeCount: number;
    overdueCount: number;
  }>;
  byDp: Array<{
    dp: string;
    count: number;
    activeCount: number;
    overdueCount: number;
  }>;
  byPriority: Array<{
    priorite: TaskPriority;
    count: number;
  }>;
  byAgent: Array<{
    agent_id: string;
    matricule: string;
    nom: string;
    prenom: string;
    totalAssigned: number;
    inProgress: number;
    completed: number;
    validated: number;
    blocked: number;
    overdue: number;
  }>;
  evolution: Array<{
    bucket: string;
    label: string;
    created: number;
    completed: number;
    validated: number;
  }>;
  overdueTasks: Array<{
    task_id: string;
    numero_tache: string;
    titre: string;
    commune: string;
    dp: string;
    priorite: TaskPriority;
    statut_global: TaskStatus;
    date_fin_prevue: string;
    agents: string;
  }>;
  mapPoints: Array<{
    task_id: string;
    numero_tache: string;
    titre: string;
    commune: string;
    dp: string;
    adresse: string;
    priorite: TaskPriority;
    statut_global: TaskStatus;
    latitude: number;
    longitude: number;
  }>;
}

export interface AgentTimelineItemDTO {
  id: string;
  date: string;
  task_id: string;
  numero_tache: string;
  titre: string;
  priorite: TaskPriority;
  statut: string;
  detail: string;
}

export interface AgentTrackingDTO {
  agent_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: string;
  role: UserRole;
  statut: AgentStatus;
  derniere_connexion: string;
  total_affectees: number;
  transmises: number;
  acceptees: number;
  en_cours: number;
  en_attente: number;
  bloquees: number;
  terminees: number;
  validees: number;
  en_retard: number;
  cr_soumis: number;
  cr_en_attente: number;
  cr_valides: number;
  cr_refuses: number;
  temps_moyen_minutes: number;
  complexite: {
    urgentes: number;
    collectives: number;
    individuelles: number;
    complexes: number;
    simples: number;
  };
  timeline: AgentTimelineItemDTO[];
}

export type ExportReportType =
  | 'DAILY_PROGRAM'
  | 'DAILY_WORK'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'BY_AGENT'
  | 'BY_COMMUNE'
  | 'BY_DP'
  | 'BY_CATEGORY'
  | 'UNFINISHED'
  | 'OVERDUE'
  | 'BLOCKED'
  | 'VALIDATED_REPORTS';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

export interface CachedWorkspaceSnapshot {
  user_id: string;
  cached_at: string;
  last_server_sync_iso: string;
  agents: AgentDTO[];
  tasks: TaskDTO[];
  reports: ReportDTO[];
  history: HistoryEntry[];
  parameters: DistrictParam[];
  notifications?: NotificationDTO[];
}

export type AppSection =
  | 'overview'
  | 'missions'
  | 'planning'
  | 'tasks'
  | 'reports'
  | 'stats'
  | 'notifications'
  | 'exports'
  | 'sync'
  | 'agents'
  | 'history'
  | 'params'
  | 'storage'
  | 'profile';

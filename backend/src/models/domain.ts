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

export interface AgentRecord {
  agent_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: string;
  photo_url: string;
  login_email: string;
  firebase_uid: string;
  password_hash: string;
  role: UserRole;
  statut: AgentStatus;
  must_change_password: boolean;
  token_version: number;
  date_creation: string;
  derniere_connexion: string;
}

export type AgentPublicDTO = Omit<AgentRecord, 'password_hash'>;

export interface TaskRecord {
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
}

export interface AssignmentRecord {
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
}

export interface TaskWithAssignmentsDTO extends TaskRecord {
  assignments: Array<
    AssignmentRecord & {
      agent_matricule: string;
      agent_nom: string;
      agent_prenom: string;
      agent_fonction: string;
    }
  >;
}

export type ReportValidationStatus = 'EN_ATTENTE' | 'VALIDÉ' | 'REFUSÉ';

export interface ReportRecord {
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
}

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

export interface ReportDTO extends ReportRecord {
  agent_matricule: string;
  agent_nom: string;
  agent_prenom: string;
  validateur_nom: string;
  photos: PhotoRecord[];
}

export interface NotificationRecord {
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

export interface HistoryRecord {
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

export interface DistrictParamRecord {
  param_id: string;
  categorie: ParamCategory;
  valeur: string;
  libelle: string;
  metadata_json: string;
  actif: boolean;
}

export interface SessionDeviceRecord {
  device_id: string;
  user_id: string;
  plateforme: 'ANDROID' | 'WEB';
  derniere_connexion: string;
  token_notification: string;
  statut: 'ACTIF' | 'RÉVOQUÉ';
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

export interface SyncOperationRecord {
  operation_id: string;
  user_id: string;
  device_id: string;
  type_operation: SyncOperationType;
  target_id: string;
  date_operation: string;
  statut: SyncOperationStatus;
  message_erreur: string;
  result_json?: string;
}

export interface CentralStoreSnapshot {
  version: number;
  updated_at: string;
  agents: AgentRecord[];
  tasks: TaskRecord[];
  assignments: AssignmentRecord[];
  reports?: ReportRecord[];
  photos?: PhotoRecord[];
  notifications: NotificationRecord[];
  history: HistoryRecord[];
  parameters: DistrictParamRecord[];
  sessions: SessionDeviceRecord[];
  sync_operations?: SyncOperationRecord[];
}

export function toPublicAgent(agent: AgentRecord): AgentPublicDTO {
  const { password_hash: _ignored, ...safe } = agent;
  return safe;
}

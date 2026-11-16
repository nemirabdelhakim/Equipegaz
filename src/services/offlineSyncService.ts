import {
  type AgentAssignmentStatus,
  type AgentDTO,
  type CachedWorkspaceSnapshot,
  type DistrictParam,
  type HistoryEntry,
  type NotificationDTO,
  type OfflineQueueOperation,
  type PhotoRecord,
  type PhotoType,
  type ReportDTO,
  type TaskDTO,
} from '../models/types';
import { createOfflineStorageAdapter } from '../offline/indexedDbAdapter';
import type { OfflinePhotoBlob as IOfflinePhotoBlob } from '../offline/storageAdapter';
import { computeGlobalStatusFromAssignmentsClient } from '../utils/taskStatusClient';
import { getOrCreateDeviceId } from '../utils/formatters';
import { apiClient, isNetworkError } from './apiClient';

const adapter = createOfflineStorageAdapter();
const WORKSPACE_CACHE_KEY_PREFIX = 'workspace_v1_';
const USER_CACHE_KEY = 'last_authenticated_user_v1';

const listeners = new Set<() => void>();
let activeFlushPromise: Promise<{ synced: number; conflicts: number; errors: number }> | null = null;

function notifySubscribers(): void {
  for (const fn of listeners) {
    fn();
  }
}

export function subscribeOfflineSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOfflineDriverName() {
  return adapter.driverName;
}

export async function cacheUserProfile(user: AgentDTO): Promise<void> {
  await adapter.setCache(USER_CACHE_KEY, user);
}

export async function loadCachedUserProfile(): Promise<AgentDTO | null> {
  return adapter.getCache<AgentDTO>(USER_CACHE_KEY);
}

export async function clearCachedUserProfile(): Promise<void> {
  await adapter.removeCache(USER_CACHE_KEY);
}

export async function cacheWorkspaceSnapshot(
  userId: string,
  data: {
    agents: AgentDTO[];
    tasks: TaskDTO[];
    reports: ReportDTO[];
    history: HistoryEntry[];
    parameters: DistrictParam[];
    notifications?: NotificationDTO[];
    serverTimeIso?: string;
  }
): Promise<void> {
  const snapshot: CachedWorkspaceSnapshot = {
    user_id: userId,
    cached_at: new Date().toISOString(),
    last_server_sync_iso: data.serverTimeIso || new Date().toISOString(),
    agents: data.agents,
    tasks: data.tasks,
    reports: data.reports,
    history: data.history,
    parameters: data.parameters,
    notifications: data.notifications,
  };
  await adapter.setCache(`${WORKSPACE_CACHE_KEY_PREFIX}${userId}`, snapshot);
  notifySubscribers();
}

export async function loadCachedWorkspaceSnapshot(
  userId: string
): Promise<CachedWorkspaceSnapshot | null> {
  return adapter.getCache<CachedWorkspaceSnapshot>(`${WORKSPACE_CACHE_KEY_PREFIX}${userId}`);
}

export async function listQueueOperations(userId?: string): Promise<OfflineQueueOperation[]> {
  return adapter.listQueue(userId);
}

export async function getOfflinePhotoById(
  localPhotoId: string
): Promise<IOfflinePhotoBlob | null> {
  return adapter.getOfflinePhoto(localPhotoId);
}

export async function listOfflinePhotosForTask(taskId: string): Promise<PhotoRecord[]> {
  const blobs = await adapter.listOfflinePhotosByTask(taskId);
  return blobs.map((b) => ({
    photo_id: b.local_photo_id,
    task_id: b.task_id,
    report_id: '',
    agent_id: '',
    type_photo: b.type_photo,
    file_name: b.file_name,
    mime_type: b.mime_type,
    size_bytes: Math.round((b.data_base64.length * 3) / 4),
    drive_file_id: '',
    drive_url: '',
    local_file: b.local_photo_id,
    synced_to_drive: false,
    date_creation: b.created_at,
  }));
}

function generateOperationUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function enqueueOfflineStatusTransition(params: {
  user: AgentDTO;
  task: TaskDTO;
  statut_agent: AgentAssignmentStatus;
  motif: string;
}): Promise<OfflineQueueOperation> {
  const now = new Date().toISOString();
  const op: OfflineQueueOperation = {
    operation_id: generateOperationUuid(),
    user_id: params.user.agent_id,
    type_operation: 'TASK_AGENT_STATUS',
    target_id: params.task.task_id,
    label: `${params.task.numero_tache} · Statut → ${params.statut_agent}`,
    client_timestamp: now,
    base_version: params.task.version,
    payload: {
      statut_agent: params.statut_agent,
      motif: params.motif,
    },
    statut: 'EN ATTENTE',
  };
  await adapter.putQueueItem(op);

  // Mise à jour optimiste du cache local pour affichage terrain immédiat
  const snap = await loadCachedWorkspaceSnapshot(params.user.agent_id);
  if (snap) {
    snap.tasks = snap.tasks.map((t) => {
      if (t.task_id !== params.task.task_id) return t;
      const updatedAssignments = t.assignments.map((a) => {
        if (a.agent_id !== params.user.agent_id) return a;
        return {
          ...a,
          statut_agent: params.statut_agent,
          motif_blocage_attente:
            params.statut_agent === 'EN ATTENTE' || params.statut_agent === 'BLOQUÉE'
              ? params.motif
              : '',
          date_acceptation: a.date_acceptation || now,
          date_debut:
            params.statut_agent === 'EN COURS' || params.statut_agent === 'TERMINÉE'
              ? a.date_debut || now
              : a.date_debut,
          date_fin: params.statut_agent === 'TERMINÉE' ? now : a.date_fin,
        };
      });
      return {
        ...t,
        assignments: updatedAssignments,
        statut_global: computeGlobalStatusFromAssignmentsClient(
          t.statut_global,
          updatedAssignments
        ),
        updated_at: now,
      };
    });
    await adapter.setCache(`${WORKSPACE_CACHE_KEY_PREFIX}${params.user.agent_id}`, snap);
  }

  notifySubscribers();
  return op;
}

export async function enqueueOfflinePhotoUpload(params: {
  user: AgentDTO;
  task: TaskDTO;
  type_photo: PhotoType;
  file_name: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  data_base64: string;
}): Promise<{ op: OfflineQueueOperation; photo: PhotoRecord }> {
  const now = new Date().toISOString();
  const localPhotoId = `local-${generateOperationUuid()}`;

  await adapter.saveOfflinePhoto({
    local_photo_id: localPhotoId,
    task_id: params.task.task_id,
    type_photo: params.type_photo,
    file_name: params.file_name,
    mime_type: params.mime_type,
    data_base64: params.data_base64,
    created_at: now,
  });

  const op: OfflineQueueOperation = {
    operation_id: generateOperationUuid(),
    user_id: params.user.agent_id,
    type_operation: 'PHOTO_UPLOAD',
    target_id: params.task.task_id,
    label: `${params.task.numero_tache} · Photo ${params.type_photo}`,
    client_timestamp: now,
    local_photo_id: localPhotoId,
    payload: {
      type_photo: params.type_photo,
      file_name: params.file_name,
      mime_type: params.mime_type,
      data_base64: params.data_base64,
    },
    statut: 'EN ATTENTE',
  };
  await adapter.putQueueItem(op);

  const photo: PhotoRecord = {
    photo_id: localPhotoId,
    task_id: params.task.task_id,
    report_id: '',
    agent_id: params.user.agent_id,
    type_photo: params.type_photo,
    file_name: params.file_name,
    mime_type: params.mime_type,
    size_bytes: Math.round((params.data_base64.length * 3) / 4),
    drive_file_id: '',
    drive_url: '',
    local_file: localPhotoId,
    synced_to_drive: false,
    date_creation: now,
  };

  notifySubscribers();
  return { op, photo };
}

export async function enqueueOfflineReportSubmit(params: {
  user: AgentDTO;
  task: TaskDTO;
  nextVersion: number;
  payload: {
    travail_effectue: string;
    resultat: string;
    difficultes: string;
    materiel: string;
    travaux_restants: string;
    recommandations: string;
    temps_passe_minutes: number;
    photo_ids: string[];
  };
}): Promise<{ op: OfflineQueueOperation; optimisticReport: ReportDTO }> {
  const now = new Date().toISOString();
  const op: OfflineQueueOperation = {
    operation_id: generateOperationUuid(),
    user_id: params.user.agent_id,
    type_operation: 'REPORT_SUBMIT',
    target_id: params.task.task_id,
    label: `${params.task.numero_tache} · Compte-rendu v${params.nextVersion}`,
    client_timestamp: now,
    base_version: params.task.version,
    payload: params.payload,
    statut: 'EN ATTENTE',
  };
  await adapter.putQueueItem(op);

  const optimisticReport: ReportDTO = {
    report_id: `local-${op.operation_id}`,
    task_id: params.task.task_id,
    agent_id: params.user.agent_id,
    version: params.nextVersion,
    travail_effectue: params.payload.travail_effectue,
    resultat: params.payload.resultat,
    difficultes: params.payload.difficultes,
    materiel: params.payload.materiel,
    travaux_restants: params.payload.travaux_restants,
    recommandations: params.payload.recommandations,
    temps_passe_minutes: params.payload.temps_passe_minutes,
    date_soumission: now,
    validation: 'EN_ATTENTE',
    commentaire_chef: '',
    date_validation: '',
    validateur_id: '',
    agent_matricule: params.user.matricule,
    agent_nom: params.user.nom,
    agent_prenom: params.user.prenom,
    validateur_nom: '',
    photos: [],
  };

  // Mise à jour optimiste du cache local
  const snap = await loadCachedWorkspaceSnapshot(params.user.agent_id);
  if (snap) {
    snap.reports = [optimisticReport, ...snap.reports];
    snap.tasks = snap.tasks.map((t) =>
      t.task_id === params.task.task_id
        ? { ...t, statut_global: 'À VALIDER', updated_at: now }
        : t
    );
    await adapter.setCache(`${WORKSPACE_CACHE_KEY_PREFIX}${params.user.agent_id}`, snap);
  }

  notifySubscribers();
  return { op, optimisticReport };
}

export async function enqueueOfflineTaskUpdate(params: {
  user: AgentDTO;
  task: TaskDTO;
  payload: Record<string, unknown>;
}): Promise<OfflineQueueOperation> {
  const now = new Date().toISOString();
  const op: OfflineQueueOperation = {
    operation_id: generateOperationUuid(),
    user_id: params.user.agent_id,
    type_operation: 'TASK_UPDATE',
    target_id: params.task.task_id,
    label: `${params.task.numero_tache} · Modification fiche tâche`,
    client_timestamp: now,
    base_version: params.task.version,
    payload: {
      ...params.payload,
      expected_version: params.task.version,
    },
    statut: 'EN ATTENTE',
  };
  await adapter.putQueueItem(op);
  notifySubscribers();
  return op;
}

export async function flushOfflineQueue(
  userId: string
): Promise<{ synced: number; conflicts: number; errors: number }> {
  if (activeFlushPromise) return activeFlushPromise;

  activeFlushPromise = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: 0, conflicts: 0, errors: 0 };
    }

    const queue = await adapter.listQueue(userId);
    const pending = queue.filter((q) => q.statut === 'EN ATTENTE');
    if (pending.length === 0) {
      return { synced: 0, conflicts: 0, errors: 0 };
    }

    // Marquer EN COURS dans le stockage local
    for (const item of pending) {
      await adapter.putQueueItem({ ...item, statut: 'EN COURS' });
    }
    notifySubscribers();

    try {
      const deviceId = getOrCreateDeviceId();
      const res = await apiClient.syncPush(
        deviceId,
        pending.map((item) => ({
          operation_id: item.operation_id,
          type_operation: item.type_operation,
          target_id: item.target_id,
          client_timestamp: item.client_timestamp,
          base_version: item.base_version,
          local_photo_id: item.local_photo_id,
          payload: item.payload,
        }))
      );

      let synced = 0;
      let conflicts = 0;
      let errors = 0;

      for (const r of res.results) {
        const orig = pending.find((p) => p.operation_id === r.operation_id);
        if (!orig) continue;

        if (r.statut === 'SYNCHRONISÉ') {
          synced += 1;
          await adapter.putQueueItem({
            ...orig,
            statut: 'SYNCHRONISÉ',
            message_erreur: r.message,
            synced_at: res.server_time_iso,
            server_version: r.server_version,
            server_status: r.server_status,
          });
          if (orig.local_photo_id) {
            await adapter.deleteOfflinePhoto(orig.local_photo_id);
          }
        } else if (r.statut === 'CONFLIT') {
          conflicts += 1;
          await adapter.putQueueItem({
            ...orig,
            statut: 'CONFLIT',
            message_erreur: r.message,
            server_version: r.server_version,
            server_status: r.server_status,
          });
        } else {
          errors += 1;
          await adapter.putQueueItem({
            ...orig,
            statut: 'ERREUR',
            message_erreur: r.message,
            server_version: r.server_version,
            server_status: r.server_status,
          });
        }
      }

      notifySubscribers();
      return { synced, conflicts, errors };
    } catch (err) {
      // Sur erreur réseau, replacer en EN ATTENTE sans jamais supprimer
      const msg = isNetworkError(err)
        ? 'Connexion interrompue pendant la synchronisation.'
        : err instanceof Error
          ? err.message
          : 'Erreur réseau.';
      for (const item of pending) {
        await adapter.putQueueItem({
          ...item,
          statut: isNetworkError(err) ? 'EN ATTENTE' : 'ERREUR',
          message_erreur: msg,
        });
      }
      notifySubscribers();
      return { synced: 0, conflicts: 0, errors: isNetworkError(err) ? 0 : pending.length };
    }
  })();

  try {
    return await activeFlushPromise;
  } finally {
    activeFlushPromise = null;
  }
}

export async function retryQueueOperation(userId: string, operationId: string) {
  const queue = await adapter.listQueue(userId);
  const target = queue.find((q) => q.operation_id === operationId);
  if (!target) return;
  await adapter.putQueueItem({
    ...target,
    statut: 'EN ATTENTE',
    message_erreur: '',
  });
  notifySubscribers();
  return flushOfflineQueue(userId);
}

export async function retryConflictWithLatestVersion(
  userId: string,
  operationId: string,
  latestServerVersion: number
) {
  const queue = await adapter.listQueue(userId);
  const target = queue.find((q) => q.operation_id === operationId);
  if (!target) return;
  await adapter.putQueueItem({
    ...target,
    base_version: latestServerVersion,
    payload: {
      ...target.payload,
      expected_version: latestServerVersion,
    },
    statut: 'EN ATTENTE',
    message_erreur: '',
  });
  notifySubscribers();
  return flushOfflineQueue(userId);
}

export async function discardQueueOperation(operationId: string, localPhotoId?: string) {
  await adapter.deleteQueueItem(operationId);
  if (localPhotoId) {
    await adapter.deleteOfflinePhoto(localPhotoId);
  }
  notifySubscribers();
}

export async function clearSyncedQueueHistory(userId: string) {
  const queue = await adapter.listQueue(userId);
  for (const item of queue) {
    if (item.statut === 'SYNCHRONISÉ') {
      await adapter.deleteQueueItem(item.operation_id);
    }
  }
  notifySubscribers();
}

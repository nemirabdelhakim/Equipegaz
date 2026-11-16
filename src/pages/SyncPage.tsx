import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudOff,
  Database,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import type {
  OfflineQueueOperation,
  ServerSyncOperation,
  SyncOperationStatus,
} from '../models/types';
import { apiClient, isNetworkError } from '../services/apiClient';
import {
  clearSyncedQueueHistory,
  discardQueueOperation,
  flushOfflineQueue,
  getOfflineDriverName,
  listQueueOperations,
  loadCachedWorkspaceSnapshot,
  retryConflictWithLatestVersion,
  retryQueueOperation,
  subscribeOfflineSync,
} from '../services/offlineSyncService';
import { useAuth } from '../stores/AuthContext';
import { formatDateTimeFr } from '../utils/formatters';

interface SyncPageProps {
  onWorkspaceRefresh: () => Promise<void>;
}

function renderStatusLabel(status: SyncOperationStatus) {
  switch (status) {
    case 'SYNCHRONISÉ':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>SYNCHRONISÉ</span>
        </span>
      );
    case 'EN COURS':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0055A4] dark:text-blue-400">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>EN COURS</span>
        </span>
      );
    case 'CONFLIT':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>CONFLIT</span>
        </span>
      );
    case 'ERREUR':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
          <XCircle className="h-3.5 w-3.5" />
          <span>ERREUR</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Clock className="h-3.5 w-3.5" />
          <span>EN ATTENTE</span>
        </span>
      );
  }
}

export const SyncPage: React.FC<SyncPageProps> = ({ onWorkspaceRefresh }) => {
  const { user, isOnline } = useAuth();
  const [queue, setQueue] = useState<OfflineQueueOperation[]>([]);
  const [serverOps, setServerOps] = useState<ServerSyncOperation[]>([]);
  const [cacheInfo, setCacheInfo] = useState<{
    cachedAt: string;
    tasksCount: number;
    reportsCount: number;
    agentsCount: number;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadLocalAndServerState = async () => {
    if (!user) return;
    const [q, snap] = await Promise.all([
      listQueueOperations(user.agent_id),
      loadCachedWorkspaceSnapshot(user.agent_id),
    ]);
    setQueue(q);
    if (snap) {
      setCacheInfo({
        cachedAt: snap.cached_at,
        tasksCount: snap.tasks.length,
        reportsCount: snap.reports.length,
        agentsCount: snap.agents.length,
      });
    }

    if (isOnline) {
      try {
        const res = await apiClient.getSyncStatus();
        setServerOps(res.operations);
      } catch (err) {
        if (!isNetworkError(err)) {
          setServerOps([]);
        }
      }
    }
  };

  useEffect(() => {
    void loadLocalAndServerState();
    const unsub = subscribeOfflineSync(() => {
      void loadLocalAndServerState();
    });
    return unsub;
  }, [user, isOnline]);

  if (!user) return null;

  const pendingCount = queue.filter((q) => q.statut === 'EN ATTENTE' || q.statut === 'EN COURS').length;
  const conflictCount = queue.filter((q) => q.statut === 'CONFLIT').length;
  const errorCount = queue.filter((q) => q.statut === 'ERREUR').length;
  const syncedCount = queue.filter((q) => q.statut === 'SYNCHRONISÉ').length;

  const handleManualSync = async () => {
    if (!isOnline) {
      setErrorMsg('Connexion Internet requise pour déclencher la synchronisation.');
      return;
    }
    setSyncing(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await flushOfflineQueue(user.agent_id);
      await onWorkspaceRefresh();
      await loadLocalAndServerState();
      setFeedback(
        `Synchronisation terminée : ${res.synced} réussie(s), ${res.conflicts} conflit(s), ${res.errors} erreur(s).`
      );
    } catch {
      setErrorMsg('Impossible de joindre le serveur pour la synchronisation.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Synchronisation &amp; Mode hors connexion
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Stockage local sécurisé ({getOfflineDriverName()}) · File d&apos;attente UUID avec reprise
            automatique et détection de conflits.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing || !isOnline}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Résumé état réseau et cache */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Réseau</span>
            {isOnline ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <CloudOff className="h-4 w-4 text-amber-600" />
            )}
          </div>
          <p
            className={`mt-1 text-base font-bold ${
              isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {isOnline ? 'En ligne' : 'Hors connexion'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Cache :{' '}
            {cacheInfo ? formatDateTimeFr(cacheInfo.cachedAt) : 'En attente de chargement'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>En attente locale</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {pendingCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">Conservées en IndexedDB</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Conflits / Erreurs</span>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
            {conflictCount + errorCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {conflictCount} conflit(s) · {errorCount} erreur(s)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Cache local prêt</span>
            <Database className="h-4 w-4 text-[#0055A4]" />
          </div>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {cacheInfo ? cacheInfo.tasksCount : 0}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            tâche(s) · {cacheInfo?.reportsCount ?? 0} CR · {cacheInfo?.agentsCount ?? 0} agent(s)
          </p>
        </div>
      </section>

      {/* File d'attente locale */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            File d&apos;attente locale des opérations ({queue.length})
          </h3>
          {syncedCount > 0 && (
            <button
              type="button"
              onClick={() => clearSyncedQueueHistory(user.agent_id)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Nettoyer les opérations synchronisées</span>
            </button>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            Aucune opération hors connexion en attente. Toutes vos données locales sont à jour.
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => (
              <div
                key={item.operation_id}
                className="rounded-lg border border-slate-200 p-4 text-xs dark:border-slate-800 space-y-2"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-500">
                        UUID {item.operation_id.slice(0, 8)}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatDateTimeFr(item.client_timestamp)}
                      </span>
                      <span className="font-semibold text-[#0055A4] dark:text-blue-400">
                        {item.type_operation}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      {item.label}
                    </p>
                  </div>

                  <div className="shrink-0">{renderStatusLabel(item.statut)}</div>
                </div>

                {item.message_erreur && (
                  <div
                    className={`rounded-lg px-3 py-2 ${
                      item.statut === 'SYNCHRONISÉ'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                    }`}
                  >
                    {item.message_erreur}
                    {item.statut === 'CONFLIT' && item.server_version !== undefined && (
                      <span className="ml-2 font-mono font-semibold">
                        (Serveur : v{item.server_version} · {item.server_status})
                      </span>
                    )}
                  </div>
                )}

                {(item.statut === 'ERREUR' || item.statut === 'CONFLIT') && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {item.statut === 'ERREUR' && (
                      <button
                        type="button"
                        disabled={!isOnline}
                        onClick={async () => {
                          await retryQueueOperation(user.agent_id, item.operation_id);
                          await onWorkspaceRefresh();
                        }}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3 py-1.5 font-medium text-white hover:bg-[#004485] disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Réessayer</span>
                      </button>
                    )}

                    {item.statut === 'CONFLIT' &&
                      item.type_operation === 'TASK_UPDATE' &&
                      item.server_version !== undefined && (
                        <button
                          type="button"
                          disabled={!isOnline}
                          onClick={async () => {
                            await retryConflictWithLatestVersion(
                              user.agent_id,
                              item.operation_id,
                              item.server_version!
                            );
                            await onWorkspaceRefresh();
                          }}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3 py-1.5 font-medium text-white hover:bg-[#004485] disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Réappliquer sur v{item.server_version}</span>
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={async () => {
                        await discardQueueOperation(item.operation_id, item.local_photo_id);
                        await onWorkspaceRefresh();
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Conserver la version serveur (supprimer local)</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Journal serveur SYNCHRONISATION */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Journal central de synchronisation ({serverOps.length})
        </h3>
        {serverOps.length === 0 ? (
          <p className="text-xs text-slate-500">
            {isOnline
              ? 'Aucune opération de synchronisation hors-ligne enregistrée sur le serveur.'
              : 'Journal serveur consultable dès le retour de la connexion Internet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-3 py-2">Date serveur</th>
                  <th className="px-3 py-2">Opération UUID</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {serverOps.slice(0, 30).map((op) => (
                  <tr key={op.operation_id}>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                      {formatDateTimeFr(op.date_operation)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                      {op.operation_id.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 font-medium">{op.type_operation}</td>
                    <td className="px-3 py-2">{renderStatusLabel(op.statut)}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {op.message_erreur || 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

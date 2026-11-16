import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Table2,
  Unlink,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  authorizeGoogleWorkspacePopup,
  clearInMemoryWorkspaceToken,
} from '../lib/firebase';
import type {
  BackupFileInfo,
  SheetPreviewDTO,
  StorageStatusDTO,
} from '../models/types';
import { apiClient } from '../services/apiClient';
import { formatDateTimeFr } from '../utils/formatters';

interface StoragePageProps {
  onDataRestored: () => Promise<void>;
}

export const StoragePage: React.FC<StoragePageProps> = ({ onDataRestored }) => {
  const [status, setStatus] = useState<StorageStatusDTO | null>(null);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [customSheetId, setCustomSheetId] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Aperçu en direct d'un onglet Google Sheets
  const [selectedSheet, setSelectedSheet] = useState('AGENTS');
  const [sheetPreview, setSheetPreview] = useState<SheetPreviewDTO | null>(null);

  // Dialogues de confirmation obligatoires (règle Workspace API)
  const [confirmProvisionOpen, setConfirmProvisionOpen] = useState(false);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  const [confirmRestoreFilename, setConfirmRestoreFilename] = useState<string | null>(null);

  const loadStorageInfo = useCallback(async () => {
    setLoading(true);
    try {
      const [st, bks] = await Promise.all([
        apiClient.getStorageStatus(),
        apiClient.listBackups(),
      ]);
      setStatus(st);
      setBackups(bks.backups);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de lecture du stockage central.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorageInfo();
  }, [loadStorageInfo]);

  const handleConnectGoogle = async () => {
    setFeedback(null);
    setBusyAction('connect');
    try {
      const { accessToken } = await authorizeGoogleWorkspacePopup();
      const res = await apiClient.connectGoogleWorkspace(accessToken);
      setFeedback({
        type: 'success',
        text: `Compte Google Workspace connecté (${res.email}). Vous pouvez initialiser ou synchroniser le classeur.`,
      });
      await loadStorageInfo();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Autorisation Google annulée ou échouée.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnectGoogle = async () => {
    setBusyAction('disconnect');
    try {
      clearInMemoryWorkspaceToken();
      await apiClient.disconnectGoogleWorkspace();
      setFeedback({
        type: 'success',
        text: 'Session Google Workspace déconnectée côté serveur.',
      });
      await loadStorageInfo();
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmProvision = async () => {
    setConfirmProvisionOpen(false);
    setFeedback(null);
    setBusyAction('provision');
    try {
      const res = await apiClient.provisionSheetsWorkbook(customSheetId.trim() || undefined);
      setFeedback({
        type: 'success',
        text: `Classeur GESTION_EQUIPE_GAZ_SIDI_ALI prêt (${res.metadata.spreadsheetId}) et 11 feuilles initialisées.`,
      });
      await loadStorageInfo();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec du provisionnement Google Sheets.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmSync = async () => {
    setConfirmSyncOpen(false);
    setFeedback(null);
    setBusyAction('sync');
    try {
      await apiClient.syncSheetsNow();
      setFeedback({
        type: 'success',
        text: 'Synchronisation centrale vers Google Sheets terminée avec succès.',
      });
      await loadStorageInfo();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec de la synchronisation.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePreviewSheet = async (sheetName: string) => {
    setSelectedSheet(sheetName);
    setFeedback(null);
    setBusyAction(`preview-${sheetName}`);
    try {
      const data = await apiClient.previewSheet(sheetName);
      setSheetPreview(data);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : `Impossible de lire la feuille ${sheetName}.`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateBackup = async (uploadToDrive: boolean) => {
    setFeedback(null);
    setBusyAction('backup');
    try {
      const res = await apiClient.createBackup(uploadToDrive);
      setFeedback({
        type: 'success',
        text: res.driveFileUrl
          ? `Sauvegarde créée (${res.backup.filename}) et archivée sur Google Drive.`
          : `Sauvegarde locale créée (${res.backup.filename}).`,
      });
      await loadStorageInfo();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec de la sauvegarde.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!confirmRestoreFilename) return;
    const target = confirmRestoreFilename;
    setConfirmRestoreFilename(null);
    setFeedback(null);
    setBusyAction('restore');
    try {
      await apiClient.restoreBackup(target);
      setFeedback({
        type: 'success',
        text: `Base centrale restaurée depuis ${target}.`,
      });
      await onDataRestored();
      await loadStorageInfo();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec de la restauration.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Base centrale Google Sheets & Sauvegardes
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Toutes les écritures passent exclusivement par le Backend sécurisé vers le classeur{' '}
            <span className="font-mono font-medium">GESTION_EQUIPE_GAZ_SIDI_ALI</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!status?.googleConnected ? (
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={busyAction !== null}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              <Database className="h-4 w-4 text-[#0055A4]" />
              <span>
                {busyAction === 'connect'
                  ? 'Autorisation...'
                  : 'Connecter Google Sheets & Drive'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisconnectGoogle}
              disabled={busyAction !== null || status.authMode === 'SERVICE_ACCOUNT'}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Unlink className="h-4 w-4" />
              <span>Déconnecter Google</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* État du stockage central */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              État de liaison Google Sheets & Drive
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                status?.googleConnected
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {status?.googleConnected ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              <span>
                {loading
                  ? 'Chargement...'
                  : status?.googleConnected
                    ? `Connecté (${status.authMode === 'SERVICE_ACCOUNT' ? 'Compte de service' : 'OAuth Chef'})`
                    : 'Miroir local actif (Google non connecté)'}
              </span>
            </span>
          </div>

          <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
            <div className="flex flex-col justify-between gap-1 sm:flex-row">
              <dt className="text-slate-500 dark:text-slate-400">Classeur Google Sheets :</dt>
              <dd className="font-mono text-xs text-slate-900 dark:text-white">
                {status?.metadata.spreadsheetId || 'Non encore provisionné'}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 sm:flex-row">
              <dt className="text-slate-500 dark:text-slate-400">Dossier Google Drive :</dt>
              <dd className="font-mono text-xs text-slate-900 dark:text-white">
                {status?.metadata.driveFolderId || 'Non encore créé'}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 sm:flex-row">
              <dt className="text-slate-500 dark:text-slate-400">Dernière synchronisation :</dt>
              <dd className="font-mono text-xs tabular-nums text-slate-900 dark:text-white">
                {status?.metadata.lastSyncedAt
                  ? formatDateTimeFr(status.metadata.lastSyncedAt)
                  : 'Jamais synchronisé'}
              </dd>
            </div>
            <div className="flex flex-col justify-between gap-1 sm:flex-row">
              <dt className="text-slate-500 dark:text-slate-400">Mutations en attente :</dt>
              <dd className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                {status?.metadata.pendingMutations ?? 0}
              </dd>
            </div>
          </dl>

          {status?.metadata.spreadsheetUrl && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <a
                href={status.metadata.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#0055A4] hover:bg-slate-50 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-slate-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Ouvrir le classeur dans Google Sheets</span>
              </a>
            </div>
          )}
        </div>

        {/* Actions Provisioning & Sync */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Initialisation & Synchronisation
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Crée automatiquement le classeur à 11 feuilles ou force la réplication des données
            centrales (mots de passe exclus).
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                ID classeur existant (optionnel)
              </label>
              <input
                type="text"
                value={customSheetId}
                onChange={(e) => setCustomSheetId(e.target.value)}
                placeholder="Laisser vide pour créer automatiquement"
                className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={() => setConfirmProvisionOpen(true)}
              disabled={!status?.googleConnected || busyAction !== null}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-50"
            >
              <FolderOpen className="h-4 w-4" />
              <span>
                {busyAction === 'provision'
                  ? 'Initialisation en cours...'
                  : 'Créer / Vérifier les 11 feuilles'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmSyncOpen(true)}
              disabled={
                !status?.googleConnected ||
                !status?.metadata.spreadsheetId ||
                busyAction !== null
              }
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <RefreshCw
                className={`h-4 w-4 ${busyAction === 'sync' ? 'animate-spin' : ''}`}
              />
              <span>Synchroniser maintenant vers Sheets</span>
            </button>
          </div>
        </div>
      </section>

      {/* Architecture des 11 feuilles & Inspection en direct */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Structure des 11 feuilles du classeur ({status?.sheetCount || 11})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clés permanentes UUID — aucun numéro de ligne ni nom d&apos;agent utilisé comme clé
              étrangère.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(status?.sheets || []).map((sheet) => (
            <button
              key={sheet.name}
              type="button"
              disabled={!status?.googleConnected || !status?.metadata.spreadsheetId || busyAction !== null}
              onClick={() => handlePreviewSheet(sheet.name)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs transition-colors disabled:opacity-60 ${
                selectedSheet === sheet.name && sheetPreview?.sheetName === sheet.name
                  ? 'border-[#0055A4] bg-blue-50/70 text-[#0055A4] dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-mono font-semibold">{sheet.name}</p>
                <p className="text-[11px] text-slate-500">{sheet.columns} colonnes</p>
              </div>
              <Eye className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>

        {sheetPreview && (
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <span className="inline-flex items-center gap-2 font-mono font-semibold text-slate-800 dark:text-white">
                <Table2 className="h-4 w-4 text-[#0055A4]" />
                Lecture directe Google Sheets · {sheetPreview.sheetName} ({sheetPreview.rows.length}{' '}
                lignes)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    {sheetPreview.headers.map((h) => (
                      <th key={h} className="px-3 py-2 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sheetPreview.rows.slice(0, 20).map((row, rIdx) => (
                    <tr key={rIdx}>
                      {sheetPreview.headers.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          className="max-w-[220px] truncate px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300"
                        >
                          {row[cIdx] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sheetPreview.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(sheetPreview.headers.length, 1)}
                        className="px-3 py-4 text-center text-slate-500"
                      >
                        Feuille initialisée (0 ligne de données pour le moment).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Sauvegardes & Restauration */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Sauvegardes & Restauration
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Archivage complet des données centrales sur le serveur et dans Google Drive.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleCreateBackup(false)}
              disabled={busyAction !== null}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Sauvegarde locale</span>
            </button>
            <button
              type="button"
              onClick={() => handleCreateBackup(true)}
              disabled={!status?.googleConnected || busyAction !== null}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#0055A4] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004485] disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Sauvegarde locale + Drive</span>
            </button>
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {backups.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              Aucune archive générée pour le moment.
            </p>
          ) : (
            backups.map((b) => (
              <div
                key={b.filename}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                    {b.filename}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {b.createdAtFr} · {(b.sizeBytes / 1024).toFixed(1)} Ko
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmRestoreFilename(b.filename)}
                  disabled={busyAction !== null}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 dark:hover:bg-amber-950/30"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restaurer</span>
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <ConfirmModal
        open={confirmProvisionOpen}
        title="Initialiser le classeur Google Sheets"
        description="Cette opération va créer (ou mettre à jour) le classeur GESTION_EQUIPE_GAZ_SIDI_ALI avec ses 11 feuilles officielles, le dossier Google Drive associé, et y écrire les données actuelles."
        confirmLabel="Initialiser et synchroniser"
        onConfirm={handleConfirmProvision}
        onCancel={() => setConfirmProvisionOpen(false)}
      />

      <ConfirmModal
        open={confirmSyncOpen}
        title="Synchroniser vers Google Sheets"
        description="Les tables AGENTS, HISTORIQUE, PARAMETRES et SESSIONS_ET_APPAREILS du classeur Google Sheets vont être actualisées avec l'état central du serveur."
        confirmLabel="Lancer la synchronisation"
        onConfirm={handleConfirmSync}
        onCancel={() => setConfirmSyncOpen(false)}
      />

      <ConfirmModal
        open={!!confirmRestoreFilename}
        title="Restaurer une sauvegarde"
        description={`Attention : l'état central actuel sera remplacé par le contenu de l'archive ${confirmRestoreFilename}. Pensez à créer une sauvegarde préalable si nécessaire.`}
        confirmLabel="Restaurer cette archive"
        tone="danger"
        onConfirm={handleConfirmRestore}
        onCancel={() => setConfirmRestoreFilename(null)}
      />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle2, PauseCircle, X } from 'lucide-react';
import type { AgentAssignmentStatus, TaskDTO } from '../models/types';

interface ExecutionActionModalProps {
  open: boolean;
  task: TaskDTO | null;
  targetStatus: AgentAssignmentStatus | null;
  loading?: boolean;
  errorMessage?: string;
  onConfirm: (motif: string) => void;
  onCancel: () => void;
}

const PRESET_REASONS: Record<'EN ATTENTE' | 'BLOQUÉE', string[]> = {
  'EN ATTENTE': [
    'Abonné absent / accès coffret fermé',
    'En attente pièce de rechange ou matériel spécifique',
    'Attente autorisation de voirie / coupure programmée',
    'Report demandé sur consignes exploitation',
  ],
  BLOQUÉE: [
    'Pression anormale / danger sécurité réseau gaz',
    'Canalisation inaccessible (travaux tiers / obstacle)',
    'Outillage lourd ou équipe complémentaire requise',
    'Adresse introuvable / repère erroné sur site',
  ],
};

export const ExecutionActionModal: React.FC<ExecutionActionModalProps> = ({
  open,
  task,
  targetStatus,
  loading = false,
  errorMessage = '',
  onConfirm,
  onCancel,
}) => {
  const [motif, setMotif] = useState('');

  useEffect(() => {
    if (open) {
      setMotif('');
    }
  }, [open, task?.task_id, targetStatus]);

  if (!open || !task || !targetStatus) return null;

  const isReasonRequired = targetStatus === 'EN ATTENTE' || targetStatus === 'BLOQUÉE';
  const presets =
    targetStatus === 'EN ATTENTE' || targetStatus === 'BLOQUÉE'
      ? PRESET_REASONS[targetStatus]
      : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReasonRequired && motif.trim().length < 3) return;
    onConfirm(motif.trim());
  };

  const title =
    targetStatus === 'BLOQUÉE'
      ? 'Signaler un blocage terrain'
      : targetStatus === 'EN ATTENTE'
        ? 'Mettre la mission en attente'
        : targetStatus === 'TERMINÉE'
          ? "Confirmer la fin d'intervention"
          : `Passer au statut ${targetStatus}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                targetStatus === 'BLOQUÉE'
                  ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                  : targetStatus === 'EN ATTENTE'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
              }`}
            >
              {targetStatus === 'BLOQUÉE' ? (
                <AlertOctagon className="h-5 w-5" />
              ) : targetStatus === 'EN ATTENTE' ? (
                <PauseCircle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="font-mono text-xs text-[#0055A4] dark:text-blue-400">
                {task.numero_tache}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {isReasonRequired
              ? `Un motif détaillé est obligatoire pour informer immédiatement le Chef d'équipe du passage en ${targetStatus}.`
              : `Votre intervention sur "${task.titre}" sera marquée comme TERMINÉE et horodatée côté serveur.`}
          </p>

          {presets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Motifs fréquents :
              </p>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMotif(preset)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs text-slate-700 transition-colors hover:border-[#0055A4] hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {isReasonRequired
                ? 'Motif obligatoire (min. 3 caractères) *'
                : 'Note de fin d’intervention (optionnelle)'}
            </label>
            <textarea
              rows={3}
              required={isReasonRequired}
              minLength={isReasonRequired ? 3 : undefined}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={
                isReasonRequired
                  ? 'Précisez le motif terrain rencontré...'
                  : 'Observation rapide avant rédaction du compte-rendu...'
              }
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || (isReasonRequired && motif.trim().length < 3)}
              className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                targetStatus === 'BLOQUÉE'
                  ? 'bg-red-600 hover:bg-red-700'
                  : targetStatus === 'EN ATTENTE'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {loading ? 'Envoi...' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

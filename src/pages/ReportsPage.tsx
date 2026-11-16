import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  History,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { AuthPhoto } from '../components/AuthPhoto';
import { ReportModal } from '../components/ReportModal';
import { PriorityLabel, TaskStatusLabel } from '../components/StatusIndicator';
import type { ReportDTO, ReportValidationStatus, TaskDTO } from '../models/types';
import { ApiError, apiClient } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';
import { formatDateTimeFr } from '../utils/formatters';

interface ReportsPageProps {
  reports: ReportDTO[];
  tasks: TaskDTO[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
}

type ReportFilterTab = 'EN_ATTENTE' | 'REFUSÉ' | 'VALIDÉ' | 'ALL';

export const ReportsPage: React.FC<ReportsPageProps> = ({
  reports,
  tasks,
  loading,
  onDataChanged,
}) => {
  const { user } = useAuth();
  const isChef = user?.role === 'CHEF';

  const [tab, setTab] = useState<ReportFilterTab>('EN_ATTENTE');
  const [reviewModal, setReviewModal] = useState<{
    report: ReportDTO;
    decision: 'VALIDÉ' | 'REFUSÉ';
  } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Pour révision d'un CR refusé par un agent affecté
  const [reviseContext, setReviseContext] = useState<{
    task: TaskDTO;
    previousReport: ReportDTO;
  } | null>(null);

  const taskMap = useMemo(() => {
    const m = new Map<string, TaskDTO>();
    for (const t of tasks) m.set(t.task_id, t);
    return m;
  }, [tasks]);

  const counts = useMemo(() => {
    const c = { EN_ATTENTE: 0, REFUSÉ: 0, VALIDÉ: 0 };
    for (const r of reports) {
      c[r.validation] += 1;
    }
    return c;
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (tab === 'ALL') return reports;
    return reports.filter((r) => r.validation === tab);
  }, [reports, tab]);

  // Historique des versions par tâche (pour montrer v1, v2...)
  const versionsByTask = useMemo(() => {
    const map = new Map<string, ReportDTO[]>();
    for (const r of reports) {
      const arr = map.get(r.task_id) || [];
      arr.push(r);
      map.set(r.task_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.version - a.version);
    }
    return map;
  }, [reports]);

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;
    if (reviewModal.decision === 'REFUSÉ' && reviewComment.trim().length < 5) {
      setErrorMsg('Un motif détaillé (minimum 5 caractères) est obligatoire pour refuser.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiClient.reviewReport(
        reviewModal.report.report_id,
        reviewModal.decision,
        reviewComment.trim()
      );
      const t = taskMap.get(res.report.task_id);
      setFeedbackMsg(
        reviewModal.decision === 'VALIDÉ'
          ? `Compte-rendu v${res.report.version} (${t?.numero_tache || ''}) validé.`
          : `Compte-rendu v${res.report.version} (${t?.numero_tache || ''}) refusé et renvoyé pour correction.`
      );
      setReviewModal(null);
      setReviewComment('');
      await onDataChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Erreur lors de la décision.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderValidationBadge = (status: ReportValidationStatus) => {
    if (status === 'VALIDÉ') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Validé</span>
        </span>
      );
    }
    if (status === 'REFUSÉ') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400">
          <XCircle className="h-3.5 w-3.5" />
          <span>Refusé</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        <span>À valider</span>
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Comptes-rendus d&apos;intervention & Validation
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {isChef
            ? 'Contrôlez les comptes-rendus détaillés, photos AVANT/APRÈS et historiques de versions avant clôture définitive.'
            : 'Consultez vos comptes-rendus, photos archivées et éventuelles demandes de correction du Chef.'}
        </p>
      </div>

      {feedbackMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg('')}
            className="rounded p-1 hover:bg-emerald-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            { id: 'EN_ATTENTE', label: `À valider (${counts.EN_ATTENTE})` },
            { id: 'REFUSÉ', label: `Refusés (${counts.REFUSÉ})` },
            { id: 'VALIDÉ', label: `Validés (${counts.VALIDÉ})` },
            { id: 'ALL', label: `Tous (${reports.length})` },
          ] as Array<{ id: ReportFilterTab; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === item.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Chargement des comptes-rendus...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileCheck2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            Aucun compte-rendu dans cet onglet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => {
            const task = taskMap.get(report.task_id);
            const allVersions = versionsByTask.get(report.task_id) || [report];
            const latestVersion = allVersions[0]?.version || report.version;
            const isAssignedAgent = Boolean(
              user && task?.assignments.some((a) => a.agent_id === user.agent_id)
            );
            const canRevise =
              report.validation === 'REFUSÉ' &&
              report.version === latestVersion &&
              task &&
              task.statut_global === 'REFUSÉE' &&
              isAssignedAgent;

            return (
              <article
                key={report.report_id}
                className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-[#0055A4] dark:text-blue-400">
                        {task?.numero_tache || 'Tâche'} · v{report.version}
                      </span>
                      {task && <PriorityLabel priorite={task.priorite} />}
                      {task && <TaskStatusLabel statut={task.statut_global} />}
                      {allVersions.length > 1 && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                          <History className="h-3 w-3" />
                          <span>{allVersions.length} versions conservées</span>
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white">
                      {task?.titre || 'Intervention gaz'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Soumis par{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {report.agent_prenom} {report.agent_nom}
                      </strong>{' '}
                      (<span className="font-mono">{report.agent_matricule}</span>) le{' '}
                      <span className="font-mono">{formatDateTimeFr(report.date_soumission)}</span>
                      {report.temps_passe_minutes > 0 && (
                        <span> · Durée : {report.temps_passe_minutes} min</span>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0">{renderValidationBadge(report.validation)}</div>
                </div>

                {/* Contenu détaillé du compte-rendu */}
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Travail effectué
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                      {report.travail_effectue}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Résultat constaté
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                      {report.resultat}
                    </p>
                  </div>

                  {report.difficultes && (
                    <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Difficultés
                      </p>
                      <p className="mt-1 text-slate-700 dark:text-slate-300">
                        {report.difficultes}
                      </p>
                    </div>
                  )}

                  {report.materiel && (
                    <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Matériel utilisé
                      </p>
                      <p className="mt-1 text-slate-700 dark:text-slate-300">
                        {report.materiel}
                      </p>
                    </div>
                  )}

                  {report.travaux_restants && (
                    <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Travaux restants
                      </p>
                      <p className="mt-1 text-slate-700 dark:text-slate-300">
                        {report.travaux_restants}
                      </p>
                    </div>
                  )}

                  {report.recommandations && (
                    <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Recommandations
                      </p>
                      <p className="mt-1 text-slate-700 dark:text-slate-300">
                        {report.recommandations}
                      </p>
                    </div>
                  )}
                </div>

                {/* Photos rattachées */}
                {report.photos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Justificatifs photos ({report.photos.length})
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {report.photos.map((photo) => (
                        <AuthPhoto key={photo.photo_id} photo={photo} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Commentaire Chef */}
                {report.commentaire_chef && (
                  <div
                    className={`rounded-lg border p-3.5 text-xs ${
                      report.validation === 'REFUSÉ'
                        ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                    }`}
                  >
                    <p className="font-semibold">
                      Décision Chef ({report.validateur_nom || 'Chef'}) ·{' '}
                      <span className="font-mono">
                        {formatDateTimeFr(report.date_validation)}
                      </span>
                    </p>
                    <p className="mt-1">{report.commentaire_chef}</p>
                  </div>
                )}

                {/* Actions Chef / Agent */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {isChef && report.validation === 'EN_ATTENTE' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setReviewComment('');
                          setReviewModal({ report, decision: 'VALIDÉ' });
                        }}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Valider et clôturer</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setReviewComment('');
                          setReviewModal({ report, decision: 'REFUSÉ' });
                        }}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <XCircle className="h-4 w-4" />
                        <span>Refuser pour correction</span>
                      </button>
                    </>
                  )}

                  {canRevise && task && (
                    <button
                      type="button"
                      onClick={() => setReviseContext({ task, previousReport: report })}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-4 py-2 text-xs font-medium text-white hover:bg-[#004485]"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Corriger et soumettre (v{report.version + 1})</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modale Décision Chef */}
      {reviewModal && isChef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {reviewModal.decision === 'VALIDÉ'
                  ? `Valider le compte-rendu v${reviewModal.report.version}`
                  : `Refuser le compte-rendu v${reviewModal.report.version}`}
              </h3>
              <button
                type="button"
                onClick={() => setReviewModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReview} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {reviewModal.decision === 'VALIDÉ'
                  ? 'La tâche passera au statut définitif VALIDÉE et sera archivée avec ce compte-rendu.'
                  : 'La tâche repassera au statut REFUSÉE et l’agent devra soumettre une version corrigée.'}
              </p>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {reviewModal.decision === 'REFUSÉ'
                    ? 'Motif obligatoire du refus (min. 5 caractères) *'
                    : 'Commentaire Chef (optionnel)'}
                </label>
                <textarea
                  rows={3}
                  required={reviewModal.decision === 'REFUSÉ'}
                  minLength={reviewModal.decision === 'REFUSÉ' ? 5 : undefined}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    reviewModal.decision === 'REFUSÉ'
                      ? 'Précisez les compléments attendus (photo APRÈS manquante, mesure pression...)...'
                      : 'Observation de validation...'
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setReviewModal(null)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                    reviewModal.decision === 'VALIDÉ'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {submitting
                    ? 'Enregistrement...'
                    : reviewModal.decision === 'VALIDÉ'
                      ? 'Valider'
                      : 'Confirmer le refus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Correction Agent */}
      <ReportModal
        open={Boolean(reviseContext)}
        task={reviseContext?.task || null}
        previousReport={reviseContext?.previousReport || null}
        onSubmitted={async (rep) => {
          setFeedbackMsg(`Version corrigée v${rep.version} soumise au Chef.`);
          await onDataChanged();
        }}
        onClose={() => setReviseContext(null)}
      />
    </div>
  );
};

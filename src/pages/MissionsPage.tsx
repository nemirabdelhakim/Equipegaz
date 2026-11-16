import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  MapPin,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { ExecutionActionModal } from '../components/ExecutionActionModal';
import { ReportModal } from '../components/ReportModal';
import { PriorityLabel, TaskStatusLabel } from '../components/StatusIndicator';
import type {
  AgentAssignmentStatus,
  DistrictParam,
  ReportDTO,
  TaskAssignmentDTO,
  TaskDTO,
  TaskStatus,
} from '../models/types';
import { ApiError, apiClient, isNetworkError } from '../services/apiClient';
import { enqueueOfflineStatusTransition } from '../services/offlineSyncService';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr, formatDateTimeFr } from '../utils/formatters';

interface MissionsPageProps {
  tasks: TaskDTO[];
  reports?: ReportDTO[];
  params: DistrictParam[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
  onOpenAllTasks: () => void;
}

type MissionFilterTab = 'ACTIVE' | 'DONE' | 'ALL';

const PRIORITY_RANK: Record<string, number> = {
  URGENTE: 0,
  HAUTE: 1,
  NORMALE: 2,
  BASSE: 3,
};

const CLOSED_GLOBAL: TaskStatus[] = ['VALIDÉE', 'ANNULÉE'];

function getTodayAlgiersIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const MissionsPage: React.FC<MissionsPageProps> = ({
  tasks,
  reports = [],
  params,
  loading,
  onDataChanged,
  onOpenAllTasks,
}) => {
  const { user, isOnline } = useAuth();
  const todayIso = getTodayAlgiersIso();

  const [tab, setTab] = useState<MissionFilterTab>('ACTIVE');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Modale motif / confirmation
  const [modalState, setModalState] = useState<{
    task: TaskDTO;
    targetStatus: AgentAssignmentStatus;
  } | null>(null);
  const [modalError, setModalError] = useState('');
  const [reportModalContext, setReportModalContext] = useState<{
    task: TaskDTO;
    previousReport: ReportDTO | null;
  } | null>(null);

  const latestReportByTask = useMemo(() => {
    const map = new Map<string, ReportDTO>();
    for (const r of reports) {
      const prev = map.get(r.task_id);
      if (!prev || r.version > prev.version) {
        map.set(r.task_id, r);
      }
    }
    return map;
  }, [reports]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX')) {
      m.set(c.valeur, c.libelle);
    }
    return m;
  }, [params]);

  const myMissions = useMemo(() => {
    if (!user) return [];
    const list: Array<{ task: TaskDTO; myAssignment: TaskAssignmentDTO }> = [];
    for (const task of tasks) {
      const asg = task.assignments.find((a) => a.agent_id === user.agent_id);
      if (asg) {
        list.push({ task, myAssignment: asg });
      }
    }
    return list.sort((a, b) => {
      const aClosed = CLOSED_GLOBAL.includes(a.task.statut_global) ? 1 : 0;
      const bClosed = CLOSED_GLOBAL.includes(b.task.statut_global) ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      const prioDiff =
        (PRIORITY_RANK[a.task.priorite] ?? 9) - (PRIORITY_RANK[b.task.priorite] ?? 9);
      if (prioDiff !== 0) return prioDiff;
      return a.task.date_debut_prevue.localeCompare(b.task.date_debut_prevue);
    });
  }, [tasks, user]);

  const filteredMissions = useMemo(() => {
    return myMissions.filter(({ task, myAssignment }) => {
      if (tab === 'ACTIVE') {
        return (
          myAssignment.statut_agent !== 'TERMINÉE' &&
          !CLOSED_GLOBAL.includes(task.statut_global)
        );
      }
      if (tab === 'DONE') {
        return (
          myAssignment.statut_agent === 'TERMINÉE' ||
          CLOSED_GLOBAL.includes(task.statut_global)
        );
      }
      return true;
    });
  }, [myMissions, tab]);

  const counts = useMemo(() => {
    let active = 0;
    let urgent = 0;
    let blockedOrWaiting = 0;
    let done = 0;
    for (const { task, myAssignment } of myMissions) {
      if (myAssignment.statut_agent === 'TERMINÉE' || CLOSED_GLOBAL.includes(task.statut_global)) {
        done++;
      } else {
        active++;
        if (task.priorite === 'URGENTE') urgent++;
        if (
          myAssignment.statut_agent === 'BLOQUÉE' ||
          myAssignment.statut_agent === 'EN ATTENTE'
        ) {
          blockedOrWaiting++;
        }
      }
    }
    return { active, urgent, blockedOrWaiting, done };
  }, [myMissions]);

  const executeDirectTransition = async (
    task: TaskDTO,
    targetStatus: AgentAssignmentStatus,
    motif = ''
  ) => {
    if (!user) return;
    setSubmittingId(task.task_id);
    setErrorMsg('');
    setModalError('');
    try {
      if (!isOnline) {
        await enqueueOfflineStatusTransition({
          user,
          task,
          statut_agent: targetStatus,
          motif,
        });
        setFeedbackMsg(
          `Mission ${task.numero_tache} enregistrée hors connexion (${targetStatus}) — synchronisation automatique au retour d'Internet.`
        );
        setModalState(null);
        await onDataChanged();
        return;
      }

      const res = await apiClient.patchMyTaskExecution(task.task_id, targetStatus, motif);
      setFeedbackMsg(
        `Mission ${res.task.numero_tache} mise à jour : mon statut est passé à ${targetStatus}.`
      );
      setModalState(null);
      await onDataChanged();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueOfflineStatusTransition({
          user,
          task,
          statut_agent: targetStatus,
          motif,
        });
        setFeedbackMsg(
          `Mission ${task.numero_tache} enregistrée hors connexion (${targetStatus}) — synchronisation automatique au retour d'Internet.`
        );
        setModalState(null);
        await onDataChanged();
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : "Impossible de mettre à jour l'avancement terrain.";
      if (modalState) {
        setModalError(msg);
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setSubmittingId(null);
    }
  };

  const openModalTransition = (task: TaskDTO, targetStatus: AgentAssignmentStatus) => {
    setModalError('');
    setModalState({ task, targetStatus });
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Mes missions terrain
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Exécution directe de vos interventions affectées · Horodatage automatique serveur (
            <span className="font-mono">Africa/Algiers</span>).
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAllTasks}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ClipboardList className="h-4 w-4" />
          <span>Vue collective du district</span>
        </button>
      </div>

      {/* KPIs personnels */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">À traiter</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0055A4] dark:text-blue-400">
            {counts.active}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Urgentes</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
            {counts.urgent}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Attente / Bloquées
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {counts.blockedOrWaiting}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Terminées</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {counts.done}
          </p>
        </div>
      </section>

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

      {errorMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="rounded p-1 hover:bg-red-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Onglets de filtre */}
      <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            { id: 'ACTIVE', label: `À traiter (${counts.active})` },
            { id: 'DONE', label: `Terminées (${counts.done})` },
            { id: 'ALL', label: `Toutes (${myMissions.length})` },
          ] as Array<{ id: MissionFilterTab; label: string }>
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

      {/* Liste des missions */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Chargement de vos missions...
        </div>
      ) : filteredMissions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <Wrench className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            {tab === 'ACTIVE'
              ? 'Aucune mission en attente de traitement pour le moment.'
              : 'Aucune mission trouvée dans cette vue.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMissions.map(({ task, myAssignment }) => {
            const isBusy = submittingId === task.task_id;
            const isLocked =
              task.statut_global === 'ANNULÉE' || task.statut_global === 'VALIDÉE';
            const isOverdue =
              Boolean(task.date_fin_prevue) &&
              task.date_fin_prevue < todayIso &&
              myAssignment.statut_agent !== 'TERMINÉE' &&
              !isLocked;

            const mapsUrl =
              task.latitude && task.longitude
                ? `https://www.google.com/maps?q=${encodeURIComponent(
                    `${task.latitude},${task.longitude}`
                  )}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${task.adresse}, ${task.commune}, Mostaganem, Algérie`
                  )}`;

            const coAgents = task.assignments.filter((a) => a.agent_id !== user.agent_id);
            const latestReport = latestReportByTask.get(task.task_id) || null;
            const canSubmitOrCorrectReport =
              !isLocked &&
              (myAssignment.statut_agent === 'EN COURS' ||
                myAssignment.statut_agent === 'TERMINÉE' ||
                task.statut_global === 'REFUSÉE');

            return (
              <article
                key={task.task_id}
                className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4"
              >
                {/* Ligne supérieure : Numéro, Priorité, Statuts */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-[#0055A4] dark:text-blue-400">
                        {task.numero_tache}
                      </span>
                      <PriorityLabel priorite={task.priorite} />
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {formatDateFr(task.date_debut_prevue)} · {task.heure_prevue}
                      </span>
                      {isOverdue && (
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                          Échéance dépassée ({formatDateFr(task.date_fin_prevue)})
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white">
                      {task.titre}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {task.categorie} — {categoryMap.get(task.categorie) || task.categorie}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-1 sm:items-end shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Mon statut :</span>
                      <TaskStatusLabel statut={myAssignment.statut_agent} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Global :</span>
                      <TaskStatusLabel statut={task.statut_global} />
                    </div>
                  </div>
                </div>

                {/* Localisation & Consignes */}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-800/40 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      <MapPin className="mr-1 inline h-3.5 w-3.5 text-[#0055A4]" />
                      {task.commune} · {task.dp}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">{task.adresse}</p>
                    {task.repere_geo && (
                      <p className="text-slate-500 dark:text-slate-400">
                        Repère : {task.repere_geo}
                      </p>
                    )}
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 pt-1 font-medium text-[#0055A4] hover:underline dark:text-blue-400"
                    >
                      <span>Itinéraire Google Maps</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-slate-700 dark:text-slate-300">{task.description}</p>
                    {task.instructions && (
                      <p className="font-medium text-slate-900 dark:text-white">
                        Consignes : {task.instructions}
                      </p>
                    )}
                    {task.materiel_necessaire && (
                      <p className="text-slate-600 dark:text-slate-400">
                        Matériel : {task.materiel_necessaire}
                      </p>
                    )}
                  </div>
                </div>

                {/* Motif si en attente / bloqué */}
                {myAssignment.motif_blocage_attente && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                    <strong>Motif signalé :</strong> {myAssignment.motif_blocage_attente}
                  </div>
                )}

                {/* Alerte compte-rendu refusé */}
                {task.statut_global === 'REFUSÉE' && latestReport?.validation === 'REFUSÉ' && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    <strong>
                      Compte-rendu v{latestReport.version} refusé par{' '}
                      {latestReport.validateur_nom || 'le Chef'} :
                    </strong>{' '}
                    {latestReport.commentaire_chef}
                  </div>
                )}

                {/* Coéquipiers + Horodatage personnel */}
                <div className="flex flex-col gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {coAgents.length === 0
                        ? 'Intervention individuelle'
                        : `En binôme/équipe avec : ${coAgents
                            .map((a) => `${a.agent_prenom} ${a.agent_nom}`.trim())
                            .join(', ')}`}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] tabular-nums">
                    {myAssignment.date_debut && (
                      <span>Démarrée : {formatDateTimeFr(myAssignment.date_debut)}</span>
                    )}
                    {myAssignment.date_fin && (
                      <span> · Clôturée : {formatDateTimeFr(myAssignment.date_fin)}</span>
                    )}
                  </div>
                </div>

                {/* Boutons d'action terrain (≥44px tactile) */}
                {!isLocked && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                    {myAssignment.statut_agent === 'TRANSMISE' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => executeDirectTransition(task, 'ACCEPTÉE')}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-[#0055A4] bg-white px-4 py-2 text-sm font-medium text-[#0055A4] transition-colors hover:bg-blue-50 disabled:opacity-50 sm:flex-initial dark:border-blue-500 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-950/30"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Accepter</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => executeDirectTransition(task, 'EN COURS')}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] disabled:opacity-50 sm:flex-initial"
                        >
                          <PlayCircle className="h-4 w-4" />
                          <span>Démarrer</span>
                        </button>
                      </>
                    )}

                    {myAssignment.statut_agent === 'ACCEPTÉE' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => executeDirectTransition(task, 'EN COURS')}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] disabled:opacity-50 sm:flex-initial"
                      >
                        <PlayCircle className="h-4 w-4" />
                        <span>Démarrer l&apos;intervention</span>
                      </button>
                    )}

                    {(myAssignment.statut_agent === 'EN ATTENTE' ||
                      myAssignment.statut_agent === 'BLOQUÉE') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => executeDirectTransition(task, 'EN COURS')}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] disabled:opacity-50 sm:flex-initial"
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span>Reprendre</span>
                      </button>
                    )}

                    {myAssignment.statut_agent !== 'TERMINÉE' &&
                      myAssignment.statut_agent !== 'TRANSMISE' && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openModalTransition(task, 'TERMINÉE')}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:flex-initial"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Terminer</span>
                          </button>

                          {myAssignment.statut_agent !== 'EN ATTENTE' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openModalTransition(task, 'EN ATTENTE')}
                              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/30"
                            >
                              <PauseCircle className="h-4 w-4" />
                              <span>En attente</span>
                            </button>
                          )}

                          {myAssignment.statut_agent !== 'BLOQUÉE' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openModalTransition(task, 'BLOQUÉE')}
                              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
                            >
                              <AlertOctagon className="h-4 w-4" />
                              <span>Bloquer</span>
                            </button>
                          )}
                        </>
                      )}

                    {task.statut_global === 'REFUSÉE' &&
                      myAssignment.statut_agent === 'TERMINÉE' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => executeDirectTransition(task, 'EN COURS')}
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-50"
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span>Reprendre suite au refus</span>
                        </button>
                      )}

                    {canSubmitOrCorrectReport && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          setReportModalContext({
                            task,
                            previousReport: latestReport,
                          })
                        }
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#0055A4] bg-white px-4 py-2 text-sm font-medium text-[#0055A4] transition-colors hover:bg-blue-50 disabled:opacity-50 dark:border-blue-500 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-950/30"
                      >
                        <FileText className="h-4 w-4" />
                        <span>
                          {latestReport
                            ? `Corriger / Ajouter CR (v${latestReport.version + 1})`
                            : 'Rédiger compte-rendu'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ExecutionActionModal
        open={Boolean(modalState)}
        task={modalState?.task || null}
        targetStatus={modalState?.targetStatus || null}
        loading={Boolean(modalState && submittingId === modalState.task.task_id)}
        errorMessage={modalError}
        onConfirm={(motif) =>
          modalState && executeDirectTransition(modalState.task, modalState.targetStatus, motif)
        }
        onCancel={() => setModalState(null)}
      />

      <ReportModal
        open={Boolean(reportModalContext)}
        task={reportModalContext?.task || null}
        previousReport={reportModalContext?.previousReport || null}
        onSubmitted={async (rep) => {
          setFeedbackMsg(
            `Compte-rendu v${rep.version} transmis au Chef d'équipe pour validation.`
          );
          await onDataChanged();
        }}
        onClose={() => setReportModalContext(null)}
      />
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Printer,
  X,
} from 'lucide-react';
import { PriorityLabel, TaskStatusLabel } from '../components/StatusIndicator';
import type { AgentDTO, DistrictParam, TaskDTO, TaskStatus } from '../models/types';
import { ApiError, apiClient, triggerBlobDownload } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr } from '../utils/formatters';

interface PlanningPageProps {
  tasks: TaskDTO[];
  agents: AgentDTO[];
  params: DistrictParam[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
}

type PlanningViewMode = 'DAY' | 'WEEK' | 'MONTH';

const CLOSED_STATUSES: TaskStatus[] = ['TERMINÉE', 'À VALIDER', 'VALIDÉE', 'ANNULÉE'];

function getTodayAlgiersIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function getMondayOfWeekIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=dim, 1=lun
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

function getMonthGridDays(isoDate: string): string[] {
  const [y, m] = isoDate.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstDayWeek = firstOfMonth.getUTCDay();
  const offset = firstDayWeek === 0 ? -6 : 1 - firstDayWeek;
  const start = new Date(Date.UTC(y, m - 1, 1 + offset));
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start);
    cur.setUTCDate(start.getUTCDate() + i);
    days.push(cur.toISOString().slice(0, 10));
  }
  return days;
}

function formatDayShortFr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(dt);
}

function formatMonthTitleFr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export const PlanningPage: React.FC<PlanningPageProps> = ({
  tasks,
  agents,
  params,
  loading,
  onDataChanged,
}) => {
  const { user } = useAuth();
  const isChef = user?.role === 'CHEF';
  const todayIso = getTodayAlgiersIso();

  const [viewMode, setViewMode] = useState<PlanningViewMode>('DAY');
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  // Report d'une tâche en retard ou à replanifier
  const [rescheduleTask, setRescheduleTask] = useState<TaskDTO | null>(null);
  const [newStartDate, setNewStartDate] = useState('');
  const [newTime, setNewTime] = useState('08:30');
  const [newEndDate, setNewEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX')) {
      m.set(c.valeur, c.libelle);
    }
    return m;
  }, [params]);

  const scopedTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedAgentId && !t.assignments.some((a) => a.agent_id === selectedAgentId)) {
        return false;
      }
      return true;
    });
  }, [tasks, selectedAgentId]);

  const overdueTasks = useMemo(
    () =>
      scopedTasks
        .filter(
          (t) =>
            Boolean(t.date_fin_prevue) &&
            t.date_fin_prevue < todayIso &&
            !CLOSED_STATUSES.includes(t.statut_global)
        )
        .sort((a, b) => a.date_fin_prevue.localeCompare(b.date_fin_prevue)),
    [scopedTasks, todayIso]
  );

  const dayTasks = useMemo(
    () =>
      scopedTasks
        .filter((t) => t.date_debut_prevue === selectedDate && t.statut_global !== 'ANNULÉE')
        .sort((a, b) => (a.heure_prevue || '08:30').localeCompare(b.heure_prevue || '08:30')),
    [scopedTasks, selectedDate]
  );

  const weekDays = useMemo(() => {
    const monday = getMondayOfWeekIso(selectedDate);
    return Array.from({ length: 7 }, (_, idx) => addDaysIso(monday, idx));
  }, [selectedDate]);

  const monthDays = useMemo(() => getMonthGridDays(selectedDate), [selectedDate]);

  const selectedAgentLabel = useMemo(() => {
    if (!selectedAgentId) return 'Tous les agents du district';
    const ag = agents.find((a) => a.agent_id === selectedAgentId);
    return ag ? `${ag.prenom} ${ag.nom} (${ag.matricule})` : 'Agent sélectionné';
  }, [agents, selectedAgentId]);

  const handleShiftDate = (direction: -1 | 1) => {
    if (viewMode === 'DAY') {
      setSelectedDate((d) => addDaysIso(d, direction));
    } else if (viewMode === 'WEEK') {
      setSelectedDate((d) => addDaysIso(d, direction * 7));
    } else {
      const [y, m] = selectedDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + direction, 1));
      setSelectedDate(dt.toISOString().slice(0, 10));
    }
  };

  const openReschedule = (task: TaskDTO) => {
    setRescheduleTask(task);
    setNewStartDate(todayIso);
    setNewTime(task.heure_prevue || '08:30');
    setNewEndDate(task.date_fin_prevue < todayIso ? todayIso : task.date_fin_prevue);
    setErrorMsg('');
  };

  const handleSaveReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTask) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiClient.updateTask(rescheduleTask.task_id, {
        date_debut_prevue: newStartDate,
        heure_prevue: newTime,
        date_fin_prevue: newEndDate,
        expected_version: rescheduleTask.version,
      });
      setFeedbackMsg(
        `Tâche ${res.task.numero_tache} reportée au ${formatDateFr(newStartDate)} à ${newTime}.`
      );
      setRescheduleTask(null);
      await onDataChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Impossible de replanifier cette tâche.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Contrôles écran (masqués à l'impression PDF) */}
      <div className="space-y-5 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Planning des interventions
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Programme journalier, hebdomadaire et mensuel · Suivi des retards et impression
              officielle.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isChef && (
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={async () => {
                  setDownloadingPdf(true);
                  setErrorMsg('');
                  try {
                    const res = await apiClient.downloadOfficialReport({
                      type: 'DAILY_PROGRAM',
                      format: 'pdf',
                      date: selectedDate,
                      agentId: selectedAgentId || undefined,
                    });
                    triggerBlobDownload(res.blob, res.fileName);
                    setFeedbackMsg(
                      `Programme journalier PDF généré (${res.reportNumber || res.fileName}).`
                    );
                  } catch (err) {
                    setFeedbackMsg(
                      err instanceof ApiError
                        ? err.message
                        : 'Téléchargement PDF impossible hors connexion.'
                    );
                  } finally {
                    setDownloadingPdf(false);
                  }
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] disabled:opacity-60 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>{downloadingPdf ? 'Génération PDF...' : 'Télécharger PDF officiel'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimer</span>
            </button>
          </div>
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

        {/* Barre de navigation temporelle & filtres */}
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(['DAY', 'WEEK', 'MONTH'] as PlanningViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === mode
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {mode === 'DAY' ? 'Journalier' : mode === 'WEEK' ? 'Hebdomadaire' : 'Mensuel'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleShiftDate(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Période précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              aria-label="Date sélectionnée"
              className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(todayIso)}
              className="min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Aujourd&apos;hui
            </button>
            <button
              type="button"
              onClick={() => handleShiftDate(1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Période suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              aria-label="Planning par agent"
              className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Planning global (tous les agents)</option>
              {agents.map((ag) => (
                <option key={ag.agent_id} value={ag.agent_id}>
                  {ag.prenom} {ag.nom} ({ag.matricule})
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Tâches en retard ou non réalisées de la veille */}
        {overdueTasks.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Tâches en retard / non réalisées ({overdueTasks.length})
              </span>
            </div>
            <div className="mt-3 divide-y divide-amber-200/70 dark:divide-amber-900/40">
              {overdueTasks.map((task) => (
                <div
                  key={task.task_id}
                  className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                        {task.numero_tache}
                      </span>
                      <PriorityLabel priorite={task.priorite} />
                      <TaskStatusLabel statut={task.statut_global} />
                      <span className="font-mono text-amber-800 dark:text-amber-300">
                        Échéance dépassée : {formatDateFr(task.date_fin_prevue)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                      {task.titre} — {task.commune}
                    </p>
                  </div>

                  {isChef && (
                    <button
                      type="button"
                      onClick={() => openReschedule(task)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      <span>Reporter</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Vue Planning */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Chargement du planning...
          </div>
        ) : viewMode === 'DAY' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Programme du <span className="font-mono">{formatDateFr(selectedDate)}</span>
              </h3>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {dayTasks.length} intervention(s)
              </span>
            </div>

            {dayTasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune intervention planifiée pour cette journée.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {dayTasks.map((task) => (
                  <div
                    key={task.task_id}
                    className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        <Clock className="h-3.5 w-3.5 text-[#0055A4]" />
                        <span>{task.heure_prevue || '08:30'}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#0055A4] dark:text-blue-400">
                            {task.numero_tache}
                          </span>
                          <PriorityLabel priorite={task.priorite} />
                          <TaskStatusLabel statut={task.statut_global} />
                        </div>
                        <p className="mt-0.5 font-medium text-slate-900 dark:text-white">
                          {task.titre}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {task.commune} · {task.dp} — {task.adresse}
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Agents :{' '}
                          {task.assignments.length === 0
                            ? 'Non affectée'
                            : task.assignments
                                .map((a) => `${a.agent_prenom} ${a.agent_nom}`.trim())
                                .join(', ')}
                        </p>
                      </div>
                    </div>

                    {isChef && !CLOSED_STATUSES.includes(task.statut_global) && (
                      <button
                        type="button"
                        onClick={() => openReschedule(task)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>Replanifier</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : viewMode === 'WEEK' ? (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekDays.map((dayIso) => {
              const items = scopedTasks
                .filter((t) => t.date_debut_prevue === dayIso && t.statut_global !== 'ANNULÉE')
                .sort((a, b) => (a.heure_prevue || '').localeCompare(b.heure_prevue || ''));
              const isToday = dayIso === todayIso;
              return (
                <div
                  key={dayIso}
                  className={`flex flex-col rounded-xl border p-3 ${
                    isToday
                      ? 'border-[#0055A4] bg-blue-50/30 dark:border-blue-500 dark:bg-blue-950/20'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayIso);
                      setViewMode('DAY');
                    }}
                    className="flex items-center justify-between border-b border-slate-200 pb-2 text-left dark:border-slate-800"
                  >
                    <span className="font-display text-xs font-semibold capitalize text-slate-900 dark:text-white">
                      {formatDayShortFr(dayIso)}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{items.length}</span>
                  </button>

                  <div className="mt-2.5 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-[11px] text-slate-400">Aucune tâche</p>
                    ) : (
                      items.map((t) => (
                        <div
                          key={t.task_id}
                          className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-semibold text-[#0055A4] dark:text-blue-400">
                              {t.heure_prevue}
                            </span>
                            <PriorityLabel priorite={t.priorite} />
                          </div>
                          <p className="mt-1 line-clamp-2 font-medium text-slate-900 dark:text-white">
                            {t.titre}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">{t.commune}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 font-display text-base font-semibold capitalize text-slate-900 dark:text-white">
              {formatMonthTitleFr(selectedDate)}
            </h3>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((dayIso) => {
                const inMonth = dayIso.slice(0, 7) === selectedDate.slice(0, 7);
                const count = scopedTasks.filter(
                  (t) => t.date_debut_prevue === dayIso && t.statut_global !== 'ANNULÉE'
                ).length;
                const urgentCount = scopedTasks.filter(
                  (t) =>
                    t.date_debut_prevue === dayIso &&
                    t.priorite === 'URGENTE' &&
                    t.statut_global !== 'ANNULÉE'
                ).length;
                const isToday = dayIso === todayIso;
                return (
                  <button
                    key={dayIso}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayIso);
                      setViewMode('DAY');
                    }}
                    className={`flex min-h-[68px] flex-col items-start justify-between rounded-lg border p-2 text-left transition-colors ${
                      isToday
                        ? 'border-[#0055A4] bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                        : inMonth
                          ? 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800'
                          : 'border-slate-100 bg-slate-50/50 text-slate-400 dark:border-slate-800/50 dark:bg-slate-950/40'
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold">
                      {Number.parseInt(dayIso.slice(8, 10), 10)}
                    </span>
                    {count > 0 && (
                      <div className="w-full space-y-0.5 text-[11px]">
                        <p className="font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                          {count} tâche{count > 1 ? 's' : ''}
                        </p>
                        {urgentCount > 0 && (
                          <p className="font-mono text-[10px] font-semibold text-red-600 dark:text-red-400">
                            {urgentCount} urg.
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Feuille d'impression officielle Sonelgaz (PDF) */}
      <section className="hidden print:block text-black bg-white p-2">
        <div className="border-b-2 border-black pb-3">
          <p className="text-xs font-bold uppercase tracking-wide">
            SONELGAZ DISTRIBUTION · DIRECTION DE DISTRIBUTION DE MOSTAGANEM
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <h1 className="text-lg font-bold">
              DISTRICT GAZ SIDI ALI — PROGRAMME JOURNALIER DES INTERVENTIONS
            </h1>
            <span className="font-mono text-sm font-bold">
              Date : {formatDateFr(selectedDate)}
            </span>
          </div>
          <p className="mt-1 text-xs">
            Périmètre : {selectedAgentLabel} · Fuseau horaire : Africa/Algiers
          </p>
        </div>

        <table className="mt-4 w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black px-2 py-1.5 text-left">Heure</th>
              <th className="border border-black px-2 py-1.5 text-left">N° Tâche</th>
              <th className="border border-black px-2 py-1.5 text-left">Intervention & Catégorie</th>
              <th className="border border-black px-2 py-1.5 text-left">Commune / DP / Adresse</th>
              <th className="border border-black px-2 py-1.5 text-left">Agents affectés</th>
              <th className="border border-black px-2 py-1.5 text-left">Priorité</th>
              <th className="border border-black px-2 py-1.5 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {dayTasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-black px-3 py-4 text-center">
                  Aucune intervention planifiée pour le {formatDateFr(selectedDate)}.
                </td>
              </tr>
            ) : (
              dayTasks.map((t) => (
                <tr key={t.task_id}>
                  <td className="border border-black px-2 py-1.5 font-mono">
                    {t.heure_prevue || '08:30'}
                  </td>
                  <td className="border border-black px-2 py-1.5 font-mono font-semibold">
                    {t.numero_tache}
                  </td>
                  <td className="border border-black px-2 py-1.5">
                    <strong>{t.titre}</strong>
                    <br />
                    <span>
                      {t.categorie} — {categoryMap.get(t.categorie) || t.categorie}
                    </span>
                  </td>
                  <td className="border border-black px-2 py-1.5">
                    {t.commune} ({t.dp})
                    <br />
                    {t.adresse}
                  </td>
                  <td className="border border-black px-2 py-1.5">
                    {t.assignments.length === 0
                      ? 'Non affectée'
                      : t.assignments
                          .map((a) => `${a.agent_prenom} ${a.agent_nom} (${a.agent_matricule})`)
                          .join(', ')}
                  </td>
                  <td className="border border-black px-2 py-1.5">{t.priorite}</td>
                  <td className="border border-black px-2 py-1.5">{t.statut_global}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
          <div className="border border-black p-3">
            <p className="font-bold">Totaux du programme :</p>
            <p className="mt-1">Interventions du jour : {dayTasks.length}</p>
            <p>
              Urgentes : {dayTasks.filter((t) => t.priorite === 'URGENTE').length} · Hautes :{' '}
              {dayTasks.filter((t) => t.priorite === 'HAUTE').length}
            </p>
          </div>
          <div className="border border-black p-3 min-h-[84px]">
            <p className="font-bold">Visa & Observations du Chef d&apos;équipe Gaz :</p>
          </div>
        </div>
      </section>

      {/* Modale Replanifier / Reporter */}
      {rescheduleTask && isChef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] print:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Replanifier · {rescheduleTask.numero_tache}
              </h3>
              <button
                type="button"
                onClick={() => setRescheduleTask(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReschedule} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nouvelle date prévue *
                </label>
                <input
                  type="date"
                  required
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Heure prévue (24h) *
                </label>
                <input
                  type="time"
                  required
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nouvelle date limite *
                </label>
                <input
                  type="date"
                  required
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleTask(null)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
                >
                  {submitting ? 'Enregistrement...' : 'Valider le report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  History,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { PriorityLabel, TaskStatusLabel } from '../components/StatusIndicator';
import type {
  AgentDTO,
  AppSection,
  DistrictParam,
  HistoryEntry,
  ReportDTO,
  TaskDTO,
  TaskStatus,
} from '../models/types';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr, formatDateTimeFr } from '../utils/formatters';

interface OverviewPageProps {
  agents: AgentDTO[];
  tasks: TaskDTO[];
  reports: ReportDTO[];
  history: HistoryEntry[];
  params: DistrictParam[];
  loading: boolean;
  onNavigate: (section: AppSection) => void;
}

const CLOSED_STATUSES: TaskStatus[] = ['TERMINÉE', 'À VALIDER', 'VALIDÉE', 'ANNULÉE'];

function getTodayAlgiersIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  agents,
  tasks,
  reports,
  history,
  params,
  loading,
  onNavigate,
}) => {
  const { user } = useAuth();
  if (!user) return null;

  const todayIso = getTodayAlgiersIso();
  const activeAgentsCount = agents.filter((a) => a.statut === 'ACTIF').length;

  const activeTasks = tasks.filter((t) => !CLOSED_STATUSES.includes(t.statut_global));
  const urgentActiveCount = activeTasks.filter((t) => t.priorite === 'URGENTE').length;
  const blockedCount = tasks.filter((t) => t.statut_global === 'BLOQUÉE').length;
  const pendingValidationCount = reports.filter((r) => r.validation === 'EN_ATTENTE').length;
  const myRefusedCount = tasks.filter(
    (t) =>
      t.statut_global === 'REFUSÉE' &&
      t.assignments.some((a) => a.agent_id === user.agent_id)
  ).length;
  const overdueCount = activeTasks.filter(
    (t) => Boolean(t.date_fin_prevue) && t.date_fin_prevue < todayIso
  ).length;

  const myActiveMissionsCount = tasks.filter((t) => {
    if (t.statut_global === 'ANNULÉE' || t.statut_global === 'VALIDÉE') return false;
    const myAsg = t.assignments.find((a) => a.agent_id === user.agent_id);
    return Boolean(myAsg && myAsg.statut_agent !== 'TERMINÉE');
  }).length;

  const communesCount = params.filter((p) => p.categorie === 'COMMUNE' && p.actif).length;
  const dpCount = params.filter((p) => p.categorie === 'DP' && p.actif).length;
  const catCount = params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX' && p.actif).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* En-tête de bienvenue */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[#0055A4] dark:text-blue-400">
              Sonelgaz Distribution · Direction de Mostaganem · District Gaz Sidi Ali
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white text-balance">
              Bonjour, {user.prenom} {user.nom}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {user.fonction} · Matricule{' '}
              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                {user.matricule}
              </span>{' '}
              · Dernière connexion :{' '}
              <span className="font-mono">{formatDateTimeFr(user.derniere_connexion)}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('missions')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Wrench className="h-4 w-4 text-[#0055A4] dark:text-blue-400" />
              <span>Mes missions ({myActiveMissionsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('planning')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <CalendarDays className="h-4 w-4" />
              <span>Planning</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#004485] whitespace-nowrap shrink-0"
            >
              <ClipboardList className="h-4 w-4" />
              <span>{user.role === 'CHEF' ? 'Gérer les tâches' : 'Voir les tâches'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Alerte tâches bloquées */}
      {user.role === 'CHEF' && blockedCount > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/20">
          <div className="flex items-center gap-2.5 text-sm font-medium text-red-900 dark:text-red-300">
            <AlertOctagon className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <span>
              {blockedCount} intervention(s) actuellement signalée(s) comme BLOQUÉE(S) sur le
              terrain.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap shrink-0"
          >
            <span>Consulter les blocages</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {/* Alerte comptes-rendus à valider (Chef) */}
      {user.role === 'CHEF' && pendingValidationCount > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5 text-sm font-medium text-amber-900 dark:text-amber-300">
            <FileCheck2 className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {pendingValidationCount} compte(s)-rendu(s) en attente de validation du Chef.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#004485] whitespace-nowrap shrink-0"
          >
            <span>Contrôler et valider</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {/* Alerte comptes-rendus refusés (Agent) */}
      {myRefusedCount > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/20">
          <div className="flex items-center gap-2.5 text-sm font-medium text-red-900 dark:text-red-300">
            <FileCheck2 className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <span>
              {myRefusedCount} intervention(s) nécessitent une correction de votre compte-rendu.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap shrink-0"
          >
            <span>Corriger le compte-rendu</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {/* Indicateurs opérationnels réels */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Interventions actives</span>
            <ClipboardList className="h-4 w-4 text-[#0055A4]" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {loading ? '—' : activeTasks.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sur {tasks.length} tâche(s) au total
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Urgences en cours</span>
            <AlertOctagon className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-red-600 dark:text-red-400">
            {loading ? '—' : urgentActiveCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Priorité URGENTE non clôturée
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Tâches en retard</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {loading ? '—' : overdueCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Échéance dépassée à replanifier
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Agents actifs</span>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {loading ? '—' : activeAgentsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sur {agents.length} compte(s) enregistré(s)
          </p>
        </div>
      </section>

      {/* Interventions récentes + Historique & Référentiels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Interventions récentes du district
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0055A4] hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              <span>Voir toutes les tâches</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {tasks.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              Aucune intervention enregistrée pour le moment.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.slice(0, 5).map((t) => (
                <div
                  key={t.task_id}
                  className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#0055A4] dark:text-blue-400">
                        {t.numero_tache}
                      </span>
                      <PriorityLabel priorite={t.priorite} />
                      <TaskStatusLabel statut={t.statut_global} />
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-white">
                      {t.titre}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {t.commune} · {t.dp}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                    {formatDateFr(t.date_debut_prevue)} · {t.heure_prevue}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Dernières opérations tracées
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0055A4] hover:underline dark:text-blue-400 whitespace-nowrap"
              >
                <span>Tout consulter</span>
                <History className="h-3.5 w-3.5" />
              </button>
            </div>

            {history.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                Aucune opération enregistrée.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {history.slice(0, 4).map((item) => (
                  <div key={item.history_id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.action.replaceAll('_', ' ')}
                      </p>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                        {formatDateTimeFr(item.date_serveur)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.user_name} · {item.commentaire}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Référentiels & Équipe
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('params')}
                className="text-xs font-medium text-[#0055A4] hover:underline dark:text-blue-400 whitespace-nowrap"
              >
                Administrer
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-slate-600 dark:text-slate-300">Communes actives</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {communesCount}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-slate-600 dark:text-slate-300">
                  Distributions Publiques (DP)
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {dpCount}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-slate-600 dark:text-slate-300">
                  Catégories d&apos;intervention
                </span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {catCount}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <Users className="h-3.5 w-3.5" />
                  <span>Annuaire équipe</span>
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('agents')}
                  className="font-medium text-[#0055A4] hover:underline dark:text-blue-400"
                >
                  {agents.length} agent(s)
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Compass,
  ExternalLink,
  Filter,
  MapPin,
  RotateCcw,
  Users,
} from 'lucide-react';
import { AgentStatusLabel, PriorityLabel, TaskStatusLabel } from '../components/StatusIndicator';
import type {
  AgentDTO,
  AgentTrackingDTO,
  AppSection,
  DashboardFilterParams,
  DashboardStatsDTO,
  DistrictParam,
  ReportDTO,
  TaskDTO,
  TaskPriority,
  TaskStatus,
} from '../models/types';
import { ApiError, apiClient } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr, formatDateTimeFr } from '../utils/formatters';

interface DashboardStatsPageProps {
  tasks: TaskDTO[];
  reports: ReportDTO[];
  agents: AgentDTO[];
  params: DistrictParam[];
  onNavigate: (section: AppSection) => void;
}

type StatsSubTab = 'INDICATORS' | 'AGENTS' | 'MAP';

const CLOSED_STATUSES: TaskStatus[] = ['TERMINÉE', 'À VALIDER', 'VALIDÉE', 'ANNULÉE'];
const COMPLEX_CATEGORIES = new Set(['FUG', 'ING', 'VAN', 'OUV', 'RSF', 'PUR', 'CPM']);

function getTodayAlgiersIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function computeOfflineDashboardFallback(
  allTasks: TaskDTO[],
  allReports: ReportDTO[],
  allAgents: AgentDTO[],
  params: DistrictParam[],
  filters: DashboardFilterParams
): DashboardStatsDTO {
  const todayIso = getTodayAlgiersIso();
  const tasks = allTasks.filter((t) => {
    const refDate = (t.date_debut_prevue || t.date_creation).slice(0, 10);
    if (filters.dateFrom && refDate < filters.dateFrom) return false;
    if (filters.dateTo && refDate > filters.dateTo) return false;
    if (filters.commune && t.commune !== filters.commune) return false;
    if (filters.dp && t.dp !== filters.dp) return false;
    if (filters.categorie && t.categorie !== filters.categorie) return false;
    if (filters.priorite && t.priorite !== filters.priorite) return false;
    if (filters.statut && t.statut_global !== filters.statut) return false;
    if (filters.agentId && !t.assignments.some((a) => a.agent_id === filters.agentId)) return false;
    return true;
  });

  const taskIds = new Set(tasks.map((t) => t.task_id));
  const filteredReports = allReports.filter((r) => taskIds.has(r.task_id));

  const categoryMap = new Map<string, string>();
  for (const p of params) {
    if (p.categorie === 'CATEGORIE_TRAVAUX') categoryMap.set(p.valeur, p.libelle);
  }

  const isOverdue = (t: TaskDTO) =>
    Boolean(t.date_fin_prevue) &&
    t.date_fin_prevue < todayIso &&
    !CLOSED_STATUSES.includes(t.statut_global);

  const catAgg = new Map<
    string,
    { code: string; libelle: string; count: number; urgentCount: number; validatedCount: number }
  >();
  const comAgg = new Map<
    string,
    { commune: string; count: number; activeCount: number; overdueCount: number }
  >();
  const dpAgg = new Map<
    string,
    { dp: string; count: number; activeCount: number; overdueCount: number }
  >();

  for (const t of tasks) {
    const cat = catAgg.get(t.categorie) || {
      code: t.categorie,
      libelle: categoryMap.get(t.categorie) || t.categorie,
      count: 0,
      urgentCount: 0,
      validatedCount: 0,
    };
    cat.count += 1;
    if (t.priorite === 'URGENTE') cat.urgentCount += 1;
    if (t.statut_global === 'VALIDÉE') cat.validatedCount += 1;
    catAgg.set(t.categorie, cat);

    const comKey = t.commune || 'Non précisée';
    const com = comAgg.get(comKey) || { commune: comKey, count: 0, activeCount: 0, overdueCount: 0 };
    com.count += 1;
    if (!CLOSED_STATUSES.includes(t.statut_global)) com.activeCount += 1;
    if (isOverdue(t)) com.overdueCount += 1;
    comAgg.set(comKey, com);

    const dpKey = t.dp || 'Non précisée';
    const dp = dpAgg.get(dpKey) || { dp: dpKey, count: 0, activeCount: 0, overdueCount: 0 };
    dp.count += 1;
    if (!CLOSED_STATUSES.includes(t.statut_global)) dp.activeCount += 1;
    if (isOverdue(t)) dp.overdueCount += 1;
    dpAgg.set(dpKey, dp);
  }

  const prioOrder: TaskPriority[] = ['URGENTE', 'HAUTE', 'NORMALE', 'BASSE'];
  const evoMap = new Map<
    string,
    { bucket: string; label: string; created: number; completed: number; validated: number }
  >();
  for (const t of tasks) {
    const day = (t.date_debut_prevue || t.date_creation).slice(0, 10);
    const bucket = filters.granularity === 'month' ? day.slice(0, 7) : day;
    const prev = evoMap.get(bucket) || {
      bucket,
      label: filters.granularity === 'month' ? `${bucket.slice(5, 7)}/${bucket.slice(0, 4)}` : formatDateFr(bucket),
      created: 0,
      completed: 0,
      validated: 0,
    };
    prev.created += 1;
    if (t.statut_global === 'TERMINÉE' || t.statut_global === 'À VALIDER' || t.statut_global === 'VALIDÉE') {
      prev.completed += 1;
    }
    if (t.statut_global === 'VALIDÉE') prev.validated += 1;
    evoMap.set(bucket, prev);
  }

  return {
    today_iso: todayIso,
    kpis: {
      total: tasks.length,
      nouvelle: tasks.filter((t) => t.statut_global === 'NOUVELLE').length,
      transmise: tasks.filter((t) => t.statut_global === 'TRANSMISE').length,
      acceptee: tasks.filter((t) => t.statut_global === 'ACCEPTÉE').length,
      en_cours: tasks.filter((t) => t.statut_global === 'EN COURS').length,
      en_attente: tasks.filter((t) => t.statut_global === 'EN ATTENTE').length,
      bloquee: tasks.filter((t) => t.statut_global === 'BLOQUÉE').length,
      terminee: tasks.filter((t) => t.statut_global === 'TERMINÉE').length,
      a_valider: tasks.filter((t) => t.statut_global === 'À VALIDER').length,
      validee: tasks.filter((t) => t.statut_global === 'VALIDÉE').length,
      refusee: tasks.filter((t) => t.statut_global === 'REFUSÉE').length,
      annulee: tasks.filter((t) => t.statut_global === 'ANNULÉE').length,
      en_retard: tasks.filter(isOverdue).length,
      cr_a_valider: filteredReports.filter((r) => r.validation === 'EN_ATTENTE').length,
      cr_valides: filteredReports.filter((r) => r.validation === 'VALIDÉ').length,
      cr_refuses: filteredReports.filter((r) => r.validation === 'REFUSÉ').length,
    },
    byCategory: Array.from(catAgg.values()).sort((a, b) => b.count - a.count),
    byCommune: Array.from(comAgg.values()).sort((a, b) => b.count - a.count),
    byDp: Array.from(dpAgg.values()).sort((a, b) => b.count - a.count),
    byPriority: prioOrder.map((priorite) => ({
      priorite,
      count: tasks.filter((t) => t.priorite === priorite).length,
    })),
    byAgent: allAgents
      .filter((a) => !filters.agentId || a.agent_id === filters.agentId)
      .map((ag) => {
        const assigned = tasks.filter((t) => t.assignments.some((asg) => asg.agent_id === ag.agent_id));
        return {
          agent_id: ag.agent_id,
          matricule: ag.matricule,
          nom: ag.nom,
          prenom: ag.prenom,
          totalAssigned: assigned.length,
          inProgress: assigned.filter((t) => {
            const m = t.assignments.find((x) => x.agent_id === ag.agent_id);
            return m?.statut_agent === 'EN COURS' || m?.statut_agent === 'ACCEPTÉE';
          }).length,
          completed: assigned.filter((t) => {
            const m = t.assignments.find((x) => x.agent_id === ag.agent_id);
            return m?.statut_agent === 'TERMINÉE' || t.statut_global === 'VALIDÉE';
          }).length,
          validated: assigned.filter((t) => t.statut_global === 'VALIDÉE').length,
          blocked: assigned.filter((t) => {
            const m = t.assignments.find((x) => x.agent_id === ag.agent_id);
            return m?.statut_agent === 'BLOQUÉE';
          }).length,
          overdue: assigned.filter(isOverdue).length,
        };
      })
      .filter((a) => a.totalAssigned > 0 || allAgents.length <= 15)
      .sort((a, b) => b.totalAssigned - a.totalAssigned),
    evolution: Array.from(evoMap.values())
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .slice(-14),
    overdueTasks: tasks.filter(isOverdue).slice(0, 20).map((t) => ({
      task_id: t.task_id,
      numero_tache: t.numero_tache,
      titre: t.titre,
      commune: t.commune,
      dp: t.dp,
      priorite: t.priorite,
      statut_global: t.statut_global,
      date_fin_prevue: t.date_fin_prevue,
      agents: t.assignments.map((a) => `${a.agent_prenom} ${a.agent_nom}`.trim()).join(', '),
    })),
    mapPoints: tasks
      .map((t) => {
        const lat = Number.parseFloat(t.latitude);
        const lng = Number.parseFloat(t.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return {
          task_id: t.task_id,
          numero_tache: t.numero_tache,
          titre: t.titre,
          commune: t.commune,
          dp: t.dp,
          adresse: t.adresse,
          priorite: t.priorite,
          statut_global: t.statut_global,
          latitude: lat,
          longitude: lng,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null),
  };
}

function computeOfflineAgentsFallback(
  user: AgentDTO,
  allAgents: AgentDTO[],
  allTasks: TaskDTO[],
  allReports: ReportDTO[]
): AgentTrackingDTO[] {
  const todayIso = getTodayAlgiersIso();
  const visibleAgents =
    user.role === 'CHEF' ? allAgents : allAgents.filter((a) => a.agent_id === user.agent_id);

  return visibleAgents.map((ag) => {
    const pairs = allTasks
      .map((t) => {
        const asg = t.assignments.find((a) => a.agent_id === ag.agent_id);
        return asg ? { task: t, asg } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const agReports = allReports.filter((r) => r.agent_id === ag.agent_id);
    const durations = agReports.map((r) => r.temps_passe_minutes).filter((m) => m > 0);
    const avgMin =
      durations.length > 0
        ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        : 0;

    return {
      agent_id: ag.agent_id,
      matricule: ag.matricule,
      nom: ag.nom,
      prenom: ag.prenom,
      telephone: ag.telephone,
      fonction: ag.fonction,
      role: ag.role,
      statut: ag.statut,
      derniere_connexion: ag.derniere_connexion,
      total_affectees: pairs.length,
      transmises: pairs.filter((p) => p.asg.statut_agent === 'TRANSMISE').length,
      acceptees: pairs.filter((p) => p.asg.statut_agent === 'ACCEPTÉE').length,
      en_cours: pairs.filter((p) => p.asg.statut_agent === 'EN COURS').length,
      en_attente: pairs.filter((p) => p.asg.statut_agent === 'EN ATTENTE').length,
      bloquees: pairs.filter((p) => p.asg.statut_agent === 'BLOQUÉE').length,
      terminees: pairs.filter((p) => p.asg.statut_agent === 'TERMINÉE').length,
      validees: pairs.filter((p) => p.task.statut_global === 'VALIDÉE').length,
      en_retard: pairs.filter(
        (p) =>
          Boolean(p.task.date_fin_prevue) &&
          p.task.date_fin_prevue < todayIso &&
          p.asg.statut_agent !== 'TERMINÉE' &&
          !CLOSED_STATUSES.includes(p.task.statut_global)
      ).length,
      cr_soumis: agReports.length,
      cr_en_attente: agReports.filter((r) => r.validation === 'EN_ATTENTE').length,
      cr_valides: agReports.filter((r) => r.validation === 'VALIDÉ').length,
      cr_refuses: agReports.filter((r) => r.validation === 'REFUSÉ').length,
      temps_moyen_minutes: avgMin,
      complexite: {
        urgentes: pairs.filter((p) => p.task.priorite === 'URGENTE').length,
        collectives: pairs.filter((p) => p.task.assignments.length >= 2).length,
        individuelles: pairs.filter((p) => p.task.assignments.length <= 1).length,
        complexes: pairs.filter(
          (p) =>
            COMPLEX_CATEGORIES.has(p.task.categorie.toUpperCase()) ||
            p.task.assignments.length >= 2
        ).length,
        simples: pairs.filter(
          (p) =>
            !COMPLEX_CATEGORIES.has(p.task.categorie.toUpperCase()) &&
            p.task.assignments.length < 2
        ).length,
      },
      timeline: pairs
        .map((p) => ({
          id: p.asg.assignment_id,
          date:
            p.asg.date_fin ||
            p.asg.date_debut ||
            p.asg.date_acceptation ||
            p.asg.date_affectation,
          task_id: p.task.task_id,
          numero_tache: p.task.numero_tache,
          titre: p.task.titre,
          priorite: p.task.priorite,
          statut: `${p.asg.statut_agent} (${p.task.statut_global})`,
          detail: `${p.task.commune} · ${p.task.dp}`,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  });
}

export const DashboardStatsPage: React.FC<DashboardStatsPageProps> = ({
  tasks,
  reports,
  agents,
  params,
  onNavigate,
}) => {
  const { user, isOnline } = useAuth();
  const isChef = user?.role === 'CHEF';

  const [subTab, setSubTab] = useState<StatsSubTab>('INDICATORS');
  const [filters, setFilters] = useState<DashboardFilterParams>({
    granularity: 'day',
  });

  const [dashboard, setDashboard] = useState<DashboardStatsDTO | null>(null);
  const [agentTrackingList, setAgentTrackingList] = useState<AgentTrackingDTO[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(user?.agent_id || '');
  const [selectedMapTaskId, setSelectedMapTaskId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const communes = useMemo(
    () =>
      Array.from(
        new Set([
          ...params.filter((p) => p.categorie === 'COMMUNE' && p.actif).map((p) => p.valeur),
          ...tasks.map((t) => t.commune).filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [params, tasks]
  );

  const dps = useMemo(
    () =>
      Array.from(
        new Set([
          ...params.filter((p) => p.categorie === 'DP' && p.actif).map((p) => p.valeur),
          ...tasks.map((t) => t.dp).filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [params, tasks]
  );

  const categories = useMemo(
    () => params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX' && p.actif),
    [params]
  );

  const loadStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg('');

    if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setDashboard(computeOfflineDashboardFallback(tasks, reports, agents, params, filters));
      setAgentTrackingList(computeOfflineAgentsFallback(user, agents, tasks, reports));
      setLoading(false);
      return;
    }

    try {
      const [dashRes, agentRes] = await Promise.all([
        apiClient.getDashboardStats(filters),
        apiClient.getAgentStatistics({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        }),
      ]);
      setDashboard(dashRes);
      setAgentTrackingList(agentRes.agents);
      if (agentRes.agents.length > 0 && !selectedAgentId) {
        setSelectedAgentId(agentRes.agents[0].agent_id);
      }
      if (dashRes.mapPoints.length > 0 && !selectedMapTaskId) {
        setSelectedMapTaskId(dashRes.mapPoints[0].task_id);
      }
    } catch (err) {
      setDashboard(computeOfflineDashboardFallback(tasks, reports, agents, params, filters));
      setAgentTrackingList(computeOfflineAgentsFallback(user, agents, tasks, reports));
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [user, isOnline, filters, tasks, reports, agents, params, selectedAgentId, selectedMapTaskId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const activeDashboard = useMemo(
    () => dashboard || computeOfflineDashboardFallback(tasks, reports, agents, params, filters),
    [dashboard, tasks, reports, agents, params, filters]
  );

  const selectedAgentProfile = useMemo(() => {
    if (agentTrackingList.length === 0) return null;
    return (
      agentTrackingList.find((a) => a.agent_id === selectedAgentId) || agentTrackingList[0]
    );
  }, [agentTrackingList, selectedAgentId]);

  const selectedMapPoint = useMemo(() => {
    if (activeDashboard.mapPoints.length === 0) return null;
    return (
      activeDashboard.mapPoints.find((p) => p.task_id === selectedMapTaskId) ||
      activeDashboard.mapPoints[0]
    );
  }, [activeDashboard.mapPoints, selectedMapTaskId]);

  const resetFilters = () => {
    setFilters({ granularity: 'day' });
  };

  const maxCategoryCount = Math.max(1, ...activeDashboard.byCategory.map((c) => c.count));
  const maxCommuneCount = Math.max(1, ...activeDashboard.byCommune.map((c) => c.count));
  const maxDpCount = Math.max(1, ...activeDashboard.byDp.map((d) => d.count));
  const maxAgentAssigned = Math.max(1, ...activeDashboard.byAgent.map((a) => a.totalAssigned));
  const maxEvolutionVal = Math.max(
    1,
    ...activeDashboard.evolution.map((e) => Math.max(e.created, e.completed, e.validated))
  );

  const prioTotal = Math.max(
    1,
    activeDashboard.byPriority.reduce((s, p) => s + p.count, 0)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Statistiques & Pilotage du District
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Indicateurs temps réel, graphiques multi-critères, suivi individuel et carte terrain.
          </p>
        </div>

        <div className="inline-flex rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('INDICATORS')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'INDICATORS'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Indicateurs & Graphiques</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('AGENTS')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'AGENTS'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Suivi individuel</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('MAP')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'MAP'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <MapPin className="h-4 w-4" />
            <span>Carte GPS ({activeDashboard.mapPoints.length})</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          {errorMsg}
        </div>
      )}

      {/* Filtres combinables */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            <Filter className="h-4 w-4 text-[#0055A4]" />
            <span>Filtres combinables</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Réinitialiser</span>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Du</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Au</label>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Commune</label>
            <select
              value={filters.commune || ''}
              onChange={(e) => setFilters((f) => ({ ...f, commune: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes communes</option>
              {communes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">DP</label>
            <select
              value={filters.dp || ''}
              onChange={(e) => setFilters((f) => ({ ...f, dp: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes DP</option>
              {dps.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Catégorie</label>
            <select
              value={filters.categorie || ''}
              onChange={(e) => setFilters((f) => ({ ...f, categorie: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes catégories</option>
              {categories.map((cat) => (
                <option key={cat.param_id} value={cat.valeur}>
                  {cat.valeur} — {cat.libelle}
                </option>
              ))}
            </select>
          </div>
          {isChef && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Agent</label>
              <select
                value={filters.agentId || ''}
                onChange={(e) => setFilters((f) => ({ ...f, agentId: e.target.value || undefined }))}
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Tous les agents</option>
                {agents.map((ag) => (
                  <option key={ag.agent_id} value={ag.agent_id}>
                    {ag.prenom} {ag.nom} ({ag.matricule})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Priorité</label>
            <select
              value={filters.priorite || ''}
              onChange={(e) => setFilters((f) => ({ ...f, priorite: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes priorités</option>
              <option value="URGENTE">Urgente</option>
              <option value="HAUTE">Haute</option>
              <option value="NORMALE">Normale</option>
              <option value="BASSE">Basse</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Statut</label>
            <select
              value={filters.statut || ''}
              onChange={(e) => setFilters((f) => ({ ...f, statut: e.target.value || undefined }))}
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Tous statuts</option>
              <option value="NOUVELLE">Nouvelle</option>
              <option value="TRANSMISE">Transmise</option>
              <option value="ACCEPTÉE">Acceptée</option>
              <option value="EN COURS">En cours</option>
              <option value="EN ATTENTE">En attente</option>
              <option value="BLOQUÉE">Bloquée</option>
              <option value="TERMINÉE">Terminée</option>
              <option value="À VALIDER">À valider</option>
              <option value="VALIDÉE">Validée</option>
              <option value="REFUSÉE">Refusée</option>
              <option value="ANNULÉE">Annulée</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Granularité évolution
            </label>
            <select
              value={filters.granularity || 'day'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  granularity: e.target.value as 'day' | 'week' | 'month',
                }))
              }
              className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="day">Par jour</option>
              <option value="week">Par semaine</option>
              <option value="month">Par mois</option>
            </select>
          </div>
        </div>
      </section>

      {subTab === 'INDICATORS' && (
        <div className="space-y-5">
          {/* 12+ KPI officiels en temps réel */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Total tâches', value: activeDashboard.kpis.total, accent: 'text-slate-900 dark:text-white' },
              { label: 'Transmises / Acc.', value: activeDashboard.kpis.transmise + activeDashboard.kpis.acceptee, accent: 'text-[#0055A4] dark:text-blue-400' },
              { label: 'En cours', value: activeDashboard.kpis.en_cours, accent: 'text-blue-700 dark:text-blue-400' },
              { label: 'En attente', value: activeDashboard.kpis.en_attente, accent: 'text-amber-700 dark:text-amber-400' },
              { label: 'Bloquées', value: activeDashboard.kpis.bloquee, accent: 'text-red-700 dark:text-red-400' },
              { label: 'En retard', value: activeDashboard.kpis.en_retard, accent: 'text-red-700 dark:text-red-400' },
              { label: 'Terminées', value: activeDashboard.kpis.terminee, accent: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'CR à valider', value: activeDashboard.kpis.cr_a_valider, accent: 'text-amber-700 dark:text-amber-400' },
              { label: 'Validées', value: activeDashboard.kpis.validee, accent: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Refusées', value: activeDashboard.kpis.refusee, accent: 'text-red-700 dark:text-red-400' },
              { label: 'Annulées', value: activeDashboard.kpis.annulee, accent: 'text-slate-500 dark:text-slate-400' },
              { label: 'CR validés', value: activeDashboard.kpis.cr_valides, accent: 'text-emerald-700 dark:text-emerald-400' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </p>
                <p className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${kpi.accent}`}>
                  {loading ? '—' : kpi.value}
                </p>
              </div>
            ))}
          </section>

          {/* Évolution temporelle (SVG interactif lisible) */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Évolution de l&apos;activité ({filters.granularity === 'month' ? 'Mensuelle' : filters.granularity === 'week' ? 'Hebdomadaire' : 'Quotidienne'})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Comparaison entre interventions planifiées, terminées et validées.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#0055A4]" /> Planifiées
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#F7941D]" /> Terminées
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Validées
                </span>
              </div>
            </div>

            {activeDashboard.evolution.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Aucune donnée sur la période sélectionnée.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[540px]">
                  <svg
                    viewBox="0 0 760 220"
                    className="w-full h-52"
                    role="img"
                    aria-label="Graphique d'évolution des interventions"
                  >
                    {[0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = 180 - ratio * 150;
                      return (
                        <g key={ratio}>
                          <line
                            x1="40"
                            y1={y}
                            x2="740"
                            y2={y}
                            stroke="currentColor"
                            className="text-slate-200 dark:text-slate-800"
                            strokeDasharray="3 3"
                          />
                          <text
                            x="6"
                            y={y + 4}
                            fontSize="10"
                            fill="currentColor"
                            className="text-slate-400 font-mono"
                          >
                            {Math.round(maxEvolutionVal * ratio)}
                          </text>
                        </g>
                      );
                    })}
                    <line
                      x1="40"
                      y1="180"
                      x2="740"
                      y2="180"
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700"
                    />
                    {activeDashboard.evolution.map((pt, idx) => {
                      const groupW = 700 / activeDashboard.evolution.length;
                      const xBase = 48 + idx * groupW;
                      const barW = Math.min(14, Math.max(6, (groupW - 12) / 3));
                      const hCreated = (pt.created / maxEvolutionVal) * 150;
                      const hCompleted = (pt.completed / maxEvolutionVal) * 150;
                      const hValidated = (pt.validated / maxEvolutionVal) * 150;
                      return (
                        <g key={pt.bucket}>
                          <rect
                            x={xBase}
                            y={180 - hCreated}
                            width={barW}
                            height={Math.max(2, hCreated)}
                            fill="#0055A4"
                            rx="2"
                          >
                            <title>{`${pt.label} · Planifiées : ${pt.created}`}</title>
                          </rect>
                          <rect
                            x={xBase + barW + 2}
                            y={180 - hCompleted}
                            width={barW}
                            height={Math.max(2, hCompleted)}
                            fill="#F7941D"
                            rx="2"
                          >
                            <title>{`${pt.label} · Terminées : ${pt.completed}`}</title>
                          </rect>
                          <rect
                            x={xBase + (barW + 2) * 2}
                            y={180 - hValidated}
                            width={barW}
                            height={Math.max(2, hValidated)}
                            fill="#059669"
                            rx="2"
                          >
                            <title>{`${pt.label} · Validées : ${pt.validated}`}</title>
                          </rect>
                          <text
                            x={xBase + barW * 1.5}
                            y="198"
                            textAnchor="middle"
                            fontSize="10"
                            fill="currentColor"
                            className="text-slate-500 font-mono"
                          >
                            {pt.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}
          </section>

          {/* Répartitions par Catégorie, Priorité, Commune, DP et Agent */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Par catégorie */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Répartition par catégorie de travaux
              </h3>
              <div className="mt-4 space-y-3">
                {activeDashboard.byCategory.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucune donnée.</p>
                ) : (
                  activeDashboard.byCategory.map((cat) => (
                    <div key={cat.code} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          <span className="font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                            {cat.code}
                          </span>{' '}
                          · {cat.libelle}
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white shrink-0 ml-2">
                          {cat.count}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-[#0055A4]"
                          style={{ width: `${Math.round((cat.count / maxCategoryCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Par priorité & DP */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Répartition par priorité
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {activeDashboard.byPriority.map((p) => {
                    const pct = Math.round((p.count / prioTotal) * 100);
                    return (
                      <div
                        key={p.priorite}
                        className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                      >
                        <div className="flex items-center justify-between">
                          <PriorityLabel priorite={p.priorite} />
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            {pct}%
                          </span>
                        </div>
                        <p className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                          {p.count}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Par Distribution Publique (DP)
                </h4>
                <div className="mt-3 space-y-2.5">
                  {activeDashboard.byDp.map((d) => (
                    <div key={d.dp} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {d.dp}
                        </span>
                        <span className="font-mono text-xs text-slate-600 tabular-nums dark:text-slate-400">
                          {d.count} total · {d.activeCount} actives
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-[#F7941D]"
                          style={{ width: `${Math.round((d.count / maxDpCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Par commune */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Répartition par commune
              </h3>
              <div className="mt-4 space-y-3">
                {activeDashboard.byCommune.map((c) => (
                  <div key={c.commune} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {c.commune}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {c.count} ({c.overdueCount} en retard)
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.round((c.count / maxCommuneCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Charge & avancement par agent */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Volume et avancement par agent
              </h3>
              <div className="mt-4 space-y-3">
                {activeDashboard.byAgent.map((ag) => (
                  <div key={ag.agent_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {ag.prenom} {ag.nom}{' '}
                        <span className="font-mono text-slate-400">({ag.matricule})</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {ag.totalAssigned} aff. · {ag.validated} val. · {ag.blocked} bloq.
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[#0055A4]"
                        style={{
                          width: `${Math.round((ag.totalAssigned / maxAgentAssigned) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Drilldown tâches en retard */}
          {activeDashboard.overdueTasks.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900/50 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    Alertes tâches en retard ({activeDashboard.overdueTasks.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('planning')}
                  className="text-xs font-semibold text-[#0055A4] hover:underline dark:text-blue-400"
                >
                  Replanifier dans le Planning
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">N° Tâche</th>
                      <th className="py-2 pr-3">Intervention</th>
                      <th className="py-2 pr-3">Commune / DP</th>
                      <th className="py-2 pr-3">Échéance</th>
                      <th className="py-2 pr-3">Priorité</th>
                      <th className="py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeDashboard.overdueTasks.map((ot) => (
                      <tr key={ot.task_id}>
                        <td className="py-2 pr-3 font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                          {ot.numero_tache}
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">
                          {ot.titre}
                        </td>
                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                          {ot.commune} · {ot.dp}
                        </td>
                        <td className="py-2 pr-3 font-mono text-red-700 dark:text-red-400">
                          {formatDateFr(ot.date_fin_prevue)}
                        </td>
                        <td className="py-2 pr-3">
                          <PriorityLabel priorite={ot.priorite} />
                        </td>
                        <td className="py-2">
                          <TaskStatusLabel statut={ot.statut_global} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {subTab === 'AGENTS' && (
        <div className="space-y-5">
          {isChef && agentTrackingList.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Sélectionner l&apos;agent à analyser
              </label>
              <select
                value={selectedAgentProfile?.agent_id || ''}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="min-h-[44px] w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {agentTrackingList.map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>
                    {a.prenom} {a.nom} ({a.matricule}) — {a.total_affectees} tâche(s)
                  </option>
                ))}
              </select>
            </section>
          )}

          {selectedAgentProfile ? (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                        {selectedAgentProfile.prenom} {selectedAgentProfile.nom}
                      </h3>
                      <span className="font-mono text-xs font-semibold text-[#0055A4] dark:text-blue-400">
                        {selectedAgentProfile.matricule}
                      </span>
                      <AgentStatusLabel statut={selectedAgentProfile.statut} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {selectedAgentProfile.fonction} · Tél : {selectedAgentProfile.telephone || '—'} ·
                      Dernière connexion : {formatDateTimeFr(selectedAgentProfile.derniere_connexion)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-slate-500">Temps moyen déclaré</p>
                    <p className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
                      {selectedAgentProfile.temps_moyen_minutes} min
                    </p>
                  </div>
                </div>

                {/* Compteurs d'activité */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {[
                    { label: 'Affectées', val: selectedAgentProfile.total_affectees },
                    { label: 'En cours', val: selectedAgentProfile.en_cours },
                    { label: 'En attente', val: selectedAgentProfile.en_attente },
                    { label: 'Bloquées', val: selectedAgentProfile.bloquees },
                    { label: 'Terminées', val: selectedAgentProfile.terminees },
                    { label: 'Validées', val: selectedAgentProfile.validees },
                    { label: 'En retard', val: selectedAgentProfile.en_retard },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="text-[11px] text-slate-500">{item.label}</p>
                      <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                        {item.val}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Distinction explicite de complexité et contexte terrain */}
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Contexte & Complexité des interventions réalisées
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Ventilation objective de la charge terrain (sans score simpliste basé uniquement
                    sur le volume).
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div>
                      <p className="text-[11px] text-slate-500">Urgentes</p>
                      <p className="font-mono text-lg font-bold text-red-700 tabular-nums dark:text-red-400">
                        {selectedAgentProfile.complexite.urgentes}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Collectives (≥2)</p>
                      <p className="font-mono text-lg font-bold text-[#0055A4] tabular-nums dark:text-blue-400">
                        {selectedAgentProfile.complexite.collectives}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Individuelles</p>
                      <p className="font-mono text-lg font-bold text-slate-800 tabular-nums dark:text-slate-200">
                        {selectedAgentProfile.complexite.individuelles}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Complexes</p>
                      <p className="font-mono text-lg font-bold text-amber-700 tabular-nums dark:text-amber-400">
                        {selectedAgentProfile.complexite.complexes}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Courantes / Simples</p>
                      <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                        {selectedAgentProfile.complexite.simples}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Chronologie détaillée */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h4 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Chronologie d&apos;activité ({selectedAgentProfile.timeline.length})
                </h4>
                {selectedAgentProfile.timeline.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Aucun événement enregistré sur la période.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedAgentProfile.timeline.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                              {item.numero_tache}
                            </span>
                            <PriorityLabel priorite={item.priorite} />
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {item.statut}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                            {item.titre}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500 shrink-0">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDateTimeFr(item.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Aucun agent trouvé.
            </div>
          )}
        </div>
      )}

      {subTab === 'MAP' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Points d&apos;intervention GPS ({activeDashboard.mapPoints.length})
            </h3>
            {activeDashboard.mapPoints.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                Aucune tâche avec coordonnées GPS (latitude / longitude) sur les filtres actifs.
              </p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {activeDashboard.mapPoints.map((pt) => {
                  const selected = selectedMapPoint?.task_id === pt.task_id;
                  return (
                    <button
                      key={pt.task_id}
                      type="button"
                      onClick={() => setSelectedMapTaskId(pt.task_id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[#0055A4] bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                          {pt.numero_tache}
                        </span>
                        <PriorityLabel priorite={pt.priorite} />
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                        {pt.titre}
                      </p>
                      <p className="text-xs text-slate-500">
                        {pt.commune} · {pt.dp}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
            {selectedMapPoint ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <Compass className="h-4 w-4 text-[#0055A4]" />
                      <span className="font-mono font-semibold text-[#0055A4] dark:text-blue-400">
                        {selectedMapPoint.numero_tache}
                      </span>
                      <TaskStatusLabel statut={selectedMapPoint.statut_global} />
                    </div>
                    <h4 className="mt-0.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                      {selectedMapPoint.titre}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {selectedMapPoint.adresse || selectedMapPoint.commune} · GPS :{' '}
                      <span className="font-mono">
                        {selectedMapPoint.latitude.toFixed(5)}, {selectedMapPoint.longitude.toFixed(5)}
                      </span>
                    </p>
                  </div>

                  <a
                    href={`https://www.google.com/maps?q=${selectedMapPoint.latitude},${selectedMapPoint.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3 py-2 text-xs font-medium text-white hover:bg-[#004485] whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Itinéraire GPS</span>
                  </a>
                </div>

                {isOnline ? (
                  <iframe
                    title={`Carte ${selectedMapPoint.numero_tache}`}
                    className="h-[360px] w-full rounded-lg border border-slate-200 dark:border-slate-800"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                      selectedMapPoint.longitude - 0.015
                    }%2C${selectedMapPoint.latitude - 0.015}%2C${
                      selectedMapPoint.longitude + 0.015
                    }%2C${selectedMapPoint.latitude + 0.015}&layer=mapnik&marker=${
                      selectedMapPoint.latitude
                    }%2C${selectedMapPoint.longitude}`}
                  />
                ) : (
                  <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                    Carte OpenStreetMap indisponible hors connexion. Coordonnées enregistrées :{' '}
                    {selectedMapPoint.latitude.toFixed(5)}, {selectedMapPoint.longitude.toFixed(5)}.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
                Sélectionnez une intervention géolocalisée pour afficher sa position sur Sidi Ali.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

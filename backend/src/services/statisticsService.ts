import type {
  AgentRecord,
  AgentStatus,
  HistoryRecord,
  ReportRecord,
  TaskPriority,
  TaskStatus,
  TaskWithAssignmentsDTO,
  UserRole,
} from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { formatIsoDateToFr, todayAlgiersIso } from '../utils/dateAlgiers.js';
import { TaskService } from './taskService.js';

export interface DashboardFilterParams {
  dateFrom?: string;
  dateTo?: string;
  commune?: string;
  dp?: string;
  categorie?: string;
  agentId?: string;
  priorite?: string;
  statut?: string;
  granularity?: 'day' | 'week' | 'month';
}

export interface DashboardStatsResponse {
  today_iso: string;
  kpis: {
    total: number;
    nouvelle: number;
    transmise: number;
    acceptee: number;
    en_cours: number;
    en_attente: number;
    bloquee: number;
    terminee: number;
    a_valider: number;
    validee: number;
    refusee: number;
    annulee: number;
    en_retard: number;
    cr_a_valider: number;
    cr_valides: number;
    cr_refuses: number;
  };
  byCategory: Array<{
    code: string;
    libelle: string;
    count: number;
    urgentCount: number;
    validatedCount: number;
  }>;
  byCommune: Array<{
    commune: string;
    count: number;
    activeCount: number;
    overdueCount: number;
  }>;
  byDp: Array<{
    dp: string;
    count: number;
    activeCount: number;
    overdueCount: number;
  }>;
  byPriority: Array<{
    priorite: TaskPriority;
    count: number;
  }>;
  byAgent: Array<{
    agent_id: string;
    matricule: string;
    nom: string;
    prenom: string;
    totalAssigned: number;
    inProgress: number;
    completed: number;
    validated: number;
    blocked: number;
    overdue: number;
  }>;
  evolution: Array<{
    bucket: string;
    label: string;
    created: number;
    completed: number;
    validated: number;
  }>;
  overdueTasks: Array<{
    task_id: string;
    numero_tache: string;
    titre: string;
    commune: string;
    dp: string;
    priorite: TaskPriority;
    statut_global: TaskStatus;
    date_fin_prevue: string;
    agents: string;
  }>;
  mapPoints: Array<{
    task_id: string;
    numero_tache: string;
    titre: string;
    commune: string;
    dp: string;
    adresse: string;
    priorite: TaskPriority;
    statut_global: TaskStatus;
    latitude: number;
    longitude: number;
  }>;
}

export interface AgentTimelineItem {
  id: string;
  date: string;
  task_id: string;
  numero_tache: string;
  titre: string;
  priorite: TaskPriority;
  statut: string;
  detail: string;
}

export interface AgentTrackingDTO {
  agent_id: string;
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: string;
  role: UserRole;
  statut: AgentStatus;
  derniere_connexion: string;
  total_affectees: number;
  transmises: number;
  acceptees: number;
  en_cours: number;
  en_attente: number;
  bloquees: number;
  terminees: number;
  validees: number;
  en_retard: number;
  cr_soumis: number;
  cr_en_attente: number;
  cr_valides: number;
  cr_refuses: number;
  temps_moyen_minutes: number;
  complexite: {
    urgentes: number;
    collectives: number;
    individuelles: number;
    complexes: number;
    simples: number;
  };
  timeline: AgentTimelineItem[];
}

const CLOSED_STATUSES: TaskStatus[] = ['TERMINÉE', 'À VALIDER', 'VALIDÉE', 'ANNULÉE'];
const COMPLEX_CATEGORIES = new Set(['FUG', 'ING', 'VAN', 'OUV', 'RSF', 'PUR', 'CPM']);

function getWeekBucket(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd.slice(0, 10);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
}

function getBucketKey(dateStr: string, granularity: 'day' | 'week' | 'month'): string {
  const ymd = dateStr.slice(0, 10);
  if (granularity === 'month') return ymd.slice(0, 7);
  if (granularity === 'week') return getWeekBucket(ymd);
  return ymd;
}

function formatBucketLabel(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'day') return formatIsoDateToFr(bucket);
  if (granularity === 'month') {
    const [y, m] = bucket.split('-');
    return m && y ? `${m}/${y}` : bucket;
  }
  return bucket;
}

function isTaskComplex(task: TaskWithAssignmentsDTO, reports: ReportRecord[]): boolean {
  if (COMPLEX_CATEGORIES.has(task.categorie.toUpperCase())) return true;
  if (task.assignments.length >= 2) return true;
  const taskReports = reports.filter((r) => r.task_id === task.task_id);
  return taskReports.some((r) => r.version > 1);
}

export class StatisticsService {
  private readonly taskService: TaskService;

  constructor(private readonly repo: IDataRepository) {
    this.taskService = new TaskService(repo);
  }

  private filterTasks(
    tasks: TaskWithAssignmentsDTO[],
    filters: DashboardFilterParams
  ): TaskWithAssignmentsDTO[] {
    return tasks.filter((t) => {
      const refDate = (t.date_debut_prevue || t.date_creation).slice(0, 10);
      if (filters.dateFrom && refDate < filters.dateFrom) return false;
      if (filters.dateTo && refDate > filters.dateTo) return false;
      if (filters.commune && t.commune !== filters.commune) return false;
      if (filters.dp && t.dp !== filters.dp) return false;
      if (filters.categorie && t.categorie !== filters.categorie) return false;
      if (filters.priorite && t.priorite !== filters.priorite) return false;
      if (filters.statut && t.statut_global !== filters.statut) return false;
      if (
        filters.agentId &&
        !t.assignments.some((a) => a.agent_id === filters.agentId)
      ) {
        return false;
      }
      return true;
    });
  }

  async getDashboardStats(
    filters: DashboardFilterParams = {}
  ): Promise<DashboardStatsResponse> {
    const [allTasks, allReports, agents, params] = await Promise.all([
      this.taskService.listAllTasks(),
      this.repo.listReports(),
      this.repo.listAgents(),
      this.repo.listParameters(),
    ]);

    const todayIso = todayAlgiersIso();
    const tasks = this.filterTasks(allTasks, filters);
    const taskIds = new Set(tasks.map((t) => t.task_id));
    const filteredReports = allReports.filter((r) => taskIds.has(r.task_id));

    const categoryMap = new Map<string, string>();
    for (const p of params) {
      if (p.categorie === 'CATEGORIE_TRAVAUX') {
        categoryMap.set(p.valeur, p.libelle);
      }
    }

    const isOverdue = (t: TaskWithAssignmentsDTO) =>
      Boolean(t.date_fin_prevue) &&
      t.date_fin_prevue < todayIso &&
      !CLOSED_STATUSES.includes(t.statut_global);

    const kpis = {
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
    };

    // Par catégorie
    const catAgg = new Map<
      string,
      { code: string; libelle: string; count: number; urgentCount: number; validatedCount: number }
    >();
    for (const t of tasks) {
      const prev = catAgg.get(t.categorie) || {
        code: t.categorie,
        libelle: categoryMap.get(t.categorie) || t.categorie,
        count: 0,
        urgentCount: 0,
        validatedCount: 0,
      };
      prev.count += 1;
      if (t.priorite === 'URGENTE') prev.urgentCount += 1;
      if (t.statut_global === 'VALIDÉE') prev.validatedCount += 1;
      catAgg.set(t.categorie, prev);
    }

    // Par commune
    const comAgg = new Map<
      string,
      { commune: string; count: number; activeCount: number; overdueCount: number }
    >();
    for (const t of tasks) {
      const key = t.commune || 'Non précisée';
      const prev = comAgg.get(key) || {
        commune: key,
        count: 0,
        activeCount: 0,
        overdueCount: 0,
      };
      prev.count += 1;
      if (!CLOSED_STATUSES.includes(t.statut_global)) prev.activeCount += 1;
      if (isOverdue(t)) prev.overdueCount += 1;
      comAgg.set(key, prev);
    }

    // Par DP
    const dpAgg = new Map<
      string,
      { dp: string; count: number; activeCount: number; overdueCount: number }
    >();
    for (const t of tasks) {
      const key = t.dp || 'Non précisée';
      const prev = dpAgg.get(key) || { dp: key, count: 0, activeCount: 0, overdueCount: 0 };
      prev.count += 1;
      if (!CLOSED_STATUSES.includes(t.statut_global)) prev.activeCount += 1;
      if (isOverdue(t)) prev.overdueCount += 1;
      dpAgg.set(key, prev);
    }

    // Par priorité
    const prioOrder: TaskPriority[] = ['URGENTE', 'HAUTE', 'NORMALE', 'BASSE'];
    const byPriority = prioOrder.map((priorite) => ({
      priorite,
      count: tasks.filter((t) => t.priorite === priorite).length,
    }));

    // Par agent
    const byAgent = agents
      .filter((a) => !filters.agentId || a.agent_id === filters.agentId)
      .map((ag) => {
        const assignedTasks = tasks.filter((t) =>
          t.assignments.some((asg) => asg.agent_id === ag.agent_id)
        );
        const inProgress = assignedTasks.filter((t) => {
          const mine = t.assignments.find((asg) => asg.agent_id === ag.agent_id);
          return mine?.statut_agent === 'EN COURS' || mine?.statut_agent === 'ACCEPTÉE';
        }).length;
        const completed = assignedTasks.filter((t) => {
          const mine = t.assignments.find((asg) => asg.agent_id === ag.agent_id);
          return mine?.statut_agent === 'TERMINÉE' || t.statut_global === 'VALIDÉE';
        }).length;
        const validated = assignedTasks.filter((t) => t.statut_global === 'VALIDÉE').length;
        const blocked = assignedTasks.filter((t) => {
          const mine = t.assignments.find((asg) => asg.agent_id === ag.agent_id);
          return mine?.statut_agent === 'BLOQUÉE';
        }).length;
        const overdue = assignedTasks.filter(isOverdue).length;

        return {
          agent_id: ag.agent_id,
          matricule: ag.matricule,
          nom: ag.nom,
          prenom: ag.prenom,
          totalAssigned: assignedTasks.length,
          inProgress,
          completed,
          validated,
          blocked,
          overdue,
        };
      })
      .filter((item) => item.totalAssigned > 0 || agents.length <= 15)
      .sort((a, b) => b.totalAssigned - a.totalAssigned);

    // Évolution quotidienne / hebdomadaire / mensuelle
    const granularity = filters.granularity || 'day';
    const evoMap = new Map<
      string,
      { bucket: string; label: string; created: number; completed: number; validated: number }
    >();
    const touchBucket = (rawDate: string) => {
      if (!rawDate) return null;
      const bucket = getBucketKey(rawDate, granularity);
      let row = evoMap.get(bucket);
      if (!row) {
        row = {
          bucket,
          label: formatBucketLabel(bucket, granularity),
          created: 0,
          completed: 0,
          validated: 0,
        };
        evoMap.set(bucket, row);
      }
      return row;
    };

    for (const t of tasks) {
      const cBucket = touchBucket(t.date_debut_prevue || t.date_creation);
      if (cBucket) cBucket.created += 1;
      if (
        t.statut_global === 'TERMINÉE' ||
        t.statut_global === 'À VALIDER' ||
        t.statut_global === 'VALIDÉE'
      ) {
        const doneBucket = touchBucket(t.updated_at || t.date_fin_prevue);
        if (doneBucket) doneBucket.completed += 1;
      }
      if (t.statut_global === 'VALIDÉE') {
        const valBucket = touchBucket(t.updated_at || t.date_fin_prevue);
        if (valBucket) valBucket.validated += 1;
      }
    }

    const evolution = Array.from(evoMap.values())
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .slice(-14);

    const overdueTasks = tasks
      .filter(isOverdue)
      .sort((a, b) => a.date_fin_prevue.localeCompare(b.date_fin_prevue))
      .slice(0, 20)
      .map((t) => ({
        task_id: t.task_id,
        numero_tache: t.numero_tache,
        titre: t.titre,
        commune: t.commune,
        dp: t.dp,
        priorite: t.priorite,
        statut_global: t.statut_global,
        date_fin_prevue: t.date_fin_prevue,
        agents: t.assignments
          .map((a) => `${a.agent_prenom} ${a.agent_nom}`.trim())
          .join(', '),
      }));

    const mapPoints = tasks
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
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return {
      today_iso: todayIso,
      kpis,
      byCategory: Array.from(catAgg.values()).sort((a, b) => b.count - a.count),
      byCommune: Array.from(comAgg.values()).sort((a, b) => b.count - a.count),
      byDp: Array.from(dpAgg.values()).sort((a, b) => b.count - a.count),
      byPriority,
      byAgent,
      evolution,
      overdueTasks,
      mapPoints,
    };
  }

  async getAgentTrackingList(
    actor: AgentRecord,
    filters: { dateFrom?: string; dateTo?: string; agentId?: string } = {}
  ): Promise<AgentTrackingDTO[]> {
    const [allAgents, allTasks, allReports, allHistory] = await Promise.all([
      this.repo.listAgents(),
      this.taskService.listAllTasks(),
      this.repo.listReports(),
      this.repo.listHistory({ limit: 500 }),
    ]);

    const todayIso = todayAlgiersIso();
    const visibleAgents =
      actor.role === 'CHEF'
        ? allAgents.filter((a) => !filters.agentId || a.agent_id === filters.agentId)
        : allAgents.filter((a) => a.agent_id === actor.agent_id);

    const filteredTasks = this.filterTasks(allTasks, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });

    return visibleAgents.map((ag) => {
      const assignedPairs = filteredTasks
        .map((task) => {
          const asg = task.assignments.find((a) => a.agent_id === ag.agent_id);
          return asg ? { task, asg } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const agentReports = allReports.filter((r) => r.agent_id === ag.agent_id);
      const taskMap = new Map(allTasks.map((t) => [t.task_id, t]));

      let transmises = 0;
      let acceptees = 0;
      let en_cours = 0;
      let en_attente = 0;
      let bloquees = 0;
      let terminees = 0;
      let validees = 0;
      let en_retard = 0;

      let urgentes = 0;
      let collectives = 0;
      let individuelles = 0;
      let complexes = 0;
      let simples = 0;

      for (const { task, asg } of assignedPairs) {
        if (asg.statut_agent === 'TRANSMISE') transmises += 1;
        if (asg.statut_agent === 'ACCEPTÉE') acceptees += 1;
        if (asg.statut_agent === 'EN COURS') en_cours += 1;
        if (asg.statut_agent === 'EN ATTENTE') en_attente += 1;
        if (asg.statut_agent === 'BLOQUÉE') bloquees += 1;
        if (asg.statut_agent === 'TERMINÉE') terminees += 1;
        if (task.statut_global === 'VALIDÉE') validees += 1;

        if (
          task.date_fin_prevue &&
          task.date_fin_prevue < todayIso &&
          asg.statut_agent !== 'TERMINÉE' &&
          !CLOSED_STATUSES.includes(task.statut_global)
        ) {
          en_retard += 1;
        }

        if (task.priorite === 'URGENTE') urgentes += 1;
        if (task.assignments.length >= 2) {
          collectives += 1;
        } else {
          individuelles += 1;
        }

        if (isTaskComplex(task, allReports)) {
          complexes += 1;
        } else {
          simples += 1;
        }
      }

      const durations = agentReports
        .map((r) => r.temps_passe_minutes)
        .filter((m) => Number.isFinite(m) && m > 0);
      const temps_moyen_minutes =
        durations.length > 0
          ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
          : 0;

      // Chronologie complète : affectations + événements historique liés à ses tâches
      const timelineMap = new Map<string, AgentTimelineItem>();
      for (const { task, asg } of assignedPairs) {
        timelineMap.set(`asg-${asg.assignment_id}`, {
          id: `asg-${asg.assignment_id}`,
          date: asg.date_fin || asg.date_debut || asg.date_acceptation || asg.date_affectation,
          task_id: task.task_id,
          numero_tache: task.numero_tache,
          titre: task.titre,
          priorite: task.priorite,
          statut: `${asg.statut_agent} (Global : ${task.statut_global})`,
          detail: asg.motif_blocage_attente
            ? `Motif : ${asg.motif_blocage_attente}`
            : `${task.commune} · ${task.dp}`,
        });
      }

      for (const h of allHistory) {
        if (h.user_id !== ag.agent_id && !assignedPairs.some((p) => p.task.task_id === h.task_id)) {
          continue;
        }
        const linkedTask = h.task_id ? taskMap.get(h.task_id) : undefined;
        if (!linkedTask) continue;
        timelineMap.set(`hist-${h.history_id}`, {
          id: `hist-${h.history_id}`,
          date: h.date_serveur,
          task_id: linkedTask.task_id,
          numero_tache: linkedTask.numero_tache,
          titre: linkedTask.titre,
          priorite: linkedTask.priorite,
          statut: h.nouvel_etat || h.action,
          detail: h.commentaire || h.action,
        });
      }

      const timeline = Array.from(timelineMap.values())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

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
        total_affectees: assignedPairs.length,
        transmises,
        acceptees,
        en_cours,
        en_attente,
        bloquees,
        terminees,
        validees,
        en_retard,
        cr_soumis: agentReports.length,
        cr_en_attente: agentReports.filter((r) => r.validation === 'EN_ATTENTE').length,
        cr_valides: agentReports.filter((r) => r.validation === 'VALIDÉ').length,
        cr_refuses: agentReports.filter((r) => r.validation === 'REFUSÉ').length,
        temps_moyen_minutes,
        complexite: {
          urgentes,
          collectives,
          individuelles,
          complexes,
          simples,
        },
        timeline,
      };
    });
  }
}

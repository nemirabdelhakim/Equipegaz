import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  Ban,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Compass,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  MapPin,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AuthPhoto } from '../components/AuthPhoto';
import { ConfirmModal } from '../components/ConfirmModal';
import { ExecutionActionModal } from '../components/ExecutionActionModal';
import { ReportModal } from '../components/ReportModal';
import { PriorityLabel, TaskStatusLabel } from '../components/StatusIndicator';
import type {
  AgentAssignmentStatus,
  AgentDTO,
  DistrictParam,
  ReportDTO,
  TaskDTO,
  TaskPriority,
  TaskStatus,
} from '../models/types';
import { ApiError, apiClient, isNetworkError, type CreateTaskPayload } from '../services/apiClient';
import {
  enqueueOfflineStatusTransition,
  enqueueOfflineTaskUpdate,
} from '../services/offlineSyncService';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr, formatDateTimeFr } from '../utils/formatters';

interface TasksPageProps {
  tasks: TaskDTO[];
  reports?: ReportDTO[];
  agents: AgentDTO[];
  params: DistrictParam[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
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

function parseMeta(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const TasksPage: React.FC<TasksPageProps> = ({
  tasks,
  reports = [],
  agents,
  params,
  loading,
  onDataChanged,
}) => {
  const { user, isOnline } = useAuth();
  const isChef = user?.role === 'CHEF';
  const todayIso = getTodayAlgiersIso();

  // Filtres combinables
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCommune, setFilterCommune] = useState('');
  const [filterDp, setFilterDp] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Modales et sélection
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDTO | null>(null);
  const [assignModalTask, setAssignModalTask] = useState<TaskDTO | null>(null);
  const [cancelModalTask, setCancelModalTask] = useState<TaskDTO | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [unassignTarget, setUnassignTarget] = useState<{
    taskId: string;
    agentId: string;
    agentLabel: string;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [execModal, setExecModal] = useState<{
    task: TaskDTO;
    targetStatus: AgentAssignmentStatus;
  } | null>(null);
  const [execError, setExecError] = useState('');
  const [reportModalContext, setReportModalContext] = useState<{
    task: TaskDTO;
    previousReport: ReportDTO | null;
  } | null>(null);

  // Listes de référentiels actifs
  const activeCommunes = useMemo(
    () => params.filter((p) => p.categorie === 'COMMUNE' && p.actif),
    [params]
  );
  const activeDps = useMemo(
    () => params.filter((p) => p.categorie === 'DP' && p.actif),
    [params]
  );
  const activeCategories = useMemo(
    () => params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX' && p.actif),
    [params]
  );
  const activeTeams = useMemo(
    () => params.filter((p) => p.categorie === 'EQUIPE' && p.actif),
    [params]
  );
  const activeAgents = useMemo(
    () => agents.filter((a) => a.statut === 'ACTIF'),
    [agents]
  );

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX')) {
      map.set(c.valeur, c.libelle);
    }
    return map;
  }, [params]);

  // Formulaire tâche
  const [formState, setFormState] = useState<CreateTaskPayload>({
    titre: '',
    categorie: activeCategories[0]?.valeur || 'FUG',
    description: '',
    instructions: '',
    commune: activeCommunes[0]?.libelle || 'Sidi Ali',
    dp: activeDps[0]?.libelle || 'DP Sidi Ali Centre',
    adresse: '',
    repere_geo: '',
    latitude: '',
    longitude: '',
    priorite: 'NORMALE',
    date_debut_prevue: todayIso,
    heure_prevue: '08:30',
    date_fin_prevue: todayIso,
    equipe: '',
    materiel_necessaire: '',
    observations: '',
    assigned_agent_ids: [],
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('');

  // Affectation modale
  const [assignAgentIds, setAssignAgentIds] = useState<string[]>([]);
  const [assignEquipe, setAssignEquipe] = useState('');
  const [assignMode, setAssignMode] = useState<'ADD' | 'REPLACE'>('ADD');

  const selectedTask = useMemo(
    () => tasks.find((t) => t.task_id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q) {
        const hay = [
          t.numero_tache,
          t.titre,
          t.adresse,
          t.description,
          t.repere_geo,
          t.commune,
          t.dp,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterCategory && t.categorie !== filterCategory) return false;
      if (filterCommune && t.commune !== filterCommune) return false;
      if (filterDp && t.dp !== filterDp) return false;
      if (filterPriority && t.priorite !== filterPriority) return false;
      if (filterStatus && t.statut_global !== filterStatus) return false;
      if (filterDate && t.date_debut_prevue !== filterDate) return false;
      if (filterAgent && !t.assignments.some((a) => a.agent_id === filterAgent)) {
        return false;
      }
      return true;
    });
  }, [
    tasks,
    search,
    filterCategory,
    filterCommune,
    filterDp,
    filterPriority,
    filterStatus,
    filterDate,
    filterAgent,
  ]);

  const hasActiveFilters = Boolean(
    search ||
      filterCategory ||
      filterCommune ||
      filterDp ||
      filterAgent ||
      filterPriority ||
      filterStatus ||
      filterDate
  );

  const clearFilters = () => {
    setSearch('');
    setFilterCategory('');
    setFilterCommune('');
    setFilterDp('');
    setFilterAgent('');
    setFilterPriority('');
    setFilterStatus('');
    setFilterDate('');
  };

  const openCreateForm = () => {
    setEditingTask(null);
    setErrorMsg('');
    setGpsStatus('');
    const defaultCommune = activeCommunes[0];
    const matchingDp = defaultCommune
      ? activeDps.find((d) => parseMeta(d.metadata_json).commune_defaut === defaultCommune.valeur)
      : undefined;
    setFormState({
      titre: '',
      categorie: activeCategories[0]?.valeur || 'FUG',
      description: '',
      instructions: '',
      commune: defaultCommune?.libelle || 'Sidi Ali',
      dp: matchingDp?.libelle || activeDps[0]?.libelle || 'DP Sidi Ali Centre',
      adresse: '',
      repere_geo: '',
      latitude: '',
      longitude: '',
      priorite: 'NORMALE',
      date_debut_prevue: todayIso,
      heure_prevue: '08:30',
      date_fin_prevue: todayIso,
      equipe: '',
      materiel_necessaire: '',
      observations: '',
      assigned_agent_ids: [],
    });
    setFormOpen(true);
  };

  const openEditForm = (task: TaskDTO) => {
    setEditingTask(task);
    setErrorMsg('');
    setGpsStatus('');
    setFormState({
      titre: task.titre,
      categorie: task.categorie,
      description: task.description,
      instructions: task.instructions,
      commune: task.commune,
      dp: task.dp,
      adresse: task.adresse,
      repere_geo: task.repere_geo,
      latitude: task.latitude,
      longitude: task.longitude,
      priorite: task.priorite,
      date_debut_prevue: task.date_debut_prevue,
      heure_prevue: task.heure_prevue || '08:30',
      date_fin_prevue: task.date_fin_prevue,
      equipe: task.equipe,
      materiel_necessaire: task.materiel_necessaire,
      observations: task.observations,
      assigned_agent_ids: task.assignments.map((a) => a.agent_id),
    });
    setFormOpen(true);
  };

  const handleCommuneChange = (communeLabel: string) => {
    const matchedCommune = activeCommunes.find((c) => c.libelle === communeLabel);
    const matchedDp = matchedCommune
      ? activeDps.find((d) => parseMeta(d.metadata_json).commune_defaut === matchedCommune.valeur)
      : undefined;
    setFormState((prev) => ({
      ...prev,
      commune: communeLabel,
      dp: matchedDp ? matchedDp.libelle : prev.dp,
    }));
  };

  const handleTeamSelect = (teamLabel: string) => {
    const teamParam = activeTeams.find((t) => t.libelle === teamLabel);
    const meta = teamParam ? parseMeta(teamParam.metadata_json) : {};
    const memberIds = Array.isArray(meta.member_ids)
      ? (meta.member_ids as string[]).filter((id) =>
          activeAgents.some((ag) => ag.agent_id === id)
        )
      : [];
    setFormState((prev) => ({
      ...prev,
      equipe: teamLabel,
      assigned_agent_ids:
        memberIds.length > 0
          ? Array.from(new Set([...prev.assigned_agent_ids, ...memberIds]))
          : prev.assigned_agent_ids,
    }));
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Géolocalisation non prise en charge par ce navigateur.');
      return;
    }
    setGpsLoading(true);
    setGpsStatus('Acquisition des coordonnées GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormState((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
        setGpsStatus(`Coordonnées capturées (±${Math.round(pos.coords.accuracy)} m).`);
      },
      (err) => {
        setGpsLoading(false);
        setGpsStatus(
          err.code === 1
            ? 'Permission de géolocalisation refusée par le navigateur.'
            : 'Impossible de relever la position GPS actuelle.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleFormAgent = (agentId: string) => {
    setFormState((prev) => ({
      ...prev,
      assigned_agent_ids: prev.assigned_agent_ids.includes(agentId)
        ? prev.assigned_agent_ids.filter((id) => id !== agentId)
        : [...prev.assigned_agent_ids, agentId],
    }));
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      if (editingTask) {
        if (!isOnline) {
          await enqueueOfflineTaskUpdate({
            user,
            task: editingTask,
            payload: { ...formState },
          });
          setFeedbackMsg(
            `Modifications de ${editingTask.numero_tache} enregistrées hors connexion — synchronisation automatique au retour d'Internet.`
          );
          setFormOpen(false);
          await onDataChanged();
          return;
        }
        const res = await apiClient.updateTask(editingTask.task_id, {
          ...formState,
          expected_version: editingTask.version,
        });
        setFeedbackMsg(`Tâche ${res.task.numero_tache} mise à jour (v${res.task.version}).`);
      } else {
        if (!isOnline) {
          setErrorMsg(
            'Connexion Internet requise pour créer une nouvelle tâche et générer son numéro officiel GAZ-SA.'
          );
          return;
        }
        const res = await apiClient.createTask(formState);
        setFeedbackMsg(
          `Tâche ${res.task.numero_tache} créée (${res.task.assignments.length} agent(s) affecté(s)).`
        );
      }
      setFormOpen(false);
      await onDataChanged();
    } catch (err) {
      if (editingTask && isNetworkError(err)) {
        await enqueueOfflineTaskUpdate({
          user,
          task: editingTask,
          payload: { ...formState },
        });
        setFeedbackMsg(
          `Modifications de ${editingTask.numero_tache} enregistrées hors connexion — synchronisation automatique au retour d'Internet.`
        );
        setFormOpen(false);
        await onDataChanged();
        return;
      }
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Impossible d’enregistrer la tâche.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openAssignModal = (task: TaskDTO) => {
    setAssignModalTask(task);
    setAssignAgentIds(task.assignments.map((a) => a.agent_id));
    setAssignEquipe(task.equipe || '');
    setAssignMode('REPLACE');
    setErrorMsg('');
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalTask) return;
    if (assignAgentIds.length === 0) {
      setErrorMsg('Sélectionnez au moins un agent actif.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiClient.assignAgents(
        assignModalTask.task_id,
        assignAgentIds,
        assignEquipe,
        assignMode
      );
      setFeedbackMsg(
        `Affectations mises à jour sur ${res.task.numero_tache} (${res.task.assignments.length} agent(s)).`
      );
      setAssignModalTask(null);
      await onDataChanged();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Erreur lors de l’affectation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!unassignTarget) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      await apiClient.unassignAgent(unassignTarget.taskId, unassignTarget.agentId);
      setFeedbackMsg(`${unassignTarget.agentLabel} retiré(e) de la tâche.`);
      setUnassignTarget(null);
      await onDataChanged();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Impossible de retirer cet agent.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancelTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalTask) return;
    if (!cancelReason.trim()) {
      setErrorMsg("Un motif d'annulation est obligatoire.");
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await apiClient.patchTaskStatus(
        cancelModalTask.task_id,
        'ANNULÉE',
        cancelReason.trim()
      );
      setFeedbackMsg(`Tâche ${res.task.numero_tache} annulée.`);
      setCancelModalTask(null);
      setCancelReason('');
      await onDataChanged();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Impossible d’annuler la tâche.');
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = (task: TaskDTO) =>
    Boolean(task.date_fin_prevue) &&
    task.date_fin_prevue < todayIso &&
    !CLOSED_STATUSES.includes(task.statut_global);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Interventions & Tâches gaz
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isChef
              ? 'Créez, planifiez, priorisez et affectez les interventions aux agents du district.'
              : 'Visibilité collective en lecture sur toutes les interventions programmées du district.'}
          </p>
        </div>

        {isChef && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Nouvelle tâche</span>
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg('')}
            className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
            aria-label="Fermer la notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filtres combinables */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par N° GAZ-SA-..., titre, adresse ou repère..."
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Filter className="h-3.5 w-3.5" />
              <strong className="font-mono text-slate-900 dark:text-white">
                {filteredTasks.length}
              </strong>{' '}
              / {tasks.length} tâche(s)
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            aria-label="Filtrer par catégorie"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Toutes catégories</option>
            {params
              .filter((p) => p.categorie === 'CATEGORIE_TRAVAUX')
              .map((c) => (
                <option key={c.param_id} value={c.valeur}>
                  {c.valeur} · {c.libelle}
                </option>
              ))}
          </select>

          <select
            value={filterCommune}
            onChange={(e) => setFilterCommune(e.target.value)}
            aria-label="Filtrer par commune"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Toutes communes</option>
            {params
              .filter((p) => p.categorie === 'COMMUNE')
              .map((c) => (
                <option key={c.param_id} value={c.libelle}>
                  {c.libelle}
                </option>
              ))}
          </select>

          <select
            value={filterDp}
            onChange={(e) => setFilterDp(e.target.value)}
            aria-label="Filtrer par DP"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Toutes DP</option>
            {params
              .filter((p) => p.categorie === 'DP')
              .map((d) => (
                <option key={d.param_id} value={d.libelle}>
                  {d.libelle}
                </option>
              ))}
          </select>

          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            aria-label="Filtrer par agent affecté"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Tous les agents</option>
            {agents.map((a) => (
              <option key={a.agent_id} value={a.agent_id}>
                {a.prenom} {a.nom} ({a.matricule})
              </option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            aria-label="Filtrer par priorité"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Toutes priorités</option>
            <option value="URGENTE">Urgente</option>
            <option value="HAUTE">Haute</option>
            <option value="NORMALE">Normale</option>
            <option value="BASSE">Basse</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filtrer par statut"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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

          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            aria-label="Filtrer par date prévue"
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </section>

      {/* Tableau / Liste des tâches */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Chargement des interventions...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Aucune tâche ne correspond aux critères sélectionnés.
            </p>
            {isChef && tasks.length === 0 && (
              <button
                type="button"
                onClick={openCreateForm}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485]"
              >
                <Plus className="h-4 w-4" />
                <span>Créer la première intervention</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                    <th className="px-4 py-3">N° & Intervention</th>
                    <th className="px-4 py-3">Localisation</th>
                    <th className="px-4 py-3">Planning</th>
                    <th className="px-4 py-3">Agents affectés</th>
                    <th className="px-4 py-3">Priorité</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTasks.map((task) => {
                    const overdue = isOverdue(task);
                    return (
                      <tr
                        key={task.task_id}
                        className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#0055A4] dark:text-blue-400">
                              {task.numero_tache}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {task.categorie}
                            </span>
                          </div>
                          <p className="mt-0.5 font-medium text-slate-900 dark:text-white">
                            {task.titre}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {categoryLabelMap.get(task.categorie) || task.categorie}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 align-top text-xs">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {task.commune} · {task.dp}
                          </p>
                          <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                            {task.adresse}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 align-top font-mono text-xs tabular-nums">
                          <p className="text-slate-800 dark:text-slate-200">
                            {formatDateFr(task.date_debut_prevue)} · {task.heure_prevue}
                          </p>
                          <p
                            className={`mt-0.5 ${
                              overdue
                                ? 'font-semibold text-red-600 dark:text-red-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            Éch. {formatDateFr(task.date_fin_prevue)}
                            {overdue ? ' (En retard)' : ''}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 align-top text-xs">
                          {task.assignments.length === 0 ? (
                            <span className="text-slate-400">Non affectée</span>
                          ) : (
                            <div className="space-y-1">
                              {task.equipe && (
                                <p className="font-medium text-slate-700 dark:text-slate-300">
                                  Équipe : {task.equipe}
                                </p>
                              )}
                              <p className="text-slate-600 dark:text-slate-400">
                                {task.assignments
                                  .map((a) => `${a.agent_prenom} ${a.agent_nom}`.trim())
                                  .join(', ')}
                              </p>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <PriorityLabel priorite={task.priorite} />
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <TaskStatusLabel statut={task.statut_global} />
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedTaskId(task.task_id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              title="Consulter la fiche"
                              aria-label="Consulter la fiche"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {isChef && task.statut_global !== 'ANNULÉE' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditForm(task)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                  title="Modifier"
                                  aria-label="Modifier"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAssignModal(task)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-[#0055A4] hover:bg-blue-50 dark:border-slate-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
                                  title="Affecter des agents"
                                  aria-label="Affecter des agents"
                                >
                                  <UserPlus className="h-4 w-4" />
                                </button>
                                {task.statut_global !== 'VALIDÉE' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCancelModalTask(task);
                                      setCancelReason('');
                                      setErrorMsg('');
                                    }}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                                    title="Annuler la tâche"
                                    aria-label="Annuler la tâche"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="divide-y divide-slate-200 lg:hidden dark:divide-slate-800">
              {filteredTasks.map((task) => {
                const overdue = isOverdue(task);
                return (
                  <div key={task.task_id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-semibold text-[#0055A4] dark:text-blue-400">
                          {task.numero_tache} · {task.categorie}
                        </span>
                        <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {task.titre}
                        </h3>
                      </div>
                      <TaskStatusLabel statut={task.statut_global} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <PriorityLabel priorite={task.priorite} />
                      <span className="font-mono tabular-nums">
                        {formatDateFr(task.date_debut_prevue)} · {task.heure_prevue}
                      </span>
                      {overdue && (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          En retard
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <MapPin className="mr-1 inline h-3.5 w-3.5" />
                      {task.commune} ({task.dp}) — {task.adresse}
                    </p>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <Users className="mr-1 inline h-3.5 w-3.5" />
                      {task.assignments.length === 0
                        ? 'Aucun agent affecté'
                        : task.assignments
                            .map((a) => `${a.agent_prenom} ${a.agent_nom}`.trim())
                            .join(', ')}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setSelectedTaskId(task.task_id)}
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Détails</span>
                      </button>
                      {isChef && task.statut_global !== 'ANNULÉE' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditForm(task)}
                            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Modifier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openAssignModal(task)}
                            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-[#0055A4] px-3 text-xs font-medium text-white hover:bg-[#004485]"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Affecter</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Modale Détail Fiche Tâche */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-bold text-[#0055A4] dark:text-blue-400">
                    {selectedTask.numero_tache}
                  </span>
                  <PriorityLabel priorite={selectedTask.priorite} />
                  <TaskStatusLabel statut={selectedTask.statut_global} />
                  <span className="font-mono text-xs text-slate-400">
                    v{selectedTask.version}
                  </span>
                </div>
                <h3 className="mt-1.5 font-display text-lg font-bold text-slate-900 dark:text-white">
                  {selectedTask.titre}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedTask.categorie} —{' '}
                  {categoryLabelMap.get(selectedTask.categorie) || selectedTask.categorie}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Localisation & Repère
                </p>
                <p className="mt-1.5 font-medium text-slate-900 dark:text-white">
                  {selectedTask.commune} · {selectedTask.dp}
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{selectedTask.adresse}</p>
                {selectedTask.repere_geo && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Repère : {selectedTask.repere_geo}
                  </p>
                )}
                {selectedTask.latitude && selectedTask.longitude && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {selectedTask.latitude}, {selectedTask.longitude}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(
                        `${selectedTask.latitude},${selectedTask.longitude}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[#0055A4] hover:underline dark:text-blue-400"
                    >
                      <span>Ouvrir dans Google Maps</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Planification & Équipe
                </p>
                <p className="mt-1.5 font-mono text-xs text-slate-800 dark:text-slate-200">
                  Début prévu : {formatDateFr(selectedTask.date_debut_prevue)} à{' '}
                  {selectedTask.heure_prevue}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                  Date limite : {formatDateFr(selectedTask.date_fin_prevue)}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Équipe : {selectedTask.equipe || 'Non spécifiée'}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  Créée le {formatDateTimeFr(selectedTask.date_creation)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Description de l&apos;intervention
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                  {selectedTask.description}
                </p>
              </div>

              {selectedTask.instructions && (
                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Instructions techniques & Sécurité gaz
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {selectedTask.instructions}
                  </p>
                </div>
              )}

              {(selectedTask.materiel_necessaire || selectedTask.observations) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {selectedTask.materiel_necessaire && (
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Matériel nécessaire
                      </p>
                      <p className="mt-1 text-slate-800 dark:text-slate-200">
                        {selectedTask.materiel_necessaire}
                      </p>
                    </div>
                  )}
                  {selectedTask.observations && (
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Observations
                      </p>
                      <p className="mt-1 text-slate-800 dark:text-slate-200">
                        {selectedTask.observations}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tableau individuel des agents affectés */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Suivi individuel des affectations ({selectedTask.assignments.length})
                </h4>
                {isChef &&
                  selectedTask.statut_global !== 'ANNULÉE' &&
                  selectedTask.statut_global !== 'VALIDÉE' && (
                    <button
                      type="button"
                      onClick={() => openAssignModal(selectedTask)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0055A4] hover:underline dark:text-blue-400"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Gérer les agents</span>
                    </button>
                  )}
              </div>

              {selectedTask.assignments.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700">
                  Aucun agent n&apos;est encore affecté à cette tâche.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                        <th className="px-3 py-2.5">Agent</th>
                        <th className="px-3 py-2.5">Fonction</th>
                        <th className="px-3 py-2.5">Statut agent</th>
                        <th className="px-3 py-2.5">Affecté le</th>
                        {isChef && <th className="px-3 py-2.5 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedTask.assignments.map((asg) => (
                        <tr key={asg.assignment_id}>
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                            {asg.agent_prenom} {asg.agent_nom}{' '}
                            <span className="font-mono text-slate-400">
                              ({asg.agent_matricule})
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                            {asg.agent_fonction || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <TaskStatusLabel statut={asg.statut_agent} />
                            {asg.motif_blocage_attente && (
                              <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                                Motif : {asg.motif_blocage_attente}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-500 dark:text-slate-400">
                            {formatDateTimeFr(asg.date_affectation)}
                          </td>
                          {isChef && (
                            <td className="px-3 py-2.5 text-right">
                              {selectedTask.statut_global !== 'ANNULÉE' &&
                                selectedTask.statut_global !== 'VALIDÉE' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setUnassignTarget({
                                        taskId: selectedTask.task_id,
                                        agentId: asg.agent_id,
                                        agentLabel: `${asg.agent_prenom} ${asg.agent_nom}`.trim(),
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                  >
                                    <UserMinus className="h-3.5 w-3.5" />
                                    <span>Retirer</span>
                                  </button>
                                )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Phase 4 : Mon exécution terrain (si l'utilisateur est affecté à cette tâche) */}
            {(() => {
              const myAsg = user
                ? selectedTask.assignments.find((a) => a.agent_id === user.agent_id)
                : undefined;
              if (
                !myAsg ||
                selectedTask.statut_global === 'ANNULÉE' ||
                selectedTask.statut_global === 'VALIDÉE'
              ) {
                return null;
              }
              const runTransition = async (
                target: AgentAssignmentStatus,
                motif = ''
              ) => {
                if (!user) return;
                setSubmitting(true);
                setExecError('');
                try {
                  if (!isOnline) {
                    await enqueueOfflineStatusTransition({
                      user,
                      task: selectedTask,
                      statut_agent: target,
                      motif,
                    });
                    setFeedbackMsg(
                      `Avancement enregistré hors connexion sur ${selectedTask.numero_tache} : ${target}.`
                    );
                    setExecModal(null);
                    await onDataChanged();
                    return;
                  }
                  const res = await apiClient.patchMyTaskExecution(
                    selectedTask.task_id,
                    target,
                    motif
                  );
                  setFeedbackMsg(
                    `Avancement enregistré sur ${res.task.numero_tache} : ${target}.`
                  );
                  setExecModal(null);
                  await onDataChanged();
                } catch (err) {
                  if (isNetworkError(err)) {
                    await enqueueOfflineStatusTransition({
                      user,
                      task: selectedTask,
                      statut_agent: target,
                      motif,
                    });
                    setFeedbackMsg(
                      `Avancement enregistré hors connexion sur ${selectedTask.numero_tache} : ${target}.`
                    );
                    setExecModal(null);
                    await onDataChanged();
                    return;
                  }
                  setExecError(
                    err instanceof ApiError
                      ? err.message
                      : 'Erreur de mise à jour terrain.'
                  );
                } finally {
                  setSubmitting(false);
                }
              };

              return (
                <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Mon exécution terrain :
                      </span>
                      <TaskStatusLabel statut={myAsg.statut_agent} />
                    </div>
                  </div>
                  {execError && !execModal && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {execError}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {myAsg.statut_agent === 'TRANSMISE' && (
                      <>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => runTransition('ACCEPTÉE')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#0055A4] bg-white px-3.5 py-2 text-xs font-medium text-[#0055A4] hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-400"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Accepter</span>
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => runTransition('EN COURS')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004485]"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          <span>Démarrer</span>
                        </button>
                      </>
                    )}
                    {myAsg.statut_agent === 'ACCEPTÉE' && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => runTransition('EN COURS')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004485]"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        <span>Démarrer l&apos;intervention</span>
                      </button>
                    )}
                    {(myAsg.statut_agent === 'EN ATTENTE' ||
                      myAsg.statut_agent === 'BLOQUÉE') && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => runTransition('EN COURS')}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0055A4] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#004485]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reprendre</span>
                      </button>
                    )}
                    {myAsg.statut_agent !== 'TERMINÉE' &&
                      myAsg.statut_agent !== 'TRANSMISE' && (
                        <>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => {
                              setExecError('');
                              setExecModal({
                                task: selectedTask,
                                targetStatus: 'TERMINÉE',
                              });
                            }}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Terminer</span>
                          </button>
                          {myAsg.statut_agent !== 'EN ATTENTE' && (
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                setExecError('');
                                setExecModal({
                                  task: selectedTask,
                                  targetStatus: 'EN ATTENTE',
                                });
                              }}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
                            >
                              <PauseCircle className="h-3.5 w-3.5" />
                              <span>En attente</span>
                            </button>
                          )}
                          {myAsg.statut_agent !== 'BLOQUÉE' && (
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                setExecError('');
                                setExecModal({
                                  task: selectedTask,
                                  targetStatus: 'BLOQUÉE',
                                });
                              }}
                              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                            >
                              <AlertOctagon className="h-3.5 w-3.5" />
                              <span>Bloquer</span>
                            </button>
                          )}
                        </>
                      )}

                    {(myAsg.statut_agent === 'EN COURS' ||
                      myAsg.statut_agent === 'TERMINÉE' ||
                      selectedTask.statut_global === 'REFUSÉE') && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          const taskReports = reports
                            .filter((r) => r.task_id === selectedTask.task_id)
                            .sort((a, b) => b.version - a.version);
                          setReportModalContext({
                            task: selectedTask,
                            previousReport: taskReports[0] || null,
                          });
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#0055A4] bg-white px-3.5 py-2 text-xs font-medium text-[#0055A4] hover:bg-blue-50 dark:border-blue-500 dark:bg-slate-900 dark:text-blue-400"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>
                          {reports.some((r) => r.task_id === selectedTask.task_id)
                            ? 'Nouvelle version compte-rendu'
                            : 'Rédiger compte-rendu'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Phase 5 : Comptes-rendus & Photos associés à la tâche */}
            {(() => {
              const taskReports = reports
                .filter((r) => r.task_id === selectedTask.task_id)
                .sort((a, b) => b.version - a.version);

              return (
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Comptes-rendus &amp; Photos ({taskReports.length})
                  </h4>
                  {taskReports.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700">
                      Aucun compte-rendu soumis pour cette intervention.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {taskReports.map((rep) => (
                        <div
                          key={rep.report_id}
                          className="rounded-lg border border-slate-200 p-3.5 text-xs dark:border-slate-800 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#0055A4] dark:text-blue-400">
                                Version v{rep.version}
                              </span>
                              <span className="text-slate-500">
                                par {rep.agent_prenom} {rep.agent_nom} ·{' '}
                                {formatDateTimeFr(rep.date_soumission)}
                              </span>
                            </div>
                            <span
                              className={`font-semibold ${
                                rep.validation === 'VALIDÉ'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : rep.validation === 'REFUSÉ'
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {rep.validation === 'EN_ATTENTE' ? 'À VALIDER' : rep.validation}
                            </span>
                          </div>
                          <p className="text-slate-800 dark:text-slate-200">
                            <strong>Travail :</strong> {rep.travail_effectue}
                          </p>
                          <p className="text-slate-700 dark:text-slate-300">
                            <strong>Résultat :</strong> {rep.resultat}
                          </p>
                          {rep.commentaire_chef && (
                            <p
                              className={
                                rep.validation === 'REFUSÉ'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }
                            >
                              <strong>Décision Chef :</strong> {rep.commentaire_chef}
                            </p>
                          )}
                          {rep.photos.length > 0 && (
                            <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-3">
                              {rep.photos.map((photo) => (
                                <AuthPhoto key={photo.photo_id} photo={photo} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modale Création / Édition Tâche (CHEF) */}
      {formOpen && isChef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {editingTask
                    ? `Modifier la tâche ${editingTask.numero_tache}`
                    : 'Nouvelle tâche d’intervention gaz'}
                </h3>
                {editingTask && (
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    Version actuelle : v{editingTask.version} (contrôle de conflit activé)
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="mt-5 space-y-4">
              {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Titre de l&apos;intervention *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={formState.titre}
                    onChange={(e) => setFormState({ ...formState, titre: e.target.value })}
                    placeholder="Ex. Recherche de fuite MPB rue Emir Abdelkader"
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Priorité *
                  </label>
                  <select
                    value={formState.priorite}
                    onChange={(e) =>
                      setFormState({ ...formState, priorite: e.target.value as TaskPriority })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="URGENTE">Urgente</option>
                    <option value="HAUTE">Haute</option>
                    <option value="NORMALE">Normale</option>
                    <option value="BASSE">Basse</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Catégorie de travaux *
                  </label>
                  <select
                    value={formState.categorie}
                    onChange={(e) => setFormState({ ...formState, categorie: e.target.value })}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {activeCategories.map((c) => (
                      <option key={c.param_id} value={c.valeur}>
                        {c.valeur} — {c.libelle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Commune *
                  </label>
                  <select
                    value={formState.commune}
                    onChange={(e) => handleCommuneChange(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {activeCommunes.map((c) => (
                      <option key={c.param_id} value={c.libelle}>
                        {c.libelle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Distribution Publique (DP) *
                  </label>
                  <select
                    value={formState.dp}
                    onChange={(e) => setFormState({ ...formState, dp: e.target.value })}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {activeDps.map((d) => (
                      <option key={d.param_id} value={d.libelle}>
                        {d.libelle}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Adresse / Quartier / Douar *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={formState.adresse}
                    onChange={(e) => setFormState({ ...formState, adresse: e.target.value })}
                    placeholder="Ex. Hai El Badr, près du poste DP"
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Repère géographique
                  </label>
                  <input
                    type="text"
                    value={formState.repere_geo}
                    onChange={(e) => setFormState({ ...formState, repere_geo: e.target.value })}
                    placeholder="Ex. Face à la mosquée / Coffret n°14"
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Coordonnées GPS optionnelles */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Coordonnées GPS (optionnelles)
                  </span>
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    disabled={gpsLoading}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Compass className="h-3.5 w-3.5 text-[#0055A4]" />
                    <span>{gpsLoading ? 'Capture en cours...' : 'Capturer position actuelle'}</span>
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    value={formState.latitude}
                    onChange={(e) => setFormState({ ...formState, latitude: e.target.value })}
                    placeholder="Latitude (ex. 36.098700)"
                    className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="text"
                    value={formState.longitude}
                    onChange={(e) => setFormState({ ...formState, longitude: e.target.value })}
                    placeholder="Longitude (ex. 0.417800)"
                    className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                {gpsStatus && (
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{gpsStatus}</p>
                )}
              </div>

              {/* Dates & Heure */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date début prévue *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.date_debut_prevue}
                    onChange={(e) =>
                      setFormState({ ...formState, date_debut_prevue: e.target.value })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Heure prévue (24h) *
                  </label>
                  <input
                    type="time"
                    required
                    value={formState.heure_prevue}
                    onChange={(e) => setFormState({ ...formState, heure_prevue: e.target.value })}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date limite prévue *
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.date_fin_prevue}
                    onChange={(e) =>
                      setFormState({ ...formState, date_fin_prevue: e.target.value })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Description & Instructions */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Description détaillée *
                </label>
                <textarea
                  required
                  minLength={3}
                  rows={3}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Nature exacte du signalement ou des travaux..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Instructions techniques / Sécurité
                  </label>
                  <textarea
                    rows={2}
                    value={formState.instructions}
                    onChange={(e) => setFormState({ ...formState, instructions: e.target.value })}
                    placeholder="Consignes de coupure, détecteur gaz, EPI..."
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Matériel nécessaire
                  </label>
                  <textarea
                    rows={2}
                    value={formState.materiel_necessaire}
                    onChange={(e) =>
                      setFormState({ ...formState, materiel_necessaire: e.target.value })
                    }
                    placeholder="Détecteur, manomètre, collier de réparation..."
                    className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Équipe & Affectation multi-agents */}
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Équipe (sélection rapide ou nom libre)
                    </label>
                    <input
                      type="text"
                      list="sonelgaz-teams-list"
                      value={formState.equipe}
                      onChange={(e) => handleTeamSelect(e.target.value)}
                      placeholder="Ex. Équipe Intervention A"
                      className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <datalist id="sonelgaz-teams-list">
                      {activeTeams.map((t) => (
                        <option key={t.param_id} value={t.libelle} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Observations Chef
                    </label>
                    <input
                      type="text"
                      value={formState.observations}
                      onChange={(e) =>
                        setFormState({ ...formState, observations: e.target.value })
                      }
                      placeholder="Remarque complémentaire..."
                      className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Affecter des agents actifs ({formState.assigned_agent_ids.length} sélectionné(s))
                  </p>
                  {activeAgents.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucun agent actif disponible.</p>
                  ) : (
                    <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {activeAgents.map((ag) => {
                        const checked = formState.assigned_agent_ids.includes(ag.agent_id);
                        return (
                          <label
                            key={ag.agent_id}
                            className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                              checked
                                ? 'border-[#0055A4] bg-blue-50/70 text-slate-900 dark:border-blue-500 dark:bg-blue-950/30 dark:text-white'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFormAgent(ag.agent_id)}
                              className="h-4 w-4 accent-[#0055A4]"
                            />
                            <span className="min-w-0 truncate">
                              <strong className="font-mono">{ag.matricule}</strong> · {ag.prenom}{' '}
                              {ag.nom}
                              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {ag.fonction}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#0055A4] px-5 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
                >
                  {submitting
                    ? 'Enregistrement...'
                    : editingTask
                      ? 'Enregistrer les modifications'
                      : 'Créer et notifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Affectation dédiée */}
      {assignModalTask && isChef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Affectation · {assignModalTask.numero_tache}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {assignModalTask.titre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalTask(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nom d&apos;équipe (optionnel)
                </label>
                <input
                  type="text"
                  list="assign-teams-list"
                  value={assignEquipe}
                  onChange={(e) => setAssignEquipe(e.target.value)}
                  placeholder="Ex. Équipe Urgence Sidi Ali"
                  className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <datalist id="assign-teams-list">
                  {activeTeams.map((t) => (
                    <option key={t.param_id} value={t.libelle} />
                  ))}
                </datalist>
              </div>

              <div className="flex gap-3 text-xs">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="assignMode"
                    checked={assignMode === 'REPLACE'}
                    onChange={() => setAssignMode('REPLACE')}
                    className="accent-[#0055A4]"
                  />
                  <span>Définir la liste exacte</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="assignMode"
                    checked={assignMode === 'ADD'}
                    onChange={() => setAssignMode('ADD')}
                    className="accent-[#0055A4]"
                  />
                  <span>Ajouter aux agents existants</span>
                </label>
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {activeAgents.map((ag) => {
                  const checked = assignAgentIds.includes(ag.agent_id);
                  return (
                    <label
                      key={ag.agent_id}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-xs ${
                        checked
                          ? 'border-[#0055A4] bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAssignAgentIds((prev) =>
                            prev.includes(ag.agent_id)
                              ? prev.filter((id) => id !== ag.agent_id)
                              : [...prev, ag.agent_id]
                          )
                        }
                        className="h-4 w-4 accent-[#0055A4]"
                      />
                      <span className="min-w-0 flex-1">
                        <strong className="font-mono">{ag.matricule}</strong> · {ag.prenom}{' '}
                        {ag.nom}
                        <span className="block text-[11px] text-slate-500">{ag.fonction}</span>
                      </span>
                      <CheckSquare
                        className={`h-4 w-4 ${checked ? 'text-[#0055A4]' : 'text-slate-300'}`}
                      />
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalTask(null)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
                >
                  {submitting ? 'Validation...' : 'Valider l’affectation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Annulation avec motif obligatoire */}
      {cancelModalTask && isChef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Annuler la tâche {cancelModalTask.numero_tache}
              </h3>
              <button
                type="button"
                onClick={() => setCancelModalTask(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelTask} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                La tâche sera conservée dans l&apos;historique et marquée comme ANNULÉE. Les
                agents affectés recevront une notification.
              </p>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Motif obligatoire d&apos;annulation *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Indiquez la raison exacte de l'annulation..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCancelModalTask(null)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {submitting ? 'Annulation...' : 'Confirmer l’annulation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation retrait agent */}
      <ConfirmModal
        open={Boolean(unassignTarget)}
        title="Retirer l'agent de la tâche"
        description={
          unassignTarget
            ? `Confirmez-vous le retrait de ${unassignTarget.agentLabel} de cette intervention ? Cette action sera journalisée dans l'historique.`
            : ''
        }
        confirmLabel="Retirer l'agent"
        tone="warning"
        loading={submitting}
        onConfirm={handleConfirmUnassign}
        onCancel={() => setUnassignTarget(null)}
      />

      <ExecutionActionModal
        open={Boolean(execModal)}
        task={execModal?.task || null}
        targetStatus={execModal?.targetStatus || null}
        loading={submitting}
        errorMessage={execError}
        onConfirm={async (motif) => {
          if (!execModal || !user) return;
          setSubmitting(true);
          setExecError('');
          try {
            if (!isOnline) {
              await enqueueOfflineStatusTransition({
                user,
                task: execModal.task,
                statut_agent: execModal.targetStatus,
                motif,
              });
              setFeedbackMsg(
                `Avancement enregistré hors connexion sur ${execModal.task.numero_tache} : ${execModal.targetStatus}.`
              );
              setExecModal(null);
              await onDataChanged();
              return;
            }
            const res = await apiClient.patchMyTaskExecution(
              execModal.task.task_id,
              execModal.targetStatus,
              motif
            );
            setFeedbackMsg(
              `Avancement enregistré sur ${res.task.numero_tache} : ${execModal.targetStatus}.`
            );
            setExecModal(null);
            await onDataChanged();
          } catch (err) {
            if (isNetworkError(err)) {
              await enqueueOfflineStatusTransition({
                user,
                task: execModal.task,
                statut_agent: execModal.targetStatus,
                motif,
              });
              setFeedbackMsg(
                `Avancement enregistré hors connexion sur ${execModal.task.numero_tache} : ${execModal.targetStatus}.`
              );
              setExecModal(null);
              await onDataChanged();
              return;
            }
            setExecError(
              err instanceof ApiError ? err.message : 'Erreur de mise à jour terrain.'
            );
          } finally {
            setSubmitting(false);
          }
        }}
        onCancel={() => setExecModal(null)}
      />

      <ReportModal
        open={Boolean(reportModalContext)}
        task={reportModalContext?.task || null}
        previousReport={reportModalContext?.previousReport || null}
        onSubmitted={async (rep) => {
          setFeedbackMsg(
            `Compte-rendu v${rep.version} soumis au Chef pour validation.`
          );
          await onDataChanged();
        }}
        onClose={() => setReportModalContext(null)}
      />
    </div>
  );
};

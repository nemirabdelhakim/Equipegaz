import { v4 as uuidv4 } from 'uuid';
import type {
  AgentAssignmentStatus,
  AgentRecord,
  AssignmentRecord,
  DistrictParamRecord,
  ParamCategory,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  TaskWithAssignmentsDTO,
} from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { nowIso } from '../utils/dateAlgiers.js';
import { ServiceError } from './agentService.js';

export interface CreateTaskInput {
  titre: string;
  categorie: string;
  description: string;
  instructions: string;
  commune: string;
  dp: string;
  adresse: string;
  repere_geo: string;
  latitude: string;
  longitude: string;
  priorite: TaskPriority;
  date_debut_prevue: string;
  heure_prevue: string;
  date_fin_prevue: string;
  equipe: string;
  materiel_necessaire: string;
  observations: string;
  assigned_agent_ids: string[];
}

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  expected_version?: number;
};

export function computeGlobalStatusFromAssignments(
  currentGlobal: TaskStatus,
  assignments: AssignmentRecord[]
): TaskStatus {
  if (
    currentGlobal === 'ANNULÉE' ||
    currentGlobal === 'VALIDÉE' ||
    currentGlobal === 'REFUSÉE' ||
    currentGlobal === 'À VALIDER'
  ) {
    return currentGlobal;
  }

  if (assignments.length === 0) {
    return 'NOUVELLE';
  }

  const statuses = assignments.map((a) => a.statut_agent);
  if (statuses.every((s) => s === 'TERMINÉE')) {
    return 'TERMINÉE';
  }
  if (statuses.some((s) => s === 'BLOQUÉE')) {
    return 'BLOQUÉE';
  }
  if (statuses.some((s) => s === 'EN COURS') || statuses.some((s) => s === 'TERMINÉE')) {
    return 'EN COURS';
  }
  if (statuses.some((s) => s === 'EN ATTENTE')) {
    return 'EN ATTENTE';
  }
  if (statuses.some((s) => s === 'ACCEPTÉE')) {
    return 'ACCEPTÉE';
  }
  return 'TRANSMISE';
}

export class TaskService {
  constructor(private readonly repo: IDataRepository) {}

  private async hydrateTasks(tasks: TaskRecord[]): Promise<TaskWithAssignmentsDTO[]> {
    const [allAssignments, allAgents] = await Promise.all([
      this.repo.listAssignments(),
      this.repo.listAgents(),
    ]);

    const agentMap = new Map<string, AgentRecord>();
    for (const a of allAgents) {
      agentMap.set(a.agent_id, a);
    }

    const assignByTask = new Map<string, AssignmentRecord[]>();
    for (const asg of allAssignments) {
      const list = assignByTask.get(asg.task_id) || [];
      list.push(asg);
      assignByTask.set(asg.task_id, list);
    }

    return tasks
      .map((t) => {
        const taskAsgs = assignByTask.get(t.task_id) || [];
        return {
          ...t,
          assignments: taskAsgs.map((a) => {
            const ag = agentMap.get(a.agent_id);
            return {
              ...a,
              agent_matricule: ag?.matricule || '—',
              agent_nom: ag?.nom || 'Agent',
              agent_prenom: ag?.prenom || '',
              agent_fonction: ag?.fonction || '',
            };
          }),
        };
      })
      .sort((a, b) => b.date_creation.localeCompare(a.date_creation));
  }

  async listAllTasks(): Promise<TaskWithAssignmentsDTO[]> {
    const tasks = await this.repo.listTasks();
    return this.hydrateTasks(tasks);
  }

  async getTaskById(taskId: string): Promise<TaskWithAssignmentsDTO> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }
    const hydrated = await this.hydrateTasks([task]);
    return hydrated[0];
  }

  private async generateTaskNumber(): Promise<string> {
    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
    }).format(new Date());
    const prefix = `GAZ-SA-${year}-`;
    const existing = await this.repo.listTasks();
    let maxSeq = 0;
    for (const t of existing) {
      if (t.numero_tache.startsWith(prefix)) {
        const seq = Number.parseInt(t.numero_tache.slice(prefix.length), 10);
        if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    const nextStr = String(maxSeq + 1).padStart(6, '0');
    return `${prefix}${nextStr}`;
  }

  private async notifyAgents(
    agentIds: string[],
    task: TaskRecord,
    typeEvent: string,
    titre: string,
    message: string,
    eventVersionTag: string
  ): Promise<void> {
    const now = nowIso();
    for (const userId of agentIds) {
      const dedupKey = `${typeEvent}:${task.task_id}:${userId}:${eventVersionTag}`;
      await this.repo.createNotificationIfUnique({
        notification_id: uuidv4(),
        dedup_key: dedupKey,
        user_id: userId,
        task_id: task.task_id,
        type_event: typeEvent,
        titre,
        message,
        date_creation: now,
        statut_envoi: 'ENVOYÉ',
        date_lecture: '',
      });
    }
  }

  async createTask(input: CreateTaskInput, actor: AgentRecord): Promise<TaskWithAssignmentsDTO> {
    const uniqueAgentIds = Array.from(new Set(input.assigned_agent_ids));
    for (const agentId of uniqueAgentIds) {
      const ag = await this.repo.getAgentById(agentId);
      if (!ag) {
        throw new ServiceError(400, 'INVALID_AGENT', `Agent introuvable (${agentId}).`);
      }
      if (ag.statut !== 'ACTIF') {
        throw new ServiceError(
          400,
          'AGENT_NOT_ACTIVE',
          `Impossible d'affecter ${ag.prenom} ${ag.nom} (statut : ${ag.statut}).`
        );
      }
    }

    const now = nowIso();
    const numeroTache = await this.generateTaskNumber();
    const taskId = uuidv4();
    const initialStatus: TaskStatus = uniqueAgentIds.length > 0 ? 'TRANSMISE' : 'NOUVELLE';

    const task: TaskRecord = {
      task_id: taskId,
      numero_tache: numeroTache,
      titre: input.titre,
      categorie: input.categorie,
      description: input.description,
      instructions: input.instructions,
      commune: input.commune,
      dp: input.dp,
      adresse: input.adresse,
      repere_geo: input.repere_geo,
      latitude: input.latitude,
      longitude: input.longitude,
      priorite: input.priorite,
      date_creation: now,
      date_debut_prevue: input.date_debut_prevue,
      heure_prevue: input.heure_prevue || '08:30',
      date_fin_prevue: input.date_fin_prevue,
      equipe: input.equipe,
      materiel_necessaire: input.materiel_necessaire,
      observations: input.observations,
      statut_global: initialStatus,
      createur_id: actor.agent_id,
      version: 1,
      updated_at: now,
    };

    await this.repo.createTask(task);

    if (uniqueAgentIds.length > 0) {
      const assignments: AssignmentRecord[] = uniqueAgentIds.map((agentId) => ({
        assignment_id: uuidv4(),
        task_id: taskId,
        agent_id: agentId,
        equipe: input.equipe || '',
        date_affectation: now,
        statut_agent: 'TRANSMISE',
        motif_blocage_attente: '',
        date_acceptation: '',
        date_debut: '',
        date_fin: '',
      }));
      await this.repo.upsertAssignmentsForTask(taskId, assignments);

      await this.notifyAgents(
        uniqueAgentIds,
        task,
        task.priorite === 'URGENTE' ? 'TACHE_URGENTE' : 'NOUVELLE_AFFECTATION',
        `${task.priorite === 'URGENTE' ? 'URGENCE — ' : ''}${task.numero_tache}`,
        `Nouvelle tâche affectée : ${task.titre} (${task.commune} / ${task.dp})`,
        'v1'
      );
    }

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'CREATION_TACHE',
      ancien_etat: '',
      nouvel_etat: initialStatus,
      ancienne_valeur: '',
      nouvelle_valeur: `${numeroTache} · Priorité ${task.priorite} · ${uniqueAgentIds.length} agent(s)`,
      commentaire: `Création de la tâche ${numeroTache} (${task.titre})`,
      date_serveur: now,
    });

    return this.getTaskById(taskId);
  }

  async updateTask(
    taskId: string,
    input: UpdateTaskInput,
    actor: AgentRecord
  ): Promise<TaskWithAssignmentsDTO> {
    const existing = await this.repo.getTaskById(taskId);
    if (!existing) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }

    if (
      input.expected_version !== undefined &&
      input.expected_version !== existing.version
    ) {
      throw new ServiceError(
        409,
        'VERSION_CONFLICT',
        `Conflit détecté : cette tâche a été modifiée entre-temps (version serveur v${existing.version}). Actualisez avant de sauvegarder.`
      );
    }

    const now = nowIso();
    const { assigned_agent_ids, expected_version: _ignoredVersion, ...fields } = input;
    const nextVersion = existing.version + 1;

    const updated = await this.repo.updateTask(taskId, {
      ...fields,
      version: nextVersion,
      updated_at: now,
    });
    if (!updated) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }

    // Si des agents ont été modifiés via le formulaire complet
    if (assigned_agent_ids) {
      await this.assignAgents(
        taskId,
        assigned_agent_ids,
        input.equipe ?? updated.equipe,
        'REPLACE',
        actor
      );
    }

    const currentAssignments = await this.repo.listAssignments(taskId);
    const affectedIds = currentAssignments.map((a) => a.agent_id);

    // Journaliser spécifiquement les changements critiques (priorité, échéance)
    if (input.priorite && input.priorite !== existing.priorite) {
      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: taskId,
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'MODIFICATION_PRIORITE',
        ancien_etat: existing.statut_global,
        nouvel_etat: updated.statut_global,
        ancienne_valeur: existing.priorite,
        nouvelle_valeur: updated.priorite,
        commentaire: `Priorité modifiée de ${existing.priorite} à ${updated.priorite}`,
        date_serveur: now,
      });

      await this.notifyAgents(
        affectedIds,
        updated,
        'CHANGEMENT_PRIORITE',
        `Priorité modifiée · ${updated.numero_tache}`,
        `La priorité de "${updated.titre}" passe de ${existing.priorite} à ${updated.priorite}.`,
        `prio-v${nextVersion}`
      );
    } else if (
      (input.date_fin_prevue && input.date_fin_prevue !== existing.date_fin_prevue) ||
      (input.date_debut_prevue && input.date_debut_prevue !== existing.date_debut_prevue)
    ) {
      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: taskId,
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'MODIFICATION_PLANNING',
        ancien_etat: existing.statut_global,
        nouvel_etat: updated.statut_global,
        ancienne_valeur: `${existing.date_debut_prevue} -> ${existing.date_fin_prevue}`,
        nouvelle_valeur: `${updated.date_debut_prevue} -> ${updated.date_fin_prevue}`,
        commentaire: `Planning / échéance mis à jour pour ${updated.numero_tache}`,
        date_serveur: now,
      });

      await this.notifyAgents(
        affectedIds,
        updated,
        'MODIFICATION_ECHEANCE',
        `Planning modifié · ${updated.numero_tache}`,
        `Nouvelle date prévue : ${updated.date_debut_prevue} à ${updated.heure_prevue} (échéance ${updated.date_fin_prevue}).`,
        `plan-v${nextVersion}`
      );
    } else {
      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: taskId,
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'MODIFICATION_TACHE',
        ancien_etat: existing.statut_global,
        nouvel_etat: updated.statut_global,
        ancienne_valeur: existing.titre,
        nouvelle_valeur: updated.titre,
        commentaire: `Mise à jour des informations de la tâche ${updated.numero_tache}`,
        date_serveur: now,
      });
    }

    return this.getTaskById(taskId);
  }

  async assignAgents(
    taskId: string,
    agentIds: string[],
    equipe: string,
    mode: 'ADD' | 'REPLACE',
    actor: AgentRecord
  ): Promise<TaskWithAssignmentsDTO> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }
    if (task.statut_global === 'ANNULÉE' || task.statut_global === 'VALIDÉE') {
      throw new ServiceError(
        400,
        'TASK_LOCKED',
        `Impossible de modifier les affectations d'une tâche au statut ${task.statut_global}.`
      );
    }

    const uniqueIds = Array.from(new Set(agentIds));
    for (const id of uniqueIds) {
      const ag = await this.repo.getAgentById(id);
      if (!ag) throw new ServiceError(400, 'INVALID_AGENT', `Agent introuvable (${id}).`);
      if (ag.statut !== 'ACTIF') {
        throw new ServiceError(
          400,
          'AGENT_NOT_ACTIVE',
          `L'agent ${ag.prenom} ${ag.nom} n'est pas ACTIF (${ag.statut}).`
        );
      }
    }

    const now = nowIso();
    const currentAssignments = await this.repo.listAssignments(taskId);
    const currentByAgent = new Map(currentAssignments.map((a) => [a.agent_id, a]));

    let nextAssignments: AssignmentRecord[];
    const newlyAddedIds: string[] = [];

    if (mode === 'REPLACE') {
      nextAssignments = uniqueIds.map((agentId) => {
        const existing = currentByAgent.get(agentId);
        if (existing) return existing;
        newlyAddedIds.push(agentId);
        return {
          assignment_id: uuidv4(),
          task_id: taskId,
          agent_id: agentId,
          equipe: equipe || task.equipe || '',
          date_affectation: now,
          statut_agent: 'TRANSMISE',
          motif_blocage_attente: '',
          date_acceptation: '',
          date_debut: '',
          date_fin: '',
        };
      });
    } else {
      nextAssignments = [...currentAssignments];
      for (const agentId of uniqueIds) {
        if (!currentByAgent.has(agentId)) {
          newlyAddedIds.push(agentId);
          nextAssignments.push({
            assignment_id: uuidv4(),
            task_id: taskId,
            agent_id: agentId,
            equipe: equipe || task.equipe || '',
            date_affectation: now,
            statut_agent: 'TRANSMISE',
            motif_blocage_attente: '',
            date_acceptation: '',
            date_debut: '',
            date_fin: '',
          });
        }
      }
    }

    await this.repo.upsertAssignmentsForTask(taskId, nextAssignments);

    const nextGlobal = computeGlobalStatusFromAssignments(
      task.statut_global,
      nextAssignments
    );
    const updatedTask =
      (await this.repo.updateTask(taskId, {
        statut_global: nextGlobal,
        equipe: equipe || task.equipe,
        version: task.version + 1,
        updated_at: now,
      })) || task;

    if (newlyAddedIds.length > 0) {
      await this.notifyAgents(
        newlyAddedIds,
        updatedTask,
        'NOUVELLE_AFFECTATION',
        `Affectation · ${updatedTask.numero_tache}`,
        `Vous êtes affecté à : ${updatedTask.titre} (${updatedTask.commune})`,
        `assign-v${updatedTask.version}`
      );
    }

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'AFFECTATION_AGENTS',
      ancien_etat: task.statut_global,
      nouvel_etat: nextGlobal,
      ancienne_valeur: `${currentAssignments.length} agent(s)`,
      nouvelle_valeur: `${nextAssignments.length} agent(s)`,
      commentaire: `Mise à jour des affectations sur ${task.numero_tache}`,
      date_serveur: now,
    });

    return this.getTaskById(taskId);
  }

  async unassignAgent(
    taskId: string,
    agentId: string,
    actor: AgentRecord
  ): Promise<TaskWithAssignmentsDTO> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');

    const removed = await this.repo.removeAssignment(taskId, agentId);
    if (!removed) {
      throw new ServiceError(404, 'ASSIGNMENT_NOT_FOUND', 'Affectation introuvable.');
    }

    const remaining = await this.repo.listAssignments(taskId);
    const nextGlobal = computeGlobalStatusFromAssignments(task.statut_global, remaining);
    const now = nowIso();

    await this.repo.updateTask(taskId, {
      statut_global: nextGlobal,
      version: task.version + 1,
      updated_at: now,
    });

    const ag = await this.repo.getAgentById(agentId);
    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'RETRAIT_AGENT',
      ancien_etat: task.statut_global,
      nouvel_etat: nextGlobal,
      ancienne_valeur: ag ? `${ag.matricule} ${ag.nom}` : agentId,
      nouvelle_valeur: `${remaining.length} agent(s) restant(s)`,
      commentaire: `Retrait d'un agent de la tâche ${task.numero_tache}`,
      date_serveur: now,
    });

    return this.getTaskById(taskId);
  }

  async changeTaskStatusByChef(
    taskId: string,
    statut: TaskStatus,
    commentaire: string,
    actor: AgentRecord
  ): Promise<TaskWithAssignmentsDTO> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');

    if (statut === 'ANNULÉE' && !commentaire.trim()) {
      throw new ServiceError(
        400,
        'REASON_REQUIRED',
        "Un motif est obligatoire pour annuler une tâche (règle de traçabilité)."
      );
    }

    const now = nowIso();
    const updated =
      (await this.repo.updateTask(taskId, {
        statut_global: statut,
        version: task.version + 1,
        updated_at: now,
      })) || task;

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'CHANGEMENT_STATUT_TACHE',
      ancien_etat: task.statut_global,
      nouvel_etat: statut,
      ancienne_valeur: task.statut_global,
      nouvelle_valeur: statut,
      commentaire: commentaire || `Statut modifié par le chef vers ${statut}`,
      date_serveur: now,
    });

    const assignments = await this.repo.listAssignments(taskId);
    await this.notifyAgents(
      assignments.map((a) => a.agent_id),
      updated,
      'MODIFICATION_TACHE',
      `${updated.numero_tache} · ${statut}`,
      commentaire || `La tâche "${updated.titre}" est passée au statut ${statut}.`,
      `status-v${updated.version}`
    );

    return this.getTaskById(taskId);
  }

  // Phase 4 : Exécution terrain par l'agent affecté
  async updateAgentExecutionStatus(
    taskId: string,
    nextStatus: AgentAssignmentStatus,
    motif: string,
    actor: AgentRecord
  ): Promise<TaskWithAssignmentsDTO> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }

    if (task.statut_global === 'ANNULÉE' || task.statut_global === 'VALIDÉE') {
      throw new ServiceError(
        400,
        'TASK_LOCKED',
        `Cette tâche est au statut ${task.statut_global} et ne peut plus être modifiée sur le terrain.`
      );
    }

    const assignments = await this.repo.listAssignments(taskId);
    const myAssignment = assignments.find((a) => a.agent_id === actor.agent_id);
    if (!myAssignment) {
      throw new ServiceError(
        403,
        'NOT_ASSIGNED',
        "Accès refusé : vous n'êtes pas affecté(e) à cette tâche."
      );
    }

    const cleanMotif = motif.trim();
    if ((nextStatus === 'EN ATTENTE' || nextStatus === 'BLOQUÉE') && cleanMotif.length < 3) {
      throw new ServiceError(
        400,
        'REASON_REQUIRED',
        `Un motif précis (minimum 3 caractères) est obligatoire pour passer au statut ${nextStatus}.`
      );
    }

    const now = nowIso();
    const prevAgentStatus = myAssignment.statut_agent;
    const prevGlobalStatus = task.statut_global;

    const patch: Partial<AssignmentRecord> = {
      statut_agent: nextStatus,
      motif_blocage_attente:
        nextStatus === 'EN ATTENTE' || nextStatus === 'BLOQUÉE' ? cleanMotif : '',
    };

    if (nextStatus === 'ACCEPTÉE') {
      patch.date_acceptation = myAssignment.date_acceptation || now;
    } else if (nextStatus === 'EN COURS') {
      patch.date_acceptation = myAssignment.date_acceptation || now;
      patch.date_debut = myAssignment.date_debut || now;
    } else if (nextStatus === 'TERMINÉE') {
      patch.date_acceptation = myAssignment.date_acceptation || now;
      patch.date_debut = myAssignment.date_debut || now;
      patch.date_fin = now;
    }

    await this.repo.updateAssignment(myAssignment.assignment_id, patch);

    const updatedAssignments = await this.repo.listAssignments(taskId);
    // Si la tâche était REFUSÉE et qu'un agent reprend le travail, réouvrir le statut global
    const baseStatusForCompute: TaskStatus =
      task.statut_global === 'REFUSÉE' && nextStatus === 'EN COURS'
        ? 'EN COURS'
        : task.statut_global;
    const nextGlobal = computeGlobalStatusFromAssignments(
      baseStatusForCompute,
      updatedAssignments
    );

    const updatedTask =
      (await this.repo.updateTask(taskId, {
        statut_global: nextGlobal,
        version: task.version + 1,
        updated_at: now,
      })) || task;

    const actorName = `${actor.prenom} ${actor.nom}`.trim();
    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: actorName,
      action: 'EXECUTION_AGENT_STATUT',
      ancien_etat: prevGlobalStatus,
      nouvel_etat: nextGlobal,
      ancienne_valeur: prevAgentStatus,
      nouvelle_valeur: nextStatus,
      commentaire:
        cleanMotif ||
        `${actorName} (${actor.matricule}) : ${prevAgentStatus} → ${nextStatus}`,
      date_serveur: now,
    });

    // Notifier les Chefs actifs lors des jalons terrain
    const activeChefs = (await this.repo.listAgents()).filter(
      (a) => a.role === 'CHEF' && a.statut === 'ACTIF' && a.agent_id !== actor.agent_id
    );
    if (activeChefs.length > 0) {
      const eventType =
        nextStatus === 'BLOQUÉE'
          ? 'TACHE_BLOQUEE'
          : nextStatus === 'EN ATTENTE'
            ? 'TACHE_EN_ATTENTE'
            : nextStatus === 'TERMINÉE'
              ? 'TACHE_TERMINEE_AGENT'
              : 'EXECUTION_AGENT';

      await this.notifyAgents(
        activeChefs.map((c) => c.agent_id),
        updatedTask,
        eventType,
        `${updatedTask.numero_tache} · ${nextStatus}`,
        cleanMotif
          ? `${actorName} a passé sa mission à ${nextStatus} : ${cleanMotif}`
          : `${actorName} a passé sa mission au statut ${nextStatus} (global : ${nextGlobal}).`,
        `exec-${actor.agent_id}-v${updatedTask.version}`
      );
    }

    return this.getTaskById(taskId);
  }

  // Administration des paramètres (Communes, DP, Catégories, Équipes)
  async createParameter(
    input: {
      categorie: ParamCategory;
      valeur: string;
      libelle: string;
      metadata_json: string;
      actif: boolean;
    },
    actor: AgentRecord
  ): Promise<DistrictParamRecord> {
    const param: DistrictParamRecord = {
      param_id: uuidv4(),
      categorie: input.categorie,
      valeur: input.valeur.toUpperCase(),
      libelle: input.libelle,
      metadata_json: input.metadata_json || '{}',
      actif: input.actif,
    };

    try {
      const created = await this.repo.createParameter(param);
      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: '',
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'AJOUT_PARAMETRE',
        ancien_etat: '',
        nouvel_etat: created.actif ? 'ACTIF' : 'INACTIF',
        ancienne_valeur: '',
        nouvelle_valeur: `${created.categorie} · ${created.valeur} : ${created.libelle}`,
        commentaire: `Ajout paramètre ${created.categorie} (${created.libelle})`,
        date_serveur: nowIso(),
      });
      return created;
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_PARAM') {
        throw new ServiceError(
          409,
          'DUPLICATE_PARAM',
          'Un paramètre avec ce code existe déjà dans cette catégorie.'
        );
      }
      throw err;
    }
  }

  async updateParameter(
    paramId: string,
    patch: Partial<DistrictParamRecord>,
    actor: AgentRecord
  ): Promise<DistrictParamRecord> {
    const updated = await this.repo.updateParameter(paramId, patch);
    if (!updated) {
      throw new ServiceError(404, 'PARAM_NOT_FOUND', 'Paramètre introuvable.');
    }

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'MODIFICATION_PARAMETRE',
      ancien_etat: '',
      nouvel_etat: updated.actif ? 'ACTIF' : 'INACTIF',
      ancienne_valeur: '',
      nouvelle_valeur: `${updated.categorie} · ${updated.valeur} : ${updated.libelle}`,
      commentaire: `Mise à jour du paramètre ${updated.libelle}`,
      date_serveur: nowIso(),
    });

    return updated;
  }
}

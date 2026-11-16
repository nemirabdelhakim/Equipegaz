import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileJsonRepository } from '../src/repositories/FileJsonRepository.js';
import { AgentService, ServiceError } from '../src/services/agentService.js';
import { TaskService } from '../src/services/taskService.js';

function createTempRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-p3-'));
  const filePath = path.join(tmpDir, 'store.json');
  return {
    repo: new FileJsonRepository(filePath),
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test('Phase 3 — Création tâche, affectation multiple, notifications dédupliquées, conflits, annulation et référentiels (Tests 2 & 4)', async () => {
  const { repo, cleanup } = createTempRepo();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];
    assert.equal(chief.role, 'CHEF');

    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);

    // Créer 2 agents actifs + 1 agent inactif
    const ag1 = await agentService.createAgent(
      {
        matricule: 'SA-3001',
        nom: 'Mansouri',
        prenom: 'Sofiane',
        telephone: '0550112233',
        fonction: 'Technicien réseau gaz',
        login_email: 's.mansouri@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const ag2 = await agentService.createAgent(
      {
        matricule: 'SA-3002',
        nom: 'Belaid',
        prenom: 'Nabil',
        telephone: '0550445566',
        fonction: 'Agent intervention',
        login_email: 'n.belaid@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const ag3Inactive = await agentService.createAgent(
      {
        matricule: 'SA-3003',
        nom: 'Ziani',
        prenom: 'Amine',
        telephone: '0550778899',
        fonction: 'Agent stagiaire',
        login_email: 'a.ziani@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'INACTIF',
      },
      chief
    );

    // 1. TEST 2 : Création de tâche numérotée GAZ-SA-YYYY-000001 + affectation collective de 2 agents
    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
    }).format(new Date());

    const createdTask = await taskService.createTask(
      {
        titre: 'Recherche de fuite canalisation MPB',
        categorie: 'FUG',
        description: 'Odeur de gaz signalée près du poste de détente.',
        instructions: 'Vérifier au détecteur portable et sécuriser le périmètre.',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Rue Emir Abdelkader',
        repere_geo: 'Face à la poste',
        latitude: '36.098700',
        longitude: '0.417800',
        priorite: 'URGENTE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '09:00',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe Urgence Sidi Ali',
        materiel_necessaire: 'Détecteur gaz, manomètre, clés vanne',
        observations: 'Intervention prioritaire',
        assigned_agent_ids: [ag1.agent.agent_id, ag2.agent.agent_id],
      },
      chief
    );

    assert.equal(createdTask.numero_tache, `GAZ-SA-${year}-000001`);
    assert.equal(createdTask.statut_global, 'TRANSMISE');
    assert.equal(createdTask.version, 1);
    assert.equal(createdTask.assignments.length, 2);

    // Vérifier que les notifications ont été générées sans doublon pour les 2 agents
    const notifAg1 = await repo.listNotificationsByUser(ag1.agent.agent_id);
    const notifAg2 = await repo.listNotificationsByUser(ag2.agent.agent_id);
    assert.equal(notifAg1.length, 1);
    assert.equal(notifAg2.length, 1);
    assert.equal(notifAg1[0].type_event, 'TACHE_URGENTE');

    // Vérifier la déduplication stricte avec le même dedup_key
    const dupInsert = await repo.createNotificationIfUnique({ ...notifAg1[0] });
    assert.equal(dupInsert, null);
    assert.equal((await repo.listNotificationsByUser(ag1.agent.agent_id)).length, 1);

    // 2. Refuser l'affectation d'un agent INACTIF
    await assert.rejects(
      () =>
        taskService.assignAgents(
          createdTask.task_id,
          [ag3Inactive.agent.agent_id],
          'Équipe A',
          'ADD',
          chief
        ),
      (err: unknown) => err instanceof ServiceError && err.code === 'AGENT_NOT_ACTIVE'
    );

    // 3. TEST 4 : Visibilité collective (listAllTasks renvoie la tâche pour tous les agents)
    const allTasks = await taskService.listAllTasks();
    assert.equal(allTasks.length, 1);
    assert.equal(allTasks[0].task_id, createdTask.task_id);

    // 4. Modification de priorité + détection de conflit optimiste (409 VERSION_CONFLICT)
    const updatedTask = await taskService.updateTask(
      createdTask.task_id,
      {
        priorite: 'HAUTE',
        expected_version: 1,
      },
      chief
    );
    assert.equal(updatedTask.priorite, 'HAUTE');
    assert.equal(updatedTask.version, 2);

    await assert.rejects(
      () =>
        taskService.updateTask(
          createdTask.task_id,
          {
            titre: 'Modification concurrente obsolète',
            expected_version: 1,
          },
          chief
        ),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 409 && err.code === 'VERSION_CONFLICT'
    );

    // Vérifier l'historique & la notification de changement de priorité
    const history = await repo.listHistory({ limit: 50 });
    assert.ok(history.some((h) => h.action === 'CREATION_TACHE'));
    assert.ok(history.some((h) => h.action === 'MODIFICATION_PRIORITE'));
    assert.equal((await repo.listNotificationsByUser(ag1.agent.agent_id)).length, 2);

    // 5. Retrait d'un agent
    const afterUnassign = await taskService.unassignAgent(
      createdTask.task_id,
      ag2.agent.agent_id,
      chief
    );
    assert.equal(afterUnassign.assignments.length, 1);

    // 6. Annulation avec motif obligatoire
    await assert.rejects(
      () => taskService.changeTaskStatusByChef(createdTask.task_id, 'ANNULÉE', '   ', chief),
      (err: unknown) => err instanceof ServiceError && err.code === 'REASON_REQUIRED'
    );

    const cancelled = await taskService.changeTaskStatusByChef(
      createdTask.task_id,
      'ANNULÉE',
      'Fausse alerte confirmée sur place',
      chief
    );
    assert.equal(cancelled.statut_global, 'ANNULÉE');

    // 7. Administration dynamique des paramètres (Commune, DP, Équipe) + rejet doublon
    const newTeam = await taskService.createParameter(
      {
        categorie: 'EQUIPE',
        valeur: 'EQ-A',
        libelle: 'Équipe Intervention Nord',
        metadata_json: JSON.stringify({ member_ids: [ag1.agent.agent_id, ag2.agent.agent_id] }),
        actif: true,
      },
      chief
    );
    assert.equal(newTeam.valeur, 'EQ-A');

    await assert.rejects(
      () =>
        taskService.createParameter(
          {
            categorie: 'EQUIPE',
            valeur: 'eq-a',
            libelle: 'Doublon',
            metadata_json: '{}',
            actif: true,
          },
          chief
        ),
      (err: unknown) => err instanceof ServiceError && err.code === 'DUPLICATE_PARAM'
    );
  } finally {
    cleanup();
  }
});

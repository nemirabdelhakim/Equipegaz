import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { FileJsonRepository } from '../src/repositories/FileJsonRepository.js';
import { createApiRouter } from '../src/routes/apiRoutes.js';
import { AgentService, ServiceError } from '../src/services/agentService.js';
import { AuthService } from '../src/services/authService.js';
import { TaskService } from '../src/services/taskService.js';

function createTempRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-p4-'));
  const filePath = path.join(tmpDir, 'store.json');
  return {
    repo: new FileJsonRepository(filePath),
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test('Phase 4 — Exécution terrain agent, motifs obligatoires, statut global multi-agents et RBAC strict (Tests 3, 5, 11)', async () => {
  const { repo, cleanup } = createTempRepo();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];

    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);

    const ag1 = await agentService.createAgent(
      {
        matricule: 'SA-4001',
        nom: 'Kaddour',
        prenom: 'Bilal',
        telephone: '0551111111',
        fonction: 'Technicien réseau',
        login_email: 'b.kaddour@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const ag2 = await agentService.createAgent(
      {
        matricule: 'SA-4002',
        nom: 'Haddad',
        prenom: 'Farid',
        telephone: '0552222222',
        fonction: 'Technicien réseau',
        login_email: 'f.haddad@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const ag3Unassigned = await agentService.createAgent(
      {
        matricule: 'SA-4003',
        nom: 'Moussaoui',
        prenom: 'Samir',
        telephone: '0553333333',
        fonction: 'Agent polyvalent',
        login_email: 's.moussaoui@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const ag1Record = (await repo.getAgentById(ag1.agent.agent_id))!;
    const ag2Record = (await repo.getAgentById(ag2.agent.agent_id))!;
    const ag3Record = (await repo.getAgentById(ag3Unassigned.agent.agent_id))!;

    // Créer une tâche collective affectée à ag1 et ag2
    const task = await taskService.createTask(
      {
        titre: 'Entretien vanne DP Sidi Lakhdar',
        categorie: 'VAN',
        description: 'Graissage et contrôle étanchéité vanne principale.',
        instructions: 'Contrôler la pression aval après manœuvre.',
        commune: 'Sidi Lakhdar',
        dp: 'DP Sidi Lakhdar',
        adresse: 'Route Nationale 11',
        repere_geo: 'Près de la station',
        latitude: '',
        longitude: '',
        priorite: 'HAUTE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '08:30',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe Maintenance',
        materiel_necessaire: 'Clé vanne, détecteur',
        observations: '',
        assigned_agent_ids: [ag1Record.agent_id, ag2Record.agent_id],
      },
      chief
    );
    assert.equal(task.statut_global, 'TRANSMISE');

    // 1. Agent non affecté (ag3) bloqué avec 403 NOT_ASSIGNED
    await assert.rejects(
      () =>
        taskService.updateAgentExecutionStatus(
          task.task_id,
          'ACCEPTÉE',
          '',
          ag3Record
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 403 && err.code === 'NOT_ASSIGNED'
    );

    // 2. ag1 accepte puis démarre
    const afterAccept = await taskService.updateAgentExecutionStatus(
      task.task_id,
      'ACCEPTÉE',
      '',
      ag1Record
    );
    assert.equal(afterAccept.statut_global, 'ACCEPTÉE');
    assert.equal(
      afterAccept.assignments.find((a) => a.agent_id === ag1Record.agent_id)?.statut_agent,
      'ACCEPTÉE'
    );

    const afterStart = await taskService.updateAgentExecutionStatus(
      task.task_id,
      'EN COURS',
      '',
      ag1Record
    );
    assert.equal(afterStart.statut_global, 'EN COURS');
    const ag1StartAsg = afterStart.assignments.find((a) => a.agent_id === ag1Record.agent_id);
    assert.ok(ag1StartAsg?.date_debut);

    // 3. EN ATTENTE / BLOQUÉE exigent un motif obligatoire (400 REASON_REQUIRED)
    await assert.rejects(
      () =>
        taskService.updateAgentExecutionStatus(
          task.task_id,
          'EN ATTENTE',
          '  ',
          ag1Record
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 400 && err.code === 'REASON_REQUIRED'
    );

    await assert.rejects(
      () =>
        taskService.updateAgentExecutionStatus(
          task.task_id,
          'BLOQUÉE',
          'ok',
          ag1Record
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 400 && err.code === 'REASON_REQUIRED'
    );

    // 4. Signalement BLOQUÉE valide -> alerte Chef + statut global BLOQUÉE
    const afterBlock = await taskService.updateAgentExecutionStatus(
      task.task_id,
      'BLOQUÉE',
      'Regard vanne inondé, pompe requise',
      ag1Record
    );
    assert.equal(afterBlock.statut_global, 'BLOQUÉE');
    assert.equal(
      afterBlock.assignments.find((a) => a.agent_id === ag1Record.agent_id)
        ?.motif_blocage_attente,
      'Regard vanne inondé, pompe requise'
    );
    const chiefNotifs = await repo.listNotificationsByUser(chief.agent_id);
    assert.ok(chiefNotifs.some((n) => n.type_event === 'TACHE_BLOQUEE'));

    // 5. Reprise et clôture collective (ag1 + ag2) -> statut global TERMINÉE
    await taskService.updateAgentExecutionStatus(task.task_id, 'EN COURS', '', ag1Record);
    const afterAg1Done = await taskService.updateAgentExecutionStatus(
      task.task_id,
      'TERMINÉE',
      'Graissage effectué',
      ag1Record
    );
    // ag2 n'a pas encore terminé -> reste EN COURS
    assert.equal(afterAg1Done.statut_global, 'EN COURS');

    const afterAllDone = await taskService.updateAgentExecutionStatus(
      task.task_id,
      'TERMINÉE',
      'Contrôle pression conforme',
      ag2Record
    );
    assert.equal(afterAllDone.statut_global, 'TERMINÉE');
    assert.ok(
      afterAllDone.assignments.every(
        (a) => a.statut_agent === 'TERMINÉE' && Boolean(a.date_fin)
      )
    );

    // 6. Une tâche annulée bloque toute mise à jour agent (400 TASK_LOCKED)
    await taskService.changeTaskStatusByChef(
      task.task_id,
      'ANNULÉE',
      'Doublon de saisie',
      chief
    );
    await assert.rejects(
      () =>
        taskService.updateAgentExecutionStatus(
          task.task_id,
          'EN COURS',
          '',
          ag1Record
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 400 && err.code === 'TASK_LOCKED'
    );
  } finally {
    cleanup();
  }
});

test('Phase 4 — Contrôle RBAC HTTP strict sur routes /api/tasks et /api/agents (Test 11)', async () => {
  // Vérifier via le routeur Express réel que AGENT reçoit 403 sur les routes CHEF
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}/api`;

    // Utiliser un repo temporaire via login d'un agent créé sur le singleton? Non, testons le rejet 401 sans token et 403 avec un token AGENT signé
    const resNoAuth = await fetch(`${baseUrl}/tasks`);
    assert.equal(resNoAuth.status, 401);

    const { getDataRepository } = await import('../src/repositories/repositoryInstance.js');
    const activeRepo = getDataRepository();
    await activeRepo.init();
    const beforeSnapshot = await activeRepo.exportSnapshot();

    try {
      const activeChief = (await activeRepo.listAgents()).find((a) => a.role === 'CHEF')!;
      const activeAgentService = new AgentService(activeRepo);
      const activeAuthService = new AuthService(activeRepo);
      const activeTaskService = new TaskService(activeRepo);

      const uniqueSuffix = Date.now();
      const tempAgent = await activeAgentService.createAgent(
        {
          matricule: `RBAC-${uniqueSuffix}`,
          nom: 'RbacTest',
          prenom: 'Agent',
          telephone: '0559999999',
          fonction: 'Test RBAC',
          login_email: `rbac-${uniqueSuffix}@sonelgaz-sidiali.dz`,
          role: 'AGENT',
          statut: 'ACTIF',
        },
        activeChief
      );

      const tempTask = await activeTaskService.createTask(
        {
          titre: 'Test RBAC HTTP',
          categorie: 'FUG',
          description: 'Vérification HTTP RBAC',
          instructions: '',
          commune: 'Sidi Ali',
          dp: 'DP Sidi Ali Centre',
          adresse: 'Centre',
          repere_geo: '',
          latitude: '',
          longitude: '',
          priorite: 'NORMALE',
          date_debut_prevue: '2026-11-16',
          heure_prevue: '09:00',
          date_fin_prevue: '2026-11-16',
          equipe: '',
          materiel_necessaire: '',
          observations: '',
          assigned_agent_ids: [],
        },
        activeChief
      );

      const loginRes = await activeAuthService.loginWithCredentials(
        tempAgent.agent.matricule,
        tempAgent.temporaryPassword,
        'test-rbac-device',
        'WEB'
      );

      // AGENT essaie de créer une tâche -> 403 FORBIDDEN
      const createTaskAttempt = await fetch(`${baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginRes.token}`,
        },
        body: JSON.stringify({ titre: 'Tentative non autorisée' }),
      });
      assert.equal(createTaskAttempt.status, 403);

      // AGENT essaie de créer un agent -> 403 FORBIDDEN
      const createAgentAttempt = await fetch(`${baseUrl}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginRes.token}`,
        },
        body: JSON.stringify({ matricule: 'HACK-01' }),
      });
      assert.equal(createAgentAttempt.status, 403);

      // AGENT peut consulter les tâches (visibilité collective) -> 200 OK
      const listTasksAttempt = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${loginRes.token}` },
      });
      assert.equal(listTasksAttempt.status, 200);

      // AGENT non affecté essaie de changer le statut -> 403 NOT_ASSIGNED
      const unassignedExecAttempt = await fetch(
        `${baseUrl}/tasks/${tempTask.task_id}/my-status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${loginRes.token}`,
          },
          body: JSON.stringify({ statut_agent: 'EN COURS' }),
        }
      );
      assert.equal(unassignedExecAttempt.status, 403);

      // Affecter l'agent -> désormais PATCH /my-status -> 200 OK
      await activeTaskService.assignAgents(
        tempTask.task_id,
        [tempAgent.agent.agent_id],
        '',
        'ADD',
        activeChief
      );
      const assignedExecAttempt = await fetch(
        `${baseUrl}/tasks/${tempTask.task_id}/my-status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${loginRes.token}`,
          },
          body: JSON.stringify({ statut_agent: 'ACCEPTÉE' }),
        }
      );
      assert.equal(assignedExecAttempt.status, 200);
    } finally {
      await activeRepo.restoreSnapshot(beforeSnapshot);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

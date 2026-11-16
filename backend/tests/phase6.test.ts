import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { FileJsonRepository } from '../src/repositories/FileJsonRepository.js';
import { createApiRouter } from '../src/routes/apiRoutes.js';
import { AgentService } from '../src/services/agentService.js';
import { AuthService } from '../src/services/authService.js';
import { ReportService } from '../src/services/reportService.js';
import { SyncService } from '../src/services/syncService.js';
import { TaskService } from '../src/services/taskService.js';

function createTempEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-p6-'));
  const filePath = path.join(tmpDir, 'store.json');
  const uploadsDir = path.join(tmpDir, 'uploads');
  return {
    filePath,
    repo: new FileJsonRepository(filePath),
    uploadsDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

const SAMPLE_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Phase 6 — File hors-ligne, mappage photos locales, déduplication UUID & persistance (Tests 7, 8, 14)', async () => {
  const { filePath, repo, uploadsDir, cleanup } = createTempEnv();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];
    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);
    const reportService = new ReportService(repo, undefined, uploadsDir);
    const syncService = new SyncService(repo, undefined, uploadsDir);

    const agCreated = await agentService.createAgent(
      {
        matricule: 'SA-6001',
        nom: 'Kaddour',
        prenom: 'Sofiane',
        telephone: '0556111111',
        fonction: 'Technicien gaz',
        login_email: 's.kaddour@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const agent = (await repo.getAgentById(agCreated.agent.agent_id))!;

    const task = await taskService.createTask(
      {
        titre: 'Contrôle fuite branchement Hai El Nasr',
        categorie: 'FUG',
        description: 'Recherche de fuite signalée devant coffret abonné.',
        instructions: 'Photo avant/après et relevé détecteur gaz.',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Hai El Nasr, Lot 8',
        repere_geo: 'Coffret n°22',
        latitude: '36.101000',
        longitude: '0.419000',
        priorite: 'URGENTE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '08:00',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe A',
        materiel_necessaire: 'Détecteur gaz + raccords',
        observations: '',
        assigned_agent_ids: [agent.agent_id],
      },
      chief
    );

    const opStatusId = crypto.randomUUID();
    const opPhotoId = crypto.randomUUID();
    const opReportId = crypto.randomUUID();
    const localPhotoId = `local-${crypto.randomUUID()}`;
    const offlineTime = new Date().toISOString();

    // 1. Pousser le lot hors-ligne complet : Statut -> Photo locale -> Compte-rendu référençant la photo locale
    const pushRes = await syncService.pushBatch(
      'android-field-01',
      [
        {
          operation_id: opStatusId,
          type_operation: 'TASK_AGENT_STATUS',
          target_id: task.task_id,
          client_timestamp: offlineTime,
          base_version: task.version,
          payload: {
            statut_agent: 'EN COURS',
            motif: '',
          },
        },
        {
          operation_id: opPhotoId,
          type_operation: 'PHOTO_UPLOAD',
          target_id: task.task_id,
          client_timestamp: offlineTime,
          local_photo_id: localPhotoId,
          payload: {
            type_photo: 'AVANT',
            file_name: 'fuite_avant.png',
            mime_type: 'image/png',
            data_base64: SAMPLE_PNG_BASE64,
          },
        },
        {
          operation_id: opReportId,
          type_operation: 'REPORT_SUBMIT',
          target_id: task.task_id,
          client_timestamp: offlineTime,
          base_version: task.version,
          payload: {
            travail_effectue: 'Reserrage raccord entrée coffret et test étanchéité complet.',
            resultat: 'Aucune fuite résiduelle détectée au détecteur.',
            difficultes: 'Zone hors couverture mobile lors de l’intervention.',
            materiel: '1 joint gaz DN20',
            travaux_restants: '',
            recommandations: '',
            temps_passe_minutes: 40,
            photo_ids: [localPhotoId],
          },
        },
      ],
      agent
    );

    assert.equal(pushRes.results.length, 3);
    assert.ok(pushRes.results.every((r) => r.statut === 'SYNCHRONISÉ' && !r.duplicate));
    const mappedPhotoId = pushRes.results[1]?.mapped_photo_id;
    assert.ok(mappedPhotoId && !mappedPhotoId.startsWith('local-'));

    const taskAfter = await repo.getTaskById(task.task_id);
    assert.equal(taskAfter?.statut_global, 'À VALIDER');

    const reportsAfter = await reportService.listTaskReportsAndPhotos(task.task_id);
    assert.equal(reportsAfter.reports.length, 1);
    assert.equal(reportsAfter.reports[0]?.version, 1);
    assert.equal(reportsAfter.reports[0]?.photos.length, 1);
    assert.equal(reportsAfter.reports[0]?.photos[0]?.photo_id, mappedPhotoId);

    // 2. TEST 8 : Rejeu exactement identique du même lot UUID -> 0 doublon créé
    const replayRes = await syncService.pushBatch(
      'android-field-01',
      [
        {
          operation_id: opStatusId,
          type_operation: 'TASK_AGENT_STATUS',
          target_id: task.task_id,
          client_timestamp: offlineTime,
          base_version: task.version,
          payload: { statut_agent: 'EN COURS', motif: '' },
        },
        {
          operation_id: opPhotoId,
          type_operation: 'PHOTO_UPLOAD',
          target_id: task.task_id,
          client_timestamp: offlineTime,
          local_photo_id: localPhotoId,
          payload: {
            type_photo: 'AVANT',
            file_name: 'fuite_avant.png',
            mime_type: 'image/png',
            data_base64: SAMPLE_PNG_BASE64,
          },
        },
        {
          operation_id: opReportId,
          type_operation: 'REPORT_SUBMIT',
          target_id: task.task_id,
          client_timestamp: offlineTime,
          base_version: task.version,
          payload: {
            travail_effectue: 'Reserrage raccord entrée coffret et test étanchéité complet.',
            resultat: 'Aucune fuite résiduelle détectée au détecteur.',
            difficultes: '',
            materiel: '1 joint gaz DN20',
            travaux_restants: '',
            recommandations: '',
            temps_passe_minutes: 40,
            photo_ids: [localPhotoId],
          },
        },
      ],
      agent
    );

    assert.equal(replayRes.results.length, 3);
    assert.ok(replayRes.results.every((r) => r.statut === 'SYNCHRONISÉ' && r.duplicate === true));

    const reportsAfterReplay = await reportService.listTaskReportsAndPhotos(task.task_id);
    assert.equal(reportsAfterReplay.reports.length, 1);
    assert.equal(reportsAfterReplay.photos.length, 1);

    // 3. TEST 14 : Ré-instanciation du dépôt (redémarrage) -> opérations SYNCHRONISATION & snapshot intactes
    const reopenedRepo = new FileJsonRepository(filePath);
    await reopenedRepo.init();
    const persistedOps = await reopenedRepo.listSyncOperations({ userId: agent.agent_id });
    assert.equal(persistedOps.length, 3);
    assert.ok(persistedOps.some((o) => o.operation_id === opReportId && o.statut === 'SYNCHRONISÉ'));
  } finally {
    cleanup();
  }
});

test('Phase 6 — Modifications simultanées sans conflit (Test 15) & Détection conflit optimiste (Test 16)', async () => {
  const { repo, uploadsDir, cleanup } = createTempEnv();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];
    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);
    const syncService = new SyncService(repo, undefined, uploadsDir);

    const a1 = await agentService.createAgent(
      {
        matricule: 'SA-6010',
        nom: 'Mansouri',
        prenom: 'Riad',
        telephone: '0556333333',
        fonction: 'Agent gaz',
        login_email: 'r.mansouri@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const a2 = await agentService.createAgent(
      {
        matricule: 'SA-6011',
        nom: 'Ferhat',
        prenom: 'Walid',
        telephone: '0556444444',
        fonction: 'Agent gaz',
        login_email: 'w.ferhat@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const agent1 = (await repo.getAgentById(a1.agent.agent_id))!;
    const agent2 = (await repo.getAgentById(a2.agent.agent_id))!;

    const task1 = await taskService.createTask(
      {
        titre: 'Intervention poste détente T1',
        categorie: 'PRE',
        description: 'Contrôle pression aval poste T1.',
        instructions: '',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Route de Mostaganem',
        repere_geo: '',
        latitude: '',
        longitude: '',
        priorite: 'NORMALE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '09:00',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe A',
        materiel_necessaire: '',
        observations: '',
        assigned_agent_ids: [agent1.agent_id],
      },
      chief
    );

    const task2 = await taskService.createTask(
      {
        titre: 'Coupure abonnés impayés T2',
        categorie: 'COU',
        description: 'Coupure préventive T2.',
        instructions: '',
        commune: 'Ouled Maallah',
        dp: 'DP Ouled Maallah',
        adresse: 'Centre village',
        repere_geo: '',
        latitude: '',
        longitude: '',
        priorite: 'BASSE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '10:30',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe B',
        materiel_necessaire: '',
        observations: '',
        assigned_agent_ids: [agent2.agent_id],
      },
      chief
    );

    // TEST 15 : Deux utilisateurs modifient deux tâches différentes simultanément -> aucune perte
    const [res1, res2] = await Promise.all([
      syncService.pushBatch(
        'tel-agent-1',
        [
          {
            operation_id: crypto.randomUUID(),
            type_operation: 'TASK_AGENT_STATUS',
            target_id: task1.task_id,
            client_timestamp: new Date().toISOString(),
            base_version: task1.version,
            payload: { statut_agent: 'EN COURS', motif: '' },
          },
        ],
        agent1
      ),
      syncService.pushBatch(
        'tel-agent-2',
        [
          {
            operation_id: crypto.randomUUID(),
            type_operation: 'TASK_AGENT_STATUS',
            target_id: task2.task_id,
            client_timestamp: new Date().toISOString(),
            base_version: task2.version,
            payload: { statut_agent: 'EN COURS', motif: '' },
          },
        ],
        agent2
      ),
    ]);

    assert.equal(res1.results[0]?.statut, 'SYNCHRONISÉ');
    assert.equal(res2.results[0]?.statut, 'SYNCHRONISÉ');
    assert.equal((await repo.getTaskById(task1.task_id))?.statut_global, 'EN COURS');
    assert.equal((await repo.getTaskById(task2.task_id))?.statut_global, 'EN COURS');

    // TEST 16 : Conflit de version explicite
    const latestTask1 = (await repo.getTaskById(task1.task_id))!;
    const staleTimestamp = new Date(Date.now() - 60000).toISOString();
    const updatedByChef = await taskService.updateTask(
      task1.task_id,
      {
        priorite: 'URGENTE',
        expected_version: latestTask1.version,
      },
      chief
    );
    assert.equal(updatedByChef.version, latestTask1.version + 1);

    // 1) Modification Chef hors-ligne basée sur l'ancienne version -> CONFLIT (server_version = v3)
    const chefConflictRes = await syncService.pushBatch(
      'pc-chef-offline',
      [
        {
          operation_id: crypto.randomUUID(),
          type_operation: 'TASK_UPDATE',
          target_id: task1.task_id,
          client_timestamp: staleTimestamp,
          base_version: latestTask1.version,
          payload: {
            titre: 'Modification tardive hors-ligne',
            expected_version: latestTask1.version,
          },
        },
      ],
      chief
    );
    assert.equal(chefConflictRes.results[0]?.statut, 'CONFLIT');
    assert.equal(chefConflictRes.results[0]?.server_version, updatedByChef.version);

    // 2) Transition agent basée sur version antérieure après modification Chef postérieure -> CONFLIT détecté
    const agentConflictRes = await syncService.pushBatch(
      'tel-agent-1',
      [
        {
          operation_id: crypto.randomUUID(),
          type_operation: 'TASK_AGENT_STATUS',
          target_id: task1.task_id,
          client_timestamp: staleTimestamp,
          base_version: latestTask1.version,
          payload: { statut_agent: 'TERMINÉE', motif: 'Terminé hors-ligne avant modif chef' },
        },
      ],
      agent1
    );
    assert.equal(agentConflictRes.results[0]?.statut, 'CONFLIT');
    assert.equal(agentConflictRes.results[0]?.server_version, updatedByChef.version);
  } finally {
    cleanup();
  }
});

test('Phase 6 — Endpoints HTTP /api/sync/push, /api/sync/pull, /api/sync/status & validation UUID', async () => {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}/api`;

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
          matricule: `P6-HTTP-${uniqueSuffix}`,
          nom: 'SyncHttp',
          prenom: 'Test',
          telephone: '0559999999',
          fonction: 'Agent gaz',
          login_email: `p6-${uniqueSuffix}@sonelgaz-sidiali.dz`,
          role: 'AGENT',
          statut: 'ACTIF',
        },
        activeChief
      );

      const tempTask = await activeTaskService.createTask(
        {
          titre: 'Test HTTP Sync Phase 6',
          categorie: 'REL',
          description: 'Vérification endpoint sync pull/push/status.',
          instructions: '',
          commune: 'Sidi Ali',
          dp: 'DP Sidi Ali Centre',
          adresse: 'Rue de la Poste',
          repere_geo: '',
          latitude: '',
          longitude: '',
          priorite: 'NORMALE',
          date_debut_prevue: '2026-11-16',
          heure_prevue: '11:00',
          date_fin_prevue: '2026-11-16',
          equipe: '',
          materiel_necessaire: '',
          observations: '',
          assigned_agent_ids: [tempAgent.agent.agent_id],
        },
        activeChief
      );

      const loginRes = await activeAuthService.loginWithCredentials(
        tempAgent.agent.matricule,
        tempAgent.temporaryPassword,
        'test-p6-http',
        'WEB'
      );

      // 1. /api/sync/pull retourne snapshot complet
      const pullRes = await fetch(`${baseUrl}/sync/pull`, {
        headers: { Authorization: `Bearer ${loginRes.token}` },
      });
      assert.equal(pullRes.status, 200);
      const pullJson = (await pullRes.json()) as {
        snapshot: { tasks: Array<{ task_id: string }> };
      };
      assert.ok(pullJson.snapshot.tasks.some((t) => t.task_id === tempTask.task_id));

      // 2. /api/sync/push rejette un operation_id non-UUID (400)
      const invalidUuidRes = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginRes.token}`,
        },
        body: JSON.stringify({
          device_id: 'web-test',
          operations: [
            {
              operation_id: 'not-a-valid-uuid',
              type_operation: 'TASK_AGENT_STATUS',
              target_id: tempTask.task_id,
              client_timestamp: new Date().toISOString(),
              payload: { statut_agent: 'ACCEPTÉE', motif: '' },
            },
          ],
        }),
      });
      assert.equal(invalidUuidRes.status, 400);

      // 3. /api/sync/push valide avec UUID
      const validOpId = crypto.randomUUID();
      const pushRes = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginRes.token}`,
        },
        body: JSON.stringify({
          device_id: 'web-test',
          operations: [
            {
              operation_id: validOpId,
              type_operation: 'TASK_AGENT_STATUS',
              target_id: tempTask.task_id,
              client_timestamp: new Date().toISOString(),
              base_version: tempTask.version,
              payload: { statut_agent: 'ACCEPTÉE', motif: '' },
            },
          ],
        }),
      });
      assert.equal(pushRes.status, 200);
      const pushJson = (await pushRes.json()) as {
        results: Array<{ operation_id: string; statut: string }>;
      };
      assert.equal(pushJson.results[0]?.operation_id, validOpId);
      assert.equal(pushJson.results[0]?.statut, 'SYNCHRONISÉ');

      // 4. /api/sync/status expose l'opération synchronisée
      const statusRes = await fetch(`${baseUrl}/sync/status`, {
        headers: { Authorization: `Bearer ${loginRes.token}` },
      });
      assert.equal(statusRes.status, 200);
      const statusJson = (await statusRes.json()) as {
        operations: Array<{ operation_id: string; statut: string }>;
      };
      assert.ok(
        statusJson.operations.some(
          (o) => o.operation_id === validOpId && o.statut === 'SYNCHRONISÉ'
        )
      );
    } finally {
      await activeRepo.restoreSnapshot(beforeSnapshot);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

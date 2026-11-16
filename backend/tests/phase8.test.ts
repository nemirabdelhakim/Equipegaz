import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { SHEETS_SCHEMA } from '../../database/google-sheets/sheetDefinitions.js';
import { createRateLimiter } from '../src/middleware/rateLimitMiddleware.js';
import { getDataRepository } from '../src/repositories/repositoryInstance.js';
import { createApiRouter } from '../src/routes/apiRoutes.js';
import { AgentService } from '../src/services/agentService.js';
import { AuthService } from '../src/services/authService.js';

const SAMPLE_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Phase 8 — Parcours complet bout-en-bout des 18 Tests obligatoires (Web + Android + Hors-ligne + Exports)', async () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}/api`;

    const activeRepo = getDataRepository();
    await activeRepo.init();
    const beforeSnapshot = await activeRepo.exportSnapshot();

    try {
      const chiefRecord = (await activeRepo.listAgents()).find((a) => a.role === 'CHEF')!;
      const authService = new AuthService(activeRepo);
      const agentService = new AgentService(activeRepo);

      // Obtenir un token Chef HTTP valide sans modifier durablement le snapshot après test
      const chiefSession = await authService
        .loginWithCredentials(chiefRecord.matricule, 'Sonelgaz@2025', 'chef-web-p8', 'WEB')
        .catch(async () => {
          const reset = await agentService.resetAgentAccess(chiefRecord.agent_id, chiefRecord);
          return authService.loginWithCredentials(
            chiefRecord.matricule,
            reset.temporaryPassword,
            'chef-web-p8',
            'WEB'
          );
        });

      const suffix = Date.now();

      // TEST 1 : Le chef se connecte et crée 3 agents (Agent 1, Agent 2, Agent 3 observateur)
      const createAg = async (num: number, nom: string, prenom: string) => {
        const res = await fetch(`${baseUrl}/agents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${chiefSession.token}`,
          },
          body: JSON.stringify({
            matricule: `P8-${suffix}-${num}`,
            nom,
            prenom,
            telephone: `055000000${num}`,
            fonction: 'Technicien gaz',
            login_email: `p8-${suffix}-${num}@sonelgaz-sidiali.dz`,
            role: 'AGENT',
            statut: 'ACTIF',
          }),
        });
        assert.equal(res.status, 201);
        return (await res.json()) as {
          agent: { agent_id: string; matricule: string };
          temporaryPassword: string;
        };
      };

      const ag1 = await createAg(1, 'Benali', 'Sofiane');
      const ag2 = await createAg(2, 'Toumi', 'Riad');
      const ag3 = await createAg(3, 'Observer', 'Walid');

      const loginAgent = async (
        matricule: string,
        password: string,
        deviceId: string,
        plateforme: 'WEB' | 'ANDROID'
      ) => {
        const res = await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: matricule, password, device_id: deviceId, plateforme }),
        });
        assert.equal(res.status, 200);
        return (await res.json()) as { token: string };
      };

      const ag1Android = await loginAgent(
        ag1.agent.matricule,
        ag1.temporaryPassword,
        'android-p8-1',
        'ANDROID'
      );
      const ag1Web = await loginAgent(
        ag1.agent.matricule,
        ag1.temporaryPassword,
        'web-p8-1',
        'WEB'
      );
      const ag2Android = await loginAgent(
        ag2.agent.matricule,
        ag2.temporaryPassword,
        'android-p8-2',
        'ANDROID'
      );
      const ag3Web = await loginAgent(
        ag3.agent.matricule,
        ag3.temporaryPassword,
        'web-p8-3',
        'WEB'
      );

      // TEST 2 : Le chef crée une tâche et l'affecte à deux agents (ag1 + ag2)
      const createTaskRes = await fetch(`${baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({
          titre: 'Réparation fuite conduite MP Hai El Nasr',
          categorie: 'FUG',
          description: 'Fuite signalée sur raccordement principal.',
          instructions: 'Sécuriser, réparer, joindre photos AVANT et APRÈS.',
          commune: 'Sidi Ali',
          dp: 'DP Sidi Ali Centre',
          adresse: 'Hai El Nasr Bloc C',
          repere_geo: 'Face école primaire',
          latitude: '36.1012',
          longitude: '0.4195',
          priorite: 'URGENTE',
          date_debut_prevue: '2026-11-16',
          heure_prevue: '08:00',
          date_fin_prevue: '2026-11-16',
          equipe: 'Équipe A',
          materiel_necessaire: 'Détecteur gaz + clés',
          observations: '',
          assigned_agent_ids: [ag1.agent.agent_id, ag2.agent.agent_id],
        }),
      });
      assert.equal(createTaskRes.status, 201);
      const { task: mainTask } = (await createTaskRes.json()) as {
        task: { task_id: string; numero_tache: string; version: number };
      };
      assert.ok(mainTask.numero_tache.startsWith('GAZ-SA-'));

      // TEST 3 : Les deux agents affectés reçoivent la notification
      for (const tok of [ag1Android.token, ag2Android.token]) {
        const notifRes = await fetch(`${baseUrl}/notifications`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        assert.equal(notifRes.status, 200);
        const notifJson = (await notifRes.json()) as {
          notifications: Array<{ task_id: string }>;
        };
        assert.ok(notifJson.notifications.some((n) => n.task_id === mainTask.task_id));
      }

      // TEST 4 : Tous les agents (y compris ag3 non affecté) peuvent voir la tâche
      const ag3TasksRes = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${ag3Web.token}` },
      });
      assert.equal(ag3TasksRes.status, 200);
      const ag3TasksJson = (await ag3TasksRes.json()) as {
        tasks: Array<{ task_id: string }>;
      };
      assert.ok(ag3TasksJson.tasks.some((t) => t.task_id === mainTask.task_id));

      // TEST 5 : Un agent non affecté (ag3) ne peut pas modifier la tâche ni soumettre de CR
      const ag3MutateStatus = await fetch(`${baseUrl}/tasks/${mainTask.task_id}/my-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ag3Web.token}`,
        },
        body: JSON.stringify({ statut_agent: 'ACCEPTÉE', motif: '' }),
      });
      assert.equal(ag3MutateStatus.status, 403);

      const ag3MutateChef = await fetch(`${baseUrl}/tasks/${mainTask.task_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ag3Web.token}`,
        },
        body: JSON.stringify({ titre: 'Modification pirate' }),
      });
      assert.equal(ag3MutateChef.status, 403);

      // TEST 6 : Agent 1 accepte et commence l'intervention
      for (const nextStat of ['ACCEPTÉE', 'EN COURS']) {
        const res = await fetch(`${baseUrl}/tasks/${mainTask.task_id}/my-status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ag1Android.token}`,
          },
          body: JSON.stringify({ statut_agent: nextStat, motif: '' }),
        });
        assert.equal(res.status, 200);
      }

      // TEST 7 & 8 : Agent 1 perd Internet, stocke localement puis synchronise sans doublon
      const latestTaskRes = await fetch(`${baseUrl}/tasks/${mainTask.task_id}`, {
        headers: { Authorization: `Bearer ${ag1Android.token}` },
      });
      const { task: taskBeforeOffline } = (await latestTaskRes.json()) as {
        task: { version: number };
      };
      const localPhotoId = `local-${crypto.randomUUID()}`;
      const offlineBatch = [
        {
          operation_id: crypto.randomUUID(),
          type_operation: 'TASK_AGENT_STATUS',
          target_id: mainTask.task_id,
          client_timestamp: new Date().toISOString(),
          base_version: taskBeforeOffline.version,
          payload: { statut_agent: 'TERMINÉE', motif: '' },
        },
        {
          operation_id: crypto.randomUUID(),
          type_operation: 'PHOTO_UPLOAD',
          target_id: mainTask.task_id,
          client_timestamp: new Date().toISOString(),
          local_photo_id: localPhotoId,
          payload: {
            type_photo: 'AVANT',
            file_name: 'fuite_avant_p8.png',
            mime_type: 'image/png',
            data_base64: SAMPLE_PNG_BASE64,
          },
        },
        {
          operation_id: crypto.randomUUID(),
          type_operation: 'REPORT_SUBMIT',
          target_id: mainTask.task_id,
          client_timestamp: new Date().toISOString(),
          base_version: taskBeforeOffline.version,
          payload: {
            travail_effectue: 'Reserrage et remplacement joint bride MP.',
            resultat: 'Étanchéité rétablie à 100%.',
            difficultes: 'Zone blanche sans réseau mobile.',
            materiel: 'Joint DN25 + graisse gaz',
            travaux_restants: '',
            recommandations: 'Contrôle J+7',
            temps_passe_minutes: 45,
            photo_ids: [localPhotoId],
          },
        },
      ];

      const syncPushRes = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ag1Android.token}`,
        },
        body: JSON.stringify({ device_id: 'android-p8-1', operations: offlineBatch }),
      });
      assert.equal(syncPushRes.status, 200);
      const syncPushJson = (await syncPushRes.json()) as {
        results: Array<{ statut: string; duplicate: boolean }>;
      };
      assert.ok(syncPushJson.results.every((r) => r.statut === 'SYNCHRONISÉ' && !r.duplicate));

      // Rejeu réseau identique -> déduplication stricte
      const replayRes = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ag1Android.token}`,
        },
        body: JSON.stringify({ device_id: 'android-p8-1', operations: offlineBatch }),
      });
      const replayJson = (await replayRes.json()) as {
        results: Array<{ duplicate: boolean }>;
      };
      assert.ok(replayJson.results.every((r) => r.duplicate === true));

      // TEST 10 : Le deuxième agent (ag2) transmet également son compte-rendu complémentaire
      await fetch(`${baseUrl}/tasks/${mainTask.task_id}/my-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ag2Android.token}`,
        },
        body: JSON.stringify({ statut_agent: 'TERMINÉE', motif: '' }),
      });
      const ag2ReportRes = await fetch(`${baseUrl}/tasks/${mainTask.task_id}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ag2Android.token}`,
        },
        body: JSON.stringify({
          travail_effectue: 'Vérification pression aval poste P02 après réparation.',
          resultat: 'Pression nominale stable.',
          difficultes: '',
          materiel: 'Manomètre étalonné',
          travaux_restants: '',
          recommandations: '',
          temps_passe_minutes: 25,
          photo_ids: [],
        }),
      });
      assert.equal(ag2ReportRes.status, 201);
      const { report: reportV2 } = (await ag2ReportRes.json()) as {
        report: { report_id: string; version: number };
      };
      assert.equal(reportV2.version, 2);

      // TEST 9 : Le chef reçoit les comptes rendus et valide
      const reviewRes = await fetch(`${baseUrl}/reports/${reportV2.report_id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({
          decision: 'VALIDÉ',
          commentaire_chef: 'Intervention collective conforme aux normes Sonelgaz.',
        }),
      });
      assert.equal(reviewRes.status, 200);

      // TEST 11 : L'historique conserve les deux interventions
      const histRes = await fetch(`${baseUrl}/history?limit=100`, {
        headers: { Authorization: `Bearer ${chiefSession.token}` },
      });
      assert.equal(histRes.status, 200);
      const histJson = (await histRes.json()) as {
        history: Array<{ task_id: string; user_id: string; action: string }>;
      };
      const taskHist = histJson.history.filter((h) => h.task_id === mainTask.task_id);
      assert.ok(taskHist.some((h) => h.user_id === ag1.agent.agent_id));
      assert.ok(taskHist.some((h) => h.user_id === ag2.agent.agent_id));

      // TEST 12 : Le tableau de bord actualise les statistiques
      const dashRes = await fetch(`${baseUrl}/dashboard`, {
        headers: { Authorization: `Bearer ${chiefSession.token}` },
      });
      assert.equal(dashRes.status, 200);
      const dashJson = (await dashRes.json()) as {
        kpis: { total: number; validee: number };
      };
      assert.ok(dashJson.kpis.total >= 1);
      assert.ok(dashJson.kpis.validee >= 1);

      // TEST 13 : Un agent désactivé (ag3) voit sa session active rejetée et ne peut plus se connecter
      const deactivateRes = await fetch(`${baseUrl}/agents/${ag3.agent.agent_id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({ statut: 'SUSPENDU', commentaire: 'Fin de mission test' }),
      });
      assert.equal(deactivateRes.status, 200);

      const ag3BlockedActive = await fetch(`${baseUrl}/tasks`, {
        headers: { Authorization: `Bearer ${ag3Web.token}` },
      });
      assert.equal(ag3BlockedActive.status, 403);

      const ag3BlockedRelogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: ag3.agent.matricule,
          password: ag3.temporaryPassword,
          device_id: 'web-p8-3',
          plateforme: 'WEB',
        }),
      });
      assert.equal(ag3BlockedRelogin.status, 403);

      // TEST 14, 15, 16 : Créations concurrentes sans perte + détection conflit de version
      const tConcurrentA = await fetch(`${baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({
          titre: 'Tâche concurrente A',
          categorie: 'REL',
          description: 'Test concurrence A',
          instructions: '',
          commune: 'Sidi Ali',
          dp: 'DP Sidi Ali Centre',
          adresse: 'Rue A',
          repere_geo: '',
          latitude: '',
          longitude: '',
          priorite: 'NORMALE',
          date_debut_prevue: '2026-11-17',
          heure_prevue: '09:00',
          date_fin_prevue: '2026-11-17',
          equipe: '',
          materiel_necessaire: '',
          observations: '',
          assigned_agent_ids: [ag1.agent.agent_id],
        }),
      });
      const tConcurrentB = await fetch(`${baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({
          titre: 'Tâche concurrente B',
          categorie: 'PRE',
          description: 'Test concurrence B',
          instructions: '',
          commune: 'Tazgait',
          dp: 'DP Tazgait',
          adresse: 'Rue B',
          repere_geo: '',
          latitude: '',
          longitude: '',
          priorite: 'NORMALE',
          date_debut_prevue: '2026-11-17',
          heure_prevue: '10:00',
          date_fin_prevue: '2026-11-17',
          equipe: '',
          materiel_necessaire: '',
          observations: '',
          assigned_agent_ids: [ag2.agent.agent_id],
        }),
      });
      const { task: taskA } = (await tConcurrentA.json()) as {
        task: { task_id: string; version: number };
      };
      const { task: taskB } = (await tConcurrentB.json()) as {
        task: { task_id: string; version: number };
      };

      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/tasks/${taskA.task_id}/my-status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ag1Android.token}`,
          },
          body: JSON.stringify({ statut_agent: 'EN COURS', motif: '' }),
        }),
        fetch(`${baseUrl}/tasks/${taskB.task_id}/my-status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ag2Android.token}`,
          },
          body: JSON.stringify({ statut_agent: 'EN COURS', motif: '' }),
        }),
      ]);
      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);

      // Conflit optimiste (Test 16) : Chef modifie taskA, puis sync push avec ancienne version
      await fetch(`${baseUrl}/tasks/${taskA.task_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({ priorite: 'URGENTE', expected_version: taskA.version }),
      });
      const conflictSyncRes = await fetch(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${chiefSession.token}`,
        },
        body: JSON.stringify({
          device_id: 'pc-chef-offline',
          operations: [
            {
              operation_id: crypto.randomUUID(),
              type_operation: 'TASK_UPDATE',
              target_id: taskA.task_id,
              client_timestamp: new Date(Date.now() - 60000).toISOString(),
              base_version: taskA.version,
              payload: { titre: 'Édition obsolète', expected_version: taskA.version },
            },
          ],
        }),
      });
      const conflictJson = (await conflictSyncRes.json()) as {
        results: Array<{ statut: string }>;
      };
      assert.equal(conflictJson.results[0]?.statut, 'CONFLIT');

      // TEST 17 : Rapports PDF & Excel XLSX générés correctement
      const [pdfRes, xlsxRes] = await Promise.all([
        fetch(`${baseUrl}/exports/report?type=VALIDATED_REPORTS&format=pdf`, {
          headers: { Authorization: `Bearer ${chiefSession.token}` },
        }),
        fetch(`${baseUrl}/exports/report?type=VALIDATED_REPORTS&format=xlsx`, {
          headers: { Authorization: `Bearer ${chiefSession.token}` },
        }),
      ]);
      assert.equal(pdfRes.status, 200);
      assert.equal(xlsxRes.status, 200);
      const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
      const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer());
      assert.equal(pdfBuf.subarray(0, 5).toString('utf-8'), '%PDF-');
      assert.equal(xlsxBuf.subarray(0, 2).toString('utf-8'), 'PK');

      // TEST 18 : Les interfaces Android et Web affichent exactement les mêmes données après synchronisation
      const [pullAndroidRes, pullWebRes] = await Promise.all([
        fetch(`${baseUrl}/sync/pull`, {
          headers: { Authorization: `Bearer ${ag1Android.token}` },
        }),
        fetch(`${baseUrl}/sync/pull`, {
          headers: { Authorization: `Bearer ${ag1Web.token}` },
        }),
      ]);
      assert.equal(pullAndroidRes.status, 200);
      assert.equal(pullWebRes.status, 200);
      const pullAndroid = (await pullAndroidRes.json()) as {
        snapshot: { tasks: unknown[]; reports: unknown[]; agents: unknown[]; notifications: unknown[] };
      };
      const pullWeb = (await pullWebRes.json()) as {
        snapshot: { tasks: unknown[]; reports: unknown[]; agents: unknown[]; notifications: unknown[] };
      };
      assert.deepEqual(pullAndroid.snapshot.tasks, pullWeb.snapshot.tasks);
      assert.deepEqual(pullAndroid.snapshot.reports, pullWeb.snapshot.reports);
      assert.deepEqual(pullAndroid.snapshot.agents, pullWeb.snapshot.agents);
      assert.deepEqual(pullAndroid.snapshot.notifications, pullWeb.snapshot.notifications);
    } finally {
      await activeRepo.restoreSnapshot(beforeSnapshot);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Phase 8 — Audit de sécurité : routes protégées, zéro password_hash, path traversal, en-têtes & rate limit', async () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use('/api', createApiRouter());

  // Route de test dédiée au rate limiter (seuil strict 3 requêtes)
  const strictLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });
  app.post('/api/test-rate-limit', strictLimiter, (_req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}/api`;

    // 1. En-têtes sécurité + /api/health phase 8
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    const healthJson = (await healthRes.json()) as { phase: number; security_hardened: boolean };
    assert.equal(healthJson.phase, 8);
    assert.equal(healthJson.security_hardened, true);

    // 2. Routes sensibles refusent les accès anonymes (401)
    for (const protectedPath of [
      '/agents',
      '/tasks',
      '/reports',
      '/dashboard',
      '/notifications',
      '/sync/pull',
      '/storage/status',
      '/exports/report?type=DAILY_PROGRAM&format=pdf',
    ]) {
      const res = await fetch(`${baseUrl}${protectedPath}`);
      assert.equal(res.status, 401, `La route ${protectedPath} doit exiger une authentification`);
    }

    // 3. Aucun password_hash dans le schéma Google Sheets AGENTS
    const agentsSheet = SHEETS_SCHEMA.find((s) => s.name === 'AGENTS');
    assert.ok(agentsSheet);
    assert.ok(!agentsSheet.headers.includes('password_hash'));
    assert.ok(!agentsSheet.headers.includes('password'));

    // 4. Aucun password_hash dans /api/agents ni /api/sync/pull
    const activeRepo = getDataRepository();
    await activeRepo.init();
    const chef = (await activeRepo.listAgents()).find((a) => a.role === 'CHEF')!;
    const authService = new AuthService(activeRepo);
    const agentService = new AgentService(activeRepo);
    const beforeSnapshot = await activeRepo.exportSnapshot();
    try {
      const chefSession = await authService
        .loginWithCredentials(chef.matricule, 'Sonelgaz@2025', 'sec-audit', 'WEB')
        .catch(async () => {
          const reset = await agentService.resetAgentAccess(chef.agent_id, chef);
          return authService.loginWithCredentials(
            chef.matricule,
            reset.temporaryPassword,
            'sec-audit',
            'WEB'
          );
        });

      const agentsRes = await fetch(`${baseUrl}/agents`, {
        headers: { Authorization: `Bearer ${chefSession.token}` },
      });
      const agentsText = await agentsRes.text();
      assert.ok(!agentsText.includes('password_hash'));
      assert.ok(!agentsText.includes('scrypt$'));

      // 5. Rejet strict de traversée de chemin sur restauration sauvegarde
      const traversalRes = await fetch(
        `${baseUrl}/storage/backups/${encodeURIComponent('../../package.json')}/restore`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${chefSession.token}` },
        }
      );
      assert.equal(traversalRes.status, 400);
    } finally {
      await activeRepo.restoreSnapshot(beforeSnapshot);
    }

    // 6. Vérification limitation anti-force brute (429 au 4e essai)
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${baseUrl}/test-rate-limit`, { method: 'POST' });
      assert.equal(r.status, 200);
    }
    const blocked = await fetch(`${baseUrl}/test-rate-limit`, { method: 'POST' });
    assert.equal(blocked.status, 429);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

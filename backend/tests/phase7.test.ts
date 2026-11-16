import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ExcelJS from 'exceljs';
import express from 'express';
import { FileJsonRepository } from '../src/repositories/FileJsonRepository.js';
import { createApiRouter } from '../src/routes/apiRoutes.js';
import { AgentService } from '../src/services/agentService.js';
import { AuthService } from '../src/services/authService.js';
import { ExportService } from '../src/services/exportService.js';
import { NotificationService } from '../src/services/notificationService.js';
import { ReportService } from '../src/services/reportService.js';
import { StatisticsService } from '../src/services/statisticsService.js';
import { TaskService } from '../src/services/taskService.js';

function createTempEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-p7-'));
  const filePath = path.join(tmpDir, 'store.json');
  const uploadsDir = path.join(tmpDir, 'uploads');
  return {
    repo: new FileJsonRepository(filePath),
    uploadsDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test('Phase 7 — Tableau de bord KPI, filtres combinables, suivi individuel & complexité (Test 12)', async () => {
  const { repo, cleanup } = createTempEnv();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];
    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);
    const reportService = new ReportService(repo);
    const statsService = new StatisticsService(repo);

    const a1 = await agentService.createAgent(
      {
        matricule: 'SA-7001',
        nom: 'Belaid',
        prenom: 'Karim',
        telephone: '0557000001',
        fonction: 'Technicien gaz',
        login_email: 'k.belaid@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const a2 = await agentService.createAgent(
      {
        matricule: 'SA-7002',
        nom: 'Mekki',
        prenom: 'Nabil',
        telephone: '0557000002',
        fonction: 'Agent gaz',
        login_email: 'n.mekki@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const agent1 = (await repo.getAgentById(a1.agent.agent_id))!;
    const agent2 = (await repo.getAgentById(a2.agent.agent_id))!;

    // Tâche 1 : urgente, collective (2 agents), complexe (FUG), géolocalisée, Sidi Ali
    const t1 = await taskService.createTask(
      {
        titre: 'Fuite réseau MP Sidi Ali Centre',
        categorie: 'FUG',
        description: 'Odeur persistante proche poste détente.',
        instructions: 'Sécuriser et réparer.',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Rue 1er Novembre',
        repere_geo: 'Poste P04',
        latitude: '36.1005',
        longitude: '0.4182',
        priorite: 'URGENTE',
        date_debut_prevue: '2026-11-10',
        heure_prevue: '08:00',
        date_fin_prevue: '2026-11-10',
        equipe: 'Équipe A',
        materiel_necessaire: 'Détecteur gaz',
        observations: '',
        assigned_agent_ids: [agent1.agent_id, agent2.agent_id],
      },
      chief
    );

    // Tâche 2 : simple, individuelle, en retard (échéance passée), Tazgait
    const t2 = await taskService.createTask(
      {
        titre: 'Relève index client Tazgait',
        categorie: 'REL',
        description: 'Vérification compteur.',
        instructions: '',
        commune: 'Tazgait',
        dp: 'DP Tazgait',
        adresse: 'Cité 50 logements',
        repere_geo: '',
        latitude: '',
        longitude: '',
        priorite: 'NORMALE',
        date_debut_prevue: '2026-10-01',
        heure_prevue: '10:00',
        date_fin_prevue: '2026-10-02',
        equipe: 'Équipe B',
        materiel_necessaire: '',
        observations: '',
        assigned_agent_ids: [agent1.agent_id],
      },
      chief
    );

    // Soumission & validation de T1
    await taskService.updateAgentExecutionStatus(t1.task_id, 'TERMINÉE', '', agent1);
    const rep1 = await reportService.submitReport(
      t1.task_id,
      {
        travail_effectue: 'Réparation raccord et test pression.',
        resultat: 'Réseau étanche.',
        difficultes: '',
        materiel: 'Joint DN25',
        travaux_restants: '',
        recommandations: '',
        temps_passe_minutes: 55,
        photo_ids: [],
      },
      agent1
    );
    await reportService.reviewReport(rep1.report_id, 'VALIDÉ', 'Conforme', chief);

    // 1. Statistiques globales
    const globalStats = await statsService.getDashboardStats({ granularity: 'month' });
    assert.equal(globalStats.kpis.total, 2);
    assert.equal(globalStats.kpis.validee, 1);
    assert.equal(globalStats.kpis.en_retard, 1);
    assert.equal(globalStats.kpis.cr_valides, 1);
    assert.equal(globalStats.mapPoints.length, 1);
    assert.equal(globalStats.mapPoints[0]?.task_id, t1.task_id);
    assert.ok(globalStats.evolution.length >= 1);

    // 2. Filtre combinable par commune = Tazgait
    const filteredStats = await statsService.getDashboardStats({ commune: 'Tazgait' });
    assert.equal(filteredStats.kpis.total, 1);
    assert.equal(filteredStats.kpis.en_retard, 1);
    assert.equal(filteredStats.kpis.validee, 0);
    assert.equal(filteredStats.overdueTasks[0]?.task_id, t2.task_id);

    // 3. Suivi individuel agent avec distinction de complexité
    const chefTracking = await statsService.getAgentTrackingList(chief);
    const karimStats = chefTracking.find((a) => a.agent_id === agent1.agent_id);
    assert.ok(karimStats);
    assert.equal(karimStats.total_affectees, 2);
    assert.equal(karimStats.validees, 1);
    assert.equal(karimStats.en_retard, 1);
    assert.equal(karimStats.temps_moyen_minutes, 55);
    assert.equal(karimStats.complexite.urgentes, 1);
    assert.equal(karimStats.complexite.collectives, 1);
    assert.equal(karimStats.complexite.individuelles, 1);
    assert.equal(karimStats.complexite.complexes, 1);
    assert.equal(karimStats.complexite.simples, 1);
    assert.ok(karimStats.timeline.length >= 2);

    // 4. RBAC : un agent ne reçoit que son propre suivi individuel
    const agentTracking = await statsService.getAgentTrackingList(agent1, {
      agentId: agent2.agent_id,
    });
    assert.equal(agentTracking.length, 1);
    assert.equal(agentTracking[0]?.agent_id, agent1.agent_id);
  } finally {
    cleanup();
  }
});

test('Phase 7 — Notifications de retard dédupliquées, lecture & enregistrement jeton appareil', async () => {
  const { repo, cleanup } = createTempEnv();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];
    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);
    const notificationService = new NotificationService(repo);

    const a1 = await agentService.createAgent(
      {
        matricule: 'SA-7010',
        nom: 'Chikh',
        prenom: 'Yacine',
        telephone: '0557101010',
        fonction: 'Technicien gaz',
        login_email: 'y.chikh@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const agent = (await repo.getAgentById(a1.agent.agent_id))!;

    await taskService.createTask(
      {
        titre: 'Vérification vanne secteur Est',
        categorie: 'VAN',
        description: 'Contrôle vanne ancienne.',
        instructions: '',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Route Est',
        repere_geo: '',
        latitude: '',
        longitude: '',
        priorite: 'HAUTE',
        date_debut_prevue: '2026-09-10',
        heure_prevue: '09:00',
        date_fin_prevue: '2026-09-12',
        equipe: 'Équipe A',
        materiel_necessaire: '',
        observations: '',
        assigned_agent_ids: [agent.agent_id],
      },
      chief
    );

    // Appel multiple de listUserNotifications -> génère 1 alerte TACHE_EN_RETARD sans doublon
    const firstList = await notificationService.listUserNotifications(agent);
    const secondList = await notificationService.listUserNotifications(agent);
    assert.equal(
      firstList.notifications.filter((n) => n.type_event === 'TACHE_EN_RETARD').length,
      1
    );
    assert.equal(
      secondList.notifications.filter((n) => n.type_event === 'TACHE_EN_RETARD').length,
      1
    );
    assert.ok(secondList.unread_count >= 2); // affectation + retard

    // Lecture unitaire
    const target = secondList.notifications[0]!;
    const readOne = await notificationService.markAsRead(target.notification_id, agent);
    assert.ok(readOne.date_lecture);

    // Tout marquer comme lu
    const markAll = await notificationService.markAllAsRead(agent);
    assert.ok(markAll.updated_count >= 1);
    const afterAll = await notificationService.listUserNotifications(agent);
    assert.equal(afterAll.unread_count, 0);

    // Enregistrement jeton appareil Web/Android
    const sess = await notificationService.registerDeviceToken(agent, {
      device_id: 'web-notif-test-1',
      plateforme: 'WEB',
      token_notification: 'fcm-token-abc-123',
    });
    assert.equal(sess.token_notification, 'fcm-token-abc-123');
    assert.equal(sess.statut, 'ACTIF');
  } finally {
    cleanup();
  }
});

test('Phase 7 — Exports officiels PDF, Excel XLSX, CSV & RBAC HTTP (Test 17)', async () => {
  const { repo, cleanup } = createTempEnv();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];
    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);
    const exportService = new ExportService(repo);

    const a1 = await agentService.createAgent(
      {
        matricule: 'SA-7020',
        nom: 'Hadj',
        prenom: 'Mourad',
        telephone: '0557202020',
        fonction: 'Agent gaz',
        login_email: 'm.hadj@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const agent = (await repo.getAgentById(a1.agent.agent_id))!;

    await taskService.createTask(
      {
        titre: 'Ouverture gaz abonné neuf',
        categorie: 'OUV',
        description: 'Mise en service installation intérieure conforme.',
        instructions: '',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Lotissement Ouest 14',
        repere_geo: '',
        latitude: '',
        longitude: '',
        priorite: 'NORMALE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '09:30',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe A',
        materiel_necessaire: '',
        observations: 'Client présent',
        assigned_agent_ids: [agent.agent_id],
      },
      chief
    );

    // 1. Export PDF officiel
    const pdfRes = await exportService.generateReport(
      {
        type: 'DAILY_PROGRAM',
        format: 'pdf',
        date: '2026-11-16',
        observations: 'Visa Chef Sidi Ali',
      },
      chief
    );
    assert.equal(pdfRes.contentType, 'application/pdf');
    assert.ok(pdfRes.reportNumber.startsWith('RPT-SA-'));
    assert.equal(pdfRes.buffer.subarray(0, 5).toString('utf-8'), '%PDF-');
    assert.equal(pdfRes.rowCount, 1);

    // 2. Export Excel XLSX valide
    const xlsxRes = await exportService.generateReport(
      { type: 'DAILY_WORK', format: 'xlsx', date: '2026-11-16' },
      chief
    );
    assert.equal(xlsxRes.buffer.subarray(0, 2).toString('utf-8'), 'PK');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxRes.buffer as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Rapport District');
    assert.ok(sheet);
    assert.ok(String(sheet.getCell('A1').value).includes('SONELGAZ'));

    // 3. Export CSV UTF-8 BOM
    const csvRes = await exportService.generateReport(
      { type: 'BY_AGENT', format: 'csv', agentId: agent.agent_id },
      agent
    );
    const csvText = csvRes.buffer.toString('utf-8');
    assert.ok(csvText.startsWith('\uFEFF'));
    assert.ok(csvText.includes('District Gaz Sidi Ali'));
    assert.ok(csvText.includes('Ouverture gaz abonné neuf'));

    // 4. RBAC : Agent refusé sur export global DAILY_PROGRAM
    await assert.rejects(
      () =>
        exportService.generateReport(
          { type: 'DAILY_PROGRAM', format: 'pdf', date: '2026-11-16' },
          agent
        ),
      (err: unknown) => err instanceof Error && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403
    );
  } finally {
    cleanup();
  }
});

test('Phase 7 — Endpoints HTTP /api/dashboard, /api/statistics/agents, /api/notifications, /api/exports/report', async () => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
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
      const authService = new AuthService(activeRepo);
      const agentService = new AgentService(activeRepo);
      const taskService = new TaskService(activeRepo);

      const suffix = Date.now();
      const tempAg = await agentService.createAgent(
        {
          matricule: `P7-HTTP-${suffix}`,
          nom: 'StatHttp',
          prenom: 'Amine',
          telephone: '0558112233',
          fonction: 'Technicien gaz',
          login_email: `p7-${suffix}@sonelgaz-sidiali.dz`,
          role: 'AGENT',
          statut: 'ACTIF',
        },
        activeChief
      );
      await taskService.createTask(
        {
          titre: 'Test HTTP Phase 7',
          categorie: 'FUG',
          description: 'Vérification dashboard, notifications et export PDF HTTP.',
          instructions: '',
          commune: 'Sidi Ali',
          dp: 'DP Sidi Ali Centre',
          adresse: 'Centre Ville',
          repere_geo: '',
          latitude: '36.102',
          longitude: '0.420',
          priorite: 'URGENTE',
          date_debut_prevue: '2026-11-16',
          heure_prevue: '08:00',
          date_fin_prevue: '2026-11-16',
          equipe: 'Équipe A',
          materiel_necessaire: '',
          observations: '',
          assigned_agent_ids: [tempAg.agent.agent_id],
        },
        activeChief
      );

      // Connexion Chef + Agent
      const chiefSession = await authService.loginWithCredentials(
        activeChief.matricule,
        'Sonelgaz@2025',
        'p7-http-chef',
        'WEB'
      ).catch(async () => {
        // Fallback si mot de passe chef modifié en environnement de test : reset temporaire non nécessaire, on signe via AuthService
        const reset = await agentService.resetAgentAccess(activeChief.agent_id, activeChief);
        return authService.loginWithCredentials(
          activeChief.matricule,
          reset.temporaryPassword,
          'p7-http-chef',
          'WEB'
        );
      });

      const agentSession = await authService.loginWithCredentials(
        tempAg.agent.matricule,
        tempAg.temporaryPassword,
        'p7-http-agent',
        'WEB'
      );

      // 1. /api/health indique phase >= 7
      const healthRes = await fetch(`${baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = (await healthRes.json()) as { phase: number };
      assert.ok(healthJson.phase >= 7);

      // 2. /api/dashboard
      const dashRes = await fetch(`${baseUrl}/dashboard?commune=Sidi%20Ali`, {
        headers: { Authorization: `Bearer ${chiefSession.token}` },
      });
      assert.equal(dashRes.status, 200);
      const dashJson = (await dashRes.json()) as { kpis: { total: number } };
      assert.ok(dashJson.kpis.total >= 1);

      // 3. /api/statistics/agents
      const agStatsRes = await fetch(`${baseUrl}/statistics/agents`, {
        headers: { Authorization: `Bearer ${agentSession.token}` },
      });
      assert.equal(agStatsRes.status, 200);
      const agStatsJson = (await agStatsRes.json()) as {
        agents: Array<{ agent_id: string }>;
      };
      assert.equal(agStatsJson.agents.length, 1);
      assert.equal(agStatsJson.agents[0]?.agent_id, tempAg.agent.agent_id);

      // 4. /api/notifications + read-all + register-device
      const notifRes = await fetch(`${baseUrl}/notifications`, {
        headers: { Authorization: `Bearer ${agentSession.token}` },
      });
      assert.equal(notifRes.status, 200);
      const notifJson = (await notifRes.json()) as {
        notifications: Array<{ notification_id: string }>;
        unread_count: number;
      };
      assert.ok(notifJson.unread_count >= 1);

      const readAllRes = await fetch(`${baseUrl}/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentSession.token}` },
      });
      assert.equal(readAllRes.status, 200);

      // 5. /api/exports/report PDF Chef -> 200 & %PDF- ; Agent sur OVERDUE -> 403
      const exportChefRes = await fetch(
        `${baseUrl}/exports/report?type=DAILY_PROGRAM&format=pdf&date=2026-11-16`,
        {
          headers: { Authorization: `Bearer ${chiefSession.token}` },
        }
      );
      assert.equal(exportChefRes.status, 200);
      assert.equal(exportChefRes.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await exportChefRes.arrayBuffer());
      assert.equal(buf.subarray(0, 5).toString('utf-8'), '%PDF-');

      const exportAgentDenied = await fetch(
        `${baseUrl}/exports/report?type=OVERDUE&format=csv`,
        {
          headers: { Authorization: `Bearer ${agentSession.token}` },
        }
      );
      assert.equal(exportAgentDenied.status, 403);
    } finally {
      await activeRepo.restoreSnapshot(beforeSnapshot);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

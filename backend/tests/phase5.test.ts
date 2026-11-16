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
import { ReportService } from '../src/services/reportService.js';
import { TaskService } from '../src/services/taskService.js';

function createTempEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-p5-'));
  const filePath = path.join(tmpDir, 'store.json');
  const uploadsDir = path.join(tmpDir, 'uploads');
  return {
    repo: new FileJsonRepository(filePath),
    uploadsDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

// Petit PNG 1x1 valide encodé en base64
const SAMPLE_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('Phase 5 — Comptes-rendus versionnés, photos AVANT/APRÈS et validation/refus Chef (Tests 6 & 7)', async () => {
  const { repo, uploadsDir, cleanup } = createTempEnv();
  try {
    await repo.init();
    const chief = (await repo.listAgents())[0];

    const agentService = new AgentService(repo);
    const taskService = new TaskService(repo);
    const reportService = new ReportService(repo, undefined, uploadsDir);

    const ag1Created = await agentService.createAgent(
      {
        matricule: 'SA-5001',
        nom: 'Benali',
        prenom: 'Nabil',
        telephone: '0554111111',
        fonction: 'Technicien réseau',
        login_email: 'n.benali@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );
    const ag2Created = await agentService.createAgent(
      {
        matricule: 'SA-5002',
        nom: 'Ziani',
        prenom: 'Kamel',
        telephone: '0554222222',
        fonction: 'Agent polyvalent',
        login_email: 'k.ziani@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const assignedAgent = (await repo.getAgentById(ag1Created.agent.agent_id))!;
    const unassignedAgent = (await repo.getAgentById(ag2Created.agent.agent_id))!;

    const task = await taskService.createTask(
      {
        titre: 'Remplacement détendeur coffret Hai El Badr',
        categorie: 'COF',
        description: 'Remplacement détendeur MPB défectueux et contrôle étanchéité.',
        instructions: 'Prendre photo AVANT et APRÈS + relevé pression aval.',
        commune: 'Sidi Ali',
        dp: 'DP Sidi Ali Centre',
        adresse: 'Hai El Badr, Bloc 4',
        repere_geo: 'Coffret n°12',
        latitude: '',
        longitude: '',
        priorite: 'HAUTE',
        date_debut_prevue: '2026-11-16',
        heure_prevue: '09:00',
        date_fin_prevue: '2026-11-16',
        equipe: 'Équipe A',
        materiel_necessaire: 'Détendeur B25, détecteur gaz',
        observations: '',
        assigned_agent_ids: [assignedAgent.agent_id],
      },
      chief
    );

    // 1. Agent non affecté ne peut ni téléverser une photo ni soumettre un compte-rendu (403 NOT_ASSIGNED)
    await assert.rejects(
      () =>
        reportService.uploadTaskPhoto(
          task.task_id,
          {
            type_photo: 'AVANT',
            file_name: 'avant.png',
            mime_type: 'image/png',
            data_base64: SAMPLE_PNG_BASE64,
          },
          unassignedAgent
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 403 && err.code === 'NOT_ASSIGNED'
    );

    await assert.rejects(
      () =>
        reportService.submitReport(
          task.task_id,
          {
            travail_effectue: 'Tentative non autorisée',
            resultat: 'KO',
            difficultes: '',
            materiel: '',
            travaux_restants: '',
            recommandations: '',
            temps_passe_minutes: 15,
            photo_ids: [],
          },
          unassignedAgent
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 403 && err.code === 'NOT_ASSIGNED'
    );

    // 2. Photo vide/invalide rejetée (400 INVALID_IMAGE)
    await assert.rejects(
      () =>
        reportService.uploadTaskPhoto(
          task.task_id,
          {
            type_photo: 'AVANT',
            file_name: 'vide.png',
            mime_type: 'image/png',
            data_base64: 'data:image/png;base64,',
          },
          assignedAgent
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 400 && err.code === 'INVALID_IMAGE'
    );

    // 3. Agent affecté démarre et téléverse photo AVANT + APRÈS dans le stockage local sécurisé
    await taskService.updateAgentExecutionStatus(
      task.task_id,
      'EN COURS',
      '',
      assignedAgent
    );

    const photoAvant = await reportService.uploadTaskPhoto(
      task.task_id,
      {
        type_photo: 'AVANT',
        file_name: 'coffret_avant.png',
        mime_type: 'image/png',
        data_base64: SAMPLE_PNG_BASE64,
      },
      assignedAgent
    );
    const photoApres = await reportService.uploadTaskPhoto(
      task.task_id,
      {
        type_photo: 'APRES',
        file_name: 'coffret_apres.png',
        mime_type: 'image/png',
        data_base64: SAMPLE_PNG_BASE64,
      },
      assignedAgent
    );

    assert.equal(photoAvant.type_photo, 'AVANT');
    assert.equal(photoApres.type_photo, 'APRES');
    const fetchedBuf = await reportService.getPhotoFileBuffer(photoAvant.photo_id);
    assert.ok(fetchedBuf.buffer.length > 0);

    // 4. Soumission compte-rendu v1 -> statut global passe à À VALIDER + notification Chef
    const v1 = await reportService.submitReport(
      task.task_id,
      {
        travail_effectue: 'Dépose ancien détendeur et pose détendeur neuf.',
        resultat: 'Rétablissement gaz effectué',
        difficultes: 'Accès coffret encombré',
        materiel: 'Détendeur B25 + 2 joints neufs',
        travaux_restants: '',
        recommandations: 'Contrôle à 30 jours',
        temps_passe_minutes: 55,
        photo_ids: [photoAvant.photo_id, photoApres.photo_id],
      },
      assignedAgent
    );

    assert.equal(v1.version, 1);
    assert.equal(v1.validation, 'EN_ATTENTE');
    assert.equal(v1.photos.length, 2);

    const taskAfterV1 = await repo.getTaskById(task.task_id);
    assert.equal(taskAfterV1?.statut_global, 'À VALIDER');

    const chefNotifs = await repo.listNotificationsByUser(chief.agent_id);
    assert.ok(chefNotifs.some((n) => n.type_event === 'COMPTE_RENDU_SOUMIS'));

    // 5. Un agent non-Chef ne peut pas valider/refuser (403 FORBIDDEN)
    await assert.rejects(
      () =>
        reportService.reviewReport(
          v1.report_id,
          'VALIDÉ',
          'Auto-validation interdite',
          assignedAgent
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 403 && err.code === 'FORBIDDEN'
    );

    // 6. Un refus sans motif détaillé (<5 car.) est rejeté (400 REASON_REQUIRED)
    await assert.rejects(
      () => reportService.reviewReport(v1.report_id, 'REFUSÉ', 'non', chief),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 400 && err.code === 'REASON_REQUIRED'
    );

    // 7. Refus par le Chef -> tâche REFUSÉE, affectation agent remise EN COURS, notification agent
    const v1Refused = await reportService.reviewReport(
      v1.report_id,
      'REFUSÉ',
      'Merci de préciser la valeur de pression aval mesurée au manomètre.',
      chief
    );
    assert.equal(v1Refused.validation, 'REFUSÉ');

    const taskAfterRefusal = await repo.getTaskById(task.task_id);
    assert.equal(taskAfterRefusal?.statut_global, 'REFUSÉE');

    const asgsAfterRefusal = await repo.listAssignments(task.task_id);
    assert.equal(asgsAfterRefusal[0]?.statut_agent, 'EN COURS');

    const agentNotifs = await repo.listNotificationsByUser(assignedAgent.agent_id);
    assert.ok(agentNotifs.some((n) => n.type_event === 'COMPTE_RENDU_REFUSE'));

    // 8. Agent soumet v2 corrigée -> v1 conservée intacte + v2 en attente (versioning préservé)
    const v2 = await reportService.submitReport(
      task.task_id,
      {
        travail_effectue:
          'Dépose ancien détendeur, pose détendeur B25 neuf et contrôle étanchéité eau savonneuse.',
        resultat: 'Pression aval mesurée et conforme à 21 mbar.',
        difficultes: 'Accès coffret encombré',
        materiel: 'Détendeur B25 + 2 joints neufs',
        travaux_restants: '',
        recommandations: 'Contrôle à 30 jours',
        temps_passe_minutes: 65,
        photo_ids: [photoAvant.photo_id, photoApres.photo_id],
      },
      assignedAgent
    );
    assert.equal(v2.version, 2);
    assert.equal(v2.validation, 'EN_ATTENTE');

    const taskHistoryReports = await reportService.listTaskReportsAndPhotos(task.task_id);
    assert.equal(taskHistoryReports.reports.length, 2);
    assert.equal(
      taskHistoryReports.reports.find((r) => r.version === 1)?.validation,
      'REFUSÉ'
    );
    assert.equal(
      taskHistoryReports.reports.find((r) => r.version === 2)?.validation,
      'EN_ATTENTE'
    );

    // 9. Validation définitive de v2 par le Chef -> tâche VALIDÉE et verrouillée
    const v2Validated = await reportService.reviewReport(
      v2.report_id,
      'VALIDÉ',
      'Pression aval conforme, dossier complet.',
      chief
    );
    assert.equal(v2Validated.validation, 'VALIDÉ');

    const taskFinal = await repo.getTaskById(task.task_id);
    assert.equal(taskFinal?.statut_global, 'VALIDÉE');

    const agentNotifsFinal = await repo.listNotificationsByUser(assignedAgent.agent_id);
    assert.ok(agentNotifsFinal.some((n) => n.type_event === 'COMPTE_RENDU_VALIDE'));

    // Verrouillage post-validation (400 TASK_LOCKED)
    await assert.rejects(
      () =>
        reportService.submitReport(
          task.task_id,
          {
            travail_effectue: 'Modification après clôture',
            resultat: 'Test',
            difficultes: '',
            materiel: '',
            travaux_restants: '',
            recommandations: '',
            temps_passe_minutes: 10,
            photo_ids: [],
          },
          assignedAgent
        ),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 400 && err.code === 'TASK_LOCKED'
    );
  } finally {
    cleanup();
  }
});

test('Phase 5 — Contrôle RBAC HTTP sur /api/reports/:reportId/review', async () => {
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

      const uniqueSuffix = Date.now();
      const tempAgent = await activeAgentService.createAgent(
        {
          matricule: `P5-HTTP-${uniqueSuffix}`,
          nom: 'HttpTest',
          prenom: 'Agent',
          telephone: '0558888888',
          fonction: 'Agent terrain',
          login_email: `p5-${uniqueSuffix}@sonelgaz-sidiali.dz`,
          role: 'AGENT',
          statut: 'ACTIF',
        },
        activeChief
      );

      const loginRes = await activeAuthService.loginWithCredentials(
        tempAgent.agent.matricule,
        tempAgent.temporaryPassword,
        'test-p5-http',
        'WEB'
      );

      // AGENT bloqué en 403 FORBIDDEN sur /api/reports/:reportId/review
      const reviewAttempt = await fetch(`${baseUrl}/reports/fake-report-id/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${loginRes.token}`,
        },
        body: JSON.stringify({ decision: 'VALIDÉ', commentaire_chef: 'Hack' }),
      });
      assert.equal(reviewAttempt.status, 403);

      // /api/reports accessible en lecture authentifiée (200 OK)
      const listAttempt = await fetch(`${baseUrl}/reports`, {
        headers: { Authorization: `Bearer ${loginRes.token}` },
      });
      assert.equal(listAttempt.status, 200);
    } finally {
      await activeRepo.restoreSnapshot(beforeSnapshot);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

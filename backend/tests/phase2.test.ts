import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SHEETS_SCHEMA } from '../../database/google-sheets/sheetDefinitions.js';
import { FileJsonRepository } from '../src/repositories/FileJsonRepository.js';
import { GoogleSheetsRepository } from '../src/repositories/GoogleSheetsRepository.js';
import { AgentService } from '../src/services/agentService.js';
import { GoogleSyncService } from '../src/services/googleSyncService.js';

test('Phase 2 — Schéma 11 feuilles Google Sheets, Repository et Sauvegarde/Restauration', async () => {
  // 1. Vérifier la présence exacte des 11 feuilles demandées en Section 19
  const expectedSheets = [
    'AGENTS',
    'TACHES',
    'AFFECTATIONS',
    'COMPTES_RENDUS',
    'PHOTOS',
    'HISTORIQUE',
    'PARAMETRES',
    'NOTIFICATIONS',
    'EQUIPEMENTS',
    'SESSIONS_ET_APPAREILS',
    'SYNCHRONISATION',
  ];
  assert.deepEqual(
    SHEETS_SCHEMA.map((s) => s.name),
    expectedSheets
  );

  // Vérifier que password_hash n'est JAMAIS inclus dans les colonnes Google Sheets
  const agentsSheet = SHEETS_SCHEMA.find((s) => s.name === 'AGENTS')!;
  assert.ok(!agentsSheet.headers.includes('password_hash'));
  assert.equal(agentsSheet.headers[0], 'agent_id');

  // 2. Tester GoogleSheetsRepository + exportSnapshot / restoreSnapshot
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-p2-'));
  const storePath = path.join(tmpDir, 'central-store.json');

  try {
    const fileRepo = new FileJsonRepository(storePath);
    const repo = new GoogleSheetsRepository(fileRepo);
    const syncService = new GoogleSyncService(repo);
    repo.attachSyncService(syncService);

    await repo.init();
    const initialAgents = await repo.listAgents();
    const chief = initialAgents[0];

    const agentService = new AgentService(repo);
    const created = await agentService.createAgent(
      {
        matricule: 'SA-2001',
        nom: 'Khelifi',
        prenom: 'Yacine',
        telephone: '0550123456',
        fonction: 'Chef de chantier gaz',
        login_email: 'y.khelifi@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    const snapshotBefore = await repo.exportSnapshot();
    assert.equal(snapshotBefore.agents.length, 2);

    // Modifier puis restaurer depuis le snapshot
    await agentService.changeAgentStatus(created.agent.agent_id, 'SUSPENDU', 'Test', chief);
    const afterSuspend = await repo.getAgentById(created.agent.agent_id);
    assert.equal(afterSuspend?.statut, 'SUSPENDU');

    await repo.restoreSnapshot(snapshotBefore);
    const afterRestore = await repo.getAgentById(created.agent.agent_id);
    assert.equal(afterRestore?.statut, 'ACTIF');

    const status = syncService.getStatus();
    assert.equal(status.sheetCount, 11);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

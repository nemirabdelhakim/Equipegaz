import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileJsonRepository } from '../src/repositories/FileJsonRepository.js';
import { AgentService, ServiceError } from '../src/services/agentService.js';
import { AuthError, AuthService } from '../src/services/authService.js';
import { verifySessionToken } from '../src/utils/crypto.js';

function createTempRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonelgaz-sa-test-'));
  const filePath = path.join(tmpDir, 'store.json');
  return {
    repo: new FileJsonRepository(filePath),
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test('Phase 1 — Création agent, hachage mot de passe, connexion, désactivation (Test 1 & Test 13)', async () => {
  const { repo, cleanup } = createTempRepo();
  try {
    await repo.init();
    const agents = await repo.listAgents();
    assert.equal(agents.length, 1);
    const chief = agents[0];
    assert.equal(chief.role, 'CHEF');

    const agentService = new AgentService(repo);
    const authService = new AuthService(repo);

    // 1. Le chef crée un agent
    const created = await agentService.createAgent(
      {
        matricule: 'SA-1042',
        nom: 'Benali',
        prenom: 'Karim',
        telephone: '0661112233',
        fonction: 'Technicien intervention gaz',
        login_email: 'k.benali@sonelgaz-sidiali.dz',
        role: 'AGENT',
        statut: 'ACTIF',
      },
      chief
    );

    assert.equal(created.agent.matricule, 'SA-1042');
    assert.ok(created.temporaryPassword.length >= 8);

    // Vérifier que le mot de passe n'est JAMAIS stocké en clair
    const rawAgent = await repo.getAgentById(created.agent.agent_id);
    assert.ok(rawAgent);
    assert.ok(rawAgent.password_hash.startsWith('scrypt$'));
    assert.notEqual(rawAgent.password_hash, created.temporaryPassword);

    // 2. L'agent se connecte par matricule + mot de passe temporaire
    const loginOk = await authService.loginWithCredentials(
      'SA-1042',
      created.temporaryPassword,
      'android-01',
      'ANDROID'
    );
    assert.equal(loginOk.user.agent_id, created.agent.agent_id);
    const decoded = await verifySessionToken(loginOk.token);
    assert.ok(decoded);
    assert.equal(decoded.tv, 1);

    // 3. Rejet des doublons matricule / email
    await assert.rejects(
      () =>
        agentService.createAgent(
          {
            matricule: 'SA-1042',
            nom: 'Autre',
            prenom: 'Test',
            telephone: '0661998877',
            fonction: 'Agent',
            login_email: 'autre@sonelgaz-sidiali.dz',
            role: 'AGENT',
            statut: 'ACTIF',
          },
          chief
        ),
      (err: unknown) => err instanceof ServiceError && err.code === 'DUPLICATE_MATRICULE'
    );

    // 4. Test 13 : Le chef désactive l'agent -> impossible de se connecter + token_version incrémenté + historique préservé
    const disabled = await agentService.changeAgentStatus(
      created.agent.agent_id,
      'INACTIF',
      'Fin de contrat temporaire',
      chief
    );
    assert.equal(disabled.statut, 'INACTIF');
    assert.equal(disabled.token_version, 2);

    await assert.rejects(
      () =>
        authService.loginWithCredentials(
          'SA-1042',
          created.temporaryPassword,
          'android-01',
          'ANDROID'
        ),
      (err: unknown) => err instanceof AuthError && err.code === 'ACCOUNT_DISABLED'
    );

    const historyAfterDisable = await agentService.getAgentHistory(created.agent.agent_id);
    assert.ok(historyAfterDisable.length >= 3);

    // 5. Réactivation + Réinitialisation d'accès
    await agentService.changeAgentStatus(
      created.agent.agent_id,
      'ACTIF',
      'Reprise de service',
      chief
    );
    const resetRes = await agentService.resetAgentAccess(created.agent.agent_id, chief);
    assert.notEqual(resetRes.temporaryPassword, created.temporaryPassword);

    // Ancien mot de passe refusé
    await assert.rejects(
      () =>
        authService.loginWithCredentials(
          'SA-1042',
          created.temporaryPassword,
          'android-01',
          'ANDROID'
        ),
      (err: unknown) => err instanceof AuthError && err.code === 'INVALID_CREDENTIALS'
    );

    // Nouveau mot de passe accepté
    const loginNew = await authService.loginWithCredentials(
      'k.benali@sonelgaz-sidiali.dz',
      resetRes.temporaryPassword,
      'android-01',
      'ANDROID'
    );
    assert.equal(loginNew.user.statut, 'ACTIF');

    // 6. Vérifier que les 10 communes, 10 DP et 16 catégories sont bien préchargées
    const params = await repo.listParameters();
    assert.equal(params.filter((p) => p.categorie === 'COMMUNE').length, 10);
    assert.equal(params.filter((p) => p.categorie === 'DP').length, 10);
    assert.equal(params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX').length, 16);
  } finally {
    cleanup();
  }
});

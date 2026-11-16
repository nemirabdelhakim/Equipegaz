import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CHIEF_EMAIL } from '../config/seedData.js';
import type { AgentPublicDTO, AgentRecord } from '../models/domain.js';
import { toPublicAgent } from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import {
  hashPassword,
  signSessionToken,
  verifyFirebaseIdToken,
  verifyPassword,
} from '../utils/crypto.js';
import { nowIso } from '../utils/dateAlgiers.js';

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface AuthSuccessResult {
  token: string;
  user: AgentPublicDTO;
}

export class AuthService {
  constructor(private readonly repo: IDataRepository) {}

  private async logAuthEvent(
    agent: AgentRecord,
    action: string,
    commentaire: string
  ): Promise<void> {
    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: agent.agent_id,
      user_name: `${agent.prenom} ${agent.nom}`.trim(),
      action,
      ancien_etat: '',
      nouvel_etat: agent.statut,
      ancienne_valeur: '',
      nouvelle_valeur: '',
      commentaire,
      date_serveur: nowIso(),
    });
  }

  private assertAccountActive(agent: AgentRecord): void {
    if (agent.statut !== 'ACTIF') {
      throw new AuthError(
        403,
        'ACCOUNT_DISABLED',
        `Accès refusé : votre compte est actuellement au statut "${agent.statut}". Contactez le chef d'équipe.`
      );
    }
  }

  async loginWithCredentials(
    identifier: string,
    password: string,
    deviceId: string,
    plateforme: 'WEB' | 'ANDROID'
  ): Promise<AuthSuccessResult> {
    const agent = await this.repo.getAgentByIdentifier(identifier);
    if (!agent || !agent.password_hash) {
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
    }

    const valid = verifyPassword(password, agent.password_hash);
    if (!valid) {
      await this.logAuthEvent(
        agent,
        'CONNEXION_REFUSEE',
        'Tentative de connexion avec mot de passe invalide'
      );
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
    }

    if (agent.statut !== 'ACTIF') {
      await this.logAuthEvent(
        agent,
        'CONNEXION_BLOQUEE',
        `Tentative de connexion sur compte ${agent.statut}`
      );
      this.assertAccountActive(agent);
    }

    const now = nowIso();
    const updated =
      (await this.repo.updateAgent(agent.agent_id, { derniere_connexion: now })) || agent;

    await this.repo.upsertSessionDevice({
      device_id: deviceId || 'web-browser',
      user_id: updated.agent_id,
      plateforme,
      derniere_connexion: now,
      token_notification: '',
      statut: 'ACTIF',
    });

    await this.logAuthEvent(
      updated,
      'CONNEXION',
      `Connexion par identifiant sur ${plateforme}`
    );

    const token = await signSessionToken({
      sub: updated.agent_id,
      role: updated.role,
      tv: updated.token_version,
      did: deviceId || 'web-browser',
    });

    return { token, user: toPublicAgent(updated) };
  }

  async loginWithFirebaseToken(
    idToken: string,
    deviceId: string,
    plateforme: 'WEB' | 'ANDROID'
  ): Promise<AuthSuccessResult> {
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified || !verified.emailVerified) {
      throw new AuthError(
        401,
        'INVALID_FIREBASE_TOKEN',
        'Jeton Firebase invalide ou adresse email non vérifiée.'
      );
    }

    let agent =
      (await this.repo.getAgentByFirebaseUid(verified.uid)) ||
      (await this.repo.getAgentByIdentifier(verified.email));

    if (!agent) {
      if (verified.email === DEFAULT_CHIEF_EMAIL) {
        const displayParts = (verified.name || 'Chef Sidi Ali').trim().split(/\s+/);
        const prenom = displayParts[0] || 'Chef';
        const nom = displayParts.slice(1).join(' ') || 'Sidi Ali';
        agent = await this.repo.createAgent({
          agent_id: uuidv4(),
          matricule: 'CHEF-SA-001',
          nom,
          prenom,
          telephone: '045000000',
          fonction: "Chef d'équipe gaz distribution",
          photo_url: '',
          login_email: verified.email,
          firebase_uid: verified.uid,
          password_hash: '',
          role: 'CHEF',
          statut: 'ACTIF',
          must_change_password: false,
          token_version: 1,
          date_creation: nowIso(),
          derniere_connexion: nowIso(),
        });
      } else {
        throw new AuthError(
          403,
          'ACCOUNT_NOT_REGISTERED',
          "Aucun compte agent enregistré pour cet email. Demandez au chef d'équipe de créer votre fiche."
        );
      }
    }

    if (agent.statut !== 'ACTIF') {
      await this.logAuthEvent(
        agent,
        'CONNEXION_BLOQUEE',
        `Tentative de connexion Google sur compte ${agent.statut}`
      );
      this.assertAccountActive(agent);
    }

    const now = nowIso();
    const updated =
      (await this.repo.updateAgent(agent.agent_id, {
        firebase_uid: agent.firebase_uid || verified.uid,
        derniere_connexion: now,
      })) || agent;

    await this.repo.upsertSessionDevice({
      device_id: deviceId || 'web-browser',
      user_id: updated.agent_id,
      plateforme,
      derniere_connexion: now,
      token_notification: '',
      statut: 'ACTIF',
    });

    await this.logAuthEvent(
      updated,
      'CONNEXION',
      `Connexion Google/Firebase sur ${plateforme}`
    );

    const token = await signSessionToken({
      sub: updated.agent_id,
      role: updated.role,
      tv: updated.token_version,
      did: deviceId || 'web-browser',
    });

    return { token, user: toPublicAgent(updated) };
  }

  async changeOwnPassword(
    agentId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const agent = await this.repo.getAgentById(agentId);
    if (!agent) {
      throw new AuthError(404, 'AGENT_NOT_FOUND', 'Compte introuvable.');
    }
    this.assertAccountActive(agent);

    if (agent.password_hash) {
      const valid = verifyPassword(currentPassword, agent.password_hash);
      if (!valid) {
        throw new AuthError(400, 'INVALID_CURRENT_PASSWORD', 'Mot de passe actuel incorrect.');
      }
    }

    const newHash = hashPassword(newPassword);
    await this.repo.updateAgent(agentId, {
      password_hash: newHash,
      must_change_password: false,
    });

    await this.logAuthEvent(
      agent,
      'CHANGEMENT_MOT_DE_PASSE',
      "Mot de passe mis à jour par l'utilisateur"
    );
  }

  async logout(agent: AgentRecord, deviceId: string): Promise<void> {
    await this.repo.upsertSessionDevice({
      device_id: deviceId || 'web-browser',
      user_id: agent.agent_id,
      plateforme: 'WEB',
      derniere_connexion: nowIso(),
      token_notification: '',
      statut: 'RÉVOQUÉ',
    });
    await this.logAuthEvent(agent, 'DECONNEXION', 'Déconnexion explicite');
  }
}

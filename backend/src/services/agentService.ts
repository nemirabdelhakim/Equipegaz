import { v4 as uuidv4 } from 'uuid';
import type {
  AgentPublicDTO,
  AgentRecord,
  AgentStatus,
  HistoryRecord,
  UserRole,
} from '../models/domain.js';
import { toPublicAgent } from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { generateTemporaryPassword, hashPassword } from '../utils/crypto.js';
import { nowIso } from '../utils/dateAlgiers.js';

export class ServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface CreateAgentInput {
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: string;
  login_email: string;
  role: UserRole;
  statut: AgentStatus;
  photo_url?: string;
  initial_password?: string;
}

export interface UpdateAgentInput {
  matricule?: string;
  nom?: string;
  prenom?: string;
  telephone?: string;
  fonction?: string;
  login_email?: string;
  role?: UserRole;
  statut?: AgentStatus;
  photo_url?: string;
}

export class AgentService {
  constructor(private readonly repo: IDataRepository) {}

  async listAgents(requesterRole: UserRole): Promise<AgentPublicDTO[]> {
    const all = await this.repo.listAgents();
    const sorted = all.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    if (requesterRole === 'CHEF') {
      return sorted.map(toPublicAgent);
    }
    // Les agents voient l'annuaire des collègues (sans exposer d'informations internes inutiles)
    return sorted.map((a) => ({
      ...toPublicAgent(a),
      telephone: a.statut === 'ACTIF' ? a.telephone : '',
    }));
  }

  async getAgentById(agentId: string): Promise<AgentPublicDTO> {
    const found = await this.repo.getAgentById(agentId);
    if (!found) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }
    return toPublicAgent(found);
  }

  async createAgent(
    input: CreateAgentInput,
    actor: AgentRecord
  ): Promise<{ agent: AgentPublicDTO; temporaryPassword: string }> {
    const tempPassword = input.initial_password || generateTemporaryPassword();
    const passwordHash = hashPassword(tempPassword);

    const newAgent: AgentRecord = {
      agent_id: uuidv4(),
      matricule: input.matricule.toUpperCase(),
      nom: input.nom.toUpperCase(),
      prenom: input.prenom,
      telephone: input.telephone,
      fonction: input.fonction,
      photo_url: input.photo_url || '',
      login_email: input.login_email.toLowerCase(),
      firebase_uid: '',
      password_hash: passwordHash,
      role: input.role,
      statut: input.statut,
      must_change_password: true,
      token_version: 1,
      date_creation: nowIso(),
      derniere_connexion: '',
    };

    try {
      const created = await this.repo.createAgent(newAgent);
      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: '',
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'CREATION_AGENT',
        ancien_etat: '',
        nouvel_etat: created.statut,
        ancienne_valeur: '',
        nouvelle_valeur: `${created.matricule} · ${created.prenom} ${created.nom} (${created.role})`,
        commentaire: `Création du compte agent ${created.matricule}`,
        date_serveur: nowIso(),
      });
      return { agent: toPublicAgent(created), temporaryPassword: tempPassword };
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_EMAIL') {
        throw new ServiceError(
          409,
          'DUPLICATE_EMAIL',
          'Cet identifiant de connexion est déjà attribué à un autre agent.'
        );
      }
      if (err instanceof Error && err.message === 'DUPLICATE_MATRICULE') {
        throw new ServiceError(
          409,
          'DUPLICATE_MATRICULE',
          'Ce matricule professionnel existe déjà.'
        );
      }
      throw err;
    }
  }

  async updateAgent(
    agentId: string,
    input: UpdateAgentInput,
    actor: AgentRecord
  ): Promise<AgentPublicDTO> {
    const existing = await this.repo.getAgentById(agentId);
    if (!existing) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }

    if (agentId === actor.agent_id && input.role && input.role !== 'CHEF') {
      throw new ServiceError(
        400,
        'CANNOT_DEMOTE_SELF',
        'Le chef connecté ne peut pas retirer son propre rôle de chef.'
      );
    }

    const patch: Partial<AgentRecord> = {
      ...(input.matricule ? { matricule: input.matricule.toUpperCase() } : {}),
      ...(input.nom ? { nom: input.nom.toUpperCase() } : {}),
      ...(input.prenom ? { prenom: input.prenom } : {}),
      ...(input.telephone ? { telephone: input.telephone } : {}),
      ...(input.fonction ? { fonction: input.fonction } : {}),
      ...(input.login_email ? { login_email: input.login_email.toLowerCase() } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.statut ? { statut: input.statut } : {}),
      ...(input.photo_url !== undefined ? { photo_url: input.photo_url } : {}),
    };

    try {
      const updated = await this.repo.updateAgent(agentId, patch);
      if (!updated) {
        throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
      }

      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: '',
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'MODIFICATION_AGENT',
        ancien_etat: existing.statut,
        nouvel_etat: updated.statut,
        ancienne_valeur: `${existing.matricule} · ${existing.fonction}`,
        nouvelle_valeur: `${updated.matricule} · ${updated.fonction}`,
        commentaire: `Mise à jour de la fiche de ${updated.prenom} ${updated.nom}`,
        date_serveur: nowIso(),
      });

      return toPublicAgent(updated);
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_EMAIL') {
        throw new ServiceError(409, 'DUPLICATE_EMAIL', 'Identifiant de connexion déjà utilisé.');
      }
      if (err instanceof Error && err.message === 'DUPLICATE_MATRICULE') {
        throw new ServiceError(409, 'DUPLICATE_MATRICULE', 'Matricule déjà utilisé.');
      }
      throw err;
    }
  }

  async changeAgentStatus(
    agentId: string,
    statut: AgentStatus,
    commentaire: string | undefined,
    actor: AgentRecord
  ): Promise<AgentPublicDTO> {
    const existing = await this.repo.getAgentById(agentId);
    if (!existing) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }

    if (agentId === actor.agent_id && statut !== 'ACTIF') {
      throw new ServiceError(
        400,
        'CANNOT_DISABLE_SELF',
        'Vous ne pouvez pas désactiver votre propre compte chef.'
      );
    }

    // Révoquer les jetons existants dès qu'un agent quitte le statut ACTIF
    const nextTokenVersion =
      statut !== 'ACTIF' ? existing.token_version + 1 : existing.token_version;

    const updated = await this.repo.updateAgent(agentId, {
      statut,
      token_version: nextTokenVersion,
    });
    if (!updated) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }

    if (statut !== 'ACTIF') {
      await this.repo.revokeUserSessions(agentId);
    }

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: statut === 'ACTIF' ? 'REACTIVATION_AGENT' : 'CHANGEMENT_STATUT_AGENT',
      ancien_etat: existing.statut,
      nouvel_etat: updated.statut,
      ancienne_valeur: existing.statut,
      nouvelle_valeur: updated.statut,
      commentaire:
        commentaire ||
        `Statut de ${updated.prenom} ${updated.nom} (${updated.matricule}) modifié vers ${statut}`,
      date_serveur: nowIso(),
    });

    return toPublicAgent(updated);
  }

  async resetAgentAccess(
    agentId: string,
    actor: AgentRecord
  ): Promise<{ agent: AgentPublicDTO; temporaryPassword: string }> {
    const existing = await this.repo.getAgentById(agentId);
    if (!existing) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }

    const tempPassword = generateTemporaryPassword();
    const updated = await this.repo.updateAgent(agentId, {
      password_hash: hashPassword(tempPassword),
      must_change_password: true,
      token_version: existing.token_version + 1,
    });
    if (!updated) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }

    await this.repo.revokeUserSessions(agentId);

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'REINITIALISATION_ACCES',
      ancien_etat: existing.statut,
      nouvel_etat: updated.statut,
      ancienne_valeur: `token_v${existing.token_version}`,
      nouvelle_valeur: `token_v${updated.token_version}`,
      commentaire: `Réinitialisation sécurisée du mot de passe et révocation des sessions pour ${updated.matricule}`,
      date_serveur: nowIso(),
    });

    return { agent: toPublicAgent(updated), temporaryPassword: tempPassword };
  }

  async getAgentHistory(agentId: string): Promise<HistoryRecord[]> {
    const existing = await this.repo.getAgentById(agentId);
    if (!existing) {
      throw new ServiceError(404, 'AGENT_NOT_FOUND', 'Agent introuvable.');
    }
    const all = await this.repo.listHistory({ limit: 500 });
    return all.filter(
      (h) =>
        h.user_id === agentId ||
        h.nouvelle_valeur.includes(existing.matricule) ||
        h.commentaire.includes(existing.matricule)
    );
  }
}

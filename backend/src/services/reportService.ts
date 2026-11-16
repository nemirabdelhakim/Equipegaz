import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentRecord,
  PhotoRecord,
  PhotoType,
  ReportDTO,
  ReportRecord,
} from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { nowIso } from '../utils/dateAlgiers.js';
import { ServiceError } from './agentService.js';
import type { GoogleSyncService } from './googleSyncService.js';

export interface CreateReportInput {
  travail_effectue: string;
  resultat: string;
  difficultes: string;
  materiel: string;
  travaux_restants: string;
  recommandations: string;
  temps_passe_minutes: number;
  photo_ids: string[];
}

export interface UploadPhotoInput {
  type_photo: PhotoType;
  file_name: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
  data_base64: string;
  report_id?: string;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 Mo max

export class ReportService {
  constructor(
    private readonly repo: IDataRepository,
    private readonly syncService?: GoogleSyncService,
    private readonly uploadsDir = path.resolve(process.cwd(), 'database', 'uploads')
  ) {}

  private async hydrateReports(reports: ReportRecord[]): Promise<ReportDTO[]> {
    const [agents, photos] = await Promise.all([
      this.repo.listAgents(),
      this.repo.listPhotos(),
    ]);
    const agentMap = new Map<string, AgentRecord>();
    for (const a of agents) {
      agentMap.set(a.agent_id, a);
    }

    return reports
      .map((r) => {
        const author = agentMap.get(r.agent_id);
        const validator = r.validateur_id ? agentMap.get(r.validateur_id) : undefined;
        const attachedPhotos = photos.filter(
          (p) => p.report_id === r.report_id || (!p.report_id && p.task_id === r.task_id)
        );
        return {
          ...r,
          agent_matricule: author?.matricule || '—',
          agent_nom: author?.nom || 'Agent',
          agent_prenom: author?.prenom || '',
          validateur_nom: validator ? `${validator.prenom} ${validator.nom}`.trim() : '',
          photos: attachedPhotos,
        };
      })
      .sort((a, b) => {
        const cmpDate = b.date_soumission.localeCompare(a.date_soumission);
        return cmpDate !== 0 ? cmpDate : b.version - a.version;
      });
  }

  async listAllReports(): Promise<ReportDTO[]> {
    const reports = await this.repo.listReports();
    return this.hydrateReports(reports);
  }

  async listTaskReportsAndPhotos(taskId: string): Promise<{
    reports: ReportDTO[];
    photos: PhotoRecord[];
  }> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }
    const [reports, photos] = await Promise.all([
      this.repo.listReports(taskId),
      this.repo.listPhotos({ taskId }),
    ]);
    return {
      reports: await this.hydrateReports(reports),
      photos: photos.sort((a, b) => a.date_creation.localeCompare(b.date_creation)),
    };
  }

  async uploadTaskPhoto(
    taskId: string,
    input: UploadPhotoInput,
    actor: AgentRecord
  ): Promise<PhotoRecord> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }
    if (task.statut_global === 'ANNULÉE' || task.statut_global === 'VALIDÉE') {
      throw new ServiceError(
        400,
        'TASK_LOCKED',
        `Impossible d'ajouter une photo sur une tâche au statut ${task.statut_global}.`
      );
    }

    const assignments = await this.repo.listAssignments(taskId);
    const isAssigned = assignments.some((a) => a.agent_id === actor.agent_id);
    if (actor.role !== 'CHEF' && !isAssigned) {
      throw new ServiceError(
        403,
        'NOT_ASSIGNED',
        "Accès refusé : vous n'êtes pas affecté(e) à cette tâche."
      );
    }

    // Nettoyage éventuel d'un préfixe data URL
    const rawBase64 = input.data_base64.includes(',')
      ? input.data_base64.slice(input.data_base64.indexOf(',') + 1)
      : input.data_base64;

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      throw new ServiceError(400, 'INVALID_IMAGE', 'Fichier photo vide ou corrompu.');
    }
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw new ServiceError(
        400,
        'IMAGE_TOO_LARGE',
        'La photo dépasse la taille maximale autorisée de 8 Mo.'
      );
    }

    const photoId = uuidv4();
    const ext =
      input.mime_type === 'image/png'
        ? 'png'
        : input.mime_type === 'image/webp'
          ? 'webp'
          : 'jpg';
    const cleanBase = input.file_name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.[^.]+$/, '')
      .slice(0, 60);
    const storedFileName = `${task.numero_tache}_${input.type_photo}_${cleanBase || 'photo'}_${photoId.slice(0, 8)}.${ext}`;

    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    const localFullPath = path.join(this.uploadsDir, storedFileName);
    fs.writeFileSync(localFullPath, buffer);

    let driveFileId = '';
    let driveUrl = `/api/photos/${photoId}/content`;
    let syncedToDrive = false;

    if (this.syncService) {
      const driveRes = await this.syncService.tryUploadTaskPhotoToDrive(
        task.numero_tache,
        storedFileName,
        input.mime_type,
        buffer
      );
      if (driveRes) {
        driveFileId = driveRes.driveFileId;
        driveUrl = driveRes.driveUrl;
        syncedToDrive = true;
      }
    }

    const now = nowIso();
    const photo: PhotoRecord = {
      photo_id: photoId,
      task_id: taskId,
      report_id: input.report_id || '',
      agent_id: actor.agent_id,
      type_photo: input.type_photo,
      file_name: storedFileName,
      mime_type: input.mime_type,
      size_bytes: buffer.length,
      drive_file_id: driveFileId,
      drive_url: driveUrl,
      local_file: storedFileName,
      synced_to_drive: syncedToDrive,
      date_creation: now,
    };

    const created = await this.repo.createPhoto(photo);

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'AJOUT_PHOTO',
      ancien_etat: task.statut_global,
      nouvel_etat: task.statut_global,
      ancienne_valeur: '',
      nouvelle_valeur: `${input.type_photo} · ${storedFileName}`,
      commentaire: syncedToDrive
        ? `Photo ${input.type_photo} archivée sur Google Drive`
        : `Photo ${input.type_photo} enregistrée (en attente de synchronisation Drive)`,
      date_serveur: now,
    });

    return created;
  }

  async getPhotoFileBuffer(photoId: string): Promise<{
    photo: PhotoRecord;
    buffer: Buffer;
  }> {
    const photo = await this.repo.getPhotoById(photoId);
    if (!photo) {
      throw new ServiceError(404, 'PHOTO_NOT_FOUND', 'Photo introuvable.');
    }
    const localFullPath = path.join(this.uploadsDir, path.basename(photo.local_file));
    if (!photo.local_file || !fs.existsSync(localFullPath)) {
      throw new ServiceError(404, 'PHOTO_FILE_MISSING', 'Fichier photo local indisponible.');
    }
    return {
      photo,
      buffer: fs.readFileSync(localFullPath),
    };
  }

  async submitReport(
    taskId: string,
    input: CreateReportInput,
    actor: AgentRecord
  ): Promise<ReportDTO> {
    const task = await this.repo.getTaskById(taskId);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche introuvable.');
    }
    if (task.statut_global === 'ANNULÉE' || task.statut_global === 'VALIDÉE') {
      throw new ServiceError(
        400,
        'TASK_LOCKED',
        `Impossible de soumettre un compte-rendu : la tâche est ${task.statut_global}.`
      );
    }

    const assignments = await this.repo.listAssignments(taskId);
    const myAssignment = assignments.find((a) => a.agent_id === actor.agent_id);
    if (!myAssignment) {
      throw new ServiceError(
        403,
        'NOT_ASSIGNED',
        "Accès refusé : vous devez être affecté(e) à la tâche pour soumettre un compte-rendu."
      );
    }

    const existingReports = await this.repo.listReports(taskId);
    const maxVersion = existingReports.reduce((max, r) => Math.max(max, r.version), 0);
    const nextVersion = maxVersion + 1;
    const now = nowIso();
    const reportId = uuidv4();

    const newReport: ReportRecord = {
      report_id: reportId,
      task_id: taskId,
      agent_id: actor.agent_id,
      version: nextVersion,
      travail_effectue: input.travail_effectue,
      resultat: input.resultat,
      difficultes: input.difficultes,
      materiel: input.materiel,
      travaux_restants: input.travaux_restants,
      recommandations: input.recommandations,
      temps_passe_minutes: input.temps_passe_minutes,
      date_soumission: now,
      validation: 'EN_ATTENTE',
      commentaire_chef: '',
      date_validation: '',
      validateur_id: '',
    };

    await this.repo.createReport(newReport);

    // Lier les photos sélectionnées (ou photos non liées de la tâche par cet agent) à ce compte-rendu
    const taskPhotos = await this.repo.listPhotos({ taskId });
    for (const p of taskPhotos) {
      if (
        input.photo_ids.includes(p.photo_id) ||
        (!p.report_id && p.agent_id === actor.agent_id)
      ) {
        await this.repo.updatePhoto(p.photo_id, { report_id: reportId });
      }
    }

    // Marquer l'affectation de l'agent comme TERMINÉE si ce n'est pas déjà fait
    if (myAssignment.statut_agent !== 'TERMINÉE') {
      await this.repo.updateAssignment(myAssignment.assignment_id, {
        statut_agent: 'TERMINÉE',
        motif_blocage_attente: '',
        date_acceptation: myAssignment.date_acceptation || now,
        date_debut: myAssignment.date_debut || now,
        date_fin: now,
      });
    }

    const prevGlobal = task.statut_global;
    const nextTaskVersion = task.version + 1;
    await this.repo.updateTask(taskId, {
      statut_global: 'À VALIDER',
      version: nextTaskVersion,
      updated_at: now,
    });

    const actorName = `${actor.prenom} ${actor.nom}`.trim();
    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: taskId,
      user_id: actor.agent_id,
      user_name: actorName,
      action: 'SOUMISSION_COMPTE_RENDU',
      ancien_etat: prevGlobal,
      nouvel_etat: 'À VALIDER',
      ancienne_valeur: maxVersion > 0 ? `v${maxVersion}` : '',
      nouvelle_valeur: `v${nextVersion}`,
      commentaire: `Compte-rendu v${nextVersion} soumis par ${actorName} (${input.resultat})`,
      date_serveur: now,
    });

    // Notifier les Chefs actifs
    const activeChefs = (await this.repo.listAgents()).filter(
      (a) => a.role === 'CHEF' && a.statut === 'ACTIF' && a.agent_id !== actor.agent_id
    );
    for (const chef of activeChefs) {
      await this.repo.createNotificationIfUnique({
        notification_id: uuidv4(),
        dedup_key: `COMPTE_RENDU_SOUMIS:${taskId}:${chef.agent_id}:v${nextVersion}`,
        user_id: chef.agent_id,
        task_id: taskId,
        type_event: 'COMPTE_RENDU_SOUMIS',
        titre: `À valider · ${task.numero_tache} (v${nextVersion})`,
        message: `${actorName} a soumis un compte-rendu v${nextVersion} pour "${task.titre}".`,
        date_creation: now,
        statut_envoi: 'ENVOYÉ',
        date_lecture: '',
      });
    }

    const hydrated = await this.hydrateReports([newReport]);
    return hydrated[0];
  }

  async reviewReport(
    reportId: string,
    decision: 'VALIDÉ' | 'REFUSÉ',
    commentaireChef: string,
    actor: AgentRecord
  ): Promise<ReportDTO> {
    if (actor.role !== 'CHEF') {
      throw new ServiceError(403, 'FORBIDDEN', "Validation réservée au Chef d'équipe.");
    }

    const report = await this.repo.getReportById(reportId);
    if (!report) {
      throw new ServiceError(404, 'REPORT_NOT_FOUND', 'Compte-rendu introuvable.');
    }

    const task = await this.repo.getTaskById(report.task_id);
    if (!task) {
      throw new ServiceError(404, 'TASK_NOT_FOUND', 'Tâche associée introuvable.');
    }

    const cleanComment = commentaireChef.trim();
    if (decision === 'REFUSÉ' && cleanComment.length < 5) {
      throw new ServiceError(
        400,
        'REASON_REQUIRED',
        'Un motif détaillé (minimum 5 caractères) est obligatoire pour refuser un compte-rendu.'
      );
    }

    const now = nowIso();
    const updatedReport =
      (await this.repo.updateReport(reportId, {
        validation: decision,
        commentaire_chef: cleanComment,
        date_validation: now,
        validateur_id: actor.agent_id,
      })) || report;

    const prevGlobal = task.statut_global;
    const nextGlobal = decision === 'VALIDÉ' ? 'VALIDÉE' : 'REFUSÉE';
    const nextTaskVersion = task.version + 1;

    await this.repo.updateTask(task.task_id, {
      statut_global: nextGlobal,
      version: nextTaskVersion,
      updated_at: now,
    });

    const assignments = await this.repo.listAssignments(task.task_id);
    if (decision === 'VALIDÉ') {
      for (const asg of assignments) {
        if (asg.statut_agent !== 'TERMINÉE') {
          await this.repo.updateAssignment(asg.assignment_id, {
            statut_agent: 'TERMINÉE',
            date_fin: asg.date_fin || now,
          });
        }
      }
    } else {
      // Sur refus : replacer l'affectation de l'auteur en EN COURS pour correction immédiate
      const authorAsg = assignments.find((a) => a.agent_id === report.agent_id);
      if (authorAsg) {
        await this.repo.updateAssignment(authorAsg.assignment_id, {
          statut_agent: 'EN COURS',
        });
      }
    }

    const actorName = `${actor.prenom} ${actor.nom}`.trim();
    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: task.task_id,
      user_id: actor.agent_id,
      user_name: actorName,
      action: decision === 'VALIDÉ' ? 'VALIDATION_COMPTE_RENDU' : 'REFUS_COMPTE_RENDU',
      ancien_etat: prevGlobal,
      nouvel_etat: nextGlobal,
      ancienne_valeur: `CR v${report.version} (${report.validation})`,
      nouvelle_valeur: `CR v${report.version} (${decision})`,
      commentaire:
        cleanComment ||
        `Compte-rendu v${report.version} validé par ${actorName}`,
      date_serveur: now,
    });

    // Notifier les agents affectés (et l'auteur)
    const recipientIds = Array.from(
      new Set([report.agent_id, ...assignments.map((a) => a.agent_id)])
    );
    for (const userId of recipientIds) {
      await this.repo.createNotificationIfUnique({
        notification_id: uuidv4(),
        dedup_key: `CR_DECISION:${reportId}:${userId}:${decision}:v${nextTaskVersion}`,
        user_id: userId,
        task_id: task.task_id,
        type_event:
          decision === 'VALIDÉ' ? 'COMPTE_RENDU_VALIDE' : 'COMPTE_RENDU_REFUSE',
        titre:
          decision === 'VALIDÉ'
            ? `Validé · ${task.numero_tache} (v${report.version})`
            : `Correction requise · ${task.numero_tache} (v${report.version})`,
        message:
          decision === 'VALIDÉ'
            ? `Votre compte-rendu v${report.version} pour "${task.titre}" a été validé.`
            : `Compte-rendu v${report.version} refusé : ${cleanComment}`,
        date_creation: now,
        statut_envoi: 'ENVOYÉ',
        date_lecture: '',
      });
    }

    const hydrated = await this.hydrateReports([updatedReport]);
    return hydrated[0];
  }
}

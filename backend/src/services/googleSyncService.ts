import fs from 'fs';
import { SignJWT, importPKCS8 } from 'jose';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SHEETS_SCHEMA } from '../../../database/google-sheets/sheetDefinitions.js';
import type { AgentRecord, CentralStoreSnapshot } from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import { formatDateTimeAlgiers, nowIso } from '../utils/dateAlgiers.js';
import { GoogleApiError, GoogleSheetsClient } from './googleSheetsClient.js';

export interface WorkspaceLinkMetadata {
  spreadsheetId: string;
  spreadsheetUrl: string;
  driveFolderId: string;
  connectedAccountEmail: string;
  lastSyncedAt: string;
  pendingMutations: number;
}

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  createdAtFr: string;
}

export class GoogleSyncService {
  private readonly client = new GoogleSheetsClient();
  private readonly linkFilePath: string;
  private readonly backupsDir: string;
  private inMemoryOAuthToken: string | null = null;
  private tokenExpiresAt = 0;
  private syncQueue: Promise<void> = Promise.resolve();

  private metadata: WorkspaceLinkMetadata = {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    spreadsheetUrl: process.env.GOOGLE_SPREADSHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}`
      : '',
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    connectedAccountEmail: '',
    lastSyncedAt: '',
    pendingMutations: 0,
  };

  constructor(private readonly repo: IDataRepository) {
    this.backupsDir = path.resolve(process.cwd(), 'database', 'backups');
    this.linkFilePath = path.join(this.backupsDir, 'workspace-link.json');
    this.loadMetadata();
  }

  private loadMetadata(): void {
    try {
      if (fs.existsSync(this.linkFilePath)) {
        const parsed = JSON.parse(
          fs.readFileSync(this.linkFilePath, 'utf-8')
        ) as Partial<WorkspaceLinkMetadata>;
        this.metadata = {
          spreadsheetId: parsed.spreadsheetId || this.metadata.spreadsheetId,
          spreadsheetUrl: parsed.spreadsheetUrl || this.metadata.spreadsheetUrl,
          driveFolderId: parsed.driveFolderId || this.metadata.driveFolderId,
          connectedAccountEmail: parsed.connectedAccountEmail || '',
          lastSyncedAt: parsed.lastSyncedAt || '',
          pendingMutations: parsed.pendingMutations || 0,
        };
      }
    } catch {
      // ignore malformed metadata
    }
  }

  private saveMetadata(): void {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
    const tmp = `${this.linkFilePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.metadata, null, 2), 'utf-8');
    fs.renameSync(tmp, this.linkFilePath);
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const res = this.syncQueue.then(fn, fn);
    this.syncQueue = res.then(
      () => undefined,
      () => undefined
    );
    return res;
  }

  private async getServiceAccountAccessToken(): Promise<string | null> {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !rawKey) return null;

    const privateKeyPem = rawKey.replace(/\\n/g, '\n');
    const pk = await importPKCS8(privateKeyPem, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(pk);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token || null;
  }

  private async resolveActiveToken(explicitToken?: string): Promise<string | null> {
    if (explicitToken) {
      this.inMemoryOAuthToken = explicitToken;
      this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      return explicitToken;
    }
    if (this.inMemoryOAuthToken && Date.now() < this.tokenExpiresAt) {
      return this.inMemoryOAuthToken;
    }
    const saToken = await this.getServiceAccountAccessToken();
    if (saToken) return saToken;
    return null;
  }

  async connectWithOAuthToken(accessToken: string, actor: AgentRecord): Promise<{
    connected: boolean;
    email: string;
    metadata: WorkspaceLinkMetadata;
  }> {
    const info = await this.client.verifyToken(accessToken);
    this.inMemoryOAuthToken = accessToken;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    this.metadata.connectedAccountEmail = info.email || actor.login_email;
    this.saveMetadata();

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'CONNEXION_GOOGLE_WORKSPACE',
      ancien_etat: '',
      nouvel_etat: 'CONNECTÉ',
      ancienne_valeur: '',
      nouvelle_valeur: this.metadata.connectedAccountEmail,
      commentaire: 'Autorisation Google Sheets & Drive activée côté serveur',
      date_serveur: nowIso(),
    });

    return {
      connected: true,
      email: this.metadata.connectedAccountEmail,
      metadata: { ...this.metadata },
    };
  }

  disconnectOAuth(): void {
    this.inMemoryOAuthToken = null;
    this.tokenExpiresAt = 0;
  }

  getStatus() {
    const hasServiceAccount = Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
    );
    const hasOAuthSession = Boolean(
      this.inMemoryOAuthToken && Date.now() < this.tokenExpiresAt
    );

    return {
      googleConnected: hasServiceAccount || hasOAuthSession,
      authMode: hasServiceAccount
        ? 'SERVICE_ACCOUNT'
        : hasOAuthSession
          ? 'OAUTH_SESSION'
          : 'LOCAL_MIRROR',
      metadata: { ...this.metadata },
      sheetCount: SHEETS_SCHEMA.length,
      sheets: SHEETS_SCHEMA.map((s) => ({ name: s.name, columns: s.headers.length })),
      backupsCount: this.listBackups().length,
    };
  }

  async provisionWorkbookAndDrive(
    actor: AgentRecord,
    explicitToken?: string,
    customSpreadsheetId?: string
  ): Promise<WorkspaceLinkMetadata> {
    return this.enqueue(async () => {
      const token = await this.resolveActiveToken(explicitToken);
      if (!token) {
        throw new GoogleApiError(
          401,
          'Connexion Google Workspace requise pour créer ou lier le classeur Google Sheets.'
        );
      }

      const folder = await this.client.ensureDriveFolder(token);
      const wb = await this.client.ensureWorkbook(
        token,
        customSpreadsheetId || this.metadata.spreadsheetId || undefined
      );

      this.metadata.spreadsheetId = wb.spreadsheetId;
      this.metadata.spreadsheetUrl = wb.spreadsheetUrl;
      this.metadata.driveFolderId = folder.id;
      this.saveMetadata();

      await this.pushAllInternal(token);

      await this.repo.appendHistory({
        history_id: uuidv4(),
        task_id: '',
        user_id: actor.agent_id,
        user_name: `${actor.prenom} ${actor.nom}`.trim(),
        action: 'PROVISIONING_GOOGLE_SHEETS',
        ancien_etat: '',
        nouvel_etat: 'PROVISIONNÉ',
        ancienne_valeur: '',
        nouvelle_valeur: wb.spreadsheetId,
        commentaire: `Classeur GESTION_EQUIPE_GAZ_SIDI_ALI (11 feuilles) et dossier Drive initialisés`,
        date_serveur: nowIso(),
      });

      return { ...this.metadata };
    });
  }

  private async pushAllInternal(token: string): Promise<void> {
    if (!this.metadata.spreadsheetId) {
      throw new GoogleApiError(400, 'Aucun classeur Google Sheets lié pour le moment.');
    }

    const snap = await this.repo.exportSnapshot();

    // 1. AGENTS (sans JAMAIS exporter password_hash !)
    const agentHeaders = SHEETS_SCHEMA.find((s) => s.name === 'AGENTS')!.headers;
    const agentRows = snap.agents.map((a) => [
      a.agent_id,
      a.matricule,
      a.nom,
      a.prenom,
      a.telephone,
      a.fonction,
      a.role,
      a.statut,
      a.date_creation,
      a.derniere_connexion || '',
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'AGENTS',
      agentHeaders,
      agentRows
    );

    // 2. HISTORIQUE
    const histHeaders = SHEETS_SCHEMA.find((s) => s.name === 'HISTORIQUE')!.headers;
    const histRows = snap.history.map((h) => [
      h.history_id,
      h.task_id || '',
      h.user_id,
      h.action,
      h.ancien_etat || '',
      h.nouvel_etat || '',
      h.ancienne_valeur || '',
      h.nouvelle_valeur || '',
      h.date_serveur,
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'HISTORIQUE',
      histHeaders,
      histRows
    );

    // 3. PARAMETRES
    const paramHeaders = SHEETS_SCHEMA.find((s) => s.name === 'PARAMETRES')!.headers;
    const paramRows = snap.parameters.map((p) => [
      p.param_id,
      p.categorie,
      p.valeur,
      p.libelle,
      p.actif ? 'TRUE' : 'FALSE',
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'PARAMETRES',
      paramHeaders,
      paramRows
    );

    // 4. SESSIONS_ET_APPAREILS
    const sessHeaders = SHEETS_SCHEMA.find((s) => s.name === 'SESSIONS_ET_APPAREILS')!.headers;
    const sessRows = snap.sessions.map((s) => [
      s.device_id,
      s.user_id,
      s.plateforme,
      s.derniere_connexion,
      s.token_notification || '',
      s.statut,
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'SESSIONS_ET_APPAREILS',
      sessHeaders,
      sessRows
    );

    // 5. TACHES
    const taskHeaders = SHEETS_SCHEMA.find((s) => s.name === 'TACHES')!.headers;
    const taskRows = (snap.tasks || []).map((t) => [
      t.task_id,
      t.numero_tache,
      t.titre,
      t.categorie,
      t.description,
      t.instructions,
      t.commune,
      t.dp,
      t.adresse,
      t.latitude || '',
      t.longitude || '',
      t.priorite,
      t.date_creation,
      t.date_debut_prevue,
      t.date_fin_prevue,
      t.statut_global,
      t.createur_id,
      t.updated_at,
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'TACHES',
      taskHeaders,
      taskRows
    );

    // 6. AFFECTATIONS
    const asgHeaders = SHEETS_SCHEMA.find((s) => s.name === 'AFFECTATIONS')!.headers;
    const asgRows = (snap.assignments || []).map((a) => [
      a.assignment_id,
      a.task_id,
      a.agent_id,
      a.date_affectation,
      a.statut_agent,
      a.date_acceptation || '',
      a.date_debut || '',
      a.date_fin || '',
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'AFFECTATIONS',
      asgHeaders,
      asgRows
    );

    // 7. NOTIFICATIONS
    const notifHeaders = SHEETS_SCHEMA.find((s) => s.name === 'NOTIFICATIONS')!.headers;
    const notifRows = (snap.notifications || []).map((n) => [
      n.notification_id,
      n.user_id,
      n.task_id || '',
      n.titre,
      n.message,
      n.date_creation,
      n.statut_envoi,
      n.date_lecture || '',
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'NOTIFICATIONS',
      notifHeaders,
      notifRows
    );

    // 8. COMPTES_RENDUS
    const crHeaders = SHEETS_SCHEMA.find((s) => s.name === 'COMPTES_RENDUS')!.headers;
    const crRows = (snap.reports || []).map((r) => [
      r.report_id,
      r.task_id,
      r.agent_id,
      r.version,
      r.travail_effectue,
      r.resultat,
      r.difficultes,
      r.materiel,
      r.travaux_restants,
      r.recommandations,
      r.date_soumission,
      r.validation,
      r.commentaire_chef || '',
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'COMPTES_RENDUS',
      crHeaders,
      crRows
    );

    // 9. PHOTOS (et rattrapage des photos locales non encore envoyées vers Drive)
    const uploadsDir = path.resolve(process.cwd(), 'database', 'uploads');
    for (const p of snap.photos || []) {
      if (!p.synced_to_drive && p.local_file) {
        const localPath = path.join(uploadsDir, path.basename(p.local_file));
        if (fs.existsSync(localPath)) {
          try {
            const task = (snap.tasks || []).find((t) => t.task_id === p.task_id);
            const uploaded = await this.uploadPhotoToDriveInternal(
              token,
              task?.numero_tache || p.task_id,
              p.file_name,
              p.mime_type,
              fs.readFileSync(localPath)
            );
            await this.repo.updatePhoto(p.photo_id, {
              drive_file_id: uploaded.id,
              drive_url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
              synced_to_drive: true,
            });
            p.drive_file_id = uploaded.id;
            p.drive_url =
              uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
          } catch {
            // Conserver le fichier local si l'envoi Drive échoue ponctuellement
          }
        }
      }
    }

    const photoHeaders = SHEETS_SCHEMA.find((s) => s.name === 'PHOTOS')!.headers;
    const photoRows = (snap.photos || []).map((p) => [
      p.photo_id,
      p.task_id,
      p.report_id || '',
      p.agent_id,
      p.type_photo,
      p.drive_file_id || '',
      p.drive_url || '',
      p.date_creation,
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'PHOTOS',
      photoHeaders,
      photoRows
    );

    // 10. SYNCHRONISATION (journal des opérations hors-ligne / client UUID)
    const syncHeaders = SHEETS_SCHEMA.find((s) => s.name === 'SYNCHRONISATION')!.headers;
    const syncRows = (snap.sync_operations || []).map((op) => [
      op.operation_id,
      op.user_id,
      op.device_id,
      op.type_operation,
      op.date_operation,
      op.statut,
      op.message_erreur || '',
    ]);
    await this.client.replaceSheetData(
      token,
      this.metadata.spreadsheetId,
      'SYNCHRONISATION',
      syncHeaders,
      syncRows
    );

    this.metadata.lastSyncedAt = nowIso();
    this.metadata.pendingMutations = 0;
    this.saveMetadata();
  }

  async syncNow(actor?: AgentRecord, explicitToken?: string): Promise<WorkspaceLinkMetadata> {
    return this.enqueue(async () => {
      const token = await this.resolveActiveToken(explicitToken);
      if (!token) {
        this.metadata.pendingMutations += 1;
        this.saveMetadata();
        throw new GoogleApiError(
          401,
          'Aucune session Google active pour synchroniser le classeur.'
        );
      }

      if (!this.metadata.spreadsheetId) {
        const wb = await this.client.ensureWorkbook(token);
        this.metadata.spreadsheetId = wb.spreadsheetId;
        this.metadata.spreadsheetUrl = wb.spreadsheetUrl;
      }

      await this.pushAllInternal(token);

      if (actor) {
        await this.repo.appendHistory({
          history_id: uuidv4(),
          task_id: '',
          user_id: actor.agent_id,
          user_name: `${actor.prenom} ${actor.nom}`.trim(),
          action: 'SYNCHRONISATION_GOOGLE_SHEETS',
          ancien_etat: '',
          nouvel_etat: 'SYNCHRONISÉ',
          ancienne_valeur: '',
          nouvelle_valeur: this.metadata.spreadsheetId,
          commentaire: 'Synchronisation manuelle vers Google Sheets exécutée',
          date_serveur: nowIso(),
        });
      }

      return { ...this.metadata };
    });
  }

  markPendingMutation(): void {
    this.metadata.pendingMutations += 1;
    this.saveMetadata();
  }

  async tryBackgroundSync(): Promise<void> {
    const token = await this.resolveActiveToken();
    if (!token || !this.metadata.spreadsheetId) {
      this.markPendingMutation();
      return;
    }
    try {
      await this.enqueue(() => this.pushAllInternal(token));
    } catch {
      this.markPendingMutation();
    }
  }

  private async uploadPhotoToDriveInternal(
    token: string,
    taskNumber: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const rootFolderId =
      this.metadata.driveFolderId || (await this.client.ensureDriveFolder(token)).id;
    if (!this.metadata.driveFolderId) {
      this.metadata.driveFolderId = rootFolderId;
      this.saveMetadata();
    }
    const taskFolder = await this.client.ensureDriveSubfolder(
      token,
      rootFolderId,
      taskNumber
    );
    return this.client.uploadBinaryFileToFolder(
      token,
      taskFolder.id,
      fileName,
      mimeType,
      buffer
    );
  }

  async tryUploadTaskPhotoToDrive(
    taskNumber: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ driveFileId: string; driveUrl: string } | null> {
    const token = await this.resolveActiveToken();
    if (!token) return null;
    try {
      const uploaded = await this.enqueue(() =>
        this.uploadPhotoToDriveInternal(token, taskNumber, fileName, mimeType, buffer)
      );
      return {
        driveFileId: uploaded.id,
        driveUrl:
          uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      };
    } catch {
      return null;
    }
  }

  async inspectSheetPreview(
    sheetName: string,
    explicitToken?: string
  ): Promise<{ sheetName: string; headers: string[]; rows: string[][] }> {
    const token = await this.resolveActiveToken(explicitToken);
    if (!token || !this.metadata.spreadsheetId) {
      throw new GoogleApiError(
        400,
        'Classeur Google Sheets non connecté ou non provisionné.'
      );
    }
    const values = await this.client.readSheetValues(
      token,
      this.metadata.spreadsheetId,
      sheetName
    );
    const [headers = [], ...rows] = values;
    return { sheetName, headers, rows };
  }

  listBackups(): BackupFileInfo[] {
    if (!fs.existsSync(this.backupsDir)) return [];
    return fs
      .readdirSync(this.backupsDir)
      .filter((name) => name.startsWith('backup-') && name.endsWith('.json'))
      .map((filename) => {
        const stat = fs.statSync(path.join(this.backupsDir, filename));
        const iso = stat.mtime.toISOString();
        return {
          filename,
          sizeBytes: stat.size,
          createdAt: iso,
          createdAtFr: formatDateTimeAlgiers(iso),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createBackup(
    actor: AgentRecord,
    uploadToDrive = false,
    explicitToken?: string
  ): Promise<{ backup: BackupFileInfo; driveFileUrl?: string }> {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
    const snap = await this.repo.exportSnapshot();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${stamp}.json`;
    const filePath = path.join(this.backupsDir, filename);
    const serialized = JSON.stringify(snap, null, 2);
    fs.writeFileSync(filePath, serialized, 'utf-8');

    let driveFileUrl: string | undefined;
    if (uploadToDrive) {
      const token = await this.resolveActiveToken(explicitToken);
      if (token) {
        const folderId =
          this.metadata.driveFolderId ||
          (await this.client.ensureDriveFolder(token)).id;
        this.metadata.driveFolderId = folderId;
        this.saveMetadata();
        const uploaded = await this.client.uploadJsonFileToFolder(
          token,
          folderId,
          filename,
          serialized
        );
        driveFileUrl = uploaded.webViewLink;
      }
    }

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'SAUVEGARDE_CENTRALE',
      ancien_etat: '',
      nouvel_etat: 'ARCHIVÉE',
      ancienne_valeur: '',
      nouvelle_valeur: filename,
      commentaire: driveFileUrl
        ? `Sauvegarde créée (${filename}) et archivée sur Google Drive`
        : `Sauvegarde locale créée (${filename})`,
      date_serveur: nowIso(),
    });

    const stat = fs.statSync(filePath);
    return {
      backup: {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        createdAtFr: formatDateTimeAlgiers(stat.mtime),
      },
      driveFileUrl,
    };
  }

  async restoreBackup(filename: string, actor: AgentRecord): Promise<void> {
    if (!/^backup-[A-Za-z0-9\-_]+\.json$/.test(filename)) {
      throw new GoogleApiError(400, 'Nom de fichier de sauvegarde invalide.');
    }
    const filePath = path.join(this.backupsDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new GoogleApiError(404, 'Sauvegarde introuvable.');
    }

    const parsed = JSON.parse(
      fs.readFileSync(filePath, 'utf-8')
    ) as CentralStoreSnapshot;
    await this.repo.restoreSnapshot(parsed);

    await this.repo.appendHistory({
      history_id: uuidv4(),
      task_id: '',
      user_id: actor.agent_id,
      user_name: `${actor.prenom} ${actor.nom}`.trim(),
      action: 'RESTAURATION_SAUVEGARDE',
      ancien_etat: '',
      nouvel_etat: 'RESTAURÉE',
      ancienne_valeur: '',
      nouvelle_valeur: filename,
      commentaire: `Restauration de la base centrale depuis ${filename}`,
      date_serveur: nowIso(),
    });

    await this.tryBackgroundSync();
  }
}

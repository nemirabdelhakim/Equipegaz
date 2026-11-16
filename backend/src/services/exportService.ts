import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type {
  AgentRecord,
  ReportRecord,
  TaskStatus,
  TaskWithAssignmentsDTO,
} from '../models/domain.js';
import type { IDataRepository } from '../repositories/interfaces.js';
import {
  formatDateTimeAlgiers,
  formatIsoDateToFr,
  nowIso,
  todayAlgiersIso,
} from '../utils/dateAlgiers.js';
import { ServiceError } from './agentService.js';
import { TaskService } from './taskService.js';

export type ExportReportType =
  | 'DAILY_PROGRAM'
  | 'DAILY_WORK'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'BY_AGENT'
  | 'BY_COMMUNE'
  | 'BY_DP'
  | 'BY_CATEGORY'
  | 'UNFINISHED'
  | 'OVERDUE'
  | 'BLOCKED'
  | 'VALIDATED_REPORTS';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

export interface ExportRequestParams {
  type: ExportReportType;
  format: ExportFormat;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  agentId?: string;
  commune?: string;
  dp?: string;
  categorie?: string;
  observations?: string;
}

const REPORT_TITLES: Record<ExportReportType, string> = {
  DAILY_PROGRAM: 'Programme journalier des interventions',
  DAILY_WORK: 'Rapport quotidien des travaux',
  WEEKLY: 'Rapport hebdomadaire des travaux',
  MONTHLY: 'Rapport mensuel des travaux',
  BY_AGENT: "Rapport individuel d'activité par agent",
  BY_COMMUNE: 'Rapport des interventions par commune',
  BY_DP: 'Rapport des interventions par Distribution Publique (DP)',
  BY_CATEGORY: 'Rapport des interventions par catégorie de travaux',
  UNFINISHED: 'Liste des tâches non réalisées / en cours',
  OVERDUE: 'Liste des tâches en retard',
  BLOCKED: 'Liste des tâches bloquées sur le terrain',
  VALIDATED_REPORTS: 'Registre des comptes rendus validés',
};

const CLOSED_STATUSES: TaskStatus[] = ['TERMINÉE', 'À VALIDER', 'VALIDÉE', 'ANNULÉE'];

function addDaysYmd(ymd: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays));
  return d.toISOString().slice(0, 10);
}

interface ExportRowData {
  numero_tache: string;
  date_prevue: string;
  categorie: string;
  titre: string;
  commune_dp: string;
  priorite: string;
  agents: string;
  statut: string;
  synthese: string;
}

export class ExportService {
  private readonly taskService: TaskService;

  constructor(private readonly repo: IDataRepository) {
    this.taskService = new TaskService(repo);
  }

  async generateReport(
    params: ExportRequestParams,
    actor: AgentRecord
  ): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
    reportNumber: string;
    rowCount: number;
  }> {
    // Contrôle RBAC : l'agent peut exporter uniquement son propre rapport individuel
    if (actor.role !== 'CHEF') {
      if (
        params.type !== 'BY_AGENT' ||
        (params.agentId && params.agentId !== actor.agent_id)
      ) {
        throw new ServiceError(
          403,
          'FORBIDDEN',
          "L'exportation globale du district est réservée au Chef d'équipe."
        );
      }
      params.agentId = actor.agent_id;
    }

    const todayIso = todayAlgiersIso();
    const targetDate = params.date || todayIso;

    let periodFrom = params.dateFrom || '';
    let periodTo = params.dateTo || '';
    let periodLabel = 'Toutes périodes confondues';

    if (params.type === 'DAILY_PROGRAM' || params.type === 'DAILY_WORK') {
      periodFrom = targetDate;
      periodTo = targetDate;
      periodLabel = `Journée du ${formatIsoDateToFr(targetDate)}`;
    } else if (params.type === 'WEEKLY') {
      periodTo = periodTo || targetDate;
      periodFrom = periodFrom || addDaysYmd(periodTo, -6);
      periodLabel = `Du ${formatIsoDateToFr(periodFrom)} au ${formatIsoDateToFr(periodTo)}`;
    } else if (params.type === 'MONTHLY') {
      const ym = (params.date || targetDate).slice(0, 7);
      periodFrom = periodFrom || `${ym}-01`;
      periodTo = periodTo || `${ym}-31`;
      periodLabel = `Mois ${ym.slice(5, 7)}/${ym.slice(0, 4)} (du ${formatIsoDateToFr(
        periodFrom
      )} au ${formatIsoDateToFr(periodTo)})`;
    } else if (periodFrom || periodTo) {
      periodLabel = `Du ${periodFrom ? formatIsoDateToFr(periodFrom) : '...'} au ${
        periodTo ? formatIsoDateToFr(periodTo) : '...'
      }`;
    }

    const [allTasks, allReports, agents] = await Promise.all([
      this.taskService.listAllTasks(),
      this.repo.listReports(),
      this.repo.listAgents(),
    ]);

    const latestReportByTask = new Map<string, ReportRecord>();
    for (const r of allReports) {
      const prev = latestReportByTask.get(r.task_id);
      if (!prev || r.version > prev.version) {
        latestReportByTask.set(r.task_id, r);
      }
    }

    let selectedTasks: TaskWithAssignmentsDTO[] = allTasks.filter((t) => {
      const d = (t.date_debut_prevue || t.date_creation).slice(0, 10);
      if (periodFrom && d < periodFrom) return false;
      if (periodTo && d > periodTo) return false;
      if (params.commune && t.commune !== params.commune) return false;
      if (params.dp && t.dp !== params.dp) return false;
      if (params.categorie && t.categorie !== params.categorie) return false;
      if (params.agentId && !t.assignments.some((a) => a.agent_id === params.agentId)) {
        return false;
      }
      return true;
    });

    if (params.type === 'UNFINISHED') {
      selectedTasks = selectedTasks.filter((t) => !CLOSED_STATUSES.includes(t.statut_global));
    } else if (params.type === 'OVERDUE') {
      selectedTasks = selectedTasks.filter(
        (t) =>
          Boolean(t.date_fin_prevue) &&
          t.date_fin_prevue < todayIso &&
          !CLOSED_STATUSES.includes(t.statut_global)
      );
    } else if (params.type === 'BLOCKED') {
      selectedTasks = selectedTasks.filter((t) => t.statut_global === 'BLOQUÉE');
    } else if (params.type === 'VALIDATED_REPORTS') {
      selectedTasks = selectedTasks.filter((t) => t.statut_global === 'VALIDÉE');
    } else if (params.type === 'DAILY_PROGRAM') {
      selectedTasks = selectedTasks.filter((t) => t.statut_global !== 'ANNULÉE');
    }

    const agentTarget = params.agentId
      ? agents.find((a) => a.agent_id === params.agentId)
      : undefined;

    const filterNoteParts: string[] = [];
    if (agentTarget) {
      filterNoteParts.push(
        `Agent : ${agentTarget.prenom} ${agentTarget.nom} (${agentTarget.matricule})`
      );
    }
    if (params.commune) filterNoteParts.push(`Commune : ${params.commune}`);
    if (params.dp) filterNoteParts.push(`DP : ${params.dp}`);
    if (params.categorie) filterNoteParts.push(`Catégorie : ${params.categorie}`);

    const rows: ExportRowData[] = selectedTasks.map((t) => {
      const rep = latestReportByTask.get(t.task_id);
      const agentsStr =
        t.assignments.length > 0
          ? t.assignments.map((a) => `${a.agent_prenom} ${a.agent_nom}`).join(', ')
          : 'Non affectée';
      const synthese = rep
        ? `CR v${rep.version} (${rep.validation}) : ${rep.resultat || rep.travail_effectue}`
        : t.observations || t.instructions || '—';

      return {
        numero_tache: t.numero_tache,
        date_prevue: `${formatIsoDateToFr(t.date_debut_prevue)} ${t.heure_prevue || ''}`.trim(),
        categorie: t.categorie,
        titre: t.titre,
        commune_dp: `${t.commune} / ${t.dp}`,
        priorite: t.priorite,
        agents: agentsStr,
        statut: t.statut_global,
        synthese: synthese.slice(0, 140),
      };
    });

    const totals = {
      total: rows.length,
      validees: selectedTasks.filter((t) => t.statut_global === 'VALIDÉE').length,
      enCours: selectedTasks.filter((t) => t.statut_global === 'EN COURS').length,
      bloquees: selectedTasks.filter((t) => t.statut_global === 'BLOQUÉE').length,
      enRetard: selectedTasks.filter(
        (t) =>
          Boolean(t.date_fin_prevue) &&
          t.date_fin_prevue < todayIso &&
          !CLOSED_STATUSES.includes(t.statut_global)
      ).length,
    };

    const generatedAtFr = formatDateTimeAlgiers(nowIso());
    const reportNumber = `RPT-SA-${todayIso.replaceAll('-', '')}-${String(
      Math.floor(1000 + Math.random() * 9000)
    )}`;
    const reportTitle = REPORT_TITLES[params.type];
    const observationsText =
      params.observations?.trim() ||
      (filterNoteParts.length > 0
        ? `Filtres appliqués — ${filterNoteParts.join(' · ')}`
        : 'Rapport officiel généré depuis la base centralisée du District Gaz Sidi Ali.');

    const baseFile = `sonelgaz_sidi_ali_${params.type.toLowerCase()}_${todayIso}`;

    if (params.format === 'csv') {
      const buffer = this.buildCsvBuffer({
        reportTitle,
        reportNumber,
        periodLabel,
        generatedAtFr,
        actorName: `${actor.prenom} ${actor.nom} (${actor.matricule})`,
        rows,
        totals,
        observationsText,
      });
      return {
        buffer,
        contentType: 'text/csv; charset=utf-8',
        fileName: `${baseFile}.csv`,
        reportNumber,
        rowCount: rows.length,
      };
    }

    if (params.format === 'xlsx') {
      const buffer = await this.buildXlsxBuffer({
        reportTitle,
        reportNumber,
        periodLabel,
        generatedAtFr,
        actorName: `${actor.prenom} ${actor.nom} (${actor.matricule})`,
        rows,
        totals,
        observationsText,
      });
      return {
        buffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `${baseFile}.xlsx`,
        reportNumber,
        rowCount: rows.length,
      };
    }

    const buffer = await this.buildPdfBuffer({
      reportTitle,
      reportNumber,
      periodLabel,
      generatedAtFr,
      actorName: `${actor.prenom} ${actor.nom} (${actor.matricule})`,
      rows,
      totals,
      observationsText,
    });
    return {
      buffer,
      contentType: 'application/pdf',
      fileName: `${baseFile}.pdf`,
      reportNumber,
      rowCount: rows.length,
    };
  }

  private buildCsvBuffer(meta: {
    reportTitle: string;
    reportNumber: string;
    periodLabel: string;
    generatedAtFr: string;
    actorName: string;
    rows: ExportRowData[];
    totals: { total: number; validees: number; enCours: number; bloquees: number; enRetard: number };
    observationsText: string;
  }): Buffer {
    const esc = (v: string) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines: string[] = [
      `${esc('District')};${esc('Sonelgaz Distribution – Direction de Mostaganem – District Gaz Sidi Ali')}`,
      `${esc('Rapport')};${esc(meta.reportTitle)}`,
      `${esc('Numéro de rapport')};${esc(meta.reportNumber)}`,
      `${esc('Période')};${esc(meta.periodLabel)}`,
      `${esc('Date de génération')};${esc(meta.generatedAtFr)}`,
      `${esc('Généré par')};${esc(meta.actorName)}`,
      '',
      [
        'N° Tâche',
        'Date prévue',
        'Catégorie',
        'Titre intervention',
        'Commune / DP',
        'Priorité',
        'Agents affectés',
        'Statut',
        'Synthèse / CR',
      ]
        .map(esc)
        .join(';'),
      ...meta.rows.map((r) =>
        [
          r.numero_tache,
          r.date_prevue,
          r.categorie,
          r.titre,
          r.commune_dp,
          r.priorite,
          r.agents,
          r.statut,
          r.synthese,
        ]
          .map(esc)
          .join(';')
      ),
      '',
      `${esc('Totaux')};${esc(
        `Total: ${meta.totals.total} | Validées: ${meta.totals.validees} | En cours: ${meta.totals.enCours} | Bloquées: ${meta.totals.bloquees} | En retard: ${meta.totals.enRetard}`
      )}`,
      `${esc('Observations')};${esc(meta.observationsText)}`,
    ];
    // UTF-8 BOM pour ouverture directe sous Microsoft Excel Windows
    return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf-8');
  }

  private async buildXlsxBuffer(meta: {
    reportTitle: string;
    reportNumber: string;
    periodLabel: string;
    generatedAtFr: string;
    actorName: string;
    rows: ExportRowData[];
    totals: { total: number; validees: number; enCours: number; bloquees: number; enRetard: number };
    observationsText: string;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GESTION ÉQUIPE GAZ – SIDI ALI';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rapport District', {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
    });

    sheet.mergeCells('A1:I1');
    const orgCell = sheet.getCell('A1');
    orgCell.value =
      'SONELGAZ DISTRIBUTION – DIRECTION DE DISTRIBUTION DE MOSTAGANEM – DISTRICT GAZ SIDI ALI';
    orgCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    orgCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0055A4' },
    };
    orgCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(1).height = 26;

    sheet.mergeCells('A2:I2');
    const titleCell = sheet.getCell('A2');
    titleCell.value = meta.reportTitle.toUpperCase();
    titleCell.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
    sheet.getRow(2).height = 22;

    sheet.addRow([
      'N° Rapport :',
      meta.reportNumber,
      'Période :',
      meta.periodLabel,
      'Généré le :',
      meta.generatedAtFr,
      'Par :',
      meta.actorName,
      '',
    ]);
    sheet.addRow([]);

    const headerRow = sheet.addRow([
      'N° Tâche',
      'Date prévue',
      'Catégorie',
      'Titre intervention',
      'Commune / DP',
      'Priorité',
      'Agents affectés',
      'Statut',
      'Synthèse / Compte-rendu',
    ]);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    for (const r of meta.rows) {
      const row = sheet.addRow([
        r.numero_tache,
        r.date_prevue,
        r.categorie,
        r.titre,
        r.commune_dp,
        r.priorite,
        r.agents,
        r.statut,
        r.synthese,
      ]);
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }

    sheet.addRow([]);
    const totalRow = sheet.addRow([
      'TOTAUX',
      `${meta.totals.total} intervention(s)`,
      '',
      `Validées : ${meta.totals.validees}`,
      `En cours : ${meta.totals.enCours}`,
      `Bloquées : ${meta.totals.bloquees}`,
      `En retard : ${meta.totals.enRetard}`,
      '',
      '',
    ]);
    totalRow.font = { bold: true, size: 10 };

    sheet.addRow(['OBSERVATIONS', meta.observationsText]);

    sheet.columns = [
      { width: 20 },
      { width: 17 },
      { width: 10 },
      { width: 32 },
      { width: 26 },
      { width: 12 },
      { width: 26 },
      { width: 14 },
      { width: 38 },
    ];

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildPdfBuffer(meta: {
    reportTitle: string;
    reportNumber: string;
    periodLabel: string;
    generatedAtFr: string;
    actorName: string;
    rows: ExportRowData[];
    totals: { total: number; validees: number; enCours: number; bloquees: number; enRetard: number };
    observationsText: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 32,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Bandeau officiel Sonelgaz
      doc.rect(32, 28, doc.page.width - 64, 42).fill('#0055A4');
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(
          'SONELGAZ DISTRIBUTION · DIRECTION DE MOSTAGANEM · DISTRICT GAZ SIDI ALI',
          44,
          38
        );
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(meta.reportTitle, 44, 54);

      doc.fillColor('#0F172A').fontSize(9);
      doc.text(`N° Rapport : ${meta.reportNumber}`, 32, 82);
      doc.text(`Période : ${meta.periodLabel}`, 250, 82);
      doc.text(`Généré le : ${meta.generatedAtFr}`, 550, 82);
      doc.text(`Établi par : ${meta.actorName}`, 32, 96);

      // En-tête du tableau
      const colWidths = [90, 74, 45, 165, 120, 56, 110, 68, 50];
      const headers = [
        'N° Tâche',
        'Date / H',
        'Cat.',
        'Intervention',
        'Commune / DP',
        'Priorité',
        'Agents',
        'Statut',
        'Note',
      ];

      let y = 118;
      const drawTableHeader = (topY: number) => {
        doc.rect(32, topY, doc.page.width - 64, 20).fill('#1E293B');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
        let x = 36;
        headers.forEach((h, i) => {
          doc.text(h, x, topY + 6, { width: colWidths[i] - 4, ellipsis: true });
          x += colWidths[i];
        });
        return topY + 22;
      };

      y = drawTableHeader(y);

      if (meta.rows.length === 0) {
        doc
          .fillColor('#475569')
          .font('Helvetica')
          .fontSize(9)
          .text('Aucune intervention ne correspond aux critères retenus.', 36, y + 8);
        y += 28;
      } else {
        for (const r of meta.rows) {
          if (y > doc.page.height - 90) {
            doc.addPage();
            y = drawTableHeader(32);
          }

          doc.fillColor('#0F172A').font('Helvetica').fontSize(7.5);
          const vals = [
            r.numero_tache,
            r.date_prevue,
            r.categorie,
            r.titre,
            r.commune_dp,
            r.priorite,
            r.agents,
            r.statut,
            r.synthese ? 'CR/Obs' : '—',
          ];

          let x = 36;
          vals.forEach((val, i) => {
            doc.text(val || '—', x, y + 4, {
              width: colWidths[i] - 6,
              height: 18,
              ellipsis: true,
            });
            x += colWidths[i];
          });

          doc
            .moveTo(32, y + 22)
            .lineTo(doc.page.width - 32, y + 22)
            .strokeColor('#E2E8F0')
            .lineWidth(0.5)
            .stroke();
          y += 24;
        }
      }

      if (y > doc.page.height - 75) {
        doc.addPage();
        y = 40;
      }

      // Bloc Totaux & Observations
      y += 8;
      doc
        .fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          `TOTAUX — Interventions : ${meta.totals.total}   |   Validées : ${meta.totals.validees}   |   En cours : ${meta.totals.enCours}   |   Bloquées : ${meta.totals.bloquees}   |   En retard : ${meta.totals.enRetard}`,
          32,
          y
        );
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(`Observations : ${meta.observationsText}`, 32, y + 16, {
          width: doc.page.width - 64,
        });

      doc.end();
    });
  }
}

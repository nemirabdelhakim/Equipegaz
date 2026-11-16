import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileText } from 'lucide-react';
import type {
  AgentDTO,
  DistrictParam,
  ExportFormat,
  ExportReportType,
  TaskDTO,
} from '../models/types';
import { ApiError, apiClient, triggerBlobDownload } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';

interface ExportsPageProps {
  agents: AgentDTO[];
  tasks: TaskDTO[];
  params: DistrictParam[];
}

const REPORT_TYPES: Array<{
  type: ExportReportType;
  label: string;
  description: string;
  chefOnly: boolean;
}> = [
  {
    type: 'DAILY_PROGRAM',
    label: '01 · Programme journalier',
    description: 'Feuille de route du jour avec horaires, adresses, équipes et priorités.',
    chefOnly: true,
  },
  {
    type: 'DAILY_WORK',
    label: '02 · Rapport quotidien des travaux',
    description: 'Bilan complet des interventions exécutées sur une journée.',
    chefOnly: true,
  },
  {
    type: 'WEEKLY',
    label: '03 · Rapport hebdomadaire',
    description: 'Synthèse sur 7 jours glissants ou plage personnalisée.',
    chefOnly: true,
  },
  {
    type: 'MONTHLY',
    label: '04 · Rapport mensuel',
    description: 'État consolidé du mois pour la Direction de Mostaganem.',
    chefOnly: true,
  },
  {
    type: 'BY_AGENT',
    label: '05 · Rapport par agent',
    description: 'Activité individuelle détaillée d’un agent du district.',
    chefOnly: false,
  },
  {
    type: 'BY_COMMUNE',
    label: '06 · Rapport par commune',
    description: 'Interventions filtrées par commune (Sidi Ali, Tazgait, Ouled Maallah...).',
    chefOnly: true,
  },
  {
    type: 'BY_DP',
    label: '07 · Rapport par DP',
    description: 'Ventilation par Distribution Publique gaz.',
    chefOnly: true,
  },
  {
    type: 'BY_CATEGORY',
    label: '08 · Rapport par catégorie de travaux',
    description: 'Suivi ciblé par type de travail (FUG, VAN, ING, CPM...).',
    chefOnly: true,
  },
  {
    type: 'UNFINISHED',
    label: '09 · Tâches non réalisées',
    description: 'Interventions transmises, en cours ou en attente non encore terminées.',
    chefOnly: true,
  },
  {
    type: 'OVERDUE',
    label: '10 · Tâches en retard',
    description: 'Interventions dont la date limite prévue est dépassée.',
    chefOnly: true,
  },
  {
    type: 'BLOCKED',
    label: '11 · Tâches bloquées',
    description: 'Points de blocage nécessitant arbitrage ou moyens complémentaires.',
    chefOnly: true,
  },
  {
    type: 'VALIDATED_REPORTS',
    label: '12 · Comptes rendus validés',
    description: 'Registre officiel des interventions clôturées et validées par le Chef.',
    chefOnly: true,
  },
];

function getTodayAlgiersIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const ExportsPage: React.FC<ExportsPageProps> = ({ agents, tasks, params }) => {
  const { user, isOnline } = useAuth();
  const isChef = user?.role === 'CHEF';

  const availableTypes = useMemo(
    () => REPORT_TYPES.filter((r) => isChef || !r.chefOnly),
    [isChef]
  );

  const [reportType, setReportType] = useState<ExportReportType>(
    isChef ? 'DAILY_PROGRAM' : 'BY_AGENT'
  );
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [date, setDate] = useState(getTodayAlgiersIso());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [agentId, setAgentId] = useState(isChef ? '' : user?.agent_id || '');
  const [commune, setCommune] = useState('');
  const [dp, setDp] = useState('');
  const [categorie, setCategorie] = useState('');
  const [observations, setObservations] = useState('');

  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastGenerated, setLastGenerated] = useState<{
    fileName: string;
    reportNumber: string;
  } | null>(null);

  const communes = useMemo(
    () =>
      Array.from(
        new Set([
          ...params.filter((p) => p.categorie === 'COMMUNE' && p.actif).map((p) => p.valeur),
          ...tasks.map((t) => t.commune).filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [params, tasks]
  );

  const dps = useMemo(
    () =>
      Array.from(
        new Set([
          ...params.filter((p) => p.categorie === 'DP' && p.actif).map((p) => p.valeur),
          ...tasks.map((t) => t.dp).filter(Boolean),
        ])
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [params, tasks]
  );

  const categories = useMemo(
    () => params.filter((p) => p.categorie === 'CATEGORIE_TRAVAUX' && p.actif),
    [params]
  );

  const activeMeta = availableTypes.find((t) => t.type === reportType) || availableTypes[0];

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setDownloading(true);
    setErrorMsg('');
    setLastGenerated(null);

    try {
      const res = await apiClient.downloadOfficialReport({
        type: reportType,
        format,
        date,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        agentId: isChef ? agentId || undefined : user?.agent_id,
        commune: commune || undefined,
        dp: dp || undefined,
        categorie: categorie || undefined,
        observations: observations.trim() || undefined,
      });
      triggerBlobDownload(res.blob, res.fileName);
      setLastGenerated({ fileName: res.fileName, reportNumber: res.reportNumber });
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : "Impossible de générer l'export officiel pour le moment."
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Exports Officiels (PDF · Excel XLSX · CSV)
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Génération des 12 rapports officiels Sonelgaz – District Gaz Sidi Ali avec en-tête,
          numéro de rapport, horodatage Alger, totaux et observations.
        </p>
      </div>

      {!isOnline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          La génération serveur des documents PDF/XLSX/CSV nécessite une connexion active.
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {lastGenerated && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Document généré et téléchargé :{' '}
            <strong className="font-mono">{lastGenerated.fileName}</strong>
            {lastGenerated.reportNumber && (
              <>
                {' '}
                · N° Rapport : <strong className="font-mono">{lastGenerated.reportNumber}</strong>
              </>
            )}
          </span>
        </div>
      )}

      <form
        onSubmit={handleExport}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Type de rapport officiel *
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ExportReportType)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {availableTypes.map((rt) => (
                <option key={rt.type} value={rt.type}>
                  {rt.label}
                </option>
              ))}
            </select>
            {activeMeta && (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {activeMeta.description}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Format de fichier *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'pdf' as const, label: 'PDF Officiel', icon: FileText },
                { id: 'xlsx' as const, label: 'Excel XLSX', icon: FileSpreadsheet },
                { id: 'csv' as const, label: 'CSV (Excel)', icon: Download },
              ].map((fmt) => {
                const Icon = fmt.icon;
                const active = format === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setFormat(fmt.id)}
                    className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#0055A4] bg-[#0055A4] text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{fmt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Date de référence (Journalier / Mensuel)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Période — Du (optionnel)
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Période — Au (optionnel)
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {isChef && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Agent (optionnel)
              </label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Tous les agents</option>
                {agents.map((ag) => (
                  <option key={ag.agent_id} value={ag.agent_id}>
                    {ag.prenom} {ag.nom} ({ag.matricule})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Commune (optionnel)
            </label>
            <select
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes communes</option>
              {communes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Distribution Publique / DP (optionnel)
            </label>
            <select
              value={dp}
              onChange={(e) => setDp(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes DP</option>
              {dps.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Catégorie de travaux (optionnel)
            </label>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Toutes catégories</option>
              {categories.map((cat) => (
                <option key={cat.param_id} value={cat.valeur}>
                  {cat.valeur} — {cat.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Observations / Visa officiel à imprimer en pied de rapport (optionnel)
          </label>
          <textarea
            rows={2}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Ex. : Priorité sur les fuites signalées à Sidi Ali centre..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={downloading || !isOnline}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0055A4] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#004485] disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            <span>{downloading ? 'Génération en cours...' : 'Générer et télécharger'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

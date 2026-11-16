import React, { useMemo, useState } from 'react';
import { CheckCircle2, PauseCircle, Pencil, Plus, X } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import type { AgentDTO, DistrictParam, ParamCategory } from '../models/types';
import { ApiError, apiClient } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';

interface ParamsPageProps {
  params: DistrictParam[];
  agents: AgentDTO[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
}

type ParamTab = 'COMMUNE' | 'DP' | 'CATEGORIE_TRAVAUX' | 'EQUIPE';

function parseMeta(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const ParamsPage: React.FC<ParamsPageProps> = ({
  params,
  agents,
  loading,
  onDataChanged,
}) => {
  const { user } = useAuth();
  const isChef = user?.role === 'CHEF';

  const [activeTab, setActiveTab] = useState<ParamTab>('COMMUNE');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<DistrictParam | null>(null);
  const [codeValue, setCodeValue] = useState('');
  const [labelValue, setLabelValue] = useState('');
  const [communeDefaut, setCommuneDefaut] = useState('');
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [toggleTarget, setToggleTarget] = useState<DistrictParam | null>(null);

  const communes = useMemo(
    () => params.filter((p) => p.categorie === 'COMMUNE'),
    [params]
  );
  const activeAgents = useMemo(
    () => agents.filter((a) => a.statut === 'ACTIF'),
    [agents]
  );
  const filtered = useMemo(
    () => params.filter((p) => p.categorie === activeTab),
    [params, activeTab]
  );

  const openCreateModal = () => {
    setEditingParam(null);
    setCodeValue('');
    setLabelValue('');
    setCommuneDefaut(communes[0]?.valeur || '');
    setTeamMemberIds([]);
    setErrorMsg('');
    setModalOpen(true);
  };

  const openEditModal = (param: DistrictParam) => {
    setEditingParam(param);
    setCodeValue(param.valeur);
    setLabelValue(param.libelle);
    const meta = parseMeta(param.metadata_json);
    setCommuneDefaut(typeof meta.commune_defaut === 'string' ? meta.commune_defaut : '');
    setTeamMemberIds(Array.isArray(meta.member_ids) ? (meta.member_ids as string[]) : []);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    let metadataObj: Record<string, unknown> = {};
    if (activeTab === 'COMMUNE') {
      metadataObj = { district: 'Sidi Ali' };
    } else if (activeTab === 'DP') {
      metadataObj = communeDefaut ? { commune_defaut: communeDefaut } : {};
    } else if (activeTab === 'EQUIPE') {
      metadataObj = { member_ids: teamMemberIds };
    }

    try {
      if (editingParam) {
        await apiClient.updateParam(editingParam.param_id, {
          valeur: codeValue.trim().toUpperCase(),
          libelle: labelValue.trim(),
          metadata_json: JSON.stringify(metadataObj),
        });
        setFeedbackMsg(`Paramètre "${labelValue.trim()}" mis à jour.`);
      } else {
        await apiClient.createParam({
          categorie: activeTab as ParamCategory,
          valeur: codeValue.trim().toUpperCase(),
          libelle: labelValue.trim(),
          metadata_json: JSON.stringify(metadataObj),
          actif: true,
        });
        setFeedbackMsg(`Paramètre "${labelValue.trim()}" ajouté.`);
      }
      setModalOpen(false);
      await onDataChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Impossible d’enregistrer le paramètre.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (param: DistrictParam) => {
    setSubmitting(true);
    try {
      await apiClient.updateParam(param.param_id, { actif: !param.actif });
      setFeedbackMsg(
        `Paramètre "${param.libelle}" ${!param.actif ? 'activé' : 'désactivé'}.`
      );
      setToggleTarget(null);
      await onDataChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Impossible de modifier cet état.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getTabTitle = (tab: ParamTab) => {
    switch (tab) {
      case 'COMMUNE':
        return 'Commune';
      case 'DP':
        return 'Distribution Publique (DP)';
      case 'CATEGORIE_TRAVAUX':
        return 'Catégorie de travaux';
      case 'EQUIPE':
        return 'Équipe';
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Référentiels du District Gaz Sidi Ali
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Administration des communes, Distributions Publiques (DP), catégories de travaux et
            équipes types.
          </p>
        </div>

        {isChef && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#004485] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Ajouter ({getTabTitle(activeTab)})</span>
          </button>
        )}
      </div>

      {feedbackMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg('')}
            className="rounded p-1 hover:bg-emerald-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            { id: 'COMMUNE', label: 'Communes' },
            { id: 'DP', label: 'Distributions Publiques' },
            { id: 'CATEGORIE_TRAVAUX', label: 'Catégories de travaux' },
            { id: 'EQUIPE', label: 'Équipes' },
          ] as Array<{ id: ParamTab; label: string }>
        ).map((tab) => {
          const count = params.filter((p) => p.categorie === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucun élément enregistré dans cette catégorie.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Libellé officiel</th>
                  {(activeTab === 'DP' || activeTab === 'EQUIPE') && (
                    <th className="px-4 py-3">Association</th>
                  )}
                  <th className="px-4 py-3">État</th>
                  {isChef && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((item) => {
                  const meta = parseMeta(item.metadata_json);
                  const linkedCommune =
                    typeof meta.commune_defaut === 'string'
                      ? communes.find((c) => c.valeur === meta.commune_defaut)?.libelle ||
                        meta.commune_defaut
                      : '—';
                  const memberIds = Array.isArray(meta.member_ids)
                    ? (meta.member_ids as string[])
                    : [];
                  return (
                    <tr key={item.param_id}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0055A4] dark:text-blue-400">
                        {item.valeur}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.libelle}
                      </td>
                      {activeTab === 'DP' && (
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          Commune associée : {linkedCommune}
                        </td>
                      )}
                      {activeTab === 'EQUIPE' && (
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          {memberIds.length === 0
                            ? 'Aucun membre prédéfini'
                            : `${memberIds.length} agent(s) associé(s)`}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            item.actif
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.actif ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <PauseCircle className="h-3.5 w-3.5" />
                          )}
                          <span>{item.actif ? 'Actif' : 'Désactivé'}</span>
                        </span>
                      </td>
                      {isChef && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Modifier</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                item.actif ? setToggleTarget(item) : handleToggleActive(item)
                              }
                              className={`inline-flex min-h-[36px] items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                item.actif
                                  ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/30'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                              }`}
                            >
                              {item.actif ? 'Désactiver' : 'Réactiver'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale Ajout / Modification Paramètre */}
      {modalOpen && isChef && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {editingParam
                  ? `Modifier : ${editingParam.libelle}`
                  : `Nouveau paramètre (${getTabTitle(activeTab)})`}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {errorMsg && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Code court (unique) *
                </label>
                <input
                  type="text"
                  required
                  value={codeValue}
                  onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                  placeholder={
                    activeTab === 'COMMUNE'
                      ? 'Ex. COM-11'
                      : activeTab === 'DP'
                        ? 'Ex. DP-SA-11'
                        : activeTab === 'EQUIPE'
                          ? 'Ex. EQ-URG-A'
                          : 'Ex. DET'
                  }
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Libellé officiel *
                </label>
                <input
                  type="text"
                  required
                  value={labelValue}
                  onChange={(e) => setLabelValue(e.target.value)}
                  placeholder="Nom officiel affiché dans les menus"
                  className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#0055A4] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {activeTab === 'DP' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Commune par défaut associée
                  </label>
                  <select
                    value={communeDefaut}
                    onChange={(e) => setCommuneDefaut(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Aucune association automatique</option>
                    {communes.map((c) => (
                      <option key={c.param_id} value={c.valeur}>
                        {c.valeur} — {c.libelle}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeTab === 'EQUIPE' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Agents membres de cette équipe
                  </label>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                    {activeAgents.map((ag) => {
                      const checked = teamMemberIds.includes(ag.agent_id);
                      return (
                        <label
                          key={ag.agent_id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setTeamMemberIds((prev) =>
                                prev.includes(ag.agent_id)
                                  ? prev.filter((id) => id !== ag.agent_id)
                                  : [...prev, ag.agent_id]
                              )
                            }
                            className="h-4 w-4 accent-[#0055A4]"
                          />
                          <span>
                            <strong className="font-mono">{ag.matricule}</strong> · {ag.prenom}{' '}
                            {ag.nom}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(toggleTarget)}
        title="Désactiver ce référentiel"
        description={
          toggleTarget
            ? `Voulez-vous désactiver "${toggleTarget.libelle}" (${toggleTarget.valeur}) ? Les anciennes tâches conserveront leur libellé historique, mais cet élément ne sera plus proposé pour les nouvelles tâches.`
            : ''
        }
        confirmLabel="Désactiver"
        tone="warning"
        loading={submitting}
        onConfirm={() => toggleTarget && handleToggleActive(toggleTarget)}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
};

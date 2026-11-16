import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  History,
  KeyRound,
  Plus,
  Search,
  ShieldAlert,
  UserCheck,
  UserMinus,
  X,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { AgentStatusLabel } from '../components/StatusIndicator';
import type { AgentDTO, AgentStatus, HistoryEntry, UserRole } from '../models/types';
import { apiClient, type CreateAgentPayload } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr, formatDateTimeFr } from '../utils/formatters';

interface AgentsPageProps {
  agents: AgentDTO[];
  loading: boolean;
  onDataChanged: () => Promise<void>;
}

const STATUS_OPTIONS: AgentStatus[] = ['ACTIF', 'INACTIF', 'ABSENT', 'CONGÉ', 'SUSPENDU'];

export const AgentsPage: React.FC<AgentsPageProps> = ({
  agents,
  loading,
  onDataChanged,
}) => {
  const { user } = useAuth();
  const isChef = user?.role === 'CHEF';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentStatus | 'TOUS'>('TOUS');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Modales Création / Édition
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDTO | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [matricule, setMatricule] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [fonction, setFonction] = useState('Technicien intervention gaz');
  const [loginEmail, setLoginEmail] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [statut, setStatut] = useState<AgentStatus>('ACTIF');
  const [initialPassword, setInitialPassword] = useState('');

  // Révélation mot de passe temporaire (création ou réinitialisation)
  const [revealedSecret, setRevealedSecret] = useState<{
    title: string;
    agentName: string;
    identifier: string;
    matricule: string;
    password: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Changement de statut confirmé
  const [statusModalAgent, setStatusModalAgent] = useState<AgentDTO | null>(null);
  const [nextStatus, setNextStatus] = useState<AgentStatus>('INACTIF');
  const [statusComment, setStatusComment] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Réinitialisation accès
  const [resetConfirmAgent, setResetConfirmAgent] = useState<AgentDTO | null>(null);
  const [resetting, setResetting] = useState(false);

  // Historique individuel d'un agent
  const [historyAgent, setHistoryAgent] = useState<AgentDTO | null>(null);
  const [agentHistory, setAgentHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (statusFilter !== 'TOUS' && a.statut !== statusFilter) return false;
      if (!q) return true;
      return (
        a.matricule.toLowerCase().includes(q) ||
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        a.fonction.toLowerCase().includes(q) ||
        a.login_email.toLowerCase().includes(q)
      );
    });
  }, [agents, search, statusFilter]);

  const openCreateModal = () => {
    setEditingAgent(null);
    setMatricule('');
    setNom('');
    setPrenom('');
    setTelephone('');
    setFonction('Technicien intervention gaz');
    setLoginEmail('');
    setRole('AGENT');
    setStatut('ACTIF');
    setInitialPassword('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (agent: AgentDTO) => {
    setEditingAgent(agent);
    setMatricule(agent.matricule);
    setNom(agent.nom);
    setPrenom(agent.prenom);
    setTelephone(agent.telephone);
    setFonction(agent.fonction);
    setLoginEmail(agent.login_email);
    setRole(agent.role);
    setStatut(agent.statut);
    setInitialPassword('');
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSaving(true);

    try {
      if (editingAgent) {
        await apiClient.updateAgent(editingAgent.agent_id, {
          matricule,
          nom,
          prenom,
          telephone,
          fonction,
          login_email: loginEmail,
          role,
          statut,
        });
        setFeedback({
          type: 'success',
          text: `Fiche de ${prenom} ${nom} mise à jour.`,
        });
        setFormOpen(false);
      } else {
        const payload: CreateAgentPayload = {
          matricule,
          nom,
          prenom,
          telephone,
          fonction,
          login_email: loginEmail,
          role,
          statut,
          ...(initialPassword.trim() ? { initial_password: initialPassword.trim() } : {}),
        };
        const res = await apiClient.createAgent(payload);
        setFormOpen(false);
        setCopiedSecret(false);
        setRevealedSecret({
          title: 'Agent créé avec succès',
          agentName: `${res.agent.prenom} ${res.agent.nom}`,
          identifier: res.agent.login_email,
          matricule: res.agent.matricule,
          password: res.temporaryPassword,
        });
        setFeedback({
          type: 'success',
          text: `Agent ${res.agent.matricule} enregistré dans l'équipe.`,
        });
      }
      await onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setFormSaving(false);
    }
  };

  const openStatusModal = (agent: AgentDTO, suggested?: AgentStatus) => {
    setStatusModalAgent(agent);
    setNextStatus(suggested || (agent.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF'));
    setStatusComment('');
  };

  const handleConfirmStatusChange = async () => {
    if (!statusModalAgent) return;
    setStatusSaving(true);
    try {
      await apiClient.updateAgentStatus(
        statusModalAgent.agent_id,
        nextStatus,
        statusComment.trim() || undefined
      );
      setFeedback({
        type: 'success',
        text: `Statut de ${statusModalAgent.prenom} ${statusModalAgent.nom} modifié vers ${nextStatus}.`,
      });
      setStatusModalAgent(null);
      await onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erreur de mise à jour du statut.',
      });
    } finally {
      setStatusSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetConfirmAgent) return;
    setResetting(true);
    try {
      const res = await apiClient.resetAgentAccess(resetConfirmAgent.agent_id);
      setResetConfirmAgent(null);
      setCopiedSecret(false);
      setRevealedSecret({
        title: 'Accès réinitialisé',
        agentName: `${res.agent.prenom} ${res.agent.nom}`,
        identifier: res.agent.login_email,
        matricule: res.agent.matricule,
        password: res.temporaryPassword,
      });
      await onDataChanged();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Échec de la réinitialisation.',
      });
      setResetConfirmAgent(null);
    } finally {
      setResetting(false);
    }
  };

  const openHistoryDrawer = async (agent: AgentDTO) => {
    setHistoryAgent(agent);
    setHistoryLoading(true);
    try {
      const res = await apiClient.getAgentHistory(agent.agent_id);
      setAgentHistory(res.history);
    } catch {
      setAgentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const copySecretText = async () => {
    if (!revealedSecret) return;
    const text = `Agent: ${revealedSecret.agentName}\nMatricule: ${revealedSecret.matricule}\nIdentifiant: ${revealedSecret.identifier}\nMot de passe temporaire: ${revealedSecret.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(true);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* En-tête & Action Chef */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {isChef ? 'Administration des agents' : "Annuaire de l'équipe"}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isChef
              ? 'Gestion dynamique des comptes, statuts et accès sécurisés du District Gaz Sidi Ali.'
              : 'Consultation en lecture seule des membres de votre équipe.'}
          </p>
        </div>

        {isChef && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#0055A4] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#004485] whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Ajouter un agent</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-4 text-xs font-medium underline"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Barre Recherche & Filtres */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par matricule, nom, fonction ou identifiant..."
            className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0055A4] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['TOUS', ...STATUS_OPTIONS] as const).map((statusItem) => (
            <button
              key={statusItem}
              type="button"
              onClick={() => setStatusFilter(statusItem)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === statusItem
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {statusItem}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau Agents */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Chargement de l&apos;annuaire des agents...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucun agent ne correspond à vos critères de recherche.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">Matricule</th>
                  <th className="px-4 py-3">Identité & Fonction</th>
                  <th className="px-4 py-3">Identifiant / Tél</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Dernière connexion</th>
                  {isChef && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAgents.map((agent) => {
                  const isSelf = agent.agent_id === user?.agent_id;
                  return (
                    <tr
                      key={agent.agent_id}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {agent.matricule}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {agent.prenom} {agent.nom}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {agent.fonction}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-xs text-slate-700 dark:text-slate-300">
                          {agent.login_email}
                        </p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {agent.telephone || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {agent.role === 'CHEF' ? "Chef d'équipe" : 'Agent'}
                      </td>
                      <td className="px-4 py-3.5">
                        <AgentStatusLabel statut={agent.statut} />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTimeFr(agent.derniere_connexion)}
                      </td>
                      {isChef && (
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(agent)}
                              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              title="Modifier la fiche"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">Modifier</span>
                            </button>

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => openStatusModal(agent)}
                                className={`inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs font-medium ${
                                  agent.statut === 'ACTIF'
                                    ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 dark:hover:bg-amber-950/30'
                                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                                }`}
                                title={
                                  agent.statut === 'ACTIF'
                                    ? 'Changer statut / Désactiver'
                                    : 'Réactiver'
                                }
                              >
                                {agent.statut === 'ACTIF' ? (
                                  <UserMinus className="h-3.5 w-3.5" />
                                ) : (
                                  <UserCheck className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden xl:inline">
                                  {agent.statut === 'ACTIF' ? 'Statut' : 'Réactiver'}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setResetConfirmAgent(agent)}
                              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              title="Réinitialiser l'accès"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openHistoryDrawer(agent)}
                              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              title="Consulter l'historique"
                            >
                              <History className="h-3.5 w-3.5" />
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

      {/* Modal Création / Édition Agent */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingAgent ? `Modifier ${editingAgent.prenom} ${editingAgent.nom}` : 'Nouveau compte agent'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAgent} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Matricule professionnel *
                </label>
                <input
                  type="text"
                  required
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  placeholder="Ex : SA-1042"
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Téléphone *
                </label>
                <input
                  type="tel"
                  required
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder="Ex : 0661 12 34 56"
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Prénom *
                </label>
                <input
                  type="text"
                  required
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Fonction *
                </label>
                <input
                  type="text"
                  required
                  value={fonction}
                  onChange={(e) => setFonction(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Identifiant de connexion (Email Google ou identifiant pro) *
                </label>
                <input
                  type="text"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Ex : prenom.nom@gmail.com ou k.benali@sonelgaz-sidiali.dz"
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Rôle
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="AGENT">Agent terrain</option>
                  <option value="CHEF">Chef d&apos;équipe</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Statut initial
                </label>
                <select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value as AgentStatus)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {!editingAgent && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Mot de passe initial (laisser vide pour génération aléatoire sécurisée)
                  </label>
                  <input
                    type="text"
                    value={initialPassword}
                    onChange={(e) => setInitialPassword(e.target.value)}
                    placeholder="Minimum 8 caractères si saisi manuellement"
                    className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              )}

              <div className="mt-2 flex items-center justify-end gap-3 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="min-h-[44px] rounded-lg bg-[#0055A4] px-5 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
                >
                  {formSaving ? 'Enregistrement...' : editingAgent ? 'Mettre à jour' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Changement de statut / Désactivation */}
      {statusModalAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Modifier le statut de l&apos;agent
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {statusModalAgent.prenom} {statusModalAgent.nom} · {statusModalAgent.matricule}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nouveau statut
                </label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as AgentStatus)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Motif / Observation (journalisé)
                </label>
                <textarea
                  rows={2}
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="Ex : Congé annuel, fin de mission, suspension disciplinaire..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Tout statut autre que ACTIF bloque immédiatement la connexion de l&apos;agent et
                révoque ses sessions actives, tout en conservant intégralement son historique.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setStatusModalAgent(null)}
                className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusChange}
                disabled={statusSaving}
                className="min-h-[44px] rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
              >
                {statusSaving ? 'Application...' : 'Confirmer le statut'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Réinitialisation Accès */}
      <ConfirmModal
        open={!!resetConfirmAgent}
        title="Réinitialiser l'accès de l'agent"
        description={
          resetConfirmAgent
            ? `Un nouveau mot de passe temporaire sera généré pour ${resetConfirmAgent.prenom} ${resetConfirmAgent.nom} (${resetConfirmAgent.matricule}) et toutes ses sessions actives seront immédiatement révoquées.`
            : ''
        }
        confirmLabel="Réinitialiser l'accès"
        tone="warning"
        loading={resetting}
        onConfirm={handleConfirmReset}
        onCancel={() => setResetConfirmAgent(null)}
      />

      {/* Modal Affichage Unique du Mot de passe temporaire */}
      {revealedSecret && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              {revealedSecret.title}
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Communiquez ces identifiants à <strong>{revealedSecret.agentName}</strong>. Ce mot
              de passe est haché côté serveur et ne sera plus affiché après fermeture.
            </p>

            <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Matricule :</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {revealedSecret.matricule}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Identifiant :</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {revealedSecret.identifier}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                <span className="text-slate-500">Mot de passe :</span>
                <span className="font-bold text-[#0055A4] dark:text-blue-400">
                  {revealedSecret.password}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={copySecretText}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {copiedSecret ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                <span>{copiedSecret ? 'Copié' : 'Copier'}</span>
              </button>
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="min-h-[44px] rounded-lg bg-[#0055A4] px-5 py-2 text-sm font-medium text-white hover:bg-[#004485]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tiroir Historique Individuel Agent */}
      {historyAgent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Historique · {historyAgent.prenom} {historyAgent.nom}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Matricule <span className="font-mono">{historyAgent.matricule}</span> · Créé le{' '}
                  {formatDateFr(historyAgent.date_creation)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAgent(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {historyLoading ? (
                <p className="text-sm text-slate-500">Chargement de l&apos;historique...</p>
              ) : agentHistory.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aucun événement enregistré pour cet agent.
                </p>
              ) : (
                <div className="space-y-4">
                  {agentHistory.map((h) => (
                    <div
                      key={h.history_id}
                      className="rounded-lg border border-slate-200 p-3.5 text-sm dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {h.action.replaceAll('_', ' ')}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-slate-500">
                          {formatDateTimeFr(h.date_serveur)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {h.commentaire}
                      </p>
                      {(h.ancien_etat || h.nouvel_etat) && (
                        <p className="mt-1.5 font-mono text-[11px] text-slate-500">
                          État : {h.ancien_etat || '—'} → {h.nouvel_etat || '—'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { KeyRound, Laptop, ShieldCheck } from 'lucide-react';
import { AgentStatusLabel } from '../components/StatusIndicator';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';
import { formatDateFr, formatDateTimeFr } from '../utils/formatters';

export const ProfilePage: React.FC = () => {
  const { user, sessions, refreshProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  if (!user) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (newPassword.length < 8) {
      setFeedback({
        type: 'error',
        text: 'Le nouveau mot de passe doit contenir au moins 8 caractères.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'error',
        text: 'Les deux mots de passe ne correspondent pas.',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.changePassword(currentPassword || 'google-auth', newPassword);
      setFeedback({ type: 'success', text: res.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshProfile();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Impossible de mettre à jour le mot de passe.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {user.prenom} {user.nom}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {user.fonction} · {user.role === 'CHEF' ? "Chef d'équipe" : 'Agent terrain'}
            </p>
          </div>
          <AgentStatusLabel statut={user.statut} />
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2 dark:border-slate-800">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Matricule professionnel</dt>
            <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white">
              {user.matricule}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Identifiant de connexion</dt>
            <dd className="mt-1 text-slate-900 dark:text-white">{user.login_email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Téléphone</dt>
            <dd className="mt-1 font-mono text-slate-900 dark:text-white">{user.telephone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Compte créé le</dt>
            <dd className="mt-1 font-mono text-slate-900 dark:text-white">
              {formatDateFr(user.date_creation)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-[#0055A4]" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Mot de passe personnel
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Hachage sécurisé scrypt côté serveur · Permet la connexion par matricule sur Android et
            Web.
          </p>

          {feedback && (
            <div
              className={`mt-4 rounded-lg border p-3 text-xs ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Mot de passe actuel (laisser vide si premier mot de passe sur compte Google)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Nouveau mot de passe (min. 8 caractères)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] w-full rounded-lg bg-[#0055A4] px-4 py-2 text-sm font-medium text-white hover:bg-[#004485] disabled:opacity-60"
            >
              {saving ? 'Mise à jour...' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <Laptop className="h-5 w-5 text-[#0055A4]" />
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Appareils et sessions
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Appareils enregistrés dans le journal central SESSIONS_ET_APPAREILS.
          </p>

          {sessions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Aucune session enregistrée.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {sessions.map((s) => (
                <div
                  key={`${s.device_id}-${s.derniere_connexion}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                >
                  <div>
                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {s.plateforme} · {s.device_id.slice(0, 18)}
                    </p>
                    <p className="mt-0.5 font-mono text-slate-500">
                      {formatDateTimeFr(s.derniere_connexion)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      s.statut === 'ACTIF'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {s.statut}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

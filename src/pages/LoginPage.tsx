import React, { useState } from 'react';
import { AlertCircle, Flame, Lock, Moon, Server, Sun, UserCheck } from 'lucide-react';
import { getApiBaseUrl, isNativeCapacitorApp, setApiBaseUrl } from '../services/apiClient';
import { useAuth } from '../stores/AuthContext';

export const LoginPage: React.FC = () => {
  const {
    loginWithCredentials,
    loginWithGoogle,
    authError,
    clearAuthError,
    theme,
    toggleTheme,
    isOnline,
  } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const isNativeApk = isNativeCapacitorApp();
  const [serverUrlInput, setServerUrlInput] = useState(() => getApiBaseUrl());
  const [showServerConfig, setShowServerConfig] = useState(
    () => isNativeApk && !getApiBaseUrl()
  );
  const [serverSavedMsg, setServerSavedMsg] = useState<string | null>(null);

  const displayedError = localError || authError;

  const handleSaveServerUrl = () => {
    setApiBaseUrl(serverUrlInput);
    setServerSavedMsg('Adresse du serveur enregistrée.');
    window.setTimeout(() => setServerSavedMsg(null), 3000);
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!identifier.trim() || !password) {
      setLocalError('Veuillez saisir votre identifiant professionnel et votre mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      await loginWithCredentials(identifier.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Échec de la connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError(null);
    clearAuthError();
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Authentification Google annulée ou refusée.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0055A4] text-white">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              GESTION ÉQUIPE GAZ – SIDI ALI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              isOnline
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {isOnline ? 'Serveur joignable' : 'Hors connexion'}
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-10">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-12 dark:border-slate-800 dark:bg-slate-900">
          {/* Panneau institutionnel Sonelgaz */}
          <div className="flex flex-col justify-between bg-[#0055A4] p-8 text-white lg:col-span-5">
            <div>
              <p className="text-xs font-medium tracking-wide text-blue-100">
                Sonelgaz Distribution · Direction de Mostaganem
              </p>
              <h1 className="mt-3 font-display text-2xl font-bold leading-snug text-balance">
                District Gaz Sidi Ali
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-blue-100">
                Plateforme centralisée de préparation, d&apos;affectation et de contrôle des
                interventions gaz de terrain.
              </p>
            </div>

            <div className="mt-10 space-y-4 border-t border-blue-400/30 pt-6 text-xs text-blue-100">
              <div className="flex items-start gap-2.5">
                <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                <span>
                  Accès strictement réservé aux comptes actifs créés et habilités par le Chef
                  d&apos;équipe.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                <span>
                  Traçabilité complète des connexions et opérations · Fuseau Africa/Algiers.
                </span>
              </div>
            </div>
          </div>

          {/* Formulaire d'authentification */}
          <div className="p-8 sm:p-10 lg:col-span-7">
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
              Connexion à l&apos;espace opérationnel
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Connectez-vous avec votre compte Google professionnel ou vos identifiants
              d&apos;agent.
            </p>

            {displayedError && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{displayedError}</span>
              </div>
            )}

            <div className="mt-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || !isOnline}
                className="flex min-h-[46px] w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>
                  {googleLoading ? 'Vérification Firebase...' : 'Se connecter avec Google'}
                </span>
              </button>
            </div>

            <div className="my-6 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span>ou par matricule / identifiant agent</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <form onSubmit={handleCredentialSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Matricule ou identifiant de connexion
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Ex : SA-1042 ou k.benali@sonelgaz-sidiali.dz"
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0055A4] focus:outline-none focus:ring-2 focus:ring-[#0055A4]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Mot de passe
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1.5 w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0055A4] focus:outline-none focus:ring-2 focus:ring-[#0055A4]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !isOnline}
                className="min-h-[46px] w-full rounded-lg bg-[#0055A4] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#004485] disabled:opacity-60"
              >
                {submitting ? 'Authentification en cours...' : 'Se connecter'}
              </button>
            </form>

            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowServerConfig((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0055A4] dark:text-slate-400 dark:hover:text-blue-400"
              >
                <Server className="h-3.5 w-3.5" />
                <span>
                  {showServerConfig
                    ? 'Masquer la configuration serveur (APK)'
                    : 'Configurer serveur central (APK Android)'}
                </span>
              </button>

              {showServerConfig && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <label
                    htmlFor="apk-server-url"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    URL HTTPS du serveur central (laisser vide sur navigateur Web)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="apk-server-url"
                      type="url"
                      value={serverUrlInput}
                      onChange={(e) => setServerUrlInput(e.target.value)}
                      placeholder="https://votre-serveur-sonelgaz.example.com"
                      className="min-h-[38px] flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0055A4] focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleSaveServerUrl}
                      className="min-h-[38px] rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-[#0055A4] dark:hover:bg-[#004485]"
                    >
                      Enregistrer
                    </button>
                  </div>
                  {serverSavedMsg && (
                    <p className="mt-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {serverSavedMsg}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
